const fs = require('fs');
const path = 'c:/Users/ibrahimyokus/Desktop/convert/Yokus Orme Erp Yazilimi/src/components/pages.tsx';
let content = fs.readFileSync(path, 'utf8');

// Update Parties list
const oldParties = `DataTable rows={productionRows} columns={[
        { header: "Parti", cell: (row) => row.partyNo },
        { header: "Müşteri", cell: (row) => row.customerName },
        { header: "Ham kg", cell: (row) => formatKg(row.rawKg) },
        { header: "Mamül kg", cell: (row) => formatKg(row.finishedKg) },
        { header: "Ham fire", cell: (row) => <StatusBadge tone={wasteTone(row.rawWaste)}>{formatPercent(row.rawWaste)}</StatusBadge> },
        { header: "Boya fire", cell: (row) => <StatusBadge tone={wasteTone(row.dyeWaste)}>{formatPercent(row.dyeWaste)}</StatusBadge> },
        { header: "Durum", cell: (row) => <StatusBadge tone={statusTone(row.status)}>{row.status}</StatusBadge> },
      ]} />`;

const newParties = `DataTable rows={productionRows} columns={[
        { header: "Parti", cell: (row) => row.partyNo },
        { header: "Müşteri", cell: (row) => row.customerName },
        { header: "En", cell: (row) => row.finishWidth || row.rawWidth || "-" },
        { header: "Gramaj", cell: (row) => row.finishGsm || row.rawGsm || "-" },
        { header: "Ham kg", cell: (row) => formatKg(row.rawKg) },
        { header: "Mamül kg", cell: (row) => formatKg(row.finishedKg) },
        { header: "Ham fire", cell: (row) => <StatusBadge tone={wasteTone(row.rawWaste)}>{formatPercent(row.rawWaste)}</StatusBadge> },
        { header: "Boya fire", cell: (row) => <StatusBadge tone={wasteTone(row.dyeWaste)}>{formatPercent(row.dyeWaste)}</StatusBadge> },
        { header: "Durum", cell: (row) => <StatusBadge tone={statusTone(row.status)}>{row.status}</StatusBadge> },
      ]} />`;

// Use simple replacement (no regex needed if we use exact string from view_file)
content = content.replace(oldParties, newParties);

fs.writeFileSync(path, content, 'utf8');
console.log('Parties update complete');
