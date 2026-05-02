import { AppShell } from "@/components/app-shell";
import { StockDetailPage } from "@/components/pages";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AppShell><StockDetailPage id={id} /></AppShell>;
}
