// The lines every Writing agent prompt shares: where to read the guide and the rules that keep a
// draft honest. Pure strings, so the writing benchmark can import the app's prompts with tsx.

/** Where every Writing agent reads its guide: the CLI prints the copy matching this Aster. */
export const WRITING_GUIDE_LINE =
  'If you have not read it in this chat, read the Writing guide first: `aster skills get aster-research-track --section Writing` prints the version that matches this Aster. An installed aster-research-track skill may be missing or older. On an older CLI without `--section`, read the `## Writing` part of `aster skills get aster-research-track`. Run `aster research harness-path` for H (the folder of the `cli.mjs` it prints); `node H/cli.mjs writing` lists the writing commands.'

/**
 * Never invent: numbers, citations and attributions come from the project or the person. Numbers
 * come from claims first, then the manuscript and the project's data: in the writing bench, a
 * claims-only rule left 34 `\todo`s for numbers the manuscript already held.
 */
export const WRITING_HONESTY_LINE =
  "Never invent. Take each result number from, in order: a recorded claim (`node H/cli.mjs claim list`), the manuscript's own tables, figure captions or other sections, or a project data file (`data/`, results CSV or JSON). Copy it as printed there and name the source in a LaTeX comment (`% source: tab:main`); record a number from a Run with `claim add`, and for the others suggest a claim in your hand-off instead of holding the number back. Leave `\\todo{evidence: ...}` only when none of these has it. Cite only keys that `node H/cli.mjs writing bib` lists; when a source is needed but unknown, write `\\cite{TODO:what-it-must-support}`. Never credit the person's method, or a part of it, to a published paper you recognise: ask which parts are theirs and which are borrowed."

/**
 * What the writing bench found inside full manuscripts: claims beyond the evidence, padding past
 * the slot, invented details, run-in labels and lists. Every drafting prompt carries it.
 */
export const WRITING_SHAPE_LINE =
  'Ground and size every draft. Each fact traces to a source you can name (the code, a Run or claim, my notes, the manuscript, a data file, a cited paper); add nothing none of them contains, and never reuse wording from a published paper you recognise. Claim only what the evidence shows: counts instead of sweeps ("on 14 of 16 tasks", not "on every task"), scoped superlatives, each benefit tied to the table or figure that tests it, causes hedged. A fact taken from another section stays identical to it and points there (\\cref{tab:main}). Results stay in the experiments: the method says what and why and points forward. Set a length budget before drafting (the text you replace within 15%, else the guide\'s published sizes: abstract about 170 words, results paragraphs 60-100) and keep to it. Paper prose only: no bold run-in label on every paragraph, no bullet lists, no markdown.'

/** The human decision before drafting: the five-line skeleton, confirmed on the Writing page. */
export function skeletonGateLine(section: string): string {
  return `Draft a section only from its confirmed five-line skeleton (GAP, WHY-NOT, INSIGHT, APPROACH, EVIDENCE): \`node H/cli.mjs writing skeleton get --section ${section}\`. When it is missing or still a draft, write it with \`writing skeleton set --section ${section} --file -\` (one \`KEY: text\` line each), show it in the chat and stop: the person edits and confirms it on the Writing page, and Aster then sends you a message. Draft from an unconfirmed skeleton only when the person tells you to write anyway, and keep evidence that no claim, manuscript table or data file holds as visible placeholders.`
}

/** After every draft: the lint, the self-critique, and a short hand-off. */
export function checkLoopLine(texPath: string, section: string | null): string {
  const target = `--file ${JSON.stringify(texPath)}${section ? ` --section ${section}` : ''}`
  return `After writing, run \`node H/cli.mjs writing check ${target}\`, fix every ERROR and the warnings you agree with, then score the guide's self-critique rubric and fix what fails, at most 2 revise rounds. End with a short hand-off: what you wrote, the open placeholders (citations, evidence, figures) as a checklist, and the check counts before and after.`
}

/** Section names as the person reads them. */
export const WRITING_SECTION_NAMES: Record<string, string> = {
  intro: 'introduction',
  method: 'method',
  experiments: 'experiments',
  abstract: 'abstract',
  related: 'related work'
}

export function writingSectionName(section: string): string {
  return WRITING_SECTION_NAMES[section] ?? section
}
