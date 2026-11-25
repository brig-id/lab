/**
 * The PRF measurement page (public/prf/index.html). Everything lives in
 * this module's memory: the salt, the passkey's id, its PRF outputs, the
 * prototype's wrapped key. Nothing is sent and nothing is stored.
 */
import {
  type AuthenticatorData,
  authDataFromAttestationObject,
  authenticatorName,
  parseAuthenticatorData,
} from "./authdata.ts";
import {
  type Bytes,
  bytesOf,
  equalBytes,
  fingerprint,
  randomBytes,
  toBase64url,
} from "./bytes.ts";
import { describeDevice, deviceLabel, type Hints } from "./device.ts";
import { readPrf } from "./extension.ts";
import {
  decryptField,
  encryptField,
  keyWrappingKey,
  newDataKey,
  unwrapDataKey,
  wrapDataKey,
} from "./keys.ts";
import { formatResult, type Measurement } from "./result.ts";

const PASSKEY_NAME = "brig·id lab test";
const FIELD_NAME = "identity.label";

const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;

const state: {
  salt: Bytes;
  credentialId?: Bytes;
  /** The first PRF output seen, which later ones are compared with. */
  reference?: Bytes;
  stored?: { wrapped: Bytes; sealed: Bytes; value: string };
  m: Measurement;
} = {
  salt: randomBytes(32),
  m: { date: localDate(new Date()), device: "…" },
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function localDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function yesNo(el: HTMLElement, value: boolean | undefined, detail = "") {
  el.textContent = "";
  const word = document.createElement("span");
  word.className = value === undefined ? "quiet" : value ? "yes" : "no";
  word.textContent =
    value === undefined ? "not reported" : value ? "yes" : "no";
  el.append(word);
  if (detail) el.append(` ${detail}`);
}

function status(id: string, text: string, error = false) {
  const el = $(id);
  el.textContent = text;
  el.classList.toggle("error", error);
}

function errorName(error: unknown): string {
  if (error instanceof DOMException || error instanceof Error)
    return error.name;
  return "Error";
}

function errorText(error: unknown): string {
  const name = errorName(error);
  if (name === "NotAllowedError")
    return "Cancelled, timed out, or refused by the device.";
  if (name === "InvalidStateError")
    return "This authenticator already holds a passkey for this page.";
  return error instanceof Error ? `${name}: ${error.message}` : String(error);
}

function render() {
  $("result").textContent = formatResult(state.m);
}

async function describeOutput(output: Bytes | undefined): Promise<string> {
  return output
    ? `(${output.length} bytes, fingerprint ${await fingerprint(output)})`
    : "";
}

// -- this device -------------------------------------------------------------

async function detect() {
  $("rp").textContent = location.hostname;
  const nav = navigator as Navigator & {
    userAgentData?: {
      platform?: string;
      getHighEntropyValues?: (hints: string[]) => Promise<Hints>;
    };
  };
  let hints: Hints = { platform: nav.userAgentData?.platform };
  try {
    const high = await nav.userAgentData?.getHighEntropyValues?.([
      "platformVersion",
    ]);
    if (high) hints = { ...hints, platformVersion: high.platformVersion };
  } catch {
    // Client Hints are a refinement; the user agent string is enough.
  }
  state.m.device = deviceLabel(
    describeDevice(navigator.userAgent, hints, navigator.maxTouchPoints),
  );
  $("device").textContent = state.m.device;

  if (typeof PublicKeyCredential === "undefined" || !navigator.credentials) {
    $("unsupported").hidden = false;
    $<HTMLButtonElement>("create").disabled = true;
    yesNo($("capability"), undefined);
    render();
    return;
  }
  const pkc = PublicKeyCredential as unknown as {
    getClientCapabilities?: () => Promise<Record<string, boolean>>;
  };
  try {
    const caps = await pkc.getClientCapabilities?.();
    const prf = caps?.["extension:prf"];
    state.m.capability = prf;
    yesNo($("capability"), prf, caps ? "(getClientCapabilities)" : "");
    if (!caps)
      $("capability").textContent = "not reported (no getClientCapabilities)";
  } catch {
    $("capability").textContent = "not reported (getClientCapabilities failed)";
  }
  render();
}

// -- 1. create ---------------------------------------------------------------

async function create() {
  status("create-status", "Waiting for your device…");
  // The salt is new for each passkey, so that a second try starts over.
  state.salt = randomBytes(32);
  let credential: PublicKeyCredential;
  try {
    const created = await navigator.credentials.create({
      publicKey: {
        rp: { id: location.hostname, name: "brig·id lab" },
        user: {
          id: randomBytes(16),
          name: PASSKEY_NAME,
          displayName: PASSKEY_NAME,
        },
        challenge: randomBytes(32),
        pubKeyCredParams: [
          { type: "public-key", alg: -8 },
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        authenticatorSelection: {
          residentKey: "required",
          requireResidentKey: true,
          userVerification: "required",
        },
        attestation: "none",
        timeout: 120_000,
        extensions: {
          prf: { eval: { first: state.salt } },
        } as AuthenticationExtensionsClientInputs,
      },
    });
    if (!(created instanceof PublicKeyCredential))
      throw new Error("no credential was returned");
    credential = created;
  } catch (error) {
    state.m.create = { ok: false, error: errorName(error) };
    status("create-status", errorText(error), true);
    render();
    return;
  }

  const response = credential.response as AuthenticatorAttestationResponse;
  let data: AuthenticatorData | undefined;
  try {
    const raw =
      typeof response.getAuthenticatorData === "function"
        ? bytesOf(response.getAuthenticatorData())
        : authDataFromAttestationObject(bytesOf(response.attestationObject));
    data = parseAuthenticatorData(raw);
  } catch {
    data = undefined;
  }
  const prf = readPrf(credential.getClientExtensionResults());

  state.credentialId = bytesOf(credential.rawId);
  state.reference = prf.first;
  state.stored = undefined;
  const name = authenticatorName(data?.aaguid);
  state.m.authenticator = {
    name,
    aaguid: data?.aaguid,
    attachment: credential.authenticatorAttachment ?? undefined,
    eligible: data?.be,
    synced: data?.bs,
  };
  state.m.create = {
    ok: true,
    enabled: prf.enabled,
    output: prf.first !== undefined,
  };
  state.m.get = undefined;

  $("authenticator").textContent = data?.aaguid
    ? `${name ?? "unknown name"} · AAGUID ${data.aaguid}`
    : "AAGUID not available";
  $("attachment").textContent =
    credential.authenticatorAttachment ?? "not reported";
  yesNo(
    $("synced"),
    data?.bs,
    data?.be ? "(can be synced)" : data ? "(stays on this device)" : "",
  );
  yesNo($("create-enabled"), prf.enabled);
  yesNo(
    $("create-output"),
    prf.first !== undefined,
    await describeOutput(prf.first),
  );
  $("create-facts").hidden = false;
  $("get-facts").hidden = true;
  $("proto-facts").hidden = true;
  status("create-status", "Created. Now sign in with it.");
  status("get-status", "");
  status("proto-status", "");
  $<HTMLButtonElement>("get").disabled = false;
  $<HTMLButtonElement>("encrypt").disabled = state.reference === undefined;
  $<HTMLButtonElement>("decrypt").disabled = true;
  render();
}

// -- 2. get ------------------------------------------------------------------

/** Signs in with the test passkey and returns its PRF output, if any. */
async function signIn(): Promise<Bytes | undefined> {
  if (!state.credentialId) throw new Error("create a test passkey first");
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      rpId: location.hostname,
      allowCredentials: [{ type: "public-key", id: state.credentialId }],
      userVerification: "required",
      timeout: 120_000,
      extensions: {
        prf: { eval: { first: state.salt } },
      } as AuthenticationExtensionsClientInputs,
    },
  });
  if (!(assertion instanceof PublicKeyCredential))
    throw new Error("no credential was returned");
  return readPrf(assertion.getClientExtensionResults()).first;
}

