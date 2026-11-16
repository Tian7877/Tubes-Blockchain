"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { shortHash } from "@/lib/format";

type State = "checking" | "ok" | "bad" | "missing" | "error";

const CHIP: Record<State, string> = {
  checking: "Memeriksa hash",
  ok: "Hash cocok dengan catatan chain",
  bad: "Hash TIDAK cocok: file berubah",
  missing: "File tidak ada di storage",
  error: "Gagal memeriksa",
};

// Menampilkan foto off-chain beserta hasil pencocokan hash-nya dengan yang tercatat on-chain.
export function PhotoProof({ hash, caption, refreshKey = 0 }: { hash: string; caption: string; refreshKey?: number }) {
  const [state, setState] = useState<State>("checking");
  const [actual, setActual] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const r = await api.verifyPhoto(hash);
        if (!alive) return;
        setActual(r.actual);
        setState(!r.exists ? "missing" : r.ok ? "ok" : "bad");
      } catch {
        if (alive) setState("error");
      }
    };
    void check();
    const t = setInterval(check, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [hash, refreshKey]);

  return (
    <figure className={`proof proof-${state}`}>
      {state !== "missing" && (
        <a href={api.photoUrl(hash)} target="_blank" rel="noreferrer" title="Buka foto ukuran penuh">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${api.photoUrl(hash)}?v=${state}-${refreshKey}`} alt={caption} width={132} height={86} />
        </a>
      )}
      <figcaption>
        <span className="proof-caption">{caption}</span>
        <span className={`chip chip-${state}`}>{CHIP[state]}</span>
        <code title={hash}>on-chain {shortHash(hash)}</code>
        {state === "bad" && actual && <code title={actual}>isi file {shortHash(actual)}</code>}
      </figcaption>
    </figure>
  );
}
