import { test, expect, Page } from "@playwright/test";

// Смоук-прогон приложения: экран входа открывается без ошибок, а с тестовым
// аккаунтом (E2E_EMAIL/E2E_PASSWORD) — обход всех модулей и разделов без
// падений (ErrorBoundary «Что-то пошло не так» и необработанных исключений).

const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;

// Необработанные исключения страницы — жёсткий провал теста.
function watchPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  return errors;
}

async function expectNoCrash(page: Page, where: string) {
  await expect(page.getByText("Что-то пошло не так"), `ErrorBoundary в «${where}»`).toHaveCount(0);
}

test("экран входа открывается без ошибок", async ({ page }) => {
  const errors = watchPageErrors(page);
  await page.goto("/");
  await expect(page.getByPlaceholder("example@mail.ru")).toBeVisible({ timeout: 30_000 });
  await expectNoCrash(page, "экран входа");
  expect(errors, "необработанные исключения на экране входа").toEqual([]);
});

test.describe("авторизованный обход всех вкладок", () => {
  test.skip(!EMAIL || !PASSWORD, "нужны переменные окружения E2E_EMAIL и E2E_PASSWORD");

  test("логин и все модули/разделы без падений", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "обход вкладок гоняем на десктопе");
    const errors = watchPageErrors(page);

    await page.goto("/");
    await page.getByPlaceholder("example@mail.ru").fill(EMAIL!);
    await page.getByPlaceholder("••••••••").fill(PASSWORD!);
    await page.getByRole("button", { name: /войти/i }).click();

    // Оболочка приложения: ждём сайдбар с модулями
    const moduleItems = page.locator("aside .nav");
    await expect(moduleItems.first()).toBeVisible({ timeout: 30_000 });

    const moduleCount = await moduleItems.count();
    for (let m = 0; m < moduleCount; m++) {
      const mod = moduleItems.nth(m);
      const modName = (await mod.innerText()).trim();
      await mod.click();
      await page.waitForTimeout(400); // даём чанку экрана догрузиться
      await expectNoCrash(page, `модуль ${modName}`);

      // Лента разделов сверху (у «Ресторана» её нет — модуль один)
      const sections = page.locator(".modbar .mod");
      const sectionCount = await sections.count();
      for (let s = 0; s < sectionCount; s++) {
        const sec = sections.nth(s);
        const secName = (await sec.innerText()).trim();
        await sec.click();
        await page.waitForTimeout(400);
        await expectNoCrash(page, `${modName} → ${secName}`);
      }
    }

    expect(errors, "необработанные исключения при обходе").toEqual([]);
  });
});
