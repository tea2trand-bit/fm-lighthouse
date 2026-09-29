import { drizzle } from "drizzle-orm/netlify-db";
import * as schema from "./schema.js";

const createDb = () => drizzle({ schema });

// Im lokalen "server"-Modus (Tests, netlify dev) erzeugt jeder Aufruf einen eigenen Postgres-Pool,
// der nie geschlossen wird; bei vielen Anfragen gehen so die Verbindungen aus. Dort wird deshalb
// ein Client wiederverwendet. In der Produktion bleibt es beim bisherigen Verhalten.
let serverDb: ReturnType<typeof createDb> | undefined;

export function getDb() {
  const driver = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.NETLIFY_DB_DRIVER;
  if (driver === "server") return (serverDb ??= createDb());
  return createDb();
}
