import { describe, expect, it } from 'vitest'
import { nativeChatApprovalCommandLine } from './native-chat-approval-command'

describe('nativeChatApprovalCommandLine', () => {
  const detail = JSON.stringify(
    { command: 'rm -rf runs/old', description: 'Remove old runs' },
    null,
    2
  )

  it('reads a shell call whose description the card already shows', () => {
    expect(nativeChatApprovalCommandLine(detail, 'Remove old runs')).toBe('rm -rf runs/old')
    expect(nativeChatApprovalCommandLine('{"command":"pnpm test"}', undefined)).toBe('pnpm test')
  })

  it('keeps any detail it would shorten as written', () => {
    // The description differs from the card's line, so dropping it would lose words.
    expect(nativeChatApprovalCommandLine(detail, undefined)).toBeNull()
    expect(nativeChatApprovalCommandLine(detail, 'Something else')).toBeNull()
    expect(
      nativeChatApprovalCommandLine('{"command":"sleep 9","timeout":5000}', undefined)
    ).toBeNull()
    expect(nativeChatApprovalCommandLine('{"command":""}', undefined)).toBeNull()
    expect(nativeChatApprovalCommandLine('{"file_path":"a.ts"}', undefined)).toBeNull()
    expect(nativeChatApprovalCommandLine('pnpm test', undefined)).toBeNull()
    expect(nativeChatApprovalCommandLine('{ not json', undefined)).toBeNull()
    expect(nativeChatApprovalCommandLine(undefined, undefined)).toBeNull()
  })
})
