"use client";
import { hexlify, id as keccak, randomBytes } from "ethers";
import { useState } from "react";
import { PhotoProof } from "@/components/PhotoProof";
import { useApp } from "@/components/Providers";
import { api } from "@/lib/api";
import { describeError, revertReason, sendTx, walletFor } from "@/lib/chain";
import { makeSamplePhoto, sha256Hex } from "@/lib/hash";
import { shortHash } from "@/lib/format";
import { usePolling } from "@/lib/hooks";

type Key = "A" | "B" | "C";
interface Line {
  tone: "ok" | "bad" | "info";
  text: string;
}
interface Result {
  running: boolean;
  rejected: boolean | null; // true = percobaan curang berhasil ditahan
  lines: Line[];
}
const IDLE: Result = { running: false, rejected: null, lines: [] };
const randomHash = () => hexlify(randomBytes(32));

export default function CheatTestPage() {
  const { dep, ledgerAs, notify } = useApp();
  const stats = usePolling(() => api.books(), [], 4000);
  const [res, setRes] = useState<Record<Key, Result>>({ A: IDLE, B: IDLE, C: IDLE });
  const [tampered, setTampered] = useState<string | null>(null);
  const [proofKey, setProofKey] = useState(0);
  const [days, setDays] = useState(8);
  const [resetting, setResetting] = useState(false);
  const [timing, setTiming] = useState<{ avg: number; min: number; max: number } | null>(null);

  const passed = (Object.values(res) as Result[]).filter((r) => r.rejected === true).length;
  const ready = !!dep;

  const begin = (k: Key) => setRes((r) => ({ ...r, [k]: { running: true, rejected: null, lines: [] } }));
  const finish = (k: Key, rejected: boolean | null, lines: Line[]) => {
    setRes((r) => ({ ...r, [k]: { running: false, rejected, lines } }));
    void stats.refresh();
  };

  // ---------------------------------------------------------------- uji curang A
  async function testA() {
    if (!dep) return;
    begin("A");
    const lines: Line[] = [];
    try {
      const { books } = await api.books();
      let target = books.find((b) => b.holdingNow);
      if (!target) {
        const free = books.find((b) => b.status === "Available");
        if (!free) throw new Error("Tidak ada buku tersedia untuk dipakai uji.");
        const blob = await makeSamplePhoto(free.title, "kondisi awal");
        const hash = await sha256Hex(blob);
        await api.uploadPhoto(blob, hash);
        await sendTx(() => ledgerAs("aulia").borrowBook(free.id, hash));
        lines.push({ tone: "info", text: `Persiapan: Aulia meminjam ${free.code} lewat transaksi sah.` });
        target = { ...free, holder: dep.personas.find((p) => p.key === "aulia")!.address, holderName: "Aulia" };
      }
      const book = target;
      const attacker = dep.personas.find((p) => p.role === "peminjam" && p.address.toLowerCase() !== book.holder?.toLowerCase())!;
      lines.push({ tone: "info", text: `${attacker.name} (anggota terdaftar) mencoba meminjam ${book.code} yang sedang dipegang ${book.holderName}.` });
      try {
        await sendTx(() => ledgerAs(attacker.key).borrowBook(book.id, randomHash()));
        lines.push({ tone: "bad", text: "Transaksi BERHASIL. Aturan kontrak gagal mencegah peminjaman ganda." });
        finish("A", false, lines);
      } catch (e) {
        lines.push({ tone: "ok", text: describeError(e) });
        finish("A", revertReason(e) === "not available", lines);
      }
    } catch (e) {
      lines.push({ tone: "bad", text: describeError(e) });
      finish("A", null, lines);
    }
  }

  // ---------------------------------------------------------------- uji curang B
  async function testB() {
    begin("B");
    const lines: Line[] = [];
    try {
      const { books } = await api.books();
      const book = books.find((b) => b.status === "Available") ?? books[0];
      lines.push({ tone: "info", text: `Tamu (bukan anggota terdaftar) mencoba meminjam ${book.code}.` });
      try {
        await sendTx(() => ledgerAs("tamu").borrowBook(book.id, randomHash()));
        lines.push({ tone: "bad", text: "Transaksi BERHASIL. Kontrak gagal memeriksa keanggotaan." });
        finish("B", false, lines);
      } catch (e) {
        lines.push({ tone: "ok", text: describeError(e) });
        finish("B", revertReason(e) === "not member", lines);
      }
    } catch (e) {
      lines.push({ tone: "bad", text: describeError(e) });
      finish("B", null, lines);
    }
  }

  // ---------------------------------------------------------------- uji curang C
  async function testC() {
    if (!dep) return;
    begin("C");
    const lines: Line[] = [];
    try {
      // C1: pemegang hak terbesar (pustakawan) mencoba mengubah catatan lama.
      const librarian = dep.personas.find((p) => p.role === "pustakawan")!;
      lines.push({ tone: "info", text: `${librarian.name} (pustakawan) mencoba memanggil editHistory(uint256,address) untuk mengubah catatan lama.` });
      let c1 = false;
      try {
        const data = keccak("editHistory(uint256,address)").slice(0, 10) + "0".repeat(128);
        await (await walletFor(dep, librarian).sendTransaction({ to: dep.address, data })).wait();
        lines.push({ tone: "bad", text: "Transaksi BERHASIL. Riwayat bisa diubah." });
      } catch (e) {
        c1 = true;
        lines.push({ tone: "ok", text: `${describeError(e)} Kontrak tidak punya fungsi untuk mengubah atau menghapus riwayat.` });
      }

      // C2: foto diubah setelah dicatat.
      const withPhoto = (await api.events(100)).events.filter((e) => e.photoHash);
      let c2: boolean | null = null;
      if (withPhoto.length === 0) {
        lines.push({ tone: "info", text: "Belum ada foto tercatat. Lakukan satu peminjaman dulu, lalu ulangi uji ini." });
      } else {
        const hash = withPhoto[withPhoto.length - 1].photoHash!;
        await api.tamper(hash);
        setTampered(hash);
        const v = await api.verifyPhoto(hash);
        lines.push({ tone: "info", text: `Satu byte file foto ${shortHash(hash)} diubah di storage, tanpa menyentuh chain.` });
        c2 = !v.ok;
        lines.push(
          v.ok
            ? { tone: "bad", text: "Hash masih cocok. Pemalsuan tidak terdeteksi." }
            : { tone: "ok", text: `Hash TIDAK COCOK. Catatan chain: ${shortHash(v.expected)}, isi file kini: ${shortHash(v.actual ?? "")}.` }
        );
        setProofKey((k) => k + 1);
      }
      finish("C", c2 === null ? null : c1 && c2, lines);
    } catch (e) {
      lines.push({ tone: "bad", text: describeError(e) });
      finish("C", null, lines);
    }
  }

  async function restore() {
    if (!tampered) return;
    try {
      await api.restore(tampered);
      setTampered(null);
      setProofKey((k) => k + 1);
      notify("ok", "Foto dipulihkan ke isi aslinya.");
    } catch (e) {
      notify("err", e instanceof Error ? e.message : String(e));
    }
  }

  async function resetDemo() {
    if (!window.confirm("Kembalikan demo ke kondisi awal? Transaksi yang dibuat setelah data demo akan hilang dan jam chain kembali ke semula.")) return;
    setResetting(true);
    try {
      const r = await api.resetDemo();
      setRes({ A: IDLE, B: IDLE, C: IDLE });
      setTampered(null);
      setTiming(null);
      setProofKey((k) => k + 1);
      notify("ok", `Demo dikembalikan ke kondisi awal (${r.ledgerEntries} entri ledger).`);
      void stats.refresh();
    } catch (e) {
      notify("err", e instanceof Error ? e.message : String(e));
    } finally {
      setResetting(false);
    }
  }

  async function measure() {
    const t: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      await api.book(1);
      t.push(performance.now() - t0);
    }
    setTiming({ avg: t.reduce((a, b) => a + b, 0) / t.length, min: Math.min(...t), max: Math.max(...t) });
  }

  async function travel() {
    try {
      await api.timeTravel(days);
      notify("ok", `Jam chain digeser ${days} hari. Buku yang sedang dipinjam kini melewati jatuh tempo.`);
      void stats.refresh();
    } catch (e) {
      notify("err", e instanceof Error ? e.message : String(e));
    }
  }

  const card = (k: Key, title: string, what: string, run: () => void) => {
    const r = res[k];
    return (
      <section className={`panel test ${r.rejected === true ? "test-pass" : r.rejected === false ? "test-fail" : ""}`}>
        <h2>
          {title}
          {r.rejected === true && <span className="verdict ok-text">Ditolak, sesuai harapan</span>}
          {r.rejected === false && <span className="verdict bad-text">Lolos, ini bug</span>}
        </h2>
        <p>{what}</p>
        <button className="btn" onClick={run} disabled={r.running || !ready}>
          {r.running ? "Menjalankan…" : r.lines.length ? "Jalankan lagi" : "Jalankan uji"}
        </button>
        {r.lines.length > 0 && (
          <ul className="log">
            {r.lines.map((l, i) => (
              <li key={i} className={`log-${l.tone}`}>
                {l.text}
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>Uji curang</h1>
        <p className="lede">
          Tiga percobaan curang dari rencana demo. Tiap percobaan dikirim sungguhan ke kontrak di chain lokal, dan semuanya harus ditolak atau terdeteksi.
        </p>
      </div>

      <dl className="metrics">
        <div>
          <dt>Percobaan curang ditolak</dt>
          <dd>{passed} dari 3</dd>
        </div>
        <div>
          <dt>Entri tercatat di ledger</dt>
          <dd>{stats.data?.stats.ledgerEntries ?? "…"}</dd>
        </div>
        <div>
          <dt>Waktu cek riwayat satu buku</dt>
          <dd>
            {timing ? `${timing.avg.toFixed(0)} ms` : "belum diukur"}
            <button className="link-btn" onClick={measure}>
              Ukur
            </button>
          </dd>
        </div>
      </dl>

      <div className="tests">
        {card("A", "Uji A: pinjam buku yang sedang dipinjam", "Anggota lain mencoba meminjam buku yang masih dipegang orang. Kontrak harus menolak.", testA)}
        {card("B", "Uji B: peminjam tidak terdaftar", "Akun yang bukan anggota mencoba meminjam. Kontrak harus menolak.", testB)}
        {card("C", "Uji C: ubah catatan lama atau foto", "Pustakawan mencoba mengubah riwayat, lalu satu byte foto kondisi diubah di storage. Riwayat tidak bisa diubah dan hash foto tidak lagi cocok.", testC)}
      </div>

      {tampered && (
        <section className="panel">
          <h2>Foto yang baru dipalsukan</h2>
          <PhotoProof hash={tampered} caption="Foto di storage setelah diubah" refreshKey={proofKey} />
          <button className="btn btn-quiet" onClick={restore}>
            Pulihkan foto asli
          </button>
        </section>
      )}

      <section className="panel">
        <h2>Alat bantu demo</h2>
        <p>
          Geser jam chain lokal supaya status <em>terlambat</em> bisa dilihat tanpa menunggu 7 hari. Jam chain tidak bisa dimundurkan satu per satu, tetapi tombol <em>Reset demo</em> mengembalikan seluruh chain ke kondisi
          awal sehingga demo bisa diulang.
        </p>
        <div className="btn-row">
          <label className="inline">
            Geser maju
            <input type="number" min={1} max={365} value={days} onChange={(e) => setDays(Number(e.target.value))} />
            hari
          </label>
          <button className="btn btn-quiet" onClick={travel}>
            Geser jam chain
          </button>
          <button className="btn btn-danger" onClick={resetDemo} disabled={resetting || !ready}>
            {resetting ? "Mengembalikan…" : "Reset demo"}
          </button>
        </div>
      </section>
    </div>
  );
}
