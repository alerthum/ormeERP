"use client";

import { ShieldCheck, AlertTriangle, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface SystemHealthWidgetProps {
  status?: "green" | "yellow" | "red";
  stats?: {
    totalIssues: number;
    criticalIssues: number;
    warningIssues: number;
  };
}

export function SystemHealthWidget({ status, stats }: SystemHealthWidgetProps) {
  if (!status) return null;

  const config = {
    green: { icon: ShieldCheck, label: "Sistem Sağlıklı", desc: "Tüm veri bütünlük kontrolleri başarılı." },
    yellow: { icon: AlertTriangle, label: "Sistem Uyarısı", desc: `${stats?.totalIssues} adet düşük öncelikli tutarsızlık var.` },
    red: { icon: ShieldAlert, label: "Kritik Sorun", desc: `${stats?.criticalIssues} adet kritik veri bütünlüğü hatası tespit edildi!` },
  };

  const { icon: Icon, label, desc } = config[status];

  return (
    <div className={cn("premium-card rounded-none p-5 flex items-center justify-between gap-4 border-l-4 transition-all duration-500 shadow-lg", 
      status === "green" ? "border-green-500 bg-green-50/30 shadow-green-100/20" : status === "yellow" ? "border-amber-500 bg-amber-50/30 shadow-amber-100/20" : "border-red-500 bg-red-50/30 shadow-red-100/20")}>
      <div className="flex items-center gap-4">
        <div className={cn("grid size-12 place-items-center rounded-none bg-opacity-20", 
          status === "green" ? "bg-green-100 text-green-600" : status === "yellow" ? "bg-amber-100 text-amber-600" : "bg-red-100 text-red-600")}>
          <Icon className="size-6" />
        </div>
        <div>
          <h3 className="font-bold text-slate-950">{label}</h3>
          <p className="text-xs text-slate-500 mt-1">{desc}</p>
        </div>
      </div>
      <Link href="/settings/integrity" className="rounded-none border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 transition-all">
        Veri Merkezini Aç
      </Link>
    </div>
  );
}
