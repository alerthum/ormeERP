"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useErpData } from "@/components/erp-data-provider";
import { X, Factory } from "lucide-react";

export function FormDrawer({
  open,
  title,
  children,
  onClose,
  loading: externalLoading,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  loading?: boolean;
}) {
  const { data, loading: globalLoading } = useErpData();
  const [localLoading, setLocalLoading] = useState(false);
  const settings = data.uiSettings;
  
  useEffect(() => {
    if (open) {
      setLocalLoading(true);
      const timer = setTimeout(() => setLocalLoading(false), 400);
      return () => clearTimeout(timer);
    }
  }, [open]);

  if (!open) return null;

  const loading = externalLoading || globalLoading || localLoading;

  const position = settings.modalPosition || "right";
  const mobilePosition = settings.modalPositionMobile || "bottom";

  const getPositionClasses = () => {
    // Mobile logic (default to bottom or the mobile setting)
    let classes = "fixed inset-0 z-50 flex bg-slate-950/25 backdrop-blur-sm transition-all duration-300 ";
    
    // Desktop positions
    if (position === "right") classes += "lg:justify-end lg:items-stretch ";
    else if (position === "left") classes += "lg:justify-start lg:items-stretch ";
    else if (position === "center") classes += "lg:justify-center lg:items-center lg:p-16 ";
    else if (position === "top") classes += "lg:justify-center lg:items-start lg:p-4 ";
    else if (position === "bottom") classes += "lg:justify-center lg:items-end lg:p-4 ";

    // Mobile positions
    if (mobilePosition === "bottom") classes += "items-end ";
    else if (mobilePosition === "top") classes += "items-start ";
    else classes += "items-stretch "; 

    return classes;
  };

  const getAsideClasses = () => {
    let classes = "bg-white shadow-2xl transition-all duration-300 ease-out overflow-hidden flex flex-col rounded-none ";
    
    // Desktop sizing
    if (position === "right" || position === "left") {
      classes += "lg:h-full lg:w-full lg:max-w-xl ";
      if (position === "right") classes += "lg:animate-in lg:slide-in-from-right ";
      else classes += "lg:animate-in lg:slide-in-from-left ";
    } else if (position === "center") {
      classes += "lg:h-full lg:max-h-[96vh] lg:w-full lg:max-w-[1800px] lg:animate-in lg:zoom-in-95 ";
    } else if (position === "top" || position === "bottom") {
      classes += "lg:h-auto lg:max-h-[92vh] lg:w-full lg:max-w-4xl ";
      if (position === "top") classes += "lg:animate-in lg:slide-in-from-top ";
      else classes += "lg:animate-in lg:slide-in-from-bottom ";
    }

    // Mobile sizing
    if (mobilePosition === "bottom") {
      classes += "h-auto max-h-[100vh] w-full animate-in slide-in-from-bottom ";
    } else if (mobilePosition === "top") {
      classes += "h-auto max-h-[100vh] w-full animate-in slide-in-from-top ";
    } else {
      classes += "h-full w-full max-w-[100%] ";
    }

    return classes;
  };

  return (
    <div className={getPositionClasses()} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <aside className={getAsideClasses()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 px-6 py-5 backdrop-blur">
          <div>
            <h2 className="text-xl font-bold text-slate-950 tracking-tight">{title}</h2>
            <div className="mt-1 h-1 w-8 bg-blue-600" />
          </div>
          <button 
            className="group grid size-11 place-items-center bg-slate-50 text-slate-500 transition-all hover:bg-rose-50 hover:text-rose-600" 
            onClick={onClose} 
            type="button"
          >
            <X className="size-6 transition-transform group-hover:rotate-90" />
          </button>
        </div>
        <div className={cn(
          "flex-1 overflow-y-auto p-6 custom-scrollbar relative",
          position === "center" && "lg:p-10"
        )}>
          {loading && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-md animate-in fade-in duration-300">
              <div className="flex flex-col items-center gap-6">
                <div className="relative">
                  <div className="size-16 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin shadow-xl shadow-blue-100" />
                  <div className="absolute inset-0 grid place-items-center">
                    <Factory className="size-5 text-blue-600 animate-pulse" />
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-xs font-bold text-slate-900 uppercase tracking-[0.2em] animate-pulse">Veriler Yükleniyor</p>
                  <p className="text-[10px] text-slate-500 mt-2">Lütfen bekleyin...</p>
                </div>
              </div>
            </div>
          )}
          {children}
        </div>
      </aside>
    </div>
  );
}
