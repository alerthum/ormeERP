import { NextResponse } from "next/server";

export async function readJson(request: Request) {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function ok(data: unknown, status = 201) {
  return NextResponse.json({ ok: true, data }, { status });
}

export function fail(error: unknown, status = 400) {
  const message = error instanceof Error ? error.message : "Beklenmeyen bir hata oluştu.";
  return NextResponse.json({ ok: false, error: message }, { status });
}
