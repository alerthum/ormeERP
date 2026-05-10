import { NextResponse } from "next/server";

export async function GET() {
  // Use a simple mask for sensitive strings
  const mask = (val: string | undefined) => (val ? `${val.substring(0, 8)}...` : "missing");
  const exists = (val: string | undefined) => (val ? "exists" : "missing");

  return NextResponse.json({
    node_env: process.env.NODE_ENV,
    site_url: process.env.NEXT_PUBLIC_SITE_URL,
    vercel_url: process.env.NEXT_PUBLIC_VERCEL_URL,
    supabase_url_host: process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host : "missing",
    database_host: process.env.DATABASE_URL ? process.env.DATABASE_URL.split("@")[1]?.split("/")[0] : "missing",
    supabase_anon_key: exists(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    supabase_service_role_key: exists(process.env.SUPABASE_SERVICE_ROLE_KEY),
    admin_setup_secret: exists(process.env.ADMIN_SETUP_SECRET),
    erp_auth_bypass: process.env.ERP_AUTH_BYPASS,
    timestamp: new Date().toISOString(),
    version: "1.0.0-auth-debug"
  });
}
