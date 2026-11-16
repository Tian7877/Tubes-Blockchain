import { STATUS_LABEL } from "@/lib/format";
import type { BookStatus, IncidentKind } from "@/lib/types";

export function Stamp({ status }: { status: BookStatus }) {
  return <span className={`stamp stamp-${status}`}>{STATUS_LABEL[status]}</span>;
}

export function PendingStamp({ kind }: { kind: IncidentKind }) {
  return <span className="stamp stamp-pending">Menunggu pengurus: {kind === "Lost" ? "hilang" : "rusak"}</span>;
}
