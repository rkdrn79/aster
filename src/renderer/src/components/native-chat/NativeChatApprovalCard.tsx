import { SecuritySurface } from '@/components/ui/security-surface'
import { useRef } from 'react'
import { ShieldQuestion, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  ToolApprovalActions,
  ToolApprovalCard,
  ToolApprovalHeader,
  ToolApprovalWell
} from '@/components/ai/tool-approval'
import { translate } from '@/i18n/i18n'
import type { CommentMarkdownLinkClickHandler } from '@/components/sidebar/CommentMarkdown'
import { NativeChatMarkdown } from './NativeChatMarkdown'
import { approvalBlockedPathToShow } from '../../../../shared/agent-session-approval-blocked-path'
import {
  isNewerApprovalSubject,
  isPlanApprovalSubject
} from '../../../../shared/agent-session-approval-subject'
import { NativeChatCodeBlock } from './NativeChatCodeBlock'
import type { ChatApproval } from './native-chat-interactive-prompt'
import { NativeChatPromptCollapseToggle } from './NativeChatPromptCollapse'
import { useNativeChatPromptCardFocus } from './use-native-chat-prompt-card-focus'
import { nativeChatApprovalCommandLine } from './native-chat-approval-command'

export type NativeChatApprovalCardProps = {
  approval: ChatApproval
  /** Deliver the option's transport-specific response token. */
  onChoose: (option: string) => void
  /** Cancel the active provider turn while this card owns the composer region. */
  onCancel?: () => void
  /** Without `onCancel`: fold the card to a strip and give the input back, writing nothing. */
  onCollapse?: () => void
  /** A choice is being delivered: the options wait for its answer. */
  isSubmitting?: boolean
  shouldFocus?: boolean
  /** A plan body renders as markdown; these make its file paths clickable. */
  onLinkClick?: CommentMarkdownLinkClickHandler
  allowFileUriLinks?: boolean
}

/**
 * Native renderer for an agent tool-approval (PermissionRequest) as an
 * Allow/Deny card. PTY callers supply literal replies while structured callers
 * supply journal option IDs. The first option gets the primary styling.
 */
