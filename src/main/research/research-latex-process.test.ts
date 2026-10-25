import { describe, expect, it } from 'vitest'
import { runLatexProcess } from './research-latex-process'

function run(script: string, overrides: Partial<Parameters<typeof runLatexProcess>[0]> = {}) {
  const chunks: string[] = []
  const result = runLatexProcess({
    program: process.execPath,
    args: ['-e', script],
    cwd: process.cwd(),
    signal: new AbortController().signal,
    idleTimeoutMs: 5_000,
    maxDurationMs: 10_000,
    maxOutputChars: 1_000_000,
    tailLength: 1_000,
    onOutput: (text) => chunks.push(text),
    ...overrides
  })
  return { result, chunks }
}

describe('LaTeX engine process', () => {
  it('streams stdout and stderr and reports the exit code', async () => {
    const { result, chunks } = run(
      'process.stdout.write("note: Running TeX ...\\n"); process.stderr.write("error: main.tex:3: x\\n"); process.exit(1)'
    )
    const done = await result
    expect(done).toMatchObject({ code: 1, outcome: 'exited' })
    expect(chunks.join('')).toContain('note: Running TeX')
    expect(done.output).toContain('error: main.tex:3: x')
  })

  it('stops a build that goes quiet, not one that keeps printing', async () => {
    const chatty = run(
      'let n = 0; const t = setInterval(() => { process.stdout.write("note: downloading f" + n + "\\n"); if (++n === 6) { clearInterval(t) } }, 50)',
      { idleTimeoutMs: 200 }
    )
    expect((await chatty.result).outcome).toBe('exited')
    const quiet = run('setTimeout(() => {}, 5000)', { idleTimeoutMs: 200 })
    expect((await quiet.result).outcome).toBe('idle-timeout')
  })

  it('kills the engine when the build is cancelled', async () => {
    const controller = new AbortController()
    const { result } = run(
      'process.stdout.write("note: Running TeX ...\\n"); setTimeout(() => {}, 5000)',
      {
        signal: controller.signal,
        onOutput: () => controller.abort()
      }
    )
    expect((await result).outcome).toBe('cancelled')
  })
})
