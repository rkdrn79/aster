import {
  AGGREGATE,
  AGGREGATE_SCOPE,
  BEST_KNOWLEDGE,
  BOOSTERS,
  CAMEL_NAMES,
  CLAIM_VERB,
  CODE_API,
  CODE_CAMEL,
  CODE_DETAIL,
  CODE_OPTIONS,
  CODE_SNAKE,
  CONNECTIVE_OPENER,
  CONTINUATION_OPENER,
  HEDGES,
  MARKDOWN,
  NAMED_SCOPE,
  PRIOR_WORK_CUE,
  RESTATE_END,
  SELF_PRAISE,
  SIGNPOST,
  SIMPLICITY_MEASURE,
  STATS,
  SUPERLATIVE,
  SUPERLATIVE_SCOPE,
  SWEEP,
  SWEEP_COUNT,
  TEMPLATES,
  TIER_A,
  UNIVERSAL,
  UNIVERSAL_BACKING,
  WEAK_TEMPLATES
} from './research-writing-lexicon.mjs'

/**
 * Sentence and paragraph rules of `writing check`. Each rule reports through `ctx.add(code,
 * severity, where, message, fix, span)`; severities are 'error', 'warning' and 'note'. Rule IDs
 * follow the writing research's lint spec (WL lexical, WS shape, WH hedging, WC claims and
 * citations, WK code leaks, WP paragraph logic).
 */

const PROSE_ROLES = new Set(['intro', 'method', 'experiments', 'abstract', 'background', 'body'])
const STOP = new Set(
  'the a an of to in and or for on with by is are was were be this that these those it its we our as at from which than into their can not'.split(
    ' '
  )
)

function contentWords(text) {
  return new Set(
    (text.toLowerCase().match(/[a-z][a-z-]{2,}/g) ?? []).filter((word) => !STOP.has(word))
  )
}

function jaccard(a, b) {
  const left = contentWords(a)
  const right = contentWords(b)
  const shared = [...left].filter((word) => right.has(word)).length
  return left.size + right.size === 0 ? 0 : shared / (left.size + right.size - shared)
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / (values.length || 1)
}

function coefficientOfVariation(values) {
  const average = mean(values)
  if (!average) {
    return 0
  }
  const variance = mean(values.map((value) => (value - average) ** 2))
  return Math.sqrt(variance) / average
}

/** A number, a reference or a citation; digits inside names such as W8A8 do not count. */
const hasEvidence = (text) => /\b\d|\[REF:|\[CIT\]/.test(text)

function codeIdentifiers(text) {
  const plain = text.replace(/\[[^\]]*\]/g, ' ').replace(/\bURL\b/g, ' ')
  const found = [...plain.matchAll(CODE_SNAKE)].map((match) => match[0])
  for (const match of plain.matchAll(CODE_CAMEL)) {
    if (!CAMEL_NAMES.test(match[0])) {
      found.push(match[0])
    }
  }
  for (const match of plain.matchAll(CODE_API)) {
    found.push(match[0])
  }
  return [...new Set(found)]
}

