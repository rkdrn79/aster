/* oxlint-disable react-doctor/no-adjust-state-on-prop-change -- Why: editor tab ownership and manuscript bytes resolve through the existing workspace/runtime services after the selected source changes. */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { MoreHorizontal } from 'lucide-react'
import type { ExperimentRecord } from '../../../../shared/research/research-records'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useResearchRecords } from './research-records-store'
import { ResearchWritingFileForm } from './research-writing-file-form'
import { openManuscriptForWriting } from './research-writing-open-editor'
import { ResearchWritingAgentPane } from './ResearchWritingAgentPane'
import { ResearchWritingPdfPane } from './ResearchWritingPdfPane'
import { ResearchWritingPaneTabs, ResearchWritingPanelToggles } from './ResearchWritingPanelToggles'
import { ResearchPageHeader } from './ResearchPageLayout'
import { ResearchWritingSetup } from './ResearchWritingSetup'
import { ResearchWritingSourcePane } from './ResearchWritingSourcePane'
import { ResearchWritingSplitLayout, type WritingPane } from './ResearchWritingSplitLayout'
import {
  readWritingPaneOrder,
  readWritingPaneVisibility,
  saveWritingPaneOrder,
  saveWritingPaneVisibility,
  swapWritingPaneOrder,
  toggleWritingPaneVisibility,
  type WritingPaneIndex
} from './research-writing-pane-ratios'
import {
  createProjectManuscript,
  readCatalogManuscript,
  saveProjectManuscript,
  type WritingProjectScope
} from './research-writing-project'
import { resolveManuscriptFile } from './research-writing-source'
import { useManuscriptPresence } from './useWritingManuscriptPresence'
import { useWritingSynctexNavigation } from './research-writing-synctex-navigation'
import { useWritingSourceExternalRefresh } from './useWritingSourceExternalRefresh'
import { useWritingAgentFocus } from './useWritingAgentFocus'
import { useResearchClaims } from './use-research-claims'
import { ResearchClaimsChip } from './ResearchClaimsPanel'
import { askWritingAgentAboutClaim, updateClaimText } from './research-claims-apply'
import { ResearchWritingClaimsSplit } from './ResearchWritingClaimsSplit'

