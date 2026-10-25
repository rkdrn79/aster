import type { Plugin } from 'vite'
import productBrand from '../../src/shared/product-brand.json'

// Static HTML titles read the brand at build time so the name lives only in product-brand.json.
export function createProductNameHtmlPlugin(): Plugin {
  return {
    name: 'product-name-html',
    transformIndexHtml: (html) => html.replaceAll('__PRODUCT_NAME__', productBrand.name)
  }
}
