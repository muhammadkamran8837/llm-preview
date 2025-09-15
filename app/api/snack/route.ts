// app/api/snack/route.ts
import { NextResponse } from "next/server";
import { put } from "@vercel/blob";

// Make sure Vercel doesn't cache this route
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const payload = await req.json(); // { name, sdkVersion, dependencies, files }

  const key = `snacks/${crypto.randomUUID()}.json`;
  const body = JSON.stringify(payload);

  const { url } = await put(key, body, {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    cacheControlMaxAge: 0, // <-- use this (not "cacheControl")
    token: process.env.BLOB_READ_WRITE_TOKEN, // set this env var on Vercel
    //tesssttttt
  });

  return NextResponse.json({ codeUrl: url });
}

export async function OPTIONS() {
  const res = new NextResponse(null, { status: 204 });
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return res;
}
