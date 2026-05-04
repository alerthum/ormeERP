const fs = require('fs');
const path = 'c:/Users/ibrahimyokus/Desktop/convert/Yokus Orme Erp Yazilimi/src/components/pages.tsx';
let content = fs.readFileSync(path, 'utf8');

// Update deleteProductionRecord in pages.tsx
content = content.replace(
    'await postJson("/api/production/" + (isRaw ? "raw" : "dyehouse") + "/" + deleteTarget.id + "/delete", {});',
    'await apiDelete("/api/production/" + (isRaw ? "raw" : "dyehouse") + "/" + deleteTarget.id);'
);

// Update deleteTransferRecord in pages.tsx
content = content.replace(
    'await postJson(`/api/transfer/${deleteTarget.id}/delete`, {});',
    'await apiDelete(`/api/transfers/${deleteTarget.id}`);'
);

fs.writeFileSync(path, content, 'utf8');
console.log('UI Routes fixed in pages.tsx');
