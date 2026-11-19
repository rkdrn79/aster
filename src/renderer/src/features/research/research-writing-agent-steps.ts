import type {
  WritingFixFinding,
  WritingPromptContext,
  WritingQuickRequest
} from './research-writing-agent-prompts'

// The numbered steps of each Writing quick action, from the guide's workflows. Kept apart from the
// builders so each workflow reads as one list.

/** How many findings a fix request lists; the agent re-runs the check for the rest. */
export const MAX_FINDINGS_IN_PROMPT = 40

function target(context: WritingPromptContext): string {
  return JSON.stringify(context.manuscriptPath ?? 'the main .tex file')
}

function findingLine(finding: WritingFixFinding): string {
  const level = finding.severity === 'error' ? 'ERROR' : 'warning'
  const where = `${finding.file}:${finding.line}`
  const span = finding.span ? ` "${finding.span.slice(0, 80)}"` : ''
  const fix = finding.fix ? ` Fix: ${finding.fix}` : ''
  return `- ${level} ${finding.code} ${where}${span}: ${finding.message}${fix}`
}

/** The findings the person asked to fix, errors first, bounded. */
export function checkFindingLines(findings: readonly WritingFixFinding[], total: number): string[] {
  const shown = findings.slice(0, MAX_FINDINGS_IN_PROMPT)
  return [
    'Findings from the Writing page check (lines may have moved since):',
    ...shown.map(findingLine),
    ...(total > shown.length
      ? [`… and ${total - shown.length} more; \`writing check\` lists them all.`]
      : [])
  ]
}

function methodSteps(context: WritingPromptContext, folders: readonly string[]): string[] {
  const code = folders.map((folder) => `--code ${JSON.stringify(folder)}`).join(' ')
  return [
    `1. Run \`node H/cli.mjs writing context ${code}\`: it lists the modules and functions, candidate method subsections, and engineering details to leave out. Read the code it points to.`,
    '2. Write the code manifest in the chat as a table: code symbol, what it does, class (core idea, design choice, invariant, analysis, engineering, config), destination (main text, appendix, omit), paper name. Expect about 30% of the code to stay out of the main text; code identifiers and flags never appear in prose. Commit to the path the method uses; options and dead branches stay out.',
    "3. Ask me in one message what the code cannot show (the guide's questions): why the obvious version fails and what shows it; which alternatives I tried or ruled out; the detail that looks minor but matters; the objective it derives from; which values are design decisions; and which parts are mine and which are borrowed (from which paper or repo).",
    '4. Write the method skeleton with `writing skeleton set --section method --file -`: the five lines, plus ORDER (the subsections, by idea, never by file or call order) and OMIT (what goes to the appendix or nowhere). Then stop until I confirm it.',
    `5. Once confirmed, draft the method section in ${target(context)}: problem setup in the baseline's notation, then per subsection intuition, formalism with a \`where\` clause, design choices each with its reason and why not the obvious alternative, and a short implementation note only where a claim depends on it. Define every symbol at first use; "we" and present tense. Measured results stay in the experiments: where an ablation in the manuscript tests a choice, give the reason and point to it (\`\\cref\`) without its numbers. Questions the manuscript does not answer become \`\\todo{}\` placeholders, not invented text.`
  ]
}

function introSteps(context: WritingPromptContext): string[] {
  return [
    '1. `node H/cli.mjs writing skeleton get --section intro`. Confirmed: draft from it. Draft: ask me to confirm it on the Writing page and stop. Missing: write it from my notes and the paper (`writing outline`, the abstract, method and experiments with their tables, `claim list`), with the intro variant and a one-line-per-paragraph plan, and stop.',
    `2. Draft the introduction in ${target(context)} paragraph by paragraph from the plan: each paragraph's first sentence states its claim; the gap shown with a number, a figure or a citation; prior work credited for what it solves, then criticised by mechanism, with citations; the insight in one sentence before the method's name; the approach as its consequence; 2-3 headline numbers with scope, from claims or the manuscript's tables and pointed to; Figure 1 referenced. No restating last sentences; no "In summary, our contributions" bullets that repeat the paragraphs.`
  ]
}

function resultsSteps(context: WritingPromptContext): string[] {
  return [
    "1. `node H/cli.mjs context` and `node H/cli.mjs claim list` give the Runs, metrics and recorded claims; `run show <ref>` the details. Read the manuscript's tables and the project's data files (`data/`) too: they are sources for numbers no Run backs yet.",
    '2. List in the chat the questions the experiments answer: one per claim of the introduction and per contribution, plus one per design choice the method says is validated. Mark which Runs answer each and which have no evidence yet.',
    '3. Write the experiments skeleton with `writing skeleton set --section experiments --file -` (EVIDENCE names claim ids, tables or data files, or MISSING) and stop until I confirm it.',
    `4. Once confirmed, draft the experiments in ${target(context)}: the setup (datasets, baselines and why each is fair, metrics, one default setting), then one result unit per question: purpose, "Table X shows", the takeaway with its delta and scope, a hedged mechanism. Record every number a Run backs with \`claim add\` right after writing it; a number from a table or data file goes in as printed, with a \`% source:\` comment, and a suggested claim in the hand-off. Never write a number no source holds. Reference and interpret every table and figure, and discuss where the method loses or ties.`
  ]
}

const TIGHTEN_STEPS = [
  '1. Read the file and check that the selected source still occupies that range; if it does not, stop and tell me. Edit only this passage.',
  '2. Follow the guide\'s tightening workflow: one job per paragraph, stated in its first sentence; delete restating last sentences and meta-commentary; replace boosters and adjectives with the number or the evidence; scope superlatives; state measurements flat and hedge causes; code identifiers become symbols or plain words; "we" and present tense.',
  "3. Aim for 10–20% shorter without losing any claim, number, citation or label. Keep the person's voice: change the minimum.",
  '4. Report what you cut, what moved, and what needs my evidence.'
]

const CHECK_FIX_STEPS = [
  '1. Run the check yourself first (the command below) to see the current findings.',
  "2. Fix the errors and the warnings you agree with, with the smallest edits that keep the person's voice. Never add a number or a citation to silence a finding: use a claim, a number the manuscript or a data file states (with a `% source:` comment), a key from `writing bib`, or a visible placeholder. Leave a finding you disagree with and say why.",
  '3. Edit only the manuscript files the findings name; do not run a PDF build.'
]

export function quickSteps(context: WritingPromptContext, request: WritingQuickRequest): string[] {
  switch (request.kind) {
    case 'method-from-code':
      return methodSteps(context, request.folders)
    case 'intro-from-skeleton':
      return introSteps(context)
    case 'results-from-runs':
      return resultsSteps(context)
    case 'tighten':
      return TIGHTEN_STEPS
    case 'check-fix':
      return CHECK_FIX_STEPS
  }
}