function lexicalRules(ctx, sentence) {
  const { low } = sentence
  for (const [pattern, replacement] of TIER_A) {
    for (const match of low.matchAll(pattern)) {
      ctx.add(
        'WL-TIERA',
        'warning',
        sentence,
        `"${match[0]}" reads as generated prose.`,
        `Write ${replacement}.`,
        match[0]
      )
    }
  }
  for (const match of low.matchAll(BOOSTERS)) {
    if (!hasEvidence(sentence.text)) {
      ctx.add(
        'WL-BOOSTER',
        'note',
        sentence,
        `"${match[0]}" boosts a claim with no number, reference or citation beside it.`,
        'Replace the adverb with the number, or delete it.',
        match[0]
      )
    }
  }
  const praise = SELF_PRAISE.exec(low)
  if (praise && !(praise[0].includes('simple') && SIMPLICITY_MEASURE.test(ctx.paragraphLow))) {
    ctx.add(
      'WL-SELFPRAISE',
      'warning',
      sentence,
      `"${praise[0]}" praises the method instead of showing the property.`,
      'Replace the adjective with its evidence ("adds 20 lines", "no extra parameters").',
      praise[0]
    )
  }
  for (const match of low.matchAll(TEMPLATES)) {
    if (!(ctx.role === 'conclusion' && /^in (?:summary|conclusion)/.test(match[0]))) {
      ctx.add(
        'WL-TEMPLATE',
        'warning',
        sentence,
        `"${match[0].slice(0, 60)}" is a template phrase.`,
        'State the specific claim directly.',
        match[0]
      )
    }
  }
  for (const match of low.matchAll(WEAK_TEMPLATES)) {
    ctx.add(
      'WL-TEMPLATE',
      'note',
      sentence,
      `"${match[0].slice(0, 60)}" is a stock phrase.`,
      'Say it plainly, or give the list or the number.',
      match[0]
    )
  }
  if (BEST_KNOWLEDGE.test(low)) {
    ctx.add(
      'WL-TEMPLATE',
      'note',
      sentence,
      '"To the best of our knowledge" hedges a novelty claim.',
      'Scope the claim ("among methods that ...") or cite the closest work.',
      'to the best of our knowledge'
    )
  }
  for (const match of low.matchAll(SIGNPOST)) {
    const severity = ctx.role === 'intro' || ctx.role === 'abstract' ? 'warning' : 'note'
    ctx.add(
      'WL-SIGNPOST',
      severity,
      sentence,
      `"${match[0]}" announces instead of saying.`,
      'Cut the announcement and start with the content.',
      match[0]
    )
  }
  const hedges = low.match(HEDGES) ?? []
  if (hedges.length >= 2) {
    ctx.add(
      'WH-STACK',
      'note',
      sentence,
      `Stacked hedges (${hedges.join(', ')}).`,
      'Keep one hedge, on the part that is uncertain.',
      hedges[1]
    )
  }
  if (/\bsignificant(?:ly)?\b/.test(low) && /\d/.test(sentence.text) && !STATS.test(low)) {
    ctx.add(
      'WL-SIGNIFICANT',
      'note',
      sentence,
      '"Significant" next to a number but no test, seeds or interval.',
      'Report the variance over seeds or the test, or write "large".',
      'significant'
    )
  }
}

const SOFT_ROLES = new Set(['experiments', 'related', 'conclusion', 'background', 'appendix'])

