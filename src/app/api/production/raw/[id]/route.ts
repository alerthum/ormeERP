import { fail, ok, requirePermission } from "@/app/api/_helpers";
import { cancelRawProduction } from "@/services/erp-write-service";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission(request, "production:write");
    const { id } = await params;
    return ok(await cancelRawProduction(id), 200);
  } catch (error) {
    return fail(error);
  }
}
