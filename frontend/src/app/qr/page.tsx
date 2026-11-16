"use client";
import { QRCodeSVG } from "qrcode.react";
import { api } from "@/lib/api";
import { usePolling } from "@/lib/hooks";

export default function QrSheetPage() {
  const { data } = usePolling(() => api.books(), [], 20000);
  return (
    <div className="page">
      <div className="page-head no-print">
        <h1>Cetak QR buku</h1>
        <p className="lede">Satu QR untuk tiap buku. Tempel di punggung buku, lalu pindai dari halaman Pindai QR.</p>
        <button className="btn" onClick={() => window.print()}>
          Cetak halaman ini
        </button>
      </div>
      <div className="qr-grid">
        {data?.books.map((b) => (
          <figure key={b.id} className="qr-card">
            <QRCodeSVG value={`${window.location.origin}/book/${b.id}`} size={150} marginSize={2} />
            <figcaption>
              <strong>{b.code}</strong>
              <span>{b.title}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
