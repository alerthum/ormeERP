import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://example.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "demo-anon-key";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

function isMissingRefreshTokenError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.toLowerCase();
  return normalized.includes("invalid refresh token") || normalized.includes("refresh token not found");
}

export async function getSupabaseAccessToken() {
  try {
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      if (isMissingRefreshTokenError(error)) {
        await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
        return undefined;
      }

      throw error;
    }

    return data.session?.access_token;
  } catch (error) {
    if (isMissingRefreshTokenError(error)) {
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
      return undefined;
    }

    throw error;
  }
}

export const storageBuckets = {
  documents: "erp-documents",
  photos: "erp-photos",
  receipts: "erp-receipts",
} as const;
