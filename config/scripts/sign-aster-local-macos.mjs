import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

if (process.platform === 'darwin') {
  const repoRoot = path.resolve(import.meta.dirname, '../..')
  const candidates = [
    path.join(repoRoot, 'dist', `mac-${process.arch}`, 'Aster.app'),
    path.join(repoRoot, 'dist', 'mac', 'Aster.app')
  ]
  const appPath = candidates.find((candidate) => existsSync(candidate))
  if (!appPath) {
    throw new Error('The packaged Aster.app was not found for local code signing.')
  }
  // A local --dir build has no Apple release identity. Sign every nested framework
  // ad hoc so macOS can launch it; a distributable release needs its own signing flow.
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' })
  execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' })
  process.stdout.write(`Verified local Aster app signature: ${appPath}\n`)
}
