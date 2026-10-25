import { dialog, type BrowserWindow, type MessageBoxOptions } from 'electron'
import { PRODUCT_NAME } from '../../shared/product-brand'

export type GpuFallbackRestartDecision = 'restart' | 'continue'

const GPU_FALLBACK_RESTART_OPTIONS: MessageBoxOptions = {
  type: 'warning',
  buttons: ['Restart in Safe Graphics Mode', 'Keep Running'],
  defaultId: 0,
  cancelId: 1,
  title: `Restart ${PRODUCT_NAME} in Safe Graphics Mode?`,
  message: `${PRODUCT_NAME}'s graphics process has crashed repeatedly.`,
  detail: `Safe graphics mode disables hardware acceleration and WebGL for this ${PRODUCT_NAME} version. Terminals and 3D content may render more slowly. Keep Running leaves graphics settings unchanged.`
}

export async function promptForGpuFallbackRestart(
  parentWindow?: BrowserWindow
): Promise<GpuFallbackRestartDecision> {
  const { response } = parentWindow
    ? await dialog.showMessageBox(parentWindow, GPU_FALLBACK_RESTART_OPTIONS)
    : await dialog.showMessageBox(GPU_FALLBACK_RESTART_OPTIONS)
  return response === 0 ? 'restart' : 'continue'
}
