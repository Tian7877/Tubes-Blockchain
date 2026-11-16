import type { Book, BookStatus, LedgerEvent } from "./types";

export const shortHash = (h: string, head = 8, tail = 6) => (h.length > head + tail + 2 ? `${h.slice(0, head)}…${h.slice(-tail)}` : h);
export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export const fmtDate = (ts: number) =>
  new Date(ts * 1000).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
export const fmtTime = (ts: number) =>
  new Date(ts * 1000).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

export const STATUS_LABEL: Record<BookStatus, string> = {
  Available: "Tersedia",
  Borrowed: "Dipinjam",
  Overdue: "Terlambat",
  LostOrDamaged: "Hilang/rusak",
};

export function dueText(book: Book, chainNow: number): string | null {
  if (!book.holdingNow || !book.dueAt) return null;
  const days = Math.ceil((book.dueAt - chainNow) / 86400);
  if (days > 1) return `jatuh tempo ${fmtDate(book.dueAt)}, ${days} hari lagi`;
  if (days === 1) return `jatuh tempo ${fmtDate(book.dueAt)}, besok`;
  if (days === 0) return `jatuh tempo ${fmtDate(book.dueAt)}, hari ini`;
  return `jatuh tempo ${fmtDate(book.dueAt)}, terlambat ${-days} hari`;
}

export const SPINE_COLORS = ["#0B4F9E", "#1B7F5A", "#6A3FA8", "#B8791B", "#9B2C4A"];
export const spineColor = (id: number) => SPINE_COLORS[(id - 1) % SPINE_COLORS.length];

export type Tone = "info" | "ok" | "warn" | "bad" | "muted";

export function describeEvent(e: LedgerEvent): { label: string; tone: Tone; photoLabel?: string } {
  const kind = e.details.kind === "Lost" ? "hilang" : "rusak";
  switch (e.type) {
    case "Borrowed":
      return { label: "Dipinjam", tone: "info", photoLabel: "Foto kondisi awal" };
    case "Returned":
      return e.details.late
        ? { label: "Dikembalikan terlambat", tone: "warn", photoLabel: "Foto kondisi akhir" }
        : { label: "Dikembalikan", tone: "ok", photoLabel: "Foto kondisi akhir" };
    case "IncidentReported":
      return { label: `Dilaporkan ${kind}`, tone: "warn", photoLabel: "Foto bukti" };
    case "IncidentApproved":
      return { label: `Disetujui pengurus: ${kind}`, tone: "bad" };
    case "IncidentRejected":
      return { label: `Laporan ${kind} ditolak pengurus`, tone: "muted" };
    case "BookRestored":
      return { label: "Dipulihkan (diganti atau diperbaiki)", tone: "ok" };
    case "BookAdded":
      return { label: "Buku didaftarkan ke ledger", tone: "muted" };
    case "MemberRegistered":
      return { label: `Anggota didaftarkan: ${e.details.memberName ?? ""}`, tone: "muted" };
  }
}

export const ROLE_LABEL: Record<string, string> = {
  pustakawan: "Pustakawan",
  pengurus: "Pengurus",
  peminjam: "Peminjam",
  tamu: "Bukan anggota",
};

// Menerima isi QR (URL /book/3), kode buku (ITB-0003), atau angka biasa (3).
export function parseBookId(text: string): number | null {
  const url = text.match(/\/book\/(\d+)/);
  if (url) return Number(url[1]);
  const code = text.match(/ITB-(\d{1,4})/i);
  if (code) return Number(code[1]);
  const plain = text.trim();
  return /^\d+$/.test(plain) ? Number(plain) : null;
}
