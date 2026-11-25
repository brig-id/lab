/**
 * The prototype of brig-id/spec#22: a data key wrapped with a key derived
 * from a PRF output, a field encrypted with it, and everything that must
 * make reading it back fail.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { randomBytes } from "../src/prf/bytes.ts";
import {
  decryptField,
  encryptField,
  keyWrappingKey,
  newDataKey,
  unwrapDataKey,
  wrapDataKey,
} from "../src/prf/keys.ts";

const prf = randomBytes(32);
const credentialId = randomBytes(16);

async function store(value: string) {
  const dataKey = await newDataKey();
  const wrapped = await wrapDataKey(
    dataKey,
    await keyWrappingKey(prf),
    credentialId,
  );
  const sealed = await encryptField(dataKey, "identity.label", value);
  return { wrapped, sealed };
}

test("a field encrypted, then read back after a second sign-in", async () => {
  const { wrapped, sealed } = await store("Ada Lovelace");
  // 1 + 12 + 32 + 16: version, IV, raw AES-256 key, GCM tag.
  assert.equal(wrapped.length, 61);
  assert.equal(wrapped[0], 0);

  // The same passkey and salt give the same output: a new derivation
  // from it unwraps the data key.
  const again = await keyWrappingKey(Uint8Array.from(prf));
  const dataKey = await unwrapDataKey(wrapped, again, credentialId);
  assert.equal(dataKey.extractable, false);
  assert.equal(
    await decryptField(dataKey, "identity.label", sealed),
    "Ada Lovelace",
  );
});

test("another PRF output does not unwrap the data key", async () => {
  const { wrapped } = await store("x");
  await assert.rejects(
    unwrapDataKey(wrapped, await keyWrappingKey(randomBytes(32)), credentialId),
    { name: "OperationError" },
  );
});

test("a wrapped key belongs to its passkey, a field to its name", async () => {
  const { wrapped, sealed } = await store("x");
  const kek = await keyWrappingKey(prf);
  await assert.rejects(unwrapDataKey(wrapped, kek, randomBytes(16)), {
    name: "OperationError",
  });
  const dataKey = await unwrapDataKey(wrapped, kek, credentialId);
  await assert.rejects(decryptField(dataKey, "identity.description", sealed), {
    name: "OperationError",
  });
});

test("a changed byte, an unknown version, a short output are refused", async () => {
  const { wrapped, sealed } = await store("x");
  const kek = await keyWrappingKey(prf);
  const flipped = Uint8Array.from(wrapped);
  flipped[20]! ^= 1;
  await assert.rejects(unwrapDataKey(flipped, kek, credentialId));
  const v1 = Uint8Array.from(sealed);
  v1[0] = 1;
  const dataKey = await unwrapDataKey(wrapped, kek, credentialId);
  await assert.rejects(decryptField(dataKey, "identity.label", v1), /version/);
  await assert.rejects(keyWrappingKey(randomBytes(16)), /32 bytes/);
});

test("the same field encrypted twice gives two different values", async () => {
  const dataKey = await newDataKey();
  const a = await encryptField(dataKey, "n", "same");
  const b = await encryptField(dataKey, "n", "same");
  assert.notDeepEqual(a, b);
});
