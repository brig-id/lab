/**
 * Which system and browser the measurement ran on, from the user agent
 * string, refined by User-Agent Client Hints where the browser has them
 * (Chromium): they tell Windows 11 from Windows 10 and give the real macOS
 * version, which the user agent string has frozen.
 */

export interface Hints {
  /** `navigator.userAgentData.platform`, e.g. "Windows". */
  platform?: string;
  /** High-entropy `platformVersion`, e.g. "15.0.0". */
  platformVersion?: string;
}

export interface Device {
  os: string;
  browser: string;
}

export function describeDevice(
  ua: string,
  hints: Hints = {},
  maxTouchPoints = 0,
): Device {
  return { os: system(ua, hints, maxTouchPoints), browser: browser(ua) };
}

export function deviceLabel(device: Device): string {
  return `${device.os} ${device.browser}`;
}

function system(ua: string, hints: Hints, maxTouchPoints: number): string {
  const major = hints.platformVersion?.split(".")[0];
  if (/iPhone/.test(ua)) return withVersion("iOS", iosVersion(ua));
  // iPadOS Safari presents itself as a Mac; a touch screen gives it away.
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1)) {
    return withVersion("iPadOS", iosVersion(ua) ?? safariVersion(ua));
  }
  if (/Android/.test(ua))
    return withVersion("Android", /Android (\d+(?:\.\d+)?)/.exec(ua)?.[1]);
  if (/CrOS/.test(ua)) return "ChromeOS";
  if (/Windows/.test(ua)) {
    // Client Hints: platformVersion 13 and above is Windows 11, 1 to 12 is
    // Windows 10 (0 is older still).
    if (hints.platform === "Windows" && major !== undefined) {
      const n = Number(major);
      if (n >= 13) return "Windows 11";
      if (n > 0) return "Windows 10";
      return "Windows (before 10)";
    }
    return "Windows";
  }
  if (/Macintosh|Mac OS X/.test(ua)) {
    if (hints.platform === "macOS" && hints.platformVersion) {
      return withVersion(
        "macOS",
        hints.platformVersion.split(".").slice(0, 2).join("."),
      );
    }
    return "macOS";
  }
  if (/Linux/.test(ua)) return "Linux";
  return "unknown system";
}

function browser(ua: string): string {
  const rules: [RegExp, string][] = [
    [/EdgiOS\/(\d+)/, "Edge"],
    [/Edg(?:A)?\/(\d+)/, "Edge"],
    [/OPR\/(\d+)/, "Opera"],
    [/SamsungBrowser\/(\d+)/, "Samsung Internet"],
    [/FxiOS\/(\d+)/, "Firefox"],
    [/Firefox\/(\d+)/, "Firefox"],
    [/CriOS\/(\d+)/, "Chrome"],
    [/Chrome\/(\d+)/, "Chrome"],
  ];
  for (const [pattern, name] of rules) {
    const match = pattern.exec(ua);
    if (match) return `${name} ${match[1]}`;
  }
  if (/Safari\//.test(ua)) return withVersion("Safari", safariVersion(ua));
  return "unknown browser";
}

function iosVersion(ua: string): string | undefined {
  return /OS (\d+)_(\d+)/.exec(ua)?.slice(1, 3).join(".");
}

function safariVersion(ua: string): string | undefined {
  return /Version\/(\d+(?:\.\d+)?)/.exec(ua)?.[1];
}

function withVersion(name: string, version: string | undefined): string {
  return version ? `${name} ${version}` : name;
}
