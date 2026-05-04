const fs = require('fs');
const path = 'c:/Users/ibrahimyokus/Desktop/convert/Yokus Orme Erp Yazilimi/src/components/pages.tsx';
let content = fs.readFileSync(path, 'utf8');

function replaceFunc(name, newBody) {
    const startStr = 'export function ' + name;
    const startIdx = content.indexOf(startStr);
    if (startIdx === -1) {
        console.log('Could not find ' + startStr);
        return;
    }
    
    let depth = 0;
    let endIdx = -1;
    let foundFirstBrace = false;
    
    for (let i = startIdx; i < content.length; i++) {
        if (content[i] === '{') {
            depth++;
            foundFirstBrace = true;
        }
        if (content[i] === '}') {
            depth--;
            if (foundFirstBrace && depth === 0) {
                endIdx = i + 1;
                break;
            }
        }
    }
    
    if (endIdx !== -1) {
        content = content.substring(0, startIdx) + newBody + content.substring(endIdx);
        console.log('Replaced ' + name);
    } else {
        console.log('Could not find end of ' + name);
    }
}

const partyDetail = "export function PartyDetailPage({ id }: { id: string }) {\n" +
"  const { data } = useErpData();\n" +
"  const party = data.parties.find((item) => item.id === id);\n" +
"  if (!party) return <DataTable rows={[]} columns={[]} />;\n" +
"  const order = data.orders.find((item) => item.id === party.orderId);\n" +
"\n" +
"  const timeline = useMemo(() => {\n" +
"    const events: Array<{ date: string; title: string; description: string; tone: 'blue' | 'green' | 'amber' | 'red' }> = [\n" +
"      ...(party.timeline || [])\n" +
"    ];\n" +
"\n" +
"    data.productionRaw.filter(p => p.partyId === id).forEach(p => {\n" +
"      events.push({\n" +
"        date: p.date,\n" +
"        title: 'Ham Üretim',\n" +
"        description: formatKg(p.producedRawKg) + ' ham kumaş üretildi. ( %' + p.wastePercent + ' fire)',\n" +
"        tone: 'blue'\n" +
"      });\n" +
"    });\n" +
"\n" +
"    data.transfers.forEach(t => {\n" +
"      const partyItem = normalizeItems(t.items).find(it => it.partyId === id);\n" +
"      if (partyItem) {\n" +
"        events.push({\n" +
"          date: t.date,\n" +
"          title: 'Depo Transferi',\n" +
"          description: getName(data.warehouses, t.fromWarehouseId) + ' -> ' + getName(data.warehouses, t.toWarehouseId) + ' (' + formatKg(partyItem.quantity) + ' kg)',\n" +
"          tone: 'amber'\n" +
"        });\n" +
"      }\n" +
"    });\n" +
"\n" +
"    data.productionDyehouse.filter(p => p.partyId === id).forEach(p => {\n" +
"      events.push({\n" +
"        date: p.date,\n" +
"        title: 'Boyahane Üretimi',\n" +
"        description: formatKg(p.finishedKg) + ' mamül kumaş girişi yapıldı. ( %' + p.wastePercent + ' fire)',\n" +
"        tone: 'green'\n" +
"      });\n" +
"    });\n" +
"\n" +
"    data.sales.filter(s => s.partyId === id && s.status !== 'İptal').forEach(s => {\n" +
"      events.push({\n" +
"        date: s.date,\n" +
"        title: 'Sevkiyat / Satış',\n" +
"        description: s.customerName + ' müşterisine ' + formatKg(s.quantityKg) + ' kg sevk edildi.',\n" +
"        tone: 'amber'\n" +
"      });\n" +
"    });\n" +
"\n" +
"    return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());\n" +
"  }, [data, id, party.timeline]);\n" +
"\n" +
"  return (\n" +
"    <div className='space-y-6'>\n" +
"      <PageHeader eyebrow={'Parti ' + party.partyNo} title={order?.customerName ?? 'Parti detayı'} description='Sipariş, iplik tüketimi, fasoncu, boyahane, satış ve kalan kg zinciri.' icon={Factory} action={<StatusBadge tone={statusTone(party.status)}>{party.status}</StatusBadge>} />\n" +
"      <div className='grid gap-4 md:grid-cols-4'>\n" +
"        <StatCard title='Ham üretim' value={formatKg(party.rawProducedKg)} helper={formatKg(party.rawConsumedKg) + ' iplik tüketildi'} icon={Factory} />\n" +
"        <StatCard title='Ham fire' value={formatPercent(party.rawWastePercent)} helper={formatKg(party.rawWasteKg)} icon={BarChart3} tone='red' />\n" +
"        <StatCard title='Boyahane giriş' value={formatKg(party.dyehouseInputKg)} helper='Ham kumaş sevki' icon={Truck} tone='amber' />\n" +
"        <StatCard title='Mamül' value={formatKg(party.finishedKg)} helper={formatPercent(party.dyehouseWastePercent) + ' boyahane fire'} icon={Boxes} tone='green' />\n" +
"      </div>\n" +
"      <PartyTimeline items={timeline} />\n" +
"    </div>\n" +
"  );\n" +
"}";

replaceFunc('PartyDetailPage', partyDetail);

fs.writeFileSync(path, content, 'utf8');
console.log('Update finished');
