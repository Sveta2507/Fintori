import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_URL = `file://${path.join(__dirname, '../app.html')}`;

async function fillStep1(page, r1 = '10000', r2 = '11000', r3 = '12000') {
  await page.fill('#r1', r1);
  await page.fill('#r2', r2);
  await page.fill('#r3', r3);
}

async function fillStep2(page) {
  await page.fill('#cogs', '3000');
  await page.fill('#dlab', '1000');
  await page.fill('#rent', '1500');
  await page.fill('#wages', '3000');
  await page.fill('#nic', '300');
  await page.fill('#loan', '200');
}

async function fillStep3(page) {
  await page.fill('#cash', '20000');
  await page.fill('#debtors', '5000');
  await page.fill('#creditors', '2000');
  await page.fill('#debt', '5000');
  await page.fill('#stock', '3000');
  await page.fill('#emp', '5');
}

// ─────────────────────────────────────────────
// Навигация и блокировки шагов
// ─────────────────────────────────────────────
test.describe('Навигация между шагами', () => {
  test('шаг 2 заблокирован до заполнения шага 1', async ({ page }) => {
    await page.goto(APP_URL);
    const btn2 = page.locator('#sb2');
    await expect(btn2).toBeDisabled();
  });

  test('шаг 3 заблокирован до заполнения шага 2', async ({ page }) => {
    await page.goto(APP_URL);
    await fillStep1(page);
    await page.click('text=Next');
    const btn3 = page.locator('#sb3');
    await expect(btn3).toBeDisabled();
  });

  test('кнопка Next активирует шаг 2 после заполнения шага 1', async ({ page }) => {
    await page.goto(APP_URL);
    await fillStep1(page);
    await page.locator('#s1 .btn-navy').click();
    await expect(page.locator('#s2')).toHaveClass(/active/);
  });

  test('кнопка Back возвращает к шагу 1', async ({ page }) => {
    await page.goto(APP_URL);
    await fillStep1(page);
    await page.locator('#s1 .btn-navy').click();
    await page.locator('#s2 .btn-ghost').click();
    await expect(page.locator('#s1')).toHaveClass(/active/);
  });
});

// ─────────────────────────────────────────────
// Валидация шага 1 (Revenue)
// ─────────────────────────────────────────────
test.describe('Шаг 1 — Валидация Revenue', () => {
  test('пустые поля: показывает ошибки при попытке перейти', async ({ page }) => {
    await page.goto(APP_URL);
    await page.locator('#s1 .btn-navy').click();
    await expect(page.locator('.field-error').first()).toBeVisible();
  });

  test('r1=0: ошибка "Revenue must be greater than zero"', async ({ page }) => {
    await page.goto(APP_URL);
    await page.fill('#r1', '0');
    await page.fill('#r2', '10000');
    await page.fill('#r3', '10000');
    await page.locator('#s1 .btn-navy').click();
    await expect(page.locator('.field-error-tip')).toContainText('greater than zero');
  });

  test('отрицательный revenue: ошибка валидации', async ({ page }) => {
    await page.goto(APP_URL);
    await page.fill('#r1', '-5000');
    await page.fill('#r2', '10000');
    await page.fill('#r3', '10000');
    await page.locator('#s1 .btn-navy').click();
    await expect(page.locator('.field-error-tip')).toBeVisible();
  });

  test('буквы в поле revenue: браузер блокирует ввод, поле остаётся пустым', async ({ page }) => {
  await page.goto(APP_URL);
  await page.locator('#r1').focus();
  await page.keyboard.type('abc'); // не даст ввести в number-поле
  await page.fill('#r2', '10000');
  await page.fill('#r3', '10000');
  await page.locator('#s1 .btn-navy').click();
  // r1 пустое — должна быть ошибка "required"
  await expect(page.locator('.field-error-tip').first()).toContainText('required');
  }); 

  test('корректные значения: переход на шаг 2', async ({ page }) => {
    await page.goto(APP_URL);
    await fillStep1(page);
    await page.locator('#s1 .btn-navy').click();
    await expect(page.locator('#s2')).toHaveClass(/active/);
  });
});

