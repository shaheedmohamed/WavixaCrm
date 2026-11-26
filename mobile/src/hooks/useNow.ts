import { useEffect, useState } from 'react';

/**
 * Render-safe "current time". `Date.now()` inside render trips the
 * react-hooks/purity rule, so we snapshot once at mount and refresh on an
 * interval. `active=false` pauses the tick (e.g. a closed modal).
 */
export function useNow(refreshMs = 30_000, active = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), refreshMs);
    return () => clearInterval(t);
  }, [refreshMs, active]);
  return now;
}
