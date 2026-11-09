import { colorsText } from './research-figures-kit-topics.mjs'
import { photoListText } from './research-figures-photos.mjs'
import { numberOption } from './research-cli-arguments.mjs'
import { HarnessError } from './research-harness-error.mjs'
import { FIGURE_PARTS, buildFigurePart } from './research-figures-parts.mjs'
import { kitIndexText, kitReferenceText } from './research-figures-kit-index.mjs'
import { iconListText } from './research-figures-icons.mjs'
import { templateListText, templateText } from './research-figures-templates.mjs'
import {
  checkFigures,
  createFigure,
  figureContext,
  listFigures,
  libraryListText,
  PREVIEW_WAIT_SECONDS,
  previewFigure,
  templatePartsText,
  referenceFigure,
  runFigure,
  showFigure
} from './research-figures.mjs'

/** Two decimals at most: 2.3333333 in prints as 2.33. */
const round2 = (value) => (typeof value === 'number' ? Math.round(value * 100) / 100 : value)

function areaLine(area) {
  return `  area ${area.id} "${area.name}" x=${area.x} y=${area.y} w=${area.width} h=${area.height} · ${area.children} elements`
}

function findingLines(level, findings) {
  return findings.map(
    (finding) =>
      `  ${level} ${finding.code}${finding.id ? ` ${finding.id}` : ''}: ${finding.message}`
  )
}

export const commands = {
  'figures list': { spec: {}, run: ({ project }) => listFigures(project) },
  'figures new': {
    spec: { values: ['--name', '--slug', '--size', '--style'], required: ['--name'] },
    run: ({ project, options }) =>
      createFigure(project, {
        name: options['--name'],
        slug: options['--slug'],
        size: options['--size'],
        style: options['--style']
      })
  },
  'figures run': {
    spec: { values: ['--figure'] },
    run: ({ project, options }) => runFigure(project, options['--figure']),
    failed: (result) => result.exitCode !== 0
  },
  'figures show': {
    spec: { values: ['--figure'] },
    run: ({ project, options }) => showFigure(project, options['--figure'])
  },
  'figures check': {
    spec: { values: ['--figure', '--area'] },
    run: ({ project, options }) => checkFigures(project, options['--figure'], options['--area']),
    failed: (result) => result.figures.some((figure) => figure.errors.length > 0)
  },
  'figures preview': {
    spec: { values: ['--figure', '--wait'] },
    run: ({ project, options }) =>
      previewFigure(project, options['--figure'], {
        waitSeconds: numberOption(options, '--wait') ?? PREVIEW_WAIT_SECONDS
      })
  },
  'figures reference': {
    spec: { values: ['--figure'] },
    run: ({ project, options }) => referenceFigure(project, options['--figure'])
  },
  'figures parts': { spec: {}, run: () => ({ parts: FIGURE_PARTS }) },
  'figures context': {
    spec: { values: ['--manuscript', '--figure'] },
    run: ({ project, options }) =>
      figureContext(project, { manuscript: options['--manuscript'], figure: options['--figure'] })
  },

  'figures kit': {
    spec: { positionals: 1, booleans: ['--all'] },
    run: async ({ project, positionals, options }) => {
      const topic = positionals[0] ?? null
      // Why an index by default: the whole reference is over 30 KB and gets cut off.
      if (!topic) {
        return { topic, text: options['--all'] ? kitReferenceText() : kitIndexText() }
      }
      if (topic === 'icons') {
        return { topic, text: iconListText() }
      }
      if (topic === 'templates') {
        return { topic, text: templateListText() }
      }
      if (topic === 'library') {
        return { topic, text: await libraryListText(project) }
      }
      if (topic === 'colors' || topic === 'colours') {
        return { topic, text: colorsText() }
      }
      const template = topic ? templateText(topic) : null
      if (template) {
        return { topic, text: `${template}\n${await templatePartsText(topic)}` }
      }
      try {
        const text = kitReferenceText(topic)
        return { topic, text: topic === 'image' ? `${text}\n${photoListText()}` : text }
      } catch (error) {
        throw new HarnessError('invalid_argument', error.message)
      }
    }
  },

  'figures part': {
    spec: {
      positionals: 1,
      values: [
        '--x',
        '--y',
        '--label',
        '--frame',
        '--width',
        '--height',
        '--color',
        '--id',
        '--id-prefix',
        '--scale',
        '--side',
        '--rows',
        '--cols',
        '--symbol'
      ]
    },
    run: ({ positionals, options }) => {
      const [name] = positionals
      if (!name) {
        throw new HarnessError('usage', 'figures part takes a part name; see figures parts')
      }
      try {
        return {
          elements: buildFigurePart(name, {
            x: numberOption(options, '--x'),
            y: numberOption(options, '--y'),
            label: options['--label']?.replaceAll('\\n', '\n'),
            frameId: options['--frame'],
            width: numberOption(options, '--width'),
            height: numberOption(options, '--height'),
            color: options['--color'],
            id: options['--id'] ?? options['--id-prefix'],
            scale: numberOption(options, '--scale'),
            side: options['--side'],
            rows: numberOption(options, '--rows'),
            cols: numberOption(options, '--cols'),
            symbol: options['--symbol']
          })
        }
      } catch (error) {
        throw new HarnessError('invalid_argument', error.message)
      }
    }
  }
}

