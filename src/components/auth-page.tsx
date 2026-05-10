"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Factory, LogIn, UserPlus } from "lucide-react";
import { supabase } from "@/lib/supabase";

const inputClass = "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50";

export function AuthPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    const fullName = String(form.get("fullName") ?? "");
    
    // Determine redirect URL
    const siteUrl = typeof window !== "undefined" ? window.location.origin : "";
    const redirectTo = `${siteUrl}/auth/callback`;

    try {
      if (mode === "login" && !password) {
        // MAGIC LINK / OTP LOGIN
        const { error } = await supabase.auth.signInWithOtp({ 
          email,
          options: { emailRedirectTo: redirectTo }
        });
        if (error) throw error;
        toast.success("Giriş bağlantısı e-posta adresinize gönderildi. Lütfen mailinizi kontrol edin.");
        return;
      }

      const result =
        mode === "login"
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({ 
              email, 
              password, 
              options: { 
                data: { full_name: fullName },
                emailRedirectTo: redirectTo
              } 
            });
      
      if (result.error) throw result.error;
      
      if (mode === "signup") {
        toast.success("Kullanıcı oluşturuldu. E-posta onayı gerekebilir.");
      } else {
        toast.success("Giriş yapıldı.");
        window.location.href = "/dashboard";
      }
    } catch (error) {
      let message = error instanceof Error ? error.message : "Auth işlemi tamamlanamadı.";
      if (message.includes("Email not confirmed")) {
        message = "Admin kullanıcısının e-postası Supabase Auth tarafında onaylı değil. npm run ensure:admin çalıştırın.";
      }
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  async function loginAsAdmin() {
    setLoading(true);
    try {
      const { error, data } = await supabase.auth.signInWithPassword({
        email: "alerthum@yahoo.com",
        password: "123Qwe..",
      });
      if (error) {
        console.error("❌ ADMIN LOGIN FAILED:", {
          host: typeof window !== "undefined" ? window.location.host : "unknown",
          supabaseHost: new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "").host,
          message: error.message,
          status: error.status,
          name: error.name
        });
        throw new Error("Admin girişi başarısız. Lütfen Vercel auth kurulumunu kontrol edin.");
      }
      toast.success("Admin olarak giriş yapıldı.");
      window.location.href = "/dashboard";
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Giriş yapılamadı.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top_left,#dbeafe,transparent_32%),#f8fafc] px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl shadow-blue-100/70">
        <div className="flex items-center gap-3">
          <div className="grid size-12 place-items-center rounded-2xl bg-blue-600 text-white">
            <Factory className="size-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-950">Yokuş Örme ERP</h1>
            <p className="text-sm text-slate-500">Güvenli giriş altyapısı</p>
          </div>
        </div>

        <button 
          onClick={loginAsAdmin}
          disabled={loading}
          className="mt-8 flex w-full items-center justify-center gap-3 rounded-2xl bg-slate-900 py-4 text-sm font-bold text-white shadow-xl shadow-slate-200 transition active:scale-[0.98] disabled:opacity-50"
        >
          <LogIn className="size-5" />
          Admin ile giriş yap
        </button>

        <div className="relative my-8">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100"></div></div>
          <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-3 font-bold text-slate-400">Veya</span></div>
        </div>

        <div className="grid grid-cols-2 rounded-2xl bg-slate-100 p-1 text-sm font-semibold">
          <button className={`rounded-xl py-2 ${mode === "login" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`} onClick={() => setMode("login")} type="button">Giriş</button>
          <button className={`rounded-xl py-2 ${mode === "signup" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`} onClick={() => setMode("signup")} type="button">Yeni kullanıcı</button>
        </div>

        <form className="mt-6 grid gap-4" onSubmit={submit}>
          {mode === "signup" ? <input className={inputClass} name="fullName" placeholder="Ad soyad" required /> : null}
          <input className={inputClass} name="email" placeholder="E-posta" type="email" required />
          <input className={inputClass} minLength={6} name="password" placeholder={mode === "login" ? "Şifre (Boş bırakırsanız giriş linki gönderilir)" : "Şifre"} type="password" required={mode === "signup"} />
          <button className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-100 disabled:opacity-60" disabled={loading} type="submit">
            {mode === "login" ? <LogIn className="size-4" /> : <UserPlus className="size-4" />}
            {loading ? "İşleniyor..." : mode === "login" ? "Giriş yap" : "Kullanıcı oluştur"}
          </button>
        </form>
      </div>
    </main>
  );
}
