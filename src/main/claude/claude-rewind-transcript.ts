import type { SessionStoreEntry } from '@anthropic-ai/claude-agent-sdk'
import { createReadStream } from 'node:fs'
import { rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { AgentSessionRewindFork } from '../../shared/agent-session-rewind'
import { durableWriteTempPath, renameDurable, writeTempFileDurable } from '../durable-file-write'
import { splitTranscriptStreamLines } from '../native-chat/transcript-stream-lines'
import { loadClaudeAgentSdk } from './claude-stream-json-connection'

function isTranscriptEntry(value: unknown): value is SessionStoreEntry {
  return (
    typeof value === 'object' && value !== null && 'type' in value && typeof value.type === 'string'
  )
}

function parseTranscriptEntry(line: string): SessionStoreEntry | undefined {
  try {
    const entry: unknown = JSON.parse(line)
    return isTranscriptEntry(entry) ? entry : undefined
  } catch {
    return undefined
  }
}

/** Use Claude's fork implementation for branch selection, compaction and UUID remapping. */
export async function materializeClaudeRewindTranscript(
  sourcePath: string,
  fork: AgentSessionRewindFork
): Promise<AgentSessionRewindFork> {
  if (!fork.throughEntryId) {
    return { ...fork, materialized: true }
  }
  const copy = await forkClaudeTranscript(sourcePath, fork.sourceSessionId, fork.throughEntryId)
  return { ...fork, ...copy, materialized: true }
}

/**
 * A new session beside `sourcePath` holding its conversation through `upToMessageId` (inclusive),
 * or all of it when absent: Claude's own fork, read and written through a store pinned to that
 * file's folder, so it never depends on which account `process.env` names.
 */
export async function forkClaudeTranscript(
  sourcePath: string,
  sourceSessionId: string,
  upToMessageId?: string
): Promise<{ sessionId: string; resumeCursor?: string }> {
  const { forkSession } = await loadClaudeAgentSdk()
  let resumeCursor: string | undefined
  const result = await forkSession(sourceSessionId, {
    ...(upToMessageId ? { upToMessageId } : {}),
    // A store pins both reads and writes to the resolved account, without changing process.env.
    sessionStore: {
      load: async () => {
        const entries: SessionStoreEntry[] = []
        for await (const { line } of splitTranscriptStreamLines(createReadStream(sourcePath))) {
          if (!line.trim()) {
            continue
          }
          const entry = parseTranscriptEntry(line)
          // Skip torn lines (crash mid-write) like the SDK's own local reader does.
          if (entry) {
            entries.push(entry)
          }
        }
        return entries
      },
      append: async (key, entries) => {
        resumeCursor = entries.findLast(
          (entry) => entry.type === 'assistant' || entry.type === 'user'
        )?.uuid
        if (!resumeCursor) {
          throw new Error('claude rewind fork is missing its resume point')
        }
        const destination = join(dirname(sourcePath), `${key.sessionId}.jsonl`)
        const temporary = durableWriteTempPath(destination)
        try {
          await writeTempFileDurable(
            temporary,
            `${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`,
            0o600
          )
          await renameDurable(temporary, destination)
        } finally {
          await rm(temporary, { force: true })
        }
      }
    }
  })
  return { sessionId: result.sessionId, ...(resumeCursor ? { resumeCursor } : {}) }
}
