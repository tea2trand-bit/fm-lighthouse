// Password hashing for FM360 logins.
// New hashes use salted PBKDF2-SHA256; legacy unsalted "sha256:<hex>" hashes are still
// accepted so existing accounts keep working, and get upgraded on the next successful login.

const PBKDF2_PREFIX = "pbkdf2-sha256";
const PBKDF2_ITERATIONS = 210_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

async function pbkdf2(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, HASH_BYTES * 8);
  return new Uint8Array(bits);
}

async function legacySha256(password: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password));
  return `sha256:${Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `${PBKDF2_PREFIX}$${PBKDF2_ITERATIONS}$${bytesToBase64(salt)}$${bytesToBase64(hash)}`;
}

export async function verifyPassword(password: string, stored: string) {
  if (!stored) return false;

  if (stored.startsWith("sha256:")) {
    return constantTimeEqual(await legacySha256(password), stored);
  }

  const [prefix, iterationsText, saltText, hashText] = stored.split("$");
  const iterations = Number(iterationsText);
  if (prefix !== PBKDF2_PREFIX || !Number.isInteger(iterations) || iterations < 1 || !saltText || !hashText) return false;

  try {
    const candidate = await pbkdf2(password, base64ToBytes(saltText), iterations);
    return constantTimeEqual(bytesToBase64(candidate), hashText);
  } catch {
    return false;
  }
}

export function needsRehash(stored: string) {
  if (!stored.startsWith(`${PBKDF2_PREFIX}$`)) return true;
  return Number(stored.split("$")[1]) < PBKDF2_ITERATIONS;
}
