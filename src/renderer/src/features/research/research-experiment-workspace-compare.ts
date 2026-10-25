import { useEffect, useMemo, useRef, useState } from 'react'
import { manifestSourceMismatch } from '../../../../shared/research/research-run-manifest'
import type { ResearchRunRecord } from '../../../../shared/research/research-records'
import { parseConfigSnapshot } from './research-config-comparison'
import type { ComparedRun } from './research-context-packet'
import {
  observeResearchRun,
  readResearchRunManifest,
  readResearchTextFile,
  researchSourceIdentityMismatch
} from './research-source-reader'
import { researchErrorText } from './research-error-text'

const NO_ENTRIES: ComparedRun[] = []

async function readComparedRun(run: ResearchRunRecord): Promise<ComparedRun> {
  const [config, manifestResult] = await Promise.all([
    run.configPath
      ? readResearchTextFile(run, run.configPath)
          .then(parseConfigSnapshot)
          .catch(() => null)
      : Promise.resolve(null),
    readResearchRunManifest(run).then(
      (manifest) => ({ manifest, manifestError: null }),
      (cause) => ({ manifest: null, manifestError: researchErrorText(cause) })
    )
  ])
  try {
    const observation = await observeResearchRun(run)
    const mismatch =
      researchSourceIdentityMismatch(run, observation) ??
      manifestSourceMismatch(manifestResult.manifest, observation.sourceRunId)
    if (mismatch) {
      return {
        run,
        observation: null,
        config: null,
        manifest: null,
        manifestError: mismatch,
        error: mismatch
      }
    }
    return { run, observation, config, ...manifestResult, error: null }
  } catch (cause) {
    return { run, observation: null, config, ...manifestResult, error: researchErrorText(cause) }
  }
}

/** Metrics, run.json and config of the compared Runs; read only while the Compare tab is open. */
export function useComparedRunEntries(
  runs: ResearchRunRecord[],
  enabled: boolean
): { entries: ComparedRun[]; loading: boolean } {
  const [loaded, setLoaded] = useState<ComparedRun[]>(NO_ENTRIES)
  const [loading, setLoading] = useState(false)
  const requestId = useRef(0)
  const key = enabled ? runs.map((run) => run.id).join(',') : ''

  useEffect(() => {
    const current = ++requestId.current
    if (!enabled || runs.length < 2) {
      setLoaded(NO_ENTRIES)
      setLoading(false)
      return
    }
    setLoading(true)
    void Promise.all(runs.map(readComparedRun)).then((results) => {
      if (current === requestId.current) {
        setLoaded(results)
        setLoading(false)
      }
    })
    return () => {
      requestId.current += 1
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- the Run list is rebuilt on every store write; only its IDs decide a reread.
  }, [key])

  const entries = useMemo(
    () =>
      loaded.length === runs.length &&
      loaded.every((entry, index) => entry.run.id === runs[index]?.id)
        ? loaded
        : NO_ENTRIES,
    [loaded, runs]
  )
  return { entries, loading }
}
