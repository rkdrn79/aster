import type * as ProductBrandModule from '../shared/product-brand'

async function productBrandWithFeed(
  importOriginal: () => Promise<typeof ProductBrandModule>,
  updateFeed: string | null
): Promise<typeof ProductBrandModule> {
  const actual = await importOriginal()
  const links = { ...actual.PRODUCT_BRAND.links, updateFeed }
  return { ...actual, PRODUCT_BRAND: { ...actual.PRODUCT_BRAND, links } }
}

/** Updater suites exercise the release path, which runs only when the product has its own feed. */
export function productBrandWithUpdateFeed(
  importOriginal: () => Promise<typeof ProductBrandModule>
): Promise<typeof ProductBrandModule> {
  return productBrandWithFeed(importOriginal, 'https://updates.example.test').then((module) => ({
    ...module,
    isUpstreamProduct: () => true
  }))
}

/** Pins the feed to null so the gate test holds whatever the shipped brand configures. */
export function productBrandWithoutUpdateFeed(
  importOriginal: () => Promise<typeof ProductBrandModule>
): Promise<typeof ProductBrandModule> {
  return productBrandWithFeed(importOriginal, null)
}

/** What's-new suites run only when the product has its own feed and changelog page. */
export async function productBrandWithWhatsNewFeed(
  importOriginal: () => Promise<typeof ProductBrandModule>
): Promise<typeof ProductBrandModule> {
  const actual = await importOriginal()
  const links = {
    ...actual.PRODUCT_BRAND.links,
    whatsNewFeed: 'https://whats-new.example.test',
    changelog: 'https://example.test/changelog'
  }
  return { ...actual, PRODUCT_BRAND: { ...actual.PRODUCT_BRAND, links } }
}
