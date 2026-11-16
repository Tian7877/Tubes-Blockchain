"use client";
import { useState } from "react";
import type { ContractTransactionResponse } from "ethers";
import { api } from "@/lib/api";
import { describeError, sendTx } from "@/lib/chain";
import { makeSamplePhoto, sha256Hex } from "@/lib/hash";
import { ROLE_LABEL } from "@/lib/format";
import type { Book, IncidentKind } from "@/lib/types";
import { PhotoPicker, type PhotoValue } from "./PhotoPicker";
import { PhotoProof } from "./PhotoProof";
import { useApp } from "./Providers";

// Aturan pinjam ada di kontrak, bukan di layar ini. Karena itu formulir pinjam tetap tampil walau buku
// sedang dipinjam: pengguna boleh mencoba, dan kontrak yang menolaknya.
export function ActionPanel({ book, onRecorded }: { book: Book; onRecorded: (txHash: string) => void }) {
  const { persona, ledger, notify } = useApp();
  const [photo, setPhoto] = useState<PhotoValue | null>(null);
  const [kind, setKind] = useState<IncidentKind>("Damaged");
  const [busy, setBusy] = useState(false);

  if (!persona || !ledger) return <p className="muted">Memuat akun dummy…</p>;
  const me = persona;
  const contract = ledger;

  const isHolder = book.holdingNow && book.holder?.toLowerCase() === me.address.toLowerCase();

  async function exec(okText: string, fn: () => Promise<ContractTransactionResponse>, upload?: PhotoValue | null) {
    setBusy(true);
    try {
      if (upload) await api.uploadPhoto(upload.blob, upload.hash);
      const { hash, blockNumber } = await sendTx(fn);
      notify("ok", `${okText} Tercatat di blok ${blockNumber}.`);
      setPhoto(null);
      onRecorded(hash);
    } catch (e) {
      notify("err", describeError(e));
    } finally {
      setBusy(false);
    }
  }

  // Percobaan pinjam tanpa memilih foto: foto contoh dibuat otomatis.
  async function tryBorrowWithSample() {
    const blob = await makeSamplePhoto(book.title, "kondisi awal");
    const hash = await sha256Hex(blob);
    await exec(`${me.name} meminjam ${book.code}.`, () => contract.borrowBook(book.id, hash), { blob, hash, url: "" });
  }

  const who = (
    <p className="panel-who">
      Bertindak sebagai <strong>{me.name}</strong>, {ROLE_LABEL[me.role].toLowerCase()}. {me.blurb}
    </p>
  );

  // ---------------------------------------------------------------- pustakawan
  if (me.role === "pustakawan") {
    const locked = book.status === "LostOrDamaged" || !!book.pendingIncident;
    return (
      <div className="panel">
        <h2>Aksi</h2>
        {who}
        {locked ? (
          <p>
            {book.pendingIncident
              ? "Sudah ada laporan yang menunggu keputusan pengurus. Ganti ke akun Pak Hendra untuk memutuskan."
              : "Buku ini sudah berstatus hilang/rusak. Pengurus bisa memulihkannya bila buku diganti."}
          </p>
        ) : (
          <>
            <fieldset className="field">
              <legend>Laporkan buku ini</legend>
              <label className="radio"><input type="radio" checked={kind === "Damaged"} onChange={() => setKind("Damaged")} /> Rusak (foto bukti wajib)</label>
              <label className="radio"><input type="radio" checked={kind === "Lost"} onChange={() => setKind("Lost")} /> Hilang</label>
            </fieldset>
            <PhotoPicker label="Foto bukti" optional={kind === "Lost"} sampleTitle={book.title} samplePhase="bukti kerusakan" value={photo} onChange={setPhoto} />
            <button
              className="btn btn-warn"
              disabled={busy || (kind === "Damaged" && !photo)}
              onClick={() =>
                exec(
                  "Laporan dikirim, menunggu pengurus.",
                  () => contract.reportIncident(book.id, kind === "Lost" ? 1 : 2, photo?.hash ?? "0x" + "0".repeat(64)),
                  photo
                )
              }
            >
              Kirim laporan ke pengurus
            </button>
            <p className="muted small">Laporan belum mengubah status buku. Status baru sah setelah pengurus menyetujui.</p>
          </>
        )}
      </div>
    );
  }

  // ------------------------------------------------------------------ pengurus
  if (me.role === "pengurus") {
    const pending = book.pendingIncident;
    return (
      <div className="panel">
        <h2>Aksi</h2>
        {who}
        {pending ? (
          <>
            <p>
              Ada laporan buku <strong>{pending.kind === "Lost" ? "hilang" : "rusak"}</strong> yang menunggu keputusan Anda.
            </p>
            {pending.evidenceHash && <PhotoProof hash={pending.evidenceHash} caption="Foto bukti dari pustakawan" />}
            <div className="btn-row">
              <button className="btn btn-danger" disabled={busy} onClick={() => exec("Laporan disetujui, status buku berubah.", () => contract.approveIncident(book.id))}>
                Setujui laporan
              </button>
              <button className="btn btn-quiet" disabled={busy} onClick={() => exec("Laporan ditolak.", () => contract.rejectIncident(book.id))}>
                Tolak laporan
              </button>
            </div>
          </>
        ) : book.status === "LostOrDamaged" ? (
          <>
            <p>Buku ini berstatus hilang/rusak. Bila sudah diganti atau diperbaiki, pulihkan agar bisa dipinjam lagi. Riwayat lama tetap ada.</p>
            <button className="btn" disabled={busy} onClick={() => exec("Buku dipulihkan.", () => contract.restoreBook(book.id))}>
              Pulihkan buku
            </button>
          </>
        ) : (
          <p>Tidak ada laporan yang menunggu keputusan untuk buku ini.</p>
        )}
      </div>
    );
  }

  // ------------------------------------------------------- peminjam dan tamu
  const notMember = me.role === "tamu";
  return (
    <div className="panel">
      <h2>Aksi</h2>
      {who}
      {notMember && <p className="callout">Akun ini bukan anggota terdaftar. Coba pinjam: kontrak akan menolaknya.</p>}

      {book.status === "LostOrDamaged" && <p>Buku ini berstatus hilang/rusak, jadi tidak bisa dipinjam.</p>}

      {book.status === "Available" && (
        <>
          <PhotoPicker label="Foto kondisi awal" sampleTitle={book.title} samplePhase="kondisi awal" value={photo} onChange={setPhoto} />
          <button
            className="btn"
            disabled={busy || !photo}
            onClick={() => photo && exec(`${me.name} meminjam ${book.code}.`, () => contract.borrowBook(book.id, photo.hash), photo)}
          >
            Pinjam buku ini
          </button>
          {!photo && <p className="muted small">Foto kondisi wajib. Pilih foto atau buat foto contoh.</p>}
        </>
      )}

      {isHolder && (
        <>
          <p>Anda sedang memegang buku ini. Foto kondisi akhir diperlukan untuk mengembalikan.</p>
          <PhotoPicker label="Foto kondisi akhir" sampleTitle={book.title} samplePhase="kondisi akhir" value={photo} onChange={setPhoto} />
          <button
            className="btn"
            disabled={busy || !photo}
            onClick={() => photo && exec(`${me.name} mengembalikan ${book.code}.`, () => contract.returnBook(book.id, photo.hash), photo)}
          >
            Kembalikan buku
          </button>
        </>
      )}

      {book.holdingNow && !isHolder && (
        <>
          <p>
            Buku ini sedang dipegang <strong>{book.holderName}</strong>. Anda tetap boleh mencoba meminjamnya untuk melihat aturan kontrak bekerja.
          </p>
          <button className="btn btn-warn" disabled={busy} onClick={tryBorrowWithSample}>
            Coba pinjam juga
          </button>
        </>
      )}
    </div>
  );
}
