import { fail, ok, readJson, requirePermission } from "@/app/api/_helpers";
import { deleteCustomerOrder, updateCustomerOrder, updateOrderStatus } from "@/services/erp-write-service";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission(request, "orders:write");
    const { id } = await params;
    const payload = await readJson(request);
    if (payload.customerName) return ok(await updateCustomerOrder(id, payload, user), 200);
    const status = typeof payload.status === "string" ? payload.status : "İptal";
    return ok(await updateOrderStatus(id, status, user), 200);
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission(request, "orders:write");
    const { id } = await params;
    return ok(await deleteCustomerOrder(id, user), 200);
  } catch (error) {
    return fail(error);
  }
}
