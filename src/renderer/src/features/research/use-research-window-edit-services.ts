import { useEffect } from 'react'
import { useAppStore } from '@/store'
import { useAppMenuPaste } from '@/hooks/useAppMenuPaste'
import { useAppMenuSelectionActions } from '@/hooks/useAppMenuSelectionActions'
import { useLargeTextControlPaste } from '@/hooks/useLargeTextControlPaste'
import {
  resolvePrimarySelectionMiddleClickPaste,
  usePrimarySelectionPaste
} from '@/hooks/usePrimarySelectionPaste'
import { useRadixBodyPointerEventsRecovery } from '@/hooks/useRadixBodyPointerEventsRecovery'
import { installOsFileDropCancellationGuard } from '@/lib/os-file-drop-cancellation-guard'
import { registerZoomIpcBridge } from '@/hooks/ipc-events/zoom-ipc-bridge'

/**
 * The editing plumbing the main window's shell mounts, for a project window. The app menu's
 * Copy, Paste and Select All, the right-click Paste and the zoom keys reach the focused window as
 * IPC; with no listener here they did nothing.
 */
export function useResearchWindowEditServices(): void {
  const primarySelectionMiddleClickPaste = useAppStore((state) =>
    resolvePrimarySelectionMiddleClickPaste(state.settings?.primarySelectionMiddleClickPaste)
  )
  useAppMenuPaste()
  useAppMenuSelectionActions()
  useLargeTextControlPaste()
  usePrimarySelectionPaste(primarySelectionMiddleClickPaste)
  useRadixBodyPointerEventsRecovery()
  // Why: a file dropped where nothing takes it must not load in place of the window's page.
  useEffect(() => installOsFileDropCancellationGuard(), [])
  // Why: the zoom keys and View menu zoom reach this window as IPC; zoom what has focus here.
  useEffect(() => {
    const unsubs: (() => void)[] = []
    registerZoomIpcBridge(unsubs)
    return () => {
      for (const unsub of unsubs) {
        unsub()
      }
    }
  }, [])
}
