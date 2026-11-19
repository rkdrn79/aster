// `figures careful`: careful drawing for the Figure agent (research-figures-careful): sketches of
// 3–4 compositions, the choice, then rounds of review by the separate art director chat Aster
// starts. One action per call, or none to print where things stand.
import { integerOption } from './research-cli-arguments.mjs'
import { HarnessError } from './research-harness-error.mjs'
import {
  DEFAULT_ROUNDS,
  MAX_ROUNDS,
  carefulContext,
  carefulState,
  chooseSketch,
  recordDone,
  recordRound,
  recordSketches,
  requestReview,
  startCareful,
  wantCritic
} from './research-figures-careful.mjs'

const ACTIONS = [
  '--start',
  '--sketches',
  '--chose',
  '--review',
  '--round',
  '--done',
  '--want-critic'
]
// Why: an option that only means something with one action is an error without it, not ignored.
const OPTION_OWNERS = {
  '--rounds': '--start',
  '--why': '--chose',
  '--by': '--chose',
  '--fixes': '--round',
  '--ship': '--round',
  '--library': '--review'
}

export const commands = {
  'figures careful': {
    spec: {
      values: [
        '--figure',
        '--rounds',
        '--sketches',
        '--chose',
        '--why',
        '--by',
        '--round',
        '--fixes',
        '--done',
        '--library'
      ],
      booleans: ['--start', '--review', '--want-critic', '--ship'],
      required: ['--figure']
    },
    run: async ({ project, options }) => {
      const chosen = ACTIONS.filter((action) => options[action] !== undefined)
      if (chosen.length > 1) {
        throw new HarnessError('usage', `Use one action at a time, got ${chosen.join(' and ')}`)
      }
      for (const [option, owner] of Object.entries(OPTION_OWNERS)) {
        if (options[option] !== undefined && options[owner] === undefined) {
          throw new HarnessError('usage', `${option} goes with ${owner}`)
        }
      }
      if (options['--round'] !== undefined && options['--fixes'] === undefined) {
        throw new HarnessError('usage', '--round K needs --fixes "<the art director\'s reply>"')
      }
      const ctx = await carefulContext(project, options['--figure'])
      switch (chosen[0]) {
        case '--start': {
          const rounds = integerOption(options, '--rounds') ?? DEFAULT_ROUNDS
          if (rounds < 1 || rounds > MAX_ROUNDS) {
            throw new HarnessError('invalid_argument', `--rounds must be 1 to ${MAX_ROUNDS}`)
          }
          return { ...(await startCareful(ctx, rounds)), scene: ctx.scene }
        }
        case '--sketches':
          return recordSketches(ctx, options['--sketches'])
        case '--chose':
          return chooseSketch(ctx, options['--chose'], {
            why: options['--why'] ?? '',
            by: options['--by'] ?? 'agent'
          })
        case '--review':
          return requestReview(ctx, { library: options['--library'] ?? null })
        case '--round':
          return recordRound(ctx, integerOption(options, '--round'), options['--fixes'], {
            ship: options['--ship'] === true
          })
        case '--done':
          return recordDone(ctx, options['--done'])
        case '--want-critic':
          return wantCritic(ctx)
        default:
          return carefulState(ctx)
      }
    }
  }
}

const command = (slug, rest) => `node H/cli.mjs figures careful --figure ${slug} ${rest}`
const quoted = (file) => `'${file.replaceAll("'", "'\\''")}'`

function startText(result) {
  const { slug, state } = result
  return [
    `Careful drawing started for ${slug}: sketch first, then ${String(state.rounds)} art director round${state.rounds === 1 ? '' : 's'}.`,
    'Sketch files (3–4 rough compositions that differ in layout, not in detail):',
    ...result.sketchFiles.map((file, index) => `  s${String(index + 1)}: ${file}`),
    `Copy the figure file (${result.scene}) to each of them and draw one rough composition in each (\`openFigure('<abs path>')\` in a script, or edit the JSON), then record them with --sketches:`,
    command(slug, '--sketches "s1: … | s2: … | s3: …"')
  ].join('\n')
}

function sketchesText(result) {
  const { slug, state, warnings } = result
  return [
    `Recorded ${String(state.sketches.length)} sketches for ${slug}:`,
    ...state.sketches.map((sketch) => `  ${sketch.name}: ${sketch.note || '(no note)'}`),
    ...warnings.map((warning) => `WARNING ${warning}`),
    `Pick one: ${command(slug, '--chose s<k> --why "…"')} (when the person picks, stop here until they choose one in the panel).`
  ].join('\n')
}

function choseText(result) {
  const { slug, state } = result
  const { chose } = state
  return [
    `Chose ${chose.name} (by ${chose.by})${chose.why ? `: ${chose.why}` : ''}.`,
    `Draw it in full, preview it, then ask the art director: ${command(slug, '--review')}`
  ].join('\n')
}

