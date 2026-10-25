import { readRunMediaIndex } from './research-run-media.mjs'
import { annotateRun, organizeRuns } from './research-run-summary.mjs'

export const commands = {
  organize: {
    spec: { values: ['--run', '--experiment'] },
    run: ({ project, options }) =>
      organizeRuns(project, {
        run: options['--run'] ?? null,
        experiment: options['--experiment'] ?? null
      }),
    failed: (result) => result.errors.length > 0
  },
  media: {
    spec: { values: ['--run'], required: ['--run'] },
    run: ({ project, options }) => readRunMediaIndex(project, options['--run'])
  },
  'run annotate': {
    spec: { values: ['--run', '--text', '--by'], required: ['--run', '--text'] },
    run: ({ project, options }) =>
      annotateRun(project, { run: options['--run'], text: options['--text'], by: options['--by'] })
  }
}

function numberText(value) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(6)))
}

function pointText(point) {
  return point ? `${numberText(point.value)}${point.step === null ? '' : ` @${point.step}`}` : '—'
}

function signedText(value) {
  return value === null ? '—' : `${value > 0 ? '+' : ''}${numberText(value)}`
}

function summaryText(summary) {
  const parts = [`${summary.run} · ${summary.state}`]
  const { primary, baseline, findings, media, outputs } = summary
  if (primary) {
    const metric = `${primary.split ? `${primary.split} ` : ''}${primary.metric}`
    parts.push(`${metric} last ${pointText(primary.last)}, best ${pointText(primary.best)}`)
  }
  if (baseline) {
    parts.push(
      `Δ last ${signedText(baseline.delta.last)}, best ${signedText(baseline.delta.best)} vs ${baseline.run}`
    )
  }
  parts.push(`findings fail ${findings.fail} warn ${findings.warn} info ${findings.info}`)
  parts.push(`media ${media.image} image, ${media.video} video, ${media.audio} audio`)
  if (outputs) {
    parts.push(`${outputs.samples} samples`)
  }
  if (summary.notes.length) {
    parts.push(`${summary.notes.length} note${summary.notes.length === 1 ? '' : 's'}`)
  }
  return parts.join(' · ')
}

function mediaItemText(item) {
  return [
    item.kind,
    item.path,
    ...(item.step === null ? [] : [`step ${item.step}`]),
    ...(item.label ? [`label ${item.label}`] : []),
    ...(item.sampleId ? [`sample ${item.sampleId}`] : []),
    item.source
  ].join(' · ')
}

export const textOutput = {
  organize: (result) =>
    [
      `Organized ${result.organized} Run${result.organized === 1 ? '' : 's'} (summary.json)`,
      ...result.runs.map(summaryText),
      ...result.errors.map((error) => `could not organize ${error.run}: ${error.message}`)
    ].join('\n'),
  media: (result) =>
    [
      `${result.items.length} media file${result.items.length === 1 ? '' : 's'} for ${result.run}${result.truncated ? ' (truncated)' : ''}`,
      ...result.items.map(mediaItemText)
    ].join('\n'),
  'run annotate': (result) => `Noted on ${result.ref} (${result.summary}) by ${result.note.by}`
}

export const usage = `
Run summaries and media (runs/<id>/summary.json, media.jsonl)
  organize --run EXPERIMENT/RUN | --experiment SLUG
                                         Recompute summary.json: state, the brief's primary metric
                                         (last, best), the baseline Run's and the difference, rule
                                         finding counts, media counts, outputs samples; notes are kept.
                                         run exec and run finish write it when a Run ends
  media --run EXPERIMENT/RUN             Images, videos, and audio of a Run: media.jsonl rows,
                                         outputs.jsonl media and imagePath, files under artifacts/
  run annotate --run EXPERIMENT/RUN --text TEXT [--by agent|user]
                                         Add a note to summary.json (at most 2000 characters); --by
                                         defaults to agent in an agent session, where user is refused
`
