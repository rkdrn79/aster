import { z } from 'zod'
import { OptionalBoolean, OptionalString, requiredString } from './rpc-param-primitives'

/** How a CLI caller names one Run: `<experiment>/<run-id>` inside a project on a host. */
const runTarget = {
  run: requiredString('Missing --run <experiment>/<run-id>'),
  /** Project root containing .aster/ (or research/ before ADR-004); on the SSH host when `server` is set. */
  project: OptionalString,
  /** SSH host label, ssh-config alias or target id; absent for this machine. */
  server: OptionalString,
  /** The caller's working directory; the nearest project catalog above it is the default project. */
  cwd: OptionalString
}

export const ResearchRunStatusParams = z.object(runTarget)

export const ResearchRunWatchParams = z.object({
  ...runTarget,
  on: z.array(z.string().min(1).max(400)).min(1, 'Missing --on <condition>').max(12),
  notify: z.enum(['self', 'none']).optional(),
  message: z.string().max(1000).optional(),
  /** Who to wake, from the calling terminal's environment; the host re-resolves it on delivery. */
  owner: z
    .object({
      terminalHandle: OptionalString,
      paneKey: OptionalString,
      agentSessionId: OptionalString
    })
    .optional()
})

export const ResearchRunWatchListParams = z.object({
  run: OptionalString,
  /** Include finished and cancelled watches from the last week. */
  all: OptionalBoolean
})

export const ResearchRunWatchCancelParams = z.object({
  id: requiredString('Missing watch id')
})
