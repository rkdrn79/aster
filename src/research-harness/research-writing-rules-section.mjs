import {
  CODE_NARRATION,
  HEDGES,
  PASSIVE,
  RUN_IN_LABEL,
  SPECIFIC_AFTER,
  VAGUE,
  WE,
  WE_ANY,
  WE_PAST
} from './research-writing-lexicon.mjs'
import { labelKindFromName } from './research-writing-document.mjs'

/**
 * Section-level rules: the measured profile of a section against the band of the 18 published
 * papers (citations, figure and table references, hedges, passive voice, "we"), and the rules
 * that only make sense over a whole section.
 */

const PASSIVE_P90 = {
  intro: 0.28,
  method: 0.31,
  background: 0.31,
  experiments: 0.2,
  abstract: 0.22
}
const HEDGE_BAND = { intro: [1, 6.9], experiments: [0.6, 5.2], method: [0, 5.5] }
const FIGURE_KINDS = new Set(['figure', 'table', 'algorithm', 'wrapfigure', 'wraptable', 'unknown'])

const OUTCOME =
  /\b(?:outperform\w*|underperform\w*|improve[sd]|improvements?|degrad\w*|diverg\w*|drops|dropped|hurts|best|worse|worst|better|beats|surpass\w*|exceeds)\b/i
const RESULT_REPORT =
  /\b(?:in our experiments|experiments show|we (?:find|found|observe|observed) that|results show)\b/i

const per = (count, words, unit) => (words ? Math.round((count / words) * unit * 100) / 100 : 0)

export function sectionProfile(section) {
  const sentences = section.prose.flatMap((paragraph) => paragraph.sentences)
  const words = section.prose.reduce((sum, paragraph) => sum + paragraph.words, 0)
  const cites = section.prose.reduce((sum, paragraph) => sum + paragraph.cites.length, 0)
  const refs = section.prose.reduce((sum, paragraph) => sum + paragraph.refs.length, 0)
  const hedges = sentences.reduce(
    (sum, sentence) => sum + (sentence.low.match(HEDGES)?.length ?? 0),
    0
  )
  const passive = sentences.filter((sentence) => PASSIVE.test(sentence.text)).length
  const we = sentences.reduce((sum, sentence) => sum + (sentence.low.match(WE)?.length ?? 0), 0)
  return {
    words,
    paragraphs: section.prose.length,
    sentences: sentences.length,
    citesPer100Words: per(cites, words, 100),
    refsPer1kWords: per(refs, words, 1000),
    hedgesPer1kWords: per(hedges, words, 1000),
    passiveShare: sentences.length ? Math.round((passive / sentences.length) * 100) / 100 : 0,
    wePer1kWords: per(we, words, 1000)
  }
}

function firstSentence(section) {
  return section.prose[0]?.sentences[0] ?? { file: section.file, line: section.line }
}

function citationRules(ctx, section, profile, document) {
  if (section.role === 'abstract') {
    const cited = section.prose.flatMap((paragraph) => paragraph.cites)[0]
    if (cited) {
      ctx.add(
        'WC-ABSTRACT-CITE',
        'warning',
        cited,
        'The abstract cites a paper.',
        'Name the idea instead; citations belong in the introduction.'
      )
    }
    return
  }
  if (section.role === 'intro' && profile.words >= 150 && profile.citesPer100Words < 0.5) {
    const relatedCarries = document.sections.some(
      (other) => other.role === 'related' && sectionProfile(other).citesPer100Words >= 2
    )
    ctx.add(
      'WC-CITE-DENSITY',
      relatedCarries ? 'note' : 'warning',
      firstSentence(section),
      `${profile.citesPer100Words} citations per 100 words; published introductions have 0.6 to 2.6 (median 1.8).`,
      'Cite the works behind the context, the gap and every criticised approach; use \\cite{TODO:...} where you know a source is needed but not which.'
    )
  }
  if (section.role === 'related' && profile.words >= 150 && profile.citesPer100Words < 1.5) {
    ctx.add(
      'WC-CITE-DENSITY',
      'warning',
      firstSentence(section),
      `${profile.citesPer100Words} citations per 100 words; related work in published papers has about 4.5.`,
      'Group prior work by mechanism and cite each family and each work you name.'
    )
  }
}

