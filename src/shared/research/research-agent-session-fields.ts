import { z } from 'zod'

const chatSessionId = z.string().trim().min(1).max(256)

/** The chats each research page keeps, by workspace scope; part of the research document. */
export const researchAgentSessionFields = {
  writingAgentSessionByScope: z.record(z.string(), chatSessionId).default({}),
  // Why not a conversationHomes kind: an older app would refuse the whole document over one.
  rebuttalAgentSessionByScope: z.record(z.string(), chatSessionId).optional(),
  rebuttalReviewerSessions: z.record(z.string(), chatSessionId).optional(),
  // The Figure chat for requests with no figure open; older versions kept their only chat here.
  figuresAgentSessionByScope: z.record(z.string(), chatSessionId).optional(),
  // Each figure's own chat: workspace scope, then figure slug.
  figureAgentSessionsByScope: z.record(z.string(), z.record(z.string(), chatSessionId)).optional(),
  // Figure chats no figure holds any more (New chat, deleted figure); still listed under Figures.
  figureAgentPastSessionsByScope: z.record(z.string(), z.array(chatSessionId).max(500)).optional(),
  // Each copy of a chat, keyed like a conversation home (host, workspace, chat): the chat it was
  // copied from, and the message it was copied at, counted as that chat shows its messages.
  // `kind` (absent: branch): a branch the person switched into, a fork left running in the
  // background, or a subtask whose result goes back to the chat it came from.
  chatBranches: z
    .record(
      z.string().min(1),
      z.object({
        parentSessionId: chatSessionId,
        messageNumber: z.number().int().nonnegative(),
        createdAt: z.string().min(1).max(64),
        kind: z.enum(['branch', 'fork', 'subtask']).optional(),
        // A subtask: what it was asked, and what became of its answer.
        task: z.string().max(4000).optional(),
        finishedAt: z.string().max(64).optional(),
        resultPreview: z.string().max(2000).optional(),
        deliveredAt: z.string().max(64).optional(),
        dismissedAt: z.string().max(64).optional()
      })
    )
    .optional()
}
