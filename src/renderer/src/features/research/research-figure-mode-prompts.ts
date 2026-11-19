// What a Figure prompt says about the person's switches (careful drawing, references, concept
// image): the shared rule sentences the Figures guide carries word for word, and the commands
// and paths of this figure.
import {
  FIGURE_CAREFUL_RULE,
  FIGURE_CONCEPT_RULE,
  FIGURE_HYBRID_RULE
} from '../../../../research-harness/research-figures-style-rules.mjs'
import type { FigurePromptModes } from './research-figure-reference-library'

export type { FigurePromptModes }

/** What a prompt is for: a whole figure, a part of one (an area, a selection), or a recreation. */
export type FigurePromptKind = 'whole' | 'part' | 'recreate'

/** The paths and names a mode line needs from the prompt's context. */
export type FigureModeTarget = {
  /** The figure's own folder (absolute). */
  folderPath: string
  slug: string | null
  modes?: FigurePromptModes | null
}

const quote = (value: string): string => JSON.stringify(value)

/** The part of a prompt's context the switch lines read. */
export function figureModeTarget(context: {
  folderPath: string
  figure: { slug: string } | null
  modes?: FigurePromptModes | null
}): FigureModeTarget {
  return {
    folderPath: context.folderPath,
    slug: context.figure?.slug ?? null,
    modes: context.modes
  }
}

/** `figures refs` with this figure, the person's folder and pins. */
export function figureRefsCommand(
  target: FigureModeTarget,
  about = '<what the figure shows>'
): string {
  const references = target.modes?.references
  return [
    'node H/cli.mjs figures refs',
    ...(target.slug ? [`--figure ${target.slug}`] : []),
    ...(references?.library ? [`--library ${quote(references.library)}`] : []),
    ...(references?.pinned.length ? [`--pin ${references.pinned.join(',')}`] : []),
    `--for "${about}"`
  ].join(' ')
}

function referencesOn(target: FigureModeTarget): boolean {
  // Why on without modes: prompts built before the switches existed keep their reference step.
  return target.modes?.references !== null
}

/** Whether the concept image is on as hybrid art (generated parts kept, vector over them). */
function hybrid(modes: FigurePromptModes | null | undefined): boolean {
  return Boolean(modes?.concept) && modes?.conceptStyle === 'hybrid'
}

function summary(modes: FigurePromptModes): string {
  const careful = modes.careful
    ? `on (N = ${modes.careful.rounds} art director rounds; ${modes.careful.pick === 'person' ? 'the person picks the sketch' : 'you pick the sketch'})`
    : 'off'
  const pins = modes.references?.pinned.length
    ? `; pinned: ${modes.references.pinned.join(', ')}`
    : ''
  const references = modes.references ? `on${pins}` : 'off'
  const concept = modes.concept
    ? hybrid(modes)
      ? 'on (experimental, hybrid: generated art + vector text)'
      : 'on (experimental)'
    : 'off'
  return `The person's switches for this project: careful drawing ${careful}, references ${references}, concept image ${concept}.`
}

function conceptLines(target: FigureModeTarget): string[] {
  const slug = target.slug ?? '<slug>'
  const image = `${target.folderPath}/references/${slug}-concept.png`
  return [
    FIGURE_CONCEPT_RULE,
    `Concept image here: ${quote(image)}. Without an image tool of your own, run \`codex exec --enable image_generation --skip-git-repo-check -s workspace-write -C ${quote(target.folderPath)} "Generate one image with your image generation tool: <the figure's composition in plain words, white background, flat vector style, few or no words>. Then copy the PNG you generated to references/${slug}-concept.png in this folder."\`; if it is not there afterwards, copy the newest PNG under \`\${CODEX_HOME:-~/.codex}/generated_images/\`. If Codex cannot generate it, say so and draw without it.`
  ]
}

function hybridLines(target: FigureModeTarget): string[] {
  const slug = target.slug ?? '<slug>'
  return [
    FIGURE_HYBRID_RULE,
    `Art for this figure: ${quote(`${target.folderPath}/art/${slug}/`)} (<part>.prompt.txt, then \`node H/cli.mjs figures art --figure ${slug} --part <part> --gen --aspect <w/h>\`; \`figures kit art\` documents fig.art). When you are Codex, make the image with your own image tool instead and prepare it with \`figures art --figure ${slug} --part <part> --from <png>\`. If no image can be generated, say so and draw those parts with the kit.`
  ]
}

/** The switch lines of a prompt's header: which are on, and the rules of those that apply. */
export function figureModeLines(target: FigureModeTarget, kind: FigurePromptKind): string[] {
  const modes = target.modes
  if (!modes || kind === 'recreate') {
    return []
  }
  if (kind === 'part') {
    return modes.careful || modes.concept
      ? [
          `${summary(modes)} Careful drawing and the concept image apply to whole figures, not to this change: do it in one pass.`
        ]
      : []
  }
  return [
    summary(modes),
    ...(modes.careful
      ? [
          FIGURE_CAREFUL_RULE,
          `Here N = ${modes.careful.rounds}. ${modes.careful.pick === 'person' ? 'The person picks the sketch: after recording the sketches, say in one line per sketch how it differs and stop until they pick one.' : 'You pick the sketch, saying why in one sentence.'} Careful drawing is for a new drawing or a redraw; for a small change the person asks for in the chat, skip the sketches and run the art director rounds only if they ask.`
        ]
      : []),
    ...(modes.concept ? (hybrid(modes) ? hybridLines(target) : conceptLines(target)) : [])
  ]
}

