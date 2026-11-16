# Ledger Pustaka ITB (prototipe)

Simulasi riwayat peminjaman buku Perpustakaan ITB di atas blockchain lokal, untuk tugas besar Infrastruktur Blockchain.
Semua pelaku, buku, dan transaksi adalah **dummy**. Tidak ada NIM atau data pribadi nyata.

## Prasyarat

- Node.js 20 atau 22 LTS (cek: `node -v`)
- Koneksi internet saat instalasi pertama (npm, dan Hardhat mengunduh compiler Solidity 0.8.24 sekali)
- Browser Chrome, Edge, atau Firefox. Buka aplikasi lewat `http://localhost:3000` (bukan IP), karena hash foto memakai `crypto.subtle`.

## Menjalankan

```bash
npm install      # memasang root, backend, dan frontend sekaligus
npm run dev      # menyalakan chain, deploy kontrak, isi data demo, API, dan web
```

Tunggu sampai terminal menampilkan `API indexer siap` dan `Ready`, lalu buka http://localhost:3000.

Chain lokal bersifat sementara: setiap `npm run dev` dimulai dari nol (kontrak baru, data demo baru, foto lama dihapus).
Hentikan dengan `Ctrl+C`.

Untuk mengulang demo tanpa menyalakan ulang, pakai tombol **Reset demo** di menu *Uji curang* (bagian *Alat bantu demo*).
Tombol ini mengembalikan chain ke kondisi tepat setelah data demo diisi, termasuk jam chain yang sudah digeser.

### Menjalankan manual (tiga terminal)

```bash
npm run chain    # terminal 1: node Hardhat di :8545
npm run deploy   # terminal 2: deploy kontrak + daftarkan 5 buku dan 2 anggota
npm run seed     #             (opsional) isi transaksi demo + snapshot untuk tombol Reset demo
npm run api      #             indexer + API di :4000
npm run web      # terminal 3: Next.js di :3000
```

### Uji otomatis kontrak

```bash
npm test         # 11 uji: jalur sukses + 3 jalur curang + aturan tambahan
```

## Akun dummy (pilih di pojok kanan atas)

| Akun | Peran | Bisa apa |
| --- | --- | --- |
| Bu Rina | Pustakawan | Melaporkan buku hilang atau rusak |
| Pak Hendra | Pengurus | Menyetujui, menolak, atau memulihkan kasus |
| Aulia, Budi | Peminjam (terdaftar) | Pinjam dan kembali |
| Tamu | Bukan anggota | Dipakai untuk uji curang B |

Kunci akun memakai mnemonic bawaan Hardhat yang bersifat publik. Jangan pernah dipakai di jaringan sungguhan.

## Skenario demo (slide 10)

1. **Daftarkan buku**: sudah dilakukan skrip deploy (5 buku). Cetak QR di menu *Cetak QR*.
2. **Pinjam**: masuk sebagai Aulia, buka buku yang tersedia, pilih atau buat foto contoh, klik *Pinjam buku ini*.
3. **Kembali**: buka buku yang sama, klik *Kembalikan buku* dengan foto kondisi akhir.
4. **Lihat riwayat**: *Kartu riwayat* di halaman buku memuat semua peminjam, foto, nomor blok, dan hash transaksi.
5. **Uji curang A, B, C**: menu *Uji curang*, jalankan satu per satu. Targetnya 3 dari 3 ditolak atau terdeteksi.
6. **Terlambat**: di *Uji curang*, geser jam chain 8 hari, lalu lihat status berubah menjadi Terlambat.
7. **Hilang atau rusak**: masuk sebagai Bu Rina, laporkan buku, lalu ganti ke Pak Hendra untuk menyetujui.
8. **SUS**: menu *Kuesioner SUS*. Hasil tersimpan di `backend/results/sus.json`.
9. **Ulangi dari awal**: di *Uji curang*, klik *Reset demo*. Katalog, riwayat, foto, dan jam chain kembali ke kondisi awal (2 buku dipinjam, 1 kasus menunggu pengurus, 14 entri ledger). Hasil SUS tidak ikut terhapus.

## Arsitektur (5 lapis, slide 7)

| Lapis | Implementasi |
| --- | --- |
| Presentasi | `frontend/` Next.js (App Router, TypeScript): katalog, explorer riwayat, QR, panel peran |
| Logika | `backend/contracts/LibraryLedger.sol`: status buku, aturan pinjam, persetujuan pengurus |
| Data dan bukti | `backend/api/server.js`: indexer baca-saja dari event kontrak, penyimpanan foto off-chain, verifikasi hash |
| Identitas | `backend/personas.js`: akun dummy per peran, ditandatangani langsung di browser |
| Jaringan | Hardhat node lokal (EVM, chain id 31337) |

Alur tulis: browser menghitung SHA-256 foto, mengunggah foto ke API (disimpan off-chain), lalu menandatangani transaksi
langsung ke chain dengan hash foto. API **tidak pernah menulis ke chain**; ia hanya membaca event dan memverifikasi hash.
Alat bantu demo (`/dev/*`) juga tidak mengirim transaksi, tetapi mengendalikan node Hardhat lokal: geser jam, palsukan foto, dan reset ke snapshot. Ketiganya tidak akan bekerja di jaringan sungguhan.

```
ledger-pustaka-itb/
├─ backend/
│  ├─ contracts/LibraryLedger.sol
│  ├─ test/LibraryLedger.test.js
│  ├─ scripts/deploy.js, seed-demo.js
│  ├─ api/server.js
│  ├─ data/catalog.json         katalog dummy (off-chain, hash-nya di chain)
│  └─ personas.js
└─ frontend/src/{app,components,lib}
```

## Pemecahan masalah

- **Banner "Backend belum siap"**: pastikan `npm run dev` masih berjalan dan tidak ada galat di terminal.
- **Port terpakai (8545, 4000, 3000)**: tutup proses lama. Port API bisa diganti lewat `PORT=4001 npm run api` dan `NEXT_PUBLIC_API_URL` di `frontend/.env.local`.
- **Reset demo gagal ("Belum ada snapshot demo" atau "Snapshot sudah tidak berlaku")**: snapshot dibuat oleh `npm run seed` dan hilang bila node chain di-restart. Jalankan ulang `npm run dev` (atau `npm run deploy` lalu `npm run seed`).
- **Setelah restart chain tampilan aneh**: muat ulang halaman (F5). Aplikasi mendeteksi kontrak baru otomatis dalam beberapa detik.
- **Kamera QR tidak terbuka**: izinkan akses kamera, atau ketik kode seperti `ITB-0001` di halaman Pindai QR.
- **Windows PowerShell menolak skrip**: jalankan dari Command Prompt atau Git Bash.

## Batasan (sesuai slide 12)

Foto bisa dipalsukan sebelum di-hash (oracle problem); mitigasinya persetujuan pengurus. Hash tidak membuktikan buku benar-benar utuh.
Ini bukti konsep di testnet lokal, bukan sistem produksi.
