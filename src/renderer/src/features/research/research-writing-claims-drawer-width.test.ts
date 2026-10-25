import { describe, expect, it } from 'vitest'
import { writingClaimsDrawerBounds } from './research-writing-claims-drawer-width'

describe('writingClaimsDrawerBounds', () => {
  it('lets the drawer grow only into width the shown panes do not need', () => {
    expect(writingClaimsDrawerBounds(1300, [true, true, true], true)).toEqual({
      minWidth: 280,
      maxWidth: 402
    })
    expect(writingClaimsDrawerBounds(1140, [false, true, true], true)).toEqual({
      minWidth: 280,
      maxWidth: 448
    })
  })

  it('shrinks the drawer with the panes when both cannot keep their minimums', () => {
    expect(writingClaimsDrawerBounds(1140, [true, true, true], true)).toEqual({
      minWidth: 270,
      maxWidth: 270
    })
  })

  it('reserves one pane in the narrow layout and floats only when no pane fits beside it', () => {
    expect(writingClaimsDrawerBounds(820, [true, true, true], false)).toEqual({
      minWidth: 280,
      maxWidth: 394
    })
    expect(writingClaimsDrawerBounds(486, [true, true, true], false)).not.toBeNull()
    expect(writingClaimsDrawerBounds(485, [true, true, true], false)).toBeNull()
  })
})
