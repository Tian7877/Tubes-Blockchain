import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Header } from "@/components/Header";
import { Providers } from "@/components/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ledger Pustaka ITB (simulasi)",
  description: "Prototipe riwayat peminjaman buku Perpustakaan ITB di atas blockchain lokal. Semua data dummy.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <body>
        <Providers>
          <Header />
          <main>{children}</main>
          <footer className="footer">
            Simulasi untuk tugas besar Infrastruktur Blockchain. Semua pelaku, buku, dan transaksi adalah dummy, dan berjalan di jaringan lokal.
          </footer>
        </Providers>
      </body>
    </html>
  );
}
