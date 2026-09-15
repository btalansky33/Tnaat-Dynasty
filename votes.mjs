// Shared vote storage for the Prop Bets section.
// Uses Netlify Blobs — a free key/value store built into Netlify,
// so the whole league sees the same vote tallies, no database needed.
import { getStore } from "@netlify/blobs";

export default async (req) => {
  const store = getStore("tnaat-votes");
  const url = new URL(req.url);
  const cors = { "content-type": "application/json", "access-control-allow-origin": "*" };

  if (req.method === "GET") {
    const week = url.searchParams.get("week") || "current";
    const data = (await store.get(week, { type: "json" })) || {};
    return new Response(JSON.stringify(data), { headers: cors });
  }

  if (req.method === "POST") {
    let body;
    try { body = await req.json(); } catch { body = {}; }
    const { week, propId, option } = body;
    if (!week || !propId || (option !== "A" && option !== "B")) {
      return new Response(JSON.stringify({ error: "missing or invalid fields" }), { status: 400, headers: cors });
    }
    const data = (await store.get(week, { type: "json" })) || {};
    data[propId] = data[propId] || { A: 0, B: 0 };
    data[propId][option]++;
    await store.setJSON(week, data);
    return new Response(JSON.stringify(data[propId]), { headers: cors });
  }

  return new Response("Method not allowed", { status: 405, headers: cors });
};

export const config = { path: "/api/votes" };
