import { spawnProcess } from '@orca/process-host'

export type LatexProcessOutcome =
  | 'exited'
  | 'cancelled'
  | 'idle-timeout'
  | 'max-duration'
  | 'output-limit'
  | 'spawn-error'

export type LatexProcessResult = {
  code: number | null
  outcome: LatexProcessOutcome
  /** The last `tailLength` characters of stdout and stderr, interleaved as they arrived. */
  output: string
  error?: string
}

const KILL_GRACE_MS = 3_000

/**
 * Runs the TeX engine with its output streamed as it arrives. Stops it after `idleTimeoutMs`
 * without output rather than at a fixed deadline, since a first build may download for minutes.
 */
export function runLatexProcess(spec: {
  program: string
  args: readonly string[]
  cwd: string
  signal: AbortSignal
  idleTimeoutMs: number
  maxDurationMs: number
  maxOutputChars: number
  tailLength: number
  onOutput: (text: string) => void
}): Promise<LatexProcessResult> {
  if (spec.signal.aborted) {
    return Promise.resolve({ code: null, outcome: 'cancelled', output: '' })
  }
  return new Promise((resolve) => {
    let outcome: LatexProcessOutcome = 'exited'
    let tail = ''
    let total = 0
    let settled = false
    let killTimer: ReturnType<typeof setTimeout> | undefined
    const child = spawnProcess({ program: spec.program, args: spec.args, cwd: spec.cwd })

    const stop = (reason: LatexProcessOutcome): void => {
      if (outcome !== 'exited' || settled) {
        return
      }
      outcome = reason
      child.kill('SIGTERM')
      killTimer = setTimeout(() => child.kill('SIGKILL'), KILL_GRACE_MS)
    }
    let idleTimer = setTimeout(() => stop('idle-timeout'), spec.idleTimeoutMs)
    const maxTimer = setTimeout(() => stop('max-duration'), spec.maxDurationMs)
    const onAbort = (): void => stop('cancelled')
    spec.signal.addEventListener('abort', onAbort, { once: true })

    const finish = (code: number | null, error?: string): void => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(idleTimer)
      clearTimeout(maxTimer)
      clearTimeout(killTimer)
      spec.signal.removeEventListener('abort', onAbort)
      resolve({
        code,
        outcome: error ? 'spawn-error' : outcome,
        output: tail,
        ...(error ? { error } : {})
      })
    }
    const onData = (text: string): void => {
      total += text.length
      tail = (tail + text).slice(-spec.tailLength)
      clearTimeout(idleTimer)
      idleTimer = setTimeout(() => stop('idle-timeout'), spec.idleTimeoutMs)
      spec.onOutput(text)
      if (total > spec.maxOutputChars) {
        stop('output-limit')
      }
    }
    for (const stream of [child.stdout, child.stderr]) {
      stream.setEncoding('utf8')
      stream.on('data', onData)
      stream.on('error', () => undefined)
    }
    child.stdin.on('error', () => undefined)
    // Why: TeX asks on the terminal after some errors; a closed stdin makes it stop instead.
    child.stdin.end()
    child.on('error', (error) => finish(null, error.message))
    child.on('close', (code) => finish(code))
  })
}
