// Wiederkehrende Arbeitsaufträge: Prüfung des Formats und Datumsrechnung.
// Öffentliches Format am Ticket:
//   recurrence = { every, unit, remindBefore, remindUnit, managerId } | null
//   unit / remindUnit: "days" | "weeks" | "months"; null = einmaliger Auftrag ohne Wiederholung.

export type RecurrenceUnit = "days" | "weeks" | "months";

export type Recurrence = {
  every: number;
  unit: RecurrenceUnit;
  remindBefore: number;
  remindUnit: RecurrenceUnit;
  managerId: string;
};

export const RECURRENCE_UNITS: RecurrenceUnit[] = ["days", "weeks", "months"];

// Obergrenzen je Einheit (rund 10 Jahre), damit Tippfehler wie 1200 Monate abgewiesen werden.
const MAX_BY_UNIT: Record<RecurrenceUnit, number> = { days: 3650, weeks: 520, months: 120 };

export class RecurrenceError extends Error {}

const CLOSED_STATUSES = new Set(["abgeschlossen", "erledigt", "geschlossen"]);

export function isClosedStatus(status: unknown) {
  return CLOSED_STATUSES.has(String(status || "").trim().toLowerCase());
}

export function isIsoDate(value: unknown): value is string {
  const text = String(value || "");
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3]);
}

function toIso(date: Date) {
  return date.toISOString().slice(0, 10);
}

// Monate werden kalendarisch addiert; der Tag wird auf das Monatsende begrenzt (31.01. + 1 Monat = 28./29.02.).
export function addInterval(isoDate: string, amount: number, unit: RecurrenceUnit) {
  if (!isIsoDate(isoDate)) throw new RecurrenceError(`Ungültiges Datum "${isoDate}".`);
  const [y, m, d] = isoDate.split("-").map(Number);
  if (unit === "months") {
    const targetMonth = m - 1 + amount;
    const lastDay = new Date(Date.UTC(y, targetMonth + 1, 0)).getUTCDate();
    return toIso(new Date(Date.UTC(y, targetMonth, Math.min(d, lastDay))));
  }
  const days = unit === "weeks" ? amount * 7 : amount;
  return toIso(new Date(Date.UTC(y, m - 1, d + days)));
}

export function reminderDate(due: string, recurrence: Pick<Recurrence, "remindBefore" | "remindUnit">) {
  return addInterval(due, -recurrence.remindBefore, recurrence.remindUnit);
}

function positiveInt(value: unknown, field: string, { allowZero = false } = {}) {
  const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof number !== "number" || !Number.isInteger(number) || number < (allowZero ? 0 : 1)) {
    throw new RecurrenceError(`"${field}" muss eine ganze Zahl ${allowZero ? "ab 0" : "ab 1"} sein.`);
  }
  return number;
}

function unitOf(value: unknown, field: string): RecurrenceUnit {
  const unit = String(value || "") as RecurrenceUnit;
  if (!RECURRENCE_UNITS.includes(unit)) throw new RecurrenceError(`"${field}" muss days, weeks oder months sein.`);
  return unit;
}

// Prüft und vereinheitlicht recurrence. null/undefined/"" bedeutet: keine Wiederholung.
export function normalizeRecurrence(raw: unknown): Recurrence | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw !== "object" || Array.isArray(raw)) throw new RecurrenceError("recurrence muss ein Objekt oder null sein.");
  const input = raw as Record<string, unknown>;
  const unit = unitOf(input.unit, "unit");
  const every = positiveInt(input.every, "every");
  if (every > MAX_BY_UNIT[unit]) throw new RecurrenceError(`Intervall zu gross: höchstens ${MAX_BY_UNIT[unit]} ${unit}.`);
  const remindUnit = unitOf(input.remindUnit ?? "days", "remindUnit");
  const remindBefore = positiveInt(input.remindBefore ?? 0, "remindBefore", { allowZero: true });
  if (remindBefore > MAX_BY_UNIT[remindUnit]) throw new RecurrenceError(`Erinnerung zu früh: höchstens ${MAX_BY_UNIT[remindUnit]} ${remindUnit} vorher.`);
  const managerId = String(input.managerId ?? "").trim();
  return { every, unit, remindBefore, remindUnit, managerId };
}

// Gleichheit unabhängig von der Schlüsselreihenfolge (jsonb sortiert Schlüssel um).
export function sameRecurrence(a: unknown, b: unknown) {
  const norm = (value: unknown) => {
    if (!value || typeof value !== "object") return null;
    const r = value as Record<string, unknown>;
    return JSON.stringify([r.every, r.unit, r.remindBefore, r.remindUnit, r.managerId]);
  };
  return norm(a) === norm(b);
}

// Heutiges Datum in der Schweiz (YYYY-MM-DD), unabhängig von der Serverzeitzone.
export function todayInZurich(now = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Zurich" }).format(now);
}
