import { expect, test } from "@playwright/test";

const enabled = process.env.PRAVI_E2E_DISPOSABLE === "1";
const database = process.env.DATABASE_RUNTIME_URL;
const officerState = process.env.PRAVI_E2E_OFFICER_STATE;
const reviewerState = process.env.PRAVI_E2E_REVIEWER_STATE;
const department = process.env.PRAVI_E2E_DEPARTMENT;
const verifiedAsset = process.env.PRAVI_E2E_VERIFIED_ASSET;
if (enabled) {
  if (!database)
    throw new Error(
      "Persisted E2E requires an explicit disposable DATABASE_RUNTIME_URL",
    );
  const target = new URL(database);
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
    !/^\/pravi_test_[a-z0-9_]+$/.test(target.pathname)
  )
    throw new Error(
      "Persisted E2E refuses nonlocal/non-pravi_test_* database targets",
    );
}
const configured =
  enabled &&
  Boolean(officerState && reviewerState && department && verifiedAsset);
test.describe("Real persisted officer/reviewer journey", () => {
  test.skip(
    !configured,
    "Requires explicitly disposable local database, real Clerk officer/reviewer storage states and authorized seeded department/verified asset. No fake tokens or live provider writes.",
  );
  test.use({ baseURL: "http://localhost:3000" });
  test("officer draft registration is independently reviewed after refresh", async ({
    browser,
  }) => {
    const officer = await browser.newContext({ storageState: officerState });
    const reviewer = await browser.newContext({ storageState: reviewerState });
    try {
      const page = await officer.newPage();
      await page.goto(`/app/assets?department=${department}`);
      await expect(
        page.getByRole("heading", { name: "Asset register", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Register asset", exact: true })
        .click();
      const code = `E2E-${crypto.randomUUID().slice(0, 8)}`;
      await page.getByLabel("Asset code", { exact: false }).fill(code);
      await page
        .getByLabel("Asset name", { exact: false })
        .fill("Synthetic disposable E2E asset");
      await page
        .getByLabel("Documentary source reference", { exact: false })
        .fill("Disposable test source");
      // Fixture definition must have no mandatory dynamic fields and one active canonical region.
      await page
        .getByLabel("Region (required before submission)")
        .selectOption({ index: 1 });
      await page.getByRole("button", { name: /Save.*draft/i }).click();
      const link = page.getByRole("link", {
        name: "Synthetic disposable E2E asset",
        exact: true,
      });
      await expect(link).toBeVisible();
      await link.click();
      const path = new URL(page.url()).pathname;
      await page
        .getByLabel("Reason", { exact: true })
        .fill("Disposable independent verification test");
      await page
        .getByRole("button", { name: "Submit for verification" })
        .click();
      await expect(
        page.getByRole("button", { name: "Submit for verification" }),
      ).toHaveCount(0);
      await page.reload();
      await expect(
        page.getByRole("button", { name: "Verify registration" }),
      ).toHaveCount(0);
      const review = await reviewer.newPage();
      await review.goto(path);
      await review
        .getByLabel("Reason", { exact: true })
        .fill("Independent disposable record review");
      await review.getByRole("button", { name: "Verify registration" }).click();
      await expect(
        review.getByRole("button", { name: "Verify registration" }),
      ).toHaveCount(0);
      await page.reload();
      await expect(
        page.getByText("verified", { exact: true }).first(),
      ).toBeVisible();
    } finally {
      await officer.close();
      await reviewer.close();
    }
  });
  test("verified asset accepts a persisted inspection draft and restoration proposal", async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState: officerState });
    try {
      const page = await context.newPage();
      await page.goto(`/app/assets/${verifiedAsset}`);
      await page
        .getByText("Record an inspection draft", { exact: true })
        .click();
      const inspection = page.locator("details").filter({
        has: page.getByText("Record an inspection draft", { exact: true }),
      });
      await inspection
        .getByLabel("Observed on", { exact: true })
        .fill("2026-01-01");
      const components = inspection.locator("fieldset");
      for (let index = 0; index < (await components.count()); index++)
        await components
          .nth(index)
          .getByLabel("Defect / limitation notes")
          .fill(
            "Not accessible in disposable test; no safety finding inferred",
          );
      await inspection
        .getByRole("button", { name: "Save inspection draft" })
        .click();
      await expect(
        inspection.getByText(/Inspection draft saved/),
      ).toBeVisible();
      await page.reload();
      await expect(
        page.getByText("2026-01-01 · unknown · draft", { exact: true }),
      ).toBeVisible();
      await page.getByText("Propose restoration work", { exact: true }).click();
      const proposal = page.locator("details").filter({
        has: page.getByText("Propose restoration work", { exact: true }),
      });
      const scope = `Synthetic E2E restoration ${crypto.randomUUID().slice(0, 8)}`;
      await proposal.getByLabel("Work scope").fill(scope);
      await proposal
        .getByLabel("Justification")
        .fill("Disposable planning exercise, unpriced");
      await proposal
        .getByRole("button", { name: "Save restoration proposal" })
        .click();
      await expect(
        proposal.getByText(/Restoration proposal saved/),
      ).toBeVisible();
      await page.reload();
      await expect(
        page.getByText(`${scope} · proposed`, { exact: true }),
      ).toBeVisible();
    } finally {
      await context.close();
    }
  });
  test.fixme("complaint intake through accepted restoration and approved reinspection", () => {
    // Creation/delivery of required evidence and complaint UI remain incomplete.
    // Do not replace missing behavior with fixture mutations or a false passing journey.
  });
});
