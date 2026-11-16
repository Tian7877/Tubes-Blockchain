"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { QrScanner } from "@/components/QrScanner";
import { parseBookId } from "@/lib/format";

export default function ScanPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  function open(text: string) {
    const id = parseBookId(text);
    if (!id) return setError("Kode tidak dikenali. Gunakan QR dari halaman Cetak QR, atau ketik kode seperti ITB-0001.");
    setError(null);
    router.push(`/book/${id}`);
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>Pindai QR buku</h1>
        <p className="lede">Arahkan kamera ke QR di punggung buku untuk membuka riwayatnya. Pinjam dan kembali dimulai dari halaman buku itu.</p>
      </div>
      <div className="two-col">
        <section className="panel">
          <h2>Kamera</h2>
          <QrScanner onScan={open} />
        </section>
        <section className="panel">
          <h2>Tanpa kamera</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              open(code);
            }}
            className="field"
          >
            <label htmlFor="kode">Kode buku</label>
            <input id="kode" value={code} onChange={(e) => setCode(e.target.value)} placeholder="ITB-0001" autoComplete="off" />
            <button className="btn" type="submit">
              Buka riwayat
            </button>
          </form>
          {error && <p className="field-error">{error}</p>}
          <p className="muted small">Belum punya QR untuk dipindai? Buka halaman Cetak QR di komputer ini, lalu arahkan kamera ke layar.</p>
        </section>
      </div>
    </div>
  );
}
