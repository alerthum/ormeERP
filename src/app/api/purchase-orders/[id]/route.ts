import { fail, ok, readJson, requirePermission } from "@/app/api/_helpers";
import { deletePurchaseOrder, updatePurchaseOrder } from "@/services/erp-write-service";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission(request, "purchase:write");
    const { id } = await params;
    return ok(await updatePurchaseOrder(id, await readJson(request), user), 200);
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission(request, "purchase:write");
    const { id } = await params;
    return ok(await deletePurchaseOrder(id, user), 200);
  } catch (error) {
    return fail(error);
  }
}
