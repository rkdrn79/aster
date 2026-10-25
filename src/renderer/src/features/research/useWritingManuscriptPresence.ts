import { useEffect, useState } from 'react'
import type { ExperimentRecord } from '../../../../shared/research/research-records'
import { resolveManuscriptFile, statManuscriptSource } from './research-writing-source'

/** Whether the main .tex exists; hosts that cannot be asked count as present. */
export function useManuscriptPresence(
  record: ExperimentRecord,
  path: string | null,
  refreshKey: number
): 'checking' | 'present' | 'missing' {
  const [presence, setPresence] = useState<{ path: string; present: boolean } | null>(null)
  useEffect(() => {
    if (!path) {
      return
    }
    let live = true
    // Why a promise chain: a path outside the workspace throws, and should read as not present.
    void Promise.resolve()
      .then(() => statManuscriptSource(record, resolveManuscriptFile(record, path, '.tex')))
      .then(
        () => live && setPresence({ path, present: true }),
        (cause: unknown) =>
          live &&
          setPresence({ path, present: !/ENOENT|no such file|not found/i.test(String(cause)) })
      )
    return () => {
      live = false
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- the workspace identity, not the record object, decides the file.
  }, [record.hostId, record.workspaceId, record.workspacePath, path, refreshKey])
  if (!path || presence?.path !== path) {
    return 'checking'
  }
  return presence.present ? 'present' : 'missing'
}
