import { sha256 } from '@/lib/sha256'
import { withAsterContext } from '../../../../shared/aster-context-block'

export type SampleJudgeRun = {
  ref: string
  experiment: string
  name: string
  outputsPath: string | null
}

/** Pairwise judges A against B on shared samples; single grades each Run's outputs. */
export type SampleJudgeTarget =
  | { mode: 'pairwise'; a: SampleJudgeRun; b: SampleJudgeRun }
  | { mode: 'single'; runs: SampleJudgeRun[] }

export type SampleJudgeRequest = {
  cli: string
  /** The value the agent passes as --judge-provider, e.g. claude-code. */
  provider: string
  /** A project-relative rubric file that exists, or null with the reason in `rubricIssue`. */
  rubric: string | null
  rubricIssue: string | null
  target: SampleJudgeTarget
}

const sharedRules = [
  'Read the rubric first when one is given. Without one, judge correctness, faithfulness to the prompt, completeness, and clarity, and say so in each note.',
  "Each outputs file is JSONL: one object per line with sampleId and optional prompt, output, imagePath (an image), and media ([{kind: image|video|audio, path, label}]). Media paths resolve from the outputs file's folder, then the project root; open every file you judge.",
  'Judge only samples whose outputs you actually read. Never infer a verdict from metrics, Run names, file names, or other ratings.',
  'Record each judgment right after reading its sample, with a one-sentence reason in --note. Add failure tags (lowercase slugs such as hallucination, format, refusal, incomplete) only when they apply.',
  'Pass your exact model ID as --judge-model. Your ratings are stored as agent judgments beside mine and never replace my ratings.',
  'Do not create, edit, or delete files. Only read files and run the harness rate commands below.',
  'When you finish, report how many samples you judged and skipped and the counts from rate summary. Do not declare a winner; report the counts with n.'
]

const modeRules = {
  pairwise: [
    'Compare A and B only on sample IDs present in both outputs files.',
    "For each sample decide whether A's output is better (a), B's is better (b), or neither is clearly better (tie)."
  ],
  single: [
    'For each sample of each Run decide whether the output is good, bad, or unsure (you cannot tell from what you read).'
  ]
}

/** The judging rules only; Run paths stay out so a moved project keeps the same judge setup. */
export function sampleJudgeRules(mode: SampleJudgeTarget['mode']): string {
  return [...modeRules[mode], ...sharedRules].map((rule) => `- ${rule}`).join('\n')
}

export function sampleJudgeRulesSha256(mode: SampleJudgeTarget['mode']): string {
  return Array.from(sha256(new TextEncoder().encode(sampleJudgeRules(mode))), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('')
}

function runLine(label: string | null, run: SampleJudgeRun): string {
  const outputs = run.outputsPath
    ? `outputs ${JSON.stringify(run.outputsPath)}`
    : 'no outputs file is linked; say so and skip this Run'
  return `- ${label ? `${label}: ` : ''}${run.ref} ${JSON.stringify(run.name)} — ${outputs}`
}

export function sampleJudgePrompt(request: SampleJudgeRequest): string {
  const cli = `node "${request.cli}"`
  const target = request.target
  const promptSha = sampleJudgeRulesSha256(target.mode)
  const judge = [
    '--by agent --judge-model <YOUR-MODEL-ID>',
    `--judge-provider ${request.provider}`,
    `--judge-prompt-sha ${promptSha}`,
    ...(request.rubric ? [`--rubric ${JSON.stringify(request.rubric)}`] : [])
  ].join(' ')
  const record =
    target.mode === 'pairwise'
      ? [
          `${cli} rate add --experiment ${target.b.experiment} --sample <SAMPLE-ID> --run ${target.a.ref} --against ${target.b.ref} --verdict a|b|tie ${judge} [--tag SLUG]... --note "<reason>"`,
          `Before you start, list what you already judged with \`${cli} rate list --experiment ${target.b.experiment} --run ${target.a.ref} --against ${target.b.ref} --by agent --json\` and skip those samples unless the rubric changed.`,
          `Finish with \`${cli} rate summary --experiment ${target.b.experiment} --run ${target.b.ref} --against ${target.a.ref}\`.`
        ]
      : [
          `${cli} rate add --experiment <EXPERIMENT> --sample <SAMPLE-ID> --run <RUN> --verdict good|bad|unsure ${judge} [--tag SLUG]... --note "<reason>"`,
          'where <EXPERIMENT> is the part of the Run reference before the slash.',
          `Before you start, list what you already judged with \`${cli} rate list --experiment <EXPERIMENT> --run <RUN> --by agent --json\` and skip those samples unless the rubric changed.`,
          `Finish with \`${cli} rate summary --experiment <EXPERIMENT> --run <RUN>\` for each Run.`
        ]
  const runs = target.mode === 'pairwise' ? [target.a, target.b] : target.runs
  const ask =
    target.mode === 'pairwise'
      ? `Judge ${target.a.name} against ${target.b.name} on their shared samples.`
      : `Judge the outputs of ${target.runs.map((run) => run.name).join(', ')}.`
  const body = [
    'Act as an agent judge of model outputs in this project and record your verdicts with the research harness.',
    `Use the research harness CLI as \`${cli}\` (add --json when you parse its output).`,
    '',
    request.rubric
      ? `Rubric: ${JSON.stringify(request.rubric)} — read it before judging.`
      : `Rubric: none. ${request.rubricIssue ?? ''}`.trim(),
    '',
    target.mode === 'pairwise' ? 'Runs to compare:' : 'Runs to grade:',
    ...(target.mode === 'pairwise'
      ? [runLine('A', target.a), runLine('B', target.b)]
      : target.runs.map((run) => runLine(null, run))),
    '',
    'Rules:',
    sampleJudgeRules(target.mode),
    '',
    'Record each judgment with:',
    ...record
  ].join('\n')
  return withAsterContext(ask, {
    label: `${runs[0]?.experiment ?? 'outputs'} · ${runs.length} ${runs.length === 1 ? 'run' : 'runs'}`,
    body
  })
}
