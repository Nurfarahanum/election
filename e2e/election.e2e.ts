import { randomBytes } from "node:crypto";
import { test, expect } from "@playwright/test";

test("admin creates a ballot, imports three voters, and publishes their results", async ({ page, browser, baseURL }) => {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD for the disposable test stack.");

  await page.goto("/admin/login");
  await page.getByLabel("Emel").fill(adminEmail);
  await page.getByLabel("Kata laluan").fill(adminPassword);
  await page.getByRole("button", { name: "Log masuk", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Jawatan baharu" })).toBeVisible();

  await page.getByRole("link", { name: "Penjenamaan", exact: true }).click();
  await page.getByLabel("Warna utama").fill("#006044");
  await page.getByLabel("Logo organisasi").setInputFiles("docs/kopetro.png");
  await page.getByRole("button", { name: "Simpan penjenamaan" }).click();
  await expect(page.getByRole("img", { name: /Logo Koperasi Kopetro/ })).toHaveAttribute("src", /\/media\/branding\//);
  await expect.poll(() => page.locator("body").evaluate(body => getComputedStyle(body).getPropertyValue("--acc").trim())).toBe("#006044");
  await page.getByRole("link", { name: "Ballot", exact: true }).click();
  await page.getByLabel("Nama jawatan").fill("Pengerusi E2E");
  await page.getByRole("button", { name: "Tambah jawatan" }).click();
  const position = page.locator("section").filter({ has: page.getByRole("heading", { name: /Pengerusi E2E/ }) });
  await position.getByLabel("Nama calon").fill("Calon E2E");
  await position.getByLabel("Bio ringkas").fill("Calon untuk ujian hujung ke hujung.");
  await position.getByRole("button", { name: "Tambah calon" }).click();
  await expect(position.getByText("Calon E2E", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Pengundi", exact: true }).click();
  await page.getByLabel("Fail pengundi").setInputFiles({
    name: "e2e-voters.csv", mimeType: "text/csv",
    buffer: Buffer.from("nama,emel\nPengundi E2E A,a@example.com\nPengundi E2E B,b@example.com\nPengundi E2E C,c@example.com\n"),
  });
  await page.getByRole("button", { name: "Pratonton import" }).click();
  await expect(page.getByText("3 baris · 0 bermasalah")).toBeVisible();
  await page.getByRole("button", { name: "Import pengundi", exact: true }).click();

  const cells = page.getByRole("region", { name: "Senarai kunci baharu" }).locator("tbody tr");
  await expect(cells).toHaveCount(3);
  const credentials = await cells.evaluateAll(rows => rows.map(row => ({
    code: row.querySelectorAll("td")[0].textContent ?? "", key: row.querySelectorAll("td")[2].textContent ?? "",
  })));
  await page.getByRole("button", { name: "Sembunyikan kunci" }).click();
  await expect(page.getByRole("region", { name: "Senarai kunci baharu" })).toHaveCount(0);

  await page.getByRole("link", { name: "Pelancaran", exact: true }).click();
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Buka undian sekarang" }).click();
  await expect(page.getByRole("heading", { name: "Status: Sedang dibuka" })).toBeVisible();

  const voters = await Promise.all(credentials.map(async (credential, index) => {
    const context = await browser.newContext({
      baseURL, ignoreHTTPSErrors: true, viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true,
    });
    const voter = await context.newPage();
    await voter.goto("/vote");
    await voter.getByLabel("ID Pengundi").fill(credential.code);
    await voter.getByLabel("Kunci Pengundi").fill(credential.key);
    await voter.getByRole("button", { name: "Log masuk", exact: true }).click();
    const option = voter.getByRole("radio", { name: /Calon E2E/ });
    await expect(option).toBeVisible();
    if (index !== 2) await option.check();
    await voter.getByRole("button", { name: "Semak undi saya" }).click();
    await expect(voter.getByRole("heading", { name: "Semak undi anda" })).toBeFocused();
    await expect(voter.getByText(index === 2 ? "Tidak mengundi" : "Calon E2E", { exact: true })).toBeVisible();
    await voter.getByRole("button", { name: "Hantar undi" }).click();
    await expect(voter.getByRole("heading", { name: "Undi anda telah direkodkan" })).toBeVisible();
    return { context, voter };
  }));

  try {
    await page.getByRole("link", { name: "Keputusan", exact: true }).click();
    await expect(page.getByText("3 daripada 3 pengundi (100%)")).toBeVisible();
    await expect(page.getByText("Calon E2E", { exact: true })).toHaveCount(0);
    await page.getByRole("link", { name: "Pelancaran", exact: true }).click();
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "Tutup undian" }).click();
    await expect(page.getByRole("heading", { name: "Status: Ditutup" })).toBeVisible();
    await page.getByRole("link", { name: "Keputusan", exact: true }).click();
    await expect(page.getByText("Tidak mengundi untuk jawatan ini: 1")).toBeVisible();
    await voters[0].voter.reload();
    await expect(voters[0].voter.getByRole("heading", { name: "Keputusan", exact: true })).toHaveCount(0);
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "Terbitkan keputusan kepada pengundi" }).click();
    await expect(page.getByText("Keputusan diterbitkan kepada pengundi.")).toBeVisible();
    await voters[0].voter.reload();
    await expect(voters[0].voter.getByRole("heading", { name: "Keputusan", exact: true })).toBeVisible();
    await expect(voters[0].voter.getByText("Calon E2E", { exact: true })).toBeVisible();
    expect(await voters[0].voter.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  } finally {
    await Promise.all(voters.map(({ context }) => context.close()));
  }

  const previousCookies = await page.context().cookies();
  const staleAdmin = previousCookies.find(cookie => cookie.name === "__Host-kopetro-admin");
  expect(staleAdmin).toBeDefined();
  const nextPassword = randomBytes(24).toString("hex");
  await page.getByRole("link", { name: "Tukar kata laluan", exact: true }).click();
  await page.getByLabel("Kata laluan semasa").fill(adminPassword);
  await page.getByLabel("Kata laluan baharu", { exact: true }).fill(nextPassword);
  await page.getByLabel("Sahkan kata laluan baharu").fill(nextPassword);
  await page.getByRole("button", { name: "Simpan kata laluan" }).click();
  await expect(page.getByText("Kata laluan telah dikemas kini.")).toBeVisible();

  const staleResponse = await page.request.get("/admin/export/pengundi.csv", {
    headers: { Cookie: `${staleAdmin?.name}=${staleAdmin?.value}` },
  });
  expect(staleResponse.status()).toBe(401);
  await page.getByLabel("Emel").fill(adminEmail);
  await page.getByLabel("Kata laluan").fill(adminPassword);
  await page.getByRole("button", { name: "Log masuk", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByLabel("Emel").fill(adminEmail);
  await page.getByLabel("Kata laluan").fill(nextPassword);
  await page.getByRole("button", { name: "Log masuk", exact: true }).click();
  await expect(page.getByRole("link", { name: "Tukar kata laluan" })).toBeVisible();
});
