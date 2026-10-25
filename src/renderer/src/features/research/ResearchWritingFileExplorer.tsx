import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore
} from 'react'
import {
  ChevronDown,
  ChevronRight,
  FileCode2,
  FolderClosed,
  FolderOpen,
  RefreshCw
} from 'lucide-react'
import type { ExperimentRecord } from '../../../../shared/research/research-records'
import { resolveRuntimePath } from '../../../../shared/cross-platform-path'
import { Button } from '../../components/ui/button'
import { useAppStore } from '../../store'
import { getFileExplorerOperationOwner } from '../../components/right-sidebar/file-explorer-operation-owner'
import {
  readWritingFileDirectory,
  visibleWritingFiles,
  writingFileAncestors,
  writingFileDepth,
  writingFileRoot,
  WritingFileOwnerUnavailableError,
  type WritingFileEntry
} from './research-writing-file-tree'

export type ResearchWritingFileExplorerProps = {
  experiment: ExperimentRecord
  mainSourcePath: string
  activeSourcePath: string | null
  onSelectFile: (relativePath: string) => void
}

type WritingDirectoryError = {
  message: string
  ownerSnapshot: string
  retryOnOwnerChange: boolean
}

function subscribeWorkspaceOwner(onChange: () => void): () => void {
  return useAppStore.subscribe(onChange)
}

export function ResearchWritingFileExplorer(
  props: ResearchWritingFileExplorerProps
): React.JSX.Element {
  const scope = `${props.experiment.hostId}:${props.experiment.workspaceId}:${props.experiment.workspacePath}`
  const root = writingFileRoot(props.mainSourcePath)
  return <WritingFileExplorerScope key={`${scope}:${root}`} {...props} root={root} />
}

