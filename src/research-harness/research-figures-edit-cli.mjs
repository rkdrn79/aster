// `figures edits` (the person's hand edits that every script run keeps) and `figures edit` (the
// agent's few direct changes to a scene, without rerunning its script).
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { HarnessError } from './research-harness-error.mjs'
import { listFigures } from './research-figures-folders.mjs'
import { lintFigureScene } from './research-figures-lint.mjs'
import { releasePersonEdits } from './research-figures-person-edits.mjs'
import {
  personEditStatus,
  personEditsFileFor,
  readPersonEditsFile,
  writePersonEditsFile
} from './research-figures-person-files.mjs'
import { editFigureScene, parseSceneEdit } from './research-figures-scene-edit.mjs'

async function figureFor(project, slug) {
  const { figures } = await listFigures(project)
  const figure = figures.find((entry) => entry.slug === slug)
  if (!figure) {
    throw new HarnessError('not_found', `No figure ${slug}`)
  }
  return figure
}

async function readScene(project, figure) {
  try {
    return JSON.parse(await readFile(path.join(project, figure.scene), 'utf8'))
  } catch (error) {
    throw new HarnessError('invalid_json', `${figure.scene}: ${error.message}`)
  }
}

function ledgerFile(project, figure) {
  return personEditsFileFor(path.join(project, figure.scene)).file
}

async function listEdits(project, slug, release) {
  const figure = await figureFor(project, slug)
  const file = ledgerFile(project, figure)
  let released = []
  if (release.length) {
    const ledger = await readPersonEditsFile(file)
    if (!ledger) {
      throw new HarnessError('not_found', `The person has not edited ${slug} by hand`)
    }
    const result = releasePersonEdits(ledger, release)
    if (result.unknown.length) {
      throw new HarnessError(
        'not_found',
        `No hand edit ${result.unknown.join(', ')} in ${slug} (figures edits --figure ${slug} lists them)`
      )
    }
    await writePersonEditsFile(file, result.ledger)
    released = release
  }
  const status = await personEditStatus(project, figure, await readScene(project, figure))
  return {
    figure: slug,
    file: path.relative(project, file),
    released,
    count: status?.count ?? 0,
    lines: status?.lines ?? []
  }
}

async function editScene(project, slug, sets) {
  const edits = sets.map((spec) => {
    try {
      return parseSceneEdit(spec)
    } catch (error) {
      throw new HarnessError('invalid_argument', error.message)
    }
  })
  const figure = await figureFor(project, slug)
  const scene = await readScene(project, figure)
  const ledger = await readPersonEditsFile(ledgerFile(project, figure))
  const personSet = new Map(
    (ledger?.edits ?? []).map((entry) => [
      entry.id,
      new Set(
        entry.added || entry.removed
          ? ['x', 'y', 'path', 'text', 'width', 'height']
          : Object.keys(entry.set ?? {})
      )
    ])
  )
  const { changed, errors } = editFigureScene(scene, edits, { personSet })
  if (errors.length) {
    throw new HarnessError('invalid_argument', errors.join('\n'))
  }
  await writeFile(path.join(project, figure.scene), `${JSON.stringify(scene, null, 2)}\n`)
  const lint = lintFigureScene(scene)
  return {
    figure: slug,
    scene: figure.scene,
    changed,
    errors: lint.errors.length,
    warnings: lint.warnings.length,
    script: figure.script
  }
}

export const commands = {
  'figures edits': {
    spec: { values: ['--figure'], repeatable: ['--release'], required: ['--figure'] },
    run: ({ project, options }) =>
      listEdits(
        project,
        options['--figure'],
        (options['--release'] ?? []).flatMap((value) => value.split(',')).filter(Boolean)
      )
  },
  'figures edit': {
    spec: { values: ['--figure'], repeatable: ['--set'], required: ['--figure', '--set'] },
    run: ({ project, options }) => editScene(project, options['--figure'], options['--set'])
  }
}

export const textOutput = {
  'figures edits': (result) =>
    [
      ...(result.released.length
        ? [`Released ${result.released.join(', ')}: your script sets them again.`]
        : []),
      ...(result.lines.length
        ? result.lines
        : [
            `The person has not edited ${result.figure} by hand (${result.file} is empty or missing).`
          ])
    ].join('\n'),
  'figures edit': (result) =>
    [
      `Changed ${result.changed.join(', ')} in ${result.scene} (${result.errors} lint errors, ${result.warnings} warnings: figures check lists them).`,
      `The script still draws the old values: make the same change in ${result.script} too, or the next figures run puts them back.`
    ].join('\n')
}

export const usage = `
  figures edits --figure SLUG [--release ID|ID.PROP …]
                                         The person's hand edits (moves, labels, colours, locks,
                                         deletions, additions) that Aster keeps over every script
                                         run, and the ones whose element is gone; --release (only
                                         when the person agreed) lets the script set one again
  figures edit --figure SLUG --set ID.PROP=VALUE [--set …]
                                         A few direct changes without rerunning the script: x, y,
                                         dx, dy, width, height, text, strokeColor, backgroundColor,
                                         strokeWidth, strokeStyle, fontSize, locked, …; a move
                                         carries the label and bound arrow ends along. Refuses
                                         what the person set by hand
`
