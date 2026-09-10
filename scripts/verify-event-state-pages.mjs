/**
 * Stage 2.0 browser-level check: do the homepage, /events, /register and the
 * event pages AGREE about the same event, for every state an event can be in?
 *
 * ## Why a stub, and what it proves
 *
 * The production Supabase host is unreachable from the agent environment (the
 * egress proxy answers 403 to the CONNECT), and no local Postgres carries the
 * production schema. supabase-js only ever speaks PostgREST over HTTP, so this
 * script stands up a tiny in-memory PostgREST on localhost with a fixture set
 * built RELATIVE TO TODAY — one event per state the resolver distinguishes —
 * points a production build of the site at it, and renders the four surfaces
 * in headless Chromium. Every assertion is about text a visitor would read.
 *
 * It proves the surfaces agree with each other and with the resolver. It does
 * not exercise the real database, RLS, or a signed-in session (nobody here can
 * hold a Google session — the same limitation every previous session recorded).
 *
 * ## Running it
 *
 *   node scripts/verify-event-state-pages.mjs --build   # builds first (~1 min)
 *   node scripts/verify-event-state-pages.mjs           # reuses .next
 *
 * Chromium is looked for at $CHROME_PATH, then the Playwright cache under
 * /opt/pw-browsers. Without it the pages are fetched over HTTP instead and the
 * report says so — server-rendered HTML is the same text, but hydration is not
 * exercised.
 */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const STUB_PORT = Number(process.env.HPS_STUB_PORT ?? 54399);
const SITE_PORT = Number(process.env.HPS_SITE_PORT ?? 3199);
const SITE = `http://127.0.0.1:${SITE_PORT}`;
const BUILD = process.argv.includes("--build");

/* ------------------------------------------------------------------ *
 * Dates. The server resolves state against the real clock, so fixtures are
 * laid out relative to today in Houston, exactly as tournament-state.ts reads
 * them: noon UTC on the calendar day.
 * ------------------------------------------------------------------ */