function claimRules(ctx, sentence, previous) {
  const { low, text } = sentence
  const superlative = SUPERLATIVE.exec(low)
  if (superlative) {
    // Why: in experiments the table under discussion is usually named once per paragraph.
    const nearbyRef =
      ctx.role === 'experiments'
        ? /\[REF:/.test(ctx.paragraphText)
        : /\[REF:/.test(previous?.text ?? '')
    const supported =
      hasEvidence(text) || nearbyRef || SUPERLATIVE_SCOPE.test(low) || NAMED_SCOPE.test(text)
    if (!supported) {
      ctx.add(
        'WC-SUPERLATIVE',
        'warning',
        sentence,
        `"${superlative[0]}" without a scope, a number or a table/figure reference.`,
        'Add the scope (dataset, setting, "among methods that ...") or point to the table that shows it.',
        superlative[0]
      )
    }
  }
  const universal = UNIVERSAL.exec(low)
  if (universal && !UNIVERSAL_BACKING.test(text)) {
    ctx.add(
      'WH-UNIVERSAL',
      SOFT_ROLES.has(ctx.role) ? 'note' : 'warning',
      sentence,
      `"${universal[0]}" claims more than an experiment can show.`,
      'Bound it to what was tested ("in all 12 tasks we ran"), or point to the proof.',
      universal[0]
    )
  }
  const sweep = SWEEP.exec(low)
  if (sweep && !SWEEP_COUNT.test(low) && CLAIM_VERB.test(low)) {
    // Why: in results a sweep next to its table can be checked; elsewhere it is a bare claim.
    const tabled = ctx.role === 'experiments' && /\[REF:/.test(ctx.paragraphText)
    const strong =
      ['intro', 'abstract', 'experiments', 'conclusion', 'body'].includes(ctx.role) && !tabled
    ctx.add(
      'WC-SWEEP',
      strong ? 'warning' : 'note',
      sentence,
      `"${sweep[0]}" sweeps the claim over the whole evaluation without saying how many.`,
      'Say how many and which ("on 3 of the 4 tasks", "all six LLaMA sizes"), and keep the claim to what the table shows.',
      sweep[0]
    )
  }
  const aggregate = AGGREGATE.exec(low)
  if (aggregate && !AGGREGATE_SCOPE.test(text)) {
    ctx.add(
      'WC-AGGREGATE',
      ctx.role === 'intro' || ctx.role === 'abstract' ? 'warning' : 'note',
      sentence,
      `"${aggregate[0]}" without the tasks, baseline or table it holds over.`,
      'Name the scope ("over 15 tasks", "than SparseGPT") or point to the table.',
      aggregate[0]
    )
  }
}

function codeRules(ctx, sentence) {
  const severity = ctx.role === 'appendix' ? 'note' : 'warning'
  if (!PROSE_ROLES.has(ctx.role) && ctx.role !== 'appendix') {
    return
  }
  for (const identifier of codeIdentifiers(sentence.text)) {
    ctx.add(
      'WK-CODE',
      severity,
      sentence,
      `Code identifier "${identifier}" in prose.`,
      'Name the operation in words or math; keep identifiers, flags and defaults for the appendix or the code release.',
      identifier
    )
  }
  const detail = ctx.role === 'method' ? CODE_DETAIL.exec(sentence.low) : null
  if (detail) {
    ctx.add(
      'WK-DETAIL',
      'warning',
      sentence,
      `"${detail[0]}": engineering detail in the method.`,
      'Keep only what a claim depends on; move the rest to the appendix or the code release.',
      detail[0]
    )
  }
  if ((ctx.role === 'method' || ctx.role === 'body') && CODE_OPTIONS.test(sentence.low)) {
    const match = CODE_OPTIONS.exec(sentence.low)
    ctx.add(
      'WK-OPTIONS',
      'warning',
      sentence,
      `"${match[0]}" presents a code option as part of the method.`,
      'Commit to one path: a studied variant becomes an ablation, anything else leaves the method.',
      match[0]
    )
  }
}

function paragraphShapeRules(ctx, paragraph) {
  const { sentences } = paragraph
  const lengths = sentences.map((sentence) => sentence.words)
  const limit = ctx.role === 'method' ? 280 : 220
  if (paragraph.words > limit) {
    ctx.add(
      'WS-PARA-LONG',
      'warning',
      paragraph,
      `Paragraph of ${paragraph.words} words.`,
      'Split it where its second job starts.'
    )
  }
  if (sentences.length >= 5 && coefficientOfVariation(lengths) < 0.2) {
    // Why: flat rhythm separates naive introductions (50%) from published ones (6%), not methods.
    const severity = ['intro', 'abstract', 'body'].includes(ctx.role) ? 'warning' : 'note'
    ctx.add(
      'WS-MONOTONE',
      severity,
      paragraph,
      `${sentences.length} sentences of nearly equal length (${Math.round(mean(lengths))} words each).`,
      'Merge two supporting sentences or cut one; keep one short sentence for the key claim.'
    )
  }
  // Why a note: published papers have sentences over 60 words in half their methods.
  for (const sentence of sentences.filter((entry) => entry.words > 60)) {
    ctx.add(
      'WS-SENT-LONG',
      'note',
      sentence,
      `Sentence of ${sentence.words} words.`,
      'Split it at the main verb of the second clause.'
    )
  }
  const connectives = sentences.filter((sentence) => CONNECTIVE_OPENER.test(sentence.low))
  if (connectives.length >= 2) {
    ctx.add(
      'WL-CONNECTIVE',
      'warning',
      connectives[1],
      `${connectives.length} sentences open with a connective ("${connectives.map((sentence) => sentence.low.split(/[ ,]/)[0]).join('", "')}").`,
      'Delete the connectives; where the relation matters, use the specific one (because, so, but).'
    )
  }
  if (sentences.length >= 3) {
    const last = sentences.at(-1)
    const restates =
      RESTATE_END.test(last.low) &&
      (jaccard(last.text, sentences[0].text) >= 0.3 || !hasEvidence(last.text))
    if (restates) {
      ctx.add(
        'WP-RESTATE',
        'warning',
        last,
        'The paragraph ends by restating itself.',
        'Delete the last sentence, or replace it with the bridge to the next paragraph.'
      )
    }
  }
  if (ctx.paragraphIndex > 0 && ['intro', 'method', 'experiments'].includes(ctx.role)) {
    const opener = CONTINUATION_OPENER.exec(sentences[0].low)
    if (opener) {
      ctx.add(
        'WP-TOPIC',
        'note',
        sentences[0],
        `The paragraph opens with "${opener[0]}", so its first sentence is not its claim.`,
        'Start with the sentence that states what the paragraph shows.',
        opener[0]
      )
    }
  }
}

/** WS-MARKDOWN: markdown syntax in LaTeX prints as literal asterisks, backticks and dashes. */
function markdownRule(ctx, paragraph) {
  for (const line of paragraph.raw) {
    const hit = MARKDOWN.find(([pattern]) => pattern.test(line.text))
    if (hit) {
      ctx.add(
        'WS-MARKDOWN',
        'error',
        line,
        `${hit[1]} in LaTeX prose.`,
        'Write LaTeX: \\emph{} for emphasis, a sentence instead of a bullet, \\section or \\paragraph for a heading.',
        hit[0].exec(line.text)?.[0].trim() ?? null
      )
      return
    }
  }
}

/** Intro, related-work and method paragraphs that talk about prior work need a citation in them. */
function citationParagraphRule(ctx, paragraph) {
  if (!['intro', 'related', 'background', 'method'].includes(ctx.role) || paragraph.cites.length) {
    return
  }
  const cue = paragraph.sentences.find((sentence) => PRIOR_WORK_CUE.test(sentence.low))
  if (cue) {
    const match = PRIOR_WORK_CUE.exec(cue.low)
    ctx.add(
      'WC-CITE-PARAGRAPH',
      'warning',
      cue,
      `This paragraph discusses "${match[0]}" without citing any of it.`,
      'Cite the works you mean with keys from `writing bib`, or \\cite{TODO:what-it-must-show} when you do not know them.',
      match[0]
    )
  }
}

/** Sentence rules only: for short lead-ins and list items under 12 words. */
export function checkSentences(ctx, paragraph) {
  ctx.paragraphText = paragraph.text
  ctx.paragraphLow = paragraph.text.toLowerCase()
  markdownRule(ctx, paragraph)
  paragraph.sentences.forEach((sentence, index) => {
    lexicalRules(ctx, sentence)
    claimRules(ctx, sentence, paragraph.sentences[index - 1])
    codeRules(ctx, sentence)
  })
}

/** Runs every sentence and paragraph rule on one paragraph of a section. */
export function checkParagraph(ctx, paragraph) {
  checkSentences(ctx, paragraph)
  paragraphShapeRules(ctx, paragraph)
  citationParagraphRule(ctx, paragraph)
}

/**
 * WP-CONTRIB-RECAP: a contributions list whose items repeat earlier paragraphs. Claude ended 5 of
 * 6 naive introductions this way; none of the published ones do.
 */
export function checkContributionRecap(ctx, section) {
  if (section.role !== 'intro') {
    return
  }
  const body = section.prose.filter((paragraph) => !paragraph.item)
  for (const item of section.prose.filter((paragraph) => paragraph.item)) {
    const words = contentWords(item.text.replace(/\[[^\]]*\]/g, ' '))
    if (words.size < 6) {
      continue
    }
    const best = Math.max(
      0,
      ...body.map((paragraph) => {
        const other = contentWords(paragraph.text)
        return [...words].filter((word) => other.has(word)).length / words.size
      })
    )
    if (best >= 0.6) {
      ctx.add(
        'WP-CONTRIB-RECAP',
        'warning',
        item.sentences[0],
        `This contribution repeats ${Math.round(best * 100)}% of the words of an earlier paragraph.`,
        'Make each contribution a verifiable artefact or finding with a pointer (Section, Table), or drop the list.'
      )
    }
  }
}
