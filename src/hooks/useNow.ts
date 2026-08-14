"use client";

import { useEffect, useState } from "react";

/**
 * A clock that lives in state instead of being read during render.
 *
 * Reading `Date.now()` while rendering is impure, and it also freezes every
 * relative timestamp: "2m ago" stays "2m ago" until some unrelated update
 * happens to re-render the panel, and a to-do that falls due while you're
 * looking at it never flips to overdue. Ticking in an effect keeps both honest.
 */
export function useNow(intervalMs = 30000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
