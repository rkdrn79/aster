import { describe, expect, it } from 'vitest'
import { translate } from './i18n'
import { PRODUCT_NAME } from '../../../shared/product-brand'

describe('translate product branding', () => {
  it('brands the template before interpolation so user data is shown verbatim', () => {
    expect(
      translate('test.branding.missingKey', 'Open {{repo}} on {{branch}} in Orca', {
        repo: 'orca-tools',
        branch: 'Orca-fix'
      })
    ).toBe(`Open orca-tools on Orca-fix in ${PRODUCT_NAME}`)
  })

  it('brands plural default templates the same way', () => {
    expect(
      translate('test.branding.missingPlural', 'Orca opened {{count}} tabs for {{owner}}', {
        count: 2,
        owner: 'Orca',
        defaultValue_other: 'Orca opened {{count}} tabs for {{owner}}'
      })
    ).toBe(`${PRODUCT_NAME} opened 2 tabs for Orca`)
  })
})
