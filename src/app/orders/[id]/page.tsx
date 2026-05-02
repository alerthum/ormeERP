import { AppShell } from "@/components/app-shell";
import { OrderDetailPage } from "@/components/pages";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AppShell><OrderDetailPage id={id} /></AppShell>;
}
