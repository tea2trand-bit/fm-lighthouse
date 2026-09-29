import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { hashPassword, needsRehash, verifyPassword } from "../server/password.ts";

test("new hashes are salted PBKDF2 and verify", async () => {
  const first = await hashPassword("geheim");
  const second = await hashPassword("geheim");
  assert.match(first, /^pbkdf2-sha256\$\d+\$[^$]+\$[^$]+$/);
  assert.notEqual(first, second, "same password must not produce the same hash");
  assert.equal(await verifyPassword("geheim", first), true);
  assert.equal(await verifyPassword("falsch", first), false);
  assert.equal(needsRehash(first), false);
});

test("legacy sha256 hashes still verify and are flagged for rehash", async () => {
  const legacy = `sha256:${createHash("sha256").update("admin").digest("hex")}`;
  assert.equal(await verifyPassword("admin", legacy), true);
  assert.equal(await verifyPassword("worker", legacy), false);
  assert.equal(needsRehash(legacy), true);
});

test("empty or malformed hashes never verify", async () => {
  assert.equal(await verifyPassword("", ""), false);
  assert.equal(await verifyPassword("admin", ""), false);
  assert.equal(await verifyPassword("admin", "pbkdf2-sha256$abc$$"), false);
  assert.equal(await verifyPassword("admin", "plaintext-admin"), false);
});
