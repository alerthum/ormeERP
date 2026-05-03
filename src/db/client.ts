import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not configured.");
}

export const sql = postgres(databaseUrl, {
  ssl: "require",
  max: 5,
  idle_timeout: 20,
  connect_timeout: 15,
});

export const db = drizzle(sql, { schema });
