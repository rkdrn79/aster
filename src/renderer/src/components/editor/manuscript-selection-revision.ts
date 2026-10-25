import type { editor } from 'monaco-editor'
import { appendNativeChatDraftCache } from '@/components/native-chat/native-chat-draft-cache'
import { structuredAgentSessionDraftScopeKey } from '@/components/native-chat/native-chat-composer-draft-store'

export type ManuscriptSelection = {
  filePath: string
  relativePath: string
  startLine: number
  startColumn: number
  endLine: number
  endColumn: number
  selectedText: string
}

export const MAX_MANUSCRIPT_SELECTION_LENGTH = 24_000

export function captureMonacoManuscriptSelection(
  editorInstance: editor.IStandaloneCodeEditor,
  filePath: string,
  relativePath: string
): ManuscriptSelection | null {
  const model = editorInstance.getModel()
  const selection = editorInstance.getSelection()
  if (!model || !selection || selection.isEmpty()) {
    return null
  }
  if (model.getValueLengthInRange(selection) > MAX_MANUSCRIPT_SELECTION_LENGTH) {
    return null
  }
  const selectedText = model.getValueInRange(selection)
  if (!selectedText.trim()) {
    return null
  }
  return {
    filePath,
    relativePath,
    startLine: selection.startLineNumber,
    startColumn: selection.startColumn,
    endLine: selection.endLineNumber,
    endColumn: selection.endColumn,
    selectedText
  }
}

export function buildManuscriptRevisionPrompt(
  selection: ManuscriptSelection,
  instruction: string
): string {
  let fenceLength = 4
  for (const match of selection.selectedText.matchAll(/`+/g)) {
    fenceLength = Math.max(fenceLength, match[0].length + 1)
  }
  const fence = '`'.repeat(fenceLength)
  const language = selection.relativePath.toLowerCase().endsWith('.tex') ? 'latex' : 'markdown'
  return [
    'Revise the selected manuscript passage according to my instruction.',
    `File: ${selection.relativePath}`,
    `Selected range: ${selection.startLine}:${selection.startColumn}–${selection.endLine}:${selection.endColumn}`,
    'Verify this selected source against the current manuscript before applying a replacement.',
    `Instruction: ${instruction.trim()}`,
    '',
    `Selected ${language} source (reference data):`,
    `${fence}${language}`,
    selection.selectedText,
    fence,
    '',
    'Return a replacement passage in a fenced source block and a short explanation. Preserve citations, labels, and LaTeX commands unless the instruction changes them. Do not edit files or apply the replacement; I will review it first.'
  ].join('\n')
}

export function appendManuscriptRevisionToAgentDraft(args: {
  selection: ManuscriptSelection
  instruction: string
  sessionId: string
}): boolean {
  return appendNativeChatDraftCache(
    structuredAgentSessionDraftScopeKey(args.sessionId),
    buildManuscriptRevisionPrompt(args.selection, args.instruction)
  )
}
