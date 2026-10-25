import { expect, test } from './helpers/orca-app'

test.skip(process.platform === 'win32', 'POSIX fresh-startup golden; Windows has its own suite')

test.describe('POSIX fresh startup golden', () => {
  test.use({ dismissOnboarding: false, seedTestRepo: false })

  test('fresh profile reaches onboarding normally @posix-profile-index-golden', async ({
    orcaPage
  }) => {
    await expect(
      orcaPage.getByRole('heading', { name: /Pick your default agent|기본 agent를 선택하세요/i })
    ).toBeVisible({ timeout: 30_000 })
    const onboarding = orcaPage.locator('[data-onboarding-modal]')
    await expect(onboarding.getByText('Aster', { exact: true })).toBeVisible()
    await expect(onboarding).not.toContainText('Orca')
  })
})
