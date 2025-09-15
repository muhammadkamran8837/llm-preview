import { NextResponse } from "next/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MEMORY = new Map<string, any>();

export async function POST(req: Request) {
  const body = await req.json();
  const id = crypto.randomUUID();
  MEMORY.set(id, body);
  return NextResponse.json({ id });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id") || "";
  const payload = MEMORY.get(id);
  if (!payload) return new NextResponse("Not found", { status: 404 });

  const res = NextResponse.json(payload);
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export async function OPTIONS() {
  const res = new NextResponse(null, { status: 204 });
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return res;
}
