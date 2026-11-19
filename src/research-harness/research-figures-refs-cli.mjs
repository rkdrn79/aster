// `figures refs`: the reference figures to draw after (research-figures-refs), as text for the
// Figure agent: the recipe of each, the image to open, what was left out and why.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { integerOption } from './research-cli-arguments.mjs'
import { HarnessError } from './research-harness-error.mjs'
import { catalogManuscript, listFigures } from './research-figures-folders.mjs'
import {
  RECIPES,
  STYLE_DNA,
  listReferenceLibrary,
  pickReferences,
  referenceImage,
  referenceLibrary,
  excludedReferences
} from './research-figures-refs.mjs'

/** The page frame's settings of a figure (its `paper` among them), or null. */
async function figurePageSettings(project, slug) {
  const { figures } = await listFigures(project)
  const figure = figures.find((entry) => entry.slug === slug)
  if (!figure) {
    throw new HarnessError('not_found', `No figure ${slug}`)
  }
  try {
    const scene = JSON.parse(await readFile(path.join(project, figure.scene), 'utf8'))
    const frame = (scene.elements ?? []).find(
      (element) => !element.isDeleted && element.type === 'frame' && element.customData?.asterPage
    )
    return frame?.customData?.asterPage ?? {}
  } catch {
    return {}
  }
}

const list = (value) =>
  String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

/** A pinned image of the person's own: no recipe, so the agent reads the image itself. */
function ownImageText({ id, image }, index) {
  return [
    `${Number.isInteger(index) ? `${String(index)}. ` : ''}${id} (pinned, your own image, no recipe)`,
    `   Look at: ${image}`,
    '   Read its layout skeleton, glyphs, colour roles and emphasis from the image yourself; follow its composition, never its content.'
  ].join('\n')
}

/** One recipe as the agent reads it. */
export function recipeText(
  recipe,
  { image = null, matched = [], index = null, full = true, pinned = false } = {}
) {
  const number = Number.isInteger(index) ? `${String(index)}. ` : ''
  const found = matched.length ? ` · matched: ${matched.join(', ')}` : ''
  const head = `${number}${recipe.id}${pinned ? ' (pinned)' : ''}: ${recipe.title} (${String(recipe.year)}), ${recipe.figure}${found}`
  const lines = [
    head,
    typeof image === 'string'
      ? `   Look at: ${String(image)}`
      : '   (no image here: set up a reference folder to look at it)',
    `   Summary: ${recipe.summary}`,
    `   Layout: ${recipe.layout}`
  ]
  if (full) {
    lines.push(
      '   Glyphs (what is drawn, how, and the kit call):',
      ...recipe.glyphs.map((glyph) => `     - ${glyph}`),
      `   Colour: ${recipe.colour.join('; ')}`,
      `   Emphasis: ${recipe.emphasis}`,
      `   Type: ${recipe.type}`,
      `   Hand-made: ${recipe.handmade.join('; ')}`,
      `   Do not copy: ${recipe.avoid}`
    )
  }
  return lines.join('\n')
}

const NEXT = [
  'Next: open each image and look closely (the layout, how depth is drawn, what is a picture, where colour is). Pick ONE recipe to follow and say it in your design brief ("Following <id>: its <layout> and <glyphs>, with our content") with fig.design({ brief }); take its composition and glyph vocabulary, never its content, words or pictures.',
  'Before you finish: open your print-size preview beside that reference image and compare them point by point (the concept drawn, not boxed; one story axis; one glyph family in one view; colour for one meaning; pictures inside the drawing; the contribution leading by size); fix the largest difference first.'
]

export const commands = {
  'figures refs': {
    spec: {
      positionals: 1,
      values: ['--figure', '--kind', '--for', '--exclude', '--library', '--count', '--pin'],
      booleans: ['--list']
    },
    run: async ({ project, options, positionals }) => {
      const slug = options['--figure'] ?? null
      const page = slug ? await figurePageSettings(project, slug) : null
      const manuscript = await catalogManuscript(project)
      const exclude = list(options['--exclude'])
      const text = options['--for'] ?? ''
      const named = positionals[0] ?? null
      try {
        if (named || options['--list']) {
          const library = await referenceLibrary(project, options['--library'])
          const excluded = await excludedReferences(project, { exclude, page, text, manuscript })
          const chosen = named ? RECIPES.filter((recipe) => recipe.id === named) : RECIPES
          if (named && !chosen.length) {
            throw new Error(
              `No reference "${named}"; references: ${RECIPES.map((recipe) => recipe.id).join(', ')}`
            )
          }
          if (named && excluded.has(named)) {
            throw new Error(
              `${named} is left out for this figure (${excluded.get(named)}): a figure never follows its own paper's figure`
            )
          }
          return {
            mode: named ? 'one' : 'list',
            slug,
            library,
            ownImages:
              named || !library
                ? []
                : listReferenceLibrary(library.dir)
                    .entries.filter((entry) => !entry.recipe && entry.image)
                    .map((entry) => ({ id: entry.id, image: entry.image })),
            excluded: [...excluded].map(([id, why]) => ({ id, why })),
            references: chosen
              .filter((recipe) => !excluded.has(recipe.id))
              .map((recipe) => ({ recipe, image: referenceImage(library, recipe.id), matched: [] }))
          }
        }
        const picked = await pickReferences(project, {
          kind: options['--kind'] ?? null,
          text,
          count: integerOption(options, '--count') ?? 3,
          exclude,
          page,
          manuscript,
          library: options['--library'],
          pin: list(options['--pin'])
        })
        return {
          mode: 'pick',
          slug,
          library: picked.library,
          excluded: [...picked.excluded].map(([id, why]) => ({ id, why })),
          terms: picked.terms,
          unknownPins: picked.unknownPins,
          references: picked.picked.map(({ recipe, id, image, matched, score, pinned }) => ({
            recipe,
            ...(recipe ? {} : { id }),
            image,
            matched,
            score,
            pinned
          }))
        }
      } catch (error) {
        throw error instanceof HarnessError
          ? error
          : new HarnessError('invalid_argument', error.message)
      }
    }
  }
}

