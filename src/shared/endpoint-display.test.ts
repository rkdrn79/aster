import { describe, expect, it } from 'vitest'
import { maskEndpointSecrets } from './endpoint-display'

describe('maskEndpointSecrets', () => {
  it('hides a relay key and the other query values but keeps where it points', () => {
    expect(
      maskEndpointSecrets('wss://relay.example.workers.dev/ws?key=s3cr3t-Key_1&serverId=abc&v=2')
    ).toBe('wss://relay.example.workers.dev/ws?key=•••&serverId=•••&v=•••')
  })

  it('works on an endpoint shown without its scheme', () => {
    expect(maskEndpointSecrets('127.0.0.1:8787/ws?key=abc#frag')).toBe(
      '127.0.0.1:8787/ws?key=•••#frag'
    )
  })

  it('hides a password in the address', () => {
    expect(maskEndpointSecrets('wss://me:hunter2@host/ws')).toBe('wss://me:•••@host/ws')
  })

  it('leaves an endpoint without secrets alone', () => {
    expect(maskEndpointSecrets('ws://192.168.0.4:6768')).toBe('ws://192.168.0.4:6768')
  })
})
