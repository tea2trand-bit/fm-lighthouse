import type { Config } from "@netlify/functions";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import {
  fm360Documents,
  fm360FloorRecords,
  fm360RoomRecords,
  fm360Nodes,
  fm360Templates,
  fm360Tickets,
  fm360Photos,
  fm360Employees,
  fm360Shifts,
  fm360Piket,
  fm360Brandschutz,
  fm360Security,
  fm360EmergencyContacts,
  fm360Projects,
  fm360Costs,
  fm360Roles,
  fm360Permissions,
  fm360RolePermissions,
  fm360EmployeeRoles,
  fm360TaskAssignments,
  fm360VacationEntries,
  fm360Notifications,
  fm360LoginAttempts
} from "../../db/schema.js";
import { getStore } from "@netlify/blobs";
import { hashPassword, needsRehash, verifyPassword } from "../../server/password.js";

type Db = ReturnType<typeof getDb>;
type DbClient = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

type Collection = "nodes" | "docs" | "floorRecords" | "roomRecords" | "tickets" | "templates" | "photos" | "employees" | "shifts" | "piket" | "brandschutz" | "security" | "emergencyContacts" | "projects" | "costs" | "roles" | "permissions" | "rolePermissions" | "employeeRoles" | "taskAssignments" | "vacationEntries" | "notifications";

const SEED_NODES = [
  // Level 1 Standorte
  { id: "haslen-standort", parent: null, type: "Standort", name: "Haslen", code: "HAS", notes: "", objectCode: "", anlage: null },
  { id: "lager-extern-standort", parent: null, type: "Standort", name: "Lager extern / drugo skladište", code: "LAG-EXT", notes: "", objectCode: "", anlage: null },
  { id: "parkhaus-standort", parent: null, type: "Standort", name: "Parkhaus / Garage", code: "PRK-GAR", notes: "", objectCode: "", anlage: null },

  // Level 2 Gebäude under Haslen
  { id: "neubau-gebaeude", parent: "haslen-standort", type: "Objekt / Gebäude", name: "Neubau", code: "NEU", notes: "", objectCode: "", anlage: null },
  { id: "altbau-gebaeude", parent: "haslen-standort", type: "Objekt / Gebäude", name: "Altbau", code: "ALT", notes: "", objectCode: "", anlage: null },
  { id: "parkgarage-gebaeude", parent: "haslen-standort", type: "Objekt / Gebäude", name: "Parkgarage", code: "PG", notes: "", objectCode: "", anlage: null },
  { id: "aussenbereich-gebaeude", parent: "haslen-standort", type: "Objekt / Gebäude", name: "Außenbereich", code: "AUSSEN", notes: "", objectCode: "", anlage: null },
  { id: "technikcontainer-gebaeude", parent: "haslen-standort", type: "Objekt / Gebäude", name: "Technikcontainer", code: "TECH", notes: "", objectCode: "", anlage: null },

  // Level 3 Etagen under Neubau
  { id: "neubau-ug", parent: "neubau-gebaeude", type: "Etage", name: "UG", code: "UG", notes: "", objectCode: "", anlage: null },
  { id: "neubau-eg", parent: "neubau-gebaeude", type: "Etage", name: "EG", code: "EG", notes: "", objectCode: "", anlage: null },
  { id: "neubau-1og", parent: "neubau-gebaeude", type: "Etage", name: "1. OG", code: "1OG", notes: "", objectCode: "", anlage: null },
  { id: "neubau-2og", parent: "neubau-gebaeude", type: "Etage", name: "2. OG", code: "2OG", notes: "", objectCode: "", anlage: null },
  { id: "neubau-dach", parent: "neubau-gebaeude", type: "Etage", name: "Dach / Technik", code: "DACH", notes: "", objectCode: "", anlage: null },

  // Level 3 Etagen under Altbau
  { id: "altbau-ug", parent: "altbau-gebaeude", type: "Etage", name: "UG", code: "UG", notes: "", objectCode: "", anlage: null },
  { id: "altbau-eg", parent: "altbau-gebaeude", type: "Etage", name: "EG", code: "EG", notes: "", objectCode: "", anlage: null },
  { id: "altbau-1og", parent: "altbau-gebaeude", type: "Etage", name: "1. OG", code: "1OG", notes: "", objectCode: "", anlage: null },

  // Level 3 Etagen under Parkgarage
  { id: "parkgarage-ug2", parent: "parkgarage-gebaeude", type: "Etage", name: "UG2", code: "UG2", notes: "", objectCode: "", anlage: null },
  { id: "parkgarage-ug1", parent: "parkgarage-gebaeude", type: "Etage", name: "UG1", code: "UG1", notes: "", objectCode: "", anlage: null },
  { id: "parkgarage-eg", parent: "parkgarage-gebaeude", type: "Etage", name: "EG", code: "EG", notes: "", objectCode: "", anlage: null },
  { id: "parkgarage-deck1", parent: "parkgarage-gebaeude", type: "Etage", name: "Deck 1", code: "DECK1", notes: "", objectCode: "", anlage: null },
  { id: "parkgarage-deck2", parent: "parkgarage-gebaeude", type: "Etage", name: "Deck 2", code: "DECK2", notes: "", objectCode: "", anlage: null },

  // Level 4 Raum / Bereich directly under Außenbereich (No Etage!)
  { id: "aussen-kompressorhaus", parent: "aussenbereich-gebaeude", type: "Raum / Bereich", name: "Kompressor Haus", code: "COMP-H", notes: "", objectCode: "", anlage: null },

  // Level 5 Anlage under Kompressor Haus (No Etage!)
  {
    id: "aussen-kompressor",
    parent: "aussen-kompressorhaus",
    type: "Anlage",
    name: "Außenkompressor",
    code: "AKOMP",
    notes: "",
    objectCode: "",
    anlage: { typ: "Kompressor", hersteller: "Kaeser", serial: "K-7712", lieferant: "Kaeser AG", standort: "Haslen → Außenbereich → Kompressor Haus", intervall: "halbjährlich", letzte: "2025-08-10", naechste: "2026-02-10", note: "Haupt-Außenkompressor" }
  },

  // Level 5 Anlage directly under Neubau (No Etage or Raum / Bereich!)
  {
    id: "neubau-dachlueftung",
    parent: "neubau-gebaeude",
    type: "Anlage",
    name: "Dach Lüftung",
    code: "DLUEFT",
    notes: "",
    objectCode: "",
    anlage: { typ: "Lüftung", hersteller: "Zehnder", serial: "Z-8891", lieferant: "Zehnder AG", standort: "Haslen → Neubau → Dach Lüftung", intervall: "jährlich", letzte: "2025-07-01", naechste: "2026-07-01", note: "Dachanlage Lüftung" }
  },

  // Level 4 Räume under Neubau UG
  { id: "neubau-ug-heizraum", parent: "neubau-ug", type: "Raum / Bereich", name: "Heizraum", code: "HEIZ", notes: "", objectCode: "", anlage: null },
  { id: "neubau-ug-elektroraum", parent: "neubau-ug", type: "Raum / Bereich", name: "Elektroraum", code: "ELEC", notes: "", objectCode: "", anlage: null },
  { id: "neubau-ug-lager", parent: "neubau-ug", type: "Raum / Bereich", name: "Lager", code: "LAG", notes: "", objectCode: "", anlage: null },
  { id: "neubau-ug-werkstatt", parent: "neubau-ug", type: "Raum / Bereich", name: "Werkstatt", code: "WERK", notes: "", objectCode: "", anlage: null },
  { id: "neubau-ug-warenlift", parent: "neubau-ug", type: "Raum / Bereich", name: "Warenlift Bereich", code: "LIFT", notes: "", objectCode: "", anlage: null },
  { id: "neubau-ug-lueftungsraum", parent: "neubau-ug", type: "Raum / Bereich", name: "Lüftungsraum", code: "LUEFT", notes: "", objectCode: "", anlage: null },

  // Level 5 Anlagen under Heizraum
  {
    id: "heizraum-kompressor1",
    parent: "neubau-ug-heizraum",
    type: "Anlage",
    name: "Kompressor 1",
    code: "KOMP-1",
    notes: "",
    objectCode: "",
    anlage: { typ: "Kompressor", hersteller: "Fust", serial: "12345", lieferant: "Fust AG", standort: "Haslen → Neubau → UG → Heizraum", intervall: "jährlich", letzte: "2025-06-01", naechste: "2026-06-01", note: "Standard-Kompressor" }
  },
  {
    id: "heizraum-pumpe3",
    parent: "neubau-ug-heizraum",
    type: "Anlage",
    name: "Pumpe 3",
    code: "PMP-3",
    notes: "",
    objectCode: "",
    anlage: { typ: "Pumpe", hersteller: "Grundfos", serial: "P99283", lieferant: "Grundfos AG", standort: "Haslen → Neubau → UG → Heizraum", intervall: "jährlich", letzte: "2025-05-15", naechste: "2026-05-15", note: "Heizungspumpe" }
  },
  {
    id: "heizraum-heizkreisverteiler",
    parent: "neubau-ug-heizraum",
    type: "Anlage",
    name: "Heizkreisverteiler",
    code: "HKV",
    notes: "",
    objectCode: "",
    anlage: { typ: "Verteiler", hersteller: "Meier", serial: "HKV-092", lieferant: "Meier Sanitär", standort: "Haslen → Neubau → UG → Heizraum", intervall: "jährlich", letzte: "2025-04-10", naechste: "2026-04-10", note: "Hauptverteiler UG" }
  },
  {
    id: "heizraum-lueftungseinheit",
    parent: "neubau-ug-heizraum",
    type: "Anlage",
    name: "Lüftungseinheit",
    code: "LUEFT-1",
    notes: "",
    objectCode: "",
    anlage: { typ: "Lüftung", hersteller: "Zehnder", serial: "Z-10023", lieferant: "Zehnder Group", standort: "Haslen → Neubau → UG → Heizraum", intervall: "halbjährlich", letzte: "2025-11-20", naechste: "2026-05-20", note: "Zuluft/Abluft" }
  },
  // Level 6 Baugruppen under Kompressor 1
  {
    id: "kompressor1-motor",
    parent: "heizraum-kompressor1",
    type: "Baugruppe",
    name: "Motor-Baugruppe",
    code: "MOT",
    notes: "Hauptantriebsmotor des Kompressors",
    objectCode: "",
    anlage: null
  },
  {
    id: "kompressor1-sensorik",
    parent: "heizraum-kompressor1",
    type: "Baugruppe",
    name: "Sensorik-Baugruppe",
    code: "SENS",
    notes: "Schnittstelle für Druck- und Temperaturfühler",
    objectCode: "",
    anlage: null
  },
  {
    id: "kompressor1-steuerung",
    parent: "heizraum-kompressor1",
    type: "Baugruppe",
    name: "Steuerung-Baugruppe",
    code: "CTRL",
    notes: "SPS-Steuerungsplatine und Bedienfeld",
    objectCode: "",
    anlage: null
  },
  {
    id: "kompressor1-ventilblock",
    parent: "heizraum-kompressor1",
    type: "Baugruppe",
    name: "Ventilblock",
    code: "VENT",
    notes: "Verteilerblock für Luftsteuerung",
    objectCode: "",
    anlage: null
  },

  // Level 7 Komponenten under Baugruppen
  {
    id: "motor-keilriemen",
    parent: "kompressor1-motor",
    type: "Komponente",
    name: "Keilriemen",
    code: "RIEM",
    notes: "Antriebskeilriemen standardisiert",
    objectCode: "",
    anlage: null
  },
  {
    id: "sensorik-druckfuehler",
    parent: "kompressor1-sensorik",
    type: "Komponente",
    name: "Druckfühler 10 Bar",
    code: "DF-10",
    notes: "Analoger Drucksensor für Betriebsdruck",
    objectCode: "",
    anlage: null
  }
];

