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
  figureAgentPastSessionsByScope: z.record(z.string(), z.array(chatSessionId).max(500)).optional()
}
