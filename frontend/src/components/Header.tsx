"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ROLE_LABEL } from "@/lib/format";
import { useApp } from "./Providers";

const NAV = [
  { href: "/", label: "Katalog" },
  { href: "/scan", label: "Pindai QR" },
  { href: "/uji-curang", label: "Uji curang" },
  { href: "/qr", label: "Cetak QR" },
  { href: "/sus", label: "Kuesioner SUS" },
];

function Mark() {
  // Buku dengan mata rantai di sampulnya.
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
      <rect x="5" y="3" width="24" height="28" rx="2" fill="#fff" />
      <rect x="5" y="3" width="6" height="28" rx="2" fill="#F2A900" />
      <g fill="none" stroke="#0B4F9E" strokeWidth="2.4" strokeLinecap="round">
        <rect x="14" y="10" width="10" height="6" rx="3" />
        <rect x="14" y="18" width="10" height="6" rx="3" />
      </g>
    </svg>
  );
}

export function Header() {
  const pathname = usePathname();
  const { dep, health, persona, setPersonaKey } = useApp();
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link href="/" className="brand">
          <Mark />
          <span>
            <strong>Ledger Pustaka ITB</strong>
            <small>Simulasi Ledger Pustaka </small>
          </span>
        </Link>
        <nav className="nav" aria-label="Utama">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={(n.href === "/" ? pathname === "/" || pathname.startsWith("/book") : pathname.startsWith(n.href)) ? "page" : undefined}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="topbar-right">
          <label className="persona">
            <span>Masuk sebagai</span>
            <select value={persona?.key ?? ""} onChange={(e) => setPersonaKey(e.target.value)} disabled={!dep}>
              {dep?.personas.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name}, {ROLE_LABEL[p.role]}
                </option>
              ))}
            </select>
          </label>
          <span className={`chain ${health?.ok ? "chain-up" : "chain-down"}`} title={health?.contract ?? ""}>
            <i aria-hidden="true" />
            {health?.ok ? `Blok ${health.blockNumber}` : "Chain mati"}
          </span>
        </div>
      </div>
    </header>
  );
}
