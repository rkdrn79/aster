import { expect } from './helpers/orca-app'
import { waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import { buildFakeAgentCommandOverride } from './helpers/fake-agent-command-override'
import { SUPPORTED, createChatOnHost, test } from './helpers/structured-claude-stub'

async function waitForChatTab(
  page: Parameters<typeof createChatOnHost>[0],
  workspaceId: string,
  sessionId: string
): Promise<string> {
  let tabId = ''
  await expect
    .poll(
      async () => {
        tabId = await page.evaluate(
          ({ workspaceId, sessionId }) =>
            window.__store
              ?.getState()
              .unifiedTabsByWorktree[workspaceId]?.find(
                (tab) => tab.contentType === 'agent-session' && tab.entityId === sessionId
              )?.id ?? '',
          { workspaceId, sessionId }
        )
        return tabId
      },
      { timeout: 30_000 }
    )
    .not.toBe('')
  return tabId
}

test('existing agents stay visible and reopen across worktrees', async ({
  orcaPage: page,
  claudeStub
}, testInfo) => {
  test.skip(!SUPPORTED, 'the Claude stub wrapper is POSIX-only')
  test.setTimeout(180_000)
  await waitForSessionReady(page)
  const primaryId = await waitForActiveWorktree(page)
  await page.evaluate(async (command) => {
    await window.__store?.getState().updateSettings({ agentCmdOverrides: { claude: command } })
  }, buildFakeAgentCommandOverride(claudeStub.command))
  const secondary = await page.evaluate(
    (id) =>
      Object.values(window.__store!.getState().worktreesByRepo)
        .flat()
        .find((entry) => entry.id !== id && !entry.isMainWorktree),
    primaryId
  )
  if (!secondary) {
    throw new Error('Expected a secondary worktree in the isolated test project')
  }
  const primarySession = await createChatOnHost(page, primaryId)
  const primaryTab = await waitForChatTab(page, primaryId, primarySession)
  await page
    .getByRole('region', { name: 'Conversations' })
    .getByRole('button', { name: 'Claude Chat', exact: true })
    .click()
  const composer = page.locator('[data-native-chat-root="true"]:visible [role="textbox"]')
  await composer.fill('Remember this worktree conversation')
  await composer.press('Enter')
  await expect(page.getByText('Stub reply.', { exact: true }).first()).toBeVisible({
    timeout: 30_000
  })
  const secondarySession = await createChatOnHost(page, secondary.id)
  const secondaryTab = await waitForChatTab(page, secondary.id, secondarySession)
  const conversations = page.getByRole('region', { name: 'Conversations' })
  const originalRow = conversations.getByRole('button', {
    name: 'Remember this worktree conversation',
    exact: true
  })
  const secondaryRow = conversations.getByRole('button', { name: 'Claude Chat', exact: true })
  await expect(originalRow).toBeVisible()
  await expect(secondaryRow).toBeVisible()
  await expect(conversations.getByRole('button', { name: /e2e-secondary/ })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('01-both-worktrees.png') })
  await secondaryRow.click()
  await expect
    .poll(() => page.evaluate(() => window.__store!.getState().activeWorktreeId))
    .toBe(secondary.id)
  await expect(
    page.locator(`[data-testid="sortable-tab"][data-tab-id="${secondaryTab}"]`)
  ).toBeVisible()
  await expect(originalRow).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('02-secondary-active.png') })
  await originalRow.click()
  await expect
    .poll(() => page.evaluate(() => window.__store!.getState().activeWorktreeId))
    .toBe(primaryId)
  await expect(
    page.locator(`[data-testid="sortable-tab"][data-tab-id="${primaryTab}"]`)
  ).toBeVisible()
  await expect(page.getByText('Stub reply.', { exact: true }).first()).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('03-primary-reopened.png') })
})