// ─────────────────────────────────────────────
// VAT toggle
// ─────────────────────────────────────────────
test.describe('VAT-checkbox', () => {
  test('VAT toggle меняет отображаемый net revenue', async ({ page }) => {
  await page.goto(APP_URL);
  await page.fill('#r1', '12000');

  // Убеждаемся что VAT включён (он checked по умолчанию) и читаем значение
  await page.locator('#r1').dispatchEvent('input');
  await page.waitForTimeout(50);
  const beforeText = await page.locator('#rn1').textContent();
  // С VAT checked: 12000 / 1.2 = £10,000

  // Выключаем VAT через JS напрямую (элемент может быть скрыт)
  await page.evaluate(() => {
    const cb = document.getElementById('vatReg');
    cb.checked = false;
    cb.dispatchEvent(new Event('change'));
  });
  await page.locator('#r1').dispatchEvent('input');
  await page.waitForTimeout(50);
  const afterText = await page.locator('#rn1').textContent();
  // Без VAT: £12,000

  expect(beforeText).toBe('£10,000');
  expect(afterText).toBe('£12,000');
  });

  test('с VAT: отображаемый net revenue = gross / 1.2', async ({ page }) => {
    await page.goto(APP_URL);
    await page.fill('#r1', '12000');
    await page.check('#vatReg');
    const netText = await page.locator('#rn1').textContent();
    // 12000 / 1.2 = 10000 → "£10,000"
    expect(netText).toContain('10,000');
  });
});

// ─────────────────────────────────────────────
// Полный цикл: генерация результатов
// ─────────────────────────────────────────────
test.describe('Генерация результатов', () => {
  test('после заполнения всех шагов отображаются результаты', async ({ page }) => {
    await page.goto(APP_URL);
    await fillStep1(page);
    await page.locator('#s1 .btn-navy').click();
    await fillStep2(page);
    await page.locator('#s2 .btn-navy').click();
    await fillStep3(page);
    await page.locator('#s3 .btn-navy').click();
    // ждём анимацию загрузки
    await page.waitForSelector('#results', { state: 'visible', timeout: 5000 });
    await expect(page.locator('#results')).toBeVisible();
  });

  test('KPI-блоки заполнены после расчёта', async ({ page }) => {
    await page.goto(APP_URL);
    await fillStep1(page);
    await page.locator('#s1 .btn-navy').click();
    await fillStep2(page);
    await page.locator('#s2 .btn-navy').click();
    await fillStep3(page);
    await page.locator('#s3 .btn-navy').click();
    await page.waitForSelector('#k_rev', { state: 'visible', timeout: 5000 });
    const revText = await page.locator('#k_rev').textContent();
    expect(revText).toContain('£');
  });

  test('verdict-блок присутствует', async ({ page }) => {
    await page.goto(APP_URL);
    await fillStep1(page);
    await page.locator('#s1 .btn-navy').click();
    await fillStep2(page);
    await page.locator('#s2 .btn-navy').click();
    await fillStep3(page);
    await page.locator('#s3 .btn-navy').click();
    await page.waitForSelector('#verdict', { state: 'visible', timeout: 5000 });
    await expect(page.locator('#verdict')).toBeVisible();
  });
});

// ─────────────────────────────────────────────
// Toast-сообщения
// ─────────────────────────────────────────────
test.describe('Toast-уведомления', () => {
  test('попытка перехода на шаг 2 без данных: toast появляется', async ({ page }) => {
    await page.goto(APP_URL);
    await page.locator('#s1 .btn-navy').click();
    await expect(page.locator('.step-toast')).toBeVisible();
  });

  test('toast исчезает через ~3 секунды', async ({ page }) => {
    await page.goto(APP_URL);
    await page.locator('#s1 .btn-navy').click();
    await expect(page.locator('.step-toast')).toBeVisible();
    await page.waitForTimeout(4000);
    await expect(page.locator('.step-toast')).not.toBeVisible();
  });
});

// ─────────────────────────────────────────────
// "Start Over" — сброс
// ─────────────────────────────────────────────
test.describe('Start Over', () => {
  test('после сброса форма очищена и активен шаг 1', async ({ page }) => {
    await page.goto(APP_URL);
    await fillStep1(page);
    await page.locator('#s1 .btn-navy').click();
    await fillStep2(page);
    await page.locator('#s2 .btn-navy').click();
    await fillStep3(page);
    await page.locator('#s3 .btn-navy').click();
    await page.waitForSelector('#results', { state: 'visible', timeout: 5000 });
    await page.locator('button:has-text("Start New")').click();
    await expect(page.locator('#s1')).toHaveClass(/active/);
    const r1Val = await page.locator('#r1').inputValue();
    expect(r1Val).toBe('');
  });
});

