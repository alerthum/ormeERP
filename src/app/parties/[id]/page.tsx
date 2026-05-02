import { AppShell } from "@/components/app-shell";
import { PartyDetailPage } from "@/components/pages";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AppShell><PartyDetailPage id={id} /></AppShell>;
}
