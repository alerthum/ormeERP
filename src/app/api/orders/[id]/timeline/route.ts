import { fail, ok, requirePermission } from "@/app/api/_helpers";
import { getOrderTimeline } from "@/services/erp-read-service";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission(request, "orders:read");
    const { id } = await params;
    
    if (!id) return fail("Sipariş ID gerekli", 400);
    
    const timeline = await getOrderTimeline(id);
    return ok(timeline);
  } catch (error) {
    return fail(error);
  }
}
