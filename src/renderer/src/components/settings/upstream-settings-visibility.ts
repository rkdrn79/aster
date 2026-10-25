import { isUpstreamProduct } from '../../../../shared/product-brand'
import {
  ARTIFACT_SHARING_AVAILABLE,
  SKILL_SHARING_AVAILABLE
} from '@/lib/cloud-sharing-availability'

// Why: these settings drive the upstream app's own services (account, GitHub star prompt,
// release feed, usage telemetry and support uploads) and its onboarding checklist. A fork
// build has no endpoint for any of them, so showing them would offer controls that do nothing.
export const SHOW_UPSTREAM_SERVICE_SETTINGS = isUpstreamProduct()

const UPSTREAM_ONLY_SETTINGS_SECTION_IDS: ReadonlySet<string> = new Set([
  'orca-account',
  'setup-guide',
  'privacy',
  // Phone pairing: only the upstream app ships a phone client.
  'mobile'
])

// Sharing panes stay while the build names its own share service.
const SHARE_SERVICE_SECTION_AVAILABILITY: ReadonlyMap<string, boolean> = new Map([
  ['artifacts', ARTIFACT_SHARING_AVAILABLE],
  ['share-skills', SKILL_SHARING_AVAILABLE]
])

export function isUpstreamOnlySettingsSection(sectionId: string): boolean {
  if (SHARE_SERVICE_SECTION_AVAILABILITY.get(sectionId) === false) {
    return true
  }
  return !SHOW_UPSTREAM_SERVICE_SETTINGS && UPSTREAM_ONLY_SETTINGS_SECTION_IDS.has(sectionId)
}