function referenceRules(ctx, section, profile) {
  const refs = section.prose.flatMap((paragraph) => paragraph.refs)
  const figureRefs = refs.filter((ref) => FIGURE_KINDS.has(ref.kind))
  const anchor = firstSentence(section)
  if (section.role === 'abstract' && section.allProse.some((paragraph) => paragraph.refs.length)) {
    ctx.add(
      'WF-ABSTRACT-REF',
      'warning',
      section.allProse.find((paragraph) => paragraph.refs.length).refs[0],
      'The abstract points to a figure, table or section.',
      'An abstract stands alone: state the finding, and name where it comes from in a comment (% source: tab:main).'
    )
  }
  if (
    (section.role === 'intro' || section.role === 'experiments') &&
    profile.words >= 250 &&
    !figureRefs.length
  ) {
    const what =
      section.role === 'intro'
        ? 'the teaser figure that shows the gap'
        : 'the table or figure each result comes from'
    ctx.add(
      'WF-NO-REFS',
      'warning',
      anchor,
      `No figure or table is referenced in this ${section.role === 'intro' ? 'introduction' : 'section'}.`,
      `Point to ${what} (\\cref{fig:...}); if it does not exist yet, write \\todo{Figure: what it must show}.`
    )
  }
  if (section.role === 'method' && profile.words >= 300 && !refs.length) {
    ctx.add(
      'WF-NO-REFS',
      'warning',
      anchor,
      'The method never points to a figure, table, equation or algorithm.',
      'Number the key equations and refer back to them; point to the overview figure or algorithm box.'
    )
  }
}

function voiceRules(ctx, section, profile) {
  if (profile.words < 150) {
    return
  }
  const limit = PASSIVE_P90[section.role]
  if (limit !== undefined && profile.passiveShare > limit) {
    ctx.add(
      'WP-PASSIVE',
      section.role === 'method' ? 'warning' : 'note',
      firstSentence(section),
      `${Math.round(profile.passiveShare * 100)}% of sentences are passive; published ${section.role} sections stay under ${Math.round(limit * 100)}%.`,
      'Name the agent: "we compute ...", "the encoder maps ...".'
    )
  }
  if (section.role === 'method' && profile.wePer1kWords < 8) {
    ctx.add(
      'WP-WE',
      'warning',
      firstSentence(section),
      `"We" appears ${profile.wePer1kWords} times per 1,000 words; published methods use it 15 to 32 times.`,
      'Write the method as what we do and why, in the present tense, not as documentation of code.'
    )
  }
  const sentences = section.prose.flatMap((paragraph) => paragraph.sentences)
  const weVerbs = sentences.reduce(
    (sum, sentence) => sum + (sentence.low.match(WE_ANY)?.length ?? 0),
    0
  )
  const wePast = sentences.reduce(
    (sum, sentence) => sum + (sentence.low.match(WE_PAST)?.length ?? 0),
    0
  )
  if (['intro', 'method'].includes(section.role) && weVerbs >= 5 && wePast / weVerbs > 0.3) {
    ctx.add(
      'WP-TENSE',
      'note',
      firstSentence(section),
      `${wePast} of ${weVerbs} "we ..." verbs are in the past tense.`,
      'Use the present tense for the method and its claims; keep the past for completed procedures.'
    )
  }
  const band = HEDGE_BAND[section.role]
  if (band && profile.words >= 200) {
    if (profile.hedgesPer1kWords < band[0]) {
      ctx.add(
        'WH-DENSITY',
        'note',
        firstSentence(section),
        `${profile.hedgesPer1kWords} hedges per 1,000 words: no claim is marked as a hypothesis (published band ${band[0]}–${band[1]}).`,
        'State measurements flatly and hedge causes: "we hypothesize", "this suggests", "we attribute".'
      )
    } else if (profile.hedgesPer1kWords > band[1]) {
      ctx.add(
        'WH-DENSITY',
        'note',
        firstSentence(section),
        `${profile.hedgesPer1kWords} hedges per 1,000 words (published band ${band[0]}–${band[1]}).`,
        'Un-hedge what you measured; keep hedges for causes you did not test.'
      )
    }
  }
}

