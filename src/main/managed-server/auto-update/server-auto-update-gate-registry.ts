/**
 * The policy gate a connect's or tunnel restore's update check asks, published by the desktop's
 * server-update service. Without one (headless runtimes, tests) those checks update as before.
 */
import type {
  ManagedOrcadUpdateGate,
  ManagedOrcadUpdateGateInput
} from '../lifecycle/orcad-managed-auto-update'

type Gate = (input: ManagedOrcadUpdateGateInput) => ManagedOrcadUpdateGate

let gate: Gate | null = null

export function setServerAutoUpdateGate(next: Gate | null): void {
  gate = next
}

export function getServerAutoUpdateGate(): Gate | null {
  return gate
}

let policyChanged: (() => void) | null = null

/** The service re-checks every host when the global or a host's choice changes. */
export function setServerAutoUpdatePolicyListener(listener: (() => void) | null): void {
  policyChanged = listener
}

export function notifyServerAutoUpdatePolicyChanged(): void {
  policyChanged?.()
}
