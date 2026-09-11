import { randomUUID } from "node:crypto";
import http from "node:http";
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

const teamA = {
  id: randomUUID(),
  tournament_id: cup.id,
  name: "Fixture Athletic",
  captain_contact_id: null,
  color: "#f97316",
  notes: null,
  created_at: NOW_ISO,
  updated_at: NOW_ISO,
};
const teamB = {
  id: randomUUID(),
  tournament_id: cup.id,
  name: "Fixture United",
  captain_contact_id: null,
  color: "#22d3ee",
  notes: null,
  created_at: NOW_ISO,
  updated_at: NOW_ISO,
};
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
  match(r2.id, 4, teamA, teamB, null, null, shift(-13)),
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
  manual_payments: [],
};

/* ------------------------------------------------------------------ *
 * The PostgREST stub. Enough of the query grammar for supabase-js reads:
 * eq / neq / is / in / gte / lte filters, `or=(a.op.v,b.op.v)`, order,
 * limit, and rpc.
 * ------------------------------------------------------------------ */

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
    if (key === "or") {
      // `or=(cancelled_at.is.null,needs_admin_review.eq.true)` — the roster
      // (Stage 2.3 D) and the contact-candidate search both use this form.
      const clauses = raw
        .replace(/^\(|\)$/g, "")
        .split(",")
        .map((clause) => {
          const [col, op, ...rest] = clause.split(".");
          return { col, op, val: rest.join(".") };
        });
      out = out.filter((r) => clauses.some((c) => matches_(r[c.col], c.op, c.val)));
      continue;
    }
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
      return {
        col,
        desc: dir === "desc",
        nullsFirst: nulls ? nulls === "nullsfirst" : dir === "desc",
      };
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

export function startAdminFixture(port = 0) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, "http://127.0.0.1");
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
        return send(
          { message: "Read-only fixture: database actions are unavailable." },
          405,
        );
      }
      if (!["GET", "HEAD"].includes(req.method))
        return send({ message: "Read-only inspection fixture" }, 405);
      const table = TABLES[m[2]];
      if (!table) return send([]);
      if (req.method === "HEAD") {
        res.writeHead(200, {
          "content-range": `0-0/${applyQuery(table, url.searchParams).length}`,
        });
        return res.end();
      }
      const rows = applyQuery(table, url.searchParams);
      return send(
        (req.headers.accept || "").includes("vnd.pgrst.object")
          ? (rows[0] ?? null)
          : rows,
      );
    });
    server.listen(port, "127.0.0.1", () => resolve(server));
    server.once("error", (error) => {
      server.close();
      reject(error);
    });
  });
}

for (let i = 0; i < 12; i++) {
  const signed = i % 3 !== 0,
    paid = i < 5;
  const contact = {
    id: randomUUID(),
    first_name: ["Alex", "Jordan", "Casey", "Taylor"][i % 4],
    last_name: "Sample " + (i + 1),
    email: "player" + i + "@example.test",
    phone: "713555" + String(1000 + i),
    tags: [],
    waiver_type: "adult",
    waiver_signed_at: signed ? NOW_ISO : null,
    waiver_expires_at: signed ? noon(shift(300)) : null,
    waiver_document_url: null,
    waiver_source: signed ? "admin_override" : null,
    created_at: NOW_ISO,
    updated_at: NOW_ISO,
  };
  TABLES.contacts.push(contact);
  TABLES.registrations.push({
    id: randomUUID(),
    tournament_id: cup.id,
    contact_id: contact.id,
    contact,
    tournament: { id: cup.id, title: cup.title, slug: cup.slug },
    first_name: contact.first_name,
    last_name: contact.last_name,
    email: contact.email,
    phone: contact.phone,
    dob: "1995-01-01",
    emergency_name: i % 3 ? "Sample Contact" : null,
    emergency_phone: i % 3 ? "7135559999" : null,
    team_id: i % 4 ? teams[i % 2].id : null,
    team_name: null,
    payment_status: paid ? "paid" : i < 7 ? "waived" : "pending",
    payment_method: i % 2 ? "card" : "cash",
    needs_admin_review: i === 0,
    // The sentence record_manual_payment writes on a card collision — the real
    // thing, so the preview shows the reason the way the owner will see it.
    notes:
      i === 0
        ? "Offline payment recorded for a registration that also has a settled Stripe payment — check for a double payment."
        : null,
    cancelled_at: null,
    waiver_signed: signed,
    waiver_signed_at: contact.waiver_signed_at,
    waiver_document_url: null,
    created_at: NOW_ISO,
    payments: [],
    registration_type: "individual",
  });
  if (paid && i % 2)
    TABLES.payments.push({
      id: randomUUID(),
      created_at: NOW_ISO,
      email: contact.email,
      amount: 80,
      currency: "usd",
      tournament_id: cup.id,
      tournament_name: cup.title,
      contact_id: contact.id,
      contact,
      tournament: { id: cup.id, title: cup.title, slug: cup.slug },
      registrations: {
        first_name: contact.first_name,
        last_name: contact.last_name,
      },
      status: "succeeded",
      notes: null,
    });
}
TABLES.drop_ins = [];
