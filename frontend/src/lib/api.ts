import type { BookResponse, BooksResponse, Deployment, Health, LedgerEvent, VerifyResult } from "./types";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API_URL + path, { cache: "no-store", ...init });
  } catch {
    throw new Error("API tidak terjangkau. Pastikan backend berjalan (npm run dev).");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? res.statusText);
  return body as T;
}

const json = (data: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(data),
});

export const api = {
  health: () => request<Health>("/health"),
  config: () => request<Deployment>("/config"),
  books: () => request<BooksResponse>("/books"),
  book: (id: number) => request<BookResponse>(`/books/${id}`),
  events: (limit = 12) => request<{ events: LedgerEvent[] }>(`/events?limit=${limit}`),
  photoUrl: (hash: string) => `${API_URL}/photos/${hash}`,
  verifyPhoto: (hash: string) => request<VerifyResult>(`/photos/${hash}/verify`),
  uploadPhoto: (blob: Blob, hash: string) =>
    request<{ hash: string }>("/photos", {
      method: "POST",
      headers: { "content-type": blob.type || "image/png", "x-photo-hash": hash },
      body: blob,
    }),
  timeTravel: (days: number) => request<{ ok: boolean }>("/dev/time-travel", json({ days })),
  resetDemo: () => request<{ ok: boolean; ledgerEntries: number }>("/dev/reset", { method: "POST" }),
  tamper: (hash: string) => request<{ ok: boolean }>(`/dev/tamper/${hash}`, { method: "POST" }),
  restore: (hash: string) => request<{ ok: boolean }>(`/dev/restore/${hash}`, { method: "POST" }),
  submitSus: (answers: number[], role: string) =>
    request<{ score: number }>("/sus", json({ answers, role })),
  sus: () => request<{ count: number; average: number | null }>("/sus"),
};
