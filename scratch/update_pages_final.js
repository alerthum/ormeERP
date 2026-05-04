const fs = require('fs');
const path = 'c:/Users/ibrahimyokus/Desktop/convert/Yokus Orme Erp Yazilimi/src/components/pages.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Update PartyDetailPage for dynamic timeline
const oldPartyDetail = `export function PartyDetailPage({ id }: { id: string }) {
  const { data } = useErpData();
  const party = data.parties.find((item) => item.id === id);
  if (!party) return <DataTable rows={[]} columns={[]} />;
  const order = data.orders.find((item) => item.id === party.orderId);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={\`Parti \${party.partyNo}\`} title={order?.customerName ?? "Parti detayı"} description="Sipariş, iplik tüketimi, fasoncu, boyahane, satış ve kalan kg zinciri." icon={Factory} action={<StatusBadge tone={statusTone(party.status)}>{party.status}</StatusBadge>} />
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard title="Ham üretim" value={formatKg(party.rawProducedKg)} helper={\`\${formatKg(party.rawConsumedKg)} iplik tüketildi\`} icon={Factory} />
        <StatCard title="Ham fire" value={formatPercent(party.rawWastePercent)} helper={formatKg(party.rawWasteKg)} icon={BarChart3} tone="red" />
        <StatCard title="Boyahane giriş" value={formatKg(party.dyehouseInputKg)} helper="Ham kumaş sevki" icon={Truck} tone="amber" />
        <StatCard title="Mamül" value={formatKg(party.finishedKg)} helper={\`\${formatPercent(party.dyehouseWastePercent)} boyahane fire\`} icon={Boxes} tone="green" />
      </div>
      <PartyTimeline items={party?.timeline ?? []} />
    </div>
  );
}`;

const newPartyDetail = `export function PartyDetailPage({ id }: { id: string }) {
  const { data } = useErpData();
  const party = data.parties.find((item) => item.id === id);
  if (!party) return <DataTable rows={[]} columns={[]} />;
  const order = data.orders.find((item) => item.id === party.orderId);

  // Dynamic Timeline Calculation
  const timeline = useMemo(() => {
    const events: Array<{ date: string; title: string; description: string; tone: "blue" | "green" | "amber" | "red" }> = [
      ...(party.timeline || [])
    ];

    // 1. Raw Productions
    data.productionRaw.filter(p => p.partyId === id).forEach(p => {
      events.push({
        date: p.date,
        title: "Ham Üretim",
        description: \`\${formatKg(p.producedRawKg)} ham kumaş üretildi. (\${formatPercent(p.wastePercent)} fire)\`,
        tone: "blue"
      });
    });

    // 2. Transfers
    data.transfers.forEach(t => {
      const partyItem = normalizeItems(t.items).find(it => it.partyId === id);
      if (partyItem) {
        events.push({
          date: t.date,
          title: "Depo Transferi",
          description: \`\${getName(data.warehouses, t.fromWarehouseId)} -> \${getName(data.warehouses, t.toWarehouseId)} (\${formatKg(partyItem.quantity)} kg)\`,
          tone: "amber"
        });
      }
    });

    // 3. Dyehouse Productions
    data.productionDyehouse.filter(p => p.partyId === id).forEach(p => {
      events.push({
        date: p.date,
        title: "Boyahane Üretimi",
        description: \`\${formatKg(p.finishedKg)} mamül kumaş girişi yapıldı. (\${formatPercent(p.wastePercent)} fire)\`,
        tone: "green"
      });
    });

    // 4. Sales
    data.sales.filter(s => s.partyId === id && s.status !== "İptal").forEach(s => {
      events.push({
        date: s.date,
        title: "Sevkiyat / Satış",
        description: \`\${s.customerName} müşterisine \${formatKg(s.quantityKg)} kg sevk edildi.\`,
        tone: "amber"
      });
    });

    return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [data, id, party.timeline]);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={\`Parti \${party.partyNo}\`} title={order?.customerName ?? "Parti detayı"} description="Sipariş, iplik tüketimi, fasoncu, boyahane, satış ve kalan kg zinciri." icon={Factory} action={<StatusBadge tone={statusTone(party.status)}>{party.status}</StatusBadge>} />
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard title="Ham üretim" value={formatKg(party.rawProducedKg)} helper={\`\${formatKg(party.rawConsumedKg)} iplik tüketildi\`} icon={Factory} />
        <StatCard title="Ham fire" value={formatPercent(party.rawWastePercent)} helper={formatKg(party.rawWasteKg)} icon={BarChart3} tone="red" />
        <StatCard title="Boyahane giriş" value={formatKg(party.dyehouseInputKg)} helper="Ham kumaş sevki" icon={Truck} tone="amber" />
        <StatCard title="Mamül" value={formatKg(party.finishedKg)} helper={\`\${formatPercent(party.dyehouseWastePercent)} boyahane fire\`} icon={Boxes} tone="green" />
      </div>
      <PartyTimeline items={timeline} />
    </div>
  );
}`;

