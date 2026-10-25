import { useEffect, useState } from 'react'
import { z } from 'zod'
import type { ResearchRunRecord } from '../../../../shared/research/research-records'
import {
  researchRunMediaIndexSchema,
  type ResearchRunMediaItem
} from '../../../../shared/research/research-run-media'
import { installWindowVisibilityInterval } from '@/lib/window-visibility-interval'
import { researchErrorText } from './research-error-text'
import { catalogRunReference } from './use-research-harness-experiment'

export type RunMediaRead =
  | { status: 'loading' }
  /** Not a local research/ catalog Run, so the harness keeps no media index for it. */
  | { status: 'unindexed' }
  | { status: 'ready'; items: ResearchRunMediaItem[]; truncated: boolean }
  | { status: 'error'; error: string }

const RUNNING_POLL_MS = 20_000
const LOADING: RunMediaRead = { status: 'loading' }

const mediaRequestsSchema = z.array(
  z.object({
    runId: z.string(),
    workspacePath: z.string(),
    reference: z.string().nullable(),
    running: z.boolean()
  })
)
type MediaRequest = z.infer<typeof mediaRequestsSchema>[number]

function mediaRequest(run: ResearchRunRecord): MediaRequest {
  return {
    runId: run.id,
    workspacePath: run.workspacePath,
    reference: run.hostId === 'local' ? catalogRunReference(run) : null,
    running: run.execution === 'running'
  }
}

async function readRunMedia(request: MediaRequest): Promise<RunMediaRead> {
  const api = window.api.researchOrganize
  if (!request.reference || !api) {
    return { status: 'unindexed' }
  }
  try {
    const index = researchRunMediaIndexSchema.parse(
      await api.media({ workspacePath: request.workspacePath, run: request.reference })
    )
    return {
      status: 'ready',
      items: index.items.filter((item): item is ResearchRunMediaItem => item !== null),
      truncated: index.truncated
    }
  } catch (cause) {
    return { status: 'error', error: researchErrorText(cause) }
  }
}

/** Each Run's media index by Run ID, re-read every 20 s while any of them is running. */
export function useResearchRunMedia(
  runs: readonly ResearchRunRecord[]
): ReadonlyMap<string, RunMediaRead> {
  // Why a key: callers may pass a fresh array each render; only what the reads use restarts them.
  const requestKey = JSON.stringify(runs.map(mediaRequest))
  const [snapshot, setSnapshot] = useState<{
    key: string
    reads: ReadonlyMap<string, RunMediaRead>
  }>()
  useEffect(() => {
    const requests = mediaRequestsSchema.parse(JSON.parse(requestKey))
    let active = true
    const read = async (): Promise<void> => {
      const reads = await Promise.all(
        requests.map(async (request) => [request.runId, await readRunMedia(request)] as const)
      )
      if (active) {
        setSnapshot({ key: requestKey, reads: new Map(reads) })
      }
    }
    let stop = (): void => {}
    if (requests.some((request) => request.running && request.reference)) {
      stop = installWindowVisibilityInterval({
        run: () => void read(),
        intervalMs: RUNNING_POLL_MS
      })
    } else {
      void read()
    }
    return () => {
      active = false
      stop()
    }
  }, [requestKey])
  if (snapshot?.key === requestKey) {
    return snapshot.reads
  }
  // Why the last reads: a Run that just finished keeps its gallery while it is read again.
  return new Map(runs.map((run) => [run.id, snapshot?.reads.get(run.id) ?? LOADING]))
}
