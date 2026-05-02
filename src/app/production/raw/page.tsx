import { AppShell } from "@/components/app-shell";
import { ProductionPage } from "@/components/pages";

export default function Page() {
  return <AppShell><ProductionPage type="raw" /></AppShell>;
}