content = content.replace(oldPartyDetail, newPartyDetail);

// 2. Overhaul WasteAnalysisPage
const oldWasteAnalysis = `export function WasteAnalysisPage() {
  const { data } = useErpData();
  const metrics = getDashboardMetrics(data);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Fire" title="Fire Analizi Dashboard" description="Sipariş, parti, fasoncu, kumaş cinsi ve dönem bazlı beklenen/gerçek fire takibi." icon={BarChart3} />
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard title="Ham fire ort." value={formatPercent(metrics.avgRawWaste)} helper="0-3 yeşil, 12+ kritik" icon={BarChart3} tone="red" />
        <StatCard title="Boyahane fire ort." value={formatPercent(metrics.avgDyeWaste)} helper="Gönderilen ham kg bazlı" icon={BarChart3} tone="amber" />
        <StatCard title="Fire kg" value={formatKg(metrics.wasteKg)} helper="Ham + boyahane" icon={Factory} tone="red" />
        <StatCard title="Riskli fasoncu" value="2" helper="Eşik üstü üretim ortağı" icon={Users} tone="amber" />
      </div>
      <DataTable rows={data.parties} columns={[
        { header: "Parti", cell: (row) => row.partyNo },
        { header: "Ham fire kg", cell: (row) => formatKg(row.rawWasteKg) },
        { header: "Ham fire %", cell: (row) => <StatusBadge tone={wasteTone(row.rawWastePercent)}>{formatPercent(row.rawWastePercent)}</StatusBadge> },
        { header: "Boya fire kg", cell: (row) => formatKg(row.dyehouseWasteKg) },
        { header: "Boya fire %", cell: (row) => <StatusBadge tone={wasteTone(row.dyehouseWastePercent)}>{formatPercent(row.dyehouseWastePercent)}</StatusBadge> },
      ]} />
    </div>
  );
}`;

