import { AppShell } from "@/components/app-shell";
import { Dashboard } from "@/components/dashboard";
import { PageHeader } from "@/components/ui/page-header";
import { LayoutDashboard } from "lucide-react";

export default function DashboardPage() {
  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader eyebrow="ERP Dashboard" title="Üretim Operasyon Paneli" description="Sipariş, parti, stok, satın alma ve fire performansını tek ekranda izleyin." icon={LayoutDashboard} />
        <Dashboard />
      </div>
    </AppShell>
  );
}
