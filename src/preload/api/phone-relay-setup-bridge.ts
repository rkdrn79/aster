import { ipcRenderer } from 'electron'

/** This computer's relay setup: the URL it saved and the command that deploys one. */
export type PhoneRelaySetupApi = {
  /** The relay URL in ~/.config/aster-relay/relay-url, or null when none is saved. */
  savedRelayUrl: () => Promise<string | null>
  /** The terminal command that runs the bundled relay setup, or null when it can't run here. */
  setupCommand: () => Promise<string | null>
}

export const phoneRelaySetupApi: PhoneRelaySetupApi = {
  savedRelayUrl: () => ipcRenderer.invoke('phoneRelaySetup:savedRelayUrl'),
  setupCommand: () => ipcRenderer.invoke('phoneRelaySetup:setupCommand')
}
