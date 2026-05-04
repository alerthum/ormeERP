const fs = require('fs');
const path = 'c:/Users/ibrahimyokus/Desktop/convert/Yokus Orme Erp Yazilimi/src/components/forms.tsx';
let content = fs.readFileSync(path, 'utf8');

// Helper for PATCH if not already there
const patchJsonSnippet = `async function patchJson(endpoint: string, payload: Record<string, unknown>) {
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;
  const response = await fetch(endpoint, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
    body: JSON.stringify(payload),
    signal: requestSignal(),
  });
  const result = (await response.json()) as { ok: boolean; error?: string };
  if (!response.ok || !result.ok) throw new Error(result.error ?? "İşlem tamamlanamadı.");
  return result;
}`;

if (!content.includes('function patchJson')) {
    content = content.replace('async function postJson', patchJsonSnippet + '\n\nasync function postJson');
}

// Raw update
content = content.replace(
    'await postJson(initialData ? `/api/production/raw/${initialData.id}/update` : "/api/production/raw", {',
    'if (initialData) await patchJson(`/api/production/raw/${initialData.id}`, {'
);
// This replacement is tricky because of the else. I'll be more precise.

// Re-write the submit logic for Raw
const oldRawSubmit = `    try {
      await postJson(initialData ? \`/api/production/raw/\${initialData.id}/update\` : "/api/production/raw", {
        date: form.get("date"),`;

const newRawSubmit = `    try {
      const payload = {
        date: form.get("date"),`;

content = content.replace(oldRawSubmit, newRawSubmit);
content = content.replace(
    'description: form.get("description"),\n      });',
    'description: form.get("description"),\n      };\n      if (initialData) await patchJson(`/api/production/raw/${initialData.id}`, payload);\n      else await postJson("/api/production/raw", payload);'
);

// Re-write the submit logic for Dyehouse
const oldDyeSubmit = `    try {
      await postJson(initialData ? \`/api/production/dyehouse/\${initialData.id}/update\` : "/api/production/dyehouse", {
        date: form.get("date"),`;

const newDyeSubmit = `    try {
      const payload = {
        date: form.get("date"),`;

content = content.replace(oldDyeSubmit, newDyeSubmit);
content = content.replace(
    'description: form.get("description"),\n      });',
    'description: form.get("description"),\n      };\n      if (initialData) await patchJson(`/api/production/dyehouse/${initialData.id}`, payload);\n      else await postJson("/api/production/dyehouse", payload);'
);

// Re-write the submit logic for Transfer
const oldTransSubmit = `    try {
      await postJson(initialData ? \`/api/transfer/\${initialData.id}/update\` : "/api/transfer", {
        date: form.get("date"),`;

const newTransSubmit = `    try {
      const payload = {
        date: form.get("date"),`;

content = content.replace(oldTransSubmit, newTransSubmit);
content = content.replace(
    'quantity: item.quantity\n        })),\n      });',
    'quantity: item.quantity\n        })),\n      };\n      if (initialData) await patchJson(`/api/transfers/${initialData.id}`, payload);\n      else await postJson("/api/transfers", payload);'
);

fs.writeFileSync(path, content, 'utf8');
console.log('Forms routes fixed in forms.tsx');