export const textOutput = {
  'figures list': (result) =>
    [
      `Figures folder: ${result.folder}`,
      ...result.figures.map(
        (figure) =>
          `${figure.slug}  ${figure.scene}${figure.pdf ? '' : ' (not exported yet; open it in Aster Figures)'}`
      ),
      ...result.others.map((entry) => `${entry.path}  (${entry.kind}, read-only)`),
      result.figures.length || result.others.length ? '' : 'No figures yet.'
    ]
      .filter(Boolean)
      .join('\n'),
  'figures new': (result) =>
    `Created ${result.scene} (${result.page.widthIn} × ${result.page.heightIn} in). Aster writes ${result.slug}.svg and ${result.slug}.pdf when it is open in Figures. Draw it with ${result.script}, starting with ${result.import} (${result.shim}, portable), and run it with figures run --figure ${result.slug}.`,
  'figures run': (result) =>
    [
      `${result.script} exited ${result.exitCode} (kit through ${result.shim})`,
      result.stdout.trimEnd(),
      result.stderr.trimEnd()
    ]
      .filter(Boolean)
      .join('\n'),
  'figures show': (result) =>
    [
      `${result.figure.scene} · ${result.elements.length} elements`,
      result.page
        ? `page ${result.page.id}: ${round2(result.page.widthIn)} × ${round2(result.page.heightIn)} in at x=${result.page.x} y=${result.page.y} w=${round2(result.page.width)} h=${round2(result.page.height)} · style ${result.page.style ?? 'graphite'}${result.page.accent ? `, accent ${result.page.accent}` : ''}`
        : 'no page frame (exports fit the drawing)',
      `script ${result.script.path}${result.script.exists ? '' : ' (not written yet: keep the drawing script there)'}`,
      `kit ${result.shim.import}${result.shim.exists ? '' : ` (${result.shim.path} is missing: figures run writes it)`}`,
      ...result.areas.map(areaLine),
      ...result.elements.map(
        (element) =>
          `  ${element.id} ${element.type} x=${round2(element.x)} y=${round2(element.y)} w=${round2(element.width)} h=${round2(element.height)}${element.label ? ` "${element.label}"` : ''}${element.frameId ? ` frame=${element.frameId}` : ''}`
      ),
      // Why only measured images: typeset math, icons and badges are vectors with no pixel size.
      ...result.images
        .filter((image) => image.pixels)
        .map(
          (image) =>
            `  image ${image.id}: ${image.pixels.width} × ${image.pixels.height} px${image.crop ? ` cropped at ${image.crop.x}, ${image.crop.y}` : ''}, ${image.unitsPerPixel} units per pixel`
        ),
      ...result.issues.map((issue) => `ISSUE ${issue}`)
    ].join('\n'),
  'figures check': (result) =>
    result.figures.length
      ? result.figures
          .map((figure) =>
            figure.errors.length || figure.warnings.length || figure.notes?.length
              ? [
                  `${figure.scene}: ${figure.errors.length} errors, ${figure.warnings.length} warnings${figure.notes?.length ? `, ${figure.notes.length} notes` : ''}`,
                  ...findingLines('ERROR', figure.errors),
                  ...findingLines('warning', figure.warnings),
                  ...findingLines('note', figure.notes ?? [])
                ].join('\n')
              : `${figure.scene}: ok`
          )
          .join('\n')
      : 'No figures to check.',
  'figures preview': (result) =>
    [
      ...(result.problem ? [`WARNING ${result.problem}`] : []),
      `${result.png}\n(${result.widthPx} × ${result.heightPx} px of exactly what the PDF shows, rendered ${result.renderedAt} from the current file, sha256 ${String(result.sceneSha256).slice(0, 12)}; open it and look)`,
      ...(result.print
        ? [
            `${result.print}\n(the same page at print size, ${result.printDpi} dpi: open it too and check every label is still easy to read at that size)`
          ]
        : []),
      ...(result.lint
        ? [
            `${result.lint}\n(${result.lintFindings} lint finding${result.lintFindings === 1 ? '' : 's'} boxed in red with their codes, solid for errors, dashed for warnings; figures check gives the messages)`
          ]
        : []),
      ...(result.compare
        ? [
            `${result.compare}\n(the reference beside the preview at one scale; open it and compare)`,
            `${result.overlay}\n(the preview over a faded reference: an offset shows as a ghost edge)`
          ]
        : [])
    ].join('\n'),
  'figures reference': (result) =>
    [
      `${result.reference} (${result.widthPx} × ${result.heightPx} px; 1 px = ${result.unitsPerPixel} units from the page at x=${result.page.x} y=${result.page.y})`,
      ...(result.regions
        ? [
            'Colour regions in scene units, filled shapes first, then outlines and lines, largest first:',
            ...result.regions.map(
              (region) =>
                `  ${region.color} x=${region.x} y=${region.y} w=${region.width} h=${region.height} fill ${region.fill}`
            )
          ]
        : ['No measured regions: Aster measures them when Recreate from image starts.'])
    ].join('\n'),
  'figures parts': (result) =>
    result.parts
      .map(
        (part) =>
          `${part.id.padEnd(12)} ${part.name}${part.bind ? ` · bind arrows to ${part.bind}` : ''}`
      )
      .join('\n'),
  'figures part': (result) => JSON.stringify(result.elements, null, 2),
  'figures kit': (result) => result.text,
  'figures context': contextText
}