test('creating a new worktree keeps an existing conversation reachable', async ({
  orcaPage: page,
  claudeStub
}, testInfo) => {
  test.skip(!SUPPORTED, 'the Claude stub wrapper is POSIX-only')
  test.setTimeout(180_000)
  await waitForSessionReady(page)
  const originalId = await waitForActiveWorktree(page)
  await page.evaluate(async (command) => {
    await window.__store?.getState().updateSettings({ agentCmdOverrides: { claude: command } })
  }, buildFakeAgentCommandOverride(claudeStub.command))
  const originalSession = await createChatOnHost(page, originalId)
  await waitForChatTab(page, originalId, originalSession)
  await page.getByRole('button', { name: 'New conversation' }).click()
  const menu = page.getByRole('menu', { name: 'New conversation' })
  await menu.getByRole('menuitem', { name: /New isolated copy/ }).click()
  const dialog = page.getByRole('dialog', { name: /Create (Workspace|Worktree)/i })
  await expect(dialog).toBeVisible()
  await dialog.getByPlaceholder(/Type a name/i).fill(`agent-verification-${Date.now()}`)
  await dialog.getByRole('button', { name: /Create (Workspace|Worktree)/i }).click()
  await expect(dialog).toBeHidden({ timeout: 30_000 })
  await expect
    .poll(() => page.evaluate(() => window.__store!.getState().activeWorktreeId), {
      timeout: 30_000
    })
    .not.toBe(originalId)
  const conversations = page.getByRole('region', { name: 'Conversations' })
  if (
    (await conversations.getByRole('button', { name: 'Claude Chat', exact: true }).count()) === 1
  ) {
    await page.getByRole('button', { name: 'New conversation' }).click()
    const newWorkspaceMenu = page.getByRole('menu', { name: 'New conversation' })
    const start = newWorkspaceMenu.getByTitle('Start a chat with Claude')
    await expect(start).toBeVisible({ timeout: 30_000 })
    await start.click()
  }
  await expect(conversations.getByRole('button', { name: 'Claude Chat', exact: true })).toHaveCount(
    2,
    { timeout: 30_000 }
  )
  await page.screenshot({ path: testInfo.outputPath('06-after-worktree-create.png') })
  // Why first: workspace groups keep a stable order with the main workspace on top.
  await conversations.getByRole('button', { name: 'Claude Chat', exact: true }).first().click()
  await expect
    .poll(() => page.evaluate(() => window.__store!.getState().activeWorktreeId))
    .toBe(originalId)
  await page.screenshot({ path: testInfo.outputPath('07-original-after-create.png') })
})

