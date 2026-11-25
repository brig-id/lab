/**
 * Reading what an authenticator returns at creation: the CBOR of the
 * attestation object, the flags and the AAGUID of the authenticator data.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  authDataFromAttestationObject,
  authenticatorName,
  parseAuthenticatorData,
} from "../src/prf/authdata.ts";
import { CborError, decodeCbor } from "../src/prf/cbor.ts";
import { concat } from "../src/prf/bytes.ts";

const ICLOUD = Uint8Array.from(
  Buffer.from("fbfc3007154e4ecc8c0b6e020557d7bd", "hex"),
);

/** Text string or byte string header, short lengths only. */
const head = (major: number, length: number) =>
  length < 24 ? [(major << 5) | length] : [(major << 5) | 24, length];
const text = (s: string) => concat(head(3, s.length), Buffer.from(s));
const bytes = (b: Uint8Array) =>
  b.length < 256
    ? concat(head(2, b.length), b)
    : concat([0x59, b.length >> 8, b.length & 0xff], b);

function authData(flags: number, aaguid?: Uint8Array): Uint8Array {
  const header = concat(new Uint8Array(32), [flags], [0, 0, 0, 7]);
  if (!aaguid) return header;
  const credentialId = new Uint8Array(16).fill(9);
  // A COSE key as an authenticator would send it: {1: 2, 3: -7}.
  const coseKey = [0xa2, 0x01, 0x02, 0x03, 0x26];
  return concat(header, aaguid, [0, 16], credentialId, coseKey);
}

test("CBOR: integers, strings, arrays, maps and simple values", () => {
  assert.equal(decodeCbor(Uint8Array.from([0x17])), 23);
  assert.equal(decodeCbor(Uint8Array.from([0x18, 0xff])), 255);
  assert.equal(decodeCbor(Uint8Array.from([0x19, 0x01, 0x00])), 256);
  assert.equal(decodeCbor(Uint8Array.from([0x26])), -7);
  assert.equal(decodeCbor(Uint8Array.from([0x39, 0x01, 0x00])), -257);
  assert.equal(decodeCbor(text("none")), "none");
  assert.deepEqual(decodeCbor(Uint8Array.from([0x83, 1, 0xf5, 0xf6])), [
    1,
    true,
    null,
  ]);
  const map = decodeCbor(Uint8Array.from([0xa1, 0x01, 0xf4]));
  assert.ok(map instanceof Map);
  assert.equal(map.get(1), false);
});

test("CBOR: what WebAuthn never sends is refused", () => {
  // Indefinite length, a float, a tag, trailing bytes, a cut string.
  for (const data of [
    [0x5f],
    [0xfa, 0, 0, 0, 0],
    [0xc0, 0],
    [0x01, 0x02],
    [0x43, 1],
  ]) {
    assert.throws(() => decodeCbor(Uint8Array.from(data)), CborError);
  }
});

test("the authData of a 'none' attestation object", () => {
  const data = authData(0x5d, ICLOUD);
  const object = concat(
    [0xa3],
    text("fmt"),
    text("none"),
    text("attStmt"),
    [0xa0],
    text("authData"),
    bytes(data),
  );
  const found = authDataFromAttestationObject(object);
  assert.deepEqual(found, data);

  const parsed = parseAuthenticatorData(found);
  assert.deepEqual(parsed, {
    up: true,
    uv: true,
    be: true,
    bs: true,
    signCount: 7,
    aaguid: "fbfc3007-154e-4ecc-8c0b-6e020557d7bd",
  });
  assert.equal(authenticatorName(parsed.aaguid), "iCloud Keychain");
});

test("flags of a device-bound passkey, and of a sign-in (no AAGUID)", () => {
  const created = parseAuthenticatorData(authData(0x45, new Uint8Array(16)));
  assert.equal(created.be, false);
  assert.equal(created.bs, false);
  assert.equal(created.aaguid, "00000000-0000-0000-0000-000000000000");
  assert.equal(authenticatorName(created.aaguid), undefined);

  const signIn = parseAuthenticatorData(authData(0x05));
  assert.equal(signIn.uv, true);
  assert.equal(signIn.aaguid, undefined);
});

test("authenticator data cut short is refused", () => {
  assert.throws(() => parseAuthenticatorData(new Uint8Array(36)));
  assert.throws(() => parseAuthenticatorData(authData(0x45).subarray(0, 37)));
  // AT is set, but the AAGUID is missing.
  assert.throws(() =>
    parseAuthenticatorData(concat(new Uint8Array(32), [0x45], [0, 0, 0, 0])),
  );
});
