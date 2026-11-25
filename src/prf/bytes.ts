/** Small helpers over bytes, shared by the page and the tests. */

export type Bytes = Uint8Array<ArrayBuffer>;

export function randomBytes(length: number): Bytes {
  return crypto.getRandomValues(new Uint8Array(length));
}

export function concat(...parts: ArrayLike<number>[]): Bytes {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** Same length and same bytes. Not constant-time: both values are local. */
export function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}

export function toBase64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** A short name for a secret that does not reveal it: the start of its SHA-256. */
export async function fingerprint(secret: Bytes): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", secret));
  return toHex(digest.subarray(0, 4));
}

/** Copies whatever a WebAuthn result holds into bytes of our own. */
export function bytesOf(source: BufferSource): Bytes {
  return ArrayBuffer.isView(source)
    ? new Uint8Array(
        source.buffer.slice(
          source.byteOffset,
          source.byteOffset + source.byteLength,
        ) as ArrayBuffer,
      )
    : new Uint8Array(source.slice(0));
}
