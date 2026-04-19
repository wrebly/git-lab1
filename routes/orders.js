// tests/admin.spec.js
import { test, expect } from '@playwright/test';

test.describe('Наскрізні E2E тести (Критичний шлях)', () => {
  
  test.use({ baseURL: 'http://localhost:3000' });

  // --- СЦЕНАРІЙ 1: АВТОРИЗАЦІЯ (Адмінка) ---
  test('Сценарій 1: Успішна авторизація власника', async ({ page }) => {
    await page.goto('/admin');
    await page.locator('input[type="email"]').fill('admin@tandoor.com');
    await page.locator('#loginPassword').fill('password123');

    await Promise.all([
      page.waitForResponse(res => res.url().includes('/api/auth') && res.status() === 200),
      page.locator('button', { hasText: 'Sign In' }).click(),
    ]);

    await expect(page.locator('#loginPassword')).toBeHidden({ timeout: 10000 });
  });

  // --- СЦЕНАРІЙ 2: БРОНЮВАННЯ (Твій критичний шлях) ---
  test('Сценарій 2: Успішне бронювання столика клієнтом', async ({ page }) => {
    // 1. Відкриваємо головну сторінку
    await page.goto('/');

    // 2. Скролимо до форми "Book A Table" (якщо потрібно) або просто шукаємо поля
    // Використовуємо плейсхолдери, які видно на твоєму скриншоті
    await page.getByPlaceholder('Your name').fill('Богдан Лесняк');
    await page.getByPlaceholder('+91 XXXXX XXXXX').fill('+380991234567');

    // 3. Вибираємо дату та час (вибираємо перші доступні значення в селектах)
    // Оскільки на скриншоті видно випадаючі списки (Select a time, Number of guests)
    await page.locator('select').nth(0).selectOption({ index: 1 }); // Time Slot
    await page.locator('select').nth(1).selectOption({ index: 1 }); // Number of Guests
    await page.locator('select').nth(2).selectOption({ index: 1 }); // Dining Preference

    // 4. Натискаємо кнопку бронювання
    const reserveButton = page.locator('button', { hasText: 'RESERVE MY TABLE' });
    await reserveButton.click();

    // 5. Перевіряємо результат
    // Після натискання має з'явитися або повідомлення про успіх, 
    // або нас має перекинути на підтвердження. 
    // Перевіримо, що кнопка стала неактивною або з'явився текст подяки
    await expect(page.locator('text=success, text=thank, text=confirmed').first()).toBeVisible({ timeout: 10000 });
  });

  // --- СЦЕНАРІЙ 3: ВАЛІДАЦІЯ ---
  test('Сценарій 3: Перевірка помилки при неправильному паролі', async ({ page }) => {
    await page.goto('/admin');
    await page.locator('input[type="email"]').fill('admin@tandoor.com');
    await page.locator('#loginPassword').fill('wrong_password');
    await page.locator('button', { hasText: 'Sign In' }).click();
    await expect(page.locator('#loginPassword')).toBeVisible();
  });
});