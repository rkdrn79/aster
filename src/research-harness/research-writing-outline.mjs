import { HEDGES, PRIOR_WORK_CUE } from './research-writing-lexicon.mjs'
import { readWritingDocument } from './research-writing-document.mjs'

/**
 * `writing outline`: one line per paragraph with a guessed role and its topic sentence, so the
 * Writing agent (and the app) can see the argument's shape: does the introduction move from gap
 * to insight to approach, is the method ordered by idea, does each result have its table.
 * Roles are cue-word guesses for the agent to confirm, not verdicts.
 */

const CUES = {
  intro: [
    ['contributions', /\b(?:our )?contributions?\b|\bwe make the following\b|\bin summary, we\b/],
    [
      'roadmap',
      /\b(?:the )?rest of (?:this|the) paper\b|\bsection \[ref|\bis organi[sz]ed as follows\b/
    ],
    [
      'evidence',
      /\[ref:(?:tab|fig|table)|\boutperform|\bachiev\w+ \S*\d|\d+(?:\.\d+)?\s*(?:%|×|x\b)/
    ],
    [
      'insight',
      /\bwe (?:observe|find|hypothesi[sz]e|note that|argue)\b|\bkey (?:insight|observation)\b|\bsurprisingly\b|\binterestingly\b/
    ],
    [
      'approach',
      /\bwe (?:propose|introduce|present|design|develop|call)\b|\bour (?:method|approach|framework|key idea)\b/
    ],
    [
      'prior-limits',
      /\bhowever\b|\bunfortunately\b|\bbut\b|\bfail|\bsuffer|\blimit|\bcannot\b|\bstruggle/
    ],
    [
      'gap',
      /\bremains? (?:an? )?(?:open|unclear|challenging|unsolved)\b|\bchallenge\b|\bproblem\b|\bbottleneck\b/
    ]
  ],
  method: [
    [
      'setup',
      /\blet\b|\bdenote|\bgiven\b|\bproblem (?:setup|formulation|statement)\b|\bwe consider\b|\bpreliminar/
    ],
    [
      'design-choice',
      /\binstead of\b|\brather than\b|\balternative\b|\bwe choose\b|\bwe opt\b|\bbecause\b|\bwhy\b|\bnaive\b/
    ],
    [
      'implementation',
      /\bin practice\b|\bimplement|\bwe use\b|\bset to\b|\bdefault\b|\bhyperparameter/
    ],
    [
      'intuition',
      /\bintuitively\b|\bthe idea\b|\bkey (?:idea|insight)\b|\bto see why\b|\bthe goal\b/
    ]
  ],
  experiments: [
    [
      'setup',
      /\bdatasets?\b|\bbaselines?\b|\bmetrics?\b|\bwe (?:train|evaluate|compare) on\b|\bimplementation details\b|\bsetup\b/
    ],
    ['ablation', /\bablat|\bwithout\b|\bremov(?:e|ing)\b|\bvary(?:ing)?\b|\beffect of\b/],
    ['result', /\[ref:(?:tab|fig|table)|\btable\b|\bfigure\b|\boutperform|\bimprov/],
    [
      'analysis',
      /\bwe (?:hypothesi[sz]e|conjecture|attribute)\b|\bthis suggests\b|\bwhy\b|\bbecause\b/
    ]
  ],
  related: [['family', /./]],
  abstract: [['summary', /./]]
}

function guessRole(section, paragraph, index) {
  const low = paragraph.text.toLowerCase()
  const display = paragraph.displays.length > 0
  if (section.role === 'intro' && index === 0) {
    return 'context'
  }
  if (section.role === 'intro' && paragraph.item) {
    return 'contributions'
  }
  if (section.role === 'method' && display) {
    return 'formalism'
  }
  for (const [role, pattern] of CUES[section.role] ?? []) {
    if (pattern.test(low)) {
      return role
    }
  }
  if (section.role === 'intro' && PRIOR_WORK_CUE.test(low)) {
    return 'prior-limits'
  }
  return section.role === 'intro' ? 'context' : section.role === 'method' ? 'mechanism' : 'other'
}

/** Published sizes (p10–p90 of the 18 papers) the agent sets a length budget from. */
export const PUBLISHED_SIZES = {
  abstract: 'abstract: 110–240 words, one paragraph',
  intro: 'introduction: 370–830 words, 4–8 paragraphs of 50–170 words',
  method: 'method: 770–2,500 words, paragraphs of 70–110 words',
  experiments: 'experiments: results paragraphs of 60–100 words',
  related: 'related work: 210–770 words, 4–5 paragraphs'
}

const clip = (text, size = 220) => (text.length > size ? `${text.slice(0, size - 1)}…` : text)

export async function outlineWriting(projectPath, { file = null, section = null } = {}) {
  const document = await readWritingDocument(projectPath, { file, section })
  return {
    manuscript: document.manuscript,
    files: document.files,
    fragment: document.fragment,
    sections: [...document.checked].map((entry) => ({
      role: entry.role,
      title: entry.title,
      file: entry.file,
      line: entry.line,
      endLine: entry.endLine,
      words: entry.prose.reduce((sum, paragraph) => sum + paragraph.words, 0),
      published: PUBLISHED_SIZES[entry.role] ?? null,
      paragraphs: entry.prose.map((paragraph, index) => ({
        index,
        file: paragraph.file,
        line: paragraph.line,
        endLine: paragraph.endLine,
        words: paragraph.words,
        sentences: paragraph.sentences.length,
        role: guessRole(entry, paragraph, index),
        heading: paragraph.heading ?? null,
        topic: clip(paragraph.sentences[0]?.text ?? ''),
        last: paragraph.sentences.length > 1 ? clip(paragraph.sentences.at(-1).text, 160) : null,
        cites: paragraph.cites.length,
        refs: paragraph.refs.map((ref) => ref.labels[0]).filter(Boolean),
        numbers: (paragraph.text.replace(/\[[^\]]*\]/g, ' ').match(/\d+(?:\.\d+)?%?/g) ?? [])
          .length,
        hedges: paragraph.sentences.reduce(
          (sum, sentence) => sum + (sentence.low.match(HEDGES)?.length ?? 0),
          0
        )
      }))
    }))
  }
}
