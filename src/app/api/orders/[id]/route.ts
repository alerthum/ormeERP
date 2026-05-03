import { fail, ok, readJson, requirePermission } from "@/app/api/_helpers";
import { updateOrderStatus } from "@/services/erp-write-service";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission(request, "orders:write");
    const { id } = await params;
    const payload = await readJson(request);
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
