// The sentences a chat notice is made of, each whole so desktop can translate it on its own.

import type { AgentSessionFailureFact } from './agent-session-failure'
import {
  AGENT_STARTING,
  AGENT_STILL_WORKING,
  BACKGROUND_TASKS_RUNNING,
  QUIT_TERMINAL_AGENT,
  START_NEW_CHAT,
  TERMINAL_AGENT_HOLDS_CHAT,
  WAIT_FOR_BACKGROUND_TASKS,
  WAIT_FOR_START
} from './agent-session-failure-copy'
import type {
  AgentSessionFailureSurface,
  AgentSessionFailureWordsContext
} from './agent-session-failure-words'
import { PRODUCT_NAME } from './product-brand'

/** Every sentence a notice is made of. Desktop translates each whole sentence with this as its
 *  fallback; mobile shows it as is. */
export const AGENT_SESSION_WRITE_NOTICE_COPY = {
  notDoneReadHistory: "This chat's history couldn't be loaded.",
  notDoneSend: 'Your message was not sent.',
  tryAgainComposerSend: 'Send it again.',
  messageNotSaved: "Couldn't save your message.",
  notDoneStop: "The agent wasn't stopped.",
  notDoneStopTask: "The background task wasn't stopped.",
  notDoneStopTasks: "The background tasks weren't stopped.",
  notDoneAnswer: 'Your answer was not sent.',
  notDoneOption: "The setting wasn't changed.",
  notDoneCommand: "The command didn't run.",
  notDoneGoal: "The goal wasn't changed.",
  notDoneQueuedEdit: "Your edit wasn't saved.",
  restartFailed: "The agent couldn't restart.",
  capacity: `${PRODUCT_NAME} on the computer running this chat has hit a request limit. Update ${PRODUCT_NAME} there, then try again.`,
  outcomeUnknown: `${PRODUCT_NAME} couldn't confirm what happened. Check the chat.`,
  sendOutcomeLost: `${PRODUCT_NAME} couldn't confirm your message reached the agent. Check the chat, then send it again if needed.`,
  continuationSuperseded: 'This chat has moved on. Check the latest messages before continuing.',
  questionChanged: 'This question was already answered or has changed.',
  cancelNotSaved: "Couldn't cancel this question or approval.",
  historyUnreadable: `${PRODUCT_NAME} couldn't read this chat's saved history.`,
  historyUnusable: 'Unable to load this chat.',
  historyUnavailable: `${PRODUCT_NAME} couldn't open this chat's history right now.`,
  savedByNewerOrca: `Chats were saved by a newer ${PRODUCT_NAME}.`,
  updateOrcaToKeepUsing: `Update ${PRODUCT_NAME} to keep using them.`,
  chatSavedByNewerOrca: `This chat was saved by a newer ${PRODUCT_NAME}.`,
  updateOrcaToOpenChat: `Update ${PRODUCT_NAME} to open it.`,
  unsupported: `This needs a newer ${PRODUCT_NAME} on the computer running this chat. Update ${PRODUCT_NAME} there, then try again.`,
  notAvailable: "This isn't available in this chat.",
  cannotRunHere: `${PRODUCT_NAME} can't run this agent in a chat here.`,
  unreachable: `${PRODUCT_NAME} couldn't reach the agent.`,
  recordFailed: `${PRODUCT_NAME} couldn't save this to the chat's history.`,
  attachmentExpired: 'This attachment expired.',
  reattachFile: 'Remove it and attach it again.',
  conversationCleared: 'This conversation has been cleared.',
  openCurrentConversation: 'Open the current conversation to continue.',
  clearUnfinished: "The last /clear didn't finish.",
  commandRunning: 'A /compact or /clear is still running.',
  waitForCommand: 'Wait for the /compact or /clear to finish.',
  agentStarting: AGENT_STARTING,
  waitForStart: WAIT_FOR_START,
  turnActive: 'The agent is still responding.',
  waitForTurn: 'Wait for the agent to finish responding, or stop it.',
  promptPending: 'The agent is waiting for an answer to a question or approval.',
  answerFirst: 'Answer the question or approval first.',
  backgroundTasksRunning: BACKGROUND_TASKS_RUNNING,
  waitForBackgroundTasks: WAIT_FOR_BACKGROUND_TASKS,
  messagesUnsettled: "A message you sent earlier isn't confirmed yet.",
  settleEarlierMessage: 'Wait for your earlier message to go through, or retry it.',
  agentStillWorking: AGENT_STILL_WORKING,
  runClearWhenDone: "Run /clear when it's done.",
  clearAfterAnswer: "Answer the agent's question or approval, then run /clear.",
  runCompactWhenDone: "Run /compact when it's done.",
  compactAfterAnswer: "Answer the agent's question or approval, then run /compact.",
  clearAfterRetry: 'Retry your earlier message, then run /clear.',
  compactAfterRetry: 'Retry your earlier message, then run /compact.',
  clearAfterSending: 'Your earlier message is still being sent. Run /clear once it has gone.',
  compactAfterSending: 'Your earlier message is still being sent. Run /compact once it has gone.',
  queueTooLarge: 'Too much text is waiting in the queue.',
  shrinkQueue: 'Delete a queued message, or wait for one to go through, then try again.',
  optionRejected: "The agent didn't accept this setting.",
  goalsUnsupported: "This agent doesn't support goals.",
  agentRefused: 'The agent turned this down.',
  ownerUnproven: 'The previous agent in this chat may still be running.',
  reopenChat: 'Reopen the chat to check again.',
  terminalAgentHoldsChat: TERMINAL_AGENT_HOLDS_CHAT,
  quitTerminalAgent: QUIT_TERMINAL_AGENT,
  hostReconciling: `${PRODUCT_NAME} is still checking on this chat after restarting.`,
  waitMoment: 'Wait a moment.',
  recordUnreadable: `${PRODUCT_NAME} couldn't read this chat's saved state.`,
  chatNotFound: `${PRODUCT_NAME} can't find this chat.`,
  startNewChat: START_NEW_CHAT,
  tryAgain: 'Try again.'
} as const

export type AgentSessionWriteNoticeSentence = keyof typeof AGENT_SESSION_WRITE_NOTICE_COPY
/** A failure fact, worded where it is shown so desktop can say it in the reader's language. */
export type AgentSessionWriteNoticeFailurePart = {
  failure: AgentSessionFailureFact
  surface: AgentSessionFailureSurface
  context: AgentSessionFailureWordsContext
}
/** A notice as whole sentences, each translated on its own; `text` is words someone else wrote: a
 *  provider's, or a host's sentence with no fact beside it. */
export type AgentSessionWriteNoticePart =
  | AgentSessionWriteNoticeSentence
  | { text: string }
  | AgentSessionWriteNoticeFailurePart

/** Causes that already say the history can't be read here, so no sentence after them says it
 *  again. */
export const AGENT_SESSION_HISTORY_UNREAD_CAUSES: ReadonlySet<AgentSessionWriteNoticeSentence> =
  new Set([
    'historyUnusable',
    'historyUnavailable',
    'historyUnreadable',
    'savedByNewerOrca',
    'chatSavedByNewerOrca'
  ])
