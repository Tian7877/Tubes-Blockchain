const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const crypto = require("crypto");

const DAY = 24 * 3600;
const sha256 = (buf) => "0x" + crypto.createHash("sha256").update(buf).digest("hex");
const PHOTO_A = sha256(Buffer.from("foto kondisi awal"));
const PHOTO_B = sha256(Buffer.from("foto kondisi akhir"));
const CATALOG = ethers.id("katalog buku 1");

async function deployFixture() {
  const [admin, librarian, steward, aulia, budi, tamu] = await ethers.getSigners();
  const ledger = await (await ethers.getContractFactory("LibraryLedger")).deploy(
    librarian.address, steward.address, 7 * DAY
  );
  await ledger.connect(librarian).registerMember(aulia.address);
  await ledger.connect(librarian).registerMember(budi.address);
  await ledger.connect(librarian).addBook(CATALOG);
  return { ledger, admin, librarian, steward, aulia, budi, tamu };
}

describe("LibraryLedger: jalur sukses", () => {
  it("pinjam lalu kembali, status berubah dan event tercatat", async () => {
    const { ledger, aulia } = await loadFixture(deployFixture);

    await expect(ledger.connect(aulia).borrowBook(1, PHOTO_A))
      .to.emit(ledger, "Borrowed").withArgs(1, aulia.address, PHOTO_A, anyUint());
    expect(await ledger.statusOf(1)).to.equal(1); // Borrowed

    await expect(ledger.connect(aulia).returnBook(1, PHOTO_B))
      .to.emit(ledger, "Returned").withArgs(1, aulia.address, PHOTO_B, false);
    expect(await ledger.statusOf(1)).to.equal(0); // Available

    // pemegang terakhir tetap tercatat setelah dikembalikan
    expect((await ledger.getBook(1)).holder).to.equal(aulia.address);
  });

  it("buku menjadi Overdue setelah lewat jatuh tempo dan pengembalian ditandai terlambat", async () => {
    const { ledger, aulia } = await loadFixture(deployFixture);
    await ledger.connect(aulia).borrowBook(1, PHOTO_A);
    await time.increase(8 * DAY);
    expect(await ledger.statusOf(1)).to.equal(2); // Overdue
    await expect(ledger.connect(aulia).returnBook(1, PHOTO_B))
      .to.emit(ledger, "Returned").withArgs(1, aulia.address, PHOTO_B, true);
  });
});

describe("LibraryLedger: tiga jalur curang (slide 10)", () => {
  it("A: buku yang sedang dipinjam tidak bisa dipinjam lagi", async () => {
    const { ledger, aulia, budi } = await loadFixture(deployFixture);
    await ledger.connect(aulia).borrowBook(1, PHOTO_A);
    await expect(ledger.connect(budi).borrowBook(1, PHOTO_B)).to.be.revertedWith("not available");
  });

  it("B: peminjam tidak terdaftar ditolak", async () => {
    const { ledger, tamu } = await loadFixture(deployFixture);
    await expect(ledger.connect(tamu).borrowBook(1, PHOTO_A)).to.be.revertedWith("not member");
  });

  it("C1: kontrak tidak punya fungsi untuk mengubah atau menghapus riwayat", async () => {
    const { ledger, aulia } = await loadFixture(deployFixture);
    const fns = ledger.interface.fragments.filter((f) => f.type === "function").map((f) => f.name);
    expect(fns.filter((n) => /edit|update|delete|remove|set/i.test(n))).to.deep.equal([]);

    // Memanggil fungsi yang tidak ada ditolak oleh EVM.
    const data = ethers.id("editHistory(uint256,address)").slice(0, 10) + "0".repeat(128);
    await expect(aulia.sendTransaction({ to: await ledger.getAddress(), data })).to.be.reverted;
  });

  it("C2: foto yang diubah menghasilkan hash yang tidak cocok dengan catatan on-chain", async () => {
    const { ledger, aulia } = await loadFixture(deployFixture);
    const original = Buffer.from("piksel-asli");
    await ledger.connect(aulia).borrowBook(1, sha256(original));
    const tampered = Buffer.concat([original, Buffer.from([0])]);
    expect(sha256(tampered)).to.not.equal(sha256(original));
  });
});

describe("LibraryLedger: aturan tambahan", () => {
  it("pinjam tanpa hash foto ditolak", async () => {
    const { ledger, aulia } = await loadFixture(deployFixture);
    await expect(ledger.connect(aulia).borrowBook(1, ethers.ZeroHash)).to.be.revertedWith("no photo");
  });

  it("hanya pemegang yang bisa mengembalikan", async () => {
    const { ledger, aulia, budi } = await loadFixture(deployFixture);
    await ledger.connect(aulia).borrowBook(1, PHOTO_A);
    await expect(ledger.connect(budi).returnBook(1, PHOTO_B)).to.be.revertedWith("not holder");
  });

  it("hanya pustakawan yang boleh mendaftarkan anggota dan buku", async () => {
    const { ledger, aulia } = await loadFixture(deployFixture);
    await expect(ledger.connect(aulia).addBook(CATALOG)).to.be.revertedWith("not librarian");
    await expect(ledger.connect(aulia).registerMember(aulia.address)).to.be.revertedWith("not librarian");
  });

  it("hilang/rusak: hanya sah setelah pengurus menyetujui", async () => {
    const { ledger, librarian, steward, aulia } = await loadFixture(deployFixture);
    await ledger.connect(aulia).borrowBook(1, PHOTO_A);

    await expect(ledger.connect(aulia).reportIncident(1, 2, PHOTO_B)).to.be.revertedWith("not librarian");
    await expect(ledger.connect(librarian).reportIncident(1, 2, ethers.ZeroHash)).to.be.revertedWith("no evidence");
    await ledger.connect(librarian).reportIncident(1, 2, PHOTO_B); // rusak

    // belum disetujui: status belum berubah
    expect(await ledger.statusOf(1)).to.equal(1);
    await expect(ledger.connect(librarian).approveIncident(1)).to.be.revertedWith("not steward");

    await expect(ledger.connect(steward).approveIncident(1))
      .to.emit(ledger, "IncidentApproved").withArgs(1, steward.address, 2);
    expect(await ledger.statusOf(1)).to.equal(3); // LostOrDamaged
    await expect(ledger.connect(aulia).borrowBook(1, PHOTO_A)).to.be.revertedWith("not available");

    await ledger.connect(steward).restoreBook(1);
    expect(await ledger.statusOf(1)).to.equal(0);
  });

  it("pengurus bisa menolak laporan", async () => {
    const { ledger, librarian, steward } = await loadFixture(deployFixture);
    await ledger.connect(librarian).reportIncident(1, 1, ethers.ZeroHash); // hilang
    await ledger.connect(steward).rejectIncident(1);
    expect(await ledger.statusOf(1)).to.equal(0);
    await expect(ledger.connect(steward).rejectIncident(1)).to.be.revertedWith("no pending case");
  });
});

// withArgs dengan nilai yang tidak dipedulikan
function anyUint() {
  return () => true;
}
