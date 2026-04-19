// playwright.config.js
import { defineConfig } from '@playwright/test';

export default defineConfig({
  reporter: 'html', // ОСЬ ЦЕЙ РЯДОК МАЄ БУТИ ТУТ
  use: {
    baseURL: 'http://localhost:3000',
  },
});
