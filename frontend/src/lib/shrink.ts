"use client";

/** A photo made small enough to send before it is sent.
 *
 *  A phone photo is 3–8 MB, and the person uploading is often on mobile data
 *  at a ground. The server keeps 1600px anyway, so sending 2400px loses
 *  nothing and cuts the upload to a few hundred kilobytes. The server still
 *  decodes and re-encodes whatever arrives; this is about the wait, not trust.
 *
 *  Logos keep their transparency (PNG out) and are only shrunk when large.
 *  Anything the browser cannot decode is sent as it is, and the server says
 *  what is wrong with it.
 */
export async function shrink(file: File, kind: "photo" | "logo"): Promise<Blob> {
  const edge = kind === "photo" ? 2400 : 1024;
  if (kind === "logo" && file.size < 1_000_000) return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }
  const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 2_500_000) {
    bitmap.close();
    return file;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, kind === "photo" ? "image/jpeg" : "image/png", 0.9),
  );
  return blob ?? file;
}
