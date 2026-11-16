import { Contract, JsonRpcProvider, Network, Wallet } from "ethers";
import type { ContractTransactionResponse } from "ethers";
import type { Deployment, Persona } from "./types";

let cached: { key: string; provider: JsonRpcProvider } | null = null;

function providerFor(dep: Deployment): JsonRpcProvider {
  const key = `${dep.rpcUrl}|${dep.chainId}`;
  if (!cached || cached.key !== key) {
    const network = Network.from(dep.chainId);
    cached = { key, provider: new JsonRpcProvider(dep.rpcUrl, network, { staticNetwork: network, cacheTimeout: -1 }) };
  }
  return cached.provider;
}

export function walletFor(dep: Deployment, persona: Persona): Wallet {
  return new Wallet(persona.privateKey, providerFor(dep));
}

export function ledgerFor(dep: Deployment, persona: Persona): Contract {
  return new Contract(dep.address, dep.abi as never, walletFor(dep, persona));
}

// Alasan penolakan dari require() di kontrak, diterjemahkan untuk pengguna.
const REASONS: Record<string, string> = {
  "not available": "Buku tidak tersedia: sedang dipinjam atau berstatus hilang/rusak.",
  "not member": "Akun ini bukan anggota terdaftar, jadi tidak boleh meminjam.",
  "no photo": "Foto kondisi wajib ada. Hash foto tidak boleh kosong.",
  "not borrowed": "Buku ini sedang tidak dipinjam.",
  "not holder": "Hanya pemegang buku yang boleh mengembalikannya.",
  "not librarian": "Hanya pustakawan yang boleh melakukan ini.",
  "not steward": "Hanya pengurus yang boleh menyetujui atau menolak.",
  "case pending": "Sudah ada kasus yang menunggu keputusan pengurus.",
  "no evidence": "Laporan buku rusak wajib menyertakan foto bukti.",
  "no pending case": "Tidak ada kasus yang menunggu keputusan.",
  "already lost/damaged": "Buku ini sudah berstatus hilang/rusak.",
  "not lost/damaged": "Buku ini tidak berstatus hilang/rusak.",
  "no such book": "Buku tidak ditemukan di kontrak.",
};

interface EthersLikeError {
  reason?: string;
  shortMessage?: string;
  message?: string;
  revert?: { args?: unknown[] };
  info?: { error?: { message?: string } };
}

export function revertReason(err: unknown): string | null {
  const e = err as EthersLikeError;
  const direct = e?.reason ?? e?.revert?.args?.[0];
  // "require(false)" = revert tanpa data, mis. memanggil fungsi yang tidak ada di kontrak.
  if (typeof direct === "string" && direct && direct !== "require(false)") return direct;
  const text = `${e?.info?.error?.message ?? ""} ${e?.shortMessage ?? ""} ${e?.message ?? ""}`;
  const m = text.match(/reverted with reason string '([^']+)'/);
  return m ? m[1] : null;
}

export function describeError(err: unknown): string {
  const reason = revertReason(err);
  if (reason) return `Ditolak kontrak (${reason}). ${REASONS[reason] ?? ""}`.trim();
  const e = err as EthersLikeError;
  const text = `${e?.shortMessage ?? ""} ${e?.message ?? ""}`;
  if (/revert|CALL_EXCEPTION|selector/i.test(text)) return "Ditolak kontrak: fungsi atau aturan itu tidak ada.";
  if (/fetch|network|ECONNREFUSED|failed to detect/i.test(text)) {
    return "Node blockchain tidak terjangkau. Pastikan `npm run dev` masih berjalan.";
  }
  return e?.shortMessage ?? e?.message ?? "Terjadi kesalahan tak dikenal.";
}

export async function sendTx(fn: () => Promise<ContractTransactionResponse>) {
  const tx = await fn();
  const receipt = await tx.wait();
  return { hash: tx.hash, blockNumber: receipt?.blockNumber ?? 0 };
}
