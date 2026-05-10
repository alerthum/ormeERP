"use client";

import { useEffect, useState } from "react";
import { 
  CheckCircle2, 
  Clock, 
  Factory, 
  PackageCheck, 
  ShoppingCart, 
  Truck,
  ArrowRightLeft
} from "lucide-react";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { StatusBadge } from "./status-badge";

interface TimelineEvent {
  id: string;
  type: string;
  title: string;
  description: string;
  eventDate: string;
  createdAt: string;
  businessNo?: string;
  partyNo?: string;
  lotNo?: string;
  quantityKg?: number;
  status?: string;
  relatedId: string;
}

const typeConfig: Record<string, { icon: any; color: string; tone: "blue" | "orange" | "purple" | "green" | "slate" }> = {
  customer_order: { icon: ShoppingCart, color: "text-blue-500", tone: "blue" },
  raw_production: { icon: Factory, color: "text-orange-500", tone: "orange" },
  dyehouse_production: { icon: Factory, color: "text-purple-500", tone: "purple" },
  sale: { icon: Truck, color: "text-green-500", tone: "green" },
  transfer: { icon: ArrowRightLeft, color: "text-slate-500", tone: "slate" },
};

export function OrderTimeline({ orderId }: { orderId: string }) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTimeline() {
      try {
        const res = await fetch(`/api/orders/${orderId}/timeline`);
        const json = await res.json();
        if (json.ok) {
          setEvents(json.data);
        }
      } catch (error) {
        console.error("Timeline fetch error:", error);
      } finally {
        setLoading(false);
      }
    }

    if (orderId) {
      fetchTimeline();
    }
  }, [orderId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Clock className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-10 border rounded-xl bg-white shadow-sm">
        <p className="text-slate-500">Bu sipariş için henüz operasyon kaydı oluşmadı.</p>
      </div>
    );
  }

  return (
    <div className="relative space-y-6 before:absolute before:inset-0 before:ml-5 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
      {events.map((event, index) => {
        const config = typeConfig[event.type] || typeConfig.transfer;
        const Icon = config.icon;
        
        return (
          <div key={event.id + index} className="relative flex items-start group">
            {/* Dot & Icon */}
            <div className={cn(
              "absolute left-0 flex items-center justify-center w-10 h-10 rounded-full border-4 border-white shadow-sm z-10",
              "bg-white transition-transform group-hover:scale-110"
            )}>
              <Icon className={cn("w-5 h-5", config.color)} />
            </div>

            {/* Content */}
            <div className="ml-14 flex-1 pt-1">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-slate-900">{event.title}</h4>
                  {event.status && (
                    <StatusBadge tone={config.tone as any}>{event.status}</StatusBadge>
                  )}
                </div>
                <time className="text-xs font-medium text-slate-500 whitespace-nowrap bg-slate-50 px-2 py-1 rounded">
                  {format(new Date(event.eventDate), "dd MMMM yyyy", { locale: tr })}
                </time>
              </div>
              
              <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm hover:border-slate-200 transition-colors">
                <p className="text-sm text-slate-600 leading-relaxed">
                  {event.description}
                </p>
                
                {(event.partyNo || event.quantityKg !== undefined || event.businessNo) && (
                  <div className="mt-3 pt-3 border-t border-slate-50 flex flex-wrap gap-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    {event.businessNo && (
                      <div className="flex items-center gap-1">
                        <span className="text-slate-300">NO:</span>
                        <span className="text-slate-600">{event.businessNo}</span>
                      </div>
                    )}
                    {event.partyNo && (
                      <div className="flex items-center gap-1">
                        <span className="text-slate-300">PARTİ:</span>
                        <span className="text-slate-600">{event.partyNo}</span>
                      </div>
                    )}
                    {event.quantityKg !== undefined && (
                      <div className="flex items-center gap-1">
                        <span className="text-slate-300">MİKTAR:</span>
                        <span className="text-slate-600">{event.quantityKg} KG</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
