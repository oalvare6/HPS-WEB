const { chromium } = require(
  process.env.HPS_PLAYWRIGHT_MODULE || "playwright-core",
);
const fs = require("fs");
const path = require("path");
const assert = require("assert/strict");
const outputDir = fs.mkdtempSync(
  path.join(require("os").tmpdir(), "hps-admin-check-"),
);
const port = Number(process.argv[2] || 3021);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Invalid local preview port");
const base = "http://127.0.0.1:" + port;
(async () => {
  const browser = await chromium.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
    args: ["--disable-gpu"],
  });
  try {
    const ctx = await browser.newContext({
      viewport: { width: 1366, height: 900 },
    });
    const page = await ctx.newPage();
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base + "/admin");
    await page.locator("input[name=username]").fill("fixture");
    await page.locator("input[name=password]").fill("fixture");
    await page.getByRole("button", { name: "Log In", exact: true }).click();
    await page.getByRole("heading", { name: "Tournament workspace" }).waitFor();
    await ctx.storageState({ path: path.join(outputDir, "local-auth.json") });
    const events = (
      await (await ctx.request.get(base + "/api/admin/tournaments")).json()
    ).tournaments;
    const cup = events.find((e) => e.slug === "fixture-cup");
    const eventPath = base + "/admin/tournaments/" + cup.id;
    const roster = await (
      await ctx.request.get(
        base + "/api/admin/tournaments/" + cup.id + "/roster",
      )
    ).json();
    assert.equal(roster.totals.paid, 7);
    assert.equal(roster.totals.unpaid, 5);
    const writes = [];
    await page.route("**/api/**", (route) => {
      const r = route.request();
      if (r.method() === "GET") return route.continue();
      writes.push({ url: r.url(), method: r.method(), body: r.postData() });
      return route.fulfill({
        status: 409,
        json: { error: "Fixture rejected the change." },
      });
    });
    async function snap(name) {
      await page.waitForTimeout(300);
      await page.screenshot({
        path: path.join(outputDir, "stage21-" + name + ".png"),
      });
      console.log("PASS screenshot " + name);
    }
    await page
      .getByRole("link", { name: "Fixture Cup", exact: true })
      .waitFor();
    await snap("overview");
    await page.goto(eventPath);
    await page
      .getByRole("button", { name: "Alex Sample 1", exact: true })
      .waitFor();
    await snap("players");
    await page
      .getByRole("button", { name: "Paid or waived", exact: true })
      .click();
    await page.waitForURL(/filter=accounted/);
    assert.equal(await page.locator(".admin-players tbody tr").count(), 7);
    await page.reload();
    await page
      .getByRole("button", { name: "Jordan Sample 6", exact: true })
      .click();
    await page.getByRole("dialog").waitFor();
    assert.equal(
      await page.getByLabel("Recorded status").inputValue(),
      "waived",
    );
    await page
      .getByRole("button", { name: "Preview Cash / Zelle receipt form" })
      .click();
    await page
      .getByText("Prototype · Nothing will be recorded", { exact: true })
      .waitFor();
    await snap("player-detail");
    await page.getByRole("button", { name: "Back to players" }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(
      await page.evaluate(() => document.activeElement.textContent),
      "Jordan Sample 6",
    );
    await page
      .getByRole("button", { name: "Clear filters", exact: true })
      .click();
    await page.waitForURL((url) => !url.searchParams.has("filter"));
    const search = page.getByPlaceholder("Search name, phone or team");
    if (await search.count()) {
      await search.pressSequentially("Jordan", { delay: 15 });
      await page.waitForTimeout(700);
      assert.equal(await search.inputValue(), "Jordan");
      await search.fill("");
    }
    await page.goto(eventPath + "?filter=unpaid");
    await page
      .getByRole("button", { name: "Taylor Sample 8", exact: true })
      .click();
    await page.getByLabel("Recorded status").selectOption("paid");
    await page
      .getByRole("button", { name: "Save status", exact: true })
      .click();
    await page
      .getByText("Fixture rejected the change.", { exact: true })
      .waitFor();
    await page.waitForTimeout(500);
    assert.equal(
      await page.getByLabel("Recorded status").inputValue(),
      "pending",
    );
    assert.deepEqual(JSON.parse(writes.at(-1).body), {
      payment_status: "paid",
    });
    console.log("PASS failed status save restores server status");
    await page.getByRole("button", { name: "Back to players" }).click();
    await page
      .getByRole("button", { name: "Preview message to this list" })
      .click();
    await page.getByRole("dialog", { name: "Message preview" }).waitFor();
    assert.equal(await page.getByRole("button", { name: /send/i }).count(), 0);
    await snap("message-preview");
    await page.getByRole("button", { name: "Close preview" }).click();
    assert.equal(writes.length, 1);
    await page.goto(eventPath + "?tab=teams");
    await page.getByRole("heading", { name: "Team progress" }).waitFor();
    await snap("teams");
    await page
      .getByRole("link", { name: /unpaid/ })
      .first()
      .click();
    await page.waitForURL(
      (url) =>
        url.searchParams.has("team") &&
        url.searchParams.get("filter") === "unpaid",
    );
    await page.getByText(/Showing \d+ of 12 players/).waitFor();
    assert.equal(
      await page.locator(".admin-players tbody tr").count(),
      roster.rows.filter(
        (r) =>
          r.teamId === new URL(page.url()).searchParams.get("team") && !r.paid,
      ).length,
    );
    console.log("PASS team shortcut opens exact unpaid list");
    const matches = (
      await (
        await ctx.request.get(
          base + "/api/admin/tournaments/" + cup.id + "/matches",
        )
      ).json()
    ).matches;
    const match = matches.find((m) => m.home_score == null);
    assert(match);
    await page.goto(
      eventPath +
        "?tab=schedule&round=" +
        match.round_id +
        "&result=" +
        match.id,
    );
    await page.getByRole("dialog", { name: "Enter result" }).waitFor();
    await page.getByLabel("Fixture Athletic score", { exact: true }).fill("2");
    await page.getByLabel("Fixture United score", { exact: true }).fill("1");
    await page
      .getByRole("button", {
        name: "Add one goal for Casey Sample 3",
        exact: true,
      })
      .click();
    await snap("result-desktop");
    await page.setViewportSize({ width: 390, height: 844 });
    await snap("result-mobile");
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    const boxes = await page
      .locator('input[aria-label$=" score"]')
      .evaluateAll((es) => es.map((e) => e.getBoundingClientRect().top));
    assert(Math.abs(boxes[0] - boxes[1]) < 3);
    await page.route("**/matches/*/result", async (route) => {
      const r = route.request();
      if (r.method() !== "PUT") return route.fallback();
      const body = r.postDataJSON();
      writes.push({ url: r.url(), method: "PUT", body });
      await route.fulfill({
        json: {
          match: {
            ...match,
            ...body,
            status: "completed",
            scorers: body.scorers.map((scorer, i) => ({
              ...scorer,
              id: `sample-scorer-${i}`,
            })),
          },
        },
      });
    });
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(writes.filter((w) => w.method === "PUT").length, 1);
    assert.deepEqual(writes.at(-1).body, {
      home_score: 2,
      away_score: 1,
      scorers: [
        {
          team_id: match.home_team_id,
          scorer_name: "Casey Sample 3",
          goals: 1,
          own_goal: false,
          contact_id: roster.rows.find(
            (row) => row.firstName === "Casey" && row.lastName === "Sample 3",
          ).contactId,
        },
      ],
    });
    console.log("PASS one result save updates schedule");
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.getByText("Standings & top scorers", { exact: true }).click();
    await page.getByText("Casey Sample 3", { exact: true }).last().waitFor();
    await snap("schedule");
    await page.goto(eventPath);
    await page
      .getByRole("button", { name: "Alex Sample 1", exact: true })
      .waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await snap("players-mobile");
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.goto(base + "/admin/tournaments/new");
    await page
      .getByRole("button", { name: "Save event", exact: true })
      .waitFor();
    await page
      .getByLabel("Tournament Title", { exact: false })
      .fill("Sample design test");
    await snap("form-mobile");
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto(base + "/admin/tournaments");
    await page.getByLabel("Find an event").fill("Fixture Cup");
    await page.waitForTimeout(500);
    assert.equal(await page.locator("tbody tr").count(), 1);
    await snap("events");
    await page.goto(base + "/admin/contacts");
    await page.getByText("Alex Sample 1", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Expand", exact: true })
      .first()
      .click();
    await page.getByLabel("First name", { exact: true }).waitFor();
    await snap("people");
    await page.goto(eventPath + "?tab=updates");
    await page
      .getByLabel("Public announcement")
      .fill("Friday kickoff moved to 8 PM.");
    await page
      .getByRole("button", { name: "Preview message", exact: true })
      .click();
    await page.getByRole("dialog").waitFor();
    assert.equal(
      await page.getByRole("dialog").getByRole("textbox").inputValue(),
      "Friday kickoff moved to 8 PM.",
    );
    console.log("PASS announcements preview copies draft without publishing");
    await page.goto(base + "/admin/payments");
    await page
      .getByRole("heading", { name: "Card payment records", exact: true })
      .waitFor();
    await snap("payments");
    await page.goto(base + "/");
    await page.locator("body > header").waitFor({ state: "visible" });
    assert.equal(await page.locator(".hps-admin").count(), 0);
    console.log("PASS public header remains visible after leaving admin");
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(outputDir, "verification-result.json"),
      JSON.stringify({ passed: true, errors, writes }, null, 2),
    );
    console.log("ALL WORKSPACE CHECKS PASSED. Screenshots: " + outputDir);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
