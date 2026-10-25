import { describe, expect, it, vi } from 'vitest'
import { ALL_RPC_METHODS } from './rpc/methods'
import { MOBILE_RPC_METHOD_ALLOWLIST } from './runtime-rpc/runtime-rpc-mobile-method-allowlist'

// Methods a paired phone calls; they must stay mobile-authorized and registered.
const MOBILE_CLIENT_RPC_METHODS = [
  'accounts.selectClaude',
  'accounts.selectCodex',
  'accounts.selectCodexForTarget',
  'terminal.createAgentSession',
  'terminal.ensureAgentSession',
  'github.updateIssue',
  'github.updatePRState',
  'gitlab.updateIssue',
  'gitlab.updateMR',
  // PR-sidebar reads and mutations.
  'github.repoSlug',
  'github.prForBranch',
  'github.workItemDetails',
  'github.prChecks',
  'github.prCheckDetails',
  'github.listAssignableUsers',
  'github.mergePR',
  'github.setPRAutoMerge',
  'github.requestPRReviewers',
  'github.removePRReviewers',
  'github.rerunPRChecks',
  'github.updatePRTitle',
  'github.addPRReviewCommentReply',
  'github.addIssueComment',
  'github.resolveReviewThread',
  'github.project.updateIssueCommentBySlug',
  'github.project.deleteIssueCommentBySlug',
  'hostedReview.forBranch',
  'runtime.clientCapabilities.update',
  'agentSession.send',
  'agentSession.cancel',
  'agentSession.history',
  'agentSession.hold',
  'agentSession.release'
]

// Why: only a page built with ORCA_SIDEBAR_INPUTS=main calls these, and only such a host serves them.
const MOBILE_SIDEBAR_INPUTS_RPC_METHODS = [
  'sidebarInputs.read',
  'sidebarInputs.repoIcons',
  'ui.setCollapsed'
]

// Shared-control unsubscribe methods a phone's cleanup paths send.
const MOBILE_STREAMING_CLEANUP_RPC_METHODS = [
  'accounts.unsubscribe',
  'browser.screencast.unsubscribe',
  'notifications.unsubscribe',
  'runtime.clientEvents.unsubscribe',
  'session.tabs.unsubscribe',
  'session.tabs.unsubscribeAll',
  'terminal.unsubscribe'
]

function mobileRpcAllowlist(): ReadonlySet<string> {
  return MOBILE_RPC_METHOD_ALLOWLIST
}

function registeredRuntimeMethods(): Set<string> {
  return new Set(ALL_RPC_METHODS.map((method) => method.name))
}

describe('mobile RPC allowlist', () => {
  it('grants Jira reads while keeping credentials, writes, and desktop site selection private', () => {
    const allowed = mobileRpcAllowlist()
    for (const method of [
      'jira.status',
      'jira.listIssues',
      'jira.searchIssues',
      'jira.getIssue',
      'jira.issueComments'
    ]) {
      expect(allowed.has(method), method).toBe(true)
    }
    for (const method of [
      'jira.connect',
      'jira.disconnect',
      'jira.selectSite',
      'jira.createIssue',
      'jira.updateIssue',
      'jira.addIssueComment'
    ]) {
      expect(allowed.has(method), method).toBe(false)
    }
  })

  it('allows every RPC method a paired phone calls', () => {
    // Why: mobile-scoped runtime tokens are checked before dispatch. A mobile
    // feature can compile and still fail at runtime if its method is missing here.
    const allowed = mobileRpcAllowlist()
    const missing = MOBILE_CLIENT_RPC_METHODS.filter((method) => !allowed.has(method))

    expect(missing).toEqual([])
  })

  it('registers every RPC method a paired phone calls', () => {
    // Why: the allowlist check runs before dispatch, but an allowlisted mobile
    // method still fails at runtime if it was never added to ALL_RPC_METHODS.
    const registered = registeredRuntimeMethods()
    const missing = MOBILE_CLIENT_RPC_METHODS.filter((method) => !registered.has(method))

    expect(missing).toEqual([])
  })

  it('allows and registers the sidebar feed the phone reads only in a switched-on build', async () => {
    for (const method of MOBILE_SIDEBAR_INPUTS_RPC_METHODS) {
      expect(mobileRpcAllowlist().has(method)).toBe(false)
    }
    vi.resetModules()
    vi.doMock('../../shared/sidebar-inputs-switch', () => ({ ORCA_SIDEBAR_INPUTS_IS_MAIN: true }))
    try {
      const { MOBILE_RPC_METHOD_ALLOWLIST: switchedOn } =
        await import('./runtime-rpc/runtime-rpc-mobile-method-allowlist')
      const { ALL_RPC_METHODS: switchedOnMethods } = await import('./rpc/methods')
      const registered = new Set<string>(switchedOnMethods.map((method) => method.name))
      for (const method of MOBILE_SIDEBAR_INPUTS_RPC_METHODS) {
        expect(switchedOn.has(method)).toBe(true)
        expect(registered.has(method)).toBe(true)
      }
    } finally {
      vi.doUnmock('../../shared/sidebar-inputs-switch')
      vi.resetModules()
    }
  })

  it('allows every cleanup RPC for mobile streaming subscriptions', () => {
    const allowed = mobileRpcAllowlist()
    const missing = MOBILE_STREAMING_CLEANUP_RPC_METHODS.filter((method) => !allowed.has(method))

    expect(missing).toEqual([])
  })

  it('does not grant mobile credentials control over host updates', () => {
    const allowed = mobileRpcAllowlist()
    expect(
      ['updater.getStatus', 'updater.check', 'updater.download', 'updater.install'].filter(
        (method) => allowed.has(method)
      )
    ).toEqual([])
  })

  it('exposes only the mobile structured agent-session surface', () => {
    expect(
      [...mobileRpcAllowlist()].filter((method) => method.startsWith('agentSession.'))
    ).toEqual([
      'agentSession.createSupport',
      'agentSession.create',
      'agentSession.ensure',
      'agentSession.reveal',
      'agentSession.send',
      'agentSession.cancel',
      'agentSession.queuedMessageSend',
      'agentSession.queuedMessageDelete',
      'agentSession.queuedMessageUpdate',
      'agentSession.queuedMessageEditHold',
      'agentSession.queuedMessagesResume',
      'agentSession.close',
      'agentSession.respondToApproval',
      'agentSession.respondToQuestion',
      'agentSession.setOption',
      'agentSession.handoffStatus',
      'agentSession.options',
      'agentSession.modelCatalog',
      'agentSession.conversationCommand',
      'agentSession.commands',
      'agentSession.history',
      'agentSession.currentRequests',
      'agentSession.subscribe',
      'agentSession.unsubscribe',
      'agentSession.subscribeStatus',
      'agentSession.readVisual',
      'agentSession.item',
      'agentSession.hold',
      'agentSession.release'
    ])
    expect(mobileRpcAllowlist().has('agentSession.attach')).toBe(false)
  })

  it('lets a phone upload chat attachments but not read the store back', () => {
    expect(
      [...mobileRpcAllowlist()].filter((method) => method.startsWith('agentSessionAttachment.'))
    ).toEqual([
      'agentSessionAttachment.uploadStart',
      'agentSessionAttachment.uploadAppend',
      'agentSessionAttachment.uploadCommit',
      'agentSessionAttachment.uploadAbort'
    ])
  })
})
