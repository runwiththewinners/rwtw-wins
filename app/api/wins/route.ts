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

async function redisDel(key: string) {
  const res = await fetch(`${REDIS_URL}/del/${key}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
  return res.ok;
}

export const dynamic = "force-dynamic";

// GET — return all wins
export async function GET() {
  try {
    const indexRaw = await redisGet("wins:index");
    const ids: string[] = indexRaw ? JSON.parse(indexRaw) : [];

    const wins = [];
    for (const id of ids) {
      const raw = await redisGet(`wins:${id}`);
      if (raw) {
        wins.push(JSON.parse(raw));
      }
    }

    // Sort by date descending
    wins.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Calculate stats
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thisWeek = wins.filter((w) => new Date(w.createdAt) >= weekAgo);
    const totalWonThisWeek = thisWeek.reduce((sum, w) => sum + (parseFloat(w.amountWon) || 0), 0);
    const biggestWin = thisWeek.length > 0
      ? thisWeek.reduce((max, w) => (parseFloat(w.amountWon) || 0) > (parseFloat(max.amountWon) || 0) ? w : max, thisWeek[0])
      : null;

    return NextResponse.json({
      wins,
      stats: {
        totalWonThisWeek,
        winsPosted: wins.length,
        winsThisWeek: thisWeek.length,
        biggestWin,
      },
    });
  } catch (e: any) {
    console.error("[WINS] Get error:", e);
    return NextResponse.json({ wins: [], stats: {} });
  }
}

// POST — submit a win
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { imageId, channel, amountWon, comment, userName, userId, userTier } = body;

    if (!imageId || !channel || !amountWon) {
      return NextResponse.json({ error: "imageId, channel, and amountWon are required" }, { status: 400 });
    }

    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

    const win = {
      id,
      imageId,
      channel,
      amountWon: String(amountWon).replace(/[^0-9.]/g, ""),
      comment: comment || "",
      userName: userName || "Anonymous",
      userId: userId || "",
      userTier: userTier || "free",
      fires: 0,
      createdAt: new Date().toISOString(),
    };

    await redisSet(`wins:${id}`, JSON.stringify(win));

    // Update index
    const indexRaw = await redisGet("wins:index");
    const ids: string[] = indexRaw ? JSON.parse(indexRaw) : [];
    ids.push(id);
    await redisSet("wins:index", JSON.stringify(ids));

    return NextResponse.json({ success: true, win });
  } catch (e: any) {
    console.error("[WINS] Post error:", e);
    return NextResponse.json({ error: "Failed to post win" }, { status: 500 });
  }
}

// DELETE — admin delete a win
export async function DELETE(req: NextRequest) {
  const secret = req.headers.get("x-admin-secret");
  if (secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    // Get win to find imageId
    const raw = await redisGet(`wins:${id}`);
    if (raw) {
      const win = JSON.parse(raw);
      if (win.imageId) {
        await redisDel(`wins-image:${win.imageId}`);
      }
    }

    await redisDel(`wins:${id}`);

    const indexRaw = await redisGet("wins:index");
    const ids: string[] = indexRaw ? JSON.parse(indexRaw) : [];
    const newIds = ids.filter((i) => i !== id);
    await redisSet("wins:index", JSON.stringify(newIds));

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("[WINS] Delete error:", e);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}

// PUT — fire reaction
export async function PUT(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const raw = await redisGet(`wins:${id}`);
    if (!raw) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const win = JSON.parse(raw);
    win.fires = (win.fires || 0) + 1;
    await redisSet(`wins:${id}`, JSON.stringify(win));

    return NextResponse.json({ success: true, fires: win.fires });
  } catch (e: any) {
    console.error("[WINS] Fire error:", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
