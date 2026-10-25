import { quotePosixShell } from '../../shared/shell-argument-quoting'
import {
  RESEARCH_RECORD_ROOTS,
  RESEARCH_RUN_FILE_NAMES,
  researchRunPosixPaths,
  type ResearchRunLocation
} from '../../shared/research/research-run-reference'

export type RemoteRunFiles = {
  /** Shell that sets `$R` to the record tree when the location does not know it. */
  prelude: string | null
  /** The record tree as a shell word: a literal root, or `"$R"`. */
  root: string
  manifest: string
  metrics: string
  log: string
}

/**
 * Shell words for a remote Run's files. An unknown record tree is chosen on the host in the same
 * command: `.aster/` when its catalog exists, else a pre-ADR-004 `research/` with one.
 */
export function remoteRunFiles(location: ResearchRunLocation): RemoteRunFiles {
  if (location.recordRoot) {
    const paths = researchRunPosixPaths(location)
    return {
      prelude: null,
      root: quotePosixShell(location.recordRoot),
      manifest: quotePosixShell(paths.manifest),
      metrics: quotePosixShell(paths.metrics),
      log: quotePosixShell(paths.log)
    }
  }
  const project = quotePosixShell(location.projectPath.replace(/\/+$/, ''))
  const [modern, legacy] = RESEARCH_RECORD_ROOTS
  const dir = `${project}/"$R"/experiments/${quotePosixShell(location.experiment)}/runs/${quotePosixShell(location.runId)}`
  return {
    prelude: `R=${modern}; [ -f ${project}/${modern}/project.json ] || { [ -f ${project}/${legacy}/project.json ] && R=${legacy}; }`,
    root: '"$R"',
    manifest: `${dir}/${RESEARCH_RUN_FILE_NAMES.manifest}`,
    metrics: `${dir}/${RESEARCH_RUN_FILE_NAMES.metrics}`,
    log: `${dir}/${RESEARCH_RUN_FILE_NAMES.log}`
  }
}
