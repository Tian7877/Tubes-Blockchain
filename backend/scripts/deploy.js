// Deploy LibraryLedger ke node lokal, daftarkan anggota dummy, tambahkan 5 buku,
// lalu tulis deployment.json yang dibaca oleh API dan frontend.
// Karena chain lokal bersifat sementara, deploy juga mengosongkan penyimpanan foto lama.
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { ethers } = hre;
const { MNEMONIC, PERSONAS } = require("../personas");

const ROOT = path.join(__dirname, "..");
const LOAN_DAYS = 7;

function catalogHash(entry) {
  // Hash dari data katalog persis seperti tersimpan di data/catalog.json.
  return ethers.id(JSON.stringify(entry));
}

async function main() {
  const signers = await ethers.getSigners();
  const wallets = PERSONAS.map((p) => ({
    ...p,
    wallet: ethers.HDNodeWallet.fromPhrase(MNEMONIC, undefined, `m/44'/60'/0'/0/${p.index}`),
  }));
  const byKey = Object.fromEntries(wallets.map((w) => [w.key, w]));

  const Ledger = await ethers.getContractFactory("LibraryLedger", signers[0]);
  const ledger = await Ledger.deploy(
    byKey.rina.wallet.address,
    byKey.hendra.wallet.address,
    LOAN_DAYS * 24 * 3600
  );
  await ledger.waitForDeployment();
  const address = await ledger.getAddress();
  const deployBlock = (await ethers.provider.getBlock("latest")).number;

  // Pustakawan mendaftarkan anggota dan buku (transaksi ditandatangani akun pustakawan).
  const asLibrarian = ledger.connect(byKey.rina.wallet.connect(ethers.provider));
  for (const key of ["aulia", "budi"]) {
    await (await asLibrarian.registerMember(byKey[key].wallet.address)).wait();
  }
  const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "catalog.json"), "utf8"));
  for (const entry of catalog) {
    await (await asLibrarian.addBook(catalogHash(entry))).wait();
  }

  const artifact = await hre.artifacts.readArtifact("LibraryLedger");
  const { chainId } = await ethers.provider.getNetwork();
  const deployment = {
    chainId: Number(chainId),
    rpcUrl: "http://127.0.0.1:8545",
    address,
    abi: artifact.abi,
    deployBlock,
    deployedAt: new Date().toISOString(),
    loanPeriodSeconds: LOAN_DAYS * 24 * 3600,
    personas: wallets.map((w) => ({
      key: w.key,
      name: w.name,
      role: w.role,
      blurb: w.blurb,
      address: w.wallet.address,
      privateKey: w.wallet.privateKey, // kunci publik Hardhat, hanya untuk simulasi lokal
    })),
  };
  fs.writeFileSync(path.join(ROOT, "deployment.json"), JSON.stringify(deployment, null, 2));

  // Chain baru berarti foto lama tidak relevan lagi.
  fs.rmSync(path.join(ROOT, "storage"), { recursive: true, force: true });
  fs.rmSync(path.join(ROOT, "demo-state.json"), { force: true }); // snapshot lama milik chain lama

  console.log(`LibraryLedger   : ${address}`);
  console.log(`Buku terdaftar  : ${catalog.length}`);
  console.log(`Anggota dummy   : Aulia, Budi`);
  console.log(`deployment.json : ditulis`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
