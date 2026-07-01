import { test, expect, Page } from "@playwright/test";
// Обход строится по справочнику навигации, а не по DOM: клик по подписи
// с автоожиданием Playwright гарантирует, что раздел нового модуля появился
// (startTransition + lazy-чанки держат на экране СТАРЫЙ модуль, пока новый
// грузится, — перечисление DOM в этот момент отдало бы чужие разделы).
import { MODULES, MODULE_NAV } from "../src/data/navigation";

type NavItem = { key: string; label: string };
// Справочник из .js — индексируем по строковому ключу модуля
const NAV: Record<string, NavItem[] | undefined> = MODULE_NAV;

// Смоук-прогон приложения: экран входа открывается без ошибок, а с тестовым
// аккаунтом (E2E_EMAIL/E2E_PASSWORD) — обход всех модулей и разделов без
// падений (ErrorBoundary «Что-то пошло не так» и необработанных исключений).

const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;

// Необработанные исключения страницы. Модуль «Ресторан» встраивает ЧУЖОЕ
// приложение (pos-and-menu) в iframe — его ошибки помечаем контекстом и
// не валим смоук этого репозитория (только предупреждаем).
function watchPageErrors(page: Page, context: { current: string }) {
  const hard: string[] = [];
  const soft: string[] = [];
  page.on("pageerror", (e) => {
    (context.current.startsWith("Ресторан") ? soft : hard).push(`[${context.current}] ${String(e)}`);
  });
  return { hard, soft };
}

async function expectNoCrash(page: Page, where: string) {
  await expect(page.getByText("Что-то пошло не так"), `ErrorBoundary в «${where}»`).toHaveCount(0);
}

// Ждём, пока уйдут все «Загрузка…» (чанк экрана и загрузка данных),
// чтобы проверка на падение шла по реально смонтированному экрану.
async function waitLoaded(page: Page) {
  await expect(page.getByText("Загрузка…")).toHaveCount(0, { timeout: 30_000 });
}

test("экран входа открывается без ошибок", async ({ page }) => {
  const ctx = { current: "экран входа" };
  const { hard } = watchPageErrors(page, ctx);
  await page.goto("/");
  await expect(page.getByPlaceholder("example@mail.ru")).toBeVisible({ timeout: 30_000 });
  await expectNoCrash(page, "экран входа");
  expect(hard, "необработанные исключения на экране входа").toEqual([]);
});

test.describe("авторизованный обход всех вкладок", () => {
  test.skip(!EMAIL || !PASSWORD, "нужны переменные окружения E2E_EMAIL и E2E_PASSWORD");
  // Обход — только на десктопе: на телефоне сайдбар спрятан в бургер-меню
  test.skip(({ isMobile }) => !!isMobile, "обход вкладок гоняем на десктопе");

  test("логин и все модули/разделы без падений", async ({ page }) => {
    test.setTimeout(240_000); // ~30 разделов × ленивый чанк + данные с прода
    const ctx = { current: "логин" };
    const { hard, soft } = watchPageErrors(page, ctx);

    await page.goto("/");
    await page.getByPlaceholder("example@mail.ru").fill(EMAIL!);
    await page.getByPlaceholder("••••••••").fill(PASSWORD!);
    await page.getByRole("button", { name: "Войти" }).click();

    // Либо появляется оболочка (сайдбар), либо ошибка входа — падаем с её текстом
    const sidebar = page.locator("aside .nav").first();
    const alert = page.locator('[role="alert"]');
    await expect(sidebar.or(alert).first()).toBeVisible({ timeout: 30_000 });
    if (await alert.isVisible()) throw new Error(`Логин не удался: ${await alert.innerText()}`);

    // Обход по справочнику: только модули с разделами (кликабельные)
    for (const mod of MODULES.filter((m) => NAV[m.key])) {
      ctx.current = mod.label;
      await page.locator("aside .nav", { hasText: mod.label }).click();
      await waitLoaded(page);
      await expectNoCrash(page, mod.label);

      // Лента разделов сверху; у «Ресторана» её нет — модуль один
      for (const section of (NAV[mod.key] ?? []).length > 1 ? NAV[mod.key]! : []) {
        ctx.current = `${mod.label} → ${section.label}`;
        await page.locator(".modbar .mod", { hasText: section.label }).first().click();
        await waitLoaded(page);
        await expectNoCrash(page, ctx.current);
      }
    }

    if (soft.length) console.warn("Ошибки внешнего ресторан-iframe (не валят смоук):\n" + soft.join("\n"));
    expect(hard, "необработанные исключения при обходе").toEqual([]);
  });
});