function todayInHouston(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
const TODAY = todayInHouston();
function shift(days) {
  const [y, m, d] = TODAY.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
  return t.toISOString().slice(0, 10);
}
const noon = (ymd) => `${ymd}T12:00:00+00:00`;
const NOW_ISO = new Date().toISOString();

/* ------------------------------------------------------------------ *
 * Fixtures: one event per state.
 * ------------------------------------------------------------------ */

function event(overrides) {
  return {
    id: randomUUID(),
    title: "",
    slug: "",
    status: "upcoming",
    kind: "tournament",
    is_draft: false,
    registration_open: true,
    payments_open: true,
    description: "Fixture event for the Stage 2.0 browser check.",
    start_date: null,
    end_date: null,
    time_start: "7:00 PM",
    time_end: "9:00 PM",
    recurrence: null,
    location: "14062 Ambrose St, Houston TX",
    format: "Adult 7v7",
    entry_fee: 80,
    entry_fee_cents: 8000,
    drop_in_fee_cents: 0,
    free_entry_tournament_ids: [],
    stripe_product_id: null,
    stripe_price_id: null,
    max_teams: 8,
    image_url: null,
    image_preset: null,
    register_url: null,
    pay_url: null,
    display_order: 0,
    is_featured: false,
    created_at: NOW_ISO,
    updated_at: NOW_ISO,
    ...overrides,
  };
}

const cup = event({
  title: "Fixture Cup",
  slug: "fixture-cup",
  // Stored "upcoming" while in play — the Community Cup shape.
  status: "upcoming",
  is_featured: true,
  display_order: -1,
  start_date: noon(shift(-20)),
  end_date: noon(shift(40)),
  recurrence: "Games are every Friday.",
});
const friday = event({
  title: "Fixture Friday Open Play",
  slug: "fixture-friday",
  // Stored "ongoing" with both flags on, four weeks after it happened — the
  // Aug-14 shape that advertised itself for a month.
  status: "ongoing",
  kind: "open_play",
  is_featured: true,
  display_order: 1,
  start_date: noon(shift(-27)),
  end_date: noon(shift(-27)),
  recurrence: "Once",
  entry_fee: 10,
  entry_fee_cents: 1000,
  max_teams: null,
  free_entry_tournament_ids: [cup.id],
});
const november = event({
  title: "Fixture November Season",
  slug: "fixture-november",
  display_order: 2,
  start_date: noon(shift(57)),
  end_date: noon(shift(99)),
});
const winter = event({
  title: "Fixture Winter League",
  slug: "fixture-winter",
  registration_open: false,
  payments_open: false,
  display_order: 3,
  start_date: noon(shift(120)),
  end_date: noon(shift(160)),
});
const payOnly = event({
  title: "Fixture Pay Only",
  slug: "fixture-pay-only",
  registration_open: false,
  payments_open: true,
  display_order: 4,
  start_date: noon(shift(30)),
  end_date: noon(shift(30)),
});
const cancelled = event({
  title: "Fixture Cancelled Night",
  slug: "fixture-cancelled",
  status: "cancelled",
  kind: "open_play",
  display_order: 5,
  start_date: noon(shift(10)),
  end_date: noon(shift(10)),
});
const draft = event({
  title: "Fixture Draft",
  slug: "fixture-draft",
  is_draft: true,
  is_featured: true,
  display_order: 6,
  start_date: noon(shift(10)),
  end_date: noon(shift(10)),
});
const worldCup = event({
  title: "Fixture World Cup",
  slug: "fixture-world-cup",
  status: "completed",
  registration_open: false,
  payments_open: false,
  is_featured: true,
  display_order: 7,
  start_date: noon(shift(-90)),
  end_date: noon(shift(-45)),
});
const markedDone = event({
  title: "Fixture Marked Done",
  slug: "fixture-marked-done",
  // Hand-set "completed" with future dates and flags on: the explicit
  // operator override the resolver must honour.
  status: "completed",
  display_order: 8,
  start_date: noon(shift(15)),
  end_date: noon(shift(20)),
});

const tournaments = [
  cup,
  friday,
  november,
  winter,
  payOnly,
  cancelled,
  draft,
  worldCup,
  markedDone,
];

const teamA = { id: randomUUID(), tournament_id: cup.id, name: "Fixture Athletic", captain_contact_id: null, color: "#f97316", notes: null, created_at: NOW_ISO, updated_at: NOW_ISO };
const teamB = { id: randomUUID(), tournament_id: cup.id, name: "Fixture United", captain_contact_id: null, color: "#22d3ee", notes: null, created_at: NOW_ISO, updated_at: NOW_ISO };
const teams = [teamA, teamB];

function round(tournament_id, label, date, sort_order, counts = true) {
  return {
    id: randomUUID(),
    tournament_id,
    label,
    round_date: date,
    time_start: "7:00 PM",
    time_end: "9:00 PM",
    status: "scheduled",
    note: null,
    rescheduled_to: null,
    counts_toward_table: counts,
    sort_order,
    created_at: NOW_ISO,
    updated_at: NOW_ISO,
  };
}
const r1 = round(cup.id, "Round 1", shift(-20), 1);
const r2 = round(cup.id, "Round 2", shift(-13), 2);
const r3 = round(cup.id, "Round 3", shift(1), 3);
const rounds = [r1, r2, r3];

function match(round_id, n, home, away, hs, as, date) {
  const played = hs != null;
  return {
    id: randomUUID(),
    tournament_id: cup.id,
    round_id,
    match_number: n,
    home_team_id: home.id,
    away_team_id: away.id,
    home_team_label: null,
    away_team_label: null,
    match_date: date,
    kickoff_time: "7:00 PM",
    home_score: hs,
    away_score: as,
    status: played ? "completed" : "scheduled",
    notes: null,
    sort_order: n,
    created_at: NOW_ISO,
    updated_at: NOW_ISO,
  };
}
const matches = [
  match(r1.id, 1, teamA, teamB, 3, 1, shift(-20)),
  match(r2.id, 2, teamB, teamA, 2, 2, shift(-13)),
  match(r3.id, 3, teamA, teamB, null, null, shift(1)),
];

const TABLES = {
  tournaments,
  teams,
  tournament_rounds: rounds,
  matches,
  match_scorers: [],
  tournament_updates: [],
  site_settings: [],
  registrations: [],
  contacts: [],
  payments: [],
};

/* ------------------------------------------------------------------ *
 * The PostgREST stub. Enough of the query grammar for supabase-js reads:
 * eq / neq / is / in / gte / lte filters, order, limit, and rpc.
 * ------------------------------------------------------------------ */

const requestLog = [];

function matches_(cell, op, raw) {
  switch (op) {
    case "eq":
      return String(cell) === raw;
    case "neq":
      return String(cell) !== raw;
    case "is":
      return raw === "null" ? cell == null : String(cell) === raw;
    case "in": {
      const list = raw
        .replace(/^\(|\)$/g, "")
        .split(",")
        .map((s) => s.trim().replace(/^"|"$/g, ""));
      return list.includes(String(cell));
    }
    case "gte":
      return cell != null && String(cell) >= raw;
    case "lte":
      return cell != null && String(cell) <= raw;
    case "gt":
      return cell != null && String(cell) > raw;
    case "lt":
      return cell != null && String(cell) < raw;
    default:
      return true;
  }
}

function applyQuery(rows, params) {
  let out = rows;
  for (const [key, raw] of params) {
    if (["select", "order", "limit", "offset"].includes(key)) continue;
    const dot = raw.indexOf(".");
    if (dot < 0) continue;
    const op = raw.slice(0, dot);
    const val = raw.slice(dot + 1);
    out = out.filter((r) => matches_(r[key], op, val));
  }
  const orders = params
    .getAll("order")
    .flatMap((v) => v.split(","))
    .map((spec) => {
      const [col, dir = "asc", nulls] = spec.split(".");
      return { col, desc: dir === "desc", nullsFirst: nulls ? nulls === "nullsfirst" : dir === "desc" };
    });
  if (orders.length > 0) {
    out = [...out].sort((a, b) => {
      for (const o of orders) {
        const av = a[o.col];
        const bv = b[o.col];
        if (av == null && bv == null) continue;
        if (av == null) return o.nullsFirst ? -1 : 1;
        if (bv == null) return o.nullsFirst ? 1 : -1;
        if (av < bv) return o.desc ? 1 : -1;
        if (av > bv) return o.desc ? -1 : 1;
      }
      return 0;
    });
  }
  const limit = params.get("limit");
  if (limit) out = out.slice(0, Number(limit));
  return out;
}

function startStub() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://127.0.0.1:${STUB_PORT}`);
      requestLog.push(`${req.method} ${url.pathname}${url.search ? "?" + decodeURIComponent(url.search) : ""}`);
      const send = (body, status = 200) => {
        const json = JSON.stringify(body);
        res.writeHead(status, {
          "content-type": "application/json; charset=utf-8",
          "content-range": `0-${Array.isArray(body) ? Math.max(body.length - 1, 0) : 0}/*`,
        });
        res.end(json);
      };
      const m = url.pathname.match(/^\/rest\/v1\/(rpc\/)?([a-z_]+)$/);
      if (!m) return send({ message: "not found" }, 404);
      if (m[1]) {
        // Every function the public pages call returns an empty set here.
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => send([]));
        return;
      }
      const table = TABLES[m[2]];
      if (!table) return send([]);
      if (req.method === "HEAD") {
        res.writeHead(200, { "content-range": `0-0/${table.length}` });
        return res.end();
      }
      return send(applyQuery(table, url.searchParams));
    });
    server.listen(STUB_PORT, "127.0.0.1", () => resolve(server));
  });
}

