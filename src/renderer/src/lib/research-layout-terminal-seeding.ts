import type { GlobalSettings } from '../../../shared/global-settings-types'

/** The Research Workbench is chat-first: a terminal opens there only when the user or a launch asks. */
export function researchLayoutSkipsUnrequestedTerminals(
  settings: Pick<GlobalSettings, 'researchUiEnabled'> | null | undefined
): boolean {
  return settings?.researchUiEnabled === true
}
