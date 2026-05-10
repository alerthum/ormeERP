import { NextResponse } from "next/server";
import { getDashboardData } from "@/services/erp-read-service";

export async function GET() {
  try {
    const data = await getDashboardData();
    return NextResponse.json({
      ok: true,
      data,
    });
  } catch (error) {
    console.error("Dashboard API error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Dashboard verileri alınamadı.",
      },
      { status: 500 },
    );
  }
}
