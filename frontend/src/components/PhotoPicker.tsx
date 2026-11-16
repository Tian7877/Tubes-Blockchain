"use client";
import { useRef, useState } from "react";
import { makeSamplePhoto, sha256Hex } from "@/lib/hash";
import { shortHash } from "@/lib/format";

export interface PhotoValue {
  blob: Blob;
  hash: string;
  url: string;
}

const OK_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

interface Props {
  label: string;
  sampleTitle: string;
  samplePhase: string;
  value: PhotoValue | null;
  onChange: (v: PhotoValue | null) => void;
  optional?: boolean;
}

export function PhotoPicker({ label, sampleTitle, samplePhase, value, onChange, optional }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function take(blob: Blob | null) {
    if (value) URL.revokeObjectURL(value.url);
    setError(null);
    if (!blob) return onChange(null);
    if (!OK_TYPES.includes(blob.type)) {
      setError("Format harus PNG, JPEG, WebP, atau GIF.");
      return onChange(null);
    }
    setBusy(true);
    try {
      onChange({ blob, hash: await sha256Hex(blob), url: URL.createObjectURL(blob) });
    } catch {
      setError("Gagal menghitung hash. Buka aplikasi lewat http://localhost:3000.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="picker">
      <div className="picker-head">
        <strong>{label}</strong>
        {optional && <span className="muted"> (opsional)</span>}
      </div>
      <div className="picker-actions">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          capture="environment"
          onChange={(e) => void take(e.target.files?.[0] ?? null)}
        />
        <button type="button" className="btn btn-quiet" disabled={busy} onClick={async () => take(await makeSamplePhoto(sampleTitle, samplePhase))}>
          Buat foto contoh
        </button>
      </div>
      {error && <p className="field-error">{error}</p>}
      {value && (
        <div className="picker-preview">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value.url} alt="Pratinjau foto" width={96} height={64} />
          <div>
            <span className="muted">Hash SHA-256 dihitung di browser</span>
            <code title={value.hash}>{shortHash(value.hash, 12, 8)}</code>
          </div>
        </div>
      )}
    </div>
  );
}
