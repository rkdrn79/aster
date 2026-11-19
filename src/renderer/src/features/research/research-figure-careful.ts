import type { FigureTarget } from './research-figures-export'
import {
  listProjectDirectory,
  readProjectText,
  writeProjectText,
  type ProjectFileOwner
} from './research-project-files'

// Careful drawing's record of one figure, as `figures careful` writes it beside the figure:
// `.careful/<slug>.json` (sketches, the choice, each art director round), the sketches in
// `.careful/<slug>/s1..s4.excalidraw`, and the art director's address the app writes for the harness.

export type CarefulReview = {
  round: number
  verdict: 'revise' | 'ship'
  fixes: string[]
  at: string
}

export type CarefulRecord = {
  rounds: number
  startedAt: string | null
  sketches: { name: string; note: string }[]
  chose: { name: string; why: string; by: 'agent' | 'person' } | null
  reviews: CarefulReview[]
  done: { note: string; at: string } | null
  wantCritic: string | null
  updatedAt: string | null
}

export type CarefulCritic = { address: string; agent: string; startedAt: string }

export function carefulPaths(target: Pick<FigureTarget, 'folder' | 'slug'>) {
  const folder = `${target.folder}/.careful`
  return {
    folder,
    record: `${folder}/${target.slug}.json`,
    critic: `${folder}/${target.slug}.critic.json`,
    sketches: `${folder}/${target.slug}`
  }
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '')
const nullableText = (value: unknown): string | null => (typeof value === 'string' ? value : null)
const listOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])
const get = (value: unknown, key: string): unknown =>
  value && typeof value === 'object' ? Reflect.get(value, key) : undefined

/** The record as far as it can be read; null when it is not careful drawing's JSON. */
export function parseCarefulRecord(raw: string): CarefulRecord | null {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (!value || typeof value !== 'object') {
    return null
  }
  const list = (key: string): unknown[] => listOf(get(value, key))
  const chose = get(value, 'chose')
  const done = get(value, 'done')
  const rounds = get(value, 'rounds')
  return {
    rounds: typeof rounds === 'number' && rounds > 0 ? rounds : 5,
    startedAt: nullableText(get(value, 'startedAt')),
    sketches: list('sketches')
      .map((entry) => ({ name: text(get(entry, 'name')), note: text(get(entry, 'note')) }))
      .filter((entry) => /^s[1-4]$/.test(entry.name)),
    chose:
      chose && typeof chose === 'object'
        ? {
            name: text(get(chose, 'name')),
            why: text(get(chose, 'why')),
            by: get(chose, 'by') === 'person' ? 'person' : 'agent'
          }
        : null,
    reviews: list('reviews')
      .map((entry) => ({
        round: Number(get(entry, 'round')) || 0,
        verdict: get(entry, 'verdict') === 'ship' ? ('ship' as const) : ('revise' as const),
        fixes: listOf(get(entry, 'fixes')).map(text).filter(Boolean),
        at: text(get(entry, 'at'))
      }))
      .filter((entry) => entry.round > 0)
      .toSorted((first, second) => first.round - second.round),
    done:
      done && typeof done === 'object'
        ? { note: text(get(done, 'note')), at: text(get(done, 'at')) }
        : null,
    wantCritic: nullableText(get(value, 'wantCritic')),
    updatedAt: nullableText(get(value, 'updatedAt'))
  }
}

export function parseCarefulCritic(raw: string): CarefulCritic | null {
  try {
    const value: unknown = JSON.parse(raw)
    const address = text(get(value, 'address'))
    return address.startsWith('orca_session_id:')
      ? { address, agent: text(get(value, 'agent')), startedAt: text(get(value, 'startedAt')) }
      : null
  } catch {
    return null
  }
}

async function readOptional(owner: ProjectFileOwner, path: string): Promise<string | null> {
  return readProjectText(owner, path).catch(() => null)
}

export async function readCarefulRecord(
  owner: ProjectFileOwner,
  target: Pick<FigureTarget, 'folder' | 'slug'>
): Promise<CarefulRecord | null> {
  const raw = await readOptional(owner, carefulPaths(target).record)
  return raw ? parseCarefulRecord(raw) : null
}

export async function readCarefulCritic(
  owner: ProjectFileOwner,
  target: Pick<FigureTarget, 'folder' | 'slug'>
): Promise<CarefulCritic | null> {
  const raw = await readOptional(owner, carefulPaths(target).critic)
  return raw ? parseCarefulCritic(raw) : null
}

/** The sketches' scene texts by name (s1..s4), for thumbnails. */
export async function readCarefulSketches(
  owner: ProjectFileOwner,
  target: Pick<FigureTarget, 'folder' | 'slug'>
): Promise<{ name: string; text: string }[]> {
  const folder = carefulPaths(target).sketches
  const entries = (await listProjectDirectory(owner, folder).catch(() => null)) ?? []
  const names = entries
    .filter((entry) => !entry.isDirectory && /^s[1-4]\.excalidraw$/.test(entry.name))
    .map((entry) => entry.name)
    .toSorted()
  const sketches: { name: string; text: string }[] = []
  for (const name of names) {
    const scene = await readOptional(owner, `${folder}/${name}`)
    if (scene) {
      sketches.push({ name: name.replace(/\.excalidraw$/, ''), text: scene })
    }
  }
  return sketches
}

/** Writes the art director's address where `figures careful --review` reads it (kept out of Git). */
export async function writeCarefulCritic(
  owner: ProjectFileOwner,
  target: Pick<FigureTarget, 'folder' | 'slug'>,
  critic: CarefulCritic
): Promise<void> {
  const paths = carefulPaths(target)
  const entries = await listProjectDirectory(owner, paths.folder).catch(() => null)
  if (!entries?.some((entry) => entry.name === '.gitignore')) {
    await writeProjectText(owner, `${paths.folder}/.gitignore`, '*\n')
  }
  await writeProjectText(owner, paths.critic, `${JSON.stringify(critic, null, 2)}\n`)
}

/** The slugs whose record in `folder/.careful/` asks for an art director it does not have yet. */
export async function figuresWantingCritic(
  owner: ProjectFileOwner,
  folder: string
): Promise<string[]> {
  const entries = (await listProjectDirectory(owner, `${folder}/.careful`).catch(() => null)) ?? []
  const slugs = entries
    .filter((entry) => !entry.isDirectory && /^[^.].*\.json$/.test(entry.name))
    .map((entry) => entry.name.replace(/\.json$/, ''))
    .filter((slug) => !slug.endsWith('.critic'))
  const wanting: string[] = []
  for (const slug of slugs) {
    const record = await readCarefulRecord(owner, { folder, slug })
    if (!record?.wantCritic) {
      continue
    }
    const critic = await readCarefulCritic(owner, { folder, slug })
    if (!critic || critic.startedAt < record.wantCritic) {
      wanting.push(slug)
    }
  }
  return wanting
}

/** Where careful drawing is: what the panel says above its details. */
export function carefulPhase(record: CarefulRecord, pick: 'agent' | 'person'): string {
  if (record.done) {
    return `Finished after ${String(record.reviews.length)} art director round${record.reviews.length === 1 ? '' : 's'}`
  }
  if (!record.chose && record.sketches.length === 0) {
    return 'Sketching 3–4 compositions'
  }
  if (!record.chose) {
    return pick === 'person' ? 'Pick a sketch' : 'Choosing a sketch'
  }
  if (record.reviews.at(-1)?.verdict === 'ship') {
    return 'The art director says ship'
  }
  const next = Math.min(record.reviews.length + 1, record.rounds)
  return `Art director · round ${String(next)} of ${String(record.rounds)}`
}
