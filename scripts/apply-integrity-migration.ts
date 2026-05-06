import postgres from "postgres";
import "dotenv/config";

const sql = postgres(process.env.DATABASE_URL!, { ssl: "require", prepare: false });

async function migrate() {
  console.log("Migration started with SSL...");

  try {
    // Add default warehouse columns to partners
    await sql`
      alter table partners 
      add column if not exists default_purchase_warehouse_id text,
      add column if not exists default_transfer_target_warehouse_id text,
      add column if not exists default_dyehouse_consumption_warehouse_id text,
      add column if not exists default_sales_warehouse_id text
    `;
    console.log("Partner table updated with default warehouse columns.");

    // Update ui_settings with form defaults if not exists
    const settingsRows = await sql`select data from ui_settings where id = 'global'`;
    if (settingsRows.length > 0) {
      const data = settingsRows[0].data;
      if (!data.formDefaults) {
        data.formDefaults = [
          {
            formId: "purchase",
            formName: "Hammadde Alışı (Mal Kabul)",
            partnerFieldName: "Tedarikçi",
            warehouseFieldName: "Alış Deposu",
          },
          {
            formId: "transfer",
            formName: "Depo Transferi",
            partnerFieldName: "-",
            warehouseFieldName: "Kaynak Depo",
          },
          {
            formId: "raw_production",
            formName: "Ham Üretim",
            partnerFieldName: "Fasoncu",
            warehouseFieldName: "Giriş Deposu",
          },
          {
            formId: "dyehouse_production",
            formName: "Boyahane Üretimi",
            partnerFieldName: "Boyahane",
            warehouseFieldName: "Tüketilecek Ham Deposu",
          },
          {
            formId: "sale",
            formName: "Satış / Sevkiyat",
            partnerFieldName: "Müşteri",
            warehouseFieldName: "Çıkış Deposu",
          }
        ];
        await sql`update ui_settings set data = ${JSON.stringify(data)}::jsonb where id = 'global'`;
        console.log("UI settings updated with form defaults.");
      }
    }

    console.log("Migration completed successfully.");
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    await sql.end();
  }
}

migrate();