const newWasteAnalysis = `export function WasteAnalysisPage() {
  const { data } = useErpData();
  const [filters, setFilters] = useState({ customer: "", stockType: "ALL", dateFrom: "", dateTo: "" });
  const metrics = getDashboardMetrics(data);

  const groupedRows = useMemo(() => {
    const result: Array<{
      orderId: string;
      orderNo: string;
      customerName: string;
      totalConsumedKg: number;
      totalRawKg: number;
      totalDyeInputKg: number;
      totalFinishedKg: number;
      totalRawWasteKg: number;
      totalDyeWasteKg: number;
      avgRawWastePercent: number;
      avgDyeWastePercent: number;
      parties: any[];
    }> = [];

    data.orders.forEach(order => {
      const orderParties = data.parties.filter(p => p.orderId === order.id);
      if (orderParties.length === 0) return;

      const consumed = orderParties.reduce((s, p) => s + p.rawConsumedKg, 0);
      const raw = orderParties.reduce((s, p) => s + p.rawProducedKg, 0);
      const dyeInput = orderParties.reduce((s, p) => s + p.dyehouseInputKg, 0);
      const finished = orderParties.reduce((s, p) => s + p.finishedKg, 0);
      const rawWaste = orderParties.reduce((s, p) => s + p.rawWasteKg, 0);
      const dyeWaste = orderParties.reduce((s, p) => s + p.dyehouseWasteKg, 0);

      result.push({
        orderId: order.id,
        orderNo: order.orderNo,
        customerName: order.customerName,
        totalConsumedKg: consumed,
        totalRawKg: raw,
        totalDyeInputKg: dyeInput,
        totalFinishedKg: finished,
        totalRawWasteKg: rawWaste,
        totalDyeWasteKg: dyeWaste,
        avgRawWastePercent: consumed > 0 ? (rawWaste / consumed) * 100 : 0,
        avgDyeWastePercent: dyeInput > 0 ? (dyeWaste / dyeInput) * 100 : 0,
        parties: orderParties
      });
    });

    return result.filter(r => {
        if (filters.customer && !r.customerName.toLowerCase().includes(filters.customer.toLowerCase())) return false;
        return true;
    });
  }, [data, filters]);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Fire" title="Fire Analizi Dashboard" description="Sipariş bazlı toplam üretim, tüketim ve fire oranları." icon={BarChart3} />
      
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard title="Ham fire ort." value={formatPercent(metrics.avgRawWaste)} helper="Tüm üretimler toplamı" icon={BarChart3} tone="red" />
        <StatCard title="Boyahane fire ort." value={formatPercent(metrics.avgDyeWaste)} helper="Tüm boyahaneler toplamı" icon={BarChart3} tone="amber" />
        <StatCard title="Toplam Fire kg" value={formatKg(metrics.wasteKg)} helper="Ham + Boyahane" icon={Factory} tone="red" />
        <StatCard title="Toplam Üretim" value={formatKg(metrics.monthlyProductionKg)} helper="Ham + Mamül" icon={Boxes} tone="blue" />
      </div>

      <div className="premium-card rounded-2xl p-5 mb-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
           <h2 className="font-semibold text-slate-950">Analiz Filtreleri</h2>
           <button className="text-xs font-bold text-slate-400 uppercase tracking-wider" onClick={() => setFilters({ customer: "", stockType: "ALL", dateFrom: "", dateTo: "" })}>Sıfırla</button>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
            <input className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-blue-500" placeholder="Müşteri ara..." value={filters.customer} onChange={e => setFilters({...filters, customer: e.target.value})} />
        </div>
      </div>

      <div className="space-y-4">
        {groupedRows.map(row => (
            <div key={row.orderId} className="premium-card rounded-3xl overflow-hidden border border-slate-100 shadow-sm">
                <div className="bg-slate-50/50 p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-[0.15em] mb-1">Sipariş: {row.orderNo}</h3>
                        <div className="text-lg font-bold text-slate-950">{row.customerName}</div>
                    </div>
                    <div className="flex gap-6">
                        <div className="text-right">
                            <div className="text-[10px] font-bold text-slate-400 uppercase">Toplam Tüketim</div>
                            <div className="font-bold text-slate-900">{formatKg(row.totalConsumedKg)}</div>
                        </div>
                        <div className="text-right">
                            <div className="text-[10px] font-bold text-slate-400 uppercase">Ham Fire</div>
                            <div className="font-bold text-rose-600">{formatPercent(row.avgRawWastePercent)}</div>
                        </div>
                        <div className="text-right">
                            <div className="text-[10px] font-bold text-slate-400 uppercase">Boya Fire</div>
                            <div className="font-bold text-amber-600">{formatPercent(row.avgDyeWastePercent)}</div>
                        </div>
                    </div>
                </div>
                <div className="p-2">
                    <DataTable 
                        rows={row.parties} 
                        columns={[
                            { header: "Parti No", cell: (p) => <Link className="font-bold text-blue-600" href={\`/parties/\${p.id}\`}>{p.partyNo}</Link> },
                            { header: "Tüketim", cell: (p) => formatKg(p.rawConsumedKg) },
                            { header: "Ham Üretim", cell: (p) => formatKg(p.rawProducedKg) },
                            { header: "Ham Fire %", cell: (p) => <StatusBadge tone={wasteTone(p.rawWastePercent)}>{formatPercent(p.rawWastePercent)}</StatusBadge> },
                            { header: "Boyahane Giriş", cell: (p) => formatKg(p.dyehouseInputKg) },
                            { header: "Mamül Giriş", cell: (p) => formatKg(p.finishedKg) },
                            { header: "Boya Fire %", cell: (p) => <StatusBadge tone={wasteTone(p.dyehouseWastePercent)}>{formatPercent(p.dyehouseWastePercent)}</StatusBadge> },
                        ]} 
                    />
                </div>
            </div>
        ))}
      </div>
    </div>
  );
}`;

content = content.replace(oldWasteAnalysis, newWasteAnalysis);

fs.writeFileSync(path, content, 'utf8');
console.log('Party detail and waste analysis updated');