function subscribeWideLayout(onChange: () => void): () => void {
  const query = window.matchMedia('(min-width: 1280px)')
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

function wideLayoutSnapshot(): boolean {
  return window.matchMedia('(min-width: 1280px)').matches
}

/** The project's manuscript: TeX source, compiled PDF, and Writing chat, side by side. */
export function ResearchWritingWorkspace({
  record,
  scope,
  projectOnly,
  onManuscriptChanged
}: {
  /** The project's Writing owner, or a stand-in for a project without Experiments. */
  record: ExperimentRecord
  scope: WritingProjectScope
  projectOnly: boolean
  onManuscriptChanged?: () => void
}): React.JSX.Element {
  const manuscript = record.manuscript
  const [sourcePath, setSourcePath] = useState(manuscript?.sourcePath ?? '')
  const [formOpen, setFormOpen] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [choosing, setChoosing] = useState<'source' | null>(null)
  const [busy, setBusy] = useState<'catalog' | 'create' | 'save' | null>(null)
  const [presenceKey, setPresenceKey] = useState(0)
  const [selectedTexPath, setSelectedTexPath] = useState(manuscript?.sourcePath ?? '')
  const [editorBinding, setEditorBinding] = useState<{ fileId: string; tabId: string } | null>(null)
  const [activePane, setActivePane] = useState<WritingPane>('source')
  const [visiblePanes, setVisiblePanes] = useState(() => readWritingPaneVisibility(record.id))
  const [paneOrder, setPaneOrder] = useState(() => readWritingPaneOrder(record.id))
  useWritingAgentFocus(record, setActivePane, setVisiblePanes)
  const wideLayout = useSyncExternalStore(subscribeWideLayout, wideLayoutSnapshot, () => false)
  const [claimsOpen, setClaimsOpen] = useState(false)
  const claims = useResearchClaims(record, claimsOpen)
  const openKey = useRef<string | null>(null)
  const recordsError = useResearchRecords((state) => state.error)
  const presence = useManuscriptPresence(record, manuscript?.sourcePath ?? null, presenceKey)
  const rootFile = useMemo(() => {
    if (!manuscript || presence !== 'present') {
      return null
    }
    try {
      return resolveManuscriptFile(record, manuscript.sourcePath, '.tex')
    } catch {
      return null
    }
  }, [record, manuscript, presence])
  const sourceFile = useMemo(() => {
    if (!manuscript || !rootFile) {
      return null
    }
    try {
      return resolveManuscriptFile(record, selectedTexPath || manuscript.sourcePath, '.tex')
    } catch {
      return null
    }
  }, [record, manuscript, rootFile, selectedTexPath])
  useEffect(() => {
    setSelectedTexPath(manuscript?.sourcePath ?? '')
    setSourcePath(manuscript?.sourcePath ?? '')
  }, [manuscript?.sourcePath])

  useEffect(() => {
    if (!sourceFile) {
      setEditorBinding(null)
      openKey.current = null
      return
    }
    const key = `${record.hostId}:${record.workspaceId}:${sourceFile.absolutePath}`
    if (openKey.current === key) {
      return
    }
    openKey.current = key
    const result = openManuscriptForWriting(record, sourceFile)
    if ('error' in result) {
      setFormError(result.error)
      setEditorBinding(null)
      openKey.current = null
    } else {
      setEditorBinding(result)
      setFormError(null)
    }
  }, [record, sourceFile])
  useWritingSourceExternalRefresh(
    record,
    sourceFile,
    editorBinding?.fileId ?? null,
    wideLayout ? visiblePanes[1] : activePane === 'source'
  )

  function showPane(pane: WritingPane): void {
    const index = pane === 'agent' ? 0 : pane === 'source' ? 1 : 2
    if (!wideLayout) {
      setActivePane(pane)
    } else if (!visiblePanes[index]) {
      togglePane(index)
    }
  }

  const synctex = useWritingSynctexNavigation({
    experiment: record,
    showPane,
    selectTexFile: setSelectedTexPath
  })
  const synctexAvailable = !projectOnly && record.hostId === 'local'

  function togglePane(index: 0 | 1 | 2): void {
    const next = toggleWritingPaneVisibility(visiblePanes, index)
    if (next === visiblePanes) {
      return
    }
    setVisiblePanes(next)
    saveWritingPaneVisibility(record.id, next)
  }

  function reorderPanes(first: WritingPaneIndex, second: WritingPaneIndex): void {
    const next = swapWritingPaneOrder(paneOrder, first, second)
    if (next === paneOrder) {
      return
    }
    setPaneOrder(next)
    saveWritingPaneOrder(record.id, next)
  }

  async function chooseSource(): Promise<void> {
    if (record.hostId !== 'local' || choosing) {
      return
    }
    setChoosing('source')
    setFormError(null)
    try {
      const picked = await window.api.shell.pickAttachment()
      if (picked) {
        setSourcePath(resolveManuscriptFile(record, picked, '.tex').relativePath)
      }
    } catch (cause) {
      setFormError(String(cause))
    } finally {
      setChoosing(null)
    }
  }

  async function runManuscriptChange(
    kind: 'create' | 'save',
    change: () => Promise<string>
  ): Promise<void> {
    if (busy) {
      return
    }
    setBusy(kind)
    setFormError(null)
    try {
      const path = await change()
      setFormOpen(false)
      setSelectedTexPath(path)
      setPresenceKey((value) => value + 1)
      onManuscriptChanged?.()
    } catch (cause) {
      setFormError(
        `${kind === 'create' ? 'The manuscript was not created.' : 'Manuscript settings were not saved.'} ${String(cause)}`
      )
    } finally {
      setBusy(null)
    }
  }

  async function loadProjectCatalog(): Promise<void> {
    if (busy) {
      return
    }
    setBusy('catalog')
    setFormError(null)
    const catalogManuscript = await readCatalogManuscript(scope)
    setBusy(null)
    if (catalogManuscript) {
      setSourcePath(catalogManuscript.sourcePath)
    } else {
      setFormError('This project has no catalog naming its main file.')
    }
    setFormOpen(true)
  }

  const needsSetup = !manuscript || presence === 'missing' || (presence === 'present' && !rootFile)
  return (
    <section
      className="flex min-h-0 min-w-0 flex-1 flex-col bg-background text-foreground"
      aria-label="Research writing"
    >
      <ResearchPageHeader
        title="Writing"
        context={rootFile?.relativePath}
        actions={
          <>
            {sourceFile && claims.available ? (
              <ResearchClaimsChip
                audit={claims.audit}
                open={claimsOpen}
                onToggle={() => setClaimsOpen((open) => !open)}
              />
            ) : null}
            {sourceFile && (
              <ResearchWritingPanelToggles
                wide={wideLayout}
                visiblePanes={visiblePanes}
                order={paneOrder}
                onToggle={togglePane}
                onReorder={reorderPanes}
              />
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon-xs" variant="ghost" aria-label="Manuscript options">
                  <MoreHorizontal aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setFormOpen(true)}>
                  Main TeX file…
                </DropdownMenuItem>
                {sourceFile ? (
                  <DropdownMenuItem onSelect={() => setClaimsOpen(true)}>
                    Claims and numbers
                  </DropdownMenuItem>
                ) : null}
                {record.hostId === 'local' && (
                  <DropdownMenuItem
                    disabled={busy === 'catalog'}
                    onSelect={() => void loadProjectCatalog()}
                  >
                    {busy === 'catalog' ? 'Reading…' : "Use project's main file"}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />
      {formOpen && (
        <div className="shrink-0 border-b border-border p-3">
          <ResearchWritingFileForm
            sourcePath={sourcePath}
            hostId={record.hostId}
            choosing={choosing}
            saving={busy === 'save'}
            hasManuscript={Boolean(manuscript)}
            formError={formError}
            recordsError={recordsError}
            onSourcePathChange={setSourcePath}
            onChoose={() => void chooseSource()}
            onSave={() =>
              void runManuscriptChange('save', () =>
                saveProjectManuscript(scope, sourcePath, !projectOnly)
              )
            }
            onCancel={() => setFormOpen(false)}
          />
        </div>
      )}
      {!formOpen && formError && !needsSetup && (
        <p
          role="alert"
          className="shrink-0 border-b border-destructive/30 px-4 py-2 text-xs text-destructive"
        >
          {formError}
        </p>
      )}
      {sourceFile ? (
        <ResearchWritingClaimsSplit
          wide={wideLayout}
          visiblePanes={visiblePanes}
          panes={
            <>
              <ResearchWritingPaneTabs
                wide={wideLayout}
                order={paneOrder}
                activePane={activePane}
                onSelect={setActivePane}
              />
              <ResearchWritingSplitLayout
                experimentId={record.id}
                wide={wideLayout}
                activePane={activePane}
                visiblePanes={visiblePanes}
                order={paneOrder}
                agent={
                  <ResearchWritingAgentPane
                    experiment={record}
                    projectOnly={projectOnly}
                    visible={wideLayout ? visiblePanes[0] : activePane === 'agent'}
                  />
                }
                source={
                  <ResearchWritingSourcePane
                    experiment={record}
                    sourceFile={sourceFile}
                    rootFile={rootFile}
                    editorBinding={editorBinding}
                    onSelectFile={setSelectedTexPath}
                    onShowInPdf={synctexAvailable ? synctex.showInPdf : undefined}
                    visible={wideLayout ? visiblePanes[1] : activePane === 'source'}
                  />
                }
                reader={
                  rootFile ? (
                    <ResearchWritingPdfPane
                      experiment={record}
                      projectOnly={projectOnly}
                      rootFile={rootFile}
                      sourceCandidate={sourceFile}
                      onSourceJump={synctexAvailable ? synctex.jumpToSource : undefined}
                      onOpenSource={synctex.jumpToSource}
                      sourceLookup={synctexAvailable ? synctex.pdfLookup : null}
                      visible={wideLayout ? visiblePanes[2] : activePane === 'reader'}
                    />
                  ) : null
                }
              />
            </>
          }
          claimsPanel={
            claimsOpen
              ? {
                  claims,
                  onOpenSource: synctex.jumpToSource,
                  onClose: () => setClaimsOpen(false),
                  onUpdateText: (claim) => updateClaimText(record, claim),
                  onAskAgent: projectOnly
                    ? undefined
                    : async (claim) => {
                        const error = await askWritingAgentAboutClaim(record, claim)
                        if (!error) {
                          showPane('agent')
                        }
                        return error
                      }
                }
              : null
          }
        />
      ) : needsSetup && !formOpen ? (
        <ResearchWritingSetup
          missingPath={manuscript && presence === 'missing' ? manuscript.sourcePath : null}
          canCreate={record.hostId === 'local' && Boolean(window.api.researchProjectLayout)}
          creating={busy === 'create'}
          error={formError}
          onCreate={() => void runManuscriptChange('create', () => createProjectManuscript(scope))}
          onChoose={() => setFormOpen(true)}
        />
      ) : null}
    </section>
  )
}
