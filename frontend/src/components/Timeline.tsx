"use client";
import { describeEvent, fmtDate, fmtTime, shortAddr, shortHash } from "@/lib/format";
import type { LedgerEvent } from "@/lib/types";
import { CopyButton } from "./CopyButton";
import { PhotoProof } from "./PhotoProof";

// Kartu riwayat: catatan terbaru di atas. Hanya bertambah; tidak ada tombol ubah atau hapus.
export function Timeline({ events, fresh, proofKey = 0 }: { events: LedgerEvent[]; fresh?: string | null; proofKey?: number }) {
  const rows = [...events].reverse();
  return (
    <ol className="timeline">
      {rows.map((e) => {
        const d = describeEvent(e);
        return (
          <li key={e.id} className={`entry tone-${d.tone}${fresh && fresh === e.txHash ? " fresh" : ""}`}>
            <div className="entry-when">
              <span>{fmtDate(e.timestamp)}</span>
              <span>{fmtTime(e.timestamp)}</span>
            </div>
            <div className="entry-body">
              <h3>{d.label}</h3>
              <p className="entry-who">
                oleh {e.actorName} <code title={e.actor}>{shortAddr(e.actor)}</code>
              </p>
              {e.details.dueAt && <p className="entry-note">Jatuh tempo {fmtDate(e.details.dueAt)}</p>}
              {e.photoHash && <PhotoProof hash={e.photoHash} caption={d.photoLabel ?? "Foto"} refreshKey={proofKey} />}
              <p className="entry-chain">
                <span>Blok {e.blockNumber}</span>
                <code title={e.txHash}>{shortHash(e.txHash, 10, 6)}</code>
                <CopyButton text={e.txHash} label="Salin tx" />
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
