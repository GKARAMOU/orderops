import { test, expect, Page } from "@playwright/test";
import fs from "node:fs";
const env = Object.fromEntries(
  fs
    .readFileSync("../.env", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);
async function login(
  page: Page,
  email = env.ADMIN_EMAIL,
  password = env.ADMIN_PASSWORD,
) {
  await page.goto("/");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your operation, at a glance" }),
  ).toBeVisible();
}
test("create stock, reserve, inspect and fulfill a real order", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await page.getByRole("button", { name: "Add product", exact: true }).click();
  let dialog = page.getByRole("dialog");
  const name = "Browser product " + Date.now();
  await dialog.getByLabel("SKU", { exact: true }).fill("BROWSER-" + Date.now());
  await dialog.getByLabel("Product name").fill(name);
  await dialog.getByLabel("Unit price").fill("15.50");
  await dialog.getByRole("button", { name: "Save product" }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: "Adjust stock", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Product", { exact: true })
    .selectOption({ label: name });
  await dialog
    .getByLabel("Warehouse", { exact: true })
    .selectOption({ index: 1 });
  await dialog.getByLabel("New total on hand").fill("10");
  await dialog.getByLabel("Reason").fill("Browser integration test");
  await dialog.getByRole("button", { name: "Save adjust stock" }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: "Orders", exact: true }).click();
  await page.getByRole("button", { name: "New order", exact: true }).click();
  dialog = page.getByRole("dialog");
  const customer = "Browser customer " + Date.now();
  await dialog.getByLabel("Customer").fill(customer);
  await dialog.getByLabel("Warehouse").selectOption({ index: 1 });
  await dialog
    .getByLabel("Product", { exact: true })
    .selectOption({ label: name });
  await dialog.getByLabel("Units", { exact: true }).fill("3");
  await dialog.getByRole("button", { name: "Save order" }).click();
  await expect(dialog).not.toBeVisible();
  const row = page.getByRole("row").filter({ hasText: customer });
  await expect(row).toContainText("reserved");
  await row.getByRole("button", { name: /#/ }).click();
  await expect(page.getByRole("dialog")).toContainText(name);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await row.getByRole("button", { name: "Fulfill", exact: true }).click();
  await expect(row).toContainText("fulfilled");
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  const stock = page.getByRole("row").filter({ hasText: name });
  await expect(stock.locator("td").nth(2)).toHaveText("7");
  await expect(stock.locator("td").nth(3)).toHaveText("0");
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.screenshot({
    path: "test-results/orderops-dashboard.png",
    fullPage: true,
  });
});
test("purchase receipt persists after browser reload", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "Purchasing", exact: true }).click();
  await page.getByRole("button", { name: "New purchase" }).click();
  const d = page.getByRole("dialog"),
    supplier = "Browser supplier " + Date.now();
  await d.getByLabel("Supplier").fill(supplier);
  await d.getByLabel("Product", { exact: true }).selectOption({ index: 1 });
  await d.getByLabel("Warehouse").selectOption({ index: 1 });
  await d.getByLabel("Quantity").fill("5");
  await d.getByRole("button", { name: "Save purchase" }).click();
  const row = page.getByRole("row").filter({ hasText: supplier });
  await expect(row).toContainText("open");
  await row.getByRole("button", { name: "Receive", exact: true }).click();
  await expect(row).toContainText("received");
  await page.reload();
  await login(page);
  await page.getByRole("button", { name: "Purchasing", exact: true }).click();
  await expect(
    page.getByRole("row").filter({ hasText: supplier }),
  ).toContainText("received");
});
test("forecast runs against stored history and shows measured errors", async ({
  page,
}) => {
  await login(page);
  await page
    .getByRole("button", { name: "Demand planning", exact: true })
    .click();
  await page
    .getByLabel("Product", { exact: true })
    .selectOption({ label: "Wireless keyboard" });
  await page
    .getByLabel("Warehouse", { exact: true })
    .selectOption({ label: "Patras · Central" });
  await page.getByRole("button", { name: "Run forecast" }).click();
  await expect(
    page.getByRole("heading", { name: "Seven-day forecast" }),
  ).toBeVisible();
  await expect(
    page.getByText("SYNTHETIC walkthrough data; not real business sales", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Random forest MAE", { exact: true }),
  ).toBeVisible();
});
test("viewer can read but has no write controls", async ({ page, request }) => {
  const auth = await request.post("/api/auth/login", {
    data: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD },
  });
  const token = (await auth.json()).token;
  const email = `viewer-${Date.now()}@example.com`;
  const password = "viewer-test-password-123";
  const created = await request.post("/api/users", {
    headers: { Authorization: `Bearer ${token}` },
    data: { email, password, role: "VIEWER" },
  });
  expect(created.ok()).toBeTruthy();
  await login(page, email, password);
  await expect(
    page.getByRole("button", { name: "New order", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Adjust stock", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("table")).toBeVisible();
});
test("mobile workspace stays within the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
});

test("import attributed retail history through the UI and evaluate it", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await page.getByRole("button", { name: "Add product", exact: true }).click();
  const name = "UCI cake stand " + Date.now();
  let d = page.getByRole("dialog");
  await d.getByLabel("SKU", { exact: true }).fill("UCI-" + Date.now());
  await d.getByLabel("Product name").fill(name);
  await d.getByLabel("Unit price").fill("0");
  await d.getByRole("button", { name: "Save product" }).click();
  await expect(d).not.toBeVisible();
  await page
    .getByRole("button", { name: "Demand planning", exact: true })
    .click();
  await page
    .getByLabel("Product", { exact: true })
    .selectOption({ label: name });
  await page
    .getByLabel("Warehouse", { exact: true })
    .selectOption({ index: 1 });
  await page
    .getByLabel("Data source")
    .fill("UCI Online Retail, stock 22423, CC BY 4.0");
  await page
    .getByLabel("CSV file")
    .setInputFiles("../docs/uci-22423-daily.csv");
  await page
    .getByRole("button", { name: "Import history", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "374 observations imported",
  );
  await page.getByRole("button", { name: "Run forecast", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Seven-day forecast" }),
  ).toBeVisible();
  await expect(page.getByText("29.448", { exact: true })).toBeVisible();
  await expect(page.getByText("32.857", { exact: true })).toBeVisible();
  await expect(
    page.getByText("History is out of date.", { exact: false }),
  ).toBeVisible();
});
