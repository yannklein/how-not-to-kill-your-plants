import path from "node:path";
import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

const rotated = path.resolve(__dirname, "fixtures/rotated-exif.jpg");

test("photo to saved plant in 5 taps or fewer", async ({ page }) => {
  await loginAs(page, "Y");
  await page.goto("/plants/new");

  let taps = 0;
  const tap = async (locator: ReturnType<typeof page.locator>) => {
    taps += 1;
    await locator.click();
  };

  // Choosing the photo is not a tap we count (the OS picker does it).
  await page.getByTestId("photo-input").setInputFiles(rotated);

  // EXIF orientation 6 is applied by the downscaler: the stored 1200x800 is shown portrait.
  const preview = page.getByTestId("photo-preview");
  await expect(preview).toBeVisible();
  await expect
    .poll(() => preview.evaluate((img: HTMLImageElement) => img.naturalHeight > img.naturalWidth))
    .toBe(true);

  // Identification runs on its own; the top candidate is preselected.
  await expect(page.getByRole("radio", { name: /Pilea peperomioides/ })).toBeChecked();
  await expect(page.getByLabel("Name", { exact: true })).not.toHaveValue("");
  const name = await page.getByLabel("Name", { exact: true }).inputValue();

  await tap(page.getByRole("button", { name: "Looks right, add it" }));

  await expect(page).toHaveURL(/\/plants\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name })).toBeVisible();
  expect(taps).toBeLessThanOrEqual(5);
});

test("falls back to typing the species when identification fails", async ({ page }) => {
  await loginAs(page, "Y");
  await page.goto("/plants/new");

  // Abort only the identify server action (JSON body of draft keys), not the multipart upload.
  await page.route("**/plants/new", (route) => {
    const req = route.request();
    const isIdentify =
      req.method() === "POST" &&
      !(req.headers()["content-type"] ?? "").includes("multipart") &&
      (req.postData() ?? "").startsWith('[["photos/draft/'); // createPlant's body starts with an object, not a key array
    return isIdentify ? route.abort() : route.continue();
  });

  await page.getByTestId("photo-input").setInputFiles(rotated);

  const species = page.getByLabel("Species", { exact: true });
  await expect(species).toBeVisible();
  await species.fill("Monstera deliciosa");
  await page.getByRole("button", { name: "Looks right, add it" }).click();

  await expect(page).toHaveURL(/\/plants\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Monstera deliciosa" })).toBeVisible();
});
