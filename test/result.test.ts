/**
 * The line a person copies after a measurement, and the device it names.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { equalBytes } from "../src/prf/bytes.ts";
import { describeDevice, deviceLabel } from "../src/prf/device.ts";
import { readPrf } from "../src/prf/extension.ts";
import { formatResult } from "../src/prf/result.ts";

const UA = {
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  ipad: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
  chromeIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1",
  windows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  edge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
  android:
    "Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  samsung:
    "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36",
  firefoxLinux:
    "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0",
  safariMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
};

const label = (ua: string, hints = {}, touch = 0) =>
  deviceLabel(describeDevice(ua, hints, touch));

test("systems and browsers, from the user agent and client hints", () => {
  assert.equal(label(UA.iphone), "iOS 18.1 Safari 18.1");
  assert.equal(label(UA.ipad, {}, 5), "iPadOS 18.1 Safari 18.1");
  assert.equal(label(UA.chromeIos), "iOS 17.6 Chrome 131");
  assert.equal(label(UA.windows), "Windows Chrome 131");
  assert.equal(
    label(UA.windows, { platform: "Windows", platformVersion: "15.0.0" }),
    "Windows 11 Chrome 131",
  );
  assert.equal(
    label(UA.edge, { platform: "Windows", platformVersion: "10.0.0" }),
    "Windows 10 Edge 131",
  );
  assert.equal(label(UA.android), "Android 14 Chrome 131");
  assert.equal(label(UA.samsung), "Android 14 Samsung Internet 26");
  assert.equal(label(UA.firefoxLinux), "Linux Firefox 133");
  assert.equal(label(UA.safariMac), "macOS Safari 18.1");
  assert.equal(
    label(UA.safariMac, { platform: "macOS", platformVersion: "15.1.0" }),
    "macOS 15.1 Safari 18.1",
  );
});

test("the PRF extension results, whatever their shape", () => {
  assert.deepEqual(readPrf({}), {});
  assert.deepEqual(readPrf(null), {});
  assert.deepEqual(readPrf({ prf: { enabled: true } }), { enabled: true });
  assert.deepEqual(readPrf({ prf: { enabled: "yes" } }), {});
  const out = new Uint8Array(32).fill(3);
  const read = readPrf({
    prf: { enabled: true, results: { first: out.buffer } },
  });
  assert.equal(read.enabled, true);
  assert.ok(read.first && equalBytes(read.first, out));
  // A copy: the browser's buffer can change without changing ours.
  out[0] = 9;
  assert.equal(read.first?.[0], 3);
  assert.deepEqual(
    readPrf({ prf: { results: { first: new ArrayBuffer(0) } } }),
    {},
  );
});

test("the line to copy", () => {
  assert.equal(
    formatResult({
      date: "2026-11-25",
      device: "iOS 18.1 Safari 18.1",
      capability: true,
      authenticator: {
        name: "iCloud Keychain",
        aaguid: "fbfc3007-154e-4ecc-8c0b-6e020557d7bd",
        attachment: "platform",
        eligible: true,
        synced: true,
      },
      create: { ok: true, enabled: true, output: false },
      get: { ok: true, output: true, stable: true },
    }),
    "2026-11-25 · iOS 18.1 Safari 18.1 · client prf yes · iCloud Keychain (aaguid fbfc3007), platform, synced · create: prf enabled yes, output no · get: output yes, stable yes",
  );
  assert.equal(
    formatResult({ date: "2026-11-25", device: "Linux Firefox 133" }),
    "2026-11-25 · Linux Firefox 133 · create: not tried · get: not tried",
  );
  assert.equal(
    formatResult({
      date: "2026-11-25",
      device: "Windows 10 Chrome 131",
      authenticator: {
        aaguid: "00000000-0000-0000-0000-000000000000",
        attachment: "cross-platform",
        eligible: false,
      },
      create: { ok: true, output: false },
      get: { ok: false, error: "NotAllowedError" },
    }),
    "2026-11-25 · Windows 10 Chrome 131 · aaguid zero, cross-platform, device-bound · create: prf enabled unknown, output no · get: failed (NotAllowedError)",
  );
});