function shapeRules(ctx, section, profile) {
  const prose = section.prose.filter((paragraph) => !paragraph.item)
  const single = prose.filter((paragraph) => paragraph.sentences.length === 1)
  if (prose.length >= 3 && single.length / prose.length > 1 / 3) {
    ctx.add(
      'WS-PARA-SHORT',
      section.role === 'intro' ? 'warning' : 'note',
      single[0],
      `${single.length} of ${prose.length} paragraphs are a single sentence.`,
      'Merge each one-claim paragraph into the paragraph whose job it serves.'
    )
  }
  const items = section.allProse.filter((paragraph) => paragraph.item)
  if (section.role === 'intro' && section.listItems > 5) {
    ctx.add(
      'WS-LIST',
      'warning',
      items[0] ?? firstSentence(section),
      `${section.listItems} list items in the introduction.`,
      'Keep at most one contributions list of 2–4 verifiable items; turn other lists into paragraphs.'
    )
  }
  const sentenceItems = items.filter((paragraph) => paragraph.words >= 8)
  if (['method', 'experiments'].includes(section.role) && sentenceItems.length > 3) {
    ctx.add(
      'WS-LIST',
      'warning',
      sentenceItems[0],
      `${sentenceItems.length} full-sentence list items in the ${section.role === 'method' ? 'method' : 'results'}.`,
      'Write them as paragraphs that argue: each point with its reason or its evidence.'
    )
  }
  if (section.role === 'abstract' && section.listItems > 0) {
    ctx.add(
      'WS-LIST',
      'warning',
      items[0] ?? firstSentence(section),
      'A list in the abstract.',
      'Write the abstract as one paragraph, one role per sentence.'
    )
  }
  if (section.role === 'method' && profile.words >= 150) {
    const sentences = section.prose.flatMap((paragraph) => paragraph.sentences)
    const narration = sentences.flatMap((sentence) =>
      (sentence.low.match(CODE_NARRATION) ?? []).map((word) => ({ word, sentence }))
    )
    if (per(narration.length, profile.words, 1000) > 3) {
      ctx.add(
        'WK-NARRATION',
        'warning',
        narration[0].sentence,
        `Code-narration words ${per(narration.length, profile.words, 1000)} times per 1,000 words (${[...new Set(narration.map((hit) => hit.word))].slice(0, 5).join(', ')}).`,
        'Describe the operation and its purpose, not the software unit that performs it.',
        narration[0].word
      )
    }
    const tts = section.prose.reduce((sum, paragraph) => sum + paragraph.tts, 0)
    if (per(tts, profile.words, 1000) > 2) {
      const at = section.prose.find((paragraph) => paragraph.tts) ?? section.prose[0]
      ctx.add(
        'WK-TEXTTT',
        'warning',
        at.sentences[0],
        `${tts} \\texttt names in the method.`,
        'Name operations in words or math; code names go to the appendix or the code release.'
      )
    }
  }
}

function vagueRule(ctx, section, profile) {
  const hits = []
  for (const sentence of section.prose.flatMap((paragraph) => paragraph.sentences)) {
    for (const match of sentence.low.matchAll(VAGUE)) {
      if (!SPECIFIC_AFTER.test(sentence.text.slice(match.index + match[0].length))) {
        hits.push({ sentence, word: match[0] })
      }
    }
  }
  if (profile.words >= 150 && per(hits.length, profile.words, 1000) > 3) {
    for (const hit of hits) {
      ctx.add(
        'WL-VAGUE',
        'warning',
        hit.sentence,
        `"${hit.word}" without the count or the list.`,
        'Give the number or name the items.',
        hit.word
      )
    }
  }
}

/** Published sizes (p90 of the 18 papers): longer slots are where naive drafts pad. */
const SECTION_WORDS = { abstract: 250, intro: 1000 }
const PARAGRAPH_MEDIAN = { method: 115, background: 115 }

