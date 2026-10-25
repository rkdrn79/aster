import { addRating, listRatings, summarizeRatings } from './research-ratings.mjs'

function ratingLine(rating) {
  const pair = rating.against ? `${rating.run} vs ${rating.against}` : rating.run
  const judge = rating.judge
    ? ` (${[rating.judge.provider, rating.judge.model].filter(Boolean).join('/')})`
    : ''
  const parts = [rating.id, rating.sampleId, pair, rating.verdict, `${rating.by}${judge}`]
  if (rating.blind) {
    parts.push('blind')
  }
  if (rating.tags.length) {
    parts.push(`tags ${rating.tags.join(',')}`)
  }
  return `${parts.join(' · ')}${rating.note ? `  "${rating.note}"` : ''}`
}

function pairwiseText(counts) {
  return `${counts.wins} wins · ${counts.ties} ties · ${counts.losses} losses (n=${counts.n})`
}

function singleText(counts) {
  return `good ${counts.good} · bad ${counts.bad} · unsure ${counts.unsure} (n=${counts.n})`
}

function sourceLines(label, counts, sources, text) {
  if (!counts) {
    return []
  }
  return [
    `${label}: ${text(counts)}${counts.n > 0 && counts.n < 10 ? ' · small sample' : ''}`,
    ...['user', 'agent']
      .filter((source) => sources[source]?.n)
      .map((source) => `  ${source}: ${text(sources[source])}`)
  ]
}

function summaryText(result) {
  const lines = [result.against ? `${result.run} vs ${result.against}` : result.run]
  lines.push(
    ...sourceLines(
      `A/B from ${result.run}'s side`,
      result.pairwise,
      { user: result.bySource.user.pairwise, agent: result.bySource.agent.pairwise },
      pairwiseText
    ),
    ...sourceLines(
      'Single',
      result.single,
      { user: result.bySource.user.single, agent: result.bySource.agent.single },
      singleText
    ),
    result.agreement.overlap
      ? `User–agent agreement: ${result.agreement.agreeing}/${result.agreement.overlap} shared samples (${Math.round(result.agreement.rate * 100)}%)`
      : 'User–agent agreement: no sample judged by both yet'
  )
  for (const judge of result.judges) {
    const prompt = judge.promptSha256 ? ` prompt ${judge.promptSha256.slice(0, 10)}` : ''
    const rubric = judge.rubricSha256 ? ` rubric ${judge.rubricSha256.slice(0, 10)}` : ''
    lines.push(
      `Judge ${[judge.provider, judge.model].filter(Boolean).join('/')}${prompt}${rubric} (n=${judge.n})`
    )
  }
  if (result.judgeMixed) {
    lines.push(
      'Judge mixed: agent ratings come from different judge setups; compare them separately.'
    )
  }
  const tags = Object.entries(result.tags).slice(0, 8)
  if (tags.length) {
    lines.push(`Tags: ${tags.map(([tag, count]) => `${tag} ${count}`).join(', ')}`)
  }
  return lines.join('\n')
}

export const commands = {
  'rate add': {
    spec: {
      values: [
        '--experiment',
        '--sample',
        '--run',
        '--against',
        '--verdict',
        '--note',
        '--rubric',
        '--judge-model',
        '--judge-provider',
        '--judge-prompt-sha',
        '--by'
      ],
      repeatable: ['--tag'],
      booleans: ['--blind'],
      required: ['--experiment', '--sample', '--run', '--verdict']
    },
    run: ({ project, options }) =>
      addRating(project, {
        experiment: options['--experiment'],
        sampleId: options['--sample'],
        run: options['--run'],
        against: options['--against'] ?? null,
        verdict: options['--verdict'],
        tags: options['--tag'] ?? [],
        note: options['--note'] ?? null,
        blind: Boolean(options['--blind']),
        rubric: options['--rubric'] ?? null,
        judgeModel: options['--judge-model'],
        judgeProvider: options['--judge-provider'],
        judgePromptSha: options['--judge-prompt-sha'],
        by: options['--by']
      })
  },
  'rate list': {
    spec: { values: ['--experiment', '--run', '--against', '--by'], required: ['--experiment'] },
    run: ({ project, options }) =>
      listRatings(project, {
        experiment: options['--experiment'],
        run: options['--run'] ?? null,
        against: options['--against'] ?? null,
        by: options['--by'] ?? null
      })
  },
  'rate summary': {
    spec: { values: ['--experiment', '--run', '--against'], required: ['--experiment', '--run'] },
    run: ({ project, options }) =>
      summarizeRatings(project, {
        experiment: options['--experiment'],
        run: options['--run'],
        against: options['--against'] ?? null
      })
  }
}

export const textOutput = {
  'rate add': (result) => `Recorded ${ratingLine(result.rating)}\nLedger: ${result.ledger}`,
  'rate list': (result) =>
    result.ratings.length
      ? result.ratings.map(ratingLine).join('\n')
      : `No ratings in ${result.ledger}.`,
  'rate summary': summaryText
}

export const usage = `
Sample ratings (.aster/experiments/<slug>/ratings.jsonl)
  rate add --experiment SLUG --sample ID --run EXPERIMENT/RUN [--against EXPERIMENT/RUN]
           --verdict V [--tag SLUG]... [--note TEXT] [--blind] [--rubric PROJECT-PATH]
           [--by agent|user] [--judge-model MODEL] [--judge-provider NAME] [--judge-prompt-sha HEX]
                                         Without --against V is good|bad|unsure; with it V is
                                         a|b|tie where a is --run. The sample must be in each Run's
                                         outputs.jsonl when that file exists. --by agent needs
                                         --judge-model; the harness hashes --rubric itself.
                                         An agent never records --by user.
  rate list --experiment SLUG [--run EXPERIMENT/RUN] [--against EXPERIMENT/RUN] [--by user|agent]
                                         Latest rating per rater, sample, and Run pair; A/B
                                         verdicts are shown from --run's side
  rate summary --experiment SLUG --run EXPERIMENT/RUN [--against EXPERIMENT/RUN]
                                         Wins/ties/losses and good/bad/unsure with n, by user and
                                         agent, user–agent agreement, judge setups, and tags
`
