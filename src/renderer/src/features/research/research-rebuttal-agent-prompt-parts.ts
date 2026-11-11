import { readingLanguageInfo, type ReadingLanguageId } from './research-reading-language'
import type { RebuttalSnapshot } from './research-rebuttal-snapshot'

// Lines of the author-side prompts that depend on settings: where to read the guide, whether
// edits apply directly, and the reading language.

/** Where every rebuttal agent reads its guide: the CLI prints the copy matching this Aster. */
export const REBUTTAL_GUIDE_LINE =
  'Read the Rebuttal guide first: `aster skills get aster-research-track --section Rebuttal` prints the version that matches this Aster. An installed aster-research-track skill may be missing or older. On an older CLI without `--section`, read the `## Rebuttal` part of `aster skills get aster-research-track`.'

export function applies(snapshot: RebuttalSnapshot): boolean {
  return snapshot.bundle.meta.agentEdits !== 'ask'
}

export function editsLine(snapshot: RebuttalSnapshot): string {
  return applies(snapshot)
    ? 'Your reply text goes straight into the reply, also over text the person wrote: the harness keeps the earlier text as a version first, and the person can undo your edit with one click. Regrouping concerns with `clusters set` or `points set` (merge, split, remove a duplicate) is allowed too, also for groups that have replies: the harness carries every reply, and the person can undo the whole regroup. Change only the replies you were asked about. Do not mark anything Ready; only the person does.'
    : 'This rebuttal is set to Ask first: `response set` fills an empty reply, and for a reply that already has text it records your version as a suggestion the person accepts or discards on the Rebuttal page. A regroup with `clusters set` or `points set` that touches a written reply waits for the person the same way. Do not mark anything Ready; only the person does.'
}

/** How replies travel when groups change, for requests that may regroup. */
export const REGROUP_LINE =
  '   Merging, splitting or removing groups that already have replies is allowed. A reply whose group goes away moves into the group that takes its first concern, joined after its text; when you merge two answered groups, send the merged reply as that group\'s "response" in the same command. A split keeps the reply with the group that keeps the ID (or the first part); other parts start empty unless you give them a "response". A reply with nowhere to go is archived. Pass --turn and --request so the person can undo the regroup as one change.'

export function languageLines(slug: string, language: ReadingLanguageId): string[] {
  if (language === 'en') {
    return []
  }
  const name = readingLanguageInfo(language).prompt
  return [
    `The person reads along in ${name}. Write the replies themselves in English, the language of the reviews. In the same turn as each reply, opening or general text you save, save its ${name} translation: \`rebuttal translate set --rebuttal ${slug} --language ${language} --file -\` with {"items":[{"key":"reply:C3","text":"…"}]} (keys reply:opening:R1 and reply:general:intro|closing for those). A translation is for reading only: faithful, with numbers, symbols, citations and IDs as written. If \`response set\` answers "Proposed X4", add "proposal":"X4" to that item.`
  ]
}

export function translateBody(
  snapshot: RebuttalSnapshot,
  count: number,
  language: ReadingLanguageId
): string[] {
  const slug = snapshot.bundle.meta.slug
  const name = readingLanguageInfo(language).prompt
  return [
    `Translate the rebuttal into ${name} so the person can read along: ${count} ${count === 1 ? 'item is' : 'items are'} missing or outdated now (reviews, concerns, replies).`,
    `1. Run \`rebuttal translate list --rebuttal ${slug} --language ${language} --todo --json\`: each item has a key and its source text.`,
    '2. Translate each faithfully. Keep numbers, math, symbols, citations, IDs (R1-W2, C3, A2), Markdown and [TBD: …] as written; keep established technical terms, adding the original term in parentheses on first use when it helps.',
    `3. Save in batches of about 20 with \`rebuttal translate set --rebuttal ${slug} --language ${language} --file -\` and JSON {"items":[{"key":"…","text":"…"}]}.`,
    'Translations are for reading only: change no reply, concern or review, and do not draft anything. Then say in one sentence how many you saved.'
  ]
}