function isRunInLabel(paragraph) {
  if (paragraph.heading) {
    return true
  }
  const match = RUN_IN_LABEL.exec(paragraph.raw[0]?.text ?? '')
  return (
    Boolean(match) &&
    match[1].trim().split(/\s+/).length <= 8 &&
    (Boolean(match[2]) || /[.:]$/.test(match[1].trim()))
  )
}

/**
 * WS-LENGTH and WS-LABELS: the size of the slot, and run-in labels on most paragraphs. In the
 * writing bench naive results ran 1.8x and abstracts 1.4x the published length, and judges
 * flagged bold labels on most paragraphs; methods and related work use run-in labels by design.
 */
function lengthAndLabelRules(ctx, section, profile) {
  const limit = SECTION_WORDS[section.role]
  if (limit && profile.words > limit) {
    const published =
      section.role === 'abstract' ? 'abstracts stay under 240' : 'introductions stay under 830'
    ctx.add(
      'WS-LENGTH',
      'warning',
      firstSentence(section),
      `${profile.words} words; published ${published}.`,
      'Cut to the budget: delete restating and announcing sentences first, then merge paragraphs that share a job.'
    )
  }
  const medianLimit = PARAGRAPH_MEDIAN[section.role]
  const lengths = section.prose.map((paragraph) => paragraph.words).sort((a, b) => a - b)
  const median = lengths[Math.floor(lengths.length / 2)] ?? 0
  if (medianLimit && lengths.length >= 3 && median > medianLimit) {
    ctx.add(
      'WS-LENGTH',
      'warning',
      firstSentence(section),
      `Paragraphs run long: median ${median} words (published methods: 87, at most about 108).`,
      'Give each paragraph one job; move detail a claim does not need to the appendix.'
    )
  }
  const paragraphs = section.allProse
  const labelled = paragraphs.filter(isRunInLabel)
  if (
    section.role !== 'related' &&
    paragraphs.length >= 4 &&
    labelled.length / paragraphs.length > 0.5
  ) {
    ctx.add(
      'WS-LABELS',
      ['intro', 'abstract', 'conclusion', 'body'].includes(section.role) ? 'warning' : 'note',
      labelled[0].sentences[0] ?? firstSentence(section),
      `${labelled.length} of ${paragraphs.length} paragraphs open with a bold or italic run-in label.`,
      'Let the topic sentence carry the paragraph; keep run-in labels for named design decisions or related-work families.'
    )
  }
}

/**
 * WS-METHOD-RESULT: measured outcomes in the method. In the writing bench, harnessed methods
 * reported ablation results from the experiments ("removing alpha degrades", "beta=0.9 was best")
 * and judges flagged them as out of scope; the method says what and why, and points forward.
 */
function methodResultRule(ctx, section, document) {
  if (section.role !== 'method') {
    return
  }
  const pointsAtEvidence = (sentence) =>
    [...sentence.text.matchAll(/\[REF:([^\]]*)\]/g)].some((match) =>
      ['table', 'figure'].includes(document.labels?.get(match[1]) ?? labelKindFromName(match[1]))
    )
  const results = section.prose
    .flatMap((paragraph) => paragraph.sentences)
    .filter(
      (sentence) =>
        RESULT_REPORT.test(sentence.text) ||
        (pointsAtEvidence(sentence) &&
          (OUTCOME.test(sentence.text) || /\d\.\d|\d%/.test(sentence.text)))
    )
  if (results.length) {
    ctx.add(
      'WS-METHOD-RESULT',
      'warning',
      results[0],
      `${results.length} sentence${results.length === 1 ? '' : 's'} in the method report measured results ("${results[0].text.slice(0, 80)}").`,
      'The method says what the approach does and why; move the outcome to the experiments and point forward ("we ablate this choice in \\cref{sec:ablation}").'
    )
  }
}

/** Every section-level rule for one section; `document` gives the other sections. */
export function checkSection(ctx, section, document) {
  const profile = sectionProfile(section)
  citationRules(ctx, section, profile, document)
  referenceRules(ctx, section, profile)
  voiceRules(ctx, section, profile)
  shapeRules(ctx, section, profile)
  vagueRule(ctx, section, profile)
  lengthAndLabelRules(ctx, section, profile)
  methodResultRule(ctx, section, document)
  return profile
}
