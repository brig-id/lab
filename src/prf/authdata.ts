/**
 * The authenticator data of a WebAuthn response (WebAuthn Level 3, §6.1),
 * read only as far as the measurement needs: the flags, and the AAGUID that
 * says which kind of authenticator made the passkey.
 */
import { decodeCbor } from "./cbor.ts";

export interface AuthenticatorData {
  /** User present. */
  up: boolean;
  /** User verified. */
  uv: boolean;
  /** Backup eligible: the passkey can be synced to other devices. */
  be: boolean;
  /** Backed up: it is synced now. */
  bs: boolean;
  signCount: number;
  /** Present when the data carries a new credential (at creation). */
  aaguid?: string;
}

/** Minimum size: the hash of the rp id (32), the flags (1), the counter (4). */
const HEADER = 37;

export function parseAuthenticatorData(data: Uint8Array): AuthenticatorData {
  if (data.length < HEADER) {
    throw new Error(
      `authenticator data is ${data.length} bytes, less than ${HEADER}`,
    );
  }
  const flags = data[32] ?? 0;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const parsed: AuthenticatorData = {
    up: (flags & 0x01) !== 0,
    uv: (flags & 0x04) !== 0,
    be: (flags & 0x08) !== 0,
    bs: (flags & 0x10) !== 0,
    signCount: view.getUint32(33),
  };
  // AT: attested credential data follows, starting with the AAGUID.
  if ((flags & 0x40) !== 0) {
    if (data.length < HEADER + 16)
      throw new Error("attested credential data is cut short");
    parsed.aaguid = formatUuid(data.subarray(HEADER, HEADER + 16));
  }
  return parsed;
}

/** The `authData` member of an attestation object (a CBOR map). */
export function authDataFromAttestationObject(
  attestationObject: Uint8Array,
): Uint8Array {
  const decoded = decodeCbor(attestationObject);
  if (!(decoded instanceof Map))
    throw new Error("the attestation object is not a map");
  const authData = decoded.get("authData");
  if (!(authData instanceof Uint8Array))
    throw new Error("the attestation object has no authData");
  return authData;
}

export function formatUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const ZERO_AAGUID = "00000000-0000-0000-0000-000000000000";

/**
 * A few well-known AAGUIDs, from the community list
 * github.com/passkeydeveloper/passkey-authenticator-aaguids. Any other is
 * shown as it is, to be looked up there.
 */
const KNOWN: Record<string, string> = {
  "fbfc3007-154e-4ecc-8c0b-6e020557d7bd": "iCloud Keychain",
  "dd4ec289-e01d-41c9-bb89-70fa845d4bf2": "iCloud Keychain (managed)",
  "ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4": "Google Password Manager",
  "adce0002-35bc-c60a-648b-0b25f1f05503": "Chrome on Mac",
  "08987058-cadc-4b81-b6e1-30de50dcbe96": "Windows Hello",
  "9ddd1817-af5a-4672-a2b9-3e3dd95000a9": "Windows Hello",
  "6028b017-b1d4-4c02-b4b3-afcdafc96bb2": "Windows Hello",
  "bada5566-a7aa-401f-bd96-45619a55120d": "1Password",
  "d548826e-79b4-db40-a3d8-11116f7e8349": "Bitwarden",
  "531126d6-e717-415c-9320-3d9aa6981239": "Dashlane",
  "50726f74-6f6e-5061-7373-50726f746f6e": "Proton Pass",
  "b84e4048-15dc-4dd0-8640-f4f60813c8af": "NordPass",
  "0ea242b4-43c4-4a1b-8b17-dd6d0b6baec6": "Keeper",
  "53414d53-554e-4700-0000-000000000000": "Samsung Pass",
};

export function authenticatorName(
  aaguid: string | undefined,
): string | undefined {
  return aaguid === undefined ? undefined : KNOWN[aaguid];
}
