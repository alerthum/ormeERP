import { fail, ok, readJson, requirePermission } from "@/app/api/_helpers";
import { updateCustomerOrder, updateOrderStatus } from "@/services/erp-write-service";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission(request, "orders:write");
    const { id } = await params;
    const payload = await readJson(request);
    if (payload.customerName) return ok(await updateCustomerOrder(id, payload), 200);
    const status = typeof payload.status === "string" ? payload.status : "İptal";
    return ok(await updateOrderStatus(id, status), 200);
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission(request, "orders:write");
    const { id } = await params;
    return ok(await updateOrderStatus(id, "İptal"), 200);
  } catch (error) {
    return fail(error);
  }
}