/** The draw-from-method step that comes before drawing: references (or none) and the brief. */
export function figureBriefStep(target: FigureModeTarget, structure: string): string {
  const brief =
    'the one idea a reader must get in five seconds; the data the method operates on (tokens, image patches, video frames, latents…); the hero element (the contribution) and what you will leave out (tokenizer, patchify, output embeddings and other routine steps become arrow labels or nothing).'
  const start = referencesOn(target)
    ? `2. Before drawing, pick references (\`${figureRefsCommand(target)}\`), open their images and look; then write a design brief in the chat: the reference you follow ("Following <id>": its composition and glyph vocabulary, never its content); ${brief}`
    : `2. References are off: do not run \`figures refs\`. Before drawing, write a design brief in the chat: "no reference"; ${brief}`
  return `${start} Then list the key structure from the text: ${structure}.`
}

/** The comparison with the reference a critique of the preview adds, when references are on. */
export function figureCompareClause(target: FigureModeTarget): string {
  return referencesOn(target)
    ? ' and against the reference you follow, the print-size PNG beside its image'
    : ''
}

/** Extra draw-from-method steps the switches add, in order. */
export function figureModeSteps(target: FigureModeTarget): { before: string[]; after: string[] } {
  const modes = target.modes
  return {
    before: [
      ...(modes?.concept && hybrid(modes)
        ? [
            `2a. Hybrid art (the switch above): lay the figure out first${modes.careful ? ' (the chosen sketch)' : ''}, then write a textless prompt per illustrative slot and generate them (at most 4 images), place them with fig.art in step 4 and draw every word, arrow and count over them.`
          ]
        : modes?.concept
          ? [
              modes.careful
                ? '2a. Concept image (the switch above): after the brief, generate it, open it and measure it; it is one of the sketches in 2b, not the plan.'
                : '2a. Concept image (the switch above): after the brief, generate it, open it and measure it; step 4 redraws it as editable shapes with every word from the paper.'
            ]
          : []),
      ...(modes?.careful
        ? [
            `2b. Careful drawing: sketch 3–4 compositions first (\`figures careful --figure ${target.slug ?? '<slug>'} --start --rounds ${modes.careful.rounds}\`)${modes.concept && !hybrid(modes) ? ", one of them the concept image's composition," : ''} record and pick one as the rule above says; step 4 draws the chosen one in full.`
          ]
        : [])
    ],
    after: modes?.careful
      ? [
          `6. Then run the ${modes.careful.rounds} art director rounds (\`figures careful --figure ${target.slug ?? '<slug>'} --review\` each round), make every fix, and finish with \`figures careful --done\` before you reply.`
        ]
      : []
  }
}

/** Clean up and Turn my sketch keep their composition: careful drawing runs only its rounds. */
export function figureKeepCompositionLines(target: FigureModeTarget, request: string): string[] {
  const careful = target.modes?.careful
  return careful && (request === 'clean-up' || request === 'sketch')
    ? [
        `Careful drawing for this request: no sketches (the composition stays as it is). When the figure is done, start with \`figures careful --figure ${target.slug ?? '<slug>'} --start --rounds ${careful.rounds}\` and run the ${careful.rounds} art director rounds (\`--review\` each round), making every fix.`
      ]
    : []
}

/** The line a typed message's context carries about a new figure or a redraw. */
export function figureRedrawLine(target: FigureModeTarget, structure: string): string {
  const references = referencesOn(target)
    ? `pick references first (\`${figureRefsCommand(target, '<what it shows>')}\`) and open their images, write the design brief naming the one you follow`
    : 'write the design brief ("no reference": references are off)'
  const careful = target.modes?.careful
    ? ', sketch 3–4 compositions and pick one (careful drawing)'
    : ''
  const compare = referencesOn(target) ? ' and beside the reference' : ''
  const rounds = target.modes?.careful
    ? `, then the ${target.modes.careful.rounds} art director rounds`
    : ''
  return `For a new figure or a redraw, follow the skill: ${references}, list the key structure (${structure})${careful}, pick the layout, draw the data, then check the print-size preview against the rubric${compare}${rounds}.`
}

/** The part of the context key that changes when the switches do. */
export function figureModesKey(modes: FigurePromptModes | null | undefined): string {
  if (!modes) {
    return ''
  }
  return [
    modes.careful ? `c${modes.careful.rounds}${modes.careful.pick[0]}` : '',
    modes.references
      ? `r${modes.references.pinned.join('+')}${modes.references.library ? 'l' : ''}`
      : '',
    modes.concept ? (hybrid(modes) ? 'h' : 'i') : ''
  ].join('')
}
