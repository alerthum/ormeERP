import { NextResponse } from "next/server";
import { getSettingsData } from "@/services/erp-read-service";

export async function GET() {
  try {
    const data = await getSettingsData();
    return NextResponse.json({
      ok: true,
      data,
    });
  } catch (error) {
    console.error("Settings Page API error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Ayar verileri alınamadı.",
      },
      { status: 500 },
    );
  }
}
