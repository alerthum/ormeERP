import { fail, ok, requirePermission } from "@/app/api/_helpers";
import { deleteDyehouseProduction, updateDyehouseProduction } from "@/services/erp-write-service";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission(request, "production:write");
    const { id } = await params;
    return ok(await deleteDyehouseProduction(id, user), 200);
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission(request, "production:write");
    const { id } = await params;
    const payload = await request.json();
    return ok(await updateDyehouseProduction(id, payload, user), 200);
  } catch (error) {
    return fail(error);
  }
}
