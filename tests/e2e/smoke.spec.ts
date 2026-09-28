import { expect, test } from "@playwright/test";

test("signed-out visitors enter through light-mode sign-in", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(
    page.getByRole("heading", { name: "Sign in to the Public Asset Register" }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveClass(/light/);
  await expect(page.locator("html")).not.toHaveClass(/dark/);
});

test("protected dashboard redirects signed-out visitors", async ({ page }) => {
  await page.goto("/app/dashboard");
  await expect(page).toHaveURL(/\/sign-in/);
});
