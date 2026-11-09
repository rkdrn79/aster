import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { integerOption } from './research-cli-arguments.mjs'
import { HarnessError } from './research-harness-error.mjs'
import {
  addPromise,
  addReview,
  assembleRebuttal,
  createRebuttal,
  listClusters,
  listPoints,
  listPromises,
  listRebuttals,
  resolveRebuttalSlug,
  setClusters,
  setPoints,
  setPromiseDone,
  setResponse,
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
      values: ['--rebuttal', '--file', '--cluster', '--opening', '--general', '--status'],
      positionals: 1
    },
    run: async ({ project, options, positionals }) => {
      action(positionals, ['set'], 'response')
      requireOptions(options, ['--file'], 'rebuttal response set')
      return setResponse(project, await slugOf(project, options), {
        cluster: options['--cluster'],
        opening: options['--opening'],
        general: options['--general'],
        status: options['--status'],
        text: (await inputText(options)).trim()
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
  'rebuttal response': (result) =>
    result.cluster ? clusterLine(result.cluster) : `Saved the ${result.updated}.`,
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
                        --file PATH|- [--status todo|drafting|done]
  rebuttal assemble [--rebuttal SLUG] [--format reviewer|general|pdf|all] [--shared reviewer|general|repeat]
                                         Writes responses/reviewer-<R>.md, general.md, rebuttal.tex
                                         with character counts; exit 1 when a reply is over its limit
  rebuttal promises add [--rebuttal SLUG] --text TEXT [--cluster C1]...
  rebuttal promises list|done [--rebuttal SLUG] [--id P1 [--undo]]
`