/* ------------------------------------------------------------------ *
 * The site.
 * ------------------------------------------------------------------ */

const SITE_ENV = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${STUB_PORT}`,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-anon-key-for-the-stub",
  SUPABASE_SERVICE_ROLE_KEY: "local-service-key-for-the-stub",
  APP_SIGNING_SECRET: "stage-2-0-browser-check-signing-secret-32chars",
  NEXT_PUBLIC_SITE_URL: SITE,
  NEXT_TELEMETRY_DISABLED: "1",
};

/**
 * Async on purpose. The stub lives in THIS process; a `spawnSync` here would
 * block the event loop, and every build worker (and every Chromium render)
 * that asked the stub for rows would hang until its own timeout.
 */
function run(cmd, args, { env = process.env, cwd = ROOT, timeout = 0 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => (stdout += c));
    child.stderr.on("data", (c) => (stderr += c));
    const timer = timeout ? setTimeout(() => child.kill("SIGKILL"), timeout) : null;
    child.on("close", (status) => {
      if (timer) clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });
  });
}

async function runBuild() {
  console.log("Building the site against the stub environment…");
  const r = await run("node", ["node_modules/next/dist/bin/next", "build"], { env: SITE_ENV });
  if (r.status !== 0) {
    console.error(r.stdout);
    console.error(r.stderr);
    throw new Error("next build failed");
  }
}

async function waitFor(url, ms) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { redirect: "manual" });
      if (res.status < 500) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${url} did not come up within ${ms}ms`);
}

