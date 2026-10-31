import { app, ipcMain } from 'electron'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { parseRelayUrl } from '../../shared/relay-url'

// Why this path: relay/README.md and relay/scripts/setup.mjs save the user's relay URL here.
const SAVED_RELAY_URL_PATH = ['.config', 'aster-relay', 'relay-url']
// Why: each shell reads these inside double quotes, so a path holding one can't be quoted safely.
const UNQUOTABLE_PATH_CHARACTERS = /["$`%!\r\n]/

/** Packaged builds ship relay/ as the `aster-relay` resource; dev runs it from the source tree. */
function relaySetupScriptPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'aster-relay', 'scripts', 'setup.mjs')
    : path.join(app.getAppPath(), 'relay', 'scripts', 'setup.mjs')
}

/** The relay URL the setup saved, or null when it is missing or not a relay URL. */
export async function readSavedRelayUrl(home: string = homedir()): Promise<string | null> {
  try {
    return parseRelayUrl((await readFile(path.join(home, ...SAVED_RELAY_URL_PATH), 'utf8')).trim())
  } catch {
    return null
  }
}

/** A command every supported shell runs as is, or null when the bundled setup is unusable. */
export function relaySetupCommand(scriptPath: string = relaySetupScriptPath()): string | null {
  if (UNQUOTABLE_PATH_CHARACTERS.test(scriptPath) || !existsSync(scriptPath)) {
    return null
  }
  return `node "${scriptPath}"`
}

/** `phoneRelaySetup:*`: the local relay URL to prefill and the guided setup's terminal command. */
export function registerPhoneRelaySetupIpcHandlers(): void {
  ipcMain.handle('phoneRelaySetup:savedRelayUrl', () => readSavedRelayUrl())
  ipcMain.handle('phoneRelaySetup:setupCommand', () => relaySetupCommand())
}
