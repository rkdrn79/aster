import { addAnalysis, listAnalyses } from './research-analysis.mjs'

export const commands = {
  'analysis add': {
    spec: {
      values: ['--experiment', '--title', '--file', '--summary', '--kind', '--supersedes', '--by'],
      repeatable: ['--run'],
      required: ['--experiment', '--title', '--file', '--summary']
    },
    run: async ({ project, options, io }) => {
      const result = await addAnalysis(project, {
        experiment: options['--experiment'],
        title: options['--title'],
        file: options['--file'],
        summary: options['--summary'],
        kind: options['--kind'],
        runs: options['--run'],
        supersedes: options['--supersedes'],
        by: options['--by']
      })
      if (!result.analysis.file.startsWith(`${result.folder}/`)) {
        io.notice(`keep analysis scripts and outputs under ${result.folder}/ next time`)
      }
      return result
    }
  },
  'analysis list': {
    spec: { values: ['--experiment'], required: ['--experiment'] },
    run: ({ project, options }) => listAnalyses(project, options['--experiment'])
  }
}

function analysisLine(item) {
  const parts = [item.id, item.kind, item.at, item.by]
  if (item.agent?.provider) {
    parts.push(item.agent.provider)
  }
  if (item.supersededBy) {
    parts.push(`superseded by ${item.supersededBy}`)
  }
  return `${parts.join(' · ')}  "${item.title}"`
}

function analysisDetail(item) {
  const lines = [analysisLine(item), `  file: ${item.file}`, `  ${item.summary}`]
  if (item.runs.length) {
    lines.push(`  runs: ${item.runs.join(', ')}`)
  }
  if (item.supersedes) {
    lines.push(`  replaces: ${item.supersedes}`)
  }
  return lines.join('\n')
}

/** `context` lines for an Experiment's latest analyses that are not superseded. */
export function analysisContextLines(experiment, indent) {
  if (!experiment.analyses?.length) {
    return []
  }
  const more = experiment.analysesOmitted ? ` (+${experiment.analysesOmitted} older)` : ''
  return [
    `${indent}analyses${more}:`,
    ...experiment.analyses.flatMap((item) => [
      `${indent}  ${item.id} ${item.kind} "${item.title}" ${item.file}`,
      `${indent}    ${item.summary}`
    ])
  ]
}

export const textOutput = {
  'analysis add': (result) =>
    `Recorded ${result.analysis.id} (${result.analysis.kind}) in ${result.ledger}${result.analysis.supersedes ? `, replacing ${result.analysis.supersedes}` : ''}`,
  'analysis list': (result) =>
    result.items.length
      ? result.items.map(analysisDetail).join('\n')
      : `No analyses in ${result.ledger}.`
}

export const usage = `
Analysis (<record-root>/experiments/<slug>/analysis.jsonl)
  analysis add --experiment SLUG --title TEXT --file PATH --summary TEXT [--run EXPERIMENT/RUN]...
               [--kind figure|table|note] [--supersedes ID] [--by agent|user]
                                         Record a figure, table, or note file and its takeaway
                                         (summary, at most 2000 characters). PATH is project-relative,
                                         ideally under <record-root>/experiments/<slug>/analysis/.
                                         The record root is .aster/ or legacy research/. The kind
                                         follows the extension: png jpg jpeg gif webp → figure,
                                         csv tsv json → table, md txt → note; others are refused.
                                         --supersedes replaces an earlier analysis, which stays
                                         readable. --by defaults to agent in an agent session, where
                                         user is refused
  analysis list --experiment SLUG        Every analysis, newest first, with supersededBy
  context shows each Experiment's latest 5 current analyses with shortened summaries.
`
