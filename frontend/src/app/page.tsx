"use client";
import Link from "next/link";
import type { CSSProperties } from "react";
import { PendingStamp, Stamp } from "@/components/Stamp";
import { api } from "@/lib/api";
import { describeEvent, dueText, fmtTime, spineColor } from "@/lib/format";
import { usePolling } from "@/lib/hooks";

export default function CatalogPage() {
  const books = usePolling(() => api.books());
  const tape = usePolling(() => api.events(10));
  const data = books.data;

  return (
    <div className="page">
      <div className="page-head">
        <h1>Katalog Perpustakaan Pusat</h1>
        {data ? (
          <p className="lede">
            {data.books.length} buku terdaftar di ledger. <b>{data.stats.borrowed + data.stats.overdue}</b> sedang dipinjam,{" "}
            <b>{data.stats.overdue}</b> terlambat, <b>{data.stats.lostOrDamaged}</b> hilang atau rusak, dan <b>{data.stats.pending}</b> kasus menunggu
            keputusan pengurus. Seluruhnya tercatat dalam <b>{data.stats.ledgerEntries}</b> entri ledger.
          </p>
        ) : (
          <p className="lede muted">{books.error ?? "Memuat katalog dari ledger…"}</p>
        )}
      </div>

      <div className="home-grid">
        <section aria-label="Daftar buku">
          <ul className="shelf">
            {data?.books.map((b) => {
              const due = dueText(b, data.chain.timestamp);
              return (
                <li key={b.id}>
                  <Link href={`/book/${b.id}`} className="row" style={{ "--spine": spineColor(b.id) } as CSSProperties}>
                    <span className="spine" aria-hidden="true" />
                    <span className="row-code">{b.code}</span>
                    <span className="row-main">
                      <strong>{b.title}</strong>
                      <span>{b.author}</span>
                      <span className="muted">
                        {b.callNumber}, {b.location}
                      </span>
                    </span>
                    <span className="row-state">
                      <Stamp status={b.status} />
                      {b.pendingIncident && <PendingStamp kind={b.pendingIncident.kind} />}
                      <small>
                        {b.holdingNow
                          ? `${b.holderName}, ${due}`
                          : b.holderName
                            ? `Terakhir dipegang ${b.holderName}`
                            : "Belum pernah dipinjam"}
                      </small>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="muted small hint">
            Pilih buku untuk melihat riwayat lengkapnya. Ganti akun di pojok kanan atas untuk mencoba peran pustakawan, peminjam, atau pengurus.
          </p>
        </section>

        <aside className="tape" aria-label="Pita transaksi">
          <h2>Pita transaksi</h2>
          <p className="tape-sub">Entri terbaru yang dibaca dari event kontrak.</p>
          <ol>
            {tape.data?.events.map((e) => (
              <li key={e.id}>
                <Link href={`/book/${e.bookId}`}>
                  <span className="t-time">{fmtTime(e.timestamp)}</span>
                  <span className="t-act">{describeEvent(e).label}</span>
                  <span className="t-book">{e.bookTitle}</span>
                  <span className="t-who">
                    {e.actorName}, blok {e.blockNumber}
                  </span>
                </Link>
              </li>
            ))}
            {tape.data && tape.data.events.length === 0 && <li className="muted">Belum ada transaksi.</li>}
          </ol>
        </aside>
      </div>
    </div>
  );
}
