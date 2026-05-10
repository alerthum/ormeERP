import type { Tx } from "./write-types";
import type { StockType } from "@/types/erp";
import { id, requireString } from "./write-utils";
import { nextCode } from "./counter.service";

export async function settingName(tx: Tx, table: string, entityId: string | null) {
  if (!entityId) return "";
  const rows = await tx`select name from ${tx(table)} where id = ${entityId} limit 1`;
  return typeof rows[0]?.name === "string" ? rows[0].name : "";
}

export async function yarnTypeCode(tx: Tx, yarnTypeId: string | null) {
  if (!yarnTypeId) return "";
  const rows = await tx`select code from settings_yarn_types where id = ${yarnTypeId} limit 1`;
  return typeof rows[0]?.code === "string" ? rows[0].code.trim().toUpperCase() : "";
}

export async function buildRawMaterialStockName(
  tx: Tx,
  input: {
    type: StockType;
    yarnCountId: string | null;
    colorId: string | null;
    yarnTypeId: string | null;
    hasPolyester: boolean;
    hasLycra: boolean;
  },
) {
  const yarn = await settingName(tx, "settings_yarn_counts", input.yarnCountId);
  const color = (await settingName(tx, "settings_colors", input.colorId)).toLocaleUpperCase("tr-TR");
  const yarnType = await yarnTypeCode(tx, input.yarnTypeId);
  const yarnTypePart = yarnType && yarnType !== "OE" ? yarnType : "";
  if (input.type === "IP") {
    return [yarn, color, input.hasLycra ? "LYC" : "", input.hasPolyester ? "POLY" : ""]
      .filter(Boolean)
      .join(" ");
  }
  if (input.type === "LYC") return ["LYCRA", yarn, color].filter(Boolean).join(" ");
  if (input.type === "POLY") return ["POLYESTER", yarn, color].filter(Boolean).join(" ");
  return "";
}

export async function buildFabricStockName(
  tx: Tx,
  type: "YM" | "MM",
  input: {
    fabricTypeId: string;
    colorId: string;
    yarnCountId: string;
    hasPolyester: boolean;
    hasLycra: boolean;
  },
) {
  const fabricName = (await settingName(tx, "settings_fabric_types", input.fabricTypeId)).toLocaleUpperCase("tr-TR");
  const colorName = (await settingName(tx, "settings_colors", input.colorId)).toLocaleUpperCase("tr-TR");
  const yarnName = await settingName(tx, "settings_yarn_counts", input.yarnCountId);
  return [
    yarnName,
    fabricName,
    colorName,
    "",
    type === "YM" ? "HAM" : "",
    input.hasLycra ? "LYC" : "",
    input.hasPolyester ? "POLY" : "",
  ].filter(Boolean).join(" ");
}

export async function findOrCreateFabricStock(
  tx: Tx,
  type: "YM" | "MM",
  input: {
    fabricTypeId: string;
    colorId: string;
    yarnCountId: string;
    hasPolyester: boolean;
    hasLycra: boolean;
  },
) {
  const matches = await tx`
    select id from stock_cards
    where type = ${type}
      and fabric_type_id = ${input.fabricTypeId}
      and color_id = ${input.colorId}
      and yarn_count_id = ${input.yarnCountId}
      and has_polyester = ${input.hasPolyester}
      and has_lycra = ${input.hasLycra}
    limit 1
  `;

  if (matches[0]?.id) return String(matches[0].id);

  const stockId = id(type.toLowerCase());
  const code = await nextCode(tx, type);
  const name = await buildFabricStockName(tx, type, input);

  await tx`
    insert into stock_cards (
      id, code, type, name, fabric_type_id, color_id, yarn_count_id,
      has_polyester, has_lycra,
      unit, current_stock_kg, critical_stock_kg, created_at, updated_at, is_active
    )
    values (
      ${stockId}, ${code}, ${type}, ${name}, ${input.fabricTypeId}, ${input.colorId}, ${input.yarnCountId},
      ${input.hasPolyester}, ${input.hasLycra},
      'kg', 0, 0, now(), now(), true
    )
  `;

  return stockId;
}
