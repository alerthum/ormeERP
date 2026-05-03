import { fail, ok, requirePermission } from "@/app/api/_helpers";
import { cancelPurchaseOrder } from "@/services/erp-write-service";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission(request, "purchase:write");
    const { id } = await params;
    return ok(await cancelPurchaseOrder(id), 200);
  } catch (error) {
    return fail(error);
  }
}
