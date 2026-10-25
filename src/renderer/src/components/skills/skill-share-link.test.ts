import { describe, expect, it } from 'vitest'
import { parseSkillShareId } from './skill-share-link'
import { PRODUCT_BRAND } from '../../../../shared/product-brand'

describe('parseSkillShareId', () => {
  it('accepts deep links in the product and legacy schemes and bare identifiers', () => {
    expect(parseSkillShareId('share_123')).toBe('share_123')
    expect(parseSkillShareId(`${PRODUCT_BRAND.urlScheme}://skills/share/share_123`)).toBe(
      'share_123'
    )
    expect(parseSkillShareId('orca://skills/share/share_123')).toBe('share_123')
  })

  it('rejects share hosts the product does not own, attacker origins and lookalike paths', () => {
    expect(parseSkillShareId('https://share.onorca.dev/skills/share/share_123/')).toBeNull()
    expect(parseSkillShareId('https://attacker.test/skills/share/share_123')).toBeNull()
    expect(parseSkillShareId('orca://skills/share/share_123/more')).toBeNull()
    expect(parseSkillShareId('javascript:share_123')).toBeNull()
  })
})
