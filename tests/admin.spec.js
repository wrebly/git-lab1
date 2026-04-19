import { test, expect } from '@playwright/test';

test.describe('E2E: Бронювання та Адмінка', () => {
  
  test.use({ baseURL: 'http://localhost:3000' });

  test('Успішне бронювання та закриття вікна оплати', async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('Your name').fill('Богдан Лесняк');
    await page.getByPlaceholder('+91 XXXXX XXXXX').fill('+380991234567');
    await page.locator('select').nth(0).selectOption({ index: 1 }); 
    await page.locator('select').nth(1).selectOption({ index: 2 }); 
    await page.locator('select').nth(2).selectOption({ index: 1 }); 
    await page.locator('button', { hasText: 'RESERVE MY TABLE' }).click();
    const modalHeader = page.locator('text=ALMOST THERE!');
    await expect(modalHeader).toBeVisible({ timeout: 10000 });
    const refCode = page.locator('text=REF# TK-');
    await expect(refCode).toBeVisible();
    const payLaterBtn = page.locator('button', { hasText: "I'll Pay Later" });
    await payLaterBtn.click();
    await expect(modalHeader).toBeHidden();
  });

  test('Некоректний номер', async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('Your name').fill('Тест Помилки');
    await page.getByPlaceholder('+91 XXXXX XXXXX').fill('123'); 
    await page.locator('button', { hasText: 'RESERVE MY TABLE' }).click();
    const modalHeader = page.locator('text=ALMOST THERE!');
    await expect(modalHeader).not.toBeVisible({ timeout: 3000 });
  });

  test('Авторизація в адмінку', async ({ page }) => {
    await page.goto('/admin');
    await page.locator('#loginEmail').fill('admin@tandoor.com');
    await page.locator('#loginPassword').fill('password123');
    await page.locator('button', { hasText: 'Sign In' }).click();
    await expect(page.locator('#appShell')).toBeVisible({ timeout: 5000 });
  });
});