/**
 * The moment a photograph was taken, from its EXIF `DateTimeOriginal`
 * (falling back to `DateTime`), read from the raw EXIF block sharp returns.
 * EXIF carries no time zone; the camera's local time is read in the
 * newsroom's zone by the caller. A small, bounded TIFF reader: unknown
 * layouts return null rather than guessing.
 */
export function exifCapturedAt(exif: Buffer | undefined | null): string | null {
  if (!exif || exif.length < 14) return null;
  let base = 0;
  if (exif.subarray(0, 6).toString("latin1") === "Exif\u0000\u0000") base = 6;
  const order = exif.subarray(base, base + 2).toString("latin1");
  const little = order === "II";
  if (!little && order !== "MM") return null;
  const u16 = (offset: number) => (offset + 2 <= exif.length ? (little ? exif.readUInt16LE(offset) : exif.readUInt16BE(offset)) : -1);
  const u32 = (offset: number) => (offset + 4 <= exif.length ? (little ? exif.readUInt32LE(offset) : exif.readUInt32BE(offset)) : -1);
  const readIfd = (offset: number): Map<number, number> => {
    const tags = new Map<number, number>();
    const count = u16(base + offset);
    if (count < 0 || count > 512) return tags;
    for (let index = 0; index < count; index++) {
      const entry = base + offset + 2 + index * 12;
      const tag = u16(entry);
      if (tag < 0) break;
      tags.set(tag, entry);
    }
    return tags;
  };
  const ascii = (entry: number) => {
    const length = u32(entry + 4);
    if (length < 19 || length > 64) return null;
    const at = base + u32(entry + 8);
    if (at < 0 || at + 19 > exif.length) return null;
    return exif.subarray(at, at + 19).toString("latin1");
  };
  const first = u32(base + 4);
  if (first < 0) return null;
  const ifd0 = readIfd(first);
  let value: string | null = null;
  const exifPointer = ifd0.get(0x8769);
  if (exifPointer !== undefined) {
    const sub = readIfd(u32(exifPointer + 8));
    const original = sub.get(0x9003);
    if (original !== undefined) value = ascii(original);
  }
  if (!value && ifd0.get(0x0132) !== undefined) value = ascii(ifd0.get(0x0132)!);
  const match = value && /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if (!match || match[1] === "0000") return null;
  return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}`;
}
