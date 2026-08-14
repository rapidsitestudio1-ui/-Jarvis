"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Glass panel card that flashes its border whenever `pulseKey` changes —
 * used to make dashboard cards visibly react to live data updates.
 */
export function GlassCard({
  title,
  icon,
  pulseKey,
  children,
  className = "",
}: {
  title: string;
  icon?: React.ReactNode;
  pulseKey?: string | number;
  children: React.ReactNode;
  className?: string;
}) {
  const [pulsing, setPulsing] = useState(false);
  const first = useRef(true);
  const prevKey = useRef(pulseKey);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      prevKey.current = pulseKey;
      return;
    }
    if (pulseKey !== undefined && pulseKey !== prevKey.current) {
      prevKey.current = pulseKey;
      setPulsing(true);
      const id = setTimeout(() => setPulsing(false), 1600);
      return () => clearTimeout(id);
    }
  }, [pulseKey]);

  return (
    <section className={`glass-card p-3.5 ${pulsing ? "card-pulse" : ""} ${className}`}>
      <div className="mb-2.5 flex items-center gap-2">
        {icon && <span className="text-white/35 [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>}
        <h3 className="label-xs">{title}</h3>
      </div>
      {children}
    </section>
  );
}
