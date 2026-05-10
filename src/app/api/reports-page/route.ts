import { NextResponse } from "next/server";
import { getReportsPageData } from "@/services/erp-read-service";

export async function GET() {
  try {
    const data = await getReportsPageData();
    return NextResponse.json({
      ok: true,
      data,
    });
  } catch (error) {
    console.error("Reports Page API error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Rapor verileri alınamadı.",
      },
      { status: 500 },
    );
  }
}
