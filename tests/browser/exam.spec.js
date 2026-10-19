import { test, expect } from "@playwright/test";

async function start(page) {
  await page.goto("/");
  await page.getByRole("textbox", { name: "Access code" }).fill("ABC123");
  await page.getByRole("button", { name: "Begin Assessment" }).click();
  await expect(page).toHaveURL(/\/confirm$/);
  await expect(page.getByText("abc@gmail.com", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start Exam" }).click();
  await expect(page).toHaveURL(/\/exam$/);
  await expect(page.locator(".monaco-editor")).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => !!document.fullscreenElement))
    .toBe(true);
}
async function typeAnswer(page, text) {
  await page.locator(".monaco-editor .view-lines").click();
  await page.keyboard.type(text);
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(sessionStorage.getItem("eaudit.exam")).answers[1],
      ),
    )
    .toBe(text);
}

test("recorded layout, editor, question navigation, guide and fullscreen gate", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await start(page);
  await expect(
    page.getByText("Layout div: logo và navigation", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".code-editor-lang-select")).toHaveValue("java");
  await expect(page.locator(".monaco-editor")).toHaveClass(/vs-dark/);
  await expect(page.locator(".monaco-editor")).toHaveCSS("height", "550px");
  await expect(
    page.locator('[aria-hidden="true"] span').filter({ hasText: "SID 2000" }),
  ).toHaveCount(0);
  await page.locator(".code-editor-guide-btn").click();
  await expect(
    page.getByText("📖 IntelliSense Prefix Reference", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".code-editor-guide-group")).not.toHaveCount(0);
  await page.locator(".code-editor-guide-btn").click();
  await typeAnswer(page, "hello");
  await page.locator(".code-editor-lang-select").selectOption("css");
  await page.getByRole("button", { name: "Question 2", exact: true }).click();
  await expect(
    page.getByText("Trace thuật toán Selection Sort", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".code-editor-lang-select")).toHaveValue("css");
  await page.getByRole("button", { name: "Question 1", exact: true }).click();
  await expect(page.locator(".code-editor-lang-select")).toHaveValue("css");
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(sessionStorage.getItem("eaudit.exam")).answers[1],
      ),
    )
    .toBe("hello");
  await page.evaluate(() => document.exitFullscreen());
  await expect(
    page.getByRole("heading", { name: "Fullscreen Required" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Next", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Return to Fullscreen" }).click();
  await expect(
    page.getByRole("heading", { name: "Fullscreen Required" }),
  ).toHaveCount(0);
  await page.screenshot({
    path: "test-results/exam-desktop.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("first Ctrl+C warns, second Ctrl+V submits exactly once with latest answer", async ({
  page,
}) => {
  const requests = [];
  const failedApi = [];
  page.on("response", (r) => {
    if (r.url().includes("/api/student/") && !r.ok())
      failedApi.push(r.status());
  });
  page.on("request", (r) => {
    if (r.url().includes("/api/student/"))
      requests.push({ url: r.url(), data: r.postDataJSON() });
  });
  await start(page);
  await typeAnswer(page, "latest answer");
  await page.keyboard.press("Control+c");
  await expect(page.locator(".exam-notice[role=alert]")).toContainText(
    "This is violation 1",
  );
  await expect(page).toHaveURL(/\/exam$/);
  await page.keyboard.press("Control+v");
  await expect(page).toHaveURL(/\/submit$/);
  await expect(
    page.getByRole("heading", { name: "Exam Locked and Submitted" }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toHaveText(
    "Local mock submission logged.",
  );
  const submits = requests.filter((r) => r.url.endsWith("/exam/submit"));
  expect(submits).toHaveLength(1);
  expect(failedApi).toEqual([]);
  expect(submits[0].data).toMatchObject({
    reason: "clipboard_violation",
    violations: 2,
    answers: [{ question_order: 1, answer: "latest answer" }],
  });
  const violations = requests.filter((r) => r.url.endsWith("/violation"));
  expect(violations.map((r) => r.data.type)).toEqual([
    "copy_attempt",
    "paste_attempt",
  ]);
  expect(await page.evaluate(() => !!document.fullscreenElement)).toBe(false);
  await page.goto("/exam");
  await expect(page).toHaveURL(/\/submit$/);
});

test("Ctrl+X blocks cutting, held key does not double count, second distinct press submits", async ({
  page,
}) => {
  await start(page);
  await typeAnswer(page, "keep this answer");
  await page.keyboard.down("Control");
  await page.keyboard.down("x");
  await page.keyboard.down("x");
  await expect(page.locator(".exam-notice[role=alert]")).toContainText(
    "violation 1",
  );
  expect(
    await page.evaluate(
      () => JSON.parse(sessionStorage.getItem("eaudit.exam")).violations,
    ),
  ).toBe(1);
  await page.keyboard.up("x");
  await page.keyboard.up("Control");
  expect(
    await page.evaluate(
      () => JSON.parse(sessionStorage.getItem("eaudit.exam")).answers[1],
    ),
  ).toBe("keep this answer");
  await page.waitForTimeout(3100);
  await page.keyboard.press("Control+x");
  await expect(page).toHaveURL(/\/submit$/);
});

test("fullscreen denial prevents starting the assessment", async ({ page }) => {
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      document.documentElement.requestFullscreen = () =>
        Promise.reject(new Error("denied"));
    });
  });
  let starts = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/exam/start")) starts++;
  });
  await page.goto("/");
  await page.getByRole("textbox", { name: "Access code" }).fill("ABC123");
  await page.getByRole("button", { name: "Begin Assessment" }).click();
  await page.getByRole("button", { name: "Start Exam" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/confirm$/);
  expect(starts).toBe(0);
});