function WritingFileExplorerScope({
  experiment,
  activeSourcePath,
  onSelectFile,
  root
}: ResearchWritingFileExplorerProps & { root: string }): React.JSX.Element {
  const [childrenByDirectory, setChildrenByDirectory] = useState<
    Record<string, WritingFileEntry[]>
  >({})
  const [manualExpansion, setManualExpansion] = useState<ReadonlyMap<string, boolean>>(new Map())
  const [loading, setLoading] = useState<ReadonlySet<string>>(new Set())
  const [errors, setErrors] = useState<Readonly<Record<string, WritingDirectoryError>>>({})
  const mounted = useRef(false)
  const requestByDirectory = useRef(new Map<string, number>())
  const ownerSnapshot = useSyncExternalStore(
    subscribeWorkspaceOwner,
    useCallback(
      () => JSON.stringify(getFileExplorerOperationOwner(experiment.workspaceId)),
      [experiment.workspaceId]
    ),
    () => 'unresolved'
  )
  const ownerSnapshotRef = useRef(ownerSnapshot)

  useEffect(() => {
    ownerSnapshotRef.current = ownerSnapshot
  }, [ownerSnapshot])

  const loadDirectory = useCallback(
    async (relativeDirectory: string): Promise<void> => {
      const ownerAtRequest = ownerSnapshotRef.current
      const request = (requestByDirectory.current.get(relativeDirectory) ?? 0) + 1
      requestByDirectory.current.set(relativeDirectory, request)
      setLoading((current) => new Set(current).add(relativeDirectory))
      setErrors((current) => {
        const next = { ...current }
        delete next[relativeDirectory]
        return next
      })
      try {
        const children = await readWritingFileDirectory(experiment, root, relativeDirectory)
        if (mounted.current && requestByDirectory.current.get(relativeDirectory) === request) {
          setChildrenByDirectory((current) => ({ ...current, [relativeDirectory]: children }))
        }
      } catch (cause) {
        if (mounted.current && requestByDirectory.current.get(relativeDirectory) === request) {
          setErrors((current) => ({
            ...current,
            [relativeDirectory]: {
              message: String(cause),
              ownerSnapshot: ownerAtRequest,
              retryOnOwnerChange: cause instanceof WritingFileOwnerUnavailableError
            }
          }))
        }
      } finally {
        if (mounted.current && requestByDirectory.current.get(relativeDirectory) === request) {
          setLoading((current) => {
            const next = new Set(current)
            next.delete(relativeDirectory)
            return next
          })
        }
      }
    },
    [experiment, root]
  )

  useEffect(() => {
    mounted.current = true
    void loadDirectory(root)
    return () => {
      mounted.current = false
    }
  }, [loadDirectory, root])

  useEffect(() => {
    const ancestors = writingFileAncestors(activeSourcePath, root)
    if (ancestors.length === 0) {
      return
    }
    for (const directory of ancestors) {
      if (
        childrenByDirectory[directory] === undefined &&
        !loading.has(directory) &&
        !errors[directory]
      ) {
        void loadDirectory(directory)
      }
    }
  }, [activeSourcePath, childrenByDirectory, errors, loadDirectory, loading, root])

  const expanded = useMemo(() => {
    const paths = new Set(writingFileAncestors(activeSourcePath, root))
    for (const [directory, shouldExpand] of manualExpansion) {
      if (shouldExpand) {
        paths.add(directory)
      } else {
        paths.delete(directory)
      }
    }
    return paths
  }, [activeSourcePath, manualExpansion, root])

  useEffect(() => {
    for (const directory of [root, ...expanded]) {
      const error = errors[directory]
      if (
        error?.retryOnOwnerChange &&
        error.ownerSnapshot !== ownerSnapshot &&
        !loading.has(directory)
      ) {
        void loadDirectory(directory)
      }
    }
  }, [errors, expanded, loadDirectory, loading, ownerSnapshot, root])

  const visible = useMemo(
    () => visibleWritingFiles(childrenByDirectory, expanded, root),
    [childrenByDirectory, expanded, root]
  )
  const hasFolders = visible.some((entry) => entry.isDirectory)

  function toggleFolder(entry: WritingFileEntry): void {
    if (expanded.has(entry.relativePath)) {
      setManualExpansion((current) => {
        const next = new Map(current)
        next.set(entry.relativePath, false)
        return next
      })
      return
    }
    setManualExpansion((current) => {
      const next = new Map(current)
      next.set(entry.relativePath, true)
      return next
    })
    if (childrenByDirectory[entry.relativePath] === undefined && !loading.has(entry.relativePath)) {
      void loadDirectory(entry.relativePath)
    }
  }

  function refresh(): void {
    for (const directory of [root, ...expanded]) {
      void loadDirectory(directory)
    }
  }

  const rootLoading = loading.has(root) && childrenByDirectory[root] === undefined
  const rootError = errors[root]
  return (
    <section
      className="flex min-h-0 min-w-0 flex-1 flex-col border-r border-border bg-sidebar text-sidebar-foreground"
      aria-label="Manuscript files"
    >
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-sidebar-border px-3 py-1.5">
        <div
          className="flex min-w-0 items-center gap-2"
          title={resolveRuntimePath(experiment.workspacePath, root)}
        >
          <h2 className="shrink-0 text-2xs font-semibold uppercase tracking-wider">TeX files</h2>
          <span className="truncate font-mono text-3xs text-muted-foreground">
            {root || 'Workspace root'}
          </span>
        </div>
        <Button size="icon-xs" variant="ghost" aria-label="Refresh TeX files" onClick={refresh}>
          <RefreshCw aria-hidden className="size-3.5" />
        </Button>
      </header>
      <nav
        className="worktree-sidebar-scrollbar min-h-0 flex-1 overflow-auto py-1"
        aria-label="TeX file tree"
      >
        {!root && (
          <p className="px-3 py-2 text-2xs text-muted-foreground">
            Showing top-level TeX files only.
          </p>
        )}
        {rootLoading && (
          <p role="status" className="px-3 py-2 text-xs text-muted-foreground">
            Loading TeX files…
          </p>
        )}
        {rootError && (
          <div role="alert" className="space-y-2 px-3 py-2 text-xs text-destructive">
            <p>Could not list workspace files. {rootError.message}</p>
            <Button size="xs" variant="outline" onClick={() => void loadDirectory(root)}>
              Retry
            </Button>
          </div>
        )}
        {!rootLoading && !rootError && childrenByDirectory[root]?.length === 0 && (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            No TeX files or folders here. Add a .tex file in this workspace, then refresh.
          </p>
        )}
        {visible.map((entry) => {
          const open = expanded.has(entry.relativePath)
          const selected = !entry.isDirectory && entry.relativePath === activeSourcePath
          const depth = writingFileDepth(entry.relativePath, root)
          return (
            <Fragment key={entry.relativePath}>
              <button
                type="button"
                className={`flex w-full min-w-0 items-center gap-1.5 px-2 py-1.5 text-left text-xs hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sidebar-ring ${selected ? 'bg-sidebar-accent font-medium' : ''}`}
                style={{ paddingInlineStart: `${8 + depth * 16}px` }}
                aria-expanded={entry.isDirectory ? open : undefined}
                aria-current={selected ? 'page' : undefined}
                data-current={selected ? 'true' : undefined}
                title={entry.relativePath}
                onClick={() =>
                  entry.isDirectory ? toggleFolder(entry) : onSelectFile(entry.relativePath)
                }
              >
                {entry.isDirectory ? (
                  <>
                    {open ? (
                      <ChevronDown className="size-3 shrink-0" aria-hidden />
                    ) : (
                      <ChevronRight className="size-3 shrink-0" aria-hidden />
                    )}
                    {open ? (
                      <FolderOpen className="size-3.5 shrink-0" aria-hidden />
                    ) : (
                      <FolderClosed className="size-3.5 shrink-0" aria-hidden />
                    )}
                  </>
                ) : (
                  // Why only beside folders: the indent lines files up under folder names.
                  <FileCode2
                    className={`${hasFolders ? 'ml-4' : ''} size-3.5 shrink-0`}
                    aria-hidden
                  />
                )}
                <span className="truncate">{entry.name}</span>
              </button>
              {entry.isDirectory && open && loading.has(entry.relativePath) && (
                <p role="status" className="py-1 pl-8 text-2xs text-muted-foreground">
                  Loading…
                </p>
              )}
              {entry.isDirectory && open && errors[entry.relativePath] && (
                <p role="alert" className="py-1 pl-8 text-2xs text-destructive">
                  Could not open folder. {errors[entry.relativePath]?.message}
                </p>
              )}
              {entry.isDirectory &&
                open &&
                childrenByDirectory[entry.relativePath]?.length === 0 &&
                !loading.has(entry.relativePath) &&
                !errors[entry.relativePath] && (
                  <p className="py-1 pl-8 text-2xs text-muted-foreground">No TeX files here</p>
                )}
            </Fragment>
          )
        })}
      </nav>
    </section>
  )
}
