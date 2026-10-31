import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DeviceRegistry, type DeviceEntry } from './device-registry'
import { listPhoneAccessPairings, toPhoneRelayDevice } from './phone-access-devices'

const KEY_A = Buffer.alloc(32, 1).toString('base64')
const KEY_B = Buffer.alloc(32, 2).toString('base64')

function row(overrides: Partial<DeviceEntry>): DeviceEntry {
  return {
    deviceId: 'row',
    name: 'Row',
    token: 'token',
    scope: 'runtime',
    pairedAt: 1,
    lastSeenAt: 2,
    ...overrides
  }
}

describe('listPhoneAccessPairings', () => {
  const directories: string[] = []
  afterEach(() => {
    for (const directory of directories.splice(0)) {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  function registryDirectory(): string {
    const directory = mkdtempSync(join(tmpdir(), 'phone-access-devices-'))
    directories.push(directory)
    return directory
  }

  it('groups a marked link with its browsers, across a reload, and leaves the desktop out', () => {
    const directory = registryDirectory()
    const registry = new DeviceRegistry(directory)
    const desktop = registry.addDevice('Phone 10/29/2026', 'runtime', 'network', [
      'desktop-control'
    ])
    registry.updateLastSeen(desktop.deviceId)
    const link = registry.rotatePendingDevice(
      'Phone 10/30/2026',
      'runtime',
      'network',
      [],
      'phone-access'
    )
    registry.updateLastSeen(link.deviceId)
    const safari = registry.forkDeviceKey(link.deviceId, KEY_A, 'Web browser (iPhone)')
    registry.forkDeviceKey(link.deviceId, KEY_B, 'Web browser (iPhone)')
    expect(safari.pairingOrigin).toBe('phone-access')

    const pairings = listPhoneAccessPairings(new DeviceRegistry(directory).listDevices(), undefined)
    expect(pairings.map((pairing) => pairing.link.deviceId)).toEqual([link.deviceId])
    expect(pairings[0].installations).toHaveLength(2)
    expect(toPhoneRelayDevice(pairings[0])).toMatchObject({
      deviceId: link.deviceId,
      name: 'Web browser (iPhone)',
      pairedAt: link.pairedAt
    })
  })

  it('never lists the caller, even when its own link was minted for a phone', () => {
    const devices = [
      row({ deviceId: 'link', pairingOrigin: 'phone-access' }),
      row({
        deviceId: 'browser',
        token: undefined,
        credentialKind: 'device-key',
        forkedFrom: 'link',
        pairingOrigin: 'phone-access'
      }),
      row({ deviceId: 'other', pairingOrigin: 'phone-access' })
    ]
    expect(
      listPhoneAccessPairings(devices, 'browser').map((pairing) => pairing.link.deviceId)
    ).toEqual(['other'])
    expect(
      listPhoneAccessPairings(devices, 'link').map((pairing) => pairing.link.deviceId)
    ).toEqual(['other'])
  })

  it('keeps unmarked rows out unless they are an older build’s plain phone link', () => {
    const devices = [
      row({ deviceId: 'older-phone', name: 'Phone 10/29/2026' }),
      row({ deviceId: 'granted', name: 'Phone 10/29/2026', grants: ['desktop-control'] }),
      row({ deviceId: 'cli', name: 'CLI 10/29/2026' }),
      row({ deviceId: 'named', name: 'Phone of Alice' }),
      row({ deviceId: 'mobile', name: 'Phone 10/29/2026', scope: 'mobile' }),
      row({ deviceId: 'child', pairingOrigin: 'phone-access', parentDeviceId: 'older-phone' }),
      row({
        deviceId: 'orphan',
        token: undefined,
        credentialKind: 'device-key',
        forkedFrom: 'gone',
        pairingOrigin: 'phone-access'
      })
    ]
    expect(
      listPhoneAccessPairings(devices, undefined).map((pairing) => pairing.link.deviceId)
    ).toEqual(['older-phone', 'orphan'])
  })

  it('reports a link nobody opened as never seen', () => {
    const [pairing] = listPhoneAccessPairings(
      [row({ deviceId: 'pending', lastSeenAt: 0, pairingOrigin: 'phone-access' })],
      undefined
    )
    expect(toPhoneRelayDevice(pairing)).toMatchObject({ name: 'Row', lastSeenAt: null })
  })
})
