// Finding a Python that can import what a helper needs (wandb for the W&B mirror, matplotlib and
// numpy for plots), on this computer or the SSH host the harness runs on.
import { spawn } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const PROBE_TIMEOUT_MS = 30_000
// Common conda roots; `~/.conda/envs` is where `conda create` puts envs on shared servers.
const CONDA_ENV_ROOTS = ['.conda/envs', 'miniconda3/envs', 'anaconda3/envs', 'miniforge3/envs']

/** Whether `command` is Python 3.6 or newer and imports every module in `modules`. */
export function probePython(command, modules) {
  return new Promise((resolve) => {
    let child
    try {
      // Why the version check: an old `python` may be Python 2 with a Python 2 package.
      child = spawn(
        command,
        [
          '-c',
          `import sys, ${modules.join(', ')}; sys.exit(0 if sys.version_info >= (3, 6) else 1)`
        ],
        { stdio: 'ignore', windowsHide: true }
      )
    } catch {
      resolve(false)
      return
    }
    // Why our own timer: spawn's `timeout` outlives a command that never started, which kept
    // the CLI alive 30 s after it had answered.
    const timer = setTimeout(() => child.kill('SIGKILL'), PROBE_TIMEOUT_MS)
    const settle = (ok) => {
      clearTimeout(timer)
      resolve(ok)
    }
    child.once('error', () => settle(false))
    child.once('close', (code) => settle(code === 0))
  })
}

async function condaPythons(home, platform) {
  const found = []
  for (const root of CONDA_ENV_ROOTS) {
    const envs = await readdir(path.join(home, root), { withFileTypes: true }).catch(() => [])
    for (const entry of envs
      .filter((item) => item.isDirectory() || item.isSymbolicLink())
      .map((item) => item.name)
      .sort()) {
      found.push(
        platform === 'win32'
          ? path.join(home, root, entry, 'python.exe')
          : path.join(home, root, entry, 'bin', 'python')
      )
    }
  }
  return found
}

function expandHome(command, home) {
  return command === '~' || command.startsWith('~/') ? path.join(home, command.slice(1)) : command
}

/**
 * Finds a Python that imports `modules`: the explicit one asked for, then `python3` and `python`
 * on PATH, then conda envs. The answer is cached per explicit choice for the life of the process.
 */
export function createPythonFinder({
  modules,
  probe = probePython,
  listCondaPythons = condaPythons,
  home = os.homedir(),
  platform = process.platform
}) {
  const cache = new Map()
  async function discover(explicit) {
    const onPath = platform === 'win32' ? ['python', 'python3'] : ['python3', 'python']
    for (const candidate of [explicit ? expandHome(explicit, home) : null, ...onPath]) {
      if (candidate && (await probe(candidate, modules))) {
        return candidate
      }
    }
    for (const candidate of await listCondaPythons(home, platform)) {
      if (await probe(candidate, modules)) {
        return candidate
      }
    }
    return null
  }
  return (explicit = null) => {
    const key = explicit ?? ''
    if (!cache.has(key)) {
      cache.set(key, discover(explicit))
    }
    return cache.get(key)
  }
}