const jsonHeaders = { "content-type": "application/json" };
const TOKEN_TTL_MS = 8 * 60 * 60 * 1000;
const LOGIN_SEEDS = [
  {
    id: "emp-roland",
    name: "Roland",
    loginName: "worker",
    password: "worker",
    role: "Field Technician",
    skills: "Mitarbeiter / Field Technician",
    availability: "Anwesend",
    piketEligible: false,
  },
  {
    id: "emp-admin",
    name: "Admin",
    loginName: "admin",
    password: "admin",
    role: "Admin / Chef",
    skills: "FM360 Administration",
    availability: "Anwesend",
    piketEligible: false,
  },
];

function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { ...jsonHeaders, ...(init.headers || {}) },
  });
}

function publicEmployee(employee: any) {
  const { createdAt: _createdAt, updatedAt: _updatedAt, passwordHash, password_hash, ...rest } = employee;
  return {
    ...rest,
    passwordSet: Boolean(passwordHash || password_hash),
  };
}

function authSecret(req: Request) {
  const env = ((globalThis as any).process?.env || {}) as Record<string, string | undefined>;
  const configured = String(env.FM360_AUTH_SECRET || "").trim();
  if (configured) return configured;

  const host = new URL(req.url).hostname;
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
    return "fm360-local-dev-secret";
  }
  return "";
}

