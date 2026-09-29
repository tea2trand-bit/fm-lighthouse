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

  test("logout clears the session cookie", async () => {
    const res = await call("POST", { body: { action: "logout" } });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("set-cookie") || "", /^fm360_session=;.*Max-Age=0/);
  });
});
