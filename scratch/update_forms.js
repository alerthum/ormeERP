const fs = require('fs');
const path = 'c:/Users/ibrahimyokus/Desktop/convert/Yokus Orme Erp Yazilimi/src/components/forms.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Update RawProductionForm
const oldRawDef = `export function RawProductionForm() {
  const { data, refresh } = useErpData();
  const [loading, setLoading] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [partyId, setPartyId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [producedRawKg, setProducedRawKg] = useState("");
  const [rawWidth, setRawWidth] = useState("");
  const [rawGsm, setRawGsm] = useState("");`;

const newRawDef = `export function RawProductionForm({ initialData }: { initialData?: RawProduction }) {
  const { data, refresh } = useErpData();
  const [loading, setLoading] = useState(false);
  const [orderId, setOrderId] = useState(initialData?.orderId ?? "");
  const [partyId, setPartyId] = useState(initialData?.partyId ?? "");
  const [warehouseId, setWarehouseId] = useState(initialData?.warehouseId ?? "");
  const [producedRawKg, setProducedRawKg] = useState(initialData?.producedRawKg?.toString() ?? "");
  const [rawWidth, setRawWidth] = useState(initialData?.rawWidth?.toString() ?? "");
  const [rawGsm, setRawGsm] = useState(initialData?.rawGsm?.toString() ?? "");
  
  useEffect(() => {
    if (initialData?.consumedItems) {
        setConsumedItems(initialData.consumedItems.map(ci => ({
            stockId: ci.stockId,
            warehouseId: ci.warehouseId,
            lotNo: ci.lotNo || "",
            quantityKg: ci.quantityKg,
            stockCode: data.stockCards.find(s => s.id === ci.stockId)?.code ?? "???",
            warehouseName: data.warehouses.find(w => w.id === ci.warehouseId)?.name ?? "???"
        })));
    }
  }, [initialData, data.stockCards, data.warehouses]);`;

content = content.replace(oldRawDef, newRawDef);

// Update submit to use update endpoint if initialData exists
content = content.replace(
    'await postJson("/api/production/raw", {',
    'await postJson(initialData ? `/api/production/raw/${initialData.id}/update` : "/api/production/raw", {'
);

// 2. Update DyehouseProductionForm
const oldDyeDef = `export function DyehouseProductionForm() {
  const { data, refresh } = useErpData();
  const [loading, setLoading] = useState(false);
  const [partyId, setPartyId] = useState("");
  const [inputWarehouseId, setInputWarehouseId] = useState("");
  const [inputRawKg, setInputRawKg] = useState("");`;

const newDyeDef = `export function DyehouseProductionForm({ initialData }: { initialData?: DyehouseProduction }) {
  const { data, refresh } = useErpData();
  const [loading, setLoading] = useState(false);
  const [partyId, setPartyId] = useState(initialData?.partyId ?? "");
  const [inputWarehouseId, setInputWarehouseId] = useState(initialData?.inputWarehouseId ?? "");
  const [inputRawKg, setInputRawKg] = useState(initialData?.inputRawKg?.toString() ?? "");`;

content = content.replace(oldDyeDef, newDyeDef);

content = content.replace(
    'await postJson("/api/production/dyehouse", {',
    'await postJson(initialData ? `/api/production/dyehouse/${initialData.id}/update` : "/api/production/dyehouse", {'
);

// 3. Update TransferForm
const oldTransDef = `export function TransferForm() {
  const { data, refresh } = useErpData();
  const [loading, setLoading] = useState(false);
  const [fromWarehouseId, setFromWarehouseId] = useState("");
  const [toWarehouseId, setToWarehouseId] = useState("");
  const [items, setItems] = useState<Array<{ stockId: string; lotNo: string; partyId: string; quantity: number; stockCode: string; stockName: string }>>([]);`;

const newTransDef = `export function TransferForm({ initialData }: { initialData?: Transfer }) {
  const { data, refresh } = useErpData();
  const [loading, setLoading] = useState(false);
  const [fromWarehouseId, setFromWarehouseId] = useState(initialData?.fromWarehouseId ?? "");
  const [toWarehouseId, setToWarehouseId] = useState(initialData?.toWarehouseId ?? "");
  const [items, setItems] = useState<Array<{ stockId: string; lotNo: string; partyId: string; quantity: number; stockCode: string; stockName: string }>>([]);
  
  useEffect(() => {
    if (initialData?.items) {
        setItems(initialData.items.map(it => {
            const stock = data.stockCards.find(s => s.id === it.stockId);
            return {
                stockId: it.stockId,
                lotNo: it.lotNo || "",
                partyId: it.partyId || "",
                quantity: it.quantity,
                stockCode: stock?.code ?? "???",
                stockName: stock?.name ?? "???"
            };
        }));
    }
  }, [initialData, data.stockCards]);`;

content = content.replace(oldTransDef, newTransDef);

content = content.replace(
    'await postJson("/api/transfer", {',
    'await postJson(initialData ? `/api/transfer/${initialData.id}/update` : "/api/transfer", {'
);

// Also need to make sure 'useEffect' is imported
if (!content.includes('import { useEffect,')) {
    content = content.replace('import { useMemo, useState } from "react";', 'import { useEffect, useMemo, useState } from "react";');
}

fs.writeFileSync(path, content, 'utf8');
console.log('Forms update complete');
