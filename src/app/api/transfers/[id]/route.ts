import { fail, ok, requirePermission } from "@/app/api/_helpers";
import { deleteTransfer } from "@/services/erp-write-service";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission(request, "stocks:write");
    const { id } = await params;
    return ok(await deleteTransfer(id), 200);
  } catch (error) {
    return fail(error);
  }
}
