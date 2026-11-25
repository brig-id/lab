/**
 * Just enough CBOR (RFC 8949) to read an attestation object: unsigned and
 * negative integers, byte and text strings, arrays, maps, and the simple
 * values false, true and null. Definite lengths only, which is what
 * WebAuthn produces (CTAP2 canonical CBOR). Anything else is refused.
 */

export type Cbor =
  number | Uint8Array | string | Cbor[] | Map<Cbor, Cbor> | boolean | null;

export class CborError extends Error {}

/** Decodes one item that must fill `data` exactly. */
export function decodeCbor(data: Uint8Array): Cbor {
  const [value, end] = decodeAt(data, 0);
  if (end !== data.length) {
    throw new CborError(`${data.length - end} bytes after the item`);
  }
  return value;
}

/** Decodes the item starting at `offset`; returns it and where it ends. */
export function decodeAt(data: Uint8Array, offset: number): [Cbor, number] {
  const first = byteAt(data, offset);
  const major = first >> 5;
  const info = first & 0x1f;
  let [length, at] = argument(data, offset + 1, info);

  switch (major) {
    case 0:
      return [length, at];
    case 1:
      return [-1 - length, at];
    case 2:
      return [take(data, at, length), at + length];
    case 3:
      return [
        new TextDecoder("utf-8", { fatal: true }).decode(
          take(data, at, length),
        ),
        at + length,
      ];
    case 4: {
      const items: Cbor[] = [];
      for (let i = 0; i < length; i++) {
        const [item, next] = decodeAt(data, at);
        items.push(item);
        at = next;
      }
      return [items, at];
    }
    case 5: {
      const map = new Map<Cbor, Cbor>();
      for (let i = 0; i < length; i++) {
        const [key, afterKey] = decodeAt(data, at);
        const [value, afterValue] = decodeAt(data, afterKey);
        map.set(key, value);
        at = afterValue;
      }
      return [map, at];
    }
    case 7:
      if (info === 20) return [false, offset + 1];
      if (info === 21) return [true, offset + 1];
      if (info === 22) return [null, offset + 1];
      throw new CborError(`simple value or float ${info} is not supported`);
    default:
      throw new CborError(`major type ${major} is not supported`);
  }
}

function argument(
  data: Uint8Array,
  at: number,
  info: number,
): [number, number] {
  if (info < 24) return [info, at];
  const size =
    info === 24 ? 1 : info === 25 ? 2 : info === 26 ? 4 : info === 27 ? 8 : 0;
  if (size === 0)
    throw new CborError(`indefinite or reserved length (${info})`);
  let value = 0;
  for (let i = 0; i < size; i++) value = value * 256 + byteAt(data, at + i);
  if (!Number.isSafeInteger(value)) throw new CborError("integer too large");
  return [value, at + size];
}

function byteAt(data: Uint8Array, at: number): number {
  const byte = data[at];
  if (byte === undefined) throw new CborError("unexpected end of data");
  return byte;
}

function take(data: Uint8Array, at: number, length: number): Uint8Array {
  if (at + length > data.length) throw new CborError("unexpected end of data");
  return data.subarray(at, at + length);
}