export function NativeChatApprovalCard({
  approval,
  onChoose,
  onCancel,
  onCollapse,
  isSubmitting = false,
  shouldFocus = false,
  onLinkClick,
  allowFileUriLinks = false
}: NativeChatApprovalCardProps): React.JSX.Element {
  const cardRef = useRef<HTMLDivElement>(null)
  const neededPath = approvalBlockedPathToShow(approval)
  // A newer Orca's subject: its detail is shown, and only the card's cancel answers.
  const newerSubject = isNewerApprovalSubject(approval.subject)
  const hasContext = Boolean(
    approval.description ||
    approval.decisionReason ||
    neededPath ||
    approval.subject ||
    approval.detail
  )
  useNativeChatPromptCardFocus(cardRef, shouldFocus)
  // A shell call reads as its command line, the way a terminal shows it.
  const commandLine = nativeChatApprovalCommandLine(approval.detail, approval.description)
  const escape = onCancel ?? (isSubmitting ? undefined : onCollapse)

  // The primary answer (the first option) is the ink pill at the right edge; the others are
  // quiet and come before it, so reading order and tab order match what the eye sees.
  const indexed = approval.options.map((option, index) => ({ option, index }))
  const ordered = [...indexed.slice(1), ...indexed.slice(0, 1)]

  return (
    <SecuritySurface>
      <div className="min-h-0 shrink overflow-hidden bg-chat-canvas">
        <div className="mx-auto flex h-full min-h-0 max-h-full w-full max-w-(--chat-content-max-width) px-3 pt-2 pb-1 sm:px-4">
          <ToolApprovalCard
            ref={cardRef}
            data-native-chat-prompt-card-focus={shouldFocus || undefined}
            data-native-chat-approval-card="true"
            role="group"
            aria-label={approval.title}
            tabIndex={-1}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && !event.nativeEvent.isComposing && escape) {
                event.preventDefault()
                event.stopPropagation()
                escape()
              }
            }}
            className="min-h-0 w-full flex-1"
          >
            <ToolApprovalHeader
              icon={<ShieldQuestion />}
              title={approval.title}
              trailing={
                onCancel ? (
                  <button
                    type="button"
                    onClick={onCancel}
                    aria-label={translate('components.native-chat.approval.cancel', 'Cancel')}
                    className="press-scale flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X className="size-4" />
                  </button>
                ) : onCollapse ? (
                  <NativeChatPromptCollapseToggle
                    expanded
                    disabled={isSubmitting}
                    onToggle={onCollapse}
                  />
                ) : null
              }
            />
            {hasContext ? (
              <div
                data-native-chat-approval-content="true"
                tabIndex={0}
                className="min-h-0 max-h-72 shrink space-y-2 overflow-auto text-sm text-muted-foreground scrollbar-sleek focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring rounded"
              >
                {approval.detail && !isPlanApprovalSubject(approval.subject) ? (
                  <ToolApprovalWell
                    data-native-chat-approval-detail="true"
                    data-native-chat-code-content
                    className="text-chat-code"
                  >
                    {commandLine !== null ? (
                      <>
                        <span aria-hidden className="mr-2 select-none text-muted-foreground">
                          $
                        </span>
                        {commandLine}
                      </>
                    ) : (
                      approval.detail
                    )}
                  </ToolApprovalWell>
                ) : null}
                {approval.description ? (
                  <p className="whitespace-pre-wrap break-words">{approval.description}</p>
                ) : null}
                {approval.decisionReason ? (
                  <p className="whitespace-pre-wrap break-words">
                    <span className="font-medium text-foreground">
                      {translate('components.native-chat.approval.reason', 'Reason')}:{' '}
                    </span>
                    {approval.decisionReason}
                  </p>
                ) : null}
                {neededPath ? (
                  <p className="break-words">
                    <span className="font-medium text-foreground">
                      {translate('components.native-chat.approval.needsAccess', 'Needs access to')}
                      :{' '}
                    </span>
                    <span className="font-mono">{neededPath}</span>
                  </p>
                ) : null}
                {isPlanApprovalSubject(approval.subject) ? (
                  <div data-native-chat-approval-plan="true">
                    <NativeChatMarkdown
                      content={approval.subject.text}
                      variant="document"
                      className="text-sm text-chat-foreground"
                      renderCodeBlock={NativeChatCodeBlock}
                      {...(onLinkClick ? { onLinkClick } : {})}
                      allowFileUriLinks={allowFileUriLinks}
                      linkifyFilePaths={onLinkClick !== undefined}
                    />
                    {approval.subject.filePath ? (
                      <p className="mt-2 break-all">
                        <span className="font-medium text-foreground">
                          {translate('components.native-chat.approval.plan.file', 'Plan file')}
                          :{' '}
                        </span>
                        <span className="font-mono">{approval.subject.filePath}</span>
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {newerSubject ? (
                  <p data-native-chat-approval-needs-newer-orca="true" className="break-words">
                    {translate(
                      'components.native-chat.approval.needsNewerOrca',
                      'This request needs a newer version of Aster.'
                    )}
                  </p>
                ) : null}
              </div>
            ) : null}
            <ToolApprovalActions data-native-chat-approval-actions="true">
              {ordered.map(({ option, index }) => (
                <Button
                  key={`${option.label}-${index}`}
                  type="button"
                  size="sm"
                  variant={index === 0 ? 'default' : 'ghost'}
                  disabled={newerSubject || isSubmitting}
                  onClick={() => onChoose(option.send)}
                >
                  {option.label}
                </Button>
              ))}
            </ToolApprovalActions>
          </ToolApprovalCard>
        </div>
      </div>
    </SecuritySurface>
  )
}
