import { useEffect } from 'react'
import { create } from 'zustand'
import { rebuttalOwnerKey, type RebuttalOwner } from './research-rebuttal-files'
import {
  listRebuttalSummaries,
  loadRebuttalSnapshot,
  rebuttalVersion,
  type RebuttalSnapshot,
  type RebuttalSummary
} from './research-rebuttal-snapshot'

type RebuttalState = {
  ownerKey: string | null
  folder: string | null
  rebuttals: RebuttalSummary[]
  selectedSlug: string | null
  snapshot: RebuttalSnapshot | null
  loading: boolean
  error: string | null
}

const INITIAL: RebuttalState = {
  ownerKey: null,
  folder: null,
  rebuttals: [],
  selectedSlug: null,
  snapshot: null,
  loading: false,
  error: null
}
const SELECTED_KEY = 'aster.research-rebuttal-selected.v1'
const REFRESH_MS = 3000

export const useResearchRebuttal = create<RebuttalState>(() => INITIAL)

let loadToken = 0

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function rememberedSlug(ownerKey: string): string | null {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(SELECTED_KEY) ?? '{}')
    const slug: unknown = saved && typeof saved === 'object' ? Reflect.get(saved, ownerKey) : null
    return typeof slug === 'string' ? slug : null
  } catch {
    return null
  }
}

function rememberSlug(ownerKey: string, slug: string): void {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(SELECTED_KEY) ?? '{}')
    const next = saved && typeof saved === 'object' && !Array.isArray(saved) ? { ...saved } : {}
    localStorage.setItem(SELECTED_KEY, JSON.stringify({ ...next, [ownerKey]: slug }))
  } catch {
    // Why: without storage the page just opens the first rebuttal next time.
  }
}

/** Lists the project's rebuttals and opens the one picked last time (or the first). */
export async function openRebuttalProject(
  owner: RebuttalOwner,
  preferSlug?: string
): Promise<void> {
  const token = ++loadToken
  const ownerKey = rebuttalOwnerKey(owner)
  const sameOwner = useResearchRebuttal.getState().ownerKey === ownerKey
  useResearchRebuttal.setState({
    ...(sameOwner ? {} : INITIAL),
    ownerKey,
    loading: true,
    error: null
  })
  try {
    const { folder, rebuttals } = await listRebuttalSummaries(owner)
    const wanted =
      preferSlug ?? useResearchRebuttal.getState().selectedSlug ?? rememberedSlug(ownerKey)
    const slug =
      rebuttals.find((entry) => entry.slug === wanted)?.slug ?? rebuttals[0]?.slug ?? null
    const snapshot = slug ? await loadRebuttalSnapshot(owner, folder, slug) : null
    if (token !== loadToken) {
      return
    }
    if (slug) {
      rememberSlug(ownerKey, slug)
    }
    useResearchRebuttal.setState({
      folder,
      rebuttals,
      selectedSlug: slug,
      snapshot,
      loading: false,
      error: null
    })
  } catch (error) {
    if (token === loadToken) {
      useResearchRebuttal.setState({ loading: false, error: errorText(error) })
    }
  }
}

export function selectRebuttal(owner: RebuttalOwner, slug: string): Promise<void> {
  useResearchRebuttal.setState({ selectedSlug: slug, snapshot: null })
  return openRebuttalProject(owner, slug)
}

/** Rereads the selected rebuttal; returns it so a mutation can work on what is on disk now. */
export async function reloadRebuttal(owner: RebuttalOwner): Promise<RebuttalSnapshot> {
  const { folder, selectedSlug, ownerKey } = useResearchRebuttal.getState()
  if (!folder || !selectedSlug || ownerKey !== rebuttalOwnerKey(owner)) {
    throw new Error('Choose a rebuttal first.')
  }
  const snapshot = await loadRebuttalSnapshot(owner, folder, selectedSlug)
  const current = useResearchRebuttal.getState()
  if (current.ownerKey === ownerKey && current.selectedSlug === selectedSlug) {
    useResearchRebuttal.setState({ snapshot, error: null })
  }
  return snapshot
}

async function refreshIfChanged(owner: RebuttalOwner): Promise<void> {
  const { snapshot, loading } = useResearchRebuttal.getState()
  if (loading || !snapshot || rebuttalOwnerKey(snapshot.owner) !== rebuttalOwnerKey(owner)) {
    return
  }
  try {
    if ((await rebuttalVersion(owner, snapshot.directory)) !== snapshot.version) {
      await reloadRebuttal(owner)
    }
  } catch {
    // Why: a host that is briefly away is checked again on the next tick.
  }
}

/** Follows the agent's writes while the page is on screen. */
export function useRebuttalAutoRefresh(owner: RebuttalOwner | null, active: boolean): void {
  useEffect(() => {
    if (!owner || !active) {
      return
    }
    const check = (): void => void refreshIfChanged(owner)
    const timer = window.setInterval(check, REFRESH_MS)
    window.addEventListener('focus', check)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', check)
    }
  }, [owner, active])
}