function refsText(result) {
  const where = result.library
    ? `Reference images: ${result.library.dir} (from ${result.library.from}).`
    : "No reference folder on this computer (ASTER_FIGURE_REFERENCES, the project's .aster/figures/references.json { library }, or Aster's app-data figure-references folder): the recipes below still apply."
  const left = result.excluded.length
    ? `Left out: ${result.excluded.map((entry) => `${entry.id} (${entry.why})`).join(', ')}.`
    : result.slug
      ? null
      : 'Pass --figure SLUG so the figure’s own paper is left out.'
  if (result.mode === 'list') {
    return [
      where,
      ...(left ? [left] : []),
      ...result.references.map(
        ({ recipe }) =>
          `${recipe.id.padEnd(15)} ${recipe.genre.padEnd(13)} ${recipe.kinds.join(', ')} · ${recipe.title} (${recipe.year})`
      ),
      ...(result.ownImages?.length
        ? [`Your images (no recipe): ${result.ownImages.map((entry) => entry.id).join(', ')}`]
        : []),
      '`figures refs --figure SLUG --for "what the figure shows"` picks the closest; `figures refs <id>` prints one recipe.'
    ].join('\n')
  }
  const missing = (result.unknownPins ?? []).map(
    (id) => `Pinned ${id} is not in the reference folder.`
  )
  if (!result.references.length) {
    return [
      where,
      ...(left ? [left] : []),
      ...missing,
      'No reference matches; try --kind or other words in --for (`figures refs --list` lists them all).'
    ].join('\n')
  }
  // Why said: two shared words is a loose match; the DNA still applies, a recipe only partly.
  const unpinned = result.references.filter((entry) => !entry.pinned)
  const loose =
    result.mode === 'pick' && unpinned.length && unpinned[0].matched.length <= 2
      ? [
          'These are loose matches (few shared concepts): take the style DNA below and only the parts of a recipe that fit; try other concept words in --for or --kind.'
        ]
      : []
  return [
    `Style references${result.slug ? ` for ${result.slug}` : ''}: follow one recipe's composition and glyph vocabulary, never its content.`,
    where,
    ...(left ? [left] : []),
    ...loose,
    ...missing,
    ...(unpinned.length < result.references.length
      ? [
          'Pinned by the person: follow one of the pinned references unless none fits this figure, and say why in the design brief.'
        ]
      : []),
    '',
    ...result.references.map((entry, index) => {
      const number = result.mode === 'pick' ? index + 1 : null
      return entry.recipe
        ? recipeText(entry.recipe, {
            image: entry.image,
            matched: entry.matched,
            index: number,
            pinned: entry.pinned === true
          })
        : ownImageText(entry, number)
    }),
    '',
    'Style DNA (what most references share):',
    ...STYLE_DNA.map((rule, index) => `  ${index + 1}. ${rule.rule}: ${rule.text}`),
    '',
    ...NEXT
  ].join('\n')
}

export const textOutput = { 'figures refs': refsText }

export const usage = `  figures refs [ID] [--figure SLUG] [--for "TEXT"] [--kind GENRE|KIND] [--exclude IDS] [--count N] [--pin IDS] [--list]
                                         Reference figures to draw after, picked BEFORE drawing:
                                         the 2–3 closest (by --for words and --kind) with their
                                         recipes (layout, glyphs with kit calls, colour, emphasis,
                                         type, hand-made details) and the image to open when a
                                         reference folder is set up; never the figure's own paper.
                                         --pin lists the references the person pinned (recipe ids,
                                         or images of their own in the folder, which have no recipe):
                                         they come first; --list also names their own images
`