async function get() {
  status("get-status", "Waiting for your device…");
  let output: Bytes | undefined;
  try {
    output = await signIn();
  } catch (error) {
    state.m.get = { ok: false, error: errorName(error) };
    status("get-status", errorText(error), true);
    render();
    return;
  }
  let stable: boolean | undefined;
  if (output && state.reference) stable = equalBytes(output, state.reference);
  else if (output) state.reference = output;
  state.m.get = { ok: true, output: output !== undefined, stable };

  yesNo($("get-output"), output !== undefined, await describeOutput(output));
  if (stable === undefined) {
    $("get-stable").textContent = output
      ? "nothing to compare with yet: sign in once more"
      : "nothing to compare";
  } else yesNo($("get-stable"), stable);
  $("get-facts").hidden = false;
  status("get-status", "Done. Copy the result below.");
  $<HTMLButtonElement>("encrypt").disabled = state.reference === undefined;
  render();
}

// -- result ------------------------------------------------------------------

async function copy() {
  const line = $("result").textContent ?? "";
  try {
    await navigator.clipboard.writeText(line);
    status("copy-status", "Copied.");
  } catch {
    // No clipboard access: select the line so that it can be copied by hand.
    const range = document.createRange();
    range.selectNodeContents($("result"));
    getSelection()?.removeAllRanges();
    getSelection()?.addRange(range);
    status("copy-status", "Selected: copy it by hand.");
  }
}