// ─────────────────────────────────────────────
// "More expenses" — дополнительные поля
// ─────────────────────────────────────────────
test.describe('More expenses toggle', () => {
  test('блок доп. расходов скрыт по умолчанию', async ({ page }) => {
    await page.goto(APP_URL);
    await fillStep1(page);
    await page.locator('#s1 .btn-navy').click();
    await expect(page.locator('#moreFields')).not.toHaveClass(/open/);
  });

  test('клик на "Add more expenses": блок открывается', async ({ page }) => {
    await page.goto(APP_URL);
    await fillStep1(page);
    await page.locator('#s1 .btn-navy').click();
    await page.locator('#moreBtn').click();
    await expect(page.locator('#moreFields')).toHaveClass(/open/);
  });
});

// ─────────────────────────────────────────────
// Тема (dark/light mode)
// ─────────────────────────────────────────────
test.describe('Dark mode toggle', () => {
  test('переключение темы: атрибут data-theme меняется', async ({ page }) => {
    await page.goto(APP_URL);
    const before = await page.locator('html').getAttribute('data-theme');
    await page.click('#themeToggle');
    const after = await page.locator('html').getAttribute('data-theme');
    expect(before).not.toBe(after);
  });
});

// ─────────────────────────────────────────────
// Шаг 2 — Валидация Costs
// ─────────────────────────────────────────────
test.describe('Шаг 2 — Валидация Costs', () => {
  test('пустые обязательные поля costs: ошибки показаны', async ({ page }) => {
    await page.goto(APP_URL);
    await fillStep1(page);
    await page.locator('#s1 .btn-navy').click();
    await page.locator('#s2 .btn-navy').click();
    await expect(page.locator('.field-error').first()).toBeVisible();
  });

  test('отрицательный rent: ошибка валидации', async ({ page }) => {
    await page.goto(APP_URL);
    await fillStep1(page);
    await page.locator('#s1 .btn-navy').click();
    await fillStep2(page);
    await page.fill('#rent', '-500');
    await page.locator('#s2 .btn-navy').click();
    await expect(page.locator('.field-error-tip')).toContainText('negative');
  });
});

// ─────────────────────────────────────────────
// Шаг 3 — Валидация Business Details
// ─────────────────────────────────────────────
test.describe('Шаг 3 — Валидация Business Details', () => {
  test('emp=0: Solo business — переход к результатам разрешён', async ({ page }) => {
  // emp=0 теперь валиден (Solo business без сотрудников) — результаты должны появиться
  await page.goto(APP_URL);
  await fillStep1(page);
  await page.locator('#s1 .btn-navy').click();
  await fillStep2(page);
  await page.locator('#s2 .btn-navy').click();
  await fillStep3(page);
  await page.fill('#emp', '0');
  await page.locator('#s3 .btn-navy').click();
  await page.waitForTimeout(1500);
  await expect(page.locator('#results')).toBeVisible();
  });

  test('emp=дробное: валидация блокирует переход к результатам', async ({ page }) => {
  await page.goto(APP_URL);
  await fillStep1(page);
  await page.locator('#s1 .btn-navy').click();
  await fillStep2(page);
  await page.locator('#s2 .btn-navy').click();
  await fillStep3(page);
  await page.fill('#emp', '2.5');
  await page.locator('#s3 .btn-navy').click();
  // Ждём возможную анимацию загрузки
  await page.waitForTimeout(1500);
  // Либо результаты не показаны, либо показана ошибка
  const resultsVisible = await page.locator('#results').isVisible();
  const errorVisible = await page.locator('.field-error-tip').isVisible();
  expect(resultsVisible || errorVisible).toBeTruthy();
  // Если результаты показаны — это баг, дробное emp не должно пройти
  if (resultsVisible) {
    // Явно проваливаем тест с понятным сообщением
    expect(resultsVisible, 'emp=2.5 не должно приводить к генерации результатов').toBe(false);
  }
  });

});