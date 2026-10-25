import { PRODUCT_BRAND } from '../../../shared/product-brand'

// Why: publishing uploads to the product's own share service; a build that names none must not offer it.
export const ARTIFACT_SHARING_AVAILABLE = PRODUCT_BRAND.links.artifactsApi !== null

// Skill bundles are stored by the artifact service and linked from the share host.
export const SKILL_SHARING_AVAILABLE =
  ARTIFACT_SHARING_AVAILABLE && PRODUCT_BRAND.links.skillShareBase !== null
