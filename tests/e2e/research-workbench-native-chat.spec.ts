import { rm } from 'node:fs/promises'
import path from 'node:path'
import { expect } from './helpers/orca-app'
import { waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import { buildFakeAgentCommandOverride } from './helpers/fake-agent-command-override'
import { SUPPORTED, createChatOnHost, test } from './helpers/structured-claude-stub'

test('Aster New conversation starts a chat instead of a CLI terminal', async ({
  orcaPage: page,
  claudeStub,
  registerPostElectronShutdownCleanup
}) => {
  test.skip(!SUPPORTED, 'the Claude stub wrapper is POSIX-only')
  test.setTimeout(120_000)
  await waitForSessionReady(page)
  await waitForActiveWorktree(page)
  await page.evaluate(async (command) => {
    await window.__store?.getState().updateSettings({
      agentCmdOverrides: { claude: command }
    })
  }, buildFakeAgentCommandOverride(claudeStub.command))

  await expect(page.getByRole('heading', { name: 'Workbench', exact: true })).toBeVisible()
  const layoutSwitcher = page.getByRole('radiogroup', { name: 'Layout' })
  await expect(layoutSwitcher.getByRole('radio', { name: 'Research' })).toBeChecked()
  await expect(layoutSwitcher.getByRole('radio', { name: 'Code' })).toBeVisible()
  await page.getByRole('button', { name: 'More options' }).click()
  const optionsMenu = page.getByRole('menu')
  await expect(optionsMenu.getByRole('menuitem', { name: 'Settings' })).toBeVisible()
  await expect(
    optionsMenu.getByRole('menuitem', { name: /Mobile|Tasks|Automations|Skills|Artifacts/ })
  ).toHaveCount(0)
  await optionsMenu.getByRole('menuitem', { name: 'Settings' }).click()
  await expect(page.getByRole('button', { name: 'Back to app' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Experimental' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Automations' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Back to app' }).click()
  await page.evaluate(async () => {
    await window.__store?.getState().updateSettings({ experimentalNativeChat: false })
  })
  await expect
    .poll(async () => (await page.evaluate(() => window.api.settings.get())).experimentalNativeChat)
    .toBe(true)
  await page.getByRole('button', { name: 'New tab' }).first().click()
  const tabMenu = page.getByRole('menu', { name: 'New tab' })
  await expect(tabMenu.getByTitle('Start a chat with Claude')).toBeVisible({ timeout: 30_000 })
  await expect(tabMenu.getByTitle('Launch Claude in a new terminal')).toHaveCount(0)
  await page.keyboard.press('Escape')
  const navigation = page.getByRole('navigation', { name: 'Research navigation' })
  const workspacePath = await page.evaluate(() => {
    const state = window.__store!.getState()
    return Object.values(state.worktreesByRepo)
      .flat()
      .find((entry) => entry.id === state.activeWorktreeId)?.path
  })
  if (!workspacePath) {
    throw new Error('No workspace path for catalog test')
  }
  registerPostElectronShutdownCleanup(async () => {
    // Why: the worker's test repo is shared, so the .aster/ records this spec creates must not leak.
    await rm(path.join(workspacePath, '.aster'), { recursive: true, force: true })
  })
  await page.evaluate(
    (target) =>
      window.api.researchProjectLayout.createExperiment({
        workspacePath: target,
        name: 'Chat context'
      }),
    workspacePath
  )
  await expect(navigation.getByRole('button', { name: 'Chat context', exact: true })).toBeVisible({
    timeout: 20_000
  })
  await page.getByRole('button', { name: 'New conversation' }).click()
  const conversationMenu = page.getByRole('menu', { name: 'New conversation' })
  await expect(conversationMenu.getByRole('menuitemradio', { name: 'Chat context' })).toHaveCount(0)
  const chatOption = conversationMenu.getByTitle('Start a chat with Claude')
  await expect(chatOption).toBeVisible({ timeout: 30_000 })
  await expect(conversationMenu.getByTitle('Launch Claude in a new terminal')).toHaveCount(0)
  await chatOption.click()

  await expect(page.locator('[data-native-chat-root="true"]')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('[data-native-chat-root="true"] [role="textbox"]')).toBeEditable()
  await expect(page.getByRole('region', { name: 'Conversations' })).toContainText('Claude')
  await expect(page.getByRole('region', { name: 'Conversations' })).not.toContainText(
    'Chat context'
  )
  const research = await page.evaluate(() => window.api.researchRecords.read())
  expect(research.selectedExperimentId).toBe(research.experiments[0]?.id)
  expect(Object.values(research.conversationExperimentIds)).toHaveLength(0)
})

test('Research Workbench shows the workspace agent as a conversation', async ({
  orcaPage: page,
  claudeStub
}, testInfo) => {
  test.skip(!SUPPORTED, 'the Claude stub wrapper is POSIX-only')
  test.setTimeout(120_000)
  await waitForSessionReady(page)
  const worktreeId = await waitForActiveWorktree(page)
  await page.evaluate(async (command) => {
    await window.__store?.getState().updateSettings({
      agentCmdOverrides: { claude: command }
    })
  }, buildFakeAgentCommandOverride(claudeStub.command))

  await expect(page.getByRole('heading', { name: 'Workbench', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Workbench', exact: true })).toBeVisible()
  expect(
    await page.evaluate(async () => (await window.api.settings.get()).experimentalNativeChat)
  ).toBe(true)

  const sessionId = await createChatOnHost(page, worktreeId)
  let tabId: string | undefined
  await expect
    .poll(
      async () => {
        tabId = await page.evaluate(
          ({ workspaceId, id }) =>
            (window.__store?.getState().unifiedTabsByWorktree[workspaceId] ?? []).find(
              (tab) => tab.contentType === 'agent-session' && tab.entityId === id
            )?.id,
          { workspaceId: worktreeId, id: sessionId }
        )
        return tabId
      },
      { timeout: 30_000 }
    )
    .toBeTruthy()
  const chatTab = page.locator(`[data-testid="sortable-tab"][data-tab-id="${tabId}"]`)
  await expect(chatTab).toBeVisible({ timeout: 30_000 })
  const conversations = page.getByRole('region', { name: 'Conversations' })
  const conversationButton = conversations.getByRole('button', {
    name: 'Claude Chat',
    exact: true
  })
  await expect(conversationButton).toHaveCount(1)
  await page
    .getByRole('navigation', { name: 'Research navigation' })
    .getByRole('button', { name: 'Library', exact: true })
    .click()
  await conversationButton.click()
  await expect(page.getByRole('heading', { name: 'Workbench', exact: true })).toBeVisible()
  await expect(page.locator('[data-native-chat-root="true"]')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('[data-terminal-workbench-container]')).toHaveAttribute(
    'aria-hidden',
    'false'
  )
  const composer = page.locator('[data-native-chat-root="true"] [role="textbox"]')
  await expect(composer).toBeEditable({ timeout: 30_000 })
  await composer.fill('Aster chat smoke test')
  await composer.press('Enter')
  await expect(page.getByText('Stub reply.', { exact: true }).first()).toBeVisible({
    timeout: 30_000
  })
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.screenshot({ path: testInfo.outputPath('aster-workspace-chat-1280.png') })
})

test('Workbench asks in the current chat and deletes its session from the conversation menu', async ({
  orcaPage: page,
  claudeStub
}) => {
  test.skip(!SUPPORTED, 'the Claude stub wrapper is POSIX-only')
  test.setTimeout(120_000)
  await waitForSessionReady(page)
  const worktreeId = await waitForActiveWorktree(page)
  await page.evaluate(async (command) => {
    await window.__store?.getState().updateSettings({
      agentCmdOverrides: { claude: command }
    })
  }, buildFakeAgentCommandOverride(claudeStub.command))
  await createChatOnHost(page, worktreeId)

  const conversations = page.getByRole('region', { name: 'Conversations' })
  const options = conversations.getByRole('button', {
    name: 'Conversation options for Claude Chat'
  })
  await options.click()
  await page.getByRole('menuitem', { name: 'Ask an agent in this chat' }).click()
  await expect(page.locator('[data-native-chat-root="true"] [role="textbox"]')).toContainText(
    'Find the most relevant existing Aster agent'
  )

  await options.click()
  await page.getByRole('menuitem', { name: 'Delete conversation…' }).click()
  const confirmation = page.getByRole('dialog', { name: 'Delete Claude Chat?' })
  await expect(confirmation).toContainText('provider may still retain its conversation history')
  await confirmation.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(conversations.getByRole('button', { name: 'Claude Chat', exact: true })).toHaveCount(
    0
  )
})

test('Library reading chats stay in Library while general chats stay in Workbench', async ({
  orcaPage: page,
  claudeStub
}) => {
  test.skip(!SUPPORTED, 'the Claude stub wrapper is POSIX-only')
  test.setTimeout(120_000)
  await waitForSessionReady(page)
  const worktreeId = await waitForActiveWorktree(page)
  await page.evaluate(async (command) => {
    await window.__store?.getState().updateSettings({
      agentCmdOverrides: { claude: command }
    })
  }, buildFakeAgentCommandOverride(claudeStub.command))

  await createChatOnHost(page, worktreeId)
  const workbenchChats = page.getByRole('region', { name: 'Conversations' })
  await expect(
    workbenchChats.getByRole('button', { name: 'Claude Chat', exact: true })
  ).toHaveCount(1)

  await page.getByRole('button', { name: 'Expand Library agents' }).click()
  const libraryChats = page.locator('#research-library-agent-list')
  await libraryChats.getByRole('button', { name: 'Start agent chat' }).click()
  await page.getByRole('menuitem', { name: 'Claude Code' }).click()
  await expect(
    libraryChats.getByRole('button', { name: 'Reading agent', exact: true })
  ).toHaveCount(1)
  await expect(
    workbenchChats.getByRole('button', { name: 'Claude Chat', exact: true })
  ).toHaveCount(1)

  await libraryChats.getByRole('button', { name: 'New agent chat' }).click()
  await page.getByRole('menuitem', { name: 'Claude Code' }).click()
  await expect(
    libraryChats.getByRole('button', { name: 'Reading agent', exact: true })
  ).toHaveCount(2)
  await expect(
    workbenchChats.getByRole('button', { name: 'Claude Chat', exact: true })
  ).toHaveCount(1)

  await page.reload()
  await waitForSessionReady(page)
  await page.getByRole('region', { name: 'Projects' }).getByRole('button').first().click()
  // Why: sidebar sections stay open per project across reloads.
  await expect(page.getByRole('button', { name: 'Collapse Library agents' })).toBeVisible()
  await expect(
    page.locator('#research-library-agent-list').getByRole('button', {
      name: 'Reading agent',
      exact: true
    })
  ).toHaveCount(2)
  await expect(
    page.getByRole('region', { name: 'Conversations' }).getByRole('button', {
      name: 'Claude Chat',
      exact: true
    })
  ).toHaveCount(1)
})

test('Writing chats stay with their Experiment instead of the Workbench list', async ({
  orcaPage: page,
  claudeStub
}) => {
  test.skip(!SUPPORTED, 'the Claude stub wrapper is POSIX-only')
  test.setTimeout(120_000)
  await waitForSessionReady(page)
  const worktreeId = await waitForActiveWorktree(page)
  await page.evaluate(async (command) => {
    await window.__store?.getState().updateSettings({
      agentCmdOverrides: { claude: command }
    })
  }, buildFakeAgentCommandOverride(claudeStub.command))

  await createChatOnHost(page, worktreeId)
  const workbenchChats = page.getByRole('region', { name: 'Conversations' })
  await expect(
    workbenchChats.getByRole('button', { name: 'Claude Chat', exact: true })
  ).toHaveCount(1)
  await page.getByRole('button', { name: 'Create experiment' }).click()
  await page.getByRole('textbox', { name: 'Experiment name' }).fill('Writing placement')
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await page.getByRole('button', { name: 'Expand Writing agents' }).click()
  const writingChats = page.locator('#research-writing-agent-list')
  await writingChats.getByRole('button', { name: 'Start agent chat' }).click()
  await page.getByRole('menuitem', { name: 'Claude Code' }).click()
  await expect(
    writingChats.getByRole('button', { name: 'Writing agent', exact: true })
  ).toHaveCount(1)
  await expect(
    workbenchChats.getByRole('button', { name: 'Claude Chat', exact: true })
  ).toHaveCount(1)
  await writingChats.getByRole('button', { name: 'New agent chat' }).click()
  await page.getByRole('menuitem', { name: 'Claude Code' }).click()
  await expect(
    writingChats.getByRole('button', { name: 'Writing agent', exact: true })
  ).toHaveCount(2)
  await expect(
    workbenchChats.getByRole('button', { name: 'Claude Chat', exact: true })
  ).toHaveCount(1)
})
