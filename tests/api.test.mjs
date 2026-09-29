// Integration tests for /api/fm360 against a real Postgres database and a local Netlify Blobs server.
// Run with: TEST_DATABASE_URL=postgres://... npm test
// The database must already have the migrations from netlify/database/migrations applied;
// every test empties all fm360_* tables first, so never point this at real data.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, beforeEach, describe, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import pg from "pg";
import { BlobsServer } from "@netlify/blobs/server";

const DATABASE_URL = process.env.TEST_DATABASE_URL;
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASE = "https://fm360.test/api/fm360";

describe("fm360 API", { skip: DATABASE_URL ? false : "TEST_DATABASE_URL is not set" }, () => {
  let handler;
  let pool;
  let blobsServer;

  before(async () => {
    const blobsToken = "test-token";
    blobsServer = new BlobsServer({ directory: await mkdtemp(path.join(tmpdir(), "fm360-blobs-")), token: blobsToken });
    const { port } = await blobsServer.start();
    const edgeURL = `http://127.0.0.1:${port}`;
    process.env.NETLIFY_BLOBS_CONTEXT = Buffer.from(JSON.stringify({ edgeURL, uncachedEdgeURL: edgeURL, siteID: "fm360-test", token: blobsToken })).toString("base64");
    process.env.NETLIFY_DB_URL = DATABASE_URL;
    process.env.NETLIFY_DB_DRIVER = "server";
    process.env.FM360_AUTH_SECRET = "test-secret";

    const outfile = path.join(ROOT, "node_modules/.cache/fm360-test/fm360.mjs");
    await build({ entryPoints: [path.join(ROOT, "netlify/functions/fm360.ts")], bundle: true, platform: "node", format: "esm", packages: "external", outfile, logLevel: "silent" });
    handler = (await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`)).default;
    pool = new pg.Pool({ connectionString: DATABASE_URL });
  });

  after(async () => {
    await pool?.end();
    await blobsServer?.stop();
  });

  beforeEach(async () => {
    const { rows } = await pool.query("select tablename from pg_tables where schemaname = 'public' and tablename like 'fm360_%'");
    await pool.query(`truncate ${rows.map((row) => `"${row.tablename}"`).join(", ")} cascade`);
  });

  function call(method, { body, token, cookie, query = "" } = {}) {
    const headers = { "content-type": "application/json" };
    if (token) headers.authorization = `Bearer ${token}`;
    if (cookie) headers.cookie = cookie;
    return handler(new Request(BASE + query, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }));
  }

  async function login(loginName, password) {
    const res = await call("POST", { body: { action: "login", loginName, password } });
    if (res.status !== 200) return null;
    const data = await res.json();
    return { ...data, cookie: (res.headers.get("set-cookie") || "").split(";")[0] };
  }

  async function adminToken() {
    const session = await login("admin", "admin");
    assert.ok(session, "bootstrap admin login must work on an empty database");
    return session.token;
  }

  test("planning keeps workplace and task after creation, editing and a fresh read", async () => {
    const token = await adminToken();
    const employee = { id: "emp-plan-test", name: "Plan Test", role: "FM Internal" };
    const shift = { id: "shift-test", employeeId: employee.id, date: "2026-09-29", shiftType: "Normaldienst", taskAssignment: "Lüftung prüfen", workLocation: "Neubau / UG / Technikraum" };
    assert.equal((await batch(token, { employees: { upsert: [employee] }, shifts: { upsert: [shift] } })).status, 200);
    let saved = (await getState(token)).shifts.find(s => s.id === shift.id);
    assert.equal(saved.workLocation, shift.workLocation);
    assert.equal(saved.taskAssignment, shift.taskAssignment);
    assert.equal((await batch(token, { shifts: { upsert: [{ ...saved, date: "2026-09-30", workLocation: "Altbau / EG", taskAssignment: "Beleuchtung prüfen" }] } })).status, 200);
    saved = (await getState(token)).shifts.find(s => s.id === shift.id);
    assert.equal(saved.workLocation, "Altbau / EG");
    assert.equal(saved.taskAssignment, "Beleuchtung prüfen");
    assert.equal(saved.date, "2026-09-30");
    assert.equal((await getState(token)).shifts.length, 1);
  });

  test("legacy planning records without a workplace remain readable", async () => {
    const token = await adminToken();
    assert.equal((await batch(token, { shifts: { upsert: [{ id: "legacy-shift", employeeId: "emp-roland", date: "2026-09-28", shiftType: "Normaldienst", taskAssignment: "Existing task" }] } })).status, 200);
    const saved = (await getState(token)).shifts.find(s => s.id === "legacy-shift");
    assert.equal(saved.workLocation, "");
    assert.equal(saved.taskAssignment, "Existing task");
  });

  async function getState(token) {
    const res = await call("GET", { token });
    assert.equal(res.status, 200);
    return res.json();
  }

  async function putState(token, state) {
    return call("PUT", { token, body: state });
  }

  test("reading data requires a login", async () => {
    assert.equal((await call("GET")).status, 401);
    assert.equal((await call("GET", { query: "?debugTickets=true" })).status, 401);
    assert.equal((await call("GET", { token: "forged.token" })).status, 401);
    assert.equal((await call("GET", { token: await adminToken() })).status, 200);
  });

  test("the session cookie is only accepted for file downloads", async () => {
    const session = await login("admin", "admin");
    assert.match(session.cookie, /^fm360_session=.+/);
    assert.equal((await call("GET", { cookie: session.cookie })).status, 401, "state must need the Bearer header");
    assert.equal((await call("PUT", { cookie: session.cookie, body: {} })).status, 401, "writes must need the Bearer header");
    assert.equal((await call("GET", { cookie: session.cookie, query: "?photoId=missing" })).status, 404, "file requests accept the cookie");
    assert.equal((await call("GET", { query: "?photoId=missing" })).status, 401);
  });

  test("saving the whole state keeps employee passwords", async () => {
    const token = await adminToken();
    const state = await getState(token);
    state.employees.push({ id: "emp-anna", name: "Anna", loginName: "anna", loginEnabled: true, password: "anna-pass", role: "Field Technician" });
    assert.equal((await putState(token, state)).status, 200);
    assert.ok(await login("anna", "anna-pass"), "new password works");

    // The admin app saves the state it got back, which never contains password hashes.
    const reloaded = await getState(token);
    assert.equal(reloaded.employees.some((employee) => "passwordHash" in employee), false);
    reloaded.nodes.push({ id: "n1", parent: null, type: "Standort", name: "Haslen" });
    assert.equal((await putState(token, reloaded)).status, 200);

    assert.ok(await login("anna", "anna-pass"), "password must survive a later save");
    assert.ok(await login("admin", "admin"), "admin password must survive a later save");
  });

  test("a changed admin password is not reset to the default", async () => {
    const token = await adminToken();
    const state = await getState(token);
    state.employees.find((employee) => employee.loginName === "admin").password = "neues-passwort";
    assert.equal((await putState(token, state)).status, 200);
    await getState(token);

    assert.equal(await login("admin", "admin"), null);
    assert.ok(await login("admin", "neues-passwort"));
  });

  test("a disabled default login stays disabled", async () => {
    const token = await adminToken();
    const state = await getState(token);
    state.employees.find((employee) => employee.loginName === "worker").loginEnabled = false;
    assert.equal((await putState(token, state)).status, 200);
    await getState(token);

    assert.equal(await login("worker", "worker"), null);
  });

  test("saving tickets assigned to an employee keeps all data", async () => {
    const token = await adminToken();
    const state = await getState(token);
    const worker = state.employees.find((employee) => employee.loginName === "worker");
    state.nodes.push({ id: "room-1", parent: null, type: "Raum / Bereich", name: "Heizraum" });
    state.tickets.push({ id: "t1", parent: "room-1", type: "Störung", status: "Offen", prio: "Hoch", title: "Pumpe defekt", assignedEmployeeId: worker.id });
    state.emergencyContacts.push({ id: "ec-1", name: "Feuerwehr", phone: "118" });
    state.costs.push({ id: "c1", parent: "room-1", category: "budget", title: "Budget 2026", amountChf: "1000" });
    assert.equal((await putState(token, state)).status, 200);

    const saved = await getState(token);
    assert.equal(saved.tickets.length, 1);
    assert.equal(saved.emergencyContacts.length, 1, "tables saved after the tickets must not be lost");
    assert.equal(saved.costs.length, 1);
    assert.ok(saved.notifications.some((n) => n.ticketId === "t1" && n.employeeId === worker.id));

    assert.equal((await putState(token, saved)).status, 200, "saving again must work too");
    assert.equal((await getState(token)).tickets.length, 1);
  });

  test("a failing save leaves the previous data untouched", async () => {
    const token = await adminToken();
    const state = await getState(token);
    state.nodes.push({ id: "n1", parent: null, type: "Standort", name: "Haslen" });
    assert.equal((await putState(token, state)).status, 200);

    const broken = await getState(token);
    broken.nodes.push({ id: "n2", parent: null, type: "Standort", name: "Neu" });
    broken.notifications.push({ id: "bad", employeeId: broken.employees[0].id, eventType: "not-allowed", title: "x" });
    assert.equal((await putState(token, broken)).status, 500);

    const after = await getState(token);
    assert.deepEqual(after.nodes.map((n) => n.id), ["n1"]);
    assert.ok(await login("admin", "admin"));
  });

  test("legacy sha256 passwords still work and are upgraded on login", async () => {
    await adminToken();
    const legacy = `sha256:${createHash("sha256").update("alt-passwort").digest("hex")}`;
    await pool.query("insert into fm360_employees (id, name, login_name, login_enabled, password_hash) values ('emp-alt', 'Alt', 'alt', true, $1)", [legacy]);

    assert.ok(await login("alt", "alt-passwort"));
    const { rows } = await pool.query("select password_hash from fm360_employees where id = 'emp-alt'");
    assert.match(rows[0].password_hash, /^pbkdf2-sha256\$/);
    assert.ok(await login("alt", "alt-passwort"), "upgraded hash still verifies");
  });

  test("uploaded photos are served only to logged-in users", async () => {
    const session = await login("admin", "admin");
    const bytes = Buffer.from("fake-jpeg-bytes");
    const res = await call("PATCH", {
      token: session.token,
      body: { collection: "photos", item: { id: "p1", parent: "", blobKey: "photo-p1", contentType: "image/jpeg", base64: bytes.toString("base64") } },
    });
    assert.equal(res.status, 200);

    assert.equal((await call("GET", { query: "?photoId=p1" })).status, 401);
    const photo = await call("GET", { cookie: session.cookie, query: "?photoId=p1" });
    assert.equal(photo.status, 200);
    assert.deepEqual(Buffer.from(await photo.arrayBuffer()), bytes);

    // Removing the photo from the state deletes the file after the save commits.
    const state = await getState(session.token);
    state.photos = [];
    assert.equal((await putState(session.token, state)).status, 200);
    assert.equal((await call("GET", { cookie: session.cookie, query: "?photoId=p1" })).status, 404);
  });

  async function batch(token, changes) {
    return call("PATCH", { token, body: { action: "batch", changes } });
  }

  async function createLogin(adminTokenValue, { id, loginName, password, role }) {
    const res = await batch(adminTokenValue, { employees: { upsert: [{ id, name: loginName, loginName, loginEnabled: true, password, role }] } });
    assert.equal(res.status, 200);
    const session = await login(loginName, password);
    assert.ok(session, `${loginName} can log in`);
    return session.token;
  }

  test("batch saves only touch the records that changed", async () => {
    const admin = await adminToken();
    assert.equal((await batch(admin, { nodes: { upsert: [{ id: "a", parent: null, type: "Standort", name: "A" }] } })).status, 200);

    // Two people save at the same time from the same starting point: both changes survive.
    const other = await createLogin(admin, { id: "emp-fm", loginName: "fm", password: "fm-pass", role: "FM Internal" });
    assert.equal((await batch(admin, { nodes: { upsert: [{ id: "a", parent: null, type: "Standort", name: "A neu" }] } })).status, 200);
    assert.equal((await batch(other, { nodes: { upsert: [{ id: "b", parent: null, type: "Standort", name: "B" }] } })).status, 200);
    const state = await getState(admin);
    assert.deepEqual(state.nodes.map((n) => [n.id, n.name]).sort(), [["a", "A neu"], ["b", "B"]]);
    assert.ok(state.nodes.find((n) => n.id === "b").sortOrder > state.nodes.find((n) => n.id === "a").sortOrder, "new nodes go after their siblings");

    assert.equal((await batch(admin, { nodes: { delete: ["b"] } })).status, 200);
    assert.deepEqual((await getState(admin)).nodes.map((n) => n.id), ["a"]);
  });

  test("new nodes get an FM code from the tree", async () => {
    const admin = await adminToken();
    const res = await batch(admin, { nodes: { upsert: [
      { id: "s", parent: null, type: "Standort", name: "Haslen" },
      { id: "g", parent: "s", type: "Objekt / Gebäude", name: "Neubau", code: "NEU" },
      { id: "e", parent: "g", type: "Etage", name: "UG", code: "UG" },
    ] } });
    assert.equal(res.status, 200);
    const nodes = (await res.json()).nodes;
    assert.match(nodes.find((n) => n.id === "e").objectCode, /UG/);
  });

  test("saving an unchanged assigned ticket does not notify again", async () => {
    const admin = await adminToken();
    const worker = (await getState(admin)).employees.find((employee) => employee.loginName === "worker");
    const ticket = { id: "t1", parent: "room", type: "Störung", status: "Offen", prio: "Hoch", title: "Pumpe", assignedEmployeeId: worker.id };
    assert.equal((await batch(admin, { tickets: { upsert: [ticket] } })).status, 200);
    const saved = (await getState(admin)).tickets[0];
    assert.equal((await batch(admin, { tickets: { upsert: [saved] } })).status, 200);
    assert.equal((await batch(admin, { tickets: { upsert: [saved] } })).status, 200);
    assert.equal((await getState(admin)).notifications.length, 1);

    assert.equal((await batch(admin, { tickets: { upsert: [{ ...saved, prio: "Mittel" }] } })).status, 200);
    assert.equal((await getState(admin)).notifications.length, 2, "a real change still notifies");
  });

  test("field roles can only create and update field records", async () => {
    const admin = await adminToken();
    const worker = (await login("worker", "worker")).token;
    assert.equal((await getState(worker)).nodes.length, 0, "workers can read");
    assert.equal((await call("PATCH", { token: worker, body: { collection: "tickets", item: { id: "t1", parent: "x", type: "Störung", title: "Leck" } } })).status, 200);
    assert.equal((await batch(worker, { tickets: { upsert: [{ id: "t2", parent: "x", type: "Störung", title: "Zweites" }] } })).status, 200);

    assert.equal((await batch(worker, { nodes: { upsert: [{ id: "n", parent: null, type: "Standort", name: "X" }] } })).status, 403);
    assert.equal((await call("DELETE", { token: worker, body: { collection: "tickets", ids: ["t1"] } })).status, 403);
    assert.equal((await batch(worker, { employees: { upsert: [{ id: "emp-roland", name: "Roland", role: "Admin / Chef" }] } })).status, 403);
    assert.equal((await putState(worker, await getState(worker))).status, 403);
    assert.equal((await call("POST", { token: worker, query: "?seed=true" })).status, 403);
    assert.equal((await call("GET", { token: worker, query: "?debugTickets=true" })).status, 403);
    assert.equal((await getState(admin)).tickets.length, 2);
  });

  test("FM Internal cannot change logins, passwords or roles", async () => {
    const admin = await adminToken();
    const internal = await createLogin(admin, { id: "emp-fm", loginName: "fm", password: "fm-pass", role: "FM Internal" });
    const worker = (await getState(admin)).employees.find((employee) => employee.loginName === "worker");

    const res = await batch(internal, { employees: { upsert: [{ ...worker, availability: "Ferien", password: "gehackt", role: "Admin / Chef", loginName: "chef" }] } });
    assert.equal(res.status, 200);
    const updated = (await getState(admin)).employees.find((employee) => employee.id === worker.id);
    assert.equal(updated.availability, "Ferien", "master data can be maintained");
    assert.equal(updated.role, worker.role);
    assert.equal(updated.loginName, "worker");
    assert.equal(await login("worker", "gehackt"), null);
    assert.ok(await login("worker", "worker"));

    assert.equal((await batch(internal, { employees: { delete: [worker.id] } })).status, 403);
    assert.equal((await batch(internal, { roles: { upsert: [{ id: "r1", name: "Neu" }] } })).status, 403);
    assert.equal((await batch(internal, { nodes: { upsert: [{ id: "n", parent: null, type: "Standort", name: "X" }] } })).status, 200);
  });

  test("the last admin login cannot be removed", async () => {
    const admin = await adminToken();
    const me = (await getState(admin)).employees.find((employee) => employee.loginName === "admin");
    assert.equal((await batch(admin, { employees: { upsert: [{ ...me, loginEnabled: false }] } })).status, 409);
    assert.equal((await batch(admin, { employees: { delete: [me.id] } })).status, 409);
    assert.ok(await login("admin", "admin"), "admin is unchanged");

    // The seeded admin account keeps its rights even if its role text gets lost.
    assert.equal((await batch(admin, { employees: { upsert: [{ ...me, role: "" }] } })).status, 200);
    assert.equal((await batch(admin, { roles: { upsert: [{ id: "r1", name: "Rolle" }] } })).status, 200);

    const chef = await createLogin(admin, { id: "emp-chef2", loginName: "chef2", password: "chef2-pass", role: "Admin / Chef" });
    assert.equal((await batch(admin, { employees: { upsert: [{ ...me, loginEnabled: false }] } })).status, 200, "fine once another admin exists");
    const demoteLast = { id: "emp-chef2", name: "chef2", loginName: "chef2", loginEnabled: true, role: "FM Internal" };
    assert.equal((await batch(chef, { employees: { upsert: [demoteLast] } })).status, 409, "the remaining admin cannot demote itself");
  });

  test("a disabled login loses access immediately", async () => {
    const admin = await adminToken();
    const workerSession = await login("worker", "worker");
    const worker = (await getState(admin)).employees.find((employee) => employee.loginName === "worker");
    assert.equal((await batch(admin, { employees: { upsert: [{ ...worker, loginEnabled: false }] } })).status, 200);
    assert.equal((await call("GET", { token: workerSession.token })).status, 401);
  });

  test("ids that could break out of HTML attributes are rejected", async () => {
    const admin = await adminToken();
    assert.equal((await batch(admin, { nodes: { upsert: [{ id: "x');alert(1);('", parent: null, type: "Standort", name: "X" }] } })).status, 400);
    assert.equal((await batch(admin, { tickets: { upsert: [{ id: "t", parent: "<img>", type: "Störung", title: "X" }] } })).status, 400);
    assert.equal((await batch(admin, { nodes: { upsert: [{ id: "ok-1_2.3:4", parent: null, type: "Standort", name: "<b>Name darf alles</b>" }] } })).status, 200);
  });

  test("repeated wrong passwords block further login attempts", async () => {
    await adminToken();
    for (let i = 0; i < 10; i++) assert.equal(await login("worker", `falsch-${i}`), null);
    const res = await call("POST", { body: { action: "login", loginName: "worker", password: "worker" } });
    assert.equal(res.status, 429, "even the right password is refused while blocked");
    assert.ok(await login("admin", "admin"), "other accounts are not affected");
    await pool.query("update fm360_login_attempts set window_start = now() - interval '16 minutes'");
    assert.ok(await login("worker", "worker"), "the block ends after 15 minutes");
  });

  test("uploaded files that could run scripts are downloaded, not shown", async () => {
    const session = await login("admin", "admin");
    const upload = (id, contentType, text) => call("PATCH", {
      token: session.token,
      body: { collection: "docs", item: { id, parent: "x", type: "Dokument", title: id, blobKey: `doc-${id}`, contentType, fileName: `${id}.bin`, base64: Buffer.from(text).toString("base64") } },
    });
    assert.equal((await upload("html", "text/html", "<script>alert(1)</script>")).status, 200);
    assert.equal((await upload("pdf", "application/pdf", "%PDF-1.4")).status, 200);

    const html = await call("GET", { cookie: session.cookie, query: "?docId=html" });
    assert.equal(html.headers.get("content-type"), "application/octet-stream");
    assert.match(html.headers.get("content-disposition"), /^attachment/);
    assert.equal(html.headers.get("x-content-type-options"), "nosniff");

    const pdf = await call("GET", { cookie: session.cookie, query: "?docId=pdf" });
    assert.equal(pdf.headers.get("content-type"), "application/pdf");
    assert.match(pdf.headers.get("content-disposition"), /^inline/);
  });

  test("duplicate unique values are reported as a conflict", async () => {
    const admin = await adminToken();
    const res = await batch(admin, { employees: { upsert: [
      { id: "e1", name: "A", email: "same@example.ch" },
      { id: "e2", name: "B", email: "same@example.ch" },
    ] } });
    assert.equal(res.status, 409);
    assert.match((await res.json()).error, /bereits vergeben/);
    assert.equal((await getState(admin)).employees.some((employee) => employee.id === "e1"), false, "nothing was saved");
  });

  test("logout clears the session cookie", async () => {
    const res = await call("POST", { body: { action: "logout" } });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("set-cookie") || "", /^fm360_session=;.*Max-Age=0/);
  });

  // --- Wiederkehrende Arbeitsaufträge ---------------------------------------------------------
  const zurichToday = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Zurich" }).format(new Date());
  const shiftDays = (iso, days) => { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10); };
  const recurring = (extra = {}) => ({
    id: "rt1", parent: "room-1", type: "Wartung / Service", status: "Offen", prio: "Mittel", title: "Filter prüfen", due: "2026-10-01",
    text: "Filter und Keilriemen prüfen", materialNeeded: "2x Filter F7, 1 Keilriemen",
    recurrence: { every: 12, unit: "days", remindBefore: 7, remindUnit: "days", managerId: "emp-admin" }, ...extra,
  });

  test("recurrence and material are stored and kept when an older client omits them", async () => {
    const admin = await adminToken();
    assert.equal((await batch(admin, { tickets: { upsert: [recurring()] } })).status, 200);
    let [ticket] = (await getState(admin)).tickets;
    assert.deepEqual(ticket.recurrence, { every: 12, unit: "days", remindBefore: 7, remindUnit: "days", managerId: "emp-admin" });
    assert.equal(ticket.materialNeeded, "2x Filter F7, 1 Keilriemen");
    assert.equal(ticket.seriesId, "rt1");

    const { recurrence: _r, materialNeeded: _m, due: _d, seriesId: _s, ...oldClient } = ticket;
    assert.equal((await batch(admin, { tickets: { upsert: [{ ...oldClient, prio: "Hoch" }] } })).status, 200);
    [ticket] = (await getState(admin)).tickets;
    assert.equal(ticket.prio, "Hoch");
    assert.equal(ticket.recurrence?.every, 12, "recurrence survives a save without the field");
    assert.equal(ticket.materialNeeded, "2x Filter F7, 1 Keilriemen");
    assert.equal(ticket.due, "2026-10-01", "the date survives a save without the field");

    assert.equal((await batch(admin, { tickets: { upsert: [{ ...ticket, recurrence: null }] } })).status, 200);
    assert.equal((await getState(admin)).tickets[0].recurrence, null, "explicit null ends the repetition");
  });

  test("invalid intervals, dates and managers are rejected", async () => {
    const admin = await adminToken();
    for (const [extra, why] of [
      [{ recurrence: { every: 0, unit: "days" } }, "zero interval"],
      [{ recurrence: { every: 12, unit: "years" } }, "unknown unit"],
      [{ recurrence: { every: 12, unit: "days", remindBefore: -2 } }, "negative reminder"],
      [{ due: "" }, "missing date"],
      [{ due: "2026-02-30" }, "impossible date"],
      [{ due: "01.10.2026" }, "wrong date format"],
      [{ recurrence: { every: 12, unit: "days", managerId: "emp-nobody" } }, "unknown manager"],
    ]) {
      const res = await batch(admin, { tickets: { upsert: [recurring(extra)] } });
      assert.equal(res.status, 400, why);
    }
    assert.equal((await getState(admin)).tickets.length, 0);
  });

  test("completing a recurring order keeps its history and creates exactly one next order", async () => {
    const admin = await adminToken();
    const worker = (await getState(admin)).employees.find((employee) => employee.loginName === "worker");
    assert.equal((await batch(admin, { tickets: { upsert: [recurring({ assignedEmployeeId: worker.id })] } })).status, 200);
    const [open] = (await getState(admin)).tickets;

    // Late completion with a changed date in the request: the next date still follows the plan.
    const done = { ...open, status: "Erledigt", due: "2026-10-09", completionNote: "Geprüft, kein Mangel." };
    assert.equal((await batch(admin, { tickets: { upsert: [done] } })).status, 200);
    assert.equal((await batch(admin, { tickets: { upsert: [done] } })).status, 200, "saving again");
    let tickets = (await getState(admin)).tickets;
    assert.equal(tickets.length, 2);
    const closed = tickets.find((t) => t.id === "rt1");
    const next = tickets.find((t) => t.id !== "rt1");
    assert.equal(closed.due, "2026-10-01", "completed order keeps its original date");
    assert.ok(closed.completedAt, "completion time is stored");
    assert.equal(closed.nextTicketId, next.id);
    assert.equal(next.due, "2026-10-13", "next date = planned date + 12 days, not completion date");
    assert.equal(next.status, "Offen");
    assert.equal(next.previousTicketId, "rt1");
    assert.equal(next.seriesId, "rt1");
    assert.equal(next.assignedEmployeeId, worker.id);
    assert.equal(next.materialNeeded, "2x Filter F7, 1 Keilriemen");
    assert.equal(closed.completionNote, "Geprüft, kein Mangel.");
    assert.equal(next.completionNote, "", "a new inspection must not inherit an old inspection result");
    assert.equal(next.text, open.text, "the inspection instructions remain unchanged");
    assert.deepEqual(next.recurrence, closed.recurrence);
    assert.ok((await getState(admin)).notifications.some((n) => n.ticketId === next.id && n.employeeId === worker.id), "worker is told about the next order");

    // Reopening and closing again does not create a second follow-up.
    assert.equal((await batch(admin, { tickets: { upsert: [{ ...closed, status: "Offen" }] } })).status, 200);
    assert.equal((await batch(admin, { tickets: { upsert: [{ ...closed, status: "Abgeschlossen" }] } })).status, 200);
    tickets = (await getState(admin)).tickets;
    assert.equal(tickets.filter((t) => t.previousTicketId === "rt1").length, 1);
    assert.equal(tickets.length, 2);
  });

  test("simultaneous completion creates only one next order", async () => {
    const admin = await adminToken();
    assert.equal((await batch(admin, { tickets: { upsert: [recurring()] } })).status, 200);
    const [open] = (await getState(admin)).tickets;
    const done = { ...open, status: "Erledigt" };
    const results = await Promise.all(Array.from({ length: 5 }, () => batch(admin, { tickets: { upsert: [done] } })));
    assert.ok(results.every((res) => res.status === 200), `statuses: ${results.map((res) => res.status)}`);
    const tickets = (await getState(admin)).tickets;
    assert.equal(tickets.filter((t) => t.previousTicketId === "rt1").length, 1);
  });

  test("monthly orders keep the end of month and one-time orders do not repeat", async () => {
    const admin = await adminToken();
    const monthly = recurring({ id: "m1", due: "2026-01-31", recurrence: { every: 1, unit: "months", remindBefore: 1, remindUnit: "weeks" } });
    const once = { id: "o1", parent: "room-1", type: "Reparatur", status: "Offen", prio: "Hoch", title: "Leck", due: "2026-10-01" };
    assert.equal((await batch(admin, { tickets: { upsert: [monthly, once] } })).status, 200);
    const saved = (await getState(admin)).tickets;
    assert.equal(saved.find((t) => t.id === "m1").recurrence.managerId, "emp-admin", "manager defaults to the person planning");
    assert.equal(saved.find((t) => t.id === "o1").recurrence, null);
    assert.equal((await batch(admin, { tickets: { upsert: saved.map((t) => ({ ...t, status: "Erledigt" })) } })).status, 200);
    const tickets = (await getState(admin)).tickets;
    assert.equal(tickets.length, 3, "only the recurring order gets a successor");
    assert.equal(tickets.find((t) => t.previousTicketId === "m1").due, "2026-02-28");
    assert.equal(tickets.some((t) => t.previousTicketId === "o1"), false);
  });

  test("field workers can complete recurring orders", async () => {
    const admin = await adminToken();
    assert.equal((await batch(admin, { tickets: { upsert: [recurring()] } })).status, 200);
    const worker = (await login("worker", "worker")).token;
    const [open] = (await getState(worker)).tickets;
    assert.equal((await batch(worker, { tickets: { upsert: [{ ...open, status: "Erledigt" }] } })).status, 200);
    assert.equal((await getState(admin)).tickets.length, 2);
  });

  test("the manager gets one in-app reminder when the reminder date is reached", async () => {
    const admin = await adminToken();
    const today = zurichToday();
    const due = recurring({ id: "due-soon", due: shiftDays(today, 3) });
    const later = recurring({ id: "later", due: shiftDays(today, 30) });
    const closed = recurring({ id: "closed", due: shiftDays(today, 1), status: "Erledigt" });
    assert.equal((await batch(admin, { tickets: { upsert: [due, later, closed] } })).status, 200);
    await getState(admin);
    const state = await getState(admin);
    const reminders = state.notifications.filter((n) => n.eventType === "maintenance_reminder");
    assert.deepEqual(reminders.map((n) => n.ticketId), ["due-soon"], "only the order within its reminder window, once");
    assert.equal(reminders[0].employeeId, "emp-admin");
    assert.match(reminders[0].body, /Filter F7/);

    // Marking the reminder as read through the normal notification save works.
    assert.equal((await batch(admin, { notifications: { upsert: [{ ...reminders[0], readAt: new Date().toISOString() }] } })).status, 200);
    const read = (await getState(admin)).notifications.find((n) => n.id === reminders[0].id);
    assert.ok(read.readAt, "reminder stays read and is not recreated");
  });

  // --- Arbeitsauftrag vs. Inspektion (planningKind) --------------------------------------------
  test("planningKind separates one-time work orders from recurring inspections", async () => {
    const admin = await adminToken();
    const workOrder = { id: "wo1", parent: "room-1", type: "Reparatur", status: "Offen", prio: "Hoch", title: "Leck abdichten", due: "2026-10-01" };
    assert.equal((await batch(admin, { tickets: { upsert: [workOrder, recurring({ id: "insp1" })] } })).status, 200);
    let tickets = (await getState(admin)).tickets;
    assert.equal(tickets.find((t) => t.id === "wo1").planningKind, "work_order", "default without interval");
    assert.equal(tickets.find((t) => t.id === "insp1").planningKind, "inspection", "an interval makes it an inspection");

    assert.equal((await batch(admin, { tickets: { upsert: [recurring({ id: "bad", planningKind: "work_order" })] } })).status, 400, "explicit work order with interval");
    assert.equal((await batch(admin, { tickets: { upsert: [{ ...workOrder, id: "bad2", planningKind: "maintenance" }] } })).status, 400, "unknown kind");
    const insp = tickets.find((t) => t.id === "insp1");
    assert.equal((await batch(admin, { tickets: { upsert: [{ ...insp, planningKind: "work_order" }] } })).status, 400, "cannot turn an inspection with interval into a work order");
    assert.equal((await getState(admin)).tickets.length, 2);

    // Explicit inspection without an interval is allowed (e.g. a single control); work orders stay one-time.
    assert.equal((await batch(admin, { tickets: { upsert: [{ ...workOrder, id: "ctl1", title: "Einmalige Kontrolle Druck", planningKind: "inspection" }] } })).status, 200);
    assert.equal((await getState(admin)).tickets.find((t) => t.id === "ctl1").planningKind, "inspection");
  });

  test("older clients keep planningKind and the next control stays an inspection", async () => {
    const admin = await adminToken();
    assert.equal((await batch(admin, { tickets: { upsert: [recurring({ planningKind: "inspection" })] } })).status, 200);
    const [saved] = (await getState(admin)).tickets;
    const { planningKind: _k, ...oldClient } = saved;
    assert.equal((await batch(admin, { tickets: { upsert: [{ ...oldClient, recurrence: null }] } })).status, 200);
    assert.equal((await getState(admin)).tickets[0].planningKind, "inspection", "kept when the field is missing");

    const { planningKind: _k2, ...again } = (await getState(admin)).tickets[0];
    assert.equal((await batch(admin, { tickets: { upsert: [{ ...again, recurrence: recurring().recurrence, status: "Erledigt" }] } })).status, 200);
    const next = (await getState(admin)).tickets.find((t) => t.previousTicketId === "rt1");
    assert.equal(next.planningKind, "inspection");
  });
});
