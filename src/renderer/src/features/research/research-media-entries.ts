import type { ResearchRunRecord } from '../../../../shared/research/research-records'
import type {
  ResearchMediaKind,
  ResearchRunMediaItem
} from '../../../../shared/research/research-run-media'
import { mediaFileName } from './research-media-groups'
import type { ResearchMediaEntry } from './research-media-players'
import { sampleMediaFiles, type QualitativeSample } from './research-qualitative-outputs'

type MediaRun = Pick<ResearchRunRecord, 'id' | 'name' | 'workspacePath' | 'workspaceId' | 'hostId'>

export const MEDIA_KIND_NAMES: Record<ResearchMediaKind, string> = {
  image: 'Image',
  video: 'Video',
  audio: 'Audio'
}

/**
 * An index file as a Run's gallery or a cross-Run comparison shows it. `runName` adds the Run to
 * the description, for views that mix Runs; `syncKey` applies to videos only.
 */
export function runMediaEntry(
  run: MediaRun,
  item: ResearchRunMediaItem,
  options: { runName?: boolean; syncKey?: string } = {}
): ResearchMediaEntry {
  const caption = item.sampleId || mediaFileName(item.path)
  const description = [
    options.runName ? run.name : null,
    item.label ?? MEDIA_KIND_NAMES[item.kind],
    item.step === null ? null : `step ${item.step}`,
    caption
  ]
    .filter((part): part is string => Boolean(part))
    .join(', ')
  return {
    key: `${run.id}\u0000${item.path}`,
    source: run,
    kind: item.kind,
    paths: [item.path],
    caption,
    description,
    hint: item.path,
    syncKey: item.kind === 'video' ? options.syncKey : undefined
  }
}

/**
 * A sample's media for its card. Nothing names the Run or the file path, so a blind A/B card
 * stays blind: captions are the row's labels or the kind, and `cardTitle` is the caller's
 * (already blind) card title. A video's sync key is the same for every Run's card of the sample,
 * so A/B players play together.
 */
export function sampleMediaEntries(
  run: MediaRun & Pick<ResearchRunRecord, 'outputsPath'>,
  sample: QualitativeSample,
  cardTitle: string
): ResearchMediaEntry[] {
  const files = sampleMediaFiles(run, sample)
  const totals: Record<ResearchMediaKind, number> = { image: 0, video: 0, audio: 0 }
  for (const file of files) {
    totals[file.kind] += 1
  }
  const ordinals: Record<ResearchMediaKind, number> = { image: 0, video: 0, audio: 0 }
  return files.map((file, position) => {
    ordinals[file.kind] += 1
    const kindName = MEDIA_KIND_NAMES[file.kind]
    const caption =
      file.label ?? (totals[file.kind] > 1 ? `${kindName} ${ordinals[file.kind]}` : kindName)
    const slot = file.label ? ['label', file.label] : [file.kind, ordinals[file.kind]]
    return {
      key: `${position}\u0000${file.projectPaths[0] ?? ''}`,
      source: run,
      kind: file.kind,
      paths: file.projectPaths,
      caption,
      description: `${caption}, ${cardTitle}`,
      syncKey:
        file.kind === 'video' ? JSON.stringify(['sample', sample.sampleId, ...slot]) : undefined
    }
  })
}
