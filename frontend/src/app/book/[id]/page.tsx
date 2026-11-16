"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { useState, type CSSProperties } from "react";
import { ActionPanel } from "@/components/ActionPanel";
import { CopyButton } from "@/components/CopyButton";
import { PendingStamp, Stamp } from "@/components/Stamp";
import { Timeline } from "@/components/Timeline";
import { api } from "@/lib/api";
import { dueText, shortHash, spineColor } from "@/lib/format";
import { usePolling } from "@/lib/hooks";

export default function BookPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [ms, setMs] = useState<number | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);

  const { data, error, refresh } = usePolling(
    async () => {
      const t0 = performance.now();
      const r = await api.book(id);
      setMs(Math.round(performance.now() - t0));
      return r;
    },
    [id]
  );

  if (error && !data) {
    return (
      <div className="page">
        <p className="field-error">{error}</p>
        <Link href="/">Kembali ke katalog</Link>
      </div>
    );
  }
  if (!data) return <div className="page muted">Memuat riwayat buku dari ledger…</div>;

  const { book, events, chain } = data;
  const due = dueText(book, chain.timestamp);
  const qrValue = typeof window === "undefined" ? "" : `${window.location.origin}/book/${book.id}`;

  return (
    <div className="page">
      <p className="crumb">
        <Link href="/">Katalog</Link> / {book.code}
      </p>

      <header className="book-head" style={{ "--spine": spineColor(book.id) } as CSSProperties}>
        <span className="spine spine-tall" aria-hidden="true" />
        <div className="book-head-main">
          <h1>{book.title}</h1>
          <p className="byline">
            {book.author}
            {book.year ? `, ${book.year}` : ""}
          </p>
          <p className="muted">
            {book.callNumber}, {book.location}
          </p>
          <div className="stamps">
            <Stamp status={book.status} />
            {book.pendingIncident && <PendingStamp kind={book.pendingIncident.kind} />}
          </div>
          <p className="status-line">
            {book.holdingNow
              ? `Dipegang ${book.holderName}, ${due}.`
              : book.holderName
                ? `Pemegang terakhir: ${book.holderName}.`
                : "Belum pernah dipinjam."}
          </p>
        </div>
        {qrValue && (
          <div className="qr-mini">
            <QRCodeSVG value={qrValue} size={96} marginSize={1} />
            <span>{book.code}</span>
          </div>
        )}
      </header>

      <div className="book-grid">
        <div className="book-side">
          <ActionPanel
            book={book}
            onRecorded={(tx) => {
              setFresh(tx);
              void refresh();
            }}
          />

          <section className="panel">
            <h2>Apa yang ada di chain</h2>
            <div className="split">
              <div>
                <h3>Di chain</h3>
                <ul>
                  <li>Alamat peminjam (dummy)</li>
                  <li>Waktu pinjam dan kembali</li>
                  <li>Status buku</li>
                  <li>Hash foto kondisi</li>
                  <li>Persetujuan pengurus</li>
                  <li>
                    Hash katalog <code title={book.catalogHash}>{shortHash(book.catalogHash, 8, 4)}</code>{" "}
                    <span className={book.catalogOk ? "ok-text" : "bad-text"}>{book.catalogOk ? "cocok" : "tidak cocok dengan data katalog"}</span>
                  </li>
                </ul>
              </div>
              <div>
                <h3>Di luar chain</h3>
                <ul>
                  <li>File foto kondisi buku</li>
                  <li>Data katalog lengkap</li>
                  <li>Identitas asli dan NIM: tidak ada di simulasi</li>
                </ul>
              </div>
            </div>
            <p className="muted small">
              Hash membuktikan foto tidak berubah sejak dicatat. Hash tidak membuktikan foto itu asli atau bukunya benar-benar utuh; itu penilaian manusia.
            </p>
            <p className="small">
              Kontrak: <code title={chain.contract}>{shortHash(chain.contract, 8, 6)}</code> <CopyButton text={chain.contract} label="Salin alamat" />
            </p>
          </section>
        </div>

        <section className="book-main" aria-label="Riwayat buku">
          <div className="card-head">
            <h2>Kartu riwayat</h2>
            <span className="muted small">
              {events.length} entri{ms !== null ? `, dimuat dalam ${ms} ms` : ""}
            </span>
          </div>
          <p className="muted small">Hanya bertambah. Kontrak tidak punya fungsi untuk mengubah atau menghapus entri lama.</p>
          <Timeline events={events} fresh={fresh} />
        </section>
      </div>
    </div>
  );
}
