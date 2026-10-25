import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ExternalLink, FolderPlus, GitBranchPlus, X } from 'lucide-react'
import { useAppStore } from '../store'
import { Button } from './ui/button'
import { ProductLogoMark } from '../app-shell/ProductLogoMark'
import { PRODUCT_NAME } from '../../../shared/product-brand'
import { isGitRepoKind } from '../../../shared/repo-kind'
import type { Repo } from '../../../shared/repo-types'
import {
  dismissPreflightIssue,
  githubProjectKeys,
  isPreflightIssueDismissed
} from './landing-preflight-dismissal'
import { ShortcutKeyCombo } from './ShortcutKeyCombo'
import { useShortcutKeyDetails, type ShortcutKeyComboDetails } from '@/hooks/useShortcutLabel'
import { translate } from '@/i18n/i18n'
import type { PreflightIssue } from './landing-preflight-issues'
import { useLandingPreflightRuntime } from './landing-preflight-runtime'

type ShortcutItem = {
  id: string
  shortcut: ShortcutKeyComboDetails
  action: string
}

function PreflightBanner({
  issues,
  repos
}: {
  issues: PreflightIssue[]
  repos: readonly Repo[]
}): React.JSX.Element | null {
  // Why: keying the seed on the current GitHub project set means adding a new
  // GitHub project (which changes the key) re-evaluates dismissals, so a lapsed
  // dismissal re-surfaces the nudge without a manual reset.
  const githubKey = githubProjectKeys(repos).join('|')
  const [dismissed, setDismissed] = useState<Set<string>>(
    () =>
      new Set(
        issues
          .filter((issue) => issue.dismissible && isPreflightIssueDismissed(issue.id, repos))
          .map((issue) => issue.id)
      )
  )

  useEffect(() => {
    setDismissed(
      new Set(
        issues
          .filter((issue) => issue.dismissible && isPreflightIssueDismissed(issue.id, repos))
          .map((issue) => issue.id)
      )
    )
    // Why: re-seed only when the GitHub project set changes; issues identity is
    // stable per render and would otherwise reset transient dismiss state.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [githubKey])

  const visibleIssues = issues.filter((issue) => !dismissed.has(issue.id))
  if (visibleIssues.length === 0) {
    return null
  }

  const dismiss = (issue: PreflightIssue): void => {
    dismissPreflightIssue(issue.id, repos)
    setDismissed((prev) => new Set(prev).add(issue.id))
  }

  return (
    // Why: cap width below the max-w-lg column so the card reads as part of the
    // centered content stack instead of stretching edge-to-edge. The styleguide
    // reserves color for true error state — these are soft setup nudges, so use
    // the quiet muted/border surface, not an amber frame.
    <div className="w-full max-w-sm space-y-1.5 rounded-lg border border-border bg-muted/40 p-3">
      {visibleIssues.map((issue) => (
        <div
          key={issue.id}
          className="flex items-start gap-3 rounded-md px-1 py-1.5 first:pt-0 last:pb-0"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-warning" />
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="text-[13px] font-medium leading-snug text-foreground">{issue.title}</p>
            <p className="text-xs leading-snug text-muted-foreground">{issue.description}</p>
            <button
              className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline cursor-pointer"
              onClick={() => window.api.shell.openUrl(issue.fixUrl)}
            >
              {issue.fixLabel}
              <ExternalLink className="size-3" />
            </button>
          </div>
          {issue.dismissible && (
            <button
              className="-mr-1 -mt-0.5 shrink-0 rounded p-1 text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
              onClick={() => dismiss(issue)}
              aria-label={translate('auto.components.Landing.preflightDismiss', 'Dismiss')}
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

export default function Landing(): React.JSX.Element {
  const repos = useAppStore((s) => s.repos)
  const openModal = useAppStore((s) => s.openModal)

  const createTargetLabel =
    repos.length > 0 && repos.every((repo) => isGitRepoKind(repo)) ? 'worktree' : 'workspace'
  const hasProjects = repos.length > 0

  // Why: the runtime-aware slice probes the active remote host instead of the renderer host.
  const { preflightIssues } = useLandingPreflightRuntime()

  const createWorktreeShortcut = useShortcutKeyDetails('workspace.create')
  const previousWorktreeShortcut = useShortcutKeyDetails('worktree.navigateUp')
  const nextWorktreeShortcut = useShortcutKeyDetails('worktree.navigateDown')
  const shortcuts = useMemo<ShortcutItem[]>(() => {
    return [
      {
        id: 'create',
        shortcut: createWorktreeShortcut,
        action: `Create ${createTargetLabel}`
      },
      { id: 'up', shortcut: previousWorktreeShortcut, action: 'Previous workspace' },
      { id: 'down', shortcut: nextWorktreeShortcut, action: 'Next workspace' }
    ]
  }, [createTargetLabel, createWorktreeShortcut, nextWorktreeShortcut, previousWorktreeShortcut])

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-background">
      <div className="flex w-full max-w-md flex-col items-center gap-6 px-6 py-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <ProductLogoMark className="size-9 text-primary" />
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{PRODUCT_NAME}</h1>
          <p className="text-sm text-muted-foreground">
            {hasProjects
              ? translate(
                  'auto.components.Landing.9c00bd4adf',
                  'Select a workspace from the sidebar to begin.'
                )
              : translate('auto.components.Landing.cd21242762', 'Add a project to get started.')}
          </p>
        </div>

        {preflightIssues.length > 0 && <PreflightBanner issues={preflightIssues} repos={repos} />}

        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button
            variant={hasProjects ? 'outline' : 'default'}
            onClick={() => openModal('add-repo')}
          >
            <FolderPlus aria-hidden />
            {translate('auto.components.Landing.f9eaa9e12d', 'Add project')}
          </Button>
          {hasProjects ? (
            <Button
              onClick={() => openModal('new-workspace-composer', { telemetrySource: 'unknown' })}
            >
              <GitBranchPlus aria-hidden />
              {`Create ${createTargetLabel}`}
            </Button>
          ) : null}
        </div>

        <dl className="w-full max-w-xs space-y-2 border-t border-border pt-5">
          {shortcuts.map((shortcut) => (
            <div key={shortcut.id} className="grid grid-cols-[1fr_auto] items-center gap-3">
              <dt className="text-sm text-muted-foreground">{shortcut.action}</dt>
              <dd>
                <ShortcutKeyCombo
                  keys={shortcut.shortcut.keys}
                  doubleTap={shortcut.shortcut.doubleTap}
                  separatorClassName="mx-0.5 text-3xs text-muted-foreground"
                />
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}
