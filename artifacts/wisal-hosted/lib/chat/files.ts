const enc = new TextDecoder("utf-8", { fatal: true });
export const MAX_FILE_SIZE = 20 * 1024 * 1024;
export function inspectFile(
  bytes: Uint8Array,
  requestedMime: string,
  filename: string,
) {
  if (!bytes.length || bytes.length > MAX_FILE_SIZE)
    throw new Error("الحد الأقصى للملف 20 ميجابايت.");
  if (
    /\.(exe|msi|dll|bat|cmd|ps1|sh|html?|svg|js|mjs|php|jar|scr|com|vbs|zip|rar|7z)$/i.test(
      filename,
    )
  )
    throw new Error("نوع الملف غير مسموح.");
  const starts = (...values: number[]) =>
    values.every((v, i) => bytes[i] === v);
  const ascii = (a: number, b: number) =>
    String.fromCharCode(...bytes.subarray(a, b));
  let mime = "";
  if (
    starts(137, 80, 78, 71, 13, 10, 26, 10) &&
    bytes.length > 24 &&
    ascii(12, 16) === "IHDR"
  ) {
    const dimensions = new DataView(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength,
    );
    if (dimensions.getUint32(16) > 10000 || dimensions.getUint32(20) > 10000)
      throw new Error("أبعاد الصورة أكبر من المسموح.");
    mime = "image/png";
  } else if (
    starts(255, 216, 255) &&
    bytes.at(-2) === 255 &&
    bytes.at(-1) === 217
  )
    mime = "image/jpeg";
  else if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP")
    mime = "image/webp";
  else if (/^GIF8[79]a$/.test(ascii(0, 6))) mime = "image/gif";
  else if (ascii(4, 8) === "ftyp" && bytes.length > 24)
    mime = requestedMime.startsWith("audio/") ? "audio/mp4" : "video/mp4";
  else if (
    starts(26, 69, 223, 163) &&
    ascii(0, Math.min(bytes.length, 300)).includes("webm")
  )
    mime = requestedMime.startsWith("audio/") ? "audio/webm" : "video/webm";
  else if (ascii(0, 4) === "OggS") mime = "audio/ogg";
  else if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE")
    mime = "audio/wav";
  else if (
    ascii(0, 3) === "ID3" ||
    (bytes[0] === 255 && (bytes[1] & 224) === 224)
  )
    mime = "audio/mpeg";
  else if (ascii(0, 5) === "%PDF-") mime = "application/pdf";
  else if (requestedMime === "text/plain" && bytes.length <= 1024 * 1024) {
    let value = "";
    try {
      value = enc.decode(bytes);
    } catch {
      throw new Error("ملف نصي غير صالح.");
    }
    if (
      /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value) ||
      /EICAR-STANDARD-ANTIVIRUS-TEST-FILE/.test(value)
    )
      throw new Error("تم رفض محتوى الملف.");
    mime = "text/plain";
  }
  if (!mime) throw new Error("الملف غير مدعوم أو لا يتطابق محتواه مع نوعه.");
  if (
    requestedMime !== "application/octet-stream" &&
    requestedMime.split(";")[0] !== mime
  )
    throw new Error("محتوى الملف لا يتطابق مع نوعه.");
  return mime;
}