test('new Workbench agents open as main tabs without splitting', async ({
  orcaPage: page,
  claudeStub
}, testInfo) => {
  test.skip(!SUPPORTED, 'the Claude stub wrapper is POSIX-only')
  test.setTimeout(180_000)
  await waitForSessionReady(page)
  const workspaceId = await waitForActiveWorktree(page)
  await page.evaluate(async (command) => {
    await window.__store?.getState().updateSettings({ agentCmdOverrides: { claude: command } })
  }, buildFakeAgentCommandOverride(claudeStub.command))
  const firstSession = await createChatOnHost(page, workspaceId)
  const firstTab = await waitForChatTab(page, workspaceId, firstSession)
  await page
    .getByRole('region', { name: 'Conversations' })
    .getByRole('button', { name: 'Claude Chat', exact: true })
    .click()
  await expect(
    page.locator(`[data-testid="sortable-tab"][data-tab-id="${firstTab}"]`)
  ).toBeVisible()
  const before = await page.evaluate(
    (id) => window.__store!.getState().groupsByWorktree[id]?.length ?? 0,
    workspaceId
  )
  await page.getByRole('button', { name: 'New conversation' }).click()
  const menu = page.getByRole('menu', { name: 'New conversation' })
  await expect(menu.getByText(/This workspace ·/)).toBeVisible()
  await expect(menu.getByRole('menuitem', { name: /New isolated copy/ })).toBeVisible()
  const startChat = menu.getByTitle('Start a chat with Claude')
  await expect(startChat).toBeVisible({ timeout: 30_000 })
  await startChat.click()
  await expect(menu).toBeHidden()
  await expect
    .poll(
      () =>
        page.evaluate(
          (id) =>
            (window.__store!.getState().unifiedTabsByWorktree[id] ?? []).filter(
              (tab) => tab.contentType === 'agent-session'
            ).length,
          workspaceId
        ),
      { timeout: 30_000 }
    )
    .toBe(2)
  const layout = await page.evaluate((id) => {
    const state = window.__store!.getState()
    return {
      groups: (state.groupsByWorktree[id] ?? []).map((group) => ({
        id: group.id,
        tabOrder: group.tabOrder
      })),
      agents: (state.unifiedTabsByWorktree[id] ?? [])
        .filter((tab) => tab.contentType === 'agent-session')
        .map((tab) => ({ id: tab.id, groupId: tab.groupId }))
    }
  }, workspaceId)
  expect(layout.groups.length).toBe(before)
  expect(new Set(layout.agents.map((agent) => agent.groupId)).size).toBe(1)
  await expect(page.locator('[data-native-chat-root="true"]:visible')).toHaveCount(1)
  await page.screenshot({ path: testInfo.outputPath('04-main-tab.png') })
  await page.getByRole('button', { name: 'Background tasks' }).click()
  const tasksDialog = page.getByRole('dialog', { name: 'Background tasks' })
  await expect(tasksDialog).toBeVisible()
  await expect(tasksDialog.getByRole('region', { name: 'Live agent work' })).toBeVisible()
  await expect(tasksDialog.getByText('No delegated tasks yet.')).toBeVisible()
  await page.waitForTimeout(350)
  await page.screenshot({ path: testInfo.outputPath('05-background-tasks.png') })
  await page.evaluate((id) => {
    const state = window.__store!.getState()
    const tab = state.unifiedTabsByWorktree[id]?.find(
      (candidate) =>
        candidate.contentType === 'agent-session' &&
        candidate.groupId === state.groupsByWorktree[id]?.[0]?.id
    )
    if (!tab) {
      throw new Error('Expected a chat tab for the background task fixture')
    }
    state.setAgentStatus(
      `${tab.id}:background-task-verification`,
      {
        state: 'working',
        prompt: 'Review the draft',
        agentType: 'claude',
        subagents: [
          {
            id: 'reviewer',
            agentType: 'reviewer',
            description: 'Checking the manuscript citations',
            state: 'working',
            startedAt: Date.now()
          }
        ]
      },
      'Claude Chat',
      undefined,
      { tabId: tab.id, worktreeId: id },
      { structuredHostOwned: true }
    )
  }, workspaceId)
  await expect(tasksDialog.getByText('Live agent work · 1')).toBeVisible()
  await expect(tasksDialog.getByText('Checking the manuscript citations')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('06-reported-background-task.png') })
})

