import { translate } from '@/i18n/i18n'
import { NativeChatMessageTimestamp } from './NativeChatMessageTimestamp'
import { NativeChatAwaitingInputRow } from './NativeChatAwaitingInputRow'
import { nativeChatApprovalCommandLine } from './native-chat-approval-command'
import {
  NATIVE_CHAT_RECEIPT_COPY,
  nativeChatReceiptAnswerHeading,
  nativeChatReceiptAnswers,
  nativeChatReceiptSubject,
  type NativeChatResolvedPrompt
} from '../../../../shared/native-chat-resolution-receipt'

export function NativeChatResolutionReceipt({
  body,
  disclosureId,
  awaiting = true
}: {
  body: NativeChatResolvedPrompt
  /** Message this receipt stands in for; keys the question row's disclosure. */
  disclosureId?: string
  /** False when the host says nobody waits on this pending prompt: the agent that raised it ended,
   *  so its row reports what was asked instead of breathing. */
  awaiting?: boolean
}): React.JSX.Element | null {
  const askDisclosureKey = disclosureId === undefined ? undefined : `ask:${disclosureId}`
  const subject = nativeChatReceiptSubject(body)
  if (body.resolution.state === 'pending') {
    return body.kind === 'question' ? (
      <NativeChatAwaitingInputRow
        subject={subject}
        pending={awaiting}
        disclosureKey={askDisclosureKey}
      />
    ) : null
  }
  const { resolution } = body
  const title = body.kind === 'approval' ? (body.displayName ?? body.title) : body.question
  // Non-empty only once resolved, and then each question is listed with its answer.
  const answers = nativeChatReceiptAnswers(body)
  return (
    <div
      className="space-y-1 border-l border-border pl-3 text-xs text-chat-foreground-faint"
      data-native-chat-receipt={body.kind}
    >
      {body.kind === 'question' ? (
        <NativeChatAwaitingInputRow
          pending={false}
          subject={subject}
          disclosureKey={askDisclosureKey}
          listsQuestions={answers.length === 0}
        />
      ) : (
        <div className="font-medium">{title}</div>
      )}
      {body.kind === 'approval' && body.detail ? (
        <ApprovalReceiptDetail detail={body.detail} description={body.description} />
      ) : null}
      {answers.map((answer, index) => {
        const heading = nativeChatReceiptAnswerHeading(subject, answer)
        return (
          <div
            key={body.kind === 'question' ? (body.questions?.[index]?.id ?? 'answer') : 'answer'}
          >
            {heading ? <p>{heading}</p> : null}
            <p className="line-clamp-3 whitespace-pre-wrap break-words">
              {answer.answer === ''
                ? translate(
                    'components.native-chat.receipt.emptyAnswer',
                    NATIVE_CHAT_RECEIPT_COPY.emptyAnswer
                  )
                : (answer.answer ??
                  translate(
                    'components.native-chat.receipt.unavailable',
                    NATIVE_CHAT_RECEIPT_COPY.unavailable
                  ))}
            </p>
          </div>
        )
      })}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span>
          {resolution.state === 'cancelled'
            ? translate(
                'components.native-chat.receipt.cancelled',
                NATIVE_CHAT_RECEIPT_COPY.cancelled
              )
            : translate(
                'components.native-chat.receipt.resolved',
                NATIVE_CHAT_RECEIPT_COPY.resolved
              )}
        </span>
        {resolution.resolvedBy ? (
          <span>
            {resolution.state === 'cancelled'
              ? translate(
                  'components.native-chat.receipt.cancelledBy',
                  NATIVE_CHAT_RECEIPT_COPY.cancelledBy,
                  { device: resolution.resolvedBy }
                )
              : translate(
                  'components.native-chat.receipt.resolver',
                  NATIVE_CHAT_RECEIPT_COPY.resolver,
                  { device: resolution.resolvedBy }
                )}
          </span>
        ) : null}
        <NativeChatMessageTimestamp timestamp={resolution.resolvedAt} />
      </div>
    </div>
  )
}

/** A decided shell call keeps its command line, as the card showed it; anything else its detail. */
function ApprovalReceiptDetail({
  detail,
  description
}: {
  detail: string
  description: string | undefined
}): React.JSX.Element {
  const commandLine = nativeChatApprovalCommandLine(detail, description)
  if (commandLine === null) {
    return <p className="line-clamp-3 whitespace-pre-wrap break-words">{detail}</p>
  }
  // The input's description folded into the command line's place, so it is said here instead.
  return (
    <>
      {description ? <p className="line-clamp-2 break-words">{description}</p> : null}
      <p className="line-clamp-3 whitespace-pre-wrap break-words font-mono text-chat-code">
        <span aria-hidden className="mr-2 select-none">
          $
        </span>
        {commandLine}
      </p>
    </>
  )
}