/** Headings past this many are counted, not listed: the agent needs the outline, not a dump. */
const CONTEXT_HEADINGS = 60

function contextText(result) {
  // Why not after --manuscript: the agent already picked the one the request names.
  const others =
    result.others.length && (result.chosenBy !== 'option' || !result.exists)
      ? [
          `Other manuscripts beside it: ${result.others.join(', ')} (figures context --manuscript PATH reads one).`
        ]
      : []
  if (!result.exists) {
    return [
      `${result.manuscript} does not exist yet; draw from the request and say what you assumed.`,
      ...others
    ].join('\n')
  }
  const shown = result.sections.slice(0, CONTEXT_HEADINGS)
  return [
    `${result.manuscript}${result.chosenBy === 'figure' ? ' (it includes this figure)' : ''} · figures in ${result.figures}`,
    ...(shown.length
      ? shown.map(
          (heading) =>
            `${'  '.repeat(heading.level)}${heading.paragraph ? '¶ ' : ''}${heading.title}  (${heading.file}:${heading.line})`
        )
      : ['  (no \\section titles yet)']),
    ...(result.sections.length > shown.length
      ? [`  … ${result.sections.length - shown.length} more headings`]
      : []),
    ...others,
    'If the method you are asked to draw has no section here, say so and say what you assumed.'
  ].join('\n')
}

export const usage = `
Figures (<manuscript folder>/figures/<slug>.excalidraw; Aster writes <slug>.svg, <slug>.pdf and a
PNG preview while the figure is open in its Figures page). --figure may be left out when there is
one figure. A figure's script imports { openFigure } from './aster-figures-kit.mjs', a portable
shim beside it that finds H on any computer (figures new writes it; figures run too).
  figures context [--manuscript PATH] [--figure SLUG]
                                         The manuscript's sections, subsections and run-in
                                         paragraph headings: is the method there yet? Without
                                         --manuscript, the .tex that includes the figure, else
                                         the catalog's manuscript
  figures run [--figure SLUG]            Runs <figures>/src/SLUG.figure.mjs with this kit (writing
                                         the shim it imports when missing); prints its output, exit 1
                                         when the script fails
  figures list | figures show [--figure SLUG]
                                         show lists the page, areas, elements and image scales
  figures check [--figure SLUG] [--area FRAME-ID]
                                         Layout lint; exit 1 on errors (warnings do not fail;
                                         notes are what to settle with the person, such as a
                                         page they sized)
  figures preview [--figure SLUG] [--wait SECONDS]
                                         Waits (default 90 s) for Aster's PNG of the current file,
                                         then prints its path, the print-size PNG, the PNG with lint
                                         findings boxed (when there are any), and for a recreation
                                         the reference beside it and under it; open them and look
  figures reference [--figure SLUG]      A recreation's reference: size, units per pixel, and its
                                         colour regions (boxes, outlines, lines) in scene units
  figures new --name NAME [--slug SLUG] [--size single|double|WIDTHxHEIGHT] [--style graphite|slate|outline|…]
                                         A scene with the locked page frame (3.25 in single column,
                                         6.75 in double; inches; 144 units per inch, 1 pt = 2 units)
  figures kit [TOPIC|NAME[,NAME…]] [--all]
                                         The kit's API: alone, an index of every function in one
                                         line each; a topic or names print the calls with every
                                         option and default and what arrows bind to; --all prints
                                         everything; icons, templates and library list the icons,
                                         module templates and saved parts
  figures parts                          The ML diagram parts and what arrows bind to
  figures part NAME [--x N] [--y N] [--label TEXT] [--id ID] [--frame FRAME-ID] [--width N]
               [--height N] [--color NAME|#hex] [--scale N] [--side top|bottom|left|right]
               [--rows N --cols N] [--symbol plus|times|dot]
                                         Prints the part's elements; --id fixes the ids
`
