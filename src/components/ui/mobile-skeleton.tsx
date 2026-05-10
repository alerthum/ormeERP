/**
 * Mobile skeleton loading placeholders.
 * Per Constitution Kural 14: use skeleton instead of full-screen spinner.
 * All skeletons use animate-pulse for subtle loading indication.
 */

function Bone({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200/70 ${className}`} />;
}

/** Skeleton for 2-column KPI card grid (matches mobile compact KPI layout) */
export function MobileKpiSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="premium-card rounded-2xl p-4 space-y-3">
          <div className="flex items-start justify-between">
            <div className="flex-1 space-y-2">
              <Bone className="h-3 w-16" />
              <Bone className="h-6 w-24" />
            </div>
            <Bone className="size-8 rounded-xl shrink-0" />
          </div>
          <Bone className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

/** Skeleton for card list items (matches mobile DataTable card view) */
export function MobileCardListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="premium-card rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <Bone className="h-4 w-28" />
            <Bone className="h-5 w-16 rounded-full" />
          </div>
          <Bone className="h-3 w-40" />
          <div className="flex gap-4">
            <Bone className="h-3 w-20" />
            <Bone className="h-3 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Skeleton for form fields inside a drawer */
export function MobileFormSkeleton({ fields = 5 }: { fields?: number }) {
  return (
    <div className="space-y-5">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Bone className="h-3 w-20" />
          <Bone className="h-11 w-full" />
        </div>
      ))}
      <Bone className="h-12 w-full mt-4" />
    </div>
  );
}

/** Skeleton for mobile hero card */
export function MobileHeroSkeleton() {
  return (
    <div className="md:hidden premium-card rounded-2xl overflow-hidden">
      <div className="bg-slate-50 px-4 py-5 space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex-1 space-y-2">
            <Bone className="h-2.5 w-12" />
            <Bone className="h-3 w-24" />
            <Bone className="h-7 w-32" />
            <Bone className="h-3 w-28" />
          </div>
          <Bone className="size-10 rounded-xl shrink-0" />
        </div>
      </div>
      <div className="px-4 py-3 bg-white border-t border-slate-100">
        <Bone className="h-11 w-full" />
      </div>
    </div>
  );
}

/** Full mobile page skeleton: hero + KPI + card list */
export function MobilePageSkeleton({ showHero = true, kpiCount = 4, cardCount = 3 }: { showHero?: boolean; kpiCount?: number; cardCount?: number }) {
  return (
    <div className="md:hidden space-y-4">
      {showHero ? <MobileHeroSkeleton /> : null}
      <MobileKpiSkeleton count={kpiCount} />
      <MobileCardListSkeleton count={cardCount} />
    </div>
  );
}
