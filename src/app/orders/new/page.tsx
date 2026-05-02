import { AppShell } from "@/components/app-shell";
import { OrderForm } from "@/components/forms";
import { PageHeader } from "@/components/ui/page-header";
import { ShoppingCart } from "lucide-react";

export default function Page() {
  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader eyebrow="Yeni sipariş" title="Müşteri Siparişi Oluştur" description="Sipariş kaydında YM/MM stok kartları özelliklere göre otomatik eşleştirilir veya açılır." icon={ShoppingCart} />
        <div className="premium-card rounded-2xl p-5"><OrderForm /></div>
      </div>
    </AppShell>
  );
}
