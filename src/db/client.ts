import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not configured.");
}

export const sql = postgres(databaseUrl, {
  ssl: "require",
  // Supabase transaction/session poolers can move requests between backend sessions.
  // Prepared statements are session scoped, so keep them off to avoid
  // "prepared statement ... does not exist" errors in Vercel/serverless.
  prepare: false,
  max: 5,
  idle_timeout: 10,
  connect_timeout: 15,
});
