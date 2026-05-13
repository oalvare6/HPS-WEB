import { NextResponse } from "next/server";
import sharp from "sharp";
import { verifyAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { bufferMatchesImageMime } from "@/lib/tournament-api-validation";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024; // 5MB input
const MAX_OUTPUT_BYTES = 5 * 1024 * 1024;
const MAX_WIDTH = 1600;

export async function POST(request: Request) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Unsupported file type. Use JPG, PNG, or WebP." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large. Max 5MB." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  if (!bufferMatchesImageMime(buffer, file.type)) {
    return NextResponse.json({ error: "File content does not match declared image type." }, { status: 400 });
  }

  let webpBuffer: Buffer;
  try {
    webpBuffer = await sharp(buffer)
      .rotate()
      .resize({
        width: MAX_WIDTH,
        height: MAX_WIDTH,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer();
  } catch (e) {
    console.error("Tournament image sharp processing failed:", e);
    return NextResponse.json({ error: "Could not process image." }, { status: 400 });
  }

  if (!bufferMatchesImageMime(webpBuffer, "image/webp")) {
    return NextResponse.json({ error: "Could not process image." }, { status: 400 });
  }
  if (webpBuffer.length > MAX_OUTPUT_BYTES) {
    return NextResponse.json({ error: "Processed image still too large. Try a smaller source file." }, { status: 400 });
  }

  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;

  const { error: uploadErr } = await supabaseAdmin.storage
    .from("tournament-images")
    .upload(path, webpBuffer, { contentType: "image/webp", upsert: false });

  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  const { data } = supabaseAdmin.storage.from("tournament-images").getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl });
}
