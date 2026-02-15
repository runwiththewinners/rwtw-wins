import { NextRequest, NextResponse } from "next/server";

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL!;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN!;

async function redisGet(key: string) {
  const res = await fetch(`${REDIS_URL}/get/${key}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    cache: "no-store",
  });
  const data = await res.json();
  return data.result;
}

async function redisSet(key: string, value: string) {
  const res = await fetch(`${REDIS_URL}/set/${key}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    body: value,
  });
  return res.ok;
}

export const dynamic = "force-dynamic";

// POST — upload a bet slip image, returns an image ID
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { imageBase64 } = body;

    if (!imageBase64) {
      return NextResponse.json({ error: "imageBase64 required" }, { status: 400 });
    }

    // Generate a unique image ID
    const imageId = "img_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

    // Store image in Redis with 90 day TTL
    const stored = await redisSet(`wins-image:${imageId}`, imageBase64);
    if (!stored) {
      return NextResponse.json({ error: "Failed to store image" }, { status: 500 });
    }

    // Set TTL of 90 days
    await fetch(`${REDIS_URL}/expire/wins-image:${imageId}/7776000`, {
      method: "POST",
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });

    return NextResponse.json({ imageId });
  } catch (e: any) {
    console.error("[UPLOAD] Error:", e);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

// GET — retrieve an image by ID
export async function GET(req: NextRequest) {
  const imageId = req.nextUrl.searchParams.get("id");
  if (!imageId) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  try {
    const imageBase64 = await redisGet(`wins-image:${imageId}`);
    if (!imageBase64) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }

    return NextResponse.json({ imageBase64 });
  } catch (e: any) {
    console.error("[UPLOAD] Get error:", e);
    return NextResponse.json({ error: "Failed to retrieve image" }, { status: 500 });
  }
}