function startSite() {
  const child = spawn(
    "node",
    ["node_modules/next/dist/bin/next", "start", "-p", String(SITE_PORT)],
    { cwd: ROOT, env: SITE_ENV, stdio: ["ignore", "pipe", "pipe"] }
  );
  let log = "";
  child.stdout.on("data", (c) => (log += c));
  child.stderr.on("data", (c) => (log += c));
  return { child, log: () => log };
}

/* ------------------------------------------------------------------ *
 * Rendering.
 * ------------------------------------------------------------------ */

function findChrome() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const base = "/opt/pw-browsers";
  if (!existsSync(base)) return null;
  for (const dir of readdirSync(base)) {
    if (!dir.startsWith("chromium-")) continue;
    const bin = path.join(base, dir, "chrome-linux", "chrome");
    if (existsSync(bin)) return bin;
  }
  return null;
}

const CHROME = findChrome();
const consoleErrors = [];

async function render(pathname) {
  const url = `${SITE}${pathname}`;
  const status = (await fetch(url, { redirect: "manual" })).status;
  if (!CHROME) {
    const html = await (await fetch(url)).text();
    return { status, html, via: "fetch" };
  }
  const r = await run(
    CHROME,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--enable-logging=stderr",
      "--log-level=0",
      "--virtual-time-budget=4000",
      "--dump-dom",
      url,
    ],
    { timeout: 60_000 }
  );
  for (const line of (r.stderr ?? "").split("\n")) {
    const m = line.match(/CONSOLE\(\d+\)\] "(.*)"/);
    if (m && /error|hydrat|warning: /i.test(m[1])) consoleErrors.push(`${pathname}: ${m[1].slice(0, 200)}`);
  }
  return { status, html: r.stdout ?? "", via: "chromium" };
}

