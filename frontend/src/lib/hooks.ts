"use client";
import { useCallback, useEffect, useRef, useState } from "react";

// Mengambil data, lalu memperbaruinya berkala. Cukup untuk simulasi lokal; tidak perlu websocket.
export function usePolling<T>(fetcher: () => Promise<T>, deps: unknown[] = [], ms = 4000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const ref = useRef(fetcher);
  ref.current = fetcher;

  const refresh = useCallback(async () => {
    try {
      setData(await ref.current());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), ms);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, ms, ...deps]);

  return { data, error, loading, refresh };
}
