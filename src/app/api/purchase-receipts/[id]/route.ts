import { fail, ok, requirePermission } from "@/app/api/_helpers";
import { cancelPurchaseReceipt, updatePurchaseReceipt } from "@/services/erp-write-service";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission(request, "purchases:write");
    const { id } = await params;
    return ok(await cancelPurchaseReceipt(id), 200);
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission(request, "purchases:write");
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    return ok(await updatePurchaseReceipt(id, body), 200);
  } catch (error) {
    return fail(error);
  }
}
