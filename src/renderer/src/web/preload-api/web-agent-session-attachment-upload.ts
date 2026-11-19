import {
  AGENT_SESSION_ATTACHMENT_MAX_BYTES,
  agentSessionAttachmentAppends,
  agentSessionPastedImageName,
  base64DecodedByteLength,
  type AgentSessionAttachmentPathUploadResult,
  type AgentSessionAttachmentUploadCommitResult,
  type AgentSessionAttachmentUploadTarget
} from '../../../../shared/agent-session-attachments'
import { callEnvironmentEnvelope } from './web-runtime-calls'
import { resolveEnvironment } from './web-runtime-session'
import { createBrowserUuid } from '@/lib/browser-uuid'
import { PRODUCT_NAME } from '../../../../shared/product-brand'
import { readWebPickedFileBase64, takeWebPickedFile } from './web-picked-files'

const ATTACHMENT_CALL_TIMEOUT_MS = 30_000
const SERVER_CHANGED = `The paired ${PRODUCT_NAME} server changed while the request was in progress.`

/** Every call goes to the server the paste was meant for, as its desktop counterpart does: a
 *  re-pair or a replaced server process ends the upload instead of storing it elsewhere. */
async function callPinned<TResult>(
  target: AgentSessionAttachmentUploadTarget,
  method: string,
  params: unknown
): Promise<TResult> {
  const environment = resolveEnvironment(target.environmentId)
  if (
    target.expectedEnvironmentPairingRevision !== undefined &&
    (environment.pairingRevision ?? environment.createdAt) !==
      target.expectedEnvironmentPairingRevision
  ) {
    throw new Error(SERVER_CHANGED)
  }
  const response = await callEnvironmentEnvelope<TResult>(
    environment.id,
    method,
    params,
    ATTACHMENT_CALL_TIMEOUT_MS
  )
  // A failure may come from this side and name no server process; a success always names one.
  const runtimeId = response._meta?.runtimeId ?? null
  if ((response.ok || runtimeId !== null) && runtimeId !== target.expectedEnvironmentRuntimeId) {
    throw new Error(SERVER_CHANGED)
  }
  if (!response.ok) {
    throw new Error(response.error.message || response.error.code)
  }
  return response.result
}

/** The browser client's paste into a structured chat: the same store the desktop client uses. */
export function saveClipboardImageAsWebAgentSessionAttachment(
  contentBase64: string,
  target: AgentSessionAttachmentUploadTarget
): Promise<string> {
  return uploadWebAgentSessionAttachment(
    contentBase64,
    agentSessionPastedImageName(Date.now(), createBrowserUuid()),
    target
  )
}

/** Files picked in the browser (the chat's attach button), uploaded one by one in pick order. */
export async function uploadWebPickedFilesToAgentSession(
  args: AgentSessionAttachmentUploadTarget & { paths: string[] }
): Promise<AgentSessionAttachmentPathUploadResult> {
  const { paths, ...target } = args
  const result: AgentSessionAttachmentPathUploadResult = { uploaded: [], skipped: [], failed: [] }
  for (const sourcePath of paths) {
    const file = takeWebPickedFile(sourcePath)
    if (!file) {
      result.failed.push({ sourcePath, reason: 'Pick the file again.' })
      continue
    }
    if (file.size > AGENT_SESSION_ATTACHMENT_MAX_BYTES) {
      result.failed.push({ sourcePath, reason: 'The file is larger than 50 MB.' })
      continue
    }
    try {
      const contentBase64 = await readWebPickedFileBase64(file)
      const path = await uploadWebAgentSessionAttachment(contentBase64, file.name, target)
      result.uploaded.push({ sourcePath, path })
    } catch (error) {
      result.failed.push({
        sourcePath,
        reason: error instanceof Error ? error.message : String(error)
      })
    }
  }
  return result
}

async function uploadWebAgentSessionAttachment(
  contentBase64: string,
  name: string,
  target: AgentSessionAttachmentUploadTarget
): Promise<string> {
  const { uploadId } = await callPinned<{ uploadId: string }>(
    target,
    'agentSessionAttachment.uploadStart',
    {
      sessionId: target.sessionId,
      name,
      byteLength: base64DecodedByteLength(contentBase64)
    }
  )
  try {
    for (const chunk of agentSessionAttachmentAppends(contentBase64)) {
      await callPinned(target, 'agentSessionAttachment.uploadAppend', { uploadId, ...chunk })
    }
    const stored = await callPinned<AgentSessionAttachmentUploadCommitResult>(
      target,
      'agentSessionAttachment.uploadCommit',
      { uploadId }
    )
    return stored.path
  } catch (error) {
    // Only to the same server: an abort a re-pair refuses is left to that server's idle expiry.
    await callPinned(target, 'agentSessionAttachment.uploadAbort', { uploadId }).catch(() => {})
    throw error
  }
}
