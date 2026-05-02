import { AppShell } from "@/components/app-shell";
import { Dashboard } from "@/components/dashboard";
import { PageHeader } from "@/components/ui/page-header";
import { ShoppingCart } from "lucide-react";

export default function Page() {
  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader eyebrow="Sipariş takip" title="Sipariş Takip Dashboard" description="Müşteri ve satıcı siparişlerinin üretim, termin ve açık kg görünümü." icon={ShoppingCart} />
        <Dashboard />
      </div>
    </AppShell>
  );
}