test("automatic submission failure stays locked, retry retains answers", async ({
  page,
}) => {
  await start(page);
  await typeAnswer(page, "retained");
  let submits = 0;
  await page.route("**/api/student/exam/submit", async (route) => {
    if (++submits === 1)
      await route.fulfill({ status: 503, body: "unavailable" });
    else await route.continue();
  });
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+x");
  await expect(
    page.getByRole("button", { name: "Retry submission" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Submit Exam", exact: true }),
  ).toBeDisabled();
  expect(
    await page.evaluate(
      () => JSON.parse(sessionStorage.getItem("eaudit.exam")).locked,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Retry submission" }).click();
  await expect(page).toHaveURL(/\/submit$/);
  expect(
    await page.evaluate(
      () => JSON.parse(sessionStorage.getItem("eaudit.exam")).answers[1],
    ),
  ).toBe("retained");
});

test("timer expiry submits automatically and direct access cannot bypass confirmation", async ({
  page,
}) => {
  await page.goto("/exam");
  await expect(page).toHaveURL(/\/$/);
  await start(page);
  await page.evaluate(() => {
    const s = JSON.parse(sessionStorage.getItem("eaudit.exam"));
    s.deadline = Date.now() - 1000;
    sessionStorage.setItem("eaudit.exam", JSON.stringify(s));
  });
  await page.reload();
  await expect(page).toHaveURL(/\/submit$/);
  await expect(
    page.getByText("Time is up. Your exam has been automatically submitted."),
  ).toBeVisible();
});

test("logging in with an obsolete stored exam creates a fresh session", async ({
  page,
}) => {
  await page.addInitScript(() =>
    sessionStorage.setItem(
      "eaudit.exam",
      JSON.stringify({
        id: "obsolete-session",
        answers: { 1: "old answer" },
        initialized: true,
      }),
    ),
  );
  const verifications = [];
  page.on("request", (r) => {
    if (r.url().endsWith("/api/student/verify"))
      verifications.push(r.postDataJSON());
  });
  await start(page);
  expect(verifications).toEqual([{ access_code: "ABC123" }]);
  expect(
    await page.evaluate(
      () => JSON.parse(sessionStorage.getItem("eaudit.exam")).id,
    ),
  ).not.toBe("obsolete-session");
});
