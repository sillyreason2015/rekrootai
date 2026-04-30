import { test, expect } from '@playwright/test'

test('login screen renders and mock login card is visible', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByText('Welcome back')).toBeVisible()
  await expect(page.getByText('Mock login')).toBeVisible()
})