function decode(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
function text(html) {
  return decode(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}
function links(html) {
  const out = [];
  const re = /<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) out.push({ href: decode(m[1]), text: text(m[2]) });
  return out;
}
/** Split the /events page into one chunk per TournamentCard. */
function cards(html) {
  return html.split('class="dashboard-card overflow-hidden"').slice(1);
}

/* ------------------------------------------------------------------ *
 * Checks.
 * ------------------------------------------------------------------ */

let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `\n        ${detail}` : ""}`);
}

/** What each surface says about one event; the agreement table compares these. */
const agreement = new Map();
function note(slug, surface, label, offers) {
  const row = agreement.get(slug) ?? {};
  row[surface] = { label, offers };
  agreement.set(slug, row);
}

async function main() {
  const stub = await startStub();
  let site = null;
  try {
    if (BUILD || !existsSync(path.join(ROOT, ".next", "BUILD_ID"))) await runBuild();
    site = startSite();
    await waitFor(`${SITE}/`, 90_000);
    console.log(`Site up on ${SITE}; rendering via ${CHROME ? "headless Chromium" : "HTTP fetch (Chromium not found)"}. Today in Houston: ${TODAY}\n`);

    /* ---------------------------------------------------------- /events */
    console.log("/events");
    const ev = await render("/events");
    check("/events renders", ev.status === 200 && ev.html.includes("Tournaments"), `status=${ev.status}`);
    const evText = text(ev.html);
    const evCards = cards(ev.html);
    const byTitle = (t) => evCards.find((c) => text(c).includes(t));

    const order = tournaments
      .map((t) => ({ t, at: evText.indexOf(t.title) }))
      .filter((x) => x.at >= 0)
      .sort((a, b) => a.at - b.at)
      .map((x) => x.t.slug);
    // The page splits by kind: every tournament first, then the open play
    // nights. Within each section: upcoming soonest-first, then in progress,
    // then the archive newest-first. Drafts and cancellations never appear.
    check(
      "/events order: tournaments (upcoming, in progress, archive newest-first) then open play; drafts and cancellations absent",
      order.join(",") ===
        [payOnly, november, winter, cup, markedDone, worldCup, friday].map((t) => t.slug).join(","),
      order.join(" → ")
    );

    const expectCard = (t, label, mustNot, cta) => {
      const c = byTitle(t.title);
      if (!c) {
        check(`/events card for ${t.title} exists`, false, "not found");
        return;
      }
      const ct = text(c);
      // The status strip is everything before the title; the rest of the
      // chunk runs to the next card (or the next section heading).
      const strip = ct.slice(0, ct.indexOf(t.title));
      const ls = links(c);
      const signup = ls.find((l) => l.href === `/register?tournament=${t.slug}`);
      const pay = ls.find((l) => l.href === `/pay?tournament=${t.slug}`);
      const offers = signup ? "register" : pay ? "pay" : "none";
      note(t.slug, "events", label, offers);
      check(
        `/events ${t.title}: strip says "${label}"${mustNot ? ` and not "${mustNot}"` : ""}, CTA=${cta}`,
        strip.includes(label) && (!mustNot || !strip.includes(mustNot)) && offers === cta,
        `strip="${strip.trim()}" offers=${offers}`
      );
    };
    expectCard(cup, "Ongoing — Registration Open", null, "register");
    expectCard(friday, "Completed", "Registration", "none");
    expectCard(november, "Upcoming — Registration Open", null, "register");
    expectCard(winter, "Upcoming", "Open", "none");
    expectCard(payOnly, "Upcoming — Payments Open", "Registration", "pay");
    expectCard(worldCup, "Completed", "Open", "none");
    expectCard(markedDone, "Completed", "Open", "none");
    check("/events hides the cancelled event", !evText.includes(cancelled.title));
    check("/events hides the draft", !evText.includes(draft.title));

    /* ---------------------------------------------------------- / */
    console.log("\n/ (homepage)");
    const home = await render("/");
    const homeText = text(home.html);
    check("/ renders", home.status === 200 && homeText.includes("Houston Premier Soccer"), `status=${home.status}`);
    check(
      "/ hero headlines the starred event that is still live, with 'Sign up now'",
      homeText.includes(`Featured tournament ${cup.title}`) && links(home.html).some((l) => l.text === "Sign up now"),
      homeText.slice(homeText.indexOf("Featured"), homeText.indexOf("Featured") + 80)
    );
    const featuredSection = home.html.slice(home.html.indexOf('id="featured-tournaments"'), home.html.indexOf("What Happens Here"));
    check(
      "/ Featured Events shows only starred events that are not over (finished stars are ignored)",
      featuredSection.includes(cup.title) && !featuredSection.includes(friday.title) && !featuredSection.includes(worldCup.title) && !featuredSection.includes(draft.title),
      `friday=${featuredSection.includes(friday.title)} worldCup=${featuredSection.includes(worldCup.title)}`
    );
    const recentStart = home.html.indexOf("Recent Events");
    const recent = recentStart >= 0 ? home.html.slice(recentStart, home.html.indexOf("Find the Fields")) : "";
    const recentText = text(recent);
    check(
      "/ Recent Events holds the three most recent finished events, every one badged Completed and none Upcoming",
      [markedDone, friday, worldCup].every((t) => recentText.includes(t.title)) &&
        !recentText.includes(cup.title) &&
        (recentText.match(/Completed/g) ?? []).length >= 3 &&
        !recentText.includes("Upcoming"),
      recentText.slice(0, 160)
    );
    check(
      "/ hero status dot is derived: 'Registration open' because an event accepts sign-ups",
      homeText.includes("Registration open"),
      "from lib/status-pills.ts"
    );
    const heroHome = home.html.slice(0, home.html.indexOf('id="featured-tournaments"'));
    note(cup.slug, "home", "Featured", links(heroHome).some((l) => l.text === "Sign up now") ? "register" : "none");
    for (const t of [friday, worldCup, markedDone]) note(t.slug, "home", recentText.includes(t.title) ? "Completed" : "absent", "none");

    /* ---------------------------------------------------------- /events/[slug] */
    console.log("\n/events/[slug]");
    const expectDetail = async (t, headerLabel, badge, ctaHeading, offers) => {
      const page = await render(`/events/${t.slug}`);
      const pt = text(page.html);
      const ls = links(page.html);
      const signup = ls.find((l) => l.href === `/register?tournament=${t.slug}` && /Sign up/.test(l.text));
      const pay = ls.find((l) => l.href === `/pay?tournament=${t.slug}`);
      const got = signup ? "register" : pay ? "pay" : "none";
      // The header runs from the "All events" back link to the <h1>. The
      // title also appears earlier in the document <title>, so look for it
      // after the back link, not from the top.
      const backLink = pt.indexOf("All events");
      const header = pt.slice(backLink, pt.indexOf(t.title, backLink) + t.title.length + 10);
      note(t.slug, "detail", headerLabel, got);
      check(
        `/events/${t.slug}: header "${headerLabel}"${badge ? ` + "${badge}"` : " with no open badge"}, CTA card "${ctaHeading}", offers=${offers}`,
        page.status === 200 &&
          header.includes(headerLabel) &&
          (badge ? header.includes(badge) : !/Registration Open|Payments Open/.test(header)) &&
          pt.includes(ctaHeading) &&
          got === offers,
        `status=${page.status} header="${header.slice(0, 90)}" got=${got}`
      );
      return { page, pt };
    };
    const cupDetail = await expectDetail(cup, "Ongoing", "Registration Open", "Take part", "register");
    check(
      "/events/fixture-cup: the live hub (table, matches, scorers) renders under the header",
      cupDetail.pt.includes("Schedule & standings") && cupDetail.pt.includes(teamA.name),
      "hub present"
    );
    const fridayDetail = await expectDetail(friday, "Completed", null, "Past event", "none");
    check(
      "/events/fixture-friday: no D7 'Free for … players' offer on a finished night",
      !fridayDetail.pt.includes("Free for"),
      "canRegister gates the free-entry line"
    );
    await expectDetail(november, "Upcoming", "Registration Open", "Take part", "register");
    await expectDetail(winter, "Upcoming", null, "Take part", "none");
    await expectDetail(payOnly, "Upcoming", "Payments Open", "Take part", "pay");
    await expectDetail(cancelled, "Cancelled", null, "Cancelled", "none");
    await expectDetail(worldCup, "Completed", null, "Past event", "none");
    await expectDetail(markedDone, "Completed", null, "Past event", "none");
    const draftPage = await render(`/events/${draft.slug}`);
    check("/events/fixture-draft answers 404", draftPage.status === 404, `status=${draftPage.status}`);

    /* ---------------------------------------------------------- /register */
    console.log("\n/register");
    const expectRegister = async (t, mustSay, offers) => {
      const page = await render(`/register?tournament=${t.slug}`);
      const pt = text(page.html);
      const closedCard = pt.includes("Sign-ups aren't open right now");
      note(t.slug, "register", closedCard ? "Closed" : "Sign up", closedCard ? "none" : "register");
      check(
        `/register?tournament=${t.slug}: says "${mustSay}", offers=${offers}`,
        page.status === 200 && pt.includes(mustSay) && (closedCard ? "none" : "register") === offers,
        `status=${page.status} closedCard=${closedCard}`
      );
    };
    await expectRegister(cup, `Sign up — ${cup.title}`, "register");
    await expectRegister(november, `Sign up — ${november.title}`, "register");
    await expectRegister(friday, `${friday.title} has already happened.`, "none");
    await expectRegister(cancelled, `${cancelled.title} has been called off.`, "none");
    await expectRegister(winter, `${winter.title} isn't taking sign-ups at the moment.`, "none");
    await expectRegister(payOnly, `${payOnly.title} isn't taking sign-ups at the moment.`, "none");
    await expectRegister(worldCup, `${worldCup.title} has already happened.`, "none");
    await expectRegister(markedDone, `${markedDone.title} has already happened.`, "none");
    const picker = await render("/register");
    const pickerText = text(picker.html);
    check(
      "/register with no event lists exactly the events taking sign-ups",
      pickerText.includes(cup.title) &&
        pickerText.includes(november.title) &&
        ![friday, winter, payOnly, cancelled, draft, worldCup, markedDone].some((t) => pickerText.includes(t.title)),
      "picker"
    );
    const draftRegister = await render(`/register?tournament=${draft.slug}`);
    check(
      "/register?tournament=<draft> falls back to the picker rather than revealing the draft",
      !text(draftRegister.html).includes(draft.title) && text(draftRegister.html).includes(cup.title),
      "draft hidden"
    );

    /* ---------------------------------------------------------- agreement */
    console.log("\nAgreement across surfaces (offers = the door each surface advertises)");
    for (const t of tournaments) {
      const row = agreement.get(t.slug);
      if (!row) continue;
      const offers = new Set(Object.values(row).map((r) => r.offers));
      // /register can only ever offer sign-up or nothing; a pay-only event
      // correctly shows "pay" on the cards and "none" on the sign-up screen.
      const cardOffers = new Set(["events", "detail"].filter((s) => row[s]).map((s) => row[s].offers));
      const consistent = cardOffers.size <= 1 && (!row.register || row.register.offers === (row.events?.offers === "register" ? "register" : "none"));
      check(
        `${t.slug}: ${Object.entries(row).map(([s, r]) => `${s}=${r.label}/${r.offers}`).join("  ")}`,
        consistent,
        consistent ? "" : `offers=${[...offers].join(",")}`
      );
    }

    check("no hydration or runtime errors in the browser console", consoleErrors.length === 0, consoleErrors.slice(0, 5).join(" | "));
  } finally {
    if (site) site.child.kill("SIGTERM");
    stub.close();
  }

  const endpoints = [...new Set(requestLog.map((l) => l.replace(/\?.*/, "")))].sort();
  console.log(`\nStub endpoints hit (${requestLog.length} requests): ${endpoints.join(", ")}`);
  console.log(`\n${passed}/${passed + failed} passed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
