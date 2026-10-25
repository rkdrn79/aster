import { describe, expect, it } from 'vitest'
import {
  EXECUTION_HOST_METHODS,
  MOBILE_RPC_METHOD_ROUTES
} from './runtime-rpc-mobile-method-routing'
import { PAIRED_DESKTOP_METHODS } from './runtime-rpc-mobile-paired-desktop-methods'

describe('mobile RPC method routing census', () => {
  it('tags every routed method exactly once', () => {
    expect(PAIRED_DESKTOP_METHODS.length + EXECUTION_HOST_METHODS.length).toBe(
      MOBILE_RPC_METHOD_ROUTES.size
    )
  })

  it.each([
    'jira.status',
    'jira.listIssues',
    'jira.searchIssues',
    'jira.getIssue',
    'jira.issueComments'
  ])('keeps %s on the paired desktop that owns its Jira connection', (method) => {
    expect(MOBILE_RPC_METHOD_ROUTES.get(method)).toBe('paired-desktop')
  })

  it('reads Research records from the paired desktop that owns their metadata', () => {
    expect(MOBILE_RPC_METHOD_ROUTES.get('research.records.read')).toBe('paired-desktop')
    expect(MOBILE_RPC_METHOD_ROUTES.get('research.run.logTail')).toBe('paired-desktop')
  })

  it.each([
    'researchProject.read',
    'researchProject.runRead',
    'researchProject.runLogTail',
    'researchProject.claimsAudit',
    'researchProject.libraryRead',
    'researchRun.status',
    'researchRun.watchList',
    'researchDeadlines.read',
    'researchDeadlines.update',
    'researchCompute.status'
  ])('serves %s on the server the call targets, not the relaying desktop', (method) => {
    expect(MOBILE_RPC_METHOD_ROUTES.get(method)).toBe('execution-host')
  })

  it('routes no per-section collapse write while the sidebar-inputs switch is off', () => {
    expect(MOBILE_RPC_METHOD_ROUTES.has('ui.setCollapsed')).toBe(false)
  })

  it('sends a targeted status to the server, whose features a server workspace gates on', () => {
    expect(MOBILE_RPC_METHOD_ROUTES.get('status.get')).toBe('execution-host')
  })
})
