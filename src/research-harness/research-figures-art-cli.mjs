// `figures art`: generated, textless art for a hybrid figure (research-figures-art-gen). One action
// per call (--gen, --from, --prep), or none to list the figure's parts.
import { HarnessError } from './research-harness-error.mjs'
import {
  addArt,
  artContext,
  artState,
  checkPart,
  generateArt,
  prepareArtPart
} from './research-figures-art-gen.mjs'

const ACTIONS = ['--gen', '--from', '--prep']

export const commands = {
  'figures art': {
    spec: {
      values: ['--figure', '--part', '--from', '--aspect', '--model'],
      repeatable: ['--ref'],
      booleans: ['--gen', '--prep', '--split', '--soft'],
      required: ['--figure']
    },
    run: async ({ project, options }) => {
      const chosen = ACTIONS.filter((action) => options[action] !== undefined)
      if (chosen.length > 1) {
        throw new HarnessError('usage', `Use one action at a time, got ${chosen.join(' and ')}`)
      }
      if (chosen.length && options['--part'] === undefined) {
        throw new HarnessError('usage', `${chosen[0]} needs --part NAME`)
      }
      for (const option of ['--aspect', '--model', '--ref']) {
        if (options[option] !== undefined && chosen[0] !== '--gen') {
          throw new HarnessError('usage', `${option} goes with --gen`)
        }
      }
      const ctx = await artContext(project, options['--figure'])
      const prep = { soft: options['--soft'] === true, split: options['--split'] === true }
      switch (chosen[0]) {
        case '--gen':
          return generateArt(ctx, checkPart(options['--part']), {
            ...prep,
            aspect: options['--aspect'] ?? '1',
            refs: options['--ref'] ?? [],
            model: options['--model'] ?? null
          })
        case '--from':
          return addArt(ctx, checkPart(options['--part']), options['--from'], prep)
        case '--prep':
          return {
            action: 'prep',
            slug: ctx.slug,
            part: options['--part'],
            ...(await prepareArtPart(ctx, checkPart(options['--part']), prep))
          }
        default:
          return artState(ctx)
      }
    }
  }
}

function filesText(result) {
  return [
    ...result.files.map(
      (file) =>
        `  ${file.part}: ${file.png} (${String(file.width)} × ${String(file.height)} px); grid: ${file.grid}`
    ),
    ...(result.touchesEdge
      ? [
          'The drawing touches the image edge: it may be cut off; regenerate with a wider margin if so.'
        ]
      : []),
    'Open each grid image: no letters, numbers or labels may be in the art (regenerate or draw that part with the kit). Read anchor points as [u, v] from its top-left (the red tenths: 1 = 0.1 … 9 = 0.9) and place it with fig.art({ id, part, x, y, w | h, anchors }).'
  ].join('\n')
}

const TEXT = {
  gen: (result) =>
    `Generated ${result.part} for ${result.slug} in ${String(result.seconds)} s (image ${String(result.used)} of ${String(result.cap)} for this figure; keyed: ${result.keyed}).\n${filesText(result)}`,
  add: (result) =>
    `Prepared ${result.part} for ${result.slug} (keyed: ${result.keyed}).\n${filesText(result)}`,
  prep: (result) => `Prepared ${result.part} again (keyed: ${result.keyed}).\n${filesText(result)}`,
  state: (result) =>
    [
      `Art for ${result.slug} in ${result.folder}: ${String(result.used)} of ${String(result.cap)} generated images used.`,
      result.parts.length ? `Parts: ${result.parts.join(', ')}` : 'Parts: none yet.'
    ].join('\n')
}

export const textOutput = { 'figures art': (result) => TEXT[result.action](result) }

export const usage = `  figures art --figure SLUG [--part NAME (--gen [--aspect W/H] [--ref data/<figure>/x.png]… [--model M]
               | --from PNG | --prep) [--split] [--soft]]
                                         Hybrid figures: one textless illustration per part, drawn
                                         by Codex's image generation from <figure folder>/art/SLUG/
                                         NAME.prompt.txt (--gen; at most 4 per figure; --ref passes a
                                         project picture as content), or an image you made (--from).
                                         Keys out the white, trims (--split cuts separate objects
                                         apart, --soft keeps light parts see-through), writes
                                         NAME.png and NAME.grid.png for reading anchors; --prep
                                         prepares the last image again. Alone: the parts so far
`
