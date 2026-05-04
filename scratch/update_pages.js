const fs = require('fs');
const path = 'c:/Users/ibrahimyokus/Desktop/convert/Yokus Orme Erp Yazilimi/src/components/pages.tsx';
let content = fs.readFileSync(path, 'utf8');

// Update columns in StockDetailPage
const oldCols1 = `{ header: "Parti", cell: (row) => row.partyNo },
            { header: "Lot", cell: (row) => row.lotNo },`;

const newCols1 = `{ header: "Parti", cell: (row) => row.partyNo },
            { header: "En", cell: (row) => {
              const party = data.parties.find(p => p.id === row.partyId);
              return (party?.finishWidth || party?.rawWidth) ?? "-";
            }},
            { header: "Gramaj", cell: (row) => {
              const party = data.parties.find(p => p.id === row.partyId);
              return (party?.finishGsm || party?.rawGsm) ?? "-";
            }},`;

// We use replace with string to be safe, but since it might fail due to whitespace, we'll use a regex
content = content.replace(/\{\s*header:\s*"Parti",\s*cell:\s*\(row\)\s*=>\s*row\.partyNo\s*\},\s*\{\s*header:\s*"Lot",\s*cell:\s*\(row\)\s*=>\s*row\.lotNo\s*\}/g, newCols1);

fs.writeFileSync(path, content, 'utf8');
console.log('Update complete');