test('background research agents stay out of Workbench until opened there', async ({
  orcaPage: page,
  claudeStub
}) => {
  test.skip(!SUPPORTED, 'the Claude stub wrapper is POSIX-only')
  test.setTimeout(120_000)
  await waitForSessionReady(page)
  const workspaceId = await waitForActiveWorktree(page)
  await page.evaluate(async (command) => {
    await window.__store?.getState().updateSettings({ agentCmdOverrides: { claude: command } })
  }, buildFakeAgentCommandOverride(claudeStub.command))
  const navigation = page.getByRole('navigation', { name: 'Research navigation' })
  await navigation.getByRole('button', { name: 'More options' }).click()
  await page.getByRole('menuitem', { name: 'Organize with agent in background' }).click()

  let sessionId = ''
  await expect
    .poll(async () => {
      const document = await page.evaluate(() => window.api.researchRecords.read())
      sessionId =
        document.delegations.find((entry) => entry.task === 'Organize project folders')
          ?.sessionId ?? ''
      return sessionId
    })
    .not.toBe('')
  const tabId = await waitForChatTab(page, workspaceId, sessionId)
  const tab = page.locator(`[data-testid="sortable-tab"][data-tab-id="${tabId}"]`)
  const tasks = navigation.getByRole('region', { name: 'Background agent tasks' })
  await expect(tasks.getByText('Organize project folders')).toBeVisible()
  await expect(tab).toHaveCount(0)
  await expect(
    navigation.getByRole('region', { name: 'Conversations' }).getByRole('button', {
      name: 'Claude Chat',
      exact: true
    })
  ).toHaveCount(0)

  await tasks.getByRole('button', { name: 'Open Organize project folders in Workbench' }).click()
  await expect(tab).toBeVisible()
  await tasks
    .getByRole('button', { name: 'Return Organize project folders to Background tasks' })
    .click()
  await expect(tab).toHaveCount(0)
  expect(
    (await page.evaluate(() => window.api.researchRecords.read())).delegations.find(
      (entry) => entry.task === 'Organize project folders'
    )?.workbenchVisible
  ).toBe(false)
})

test('an existing chat can be moved into its own pane from the conversation menu', async ({
  orcaPage: page,
  claudeStub
}, testInfo) => {
  test.skip(!SUPPORTED, 'the Claude stub wrapper is POSIX-only')
  test.setTimeout(180_000)
  await waitForSessionReady(page)
  const workspaceId = await waitForActiveWorktree(page)
  await page.evaluate(async (command) => {
    await window.__store?.getState().updateSettings({ agentCmdOverrides: { claude: command } })
  }, buildFakeAgentCommandOverride(claudeStub.command))
  const first = await createChatOnHost(page, workspaceId)
  const firstTab = await waitForChatTab(page, workspaceId, first)
  const second = await createChatOnHost(page, workspaceId)
  const secondTab = await waitForChatTab(page, workspaceId, second)
  const before = await page.evaluate(
    ({ workspaceId, firstTab, secondTab }) => {
      const state = window.__store!.getState()
      const tabs = state.unifiedTabsByWorktree[workspaceId] ?? []
      return {
        groups: state.groupsByWorktree[workspaceId]?.length ?? 0,
        first: tabs.find((tab) => tab.id === firstTab)?.groupId,
        second: tabs.find((tab) => tab.id === secondTab)?.groupId
      }
    },
    { workspaceId, firstTab, secondTab }
  )
  expect(before.first).toBe(before.second)
  const conversations = page.getByRole('region', { name: 'Conversations' })
  await expect(conversations.getByRole('button', { name: 'Claude Chat', exact: true })).toHaveCount(
    2
  )
  await conversations.getByRole('button', { name: 'Claude Chat', exact: true }).first().click()
  await expect(page.locator('[data-native-chat-root="true"]:visible')).toHaveCount(1)
  await conversations
    .getByRole('button', { name: 'Conversation options for Claude Chat' })
    .last()
    .click()
  await page.getByRole('menuitem', { name: 'Show in separate pane' }).click()
  await expect
    .poll(() =>
      page.evaluate(
        (id) => window.__store!.getState().groupsByWorktree[id]?.length ?? 0,
        workspaceId
      )
    )
    .toBeGreaterThan(before.groups)
  const after = await page.evaluate(
    ({ workspaceId, firstTab, secondTab }) => {
      const tabs = window.__store!.getState().unifiedTabsByWorktree[workspaceId] ?? []
      return {
        first: tabs.find((tab) => tab.id === firstTab)?.groupId,
        second: tabs.find((tab) => tab.id === secondTab)?.groupId
      }
    },
    { workspaceId, firstTab, secondTab }
  )
  expect(after.first).not.toBe(after.second)
  await expect(page.locator('[data-native-chat-root="true"]:visible')).toHaveCount(2)
  await page.waitForTimeout(250)
  await page.screenshot({ path: testInfo.outputPath('05-manual-split.png') })
})
