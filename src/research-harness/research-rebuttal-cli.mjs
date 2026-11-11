import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { integerOption } from './research-cli-arguments.mjs'
import { HarnessError } from './research-harness-error.mjs'
import {
  addFollowUp,
  addPromise,
  addReview,
  assembleRebuttal,
  createRebuttal,
  historyOf,
  listClusters,
  listPaperChanges,
  listPoints,
  listPredictions,
  listPromises,
  listProposals,
  listRebuttals,
  proposePaperChange,
  resolveRebuttalSlug,
  reviewerContext,
  reviseResponse,
  setClusters,
  setPoints,
  setPredictions,
  setPromiseDone,
  setResponse,
  setTranslations,
  listTranslations,
  showRebuttal
} from './research-rebuttal.mjs'

async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/** `--file PATH` or `--file -` for stdin; relative paths are from the current directory. */
async function inputText(options) {
  const file = options['--file']
  return file === '-' ? readStdin() : readFile(path.resolve(file), 'utf8')
}

async function inputJson(options) {
  const content = await inputText(options)
  try {
    return JSON.parse(content)
  } catch (error) {
    throw new HarnessError('invalid_json', `--file is not valid JSON: ${error.message}`)
  }
}

function action(positionals, allowed, group) {
  const [name] = positionals
  if (!allowed.includes(name)) {
    throw new HarnessError('usage', `rebuttal ${group} takes ${allowed.join('|')}`)
  }
  return name
}

function requireOptions(options, keys, command) {
  for (const key of keys) {
    if (options[key] === undefined) {
      throw new HarnessError('usage', `${key} is required for ${command}`)
    }
  }
}

const slugOf = (project, options) => resolveRebuttalSlug(project, options['--rebuttal'])

