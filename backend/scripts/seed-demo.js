// Mengisi beberapa transaksi dummy supaya explorer tidak kosong saat pertama dibuka.
// Foto kondisi yang dibuat di sini berupa gambar SVG sederhana (dummy), disimpan off-chain
// di storage/photos, sedangkan hash-nya dicatat on-chain lewat transaksi.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const hre = require("hardhat");
const { ethers } = hre;

const ROOT = path.join(__dirname, "..");
const PHOTO_DIR = path.join(ROOT, "storage", "photos");

function makePhoto(title, line1, line2, hue) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420">
<rect width="640" height="420" fill="hsl(${hue},28%,92%)"/>
<rect x="190" y="50" width="260" height="320" rx="6" fill="hsl(${hue},45%,32%)"/>
<rect x="206" y="66" width="228" height="288" rx="3" fill="none" stroke="hsl(${hue},40%,70%)" stroke-width="2"/>
<text x="320" y="170" text-anchor="middle" font-family="sans-serif" font-size="20" fill="#fff">${title}</text>
<text x="320" y="200" text-anchor="middle" font-family="sans-serif" font-size="13" fill="hsl(${hue},40%,85%)">Foto contoh (dummy)</text>
<text x="24" y="392" font-family="monospace" font-size="14" fill="#223">${line1}</text>
<text x="24" y="410" font-family="monospace" font-size="12" fill="#556">${line2}</text>
</svg>`;
  const buf = Buffer.from(svg, "utf8");
  const hash = "0x" + crypto.createHash("sha256").update(buf).digest("hex");
  fs.mkdirSync(PHOTO_DIR, { recursive: true });
  fs.writeFileSync(path.join(PHOTO_DIR, `${hash.slice(2)}.svg`), buf);
  return hash;
}

async function main() {
  const dep = JSON.parse(fs.readFileSync(path.join(ROOT, "deployment.json"), "utf8"));
  const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "catalog.json"), "utf8"));
  const titleOf = (id) => catalog.find((c) => c.id === id).title.slice(0, 26);

  const ledgerAs = (key) => {
    const p = dep.personas.find((x) => x.key === key);
    return new ethers.Contract(dep.address, dep.abi, new ethers.Wallet(p.privateKey, ethers.provider));
  };
  const photo = (id, phase, who, hue) =>
    makePhoto(titleOf(id), `${catalog.find((c) => c.id === id).code} ${phase}`, `oleh ${who}`, hue);
  const send = async (tx) => (await tx).wait();

  // Buku 1: Aulia pinjam lalu kembali; Budi sedang meminjam.
  await send(ledgerAs("aulia").borrowBook(1, photo(1, "kondisi awal", "Aulia", 210)));
  await send(ledgerAs("aulia").returnBook(1, photo(1, "kondisi akhir", "Aulia", 215)));
  await send(ledgerAs("budi").borrowBook(1, photo(1, "kondisi awal", "Budi", 205)));

  // Buku 2: dipinjam dan dikembalikan Aulia.
  await send(ledgerAs("aulia").borrowBook(2, photo(2, "kondisi awal", "Aulia", 150)));
  await send(ledgerAs("aulia").returnBook(2, photo(2, "kondisi akhir", "Aulia", 155)));

  // Buku 3: Budi pinjam, pustakawan lapor rusak, menunggu persetujuan pengurus.
  await send(ledgerAs("budi").borrowBook(3, photo(3, "kondisi awal", "Budi", 270)));
  const evidence = photo(3, "bukti kerusakan", "Bu Rina", 10);
  await send(ledgerAs("rina").reportIncident(3, 2, evidence));

  // Snapshot kondisi awal demo. Tombol "Reset demo" di aplikasi mengembalikan chain ke titik ini,
  // termasuk jam chain, sehingga demo bisa diulang tanpa menyalakan ulang apa pun.
  const snapshotId = await ethers.provider.send("evm_snapshot", []);
  fs.writeFileSync(
    path.join(ROOT, "demo-state.json"),
    JSON.stringify({ snapshotId, photos: fs.readdirSync(PHOTO_DIR), createdAt: new Date().toISOString() }, null, 2)
  );

  console.log("Seed demo selesai: buku 1 sedang dipinjam, buku 3 menunggu persetujuan pengurus.");
  console.log("Snapshot demo   : tersimpan (dipakai tombol Reset demo)");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
