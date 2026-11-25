/**
 * The measurement as one line, to copy into the support table of
 * brig-id/spec#22. Each part says what was seen, or that it was not tried.
 */
import { ZERO_AAGUID } from "./authdata.ts";

export interface Measurement {
  /** YYYY-MM-DD. */
  date: string;
  device: string;
  /** `getClientCapabilities()["extension:prf"]`; undefined when unknown. */
  capability?: boolean;
  authenticator?: {
    name?: string;
    aaguid?: string;
    /** "platform" or "cross-platform", as the browser reported it. */
    attachment?: string;
    /** Backup eligible and backed up: a synced passkey. */
    eligible?: boolean;
    synced?: boolean;
  };
  create?: Outcome<{ enabled?: boolean; output: boolean }>;
  get?: Outcome<{ output: boolean; stable?: boolean }>;
}

export type Outcome<T> = ({ ok: true } & T) | { ok: false; error: string };

const word = (value: boolean | undefined) =>
  value === undefined ? "unknown" : value ? "yes" : "no";

export function formatResult(m: Measurement): string {
  const parts = [m.date, m.device];
  if (m.capability !== undefined)
    parts.push(`client prf ${word(m.capability)}`);
  if (m.authenticator) parts.push(authenticator(m.authenticator));

  if (!m.create) parts.push("create: not tried");
  else if (!m.create.ok) parts.push(`create: failed (${m.create.error})`);
  else
    parts.push(
      `create: prf enabled ${word(m.create.enabled)}, output ${word(m.create.output)}`,
    );

  if (!m.get) parts.push("get: not tried");
  else if (!m.get.ok) parts.push(`get: failed (${m.get.error})`);
  else {
    const stable = m.get.stable === undefined ? "n/a" : word(m.get.stable);
    parts.push(`get: output ${word(m.get.output)}, stable ${stable}`);
  }
  return parts.join(" · ");
}

function authenticator(a: NonNullable<Measurement["authenticator"]>): string {
  let id: string;
  if (a.aaguid === undefined) id = "aaguid unknown";
  else if (a.aaguid === ZERO_AAGUID) id = "aaguid zero";
  else id = `aaguid ${a.aaguid.slice(0, 8)}`;
  const text = [a.name ? `${a.name} (${id})` : id];
  if (a.attachment) text.push(a.attachment);
  if (a.synced) text.push("synced");
  else if (a.eligible) text.push("syncable");
  else if (a.eligible === false) text.push("device-bound");
  return text.join(", ");
}