function base64UrlEncode(value: string) {
  return btoa(unescape(encodeURIComponent(value))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return decodeURIComponent(escape(atob(padded)));
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

async function signTokenPayload(payload: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return bytesToBase64Url(new Uint8Array(signature));
}

async function createSessionToken(employee: any, secret: string) {
  const payload = base64UrlEncode(JSON.stringify({
    sub: String(employee.id || ""),
    loginName: String(employee.loginName || employee.login_name || ""),
    role: String(employee.role || ""),
    exp: Date.now() + TOKEN_TTL_MS,
  }));
  return `${payload}.${await signTokenPayload(payload, secret)}`;
}

const SESSION_COOKIE = "fm360_session";

// <img> and <a> requests for photos and documents cannot send an Authorization header, so the
// login also sets an HttpOnly cookie. The cookie is only accepted for those read-only file
// requests; everything that changes data still needs the Bearer header, which blocks CSRF.
function sessionCookie(token: string, maxAgeSeconds = TOKEN_TTL_MS / 1000) {
  return `${SESSION_COOKIE}=${token}; Path=/api/fm360; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

function bearerToken(req: Request) {
  const header = req.headers.get("authorization") || "";
  return header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
}

function cookieToken(req: Request) {
  for (const part of (req.headers.get("cookie") || "").split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === SESSION_COOKIE) return value.join("=");
  }
  return "";
}

// Returns the employee id of a valid, unexpired session token, or "" otherwise.
async function verifySessionToken(req: Request, { allowCookie = false } = {}) {
  const secret = authSecret(req);
  if (!secret) return "";

  const token = bearerToken(req) || (allowCookie ? cookieToken(req) : "");
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return "";

  const expected = await signTokenPayload(payload, secret);
  if (!constantTimeEqual(signature, expected)) return "";

  try {
    const parsed = JSON.parse(base64UrlDecode(payload));
    return parsed?.sub && Number(parsed.exp) > Date.now() ? String(parsed.sub) : "";
  } catch {
    return "";
  }
}

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

type Actor = { id: string; role: string; isAdmin: boolean; isInternal: boolean };

const ADMIN_ROLE_PATTERN = /admin|chef/i;

function isAdminEmployee(employee: { id: string; role: string | null }) {
  return employee.id === "emp-admin" || ADMIN_ROLE_PATTERN.test(String(employee.role || ""));
}

// The employee is loaded on every request, so a changed role or a disabled login takes effect
// immediately instead of when the token expires.
async function authenticate(req: Request, options: { allowCookie?: boolean } = {}): Promise<Actor> {
  const employeeId = await verifySessionToken(req, options);
  if (!employeeId) throw new HttpError(401, "Unauthorized");
  const [employee] = await getDb()
    .select({ id: fm360Employees.id, role: fm360Employees.role, loginEnabled: fm360Employees.loginEnabled })
    .from(fm360Employees)
    .where(eq(fm360Employees.id, employeeId))
    .limit(1);
  if (!employee?.loginEnabled) throw new HttpError(401, "Unauthorized");
  const isAdmin = isAdminEmployee(employee);
  return { id: employee.id, role: employee.role, isAdmin, isInternal: isAdmin || /fm internal/i.test(employee.role) };
}

// Who may change what:
// - Admin / Chef: everything.
// - FM Internal: everything except user administration (logins, passwords, roles, permissions).
// - Everyone else (Field Technician, External, Piket Only): what the field app needs, i.e. create
//   and update tickets, photos, task assignments and notifications, but not delete anything.
const ADMIN_ONLY_COLLECTIONS = new Set<Collection>(["roles", "permissions", "rolePermissions", "employeeRoles"]);
const FIELD_COLLECTIONS = new Set<Collection>(["tickets", "photos", "notifications", "taskAssignments"]);

function canWrite(actor: Actor, collection: Collection, operation: "upsert" | "delete") {
  if (actor.isAdmin) return true;
  if (ADMIN_ONLY_COLLECTIONS.has(collection)) return false;
  if (collection === "employees") return actor.isInternal && operation === "upsert";
  if (actor.isInternal) return true;
  return operation === "upsert" && FIELD_COLLECTIONS.has(collection);
}

function requireAdmin(actor: Actor) {
  if (!actor.isAdmin) throw new HttpError(403, "Keine Berechtigung für diese Aktion.");
}

async function findEmployeeForLoginSeed(seed: (typeof LOGIN_SEEDS)[number]) {
  const db = getDb();
  const [existingByLogin] = await db.select().from(fm360Employees).where(eq(fm360Employees.loginName, seed.loginName)).limit(1);
  if (existingByLogin) return existingByLogin;

  const [existingById] = await db.select().from(fm360Employees).where(eq(fm360Employees.id, seed.id)).limit(1);
  if (existingById) return existingById;

  const [existingByName] = await db.select().from(fm360Employees).where(sql`lower(trim(${fm360Employees.name})) = lower(${seed.name})`).orderBy(fm360Employees.createdAt).limit(1);
  return existingByName || null;
}

// Bootstrap only: creates or repairs the default logins while nobody can log in at all, so a fresh
// database is usable. Once any account has a working login, renamed, disabled or deleted default
// accounts stay that way and their passwords are never reset.
async function ensureLoginEmployees() {
  const db = getDb();
  const [workingLogin] = await db
    .select({ id: fm360Employees.id })
    .from(fm360Employees)
    .where(sql`${fm360Employees.loginEnabled} and ${fm360Employees.loginName} <> '' and ${fm360Employees.passwordHash} <> ''`)
    .limit(1);
  if (workingLogin) return;

  for (const seed of LOGIN_SEEDS) {
    const existing = await findEmployeeForLoginSeed(seed);
    const passwordHash = existing?.passwordHash || await hashPassword(seed.password);
    await db
      .insert(fm360Employees)
      .values({
        id: existing?.id || seed.id,
        name: existing?.name || seed.name,
        email: existing?.email || "",
        loginName: seed.loginName,
        loginEnabled: true,
        passwordHash,
        role: existing?.role || seed.role,
        skills: existing?.skills || seed.skills,
        availability: existing?.availability || seed.availability,
        piketEligible: existing?.piketEligible || seed.piketEligible,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: fm360Employees.id,
        set: {
          loginName: seed.loginName,
          loginEnabled: true,
          passwordHash,
          role: existing?.role || seed.role,
          skills: existing?.skills || seed.skills,
          availability: existing?.availability || seed.availability,
          updatedAt: new Date(),
        },
      });
  }
}

const LOGIN_ATTEMPT_LIMITS = { user: 10, ip: 50 };

function loginAttemptKeys(req: Request, loginName: string) {
  const ip = req.headers.get("x-nf-client-connection-ip") || (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  const keys = [{ key: `user:${loginName.trim().toLowerCase()}`, limit: LOGIN_ATTEMPT_LIMITS.user }];
  if (ip) keys.push({ key: `ip:${ip}`, limit: LOGIN_ATTEMPT_LIMITS.ip });
  return keys;
}

// Failed logins are counted per login name and per client IP in a 15 minute window. Errors are only
// logged: a problem with this table must never stop people from logging in.
async function isLoginRateLimited(keys: { key: string; limit: number }[]) {
  try {
    for (const { key, limit } of keys) {
      const [blocked] = await getDb()
        .select({ key: fm360LoginAttempts.key })
        .from(fm360LoginAttempts)
        .where(sql`${fm360LoginAttempts.key} = ${key} and ${fm360LoginAttempts.failures} >= ${limit}
          and ${fm360LoginAttempts.windowStart} > now() - interval '15 minutes'`)
        .limit(1);
      if (blocked) return true;
    }
  } catch (err) {
    console.error("Failed to check login attempts:", err);
  }
  return false;
}

async function recordLoginFailure(keys: { key: string }[]) {
  try {
    const inWindow = sql`${fm360LoginAttempts.windowStart} > now() - interval '15 minutes'`;
    for (const { key } of keys) {
      await getDb()
        .insert(fm360LoginAttempts)
        .values({ key, failures: 1, windowStart: sql`now()` })
        .onConflictDoUpdate({
          target: fm360LoginAttempts.key,
          set: {
            failures: sql`case when ${inWindow} then ${fm360LoginAttempts.failures} + 1 else 1 end`,
            windowStart: sql`case when ${inWindow} then ${fm360LoginAttempts.windowStart} else now() end`,
          },
        });
    }
  } catch (err) {
    console.error("Failed to record login attempt:", err);
  }
}

async function clearLoginFailures(key: string) {
  try {
    await getDb().delete(fm360LoginAttempts).where(eq(fm360LoginAttempts.key, key));
  } catch (err) {
    console.error("Failed to clear login attempts:", err);
  }
}

async function loginEmployee(loginName: string, password: string) {
  await ensureLoginEmployees();
  const db = getDb();
  const [employee] = await db.select().from(fm360Employees).where(eq(fm360Employees.loginName, loginName.trim())).limit(1);
  if (!employee?.loginEnabled || !employee.passwordHash) return null;
  if (!(await verifyPassword(password, employee.passwordHash))) return null;
  if (needsRehash(employee.passwordHash)) {
    const passwordHash = await hashPassword(password);
    await db.update(fm360Employees).set({ passwordHash, updatedAt: new Date() }).where(eq(fm360Employees.id, employee.id));
    return publicEmployee({ ...employee, passwordHash });
  }
  return publicEmployee(employee);
}

async function readState() {
  await ensureLoginEmployees();
  const db = getDb();
  let nodes = await db.select().from(fm360Nodes).orderBy(fm360Nodes.sortOrder, fm360Nodes.createdAt);

  const docs = await db.select().from(fm360Documents).orderBy(fm360Documents.createdAt);
  const floorRecords = await db.select().from(fm360FloorRecords).orderBy(fm360FloorRecords.createdAt);
  const roomRecords = await db.select().from(fm360RoomRecords).orderBy(fm360RoomRecords.createdAt);
  const tickets = await db.select().from(fm360Tickets).orderBy(fm360Tickets.createdAt);
  const templates = await db.select().from(fm360Templates).orderBy(fm360Templates.createdAt);
  const photos = await db.select().from(fm360Photos).orderBy(fm360Photos.createdAt);

  const employees = await db.select().from(fm360Employees).orderBy(fm360Employees.createdAt);
  const shifts = await db.select().from(fm360Shifts).orderBy(fm360Shifts.createdAt);
  const piket = await db.select().from(fm360Piket).orderBy(fm360Piket.createdAt);
  const brandschutz = await db.select().from(fm360Brandschutz).orderBy(fm360Brandschutz.createdAt);
  const security = await db.select().from(fm360Security).orderBy(fm360Security.createdAt);
  const emergencyContacts = await db.select().from(fm360EmergencyContacts).orderBy(fm360EmergencyContacts.createdAt);
  const projects = await db.select().from(fm360Projects).orderBy(fm360Projects.createdAt);
  const costs = await db.select().from(fm360Costs).orderBy(fm360Costs.createdAt);
  const roles = await db.select().from(fm360Roles).orderBy(fm360Roles.createdAt);
  const permissions = await db.select().from(fm360Permissions).orderBy(fm360Permissions.module, fm360Permissions.action);
  const rolePermissions = await db.select().from(fm360RolePermissions).orderBy(fm360RolePermissions.createdAt);
  const employeeRoles = await db.select().from(fm360EmployeeRoles).orderBy(fm360EmployeeRoles.createdAt);
  const taskAssignments = await db.select().from(fm360TaskAssignments).orderBy(fm360TaskAssignments.createdAt);
  const vacationEntries = await db.select().from(fm360VacationEntries).orderBy(fm360VacationEntries.startDate);
  const notifications = await db.select().from(fm360Notifications).orderBy(fm360Notifications.createdAt);

  return {
    nodes: nodes.map(({ createdAt: _createdAt, updatedAt: _updatedAt, ...node }) => node),
    docs: docs.map(({ createdAt: _createdAt, updatedAt: _updatedAt, ...doc }) => doc),
    floorRecords: floorRecords.map(({ createdAt: _createdAt, updatedAt: _updatedAt, ...record }) => record),
    roomRecords: roomRecords.map(({ createdAt: _createdAt, updatedAt: _updatedAt, ...record }) => record),
    tickets: tickets.map(({ createdAt: _createdAt, updatedAt: _updatedAt, ...ticket }) => ticket),
    templates: templates.map(({ createdAt: _createdAt, updatedAt: _updatedAt, ...template }) => template),
    photos: photos.map(({ createdAt: _createdAt, updatedAt: _updatedAt, ...photo }) => photo),
    employees: employees.map(publicEmployee),
    shifts: shifts.map(({ createdAt: _createdAt, updatedAt: _updatedAt, ...shift }) => shift),
    piket: piket.map(({ createdAt: _createdAt, updatedAt: _updatedAt, ...p }) => p),
    brandschutz: brandschutz.map(({ createdAt: _createdAt, updatedAt: _updatedAt, ...b }) => b),
    security: security.map(({ createdAt: _createdAt, updatedAt: _updatedAt, ...s }) => s),
    emergencyContacts: emergencyContacts.map(({ createdAt: _createdAt, updatedAt: _updatedAt, ...c }) => c),
    projects: projects.map(({ createdAt: _createdAt, updatedAt: _updatedAt, ...p }) => p),
    costs: costs.map(({ createdAt: _createdAt, updatedAt: _updatedAt, ...c }) => c),
    roles: roles.map(({ createdAt: _createdAt, updatedAt: _updatedAt, ...role }) => role),
    permissions: permissions.map(({ createdAt: _createdAt, updatedAt: _updatedAt, ...permission }) => permission),
    rolePermissions: rolePermissions.map(({ createdAt: _createdAt, ...rolePermission }) => rolePermission),
    employeeRoles: employeeRoles.map(({ createdAt: _createdAt, ...employeeRole }) => employeeRole),
    taskAssignments: taskAssignments.map(({ createdAt: _createdAt, updatedAt: _updatedAt, ...assignment }) => assignment),
    vacationEntries: vacationEntries.map(({ createdAt: _createdAt, updatedAt: _updatedAt, ...entry }) => entry),
    notifications: notifications.map(({ createdAt: _createdAt, ...notification }) => notification),
  };
}

async function readTicketDebugState() {
  const db = getDb();
  const tickets = await db
    .select({
      id: fm360Tickets.id,
      parent: fm360Tickets.parent,
      type: fm360Tickets.type,
      title: fm360Tickets.title,
      created: fm360Tickets.created,
      createdAt: fm360Tickets.createdAt,
      updatedAt: fm360Tickets.updatedAt,
    })
    .from(fm360Tickets)
    .orderBy(fm360Tickets.createdAt);

  return {
    ticketCount: tickets.length,
    ticketIds: tickets.map((ticket) => ticket.id),
    tickets: tickets.map((ticket) => ({
      ...ticket,
      createdAt: ticket.createdAt?.toISOString?.() || String(ticket.createdAt || ""),
      updatedAt: ticket.updatedAt?.toISOString?.() || String(ticket.updatedAt || ""),
    })),
  };
}

function normalizeSegment(value: unknown, fallback = "OBJ") {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/Ä/g, "AE")
    .replace(/Ö/g, "OE")
    .replace(/Ü/g, "UE")
    .replace(/ß/g, "SS")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return normalized || fallback;
}

function buildingPrefix(name: unknown) {
  const segment = normalizeSegment(name, "BLD");
  if (segment.startsWith("ALT")) return "ALT";
  if (segment.startsWith("NEU")) return "NEU";
  if (segment.startsWith("LAG")) return "LAG";
  return segment.slice(0, 3).padEnd(3, "X");
}

function levelCode(node: any) {
  const raw = normalizeSegment(node?.code || node?.name, "LVL");
  if (raw.includes("UG")) return "UG";
  if (raw.includes("EG")) return "EG";
  const og = raw.match(/(\d+)OG|OG(\d+)|^(\d+)$/);
  if (og) return `${og[1] || og[2] || og[3]}OG`;
  return raw.slice(0, 4);
}

function assetPrefix(item: any) {
  const raw = normalizeSegment(item?.code || item?.name, "ASSET");
  if (raw.includes("WARENLIFT") || raw.includes("WL")) return "WL";
  if (raw.includes("ROLLTOR") || raw.includes("TOR")) return "RT";
  if (raw.includes("FOERDERBAND") || raw.includes("FORDERBAND")) return "FB";
  if (raw.includes("KOMPRESSOR")) return "KOMP";
  if (raw.includes("PUMPE")) return "PMP";
  return raw.slice(0, 4);
}

function enrichObjectCodes(items: any[]) {
  const map = new Map(items.map((item) => [String(item.id), item]));
  const used = new Set(items.map((item) => String(item.objectCode || "").trim()).filter(Boolean));

  function ancestors(item: any) {
    const result = [];
    let current = item;
    const seen = new Set();
    while (current?.parent && !seen.has(current.parent)) {
      seen.add(current.parent);
      current = map.get(String(current.parent));
      if (current) result.unshift(current);
    }
    return result;
  }

  for (const item of items) {
    if (item.autoObjectCode === false || String(item.objectCode || "").trim()) continue;
    const chain = [...ancestors(item), item];
    const building = [...chain].reverse().find((entry) => entry.type === "Gebäude" || entry.type === "Objekt / Gebäude");
    const level = [...chain].reverse().find((entry) => entry.type === "Etage");
    if (!building) continue;

    let base = `${buildingPrefix(building.code || building.name)}`;
    if (item.type === "Anlage" || item.type === "Installations-Datenbank (Elektro)" || item.type === "Installations-Datenbank (Sanitär)") {
      if (level) {
        base += `-${levelCode(level)}`;
      } else {
        const room = [...chain].reverse().find((entry) => entry.type === "Raum / Bereich" || entry.type === "Raum");
        if (room) {
          base += `-${levelCode(room)}`;
        }
      }
      base += `-${assetPrefix(item)}`;
    } else if (item.type === "Baugruppe") {
      const anlage = [...chain].reverse().find((entry) => entry.type === "Anlage" || entry.type === "Installations-Datenbank (Elektro)" || entry.type === "Installations-Datenbank (Sanitär)");
      if (anlage) {
        const parentCode = anlage.objectCode || `${buildingPrefix(building.code || building.name)}-${assetPrefix(anlage)}`;
        base = `${parentCode}-${assetPrefix(item)}`;
      } else {
        base += `-${assetPrefix(item)}`;
      }
    } else if (item.type === "Komponente") {
      const baugruppe = [...chain].reverse().find((entry) => entry.type === "Baugruppe");
      if (baugruppe) {
        const parentCode = baugruppe.objectCode || `${buildingPrefix(building.code || building.name)}-${assetPrefix(baugruppe)}`;
        base = `${parentCode}-${assetPrefix(item)}`;
      } else {
        base += `-${assetPrefix(item)}`;
      }
    } else if (item.type === "Etage") {
      base += `-${levelCode(item)}`;
    } else if (item.type === "Raum / Bereich" || item.type === "Raum") {
      if (level) {
        base += `-${levelCode(level)}`;
      } else {
        base += `-${levelCode(item)}`;
      }
    } else {
      if (level) base += `-${levelCode(level)}`;
    }

    let next = 1;
    let candidate = `${base}-${String(next).padStart(2, "0")}`;
    while (used.has(candidate)) {
      next += 1;
      candidate = `${base}-${String(next).padStart(2, "0")}`;
    }
    item.objectCode = candidate;
    used.add(candidate);
  }

  return items;
}

async function upsertNode(item: any, db: DbClient = getDb()) {
  const values = {
    id: String(item.id),
    parent: item.parent || null,
    type: String(item.type || "Eintrag"),
    name: String(item.name || ""),
    code: String(item.code || ""),
    objectCode: String(item.objectCode || ""),
    notes: String(item.notes || ""),
    anlage: item.anlage || null,
    sortOrder: Number.isFinite(item.sortOrder) ? item.sortOrder : 0,
    updatedAt: new Date(),
  };

  const [row] = await db
    .insert(fm360Nodes)
    .values(values)
    .onConflictDoUpdate({
      target: fm360Nodes.id,
      set: {
        parent: values.parent,
        type: values.type,
        name: values.name,
        code: values.code,
        objectCode: values.objectCode,
        notes: values.notes,
        anlage: values.anlage,
        sortOrder: values.sortOrder,
        updatedAt: values.updatedAt,
      },
    })
    .returning();
  return row;
}

async function reorderSiblingNodes(parentId: string | null, orderedIds: string[]) {
  const uniqueIds = [...new Set(orderedIds.map((id) => String(id)))];
  if (!uniqueIds.length || uniqueIds.length !== orderedIds.length) {
    throw new Error("Invalid reorder payload");
  }

  const db = getDb();
  const allNodes = await db.select().from(fm360Nodes).orderBy(fm360Nodes.sortOrder, fm360Nodes.createdAt);
  const siblings = allNodes.filter((node) => (node.parent || "") === (parentId || ""));
  if (siblings.length !== uniqueIds.length) {
    throw new Error("Reorder must include exactly one sibling level");
  }

  const siblingIds = new Set(siblings.map((node) => node.id));
  if (!uniqueIds.every((id) => siblingIds.has(id))) {
    throw new Error("Reorder cannot move nodes between parents");
  }

  const updatedAt = new Date();
  for (const [index, id] of uniqueIds.entries()) {
    await db.update(fm360Nodes).set({ sortOrder: index, updatedAt }).where(eq(fm360Nodes.id, id));
  }
}

async function upsertDocument(item: any, db: DbClient = getDb()) {
  const values = {
    id: String(item.id),
    parent: String(item.parent || ""),
    type: String(item.type || "Sonstiges"),
    title: String(item.title || ""),
    folder: String(item.folder || ""),
    tags: String(item.tags || ""),
    note: String(item.note || ""),
    blobKey: item.blobKey ? String(item.blobKey) : null,
    contentType: String(item.contentType || "application/octet-stream"),
    fileName: String(item.fileName || ""),
    updatedAt: new Date(),
  };

  const [row] = await db
    .insert(fm360Documents)
    .values(values)
    .onConflictDoUpdate({
      target: fm360Documents.id,
      set: { ...values },
    })
    .returning();
  return row;
}

async function upsertFloorRecord(item: any, db: DbClient = getDb()) {
  const data = item.data && typeof item.data === "object" && !Array.isArray(item.data) ? item.data : {};
  const values = {
    id: String(item.id),
    floorId: String(item.floorId || item.floor_id || item.parent || ""),
    section: String(item.section || ""),
    title: String(item.title || ""),
    status: String(item.status || ""),
    note: String(item.note || ""),
    data,
    updatedAt: new Date(),
  };

  const [row] = await db
    .insert(fm360FloorRecords)
    .values(values)
    .onConflictDoUpdate({
      target: fm360FloorRecords.id,
      set: { ...values },
    })
    .returning();
  return row;
}

async function upsertRoomRecord(item: any, db: DbClient = getDb()) {
  const data = item.data && typeof item.data === "object" && !Array.isArray(item.data) ? item.data : {};
  const values = {
    id: String(item.id),
    roomId: String(item.roomId || item.room_id || item.parent || ""),
    section: String(item.section || ""),
    title: String(item.title || ""),
    status: String(item.status || ""),
    note: String(item.note || ""),
    data,
    updatedAt: new Date(),
  };

  const [row] = await db
    .insert(fm360RoomRecords)
    .values(values)
    .onConflictDoUpdate({
      target: fm360RoomRecords.id,
      set: { ...values },
    })
    .returning();
  return row;
}

function ticketUnchanged(existing: Record<string, unknown>, values: Record<string, unknown>) {
  return Object.entries(values).every(([key, value]) => {
    if (key === "updatedAt") return true;
    const current = existing[key];
    if (value instanceof Date || current instanceof Date) {
      return (value ? new Date(value as Date).getTime() : null) === (current ? new Date(current as Date).getTime() : null);
    }
    return (current ?? null) === (value ?? null);
  });
}

async function upsertTicket(item: any, db: DbClient = getDb()) {
  const values = {
    id: String(item.id),
    parent: String(item.parent || ""),
    type: String(item.type || "Ticket"),
    status: String(item.status || "Offen"),
    prio: String(item.prio || "Mittel"),
    title: String(item.title || ""),
    resp: String(item.resp || ""),
    due: String(item.due || ""),
    text: String(item.text || ""),
    executionBy: String(item.executionBy || item.execution_by || ""),
    costChf: String(item.costChf || item.cost_chf || ""),
    invoiceReceived: String(item.invoiceReceived || item.invoice_received || ""),
    deliveryNoteReceived: String(item.deliveryNoteReceived || item.delivery_note_received || ""),
    created: String(item.created || ""),
    assignedEmployeeId: item.assignedEmployeeId || item.assigned_employee_id || null,
    assignedByEmployeeId: item.assignedByEmployeeId || item.assigned_by_employee_id || null,
    assignedAt: item.assignedAt || item.assigned_at ? new Date(item.assignedAt || item.assigned_at) : null,
    updatedAt: new Date(),
  };

  const [existingById] = await db.select().from(fm360Tickets).where(eq(fm360Tickets.id, values.id)).limit(1);
  // Saving an unchanged ticket must not touch it, otherwise every save would notify the assignee.
  if (existingById && ticketUnchanged(existingById, values)) return existingById;
  if (!existingById) {
    const [existingDuplicate] = await db
      .select()
      .from(fm360Tickets)
      .where(sql`
        ${fm360Tickets.parent} = ${values.parent}
        and ${fm360Tickets.type} = ${values.type}
        and ${fm360Tickets.title} = ${values.title}
        and ${fm360Tickets.created} = ${values.created}
        and ${fm360Tickets.text} = ${values.text}
        and ${fm360Tickets.status} = ${values.status}
        and ${fm360Tickets.prio} = ${values.prio}
      `)
      .limit(1);
    if (existingDuplicate) return existingDuplicate;
  }

  const [row] = await db
    .insert(fm360Tickets)
    .values(values)
    .onConflictDoUpdate({
      target: fm360Tickets.id,
      set: { ...values },
    })
    .returning();
  if (values.assignedEmployeeId && !existingById?.assignedEmployeeId) {
    await upsertNotification({
      id: `notif-ticket-assigned-${values.id}-${values.assignedEmployeeId}`,
      employeeId: values.assignedEmployeeId,
      ticketId: values.id,
      eventType: "ticket_assigned",
      title: values.title || "Ticket zugewiesen",
      body: values.prio ? `Priorität: ${values.prio}` : "",
    }, db);
  } else if (values.assignedEmployeeId && existingById && existingById.prio !== values.prio) {
    await upsertNotification({
      id: `notif-priority-${values.id}-${values.assignedEmployeeId}-${Date.now()}`,
      employeeId: values.assignedEmployeeId,
      ticketId: values.id,
      eventType: "priority_changed",
      title: values.title || "Priorität geändert",
      body: `Neue Priorität: ${values.prio}`,
    }, db);
  } else if (values.assignedEmployeeId && existingById) {
    await upsertNotification({
      id: `notif-task-updated-${values.id}-${values.assignedEmployeeId}-${Date.now()}`,
      employeeId: values.assignedEmployeeId,
      ticketId: values.id,
      eventType: "task_updated",
      title: values.title || "Aufgabe aktualisiert",
      body: values.status ? `Status: ${values.status}` : "",
    }, db);
  }
  return row;
}

async function upsertTemplate(item: any, db: DbClient = getDb()) {
  const values = {
    id: String(item.id),
    type: String(item.type || "FM-Vorlage"),
    name: String(item.name || ""),
    text: String(item.text || ""),
    updatedAt: new Date(),
  };

  const [row] = await db
    .insert(fm360Templates)
    .values(values)
    .onConflictDoUpdate({
      target: fm360Templates.id,
      set: { ...values },
    })
    .returning();
  return row;
}

async function upsertPhoto(item: any, db: DbClient = getDb()) {
  const values = {
    id: String(item.id),
    parent: String(item.parent || ""),
    description: String(item.description || ""),
    blobKey: String(item.blobKey || ""),
    contentType: String(item.contentType || "image/jpeg"),
    ticketId: item.ticketId ? String(item.ticketId) : null,
    updatedAt: new Date(),
  };

  const [row] = await db
    .insert(fm360Photos)
    .values(values)
    .onConflictDoUpdate({
      target: fm360Photos.id,
      set: { ...values },
    })
    .returning();
  return row;
}

// previousPasswordHash lets replaceAll keep a password across its delete-and-reinsert cycle.
// Hashes sent by the client are ignored: a password can only be set as plain text and is hashed here.
async function upsertEmployee(item: any, db: DbClient = getDb(), previousPasswordHash = "") {
  const [existing] = item.id ? await db.select().from(fm360Employees).where(eq(fm360Employees.id, String(item.id))).limit(1) : [];
  const rawPassword = String(item.password || item.newPassword || "");
  const passwordHash = rawPassword
    ? await hashPassword(rawPassword)
    : String(existing?.passwordHash || previousPasswordHash || "");
  const values = {
    id: String(item.id),
    name: String(item.name || ""),
    email: String(item.email || ""),
    loginName: String(item.loginName || item.login_name || ""),
    loginEnabled: Boolean(item.loginEnabled || item.login_enabled),
    passwordHash,
    role: String(item.role || ""),
    skills: String(item.skills || ""),
    availability: String(item.availability || "Verfügbar"),
    piketEligible: Boolean(item.piketEligible),
    updatedAt: new Date(),
  };

  const [row] = await db
    .insert(fm360Employees)
    .values(values)
    .onConflictDoUpdate({
      target: fm360Employees.id,
      set: { ...values },
    })
    .returning();
  return row;
}

async function upsertShift(item: any, db: DbClient = getDb()) {
  const values = {
    id: String(item.id),
    employeeId: String(item.employeeId || ""),
    managedByEmployeeId: item.managedByEmployeeId || item.managed_by_employee_id || null,
    date: String(item.date || ""),
    shiftType: String(item.shiftType || ""),
    taskAssignment: String(item.taskAssignment || ""),
    workload: String(item.workload || "Normal"),
    updatedAt: new Date(),
  };

  const [row] = await db
    .insert(fm360Shifts)
    .values(values)
    .onConflictDoUpdate({
      target: fm360Shifts.id,
      set: { ...values },
    })
    .returning();
  return row;
}

async function upsertPiket(item: any, db: DbClient = getDb()) {
  const values = {
    id: String(item.id),
    employeeId: item.employeeId || item.employee_id || null,
    managedByEmployeeId: item.managedByEmployeeId || item.managed_by_employee_id || null,
    date: String(item.date || ""),
    employeeName: String(item.employeeName || ""),
    shiftTime: String(item.shiftTime || ""),
    contacts: String(item.contacts || ""),
    interventions: String(item.interventions || ""),
    responseTime: String(item.responseTime || ""),
    escalation: String(item.escalation || ""),
    status: String(item.status || "Geplant"),
    interventionDuration: String(item.interventionDuration || ""),
    interventionCause: String(item.interventionCause || ""),
    interventionMeasure: String(item.interventionMeasure || ""),
    interventionStatus: String(item.interventionStatus || "offen"),
    interventionTime: String(item.interventionTime || ""),
    interventionNotes: String(item.interventionNotes || ""),
    startDate: String(item.startDate || ""),
    endDate: String(item.endDate || ""),
    handoverFrom: String(item.handoverFrom || ""),
    interventionAlarmTime: String(item.interventionAlarmTime || ""),
    interventionEndTime: String(item.interventionEndTime || ""),
    updatedAt: new Date(),
  };

  const [row] = await db
    .insert(fm360Piket)
    .values(values)
    .onConflictDoUpdate({
      target: fm360Piket.id,
      set: { ...values },
    })
    .returning();
  return row;
}

async function upsertBrandschutz(item: any, db: DbClient = getDb()) {
  const values = {
    id: String(item.id),
    systemType: String(item.systemType || ""),
    name: String(item.name || ""),
    location: String(item.location || ""),
    inspectionInterval: String(item.inspectionInterval || ""),
    lastInspection: String(item.lastInspection || ""),
    nextInspection: String(item.nextInspection || ""),
    certificate: String(item.certificate || ""),
    defects: String(item.defects || ""),
    updatedAt: new Date(),
  };

  const [row] = await db
    .insert(fm360Brandschutz)
    .values(values)
    .onConflictDoUpdate({
      target: fm360Brandschutz.id,
      set: { ...values },
    })
    .returning();
  return row;
}

async function upsertSecurity(item: any, db: DbClient = getDb()) {
  const values = {
    id: String(item.id),
    systemType: String(item.systemType || ""),
    name: String(item.name || ""),
    location: String(item.location || ""),
    status: String(item.status || "Aktiv"),
    alarmHistory: String(item.alarmHistory || ""),
    incidents: String(item.incidents || ""),
    updatedAt: new Date(),
  };

  const [row] = await db
    .insert(fm360Security)
    .values(values)
    .onConflictDoUpdate({
      target: fm360Security.id,
      set: { ...values },
    })
    .returning();
  return row;
}

async function upsertEmergencyContact(item: any, db: DbClient = getDb()) {
  const values = {
    id: String(item.id),
    name: String(item.name || ""),
    phone: String(item.phone || ""),
    description: String(item.description || ""),
    category: String(item.category || "Externe Notfallkontakte"),
    updatedAt: new Date(),
  };

  const [row] = await db
    .insert(fm360EmergencyContacts)
    .values(values)
    .onConflictDoUpdate({
      target: fm360EmergencyContacts.id,
      set: { ...values },
    })
    .returning();
  return row;
}

async function upsertProject(item: any, db: DbClient = getDb()) {
  const data = item.data && typeof item.data === "object" && !Array.isArray(item.data) ? item.data : {};
  const values = {
    id: String(item.id),
    kind: String(item.kind || "project"),
    title: String(item.title || item.name || ""),
    category: String(item.category || ""),
    location: String(item.location || ""),
    responsible: String(item.responsible || ""),
    status: String(item.status || ""),
    data,
    updatedAt: new Date(),
  };

  const [row] = await db
    .insert(fm360Projects)
    .values(values)
    .onConflictDoUpdate({
      target: fm360Projects.id,
      set: { ...values },
    })
    .returning();
  return row;
}

async function upsertCost(item: any, db: DbClient = getDb()) {
  const category = String(item.category || "budget");
  if (!["budget", "adjustment"].includes(category)) {
    throw new Error("fm360_costs only accepts budget planning and manual adjustment records");
  }
  const data = item.data && typeof item.data === "object" && !Array.isArray(item.data) ? item.data : {};
  const values = {
    id: String(item.id),
    parent: String(item.parent || ""),
    category,
    title: String(item.title || ""),
    amountChf: String(item.amountChf || item.amount_chf || ""),
    status: String(item.status || (category === "adjustment" ? "Korrektur" : "Budget")),
    year: String(item.year || ""),
    source: String(item.source || (category === "adjustment" ? "Manuelle Korrektur" : "Budgetplanung")),
    note: String(item.note || ""),
    data,
    updatedAt: new Date(),
  };

  const [row] = await db
    .insert(fm360Costs)
    .values(values)
    .onConflictDoUpdate({
      target: fm360Costs.id,
      set: { ...values },
    })
    .returning();
  return row;
}

async function upsertRole(item: any, db: DbClient = getDb()) {
  const values = {
    id: String(item.id),
    name: String(item.name || ""),
    description: String(item.description || ""),
    updatedAt: new Date(),
  };
  const [row] = await db.insert(fm360Roles).values(values).onConflictDoUpdate({ target: fm360Roles.id, set: { ...values } }).returning();
  return row;
}

async function upsertPermission(item: any, db: DbClient = getDb()) {
  const values = {
    id: String(item.id),
    module: String(item.module || ""),
    action: String(item.action || ""),
    description: String(item.description || ""),
    updatedAt: new Date(),
  };
  const [row] = await db.insert(fm360Permissions).values(values).onConflictDoUpdate({ target: fm360Permissions.id, set: { ...values } }).returning();
  return row;
}

async function upsertRolePermission(item: any, db: DbClient = getDb()) {
  const values = {
    roleId: String(item.roleId || item.role_id || ""),
    permissionId: String(item.permissionId || item.permission_id || ""),
  };
  const [row] = await db.insert(fm360RolePermissions).values(values).onConflictDoNothing().returning();
  return row || values;
}

async function upsertEmployeeRole(item: any, db: DbClient = getDb()) {
  const values = {
    employeeId: String(item.employeeId || item.employee_id || ""),
    roleId: String(item.roleId || item.role_id || ""),
    assignedByEmployeeId: item.assignedByEmployeeId || item.assigned_by_employee_id || null,
  };
  const [row] = await db.insert(fm360EmployeeRoles).values(values).onConflictDoUpdate({
    target: [fm360EmployeeRoles.employeeId, fm360EmployeeRoles.roleId],
    set: { assignedByEmployeeId: values.assignedByEmployeeId },
  }).returning();
  return row;
}

async function upsertTaskAssignment(item: any, db: DbClient = getDb()) {
  const values = {
    id: String(item.id),
    ticketId: String(item.ticketId || item.ticket_id || ""),
    employeeId: String(item.employeeId || item.employee_id || ""),
    assignedByEmployeeId: item.assignedByEmployeeId || item.assigned_by_employee_id || null,
    status: String(item.status || "new"),
    dueDate: String(item.dueDate || item.due_date || ""),
    note: String(item.note || ""),
    assignedAt: item.assignedAt || item.assigned_at ? new Date(item.assignedAt || item.assigned_at) : new Date(),
    completedAt: item.completedAt || item.completed_at ? new Date(item.completedAt || item.completed_at) : null,
    updatedAt: new Date(),
  };
  const [existing] = await db.select().from(fm360TaskAssignments).where(eq(fm360TaskAssignments.id, values.id)).limit(1);
  const [row] = await db.insert(fm360TaskAssignments).values(values).onConflictDoUpdate({ target: fm360TaskAssignments.id, set: { ...values } }).returning();
  await upsertNotification({
    id: existing ? `notif-task-updated-${values.id}-${Date.now()}` : `notif-ticket-assigned-${values.id}`,
    employeeId: values.employeeId,
    ticketId: values.ticketId,
    taskAssignmentId: values.id,
    eventType: existing ? "task_updated" : "ticket_assigned",
    title: existing ? "Aufgabe aktualisiert" : "Ticket zugewiesen",
    body: values.note || values.dueDate || "",
  });
  return row;
}

async function upsertVacationEntry(item: any, db: DbClient = getDb()) {
  const values = {
    id: String(item.id),
    employeeId: String(item.employeeId || item.employee_id || ""),
    managedByEmployeeId: item.managedByEmployeeId || item.managed_by_employee_id || null,
    startDate: String(item.startDate || item.start_date || ""),
    endDate: String(item.endDate || item.end_date || ""),
    status: String(item.status || "requested"),
    type: String(item.type || "vacation"),
    note: String(item.note || ""),
    updatedAt: new Date(),
  };
  const [row] = await db.insert(fm360VacationEntries).values(values).onConflictDoUpdate({ target: fm360VacationEntries.id, set: { ...values } }).returning();
  return row;
}

async function upsertNotification(item: any, db: DbClient = getDb()) {
  const allowedEvents = new Set(["new_ticket", "ticket_assigned", "priority_changed", "task_updated"]);
  const eventType = String(item.eventType || item.event_type || "");
  if (!allowedEvents.has(eventType)) throw new Error("Unsupported notification event type");
  const values = {
    id: String(item.id),
    employeeId: String(item.employeeId || item.employee_id || ""),
    ticketId: item.ticketId || item.ticket_id || null,
    taskAssignmentId: item.taskAssignmentId || item.task_assignment_id || null,
    eventType,
    title: String(item.title || ""),
    body: String(item.body || ""),
    readAt: item.readAt || item.read_at ? new Date(item.readAt || item.read_at) : null,
  };
  const [row] = await db.insert(fm360Notifications).values(values).onConflictDoUpdate({ target: fm360Notifications.id, set: { ...values } }).returning();
  return row;
}

type BlobRef = { store: "fm360-photos" | "fm360-documents"; key: string };

const COLLECTION_TABLES = {
  nodes: fm360Nodes,
  docs: fm360Documents,
  floorRecords: fm360FloorRecords,
  roomRecords: fm360RoomRecords,
  tickets: fm360Tickets,
  templates: fm360Templates,
  photos: fm360Photos,
  employees: fm360Employees,
  shifts: fm360Shifts,
  piket: fm360Piket,
  brandschutz: fm360Brandschutz,
  security: fm360Security,
  emergencyContacts: fm360EmergencyContacts,
  projects: fm360Projects,
  costs: fm360Costs,
  roles: fm360Roles,
  permissions: fm360Permissions,
  taskAssignments: fm360TaskAssignments,
  vacationEntries: fm360VacationEntries,
  notifications: fm360Notifications,
} as const;

// Deletes one record and returns the file it referenced, which the caller removes from Netlify
// Blobs once the database change is committed.
async function removeRecord(collection: Collection, id: string, db: DbClient): Promise<BlobRef | null> {
  if (collection === "rolePermissions") {
    const [roleId, permissionId] = id.split(":");
    await db.delete(fm360RolePermissions).where(sql`${fm360RolePermissions.roleId} = ${roleId} and ${fm360RolePermissions.permissionId} = ${permissionId}`);
    return null;
  }
  if (collection === "employeeRoles") {
    const [employeeId, roleId] = id.split(":");
    await db.delete(fm360EmployeeRoles).where(sql`${fm360EmployeeRoles.employeeId} = ${employeeId} and ${fm360EmployeeRoles.roleId} = ${roleId}`);
    return null;
  }
  if (collection === "docs") {
    const [doc] = await db.delete(fm360Documents).where(eq(fm360Documents.id, id)).returning();
    return doc?.blobKey ? { store: "fm360-documents", key: doc.blobKey } : null;
  }
  if (collection === "photos") {
    const [photo] = await db.delete(fm360Photos).where(eq(fm360Photos.id, id)).returning();
    return photo?.blobKey ? { store: "fm360-photos", key: photo.blobKey } : null;
  }
  const table = COLLECTION_TABLES[collection];
  await db.delete(table).where(eq(table.id, id));
  return null;
}

async function deleteBlobs(refs: BlobRef[]) {
  for (const ref of refs) {
    try {
      await getStore(ref.store).delete(ref.key);
    } catch (err) {
      console.error(`Failed to delete blob ${ref.key} from ${ref.store}:`, err);
    }
  }
}

function decodeBase64(base64: string) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}

// Uploaded files arrive as base64 next to the record; store the file and keep only its key.
async function storeUpload(collection: Collection, item: any) {
  if (collection !== "docs" && collection !== "photos") return item;
  const { base64, ...record } = item;
  if (base64 && record.blobKey) {
    await getStore(collection === "docs" ? "fm360-documents" : "fm360-photos").set(String(record.blobKey), decodeBase64(String(base64)).buffer);
  }
  return record;
}

// IDs end up inside onclick="...('id')" attributes in the apps, so they must not contain
// characters that could break out of those strings.
const SAFE_ID = /^[^\s'"`<>&\\]{1,200}$/;

function assertSafeIds(item: any) {
  for (const [key, value] of Object.entries(item)) {
    if (value === null || value === undefined || value === "") continue;
    if ((key === "id" || key === "parent" || /(Id|_id)$/.test(key)) && !SAFE_ID.test(String(value))) {
      throw new HttpError(400, `Ungültige ID im Feld "${key}".`);
    }
  }
}

function recordKey(collection: Collection, item: any) {
  if (collection === "rolePermissions") return `${item.roleId || item.role_id}:${item.permissionId || item.permission_id}`;
  if (collection === "employeeRoles") return `${item.employeeId || item.employee_id}:${item.roleId || item.role_id}`;
  return item?.id === undefined || item?.id === null ? "" : String(item.id);
}

// Non-admins may maintain employee master data (availability, skills, ...) but never logins,
// passwords or roles, so they cannot grant themselves or anyone else more rights.
async function restrictEmployeeChange(actor: Actor, item: any, db: DbClient) {
  if (actor.isAdmin) return item;
  const [existing] = await db.select().from(fm360Employees).where(eq(fm360Employees.id, String(item.id))).limit(1);
  const { password: _password, newPassword: _newPassword, ...rest } = item;
  const requestedRole = String(item.role || "");
  return {
    ...rest,
    loginName: existing?.loginName || "",
    loginEnabled: existing?.loginEnabled || false,
    role: existing ? existing.role : ADMIN_ROLE_PATTERN.test(requestedRole) ? "" : requestedRole,
  };
}

// New nodes are placed after their siblings, and missing FM codes are generated from the whole
// tree, the same way a full save did it.
async function prepareNodes(items: any[], db: DbClient) {
  const existing = await db.select().from(fm360Nodes).orderBy(fm360Nodes.sortOrder, fm360Nodes.createdAt);
  const existingById = new Map(existing.map((node) => [node.id, node]));
  const changedIds = new Set(items.map((item) => String(item.id)));
  const all: any[] = existing.filter((node) => !changedIds.has(node.id));
  const prepared = [];
  for (const item of items) {
    const merged: any = { ...existingById.get(String(item.id)), ...item };
    if (!Number.isFinite(merged.sortOrder)) {
      const siblings = all.filter((node) => (node.parent || "") === (merged.parent || ""));
      merged.sortOrder = siblings.reduce((max, node) => Math.max(max, Number(node.sortOrder) || 0), -1) + 1;
    }
    all.push(merged);
    prepared.push(merged);
  }
  enrichObjectCodes(all);
  return prepared;
}

const UPSERTS: Record<Collection, (item: any, db: DbClient) => Promise<unknown>> = {
  nodes: upsertNode,
  docs: upsertDocument,
  floorRecords: upsertFloorRecord,
  roomRecords: upsertRoomRecord,
  tickets: upsertTicket,
  templates: upsertTemplate,
  photos: upsertPhoto,
  employees: upsertEmployee,
  shifts: upsertShift,
  piket: upsertPiket,
  brandschutz: upsertBrandschutz,
  security: upsertSecurity,
  emergencyContacts: upsertEmergencyContact,
  projects: upsertProject,
  costs: upsertCost,
  roles: upsertRole,
  permissions: upsertPermission,
  rolePermissions: upsertRolePermission,
  employeeRoles: upsertEmployeeRole,
  taskAssignments: upsertTaskAssignment,
  vacationEntries: upsertVacationEntry,
  notifications: upsertNotification,
};

// Referenced tables come first; deletes run in the reverse order.
const WRITE_ORDER: Collection[] = [
  "employees", "roles", "permissions", "nodes", "docs", "floorRecords", "roomRecords", "templates", "tickets", "photos",
  "shifts", "piket", "brandschutz", "security", "emergencyContacts", "projects", "costs",
  "rolePermissions", "employeeRoles", "taskAssignments", "vacationEntries", "notifications",
];

type Changes = Partial<Record<Collection, { upsert?: any[]; delete?: string[] }>>;

function isCollection(value: string): value is Collection {
  return Object.prototype.hasOwnProperty.call(UPSERTS, value);
}

function normalizeChanges(raw: any): Changes {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new HttpError(400, "Missing changes");
  const changes: Changes = {};
  for (const [collection, change] of Object.entries<any>(raw)) {
    if (!isCollection(collection)) throw new HttpError(400, `Unknown collection "${collection}"`);
    const upsert = change?.upsert ?? [];
    const remove = change?.delete ?? [];
    if (!Array.isArray(upsert) || !Array.isArray(remove)) throw new HttpError(400, `Invalid changes for "${collection}"`);
    for (const item of upsert) {
      if (!item || typeof item !== "object" || !recordKey(collection, item)) throw new HttpError(400, `Record without id in "${collection}"`);
    }
    changes[collection] = { upsert, delete: remove.map((id: unknown) => String(id)) };
  }
  return changes;
}

async function assertAdminLoginRemains(db: DbClient) {
  const [admin] = await db
    .select({ id: fm360Employees.id })
    .from(fm360Employees)
    .where(sql`${fm360Employees.loginEnabled} and ${fm360Employees.loginName} <> '' and ${fm360Employees.passwordHash} <> ''
      and (${fm360Employees.id} = 'emp-admin' or ${fm360Employees.role} ~* 'admin|chef')`)
    .limit(1);
  if (!admin) throw new HttpError(409, "Mindestens ein aktiver Admin-Login mit Passwort muss bestehen bleiben.");
}

// Applies record-level changes in one transaction. Unlike the old full-state save, records that
// were not changed are left alone, so two people working at the same time no longer overwrite
// each other's work.
async function applyChanges(actor: Actor, rawChanges: any, { strictCosts = false } = {}) {
  const changes = normalizeChanges(rawChanges);
  for (const collection of WRITE_ORDER) {
    const change = changes[collection];
    if (!change) continue;
    if ((change.upsert?.length && !canWrite(actor, collection, "upsert")) || (change.delete?.length && !canWrite(actor, collection, "delete"))) {
      throw new HttpError(403, "Keine Berechtigung für diese Änderung.");
    }
    for (const item of change.upsert || []) assertSafeIds(item);
    if (strictCosts && collection === "costs" && change.upsert?.some((item) => !["budget", "adjustment"].includes(String(item.category || "")))) {
      throw new HttpError(400, "fm360_costs accepts only budget planning and manual adjustment records");
    }
  }

  const blobsToDelete = await getDb().transaction(async (tx) => {
    for (const collection of WRITE_ORDER) {
      let items = changes[collection]?.upsert || [];
      if (!items.length) continue;
      if (collection === "nodes") items = await prepareNodes(items, tx);
      for (let item of items) {
        if (collection === "costs" && !["budget", "adjustment"].includes(String(item.category || ""))) continue;
        if (collection === "employees") item = await restrictEmployeeChange(actor, item, tx);
        item = await storeUpload(collection, item);
        await UPSERTS[collection](item, tx);
      }
    }

    const refs: BlobRef[] = [];
    for (const collection of [...WRITE_ORDER].reverse()) {
      for (const id of changes[collection]?.delete || []) {
        const ref = await removeRecord(collection, id, tx);
        if (ref) refs.push(ref);
      }
    }

    if (changes.employees) await assertAdminLoginRemains(tx);
    return refs;
  });

  await deleteBlobs(blobsToDelete);
}

async function replaceAll(state: any) {
  const db = getDb();
  for (const collection of WRITE_ORDER) {
    for (const item of state?.[collection] || []) assertSafeIds(item);
  }

  // Everything runs in one transaction: if any insert fails, the previous data stays intact
  // instead of being left half-deleted.
  const { photoBlobsToDelete, docBlobsToDelete } = await db.transaction(async (tx) => {
    const currentPhotos = await tx.select().from(fm360Photos);
    const nextPhotoIds = new Set((state.photos || []).map((p: any) => String(p.id)));
    const currentDocs = await tx.select().from(fm360Documents);
    const nextDocIds = new Set((state.docs || []).map((d: any) => String(d.id)));

    // The client never receives password hashes, so remember them before the employees are deleted.
    const currentEmployees = await tx.select({ id: fm360Employees.id, passwordHash: fm360Employees.passwordHash }).from(fm360Employees);
    const previousPasswordHashes = new Map(currentEmployees.map((employee) => [employee.id, employee.passwordHash]));

    await tx.execute(sql`delete from ${fm360Notifications}`);
    await tx.execute(sql`delete from ${fm360VacationEntries}`);
    await tx.execute(sql`delete from ${fm360TaskAssignments}`);
    await tx.execute(sql`delete from ${fm360EmployeeRoles}`);
    await tx.execute(sql`delete from ${fm360RolePermissions}`);
    await tx.execute(sql`delete from ${fm360Photos}`);
    await tx.execute(sql`delete from ${fm360RoomRecords}`);
    await tx.execute(sql`delete from ${fm360FloorRecords}`);
    await tx.execute(sql`delete from ${fm360Documents}`);
    await tx.execute(sql`delete from ${fm360Tickets}`);
    await tx.execute(sql`delete from ${fm360Templates}`);
    await tx.execute(sql`delete from ${fm360Nodes}`);
    await tx.execute(sql`delete from ${fm360Shifts}`);
    await tx.execute(sql`delete from ${fm360Piket}`);
    await tx.execute(sql`delete from ${fm360Brandschutz}`);
    await tx.execute(sql`delete from ${fm360Security}`);
    await tx.execute(sql`delete from ${fm360EmergencyContacts}`);
    await tx.execute(sql`delete from ${fm360Projects}`);
    await tx.execute(sql`delete from ${fm360Costs}`);
    await tx.execute(sql`delete from ${fm360Employees}`);
    await tx.execute(sql`delete from ${fm360Permissions}`);
    await tx.execute(sql`delete from ${fm360Roles}`);

    // Referenced tables first: tickets create notifications that point at employees.
    for (const item of state.employees || []) {
      await upsertEmployee(item, tx, previousPasswordHashes.get(String(item.id)) || "");
    }
    for (const item of state.roles || []) await upsertRole(item, tx);
    for (const item of state.permissions || []) await upsertPermission(item, tx);

    const nodes = enrichObjectCodes(state.nodes || []);
    for (const [index, item] of nodes.entries()) {
      await upsertNode({ ...item, sortOrder: index }, tx);
    }
    for (const item of state.docs || []) await upsertDocument(item, tx);
    for (const item of state.floorRecords || []) await upsertFloorRecord(item, tx);
    for (const item of state.roomRecords || []) await upsertRoomRecord(item, tx);
    for (const item of state.tickets || []) await upsertTicket(item, tx);
    for (const item of state.templates || []) await upsertTemplate(item, tx);
    for (const item of state.photos || []) await upsertPhoto(item, tx);
    for (const item of state.shifts || []) await upsertShift(item, tx);
    for (const item of state.piket || []) await upsertPiket(item, tx);
    for (const item of state.brandschutz || []) await upsertBrandschutz(item, tx);
    for (const item of state.security || []) await upsertSecurity(item, tx);
    for (const item of state.emergencyContacts || []) await upsertEmergencyContact(item, tx);
    for (const item of state.projects || []) await upsertProject(item, tx);
    for (const item of state.costs || []) {
      if (["budget", "adjustment"].includes(String(item.category || ""))) await upsertCost(item, tx);
    }
    for (const item of state.rolePermissions || []) await upsertRolePermission(item, tx);
    for (const item of state.employeeRoles || []) await upsertEmployeeRole(item, tx);
    for (const item of state.taskAssignments || []) await upsertTaskAssignment(item, tx);
    for (const item of state.vacationEntries || []) await upsertVacationEntry(item, tx);
    for (const item of state.notifications || []) await upsertNotification(item, tx);
    await assertAdminLoginRemains(tx);

    return {
      photoBlobsToDelete: currentPhotos.filter((p) => !nextPhotoIds.has(p.id)).map((p) => p.blobKey),
      docBlobsToDelete: currentDocs.filter((d) => d.blobKey && !nextDocIds.has(d.id)).map((d) => d.blobKey!),
    };
  });

  // Only remove files once the database no longer references them.
  const photoStore = getStore("fm360-photos");
  for (const blobKey of photoBlobsToDelete) {
    try {
      await photoStore.delete(blobKey);
    } catch (err) {
      console.error("Failed to delete blob during replaceAll:", err);
    }
  }
  const docStore = getStore("fm360-documents");
  for (const blobKey of docBlobsToDelete) {
    try {
      await docStore.delete(blobKey);
    } catch (err) {
      console.error("Failed to delete document blob during replaceAll:", err);
    }
  }
}

async function seedDemoData() {
  const db = getDb();
  
  // Clean up all existing photos from Netlify Blobs and DB
  const currentPhotos = await db.select().from(fm360Photos);
  const store = getStore("fm360-photos");
  for (const p of currentPhotos) {
    try {
      await store.delete(p.blobKey);
    } catch (err) {
      console.error("Failed to delete blob during seeding:", err);
    }
  }

  await db.execute(sql`delete from ${fm360Notifications}`);
  await db.execute(sql`delete from ${fm360VacationEntries}`);
  await db.execute(sql`delete from ${fm360TaskAssignments}`);
  await db.execute(sql`delete from ${fm360EmployeeRoles}`);
  await db.execute(sql`delete from ${fm360RolePermissions}`);
  await db.execute(sql`delete from ${fm360Photos}`);
  await db.execute(sql`delete from ${fm360RoomRecords}`);
  await db.execute(sql`delete from ${fm360FloorRecords}`);
  await db.execute(sql`delete from ${fm360Documents}`);
  await db.execute(sql`delete from ${fm360Tickets}`);
  await db.execute(sql`delete from ${fm360Templates}`);
  await db.execute(sql`delete from ${fm360Nodes}`);
  await db.execute(sql`delete from ${fm360Shifts}`);
  await db.execute(sql`delete from ${fm360Piket}`);
  await db.execute(sql`delete from ${fm360Brandschutz}`);
  await db.execute(sql`delete from ${fm360Security}`);
  await db.execute(sql`delete from ${fm360EmergencyContacts}`);
  await db.execute(sql`delete from ${fm360Projects}`);
  await db.execute(sql`delete from ${fm360Costs}`);
  await db.execute(sql`delete from ${fm360Employees}`);
  await db.execute(sql`delete from ${fm360Permissions}`);
  await db.execute(sql`delete from ${fm360Roles}`);

  const enriched = enrichObjectCodes(SEED_NODES.map((item, index) => ({
    id: item.id,
    parent: item.parent,
    type: item.type,
    name: item.name,
    code: item.code || "",
    objectCode: item.objectCode || "",
    notes: item.notes || "",
    anlage: item.anlage || null,
    sortOrder: index,
  })));

  for (const item of enriched) {
    await db.insert(fm360Nodes).values({
      id: item.id,
      parent: item.parent,
      type: item.type,
      name: item.name,
      code: item.code,
      objectCode: item.objectCode,
      notes: item.notes,
      anlage: item.anlage,
      sortOrder: item.sortOrder,
    });
  }

  const SEED_EMPLOYEES = [
    { id: "emp-1", name: "Hans Müller", role: "FM Internal", skills: "Heizungstechnik, Lüftungskompetenz, BMA Zertifikat", availability: "Anwesend", piketEligible: true },
    { id: "emp-2", name: "Sarah Schmid", role: "FM Internal", skills: "Zutrittssysteme, Alarmanlagen, Elektroinstallationen", availability: "Anwesend", piketEligible: true },
    { id: "emp-3", name: "Thomas Keller", role: "External", skills: "Brandschutzexperte, Notfallmanagement, HSE", availability: "Urlaub", piketEligible: false },
    { id: "emp-4", name: "Beat Fischer", role: "FM Internal", skills: "Gebäudetechnik, Piketdienst-Erfahrung, Kleinreparaturen", availability: "Frei", piketEligible: true },
    { id: "emp-5", name: "Sasa Gacic", role: "Piket Only", skills: "Externer Pikettechniker", availability: "Anwesend", piketEligible: true }
  ];

  const SEED_SHIFTS: any[] = [];

  const SEED_PIKET = [
    { id: "pk-1", date: "2026-W26", employeeName: "Hans Müller", shiftTime: "17:00 - 08:00", contacts: "+41 79 123 45 67", interventions: "Wassereintritt im UG Altbau behoben (Reaktionszeit 12 min)", responseTime: "12 min", escalation: "Stufe 1 (Direkt gelöst)", status: "Aktiv", interventionDuration: "1.5 Std.", interventionCause: "Defekte Dichtung an Hauptwasserleitung", interventionMeasure: "Dichtung getauscht, Raum getrocknet", interventionStatus: "erledigt", interventionTime: "24.06.2026", startDate: "2026-06-22T08:00", endDate: "2026-06-28T17:00" },
    { id: "pk-2", date: "2026-W27", employeeName: "Sarah Schmid", shiftTime: "17:00 - 08:00", contacts: "+41 79 234 56 78", interventions: "Keine", responseTime: "-", escalation: "Keine", status: "Geplant", interventionDuration: "", interventionCause: "", interventionMeasure: "", interventionStatus: "offen", startDate: "2026-06-29T08:00", endDate: "2026-07-05T17:00" },
    { id: "pk-3", date: "2026-W28", employeeName: "Beat Fischer", shiftTime: "17:00 - 08:00", contacts: "+41 79 345 67 89", interventions: "Keine", responseTime: "-", escalation: "Keine", status: "Geplant", interventionDuration: "", interventionCause: "", interventionMeasure: "", interventionStatus: "offen", startDate: "2026-07-06T08:00", endDate: "2026-07-12T17:00" },
    { id: "pk-4", date: "2026-W29", employeeName: "Sasa Gacic", shiftTime: "17:00 - 08:00", contacts: "+41 79 987 65 43", interventions: "Keine", responseTime: "-", escalation: "Keine", status: "Geplant", interventionDuration: "", interventionCause: "", interventionMeasure: "", interventionStatus: "offen", startDate: "2026-07-13T08:00", endDate: "2026-07-19T17:00" }
  ];

  const SEED_BRANDSCHUTZ = [
    { id: "bs-1", systemType: "Brandmeldeanlage (BMA)", name: "Haupt-BMA Securiton", location: "Neubau UG, Elektroraum", inspectionInterval: "jährlich", lastInspection: "2025-10-15", nextInspection: "2026-10-15", certificate: "Zert-BMA-2025.pdf", defects: "Keine" },
    { id: "bs-2", systemType: "Sprinklerzentrale", name: "Nass-Sprinklerzentrale", location: "Altbau UG, Lager", inspectionInterval: "halbjährlich", lastInspection: "2025-12-10", nextInspection: "2026-06-10", certificate: "Prüfbericht-Sprinkler-Meier.pdf", defects: "Druckabfall im Primärkreis (behoben)" },
    { id: "bs-3", systemType: "Rauchmelder", name: "Funksystem Rauchwarnmelder", location: "Komplette Liegenschaft", inspectionInterval: "jährlich", lastInspection: "2025-09-20", nextInspection: "2026-09-20", certificate: "Hager-Protokoll-2025.pdf", defects: "Batteriewechsel an 3 Meldern im 2.OG erforderlich" },
    { id: "bs-4", systemType: "Feuerlöscher", name: "CO2- & Schaumlöscher (24 Stk)", location: "Etagen & Technikräume", inspectionInterval: "zweijährlich", lastInspection: "2024-11-05", nextInspection: "2026-11-05", certificate: "Plaketten vergeben", defects: "Keine" },
    { id: "bs-5", systemType: "Fluchtwege", name: "Flucht- & Rettungswege Kennzeichnung", location: "Alle Gänge & Ausgänge", inspectionInterval: "monatlich", lastInspection: "2026-06-01", nextInspection: "2026-07-01", certificate: "Interne Freigabe", defects: "Notbeleuchtungs-Piktogramm Altbau EG flackert" }
  ];

  const SEED_SECURITY = [
    { id: "sc-1", systemType: "Alarmanlagen", name: "Einbruchmeldeanlage (EMA) Telenot", location: "Neubau EG, Haupteingang", status: "Scharfgeschaltet", alarmHistory: "2026-04-12: Fehlalarm durch Reinigungsdienst", incidents: "Keine Vorfälle" },
    { id: "sc-2", systemType: "Videoüberwachung (CCTV)", name: "Mobotix IP-Kamerasystem", location: "Außenbereich & Ladezone", status: "Aktiv (Aufzeichnung)", alarmHistory: "-", incidents: "Vandalismusversuch Ladezone am 15.05.2026 (Polizei gemeldet)" },
    { id: "sc-3", systemType: "Zutrittskontrolle", name: "Salto RFID Badge-System", location: "Sämtliche Außentüren", status: "Aktiv", alarmHistory: "Wöchentliches Audit durchgeführt", incidents: "2 verlorene Badges gesperrt" },
    { id: "sc-4", systemType: "Sensoren", name: "Glasbruchsensoren Schaufenster", location: "EG Strassenseite", status: "Aktiv", alarmHistory: "-", incidents: "Keine" }
  ];

  for (const item of SEED_EMPLOYEES) {
    await db.insert(fm360Employees).values(item);
  }
  for (const item of SEED_SHIFTS) {
    await db.insert(fm360Shifts).values(item);
  }
  for (const item of SEED_PIKET) {
    await db.insert(fm360Piket).values(item);
  }
  for (const item of SEED_BRANDSCHUTZ) {
    await db.insert(fm360Brandschutz).values(item);
  }
  for (const item of SEED_SECURITY) {
    await db.insert(fm360Security).values(item);
  }

  const SEED_EMERGENCY_CONTACTS = [
    { id: "ec-1", name: "Polizei", phone: "117", description: "Polizei Schweiz", category: "Externe Notfallkontakte" },
    { id: "ec-2", name: "Feuerwehr", phone: "118", description: "Feuerwehr Notruf", category: "Externe Notfallkontakte" },
    { id: "ec-3", name: "Ambulanz", phone: "144", description: "Rettungsdienst", category: "Externe Notfallkontakte" },
    { id: "ec-4", name: "Certas Alarmzentrale", phone: "+41 XX XXX XX XX", description: "Alarm / Security Monitoring", category: "Externe Notfallkontakte" },
    { id: "ec-5", name: "Elektriker Piket", phone: "+41 XX XXX XX XX", description: "Firma / Kontakt", category: "Externe Notfallkontakte" },
    { id: "ec-6", name: "Lift Service", phone: "+41 XX XXX XX XX", description: "Schindler / Otis / Kone", category: "Externe Notfallkontakte" },
    { id: "ec-7", name: "Rudolf Maier", phone: "+41 79 123 45 67", description: "Leiter Instandhaltung", category: "Interne Kontakte" },
    { id: "ec-8", name: "Instandhaltung Fust", phone: "+41 79 234 56 78", description: "Fust interne Instandhaltung", category: "Interne Kontakte" },
    { id: "ec-9", name: "Haustechnik Fust", phone: "+41 79 345 67 89", description: "Haustechnik allgemein", category: "Interne Kontakte" },
    { id: "ec-10", name: "IT Support Fust", phone: "+41 79 456 78 90", description: "IT Piket", category: "Interne Kontakte" },
  ];

  for (const item of SEED_EMERGENCY_CONTACTS) {
    await db.insert(fm360EmergencyContacts).values(item);
  }
}

// Files are served from the app's own origin, so only types that cannot run scripts are shown
// inline. Everything else (HTML, SVG, ...) is downloaded, otherwise an uploaded file could act
// as the logged-in user.
const INLINE_FILE_TYPES = /^(application\/pdf|image\/(png|jpe?g|gif|webp|bmp|heic|heif)|text\/plain)$/;

function fileResponse(blob: ArrayBuffer, contentType: string, fileName: string, cacheControl: string) {
  const type = String(contentType || "").toLowerCase().split(";")[0].trim();
  const inline = INLINE_FILE_TYPES.test(type);
  return new Response(blob, {
    headers: {
      "content-type": inline ? type : "application/octet-stream",
      "content-disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "x-content-type-options": "nosniff",
      "cache-control": cacheControl,
    },
  });
}

async function readFile(url: URL) {
  const db = getDb();
  const docId = url.searchParams.get("docId");
  if (docId) {
    const [doc] = await db.select().from(fm360Documents).where(eq(fm360Documents.id, docId)).limit(1);
    if (!doc?.blobKey) return new Response("Document not found", { status: 404 });
    const blob = await getStore("fm360-documents").get(doc.blobKey, { type: "arrayBuffer" });
    if (!blob) return new Response("Blob not found", { status: 404 });
    return fileResponse(blob, doc.contentType, doc.fileName || doc.title || "document", "private, max-age=300");
  }

  const photoId = url.searchParams.get("photoId") || "";
  const [photo] = await db.select().from(fm360Photos).where(eq(fm360Photos.id, photoId)).limit(1);
  if (!photo) return new Response("Photo not found", { status: 404 });
  const blob = await getStore("fm360-photos").get(photo.blobKey, { type: "arrayBuffer" });
  if (!blob) return new Response("Blob not found", { status: 404 });
  return fileResponse(blob, photo.contentType || "image/jpeg", `${photo.id}`, "private, max-age=31536000");
}

async function login(req: Request, body: any) {
  const loginName = String(body.loginName || body.login || "");
  const keys = loginAttemptKeys(req, loginName);
  if (await isLoginRateLimited(keys)) {
    return json({ error: "Zu viele fehlgeschlagene Anmeldungen. Bitte in 15 Minuten erneut versuchen." }, { status: 429 });
  }
  const employee = await loginEmployee(loginName, String(body.password || ""));
  if (!employee) {
    await recordLoginFailure(keys);
    return json({ error: "Invalid login" }, { status: 401 });
  }
  await clearLoginFailures(keys[0].key);
  const secret = authSecret(req);
  if (!secret) return json({ error: "Auth secret is not configured" }, { status: 500 });
  const token = await createSessionToken(employee, secret);
  return json({ employee, token }, { headers: { "set-cookie": sessionCookie(token) } });
}

export default async (req: Request) => {
  try {
    const url = new URL(req.url);

    if (req.method === "GET") {
      const isFileRequest = url.searchParams.has("docId") || url.searchParams.has("photoId");
      const actor = await authenticate(req, { allowCookie: isFileRequest });
      if (isFileRequest) return await readFile(url);
      if (url.searchParams.get("debugTickets") === "true") {
        requireAdmin(actor);
        return json(await readTicketDebugState());
      }
      return json(await readState());
    }

    if (req.method === "POST") {
      if (url.searchParams.get("seed") === "true") {
        requireAdmin(await authenticate(req));
        await seedDemoData();
        await ensureLoginEmployees();
        return json(await readState());
      }
      const body = await req.json().catch(() => ({}));
      if (body?.action === "login") return await login(req, body);
      if (body?.action === "logout") {
        return json({ ok: true }, { headers: { "set-cookie": sessionCookie("", 0) } });
      }
      return json({ error: "Action not supported" }, { status: 400 });
    }

    // Legacy full-state save, kept for pages that were open during a deploy.
    if (req.method === "PUT") {
      requireAdmin(await authenticate(req));
      await replaceAll(await req.json());
      return json(await readState());
    }

    if (req.method === "PATCH") {
      const actor = await authenticate(req);
      const body = await req.json();
      if (body?.action === "batch") {
        await applyChanges(actor, body.changes);
        return json(await readState());
      }
      if (body?.action === "reorderNodes") {
        if (!canWrite(actor, "nodes", "upsert")) throw new HttpError(403, "Keine Berechtigung für diese Änderung.");
        await reorderSiblingNodes(body.parent || null, Array.isArray(body.orderedIds) ? body.orderedIds : []);
        return json(await readState());
      }
      const { collection, item } = body || {};
      if (!collection || !item?.id) return json({ error: "Missing collection or item id" }, { status: 400 });
      await applyChanges(actor, { [collection]: { upsert: [item] } }, { strictCosts: true });
      return json(await readState());
    }

    if (req.method === "DELETE") {
      const actor = await authenticate(req);
      const { collection, ids } = await req.json();
      if (!collection || !Array.isArray(ids)) return json({ error: "Missing collection or ids" }, { status: 400 });
      await applyChanges(actor, { [collection]: { delete: ids } });
      return json(await readState());
    }

    return json({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, { status: error.status });
    const pgCode = (error as any)?.cause?.code ?? (error as any)?.code;
    if (pgCode === "23505") {
      return json({ error: "Ein Wert ist bereits vergeben (z. B. E-Mail, Loginname oder FM-Code)." }, { status: 409 });
    }
    console.error(error);
    return json({ error: "Database request failed" }, { status: 500 });
  }
};

export const config: Config = {
  path: "/api/fm360",
};
