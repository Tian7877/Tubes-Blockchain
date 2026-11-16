// Akun dummy per peran. Memakai mnemonic bawaan Hardhat (PUBLIK, hanya untuk lokal/simulasi).
// Tidak ada NIM atau data pribadi nyata: semua nama di bawah ini fiktif.
const MNEMONIC = "test test test test test test test test test test test junk";

const PERSONAS = [
  { key: "rina",  name: "Bu Rina",    role: "pustakawan", index: 1, blurb: "Pustakawan: mendaftarkan buku dan anggota, melaporkan buku hilang atau rusak." },
  { key: "hendra", name: "Pak Hendra", role: "pengurus",   index: 2, blurb: "Pengurus: menyetujui atau menolak kasus buku hilang atau rusak." },
  { key: "aulia", name: "Aulia",      role: "peminjam",   index: 3, blurb: "Mahasiswa terdaftar (dummy)." },
  { key: "budi",  name: "Budi",       role: "peminjam",   index: 4, blurb: "Mahasiswa terdaftar (dummy)." },
  { key: "tamu",  name: "Tamu",       role: "tamu",       index: 5, blurb: "Bukan anggota terdaftar. Dipakai untuk uji curang B." },
];

module.exports = { MNEMONIC, PERSONAS };