// -- prototype ---------------------------------------------------------------

async function encrypt() {
  if (!state.reference || !state.credentialId) return;
  const value = $<HTMLInputElement>("field").value;
  try {
    const wrappingKey = await keyWrappingKey(state.reference);
    const dataKey = await newDataKey();
    const wrapped = await wrapDataKey(dataKey, wrappingKey, state.credentialId);
    const sealed = await encryptField(dataKey, FIELD_NAME, value);
    // The data key goes out of scope here: only what a server would store
    // is kept.
    state.stored = { wrapped, sealed, value };
    $("wrapped").textContent =
      `${toBase64url(wrapped)} (${wrapped.length} bytes)`;
    $("sealed").textContent = `${toBase64url(sealed)} (${sealed.length} bytes)`;
    $("opened").textContent = "not yet";
    $("proto-facts").hidden = false;
    $<HTMLButtonElement>("decrypt").disabled = false;
    status(
      "proto-status",
      "Encrypted. The data key is forgotten; sign in to read the field back.",
    );
  } catch (error) {
    status("proto-status", errorText(error), true);
  }
}

async function decrypt() {
  if (!state.stored || !state.credentialId) return;
  status("proto-status", "Waiting for your device…");
  try {
    const output = await signIn();
    if (!output)
      throw new Error("the passkey gave no PRF output at this sign-in");
    const wrappingKey = await keyWrappingKey(output);
    const dataKey = await unwrapDataKey(
      state.stored.wrapped,
      wrappingKey,
      state.credentialId,
    );
    const value = await decryptField(dataKey, FIELD_NAME, state.stored.sealed);
    $("opened").textContent = "";
    const strong = document.createElement("strong");
    strong.textContent = value;
    $("opened").append(
      strong,
      value === state.stored.value ? " — the same as written" : " — different!",
    );
    status("proto-status", "Decrypted with a key only the passkey could give.");
  } catch (error) {
    // AES-GCM refuses a wrong key without saying more than OperationError.
    const text =
      errorName(error) === "OperationError"
        ? "The data key could not be unwrapped: the PRF output was not the same."
        : errorText(error);
    $("opened").textContent = "failed";
    status("proto-status", text, true);
  }
}

$("create").addEventListener("click", () => void create());
$("get").addEventListener("click", () => void get());
$("copy").addEventListener("click", () => void copy());
$("encrypt").addEventListener("click", () => void encrypt());
$("decrypt").addEventListener("click", () => void decrypt());
void detect();
