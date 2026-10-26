/** launchd / systemd --user steps shared by the per-user services the CLI and app install. */
import { existsSync, rmSync } from 'node:fs'
import { RuntimeClientError } from './types'
import type { ServeServiceManager } from './serve-service-unit'

export type UserServiceRun = (
  program: string,
  args: string[]
) => Promise<{ code: number | null; out: string }>

export type UserServiceUnit = { manager: ServeServiceManager; name: string; unitPath: string }

export type UserServiceProbe = {
  /** Execution-boundary verdict: never guessed when the manager cannot answer. */
  verdict: 'live' | 'exited' | 'unverifiable'
  pid: number | null
  detail: string
}

export async function mustRunUserServiceCommand(
  run: UserServiceRun,
  program: string,
  args: string[]
): Promise<void> {
  const result = await run(program, args)
  if (result.code !== 0) {
    throw new RuntimeClientError(
      'service_manager_failed',
      `\`${[program, ...args].join(' ')}\` failed: ${result.out.trim() || `exit ${String(result.code)}`}`
    )
  }
}

/** Starts (or restarts) a unit whose file is already written. */
export async function loadUserService(
  run: UserServiceRun,
  uid: number,
  unit: UserServiceUnit
): Promise<void> {
  if (unit.manager === 'launchd') {
    await run('launchctl', ['bootout', `gui/${uid}/${unit.name}`])
    await mustRunUserServiceCommand(run, 'launchctl', ['bootstrap', `gui/${uid}`, unit.unitPath])
    return
  }
  await mustRunUserServiceCommand(run, 'systemctl', ['--user', 'daemon-reload'])
  await mustRunUserServiceCommand(run, 'systemctl', ['--user', 'enable', unit.name])
  await mustRunUserServiceCommand(run, 'systemctl', ['--user', 'restart', unit.name])
}

/** Stops the unit and removes its file; true when a file was there. */
export async function unloadUserService(
  run: UserServiceRun,
  uid: number,
  unit: UserServiceUnit
): Promise<boolean> {
  await (unit.manager === 'launchd'
    ? run('launchctl', ['bootout', `gui/${uid}/${unit.name}`])
    : run('systemctl', ['--user', 'disable', '--now', unit.name]))
  const existed = existsSync(unit.unitPath)
  rmSync(unit.unitPath, { force: true })
  if (unit.manager === 'systemd') {
    await run('systemctl', ['--user', 'daemon-reload'])
  }
  return existed
}

export async function probeUserService(
  run: UserServiceRun,
  uid: number,
  unit: Pick<UserServiceUnit, 'manager' | 'name'>
): Promise<UserServiceProbe> {
  if (unit.manager === 'launchd') {
    const result = await run('launchctl', ['print', `gui/${uid}/${unit.name}`])
    if (result.code === null) {
      return { verdict: 'unverifiable', pid: null, detail: 'launchctl did not answer' }
    }
    // Why only 113: other failures (no GUI session over SSH, a refused request) prove nothing.
    if (result.code === 113) {
      return { verdict: 'exited', pid: null, detail: 'not loaded' }
    }
    if (result.code !== 0) {
      return { verdict: 'unverifiable', pid: null, detail: result.out.trim() || 'launchctl failed' }
    }
    const pid = Number(/^\s*pid = (\d+)/m.exec(result.out)?.[1] ?? 0) || null
    const state = /^\s*state = (\S+)/m.exec(result.out)?.[1] ?? 'unknown'
    return { verdict: pid ? 'live' : 'exited', pid, detail: state }
  }
  const result = await run('systemctl', [
    '--user',
    'show',
    unit.name,
    '--property=ActiveState,SubState,MainPID'
  ])
  if (result.code !== 0) {
    return { verdict: 'unverifiable', pid: null, detail: 'systemctl --user did not answer' }
  }
  const field = (key: string): string =>
    new RegExp(`^${key}=(.*)$`, 'm').exec(result.out)?.[1] ?? ''
  const pid = Number(field('MainPID')) || null
  const active = field('ActiveState')
  return {
    verdict: active === 'active' && pid ? 'live' : 'exited',
    pid,
    detail: `${active || 'unknown'} (${field('SubState') || 'unknown'})`
  }
}
