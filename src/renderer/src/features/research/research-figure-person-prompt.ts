/** What the Figure agent hears about the person's hand edits, with the figure's other context. */
export function personEditPromptLines(
  figure: { slug: string; personEdits?: readonly string[] } | null
): string[] {
  const edits = figure?.personEdits ?? []
  if (!figure || !edits.length) {
    return []
  }
  return [
    `I edited this figure by hand. Aster keeps these edits over every run of your script (they win over it), so build on them and never undo them; to change one, ask me first, and once I agree run \`node H/cli.mjs figures edits --figure ${figure.slug} --release <id>\`:`,
    ...edits.map((line) => `   - ${line}`)
  ]
}
