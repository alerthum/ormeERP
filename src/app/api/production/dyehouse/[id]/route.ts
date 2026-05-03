import { fail, ok, requirePermission } from "@/app/api/_helpers";
import { cancelDyehouseProduction } from "@/services/erp-write-service";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission(request, "production:write");
    const { id } = await params;
    return ok(await cancelDyehouseProduction(id), 200);
  } catch (error) {
    return fail(error);
  }
}
