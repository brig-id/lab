/**
 * What a browser returns for the PRF extension
 * (`getClientExtensionResults().prf`, WebAuthn Level 3 §10.1.4), read
 * without trusting its shape: browsers differ in what they leave out.
 */
import { type Bytes, bytesOf } from "./bytes.ts";

export interface PrfResult {
  /** At creation only: whether the passkey can do PRF. */
  enabled?: boolean;
  /** The output for the first salt, when the authenticator gave one. */
  first?: Bytes;
}

export function readPrf(extensions: unknown): PrfResult {
  const prf = (extensions as { prf?: unknown } | null)?.prf;
  if (typeof prf !== "object" || prf === null) return {};
  const { enabled, results } = prf as {
    enabled?: unknown;
    results?: { first?: unknown };
  };
  const out: PrfResult = {};
  if (typeof enabled === "boolean") out.enabled = enabled;
  const first = results?.first;
  if (first instanceof ArrayBuffer || ArrayBuffer.isView(first)) {
    const bytes = bytesOf(first as BufferSource);
    if (bytes.length > 0) out.first = bytes;
  }
  return out;
}
