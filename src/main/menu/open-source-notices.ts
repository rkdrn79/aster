import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app, dialog, shell } from 'electron'
import { PRODUCT_BRAND } from '../../shared/product-brand'
import { translateMain } from '../i18n/main-i18n'

export function openSourceNoticesPath(): string {
  // Packaged builds ship the notices as an extra resource; dev reads the checkout copy.
  const root = app.isPackaged ? process.resourcesPath : app.getAppPath()
  return join(root, PRODUCT_BRAND.licenseNoticeFile)
}

export async function showOpenSourceNotices(): Promise<void> {
  const path = openSourceNoticesPath()
  const openError = await shell.openPath(path)
  if (!openError) {
    return
  }
  const title = translateMain('menu.openSourceLicenses', 'Open-Source Licenses')
  // Why: Windows/Linux may have no handler for .md files, so show the text instead.
  try {
    const notices = await readFile(path, 'utf8')
    await dialog.showMessageBox({ type: 'info', title, message: title, detail: notices })
  } catch (error) {
    dialog.showErrorBox(title, error instanceof Error ? error.message : String(error))
  }
}

export function openSourceLicensesMenuItem(): Electron.MenuItemConstructorOptions {
  return {
    label: translateMain('menu.openSourceLicenses', 'Open-Source Licenses'),
    click: () => void showOpenSourceNotices()
  }
}
