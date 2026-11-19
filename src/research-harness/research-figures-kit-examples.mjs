// `figures kit examples`: complete, short scripts for the hard kinds of figure (rays through
// image planes, cones, tri-planes, camera rigs, Swin windows, a U-Net with skips, a fan-out of
// state lanes, an agent loop, a diffusion teaser, a loss landscape), each drawn with the kit's
// defaults and tested to run clean. None copies a paper's figure; each shows how the pieces fit.
import { SCENE_EXAMPLES } from './research-figures-kit-examples-scenes.mjs'
import { DIAGRAM_EXAMPLES } from './research-figures-kit-examples-diagrams.mjs'
import { STRUCTURE_EXAMPLES } from './research-figures-kit-examples-structure.mjs'
import { FLOW_EXAMPLES } from './research-figures-kit-examples-flows.mjs'
import { DRAWN_EXAMPLES } from './research-figures-kit-examples-drawn.mjs'

/** Every example: { name, title, page, uses, render (the thumbnail in words), script }. */
export const KIT_EXAMPLES = [
  ...SCENE_EXAMPLES,
  ...STRUCTURE_EXAMPLES,
  ...DIAGRAM_EXAMPLES,
  ...FLOW_EXAMPLES,
  ...DRAWN_EXAMPLES
]

const HOW =
  "Copy the closest one into <figures>/src/<slug>.figure.mjs, change the figure name in its first lines to your slug, swap the stock photos ({ kind }) for the project's own (`data/<figure>/x.png`, project-relative), then change the parts. Each reads fig.page and places its parts from the page's width and height, so it lays out on your page: `figures kit examples <name> --figure <slug>` runs it on a page of your figure's size and prints how it fits."

const relative = (example) => /fig\.page\b/.test(example.script)

/** The index (no name) or the named examples' scripts (`figures kit examples nerf-rays,unet`). */
export function examplesText(query, { page = null } = {}) {
  const yours = page ? `${page.widthIn}x${page.heightIn}` : null
  if (!query) {
    const lines = [
      `Worked examples (${KIT_EXAMPLES.length}): \`figures kit examples <name> --figure <slug>\` prints one whole script laid out for your figure's page (\`examples a,b\` several).`,
      HOW,
      ''
    ]
    for (const example of KIT_EXAMPLES) {
      const fits = relative(example)
        ? yours
          ? `adapts to your ${yours} in page; drawn first for ${example.page}`
          : `adapts to the page; drawn first for ${example.page} in`
        : `page ${example.page} in`
      lines.push(`${example.name.padEnd(16)} ${example.title} (${fits})`)
      lines.push(`  uses: ${example.uses}`)
      lines.push(`  looks like: ${example.render}`)
    }
    return lines.join('\n')
  }
  const names = String(query)
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
  const missing = names.filter((name) => !KIT_EXAMPLES.some((example) => example.name === name))
  if (missing.length) {
    throw new Error(
      `No example "${missing.join('", "')}"; examples: ${KIT_EXAMPLES.map((example) => example.name).join(', ')}`
    )
  }
  return names
    .map((name) => {
      const example = KIT_EXAMPLES.find((item) => item.name === name)
      const where = relative(example)
        ? yours
          ? `Laid out for your ${yours} in page (it reads fig.page; first drawn for ${example.page} in).`
          : `It reads fig.page, so it lays out on any page (first drawn for ${example.page} in; --figure <slug> shows how it fits yours).`
        : `Page ${example.page} in (figures new --size ${example.page}).`
      return [
        `// ${example.name}: ${example.title}. ${where}`,
        `// Looks like (on ${example.page} in): ${example.render}`,
        example.script.trim()
      ].join('\n')
    })
    .join('\n\n')
}