function clip(value, max = 90) {
  const flat = value.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

export const commands = {
  'rebuttal new': {
    spec: {
      values: ['--name', '--slug', '--venue', '--reply-limit', '--forum'],
      required: ['--name']
    },
    run: ({ project, options }) =>
      createRebuttal(project, {
        name: options['--name'],
        slug: options['--slug'],
        venue: options['--venue'],
        forum: options['--forum'],
        replyChars: integerOption(options, '--reply-limit')
      })
  },
  'rebuttal list': { spec: {}, run: ({ project }) => listRebuttals(project) },
  'rebuttal show': {
    spec: { values: ['--rebuttal'] },
    run: async ({ project, options }) => showRebuttal(project, await slugOf(project, options))
  },
  'rebuttal add-review': {
    spec: {
      values: ['--rebuttal', '--reviewer', '--file', '--label', '--rating', '--confidence'],
      booleans: ['--force'],
      required: ['--file']
    },
    run: async ({ project, options }) =>
      addReview(project, await slugOf(project, options), {
        reviewer: options['--reviewer'],
        text: await inputText(options),
        label: options['--label'],
        rating: options['--rating'],
        confidence: options['--confidence'],
        force: Boolean(options['--force'])
      })
  },
  'rebuttal points': {
    spec: { values: ['--rebuttal', '--file', '--reviewer'], positionals: 1 },
    run: async ({ project, options, positionals }) => {
      const slug = await slugOf(project, options)
      if (action(positionals, ['set', 'list'], 'points') === 'list') {
        return listPoints(project, slug, { reviewer: options['--reviewer'] })
      }
      requireOptions(options, ['--file'], 'rebuttal points set')
      return setPoints(project, slug, await inputJson(options), { reviewer: options['--reviewer'] })
    }
  },
  'rebuttal clusters': {
    spec: { values: ['--rebuttal', '--file'], positionals: 1 },
    run: async ({ project, options, positionals }) => {
      const slug = await slugOf(project, options)
      if (action(positionals, ['set', 'list'], 'clusters') === 'list') {
        return listClusters(project, slug)
      }
      requireOptions(options, ['--file'], 'rebuttal clusters set')
      return setClusters(project, slug, await inputJson(options))
    }
  },
  'rebuttal response': {
    spec: {
      values: [
        '--rebuttal',
        '--file',
        '--cluster',
        '--opening',
        '--general',
        '--status',
        '--turn',
        '--request'
      ],
      positionals: 1
    },
    run: async ({ project, options, positionals }) => {
      const name = action(positionals, ['set', 'revise'], 'response')
      requireOptions(options, ['--file'], `rebuttal response ${name}`)
      const slug = await slugOf(project, options)
      const target = {
        cluster: options['--cluster'],
        opening: options['--opening'],
        general: options['--general'],
        turn: options['--turn'],
        request: options['--request']
      }
      if (name === 'revise') {
        return reviseResponse(project, slug, { ...target, ...(await inputJson(options)) })
      }
      return setResponse(project, slug, {
        ...target,
        status: options['--status'],
        text: (await inputText(options)).trim()
      })
    }
  },
  'rebuttal proposals': {
    spec: { values: ['--rebuttal'], positionals: 1 },
    run: async ({ project, options, positionals }) => {
      action(positionals, ['list'], 'proposals')
      return listProposals(project, await slugOf(project, options))
    }
  },
  'rebuttal history': {
    spec: { values: ['--rebuttal', '--cluster', '--opening', '--general'] },
    run: async ({ project, options }) => {
      const slot =
        options['--cluster'] ??
        (options['--opening']
          ? `opening:${options['--opening']}`
          : `general:${options['--general']}`)
      return historyOf(project, await slugOf(project, options), slot)
    }
  },
  'rebuttal followup': {
    spec: {
      values: ['--rebuttal', '--reviewer', '--file'],
      positionals: 1,
      required: ['--reviewer']
    },
    run: async ({ project, options, positionals }) => {
      action(positionals, ['add'], 'followup')
      requireOptions(options, ['--file'], 'rebuttal followup add')
      return addFollowUp(project, await slugOf(project, options), {
        reviewer: options['--reviewer'],
        text: await inputText(options)
      })
    }
  },
  'rebuttal reviewer-context': {
    spec: { values: ['--rebuttal', '--reviewer'], required: ['--reviewer'] },
    run: async ({ project, options }) =>
      reviewerContext(project, await slugOf(project, options), { reviewer: options['--reviewer'] })
  },
  'rebuttal predictions': {
    spec: { values: ['--rebuttal', '--reviewer', '--file'], positionals: 1 },
    run: async ({ project, options, positionals }) => {
      const slug = await slugOf(project, options)
      if (action(positionals, ['set', 'list'], 'predictions') === 'list') {
        return listPredictions(project, slug, { reviewer: options['--reviewer'] })
      }
      requireOptions(options, ['--reviewer', '--file'], 'rebuttal predictions set')
      return setPredictions(project, slug, {
        reviewer: options['--reviewer'],
        input: await inputJson(options)
      })
    }
  },
  'rebuttal paper': {
    spec: { values: ['--rebuttal', '--cluster', '--file'], positionals: 1 },
    run: async ({ project, options, positionals }) => {
      const slug = await slugOf(project, options)
      if (action(positionals, ['propose', 'list'], 'paper') === 'list') {
        return listPaperChanges(project, slug)
      }
      requireOptions(options, ['--cluster', '--file'], 'rebuttal paper propose')
      return proposePaperChange(project, slug, {
        cluster: options['--cluster'],
        input: await inputJson(options)
      })
    }
  },
  'rebuttal translate': {
    spec: {
      values: ['--rebuttal', '--language', '--file'],
      booleans: ['--todo'],
      positionals: 1,
      required: ['--language']
    },
    run: async ({ project, options, positionals }) => {
      const slug = await slugOf(project, options)
      if (action(positionals, ['set', 'list'], 'translate') === 'list') {
        return listTranslations(project, slug, {
          language: options['--language'],
          todo: Boolean(options['--todo'])
        })
      }
      requireOptions(options, ['--file'], 'rebuttal translate set')
      return setTranslations(project, slug, {
        language: options['--language'],
        input: await inputJson(options)
      })
    }
  },
  'rebuttal assemble': {
    spec: { values: ['--rebuttal', '--format', '--shared'] },
    run: async ({ project, options }) =>
      assembleRebuttal(project, await slugOf(project, options), {
        format: options['--format'] ?? 'all',
        shared: options['--shared']
      }),
    failed: (result) => result.outputs.some((output) => output.over)
  },
  'rebuttal promises': {
    spec: {
      values: ['--rebuttal', '--text', '--id'],
      repeatable: ['--cluster'],
      booleans: ['--undo'],
      positionals: 1
    },
    run: async ({ project, options, positionals }) => {
      const slug = await slugOf(project, options)
      const name = action(positionals, ['add', 'list', 'done'], 'promises')
      if (name === 'list') {
        return listPromises(project, slug)
      }
      if (name === 'done') {
        requireOptions(options, ['--id'], 'rebuttal promises done')
        return setPromiseDone(project, slug, { id: options['--id'], done: !options['--undo'] })
      }
      requireOptions(options, ['--text'], 'rebuttal promises add')
      return addPromise(project, slug, {
        text: options['--text'],
        clusters: options['--cluster'] ?? []
      })
    }
  }
}

function pointLine(point) {
  const cluster = point.cluster ? ` → ${point.cluster}` : ''
  return `${point.id} ${point.kind}/${point.type}${cluster}  ${point.summary || clip(point.quote)}`
}

function clusterLine(cluster) {
  const extra = [cluster.experiment && `experiment ${cluster.experiment}`, cluster.manuscript?.file]
    .filter(Boolean)
    .join(' · ')
  return `${cluster.id} [${cluster.action}, ${cluster.status}] ${cluster.title} (${cluster.points.join(', ')})${extra ? ` · ${extra}` : ''}${cluster.response ? '' : ' · no draft'}`
}

function outputLine(output) {
  const limit = output.limit
    ? ` ${output.chars}/${output.limit} chars${output.over ? ' OVER LIMIT' : ''}`
    : ''
  const missing = output.missing?.length ? ` · missing ${output.missing.join(', ')}` : ''
  return `${output.path}${limit}${missing}`
}

export const textOutput = {
  'rebuttal new': (result) => `Created ${result.path}/rebuttal.json`,
  'rebuttal list': (result) =>
    result.rebuttals.length
      ? result.rebuttals
          .map(
            (entry) =>
              `${entry.slug}  ${entry.name}${entry.venue ? ` · ${entry.venue}` : ''} · ${entry.reviewers.length} reviews`
          )
          .join('\n')
      : 'No rebuttals yet.',
  'rebuttal show': (result) =>
    [
      `${result.rebuttal.name} (${result.path})`,
      `${result.counts.reviewers} reviews · ${result.counts.points} points · ${result.counts.clusters} clusters (${result.counts.done} done) · ${result.counts.promises} promises`,
      ...result.readiness.replies.map(
        (reply) =>
          `${reply.reviewer}: ${reply.chars}/${reply.limit} chars${reply.over ? ' OVER LIMIT' : ''}`
      ),
      result.readiness.unclustered.length
        ? `Unclustered: ${result.readiness.unclustered.join(', ')}`
        : '',
      result.readiness.undrafted.length ? `No draft: ${result.readiness.undrafted.join(', ')}` : ''
    ]
      .filter(Boolean)
      .join('\n'),
  'rebuttal add-review': (result) =>
    [
      `Saved ${result.reviewer.id} to ${result.path}`,
      result.droppedPoints.length ? `Dropped points: ${result.droppedPoints.join(', ')}` : ''
    ]
      .filter(Boolean)
      .join('\n'),
  'rebuttal points': (result) =>
    result.points.length ? result.points.map(pointLine).join('\n') : 'No points.',
  'rebuttal clusters': (result) =>
    [
      ...(result.clusters.length ? result.clusters.map(clusterLine) : ['No clusters.']),
      result.unclustered?.length ? `Unclustered points: ${result.unclustered.join(', ')}` : ''
    ]
      .filter(Boolean)
      .join('\n'),
  'rebuttal response': (result) => {
    if (result.unchanged) {
      return `No change to ${result.slot}.`
    }
    if (!result.applied) {
      return `Proposed ${result.proposal} for ${result.slot}: this rebuttal is set to Ask first, so the person accepts or discards it in Aster. To translate it, pass "proposal":"${result.proposal}" to rebuttal translate set.`
    }
    const cluster = result.cluster ? ` ${clusterLine(result.cluster)}` : ''
    return result.edited
      ? `Edited ${result.slot} (${result.proposal}): your text is in the reply now. The earlier text is kept as a version, and the person can undo the edit in Aster.${cluster}`
      : `Drafted ${result.slot}: the reply was empty.${cluster}`
  },
  'rebuttal proposals': (result) =>
    result.proposals.length
      ? result.proposals
          .map(
            (p) =>
              `${p.id} ${p.slot}${p.applied ? ' (applied, undoable)' : ' (waiting)'} ${clip(p.request)}`
          )
          .join('\n')
      : 'No proposals.',
  'rebuttal history': (result) =>
    result.versions.map((v) => `${v.id} ${v.by} ${v.what} (${v.at})`).join('\n') || 'No versions.',
  'rebuttal followup': (result) =>
    `Added round ${result.followUp.round} for ${result.followUp.reviewer}.`,
  'rebuttal reviewer-context': (result) => JSON.stringify(result, null, 2),
  'rebuttal predictions': (result) =>
    result.predictions.length
      ? result.predictions.map((p) => `${p.id} [${p.likelihood}] ${clip(p.concern)}`).join('\n')
      : 'No predictions.',
  'rebuttal paper': (result) =>
    result.change
      ? `Proposed ${result.change.id} for ${result.change.cluster}: the person approves it in Aster before it is applied.`
      : result.changes.length
        ? result.changes.map((c) => `${c.id} ${c.cluster} ${c.status} ${c.file}`).join('\n')
        : 'No paper changes.',
  'rebuttal translate': (result) =>
    result.saved
      ? `Saved ${result.saved.length} ${result.language} ${result.saved.length === 1 ? 'translation' : 'translations'}: ${result.saved.join(', ')}`
      : [
          `${result.language}: ${result.counts.current} current, ${result.counts.outdated} outdated, ${result.counts.missing} missing`,
          ...result.items.map((item) => `${item.key} [${item.status}] ${clip(item.source, 70)}`)
        ].join('\n'),
  'rebuttal assemble': (result) => result.outputs.map(outputLine).join('\n'),
  'rebuttal promises': (result) =>
    result.promise
      ? `${result.promise.id} ${result.promise.done ? '[done]' : '[open]'} ${result.promise.text}`
      : result.promises.length
        ? result.promises
            .map(
              (p) =>
                `${p.id} ${p.done ? '[done]' : '[open]'} ${p.text}${p.clusters.length ? ` (${p.clusters.join(', ')})` : ''}`
            )
            .join('\n')
        : 'No promises yet.'
}

export const usage = `
Rebuttal (.aster/rebuttal/<slug>/: rebuttal.json, reviews/R1.md, points.json, clusters.json,
promises.json, responses/). --rebuttal may be left out when the project has one rebuttal.
  rebuttal new --name NAME [--slug SLUG] [--venue TEXT] [--reply-limit CHARS] [--forum OPENREVIEW-ID]
  rebuttal list | rebuttal show [--rebuttal SLUG]
  rebuttal add-review [--rebuttal SLUG] [--reviewer R1] --file PATH|- [--label TEXT]
                      [--rating TEXT] [--confidence TEXT] [--force]
                                         Saves reviews/<R>.md; a new reviewer gets the next ID
  rebuttal points set [--rebuttal SLUG] --file PATH|- [--reviewer R1]
                                         Replaces all points (or one reviewer's). Each point:
                                         {"id":"R1-W2","kind":"weakness|question|minor",
                                         "type":"experiment-request|clarity|related-work|novelty|
                                         soundness|reproducibility|presentation|typo|other",
                                         "summary":"…","quote":"exact text from the review"}.
                                         W/Q/M in the ID match the kind; quotes get offsets
  rebuttal points list [--rebuttal SLUG] [--reviewer R1]
  rebuttal clusters set [--rebuttal SLUG] --file PATH|-
                                         Replaces all clusters: {"id":"C1","title":"…","points":[…],
                                         "action":"experiment|text|clarify","plan":"…",
                                         "status":"todo|drafting|done","experiment":SLUG|null,
                                         "manuscript":{"file","line","anchor"}|null,"general":false}.
                                         A point is in at most one cluster; drafts keep by cluster ID
  rebuttal clusters list [--rebuttal SLUG]
  rebuttal response set [--rebuttal SLUG] (--cluster C1 | --opening R1 | --general intro|closing)
                        --file PATH|- [--status todo|drafting] [--turn ID] [--request TEXT]
                                         The text lands in the reply; earlier text is kept as a
                                         version the person can undo to. When the rebuttal is set
                                         to Ask first, text over a written reply waits as a proposal
  rebuttal response revise [--rebuttal SLUG] (--cluster C1 | ...) --file -  (JSON {"find","replace"})
                                         Replaces one exact passage, applied the same way
  rebuttal followup add [--rebuttal SLUG] --reviewer R1 --file PATH|-
                                         A reviewer's later reply, kept as a new round; points of it
                                         use "round":2 and quote the follow-up text
  rebuttal reviewer-context [--rebuttal SLUG] --reviewer R1
                                         What that reviewer's simulated agent reads (read-only)
  rebuttal predictions set [--rebuttal SLUG] --reviewer R1 --file PATH|-
                                         {"predictions":[{"concern","why","likelihood":"low|medium|high",
                                         "trigger":{"cluster":"C1","point":"R1-W1","quote":"…"},"preempt":"…"}],
                                         "outlook":{"direction":"up|same|down","note":"…"}}
  rebuttal predictions list [--rebuttal SLUG] [--reviewer R1]
  rebuttal proposals list [--rebuttal SLUG]
  rebuttal history [--rebuttal SLUG] (--cluster C1 | --opening R1 | --general intro|closing)
  rebuttal paper propose [--rebuttal SLUG] --cluster C1 --file PATH|-
                                         {"file":"paper/main.tex","find":"exact passage","replace":"…",
                                         "why":"…","promise":"…"?}; applied only after the person approves
  rebuttal paper list [--rebuttal SLUG]
  rebuttal translate set [--rebuttal SLUG] --language ko --file PATH|-
                                         {"items":[{"key":"reply:C3","text":"…"}]}. Keys: quote:R1-W2,
                                         summary:R1-W2, title:C3, reply:C3, reply:opening:R1,
                                         reply:general:intro|closing, review:R1, review:R1-round-2.
                                         Kept with the hash of the text it translates, so an edit
                                         marks it outdated. Add "proposal":"X4" to translate a
                                         waiting proposal's text instead of the reply
  rebuttal translate list [--rebuttal SLUG] --language ko [--todo]
                                         Each item's state; --todo lists missing and outdated ones
                                         with their source text
  rebuttal assemble [--rebuttal SLUG] [--format reviewer|general|pdf|all] [--shared reviewer|general|repeat]
                                         Writes responses/reviewer-<R>.md, general.md, rebuttal.tex
                                         with character counts; exit 1 when a reply is over its limit
  rebuttal promises add [--rebuttal SLUG] --text TEXT [--cluster C1]...
  rebuttal promises list|done [--rebuttal SLUG] [--id P1 [--undo]]
`
