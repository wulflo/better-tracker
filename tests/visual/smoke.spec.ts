import { test, expect } from '@playwright/test';

test('app loads without console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/');
  await expect(page.locator('body')).toBeVisible();
  expect(errors).toHaveLength(0);
});