function reviewText(result) {
  const { slug, rounds } = result
  const retry = command(slug, '--review')
  if (result.status === 'waiting-for-critic') {
    return [
      result.ended ? "The art director's chat has ended." : 'This figure has no art director yet.',
      `Aster is starting this figure's art director (a separate chat) while the Figures page is open; run \`${retry}\` again in about 20 seconds.`,
      'If it is still missing after a few tries, say so in the chat (the Figures page must be open); never review your own figure in its place.'
    ].join('\n')
  }
  if (result.status === 'shipped') {
    return `The art director said SHIP in round ${String(result.round)} of ${String(rounds)}. Finish with ${command(slug, '--done "<what changed>"')}`
  }
  if (result.status === 'rounds-done') {
    return `All ${String(rounds)} rounds are done. Finish with ${command(slug, '--done "<what changed>"')}`
  }
  const { round, address } = result
  return [
    ...result.warnings.map((warning) => `WARNING ${warning}`),
    `Round ${String(round)} of ${String(rounds)}: send this request to the art director (${address}), then wait for its answer.`,
    `aster orchestration send --to ${address} --type question --subject "${result.subject}" --body "$(cat ${quoted(result.bodyFile)})" --json`,
    'aster orchestration check --wait --timeout-ms 600000 --json',
    `Then record its reply: ${command(slug, `--round ${String(round)} --fixes "<its reply>"`)}`,
    `If the send says the chat has ended or is unknown: ${command(slug, '--want-critic')}, then --review again.`
  ].join('\n')
}

function roundText(result) {
  const { slug, round, review, state } = result
  const count = `${String(review.fixes.length)} fix${review.fixes.length === 1 ? '' : 'es'}`
  const head = `Round ${String(round)} of ${String(state.rounds)} recorded: ${count}${review.verdict === 'ship' ? ' (SHIP)' : ''}.`
  const notes = [
    ...(result.verdictGiven || review.verdict === 'ship'
      ? []
      : ['The reply did not start with SHIP or REVISE; taken as REVISE.']),
    ...(result.cut
      ? [
          `Kept the first ${String(review.fixes.length)} fixes; ${String(result.cut)} more were cut.`
        ]
      : [])
  ]
  const done = command(slug, '--done "<what changed>"')
  if (review.verdict === 'ship') {
    return [
      `${head} The art director shipped it: finish with --done "<what changed>".`,
      ...notes,
      done
    ].join('\n')
  }
  if (result.last) {
    return [
      `${head} That was the last round: make every fix, preview, then finish with --done "<what changed>".`,
      ...notes,
      done
    ].join('\n')
  }
  return [
    `${head} Make every fix, preview, then --review for round ${String(round + 1)}.`,
    ...notes,
    command(slug, '--review')
  ].join('\n')
}

function stateText(result) {
  const { slug, state } = result
  if (!state) {
    return `Careful drawing is not started for ${slug}: ${command(slug, '--start --rounds N')}`
  }
  const lines = [
    `Careful drawing for ${slug}: ${String(state.rounds)} art director round${state.rounds === 1 ? '' : 's'}, started ${state.startedAt}.`,
    result.sketches.length
      ? 'Sketches:'
      : 'Sketches: none recorded yet (--sketches "s1: … | s2: …").',
    ...result.sketches.map(
      (sketch) =>
        `  ${sketch.name}: ${sketch.note || '(no note)'}${sketch.exists ? '' : ` (file missing: ${sketch.file})`}`
    ),
    state.chose
      ? `Chosen: ${state.chose.name} by ${state.chose.by}${state.chose.why ? `, ${state.chose.why}` : ''}.`
      : 'Chosen: none yet.',
    result.critic
      ? `Art director: ${result.critic.address} (${result.critic.agent ?? 'agent'}).`
      : `Art director: none yet${state.wantCritic ? ' (asked Aster to start one)' : ''}.`
  ]
  if (state.reviews.length) {
    lines.push('Reviews:')
    for (const review of state.reviews) {
      lines.push(
        `  Round ${String(review.round)}: ${review.verdict.toUpperCase()}`,
        ...review.fixes.map((fix) => `    - ${fix}`)
      )
    }
  } else {
    lines.push('Reviews: none yet.')
  }
  lines.push(
    state.done ? `Done: ${state.done.note || '(no note)'} (${state.done.at}).` : 'Done: not yet.'
  )
  return lines.join('\n')
}

const TEXT = {
  start: startText,
  sketches: sketchesText,
  chose: choseText,
  review: reviewText,
  round: roundText,
  done: (result) =>
    `Careful drawing recorded as done for ${result.slug}: ${result.state.done.note || '(no note)'}`,
  'want-critic': (result) =>
    `Asked Aster for a new art director for ${result.slug}; run ${command(result.slug, '--review')} again in about 20 seconds.`,
  state: stateText
}

export const textOutput = { 'figures careful': (result) => TEXT[result.action](result) }

export const usage = `  figures careful --figure SLUG [--start [--rounds N] | --sketches "s1: note | s2: note" | --chose sK [--why "…"] [--by person|agent]
               | --review [--library DIR] | --round K --fixes "TEXT" [--ship] | --done "NOTE" | --want-critic]
                                         Careful drawing: sketch 3–4 compositions as copies of the
                                         figure in <figure folder>/.careful/<slug>/s1..s4.excalidraw
                                         (--start makes the folder, default 3 rounds, 1–10), record
                                         them (--sketches), pick one (--chose); then, per round,
                                         --review writes the request for the separate art director
                                         chat Aster starts and prints the send/check commands, and
                                         --round K --fixes records its reply (SHIP or REVISE first,
                                         then the fixes); --done ends. Alone: where things stand
`
