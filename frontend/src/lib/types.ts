export type Role = "pustakawan" | "pengurus" | "peminjam" | "tamu";

export interface Persona {
  key: string;
  name: string;
  role: Role;
  blurb: string;
  address: string;
  privateKey: string; // kunci publik Hardhat, hanya untuk simulasi lokal
}

export interface Deployment {
  chainId: number;
  rpcUrl: string;
  address: string;
  abi: unknown[];
  loanPeriodSeconds: number;
  deployedAt: string;
  personas: Persona[];
}

export type BookStatus = "Available" | "Borrowed" | "Overdue" | "LostOrDamaged";
export type IncidentKind = "Lost" | "Damaged";

export interface Book {
  id: number;
  code: string;
  title: string;
  author: string;
  callNumber: string;
  location: string;
  year: number | null;
  catalogHash: string;
  catalogOk: boolean;
  status: BookStatus;
  holder: string | null;
  holderName: string | null;
  holdingNow: boolean;
  borrowedAt: number | null;
  dueAt: number | null;
  pendingIncident: { kind: IncidentKind; evidenceHash: string | null } | null;
  entries: number;
}

export type EventType =
  | "MemberRegistered"
  | "BookAdded"
  | "Borrowed"
  | "Returned"
  | "IncidentReported"
  | "IncidentApproved"
  | "IncidentRejected"
  | "BookRestored";

export interface LedgerEvent {
  id: string;
  type: EventType;
  bookId: number | null;
  bookTitle?: string | null;
  actor: string;
  actorName: string;
  actorRole: string;
  photoHash: string | null;
  details: {
    dueAt?: number;
    late?: boolean;
    kind?: IncidentKind;
    member?: string;
    memberName?: string;
    catalogHash?: string;
  };
  txHash: string;
  blockNumber: number;
  timestamp: number;
}

export interface ChainInfo {
  chainId: number;
  blockNumber: number;
  timestamp: number;
  contract: string;
}

export interface Health extends Partial<ChainInfo> {
  ok: boolean;
  reason?: string;
}

export interface BooksResponse {
  books: Book[];
  stats: {
    ledgerEntries: number;
    loanEntries: number;
    borrowed: number;
    overdue: number;
    lostOrDamaged: number;
    pending: number;
  };
  chain: ChainInfo;
}

export interface BookResponse {
  book: Book;
  events: LedgerEvent[];
  chain: ChainInfo;
}

export interface VerifyResult {
  exists: boolean;
  ok: boolean;
  expected: string;
  actual: string | null;
}
