import { translate } from './i18n'

// Kept for existing call sites; translate() already brands product copy.
export function translateAsterProductCopy(key: string, fallback: string): string {
  return translate(key, fallback)
}
