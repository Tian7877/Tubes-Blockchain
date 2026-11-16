"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Contract } from "ethers";
import { api } from "@/lib/api";
import { ledgerFor } from "@/lib/chain";
import type { Deployment, Health, Persona } from "@/lib/types";

type ToastKind = "ok" | "err" | "info";
interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}

interface AppContext {
  dep: Deployment | null;
  health: Health | null;
  persona: Persona | null;
  setPersonaKey: (key: string) => void;
  ledger: Contract | null;
  ledgerAs: (key: string) => Contract;
  notify: (kind: ToastKind, text: string) => void;
}

const Ctx = createContext<AppContext | null>(null);

export function useApp(): AppContext {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp harus dipakai di dalam <Providers>");
  return v;
}

const STORAGE_KEY = "ledger-pustaka.persona";

export function Providers({ children }: { children: ReactNode }) {
  const [dep, setDep] = useState<Deployment | null>(null);
  const [depError, setDepError] = useState<string | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [personaKey, setPersonaKeyState] = useState("aulia");
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Konfigurasi kontrak + akun dummy. Dicoba ulang sampai backend siap.
  const loadConfig = useCallback(async () => {
    try {
      setDep(await api.config());
      setDepError(null);
    } catch (e) {
      setDepError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) setPersonaKeyState(saved);
    void loadConfig();
  }, [loadConfig]);

  // Pantau chain. Bila kontrak di-deploy ulang (npm run dev dijalankan lagi), muat konfigurasi baru.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const h = await api.health();
        if (!alive) return;
        setHealth(h);
        if (h.ok && (!dep || h.contract !== dep.address)) void loadConfig();
      } catch {
        if (alive) setHealth({ ok: false, reason: "API tidak terjangkau. Jalankan: npm run dev" });
      }
    };
    void tick();
    const t = setInterval(tick, 4000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [dep, loadConfig]);

  const persona = useMemo(() => dep?.personas.find((p) => p.key === personaKey) ?? dep?.personas[0] ?? null, [dep, personaKey]);

  const setPersonaKey = useCallback((key: string) => {
    setPersonaKeyState(key);
    window.localStorage.setItem(STORAGE_KEY, key);
  }, []);

  const ledgerAs = useCallback(
    (key: string) => {
      const p = dep?.personas.find((x) => x.key === key);
      if (!dep || !p) throw new Error("Akun dummy belum dimuat");
      return ledgerFor(dep, p);
    },
    [dep]
  );

  const ledger = useMemo(() => (dep && persona ? ledgerFor(dep, persona) : null), [dep, persona]);

  const notify = useCallback((kind: ToastKind, text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 8000);
  }, []);

  const problem = depError ?? (health && !health.ok ? health.reason ?? "Chain tidak terjangkau." : null);

  return (
    <Ctx.Provider value={{ dep, health, persona, setPersonaKey, ledger, ledgerAs, notify }}>
      {problem && (
        <div className="banner" role="alert">
          <strong>Backend belum siap.</strong> {problem}
        </div>
      )}
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
