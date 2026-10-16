import { gunzipSync } from "node:zlib";

/** Reads a (gzipped) NBT file into plain values; enough for scoreboard.dat. */
export function readNbt(file: Uint8Array): unknown {
  const bytes = file[0] === 0x1f && file[1] === 0x8b ? gunzipSync(file) : Buffer.from(file);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 0;

  /** Moves past `size` bytes and returns where they started. */
  const take = (size: number): number => {
    at += size;
    return at - size;
  };

  const string = (): string => {
    const length = view.getUint16(at);
    at += 2;
    const value = bytes.subarray(at, at + length).toString("utf8");
    at += length;
    return value;
  };

  const payload = (tag: number): unknown => {
    switch (tag) {
      case 1:
        return view.getInt8(at++);
      case 2:
        return view.getInt16(take(2));
      case 3:
        return view.getInt32(take(4));
      case 4:
        return Number(view.getBigInt64(take(8)));
      case 5:
        return view.getFloat32(take(4));
      case 6:
        return view.getFloat64(take(8));
      case 7:
      case 11:
      case 12: {
        const length = view.getInt32(at);
        at += 4;
        const size = tag === 7 ? 1 : tag === 11 ? 4 : 8;
        const values = Array.from({ length }, (_, i) =>
          size === 1 ? view.getInt8(at + i) : size === 4 ? view.getInt32(at + i * 4) : Number(view.getBigInt64(at + i * 8)),
        );
        at += length * size;
        return values;
      }
      case 8:
        return string();
      case 9: {
        const type = view.getUint8(at);
        const length = view.getInt32(at + 1);
        at += 5;
        return Array.from({ length }, () => payload(type));
      }
      case 10: {
        const out: Record<string, unknown> = {};
        for (;;) {
          const type = view.getUint8(at++);
          if (type === 0) return out;
          const name = string();
          out[name] = payload(type);
        }
      }
      default:
        throw new Error(`nbt tag ${tag}`);
    }
  };

  const root = view.getUint8(at++);
  string();
  return payload(root);
}
