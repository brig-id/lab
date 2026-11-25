/**
 * The prototype of brig-id/spec#22 (security-model.md §7): a random data key
 * encrypts the fields that describe a person; it is stored wrapped by a key
 * derived from a passkey's PRF output, which the server never sees.
 *
 * Everything here is WebCrypto, in memory. The formats are a proposal for
 * the record, not a decision:
 *
 *   key wrapping key = HKDF-SHA-256(ikm = PRF output, salt = empty,
 *                                   info = WRAP_INFO) → AES-256-GCM
 *   wrapped data key = 0x00 ‖ iv (12) ‖ AES-GCM(raw data key, aad = credential id)
 *   encrypted field  = 0x00 ‖ iv (12) ‖ AES-GCM(UTF-8 value, aad = field name)
 *
 * The leading byte is a format version. Binding the wrapped key to the
 * credential id and a field to its name stops a server from swapping one
 * stored value for another without it failing to decrypt.
 */
import { type Bytes, concat, randomBytes } from "./bytes.ts";

export const WRAP_INFO = "brig·id lab · key wrapping key from PRF · v0";
const VERSION = 0;
const IV = 12;

/** The key that wraps the data key, from one passkey's PRF output. */
export async function keyWrappingKey(prfOutput: Bytes): Promise<CryptoKey> {
  if (prfOutput.length < 32) throw new Error("a PRF output is 32 bytes");
  const ikm = await crypto.subtle.importKey("raw", prfOutput, "HKDF", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: new TextEncoder().encode(WRAP_INFO),
    },
    ikm,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey"],
  );
}

/** A new data key. Extractable once, so that it can be wrapped. */
export function newDataKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]) as Promise<CryptoKey>;
}

export async function wrapDataKey(
  dataKey: CryptoKey,
  wrappingKey: CryptoKey,
  credentialId: Bytes,
): Promise<Bytes> {
  const iv = randomBytes(IV);
  const wrapped = await crypto.subtle.wrapKey("raw", dataKey, wrappingKey, {
    name: "AES-GCM",
    iv,
    additionalData: credentialId,
  });
  return concat([VERSION], iv, new Uint8Array(wrapped));
}

/** The data key back, no longer extractable. Throws if anything differs. */
export async function unwrapDataKey(
  wrapped: Bytes,
  wrappingKey: CryptoKey,
  credentialId: Bytes,
): Promise<CryptoKey> {
  const [iv, body] = split(wrapped);
  return crypto.subtle.unwrapKey(
    "raw",
    body,
    wrappingKey,
    { name: "AES-GCM", iv, additionalData: credentialId },
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptField(
  dataKey: CryptoKey,
  name: string,
  value: string,
): Promise<Bytes> {
  const iv = randomBytes(IV);
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(name) },
    dataKey,
    new TextEncoder().encode(value),
  );
  return concat([VERSION], iv, new Uint8Array(sealed));
}

export async function decryptField(
  dataKey: CryptoKey,
  name: string,
  sealed: Bytes,
): Promise<string> {
  const [iv, body] = split(sealed);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(name) },
    dataKey,
    body,
  );
  return new TextDecoder("utf-8", { fatal: true }).decode(plain);
}

function split(blob: Bytes): [Bytes, Bytes] {
  if (blob[0] !== VERSION) throw new Error(`unknown format version ${blob[0]}`);
  if (blob.length < 1 + IV + 16)
    throw new Error("too short to hold an AES-GCM tag");
  return [blob.subarray(1, 1 + IV), blob.subarray(1 + IV)];
}
