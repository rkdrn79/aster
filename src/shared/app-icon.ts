export const APP_ICON_OPTIONS = [{ id: 'classic', label: 'Aster' }] as const

export type AppIconId = 'classic' | 'watercolor' | 'blue'

export const DEFAULT_APP_ICON_ID: AppIconId = 'classic'

export function normalizeAppIconId(value: unknown): AppIconId {
  return value === 'watercolor' || value === 'blue' ? value : DEFAULT_APP_ICON_ID
}
