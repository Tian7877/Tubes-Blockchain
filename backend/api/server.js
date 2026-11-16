// Indexer + API baca-saja untuk LibraryLedger.
//  - Membaca event kontrak dari node lokal dan menyimpannya sebagai read model (in-memory).
//  - Menyimpan foto kondisi buku DI LUAR chain (storage/photos), dinamai dengan hash-nya.
//  - Memverifikasi: hash file di storage == hash yang tercatat on-chain.
// API ini TIDAK menulis ke blockchain. Semua transaksi ditandatangani langsung oleh frontend.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const { ethers } = require("ethers");

const ROOT = path.join(__dirname, "..");
const DEPLOY_FILE = path.join(ROOT, "deployment.json");
const CATALOG_FILE = path.join(ROOT, "data", "catalog.json");
const PHOTO_DIR = path.join(ROOT, "storage", "photos");
const ORIGINAL_DIR = path.join(ROOT, "storage", "original");
const RESULTS_DIR = path.join(ROOT, "results");
const STATE_FILE = path.join(ROOT, "demo-state.json");
const PORT = Number(process.env.PORT || 4000);
const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";

const STATUS = ["Available", "Borrowed", "Overdue", "LostOrDamaged"];
const KIND = ["None", "Lost", "Damaged"];
const EXT_BY_MIME = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/svg+xml": "svg" };
const MIME_BY_EXT = Object.fromEntries(Object.entries(EXT_BY_MIME).map(([m, e]) => [e, m]));
const HASH_RE = /^0x[0-9a-f]{64}$/;
const sha256 = (buf) => "0x" + crypto.createHash("sha256").update(buf).digest("hex");

// ------------------------------------------------------------------ deployment

let dep = null;
function loadDeployment() {
  if (!fs.existsSync(DEPLOY_FILE)) return null;
  const mtime = fs.statSync(DEPLOY_FILE).mtimeMs;
  if (dep && dep.mtime === mtime) return dep;

  const json = JSON.parse(fs.readFileSync(DEPLOY_FILE, "utf8"));
  const network = ethers.Network.from(json.chainId);
  const provider = new ethers.JsonRpcProvider(RPC_URL, network, { staticNetwork: network, cacheTimeout: -1 });
  const ledger = new ethers.Contract(json.address, json.abi, provider);
  const personaByAddr = new Map(json.personas.map((p) => [p.address.toLowerCase(), p]));
  const librarian = json.personas.find((p) => p.role === "pustakawan");
  dep = { mtime, json, provider, ledger, iface: ledger.interface, personaByAddr, librarian };
  return dep;
}

function requireDeployment() {
  const d = loadDeployment();
  if (!d) {
    const err = new Error("Belum ada deployment. Jalankan: npm run deploy");
    err.status = 503;
    throw err;
  }
  return d;
}

const readCatalog = () => JSON.parse(fs.readFileSync(CATALOG_FILE, "utf8"));

// --------------------------------------------------------------------- indexer

const index = { key: null, lastBlock: -1, events: [], blockTs: new Map() };
let syncing = null;

function personaOf(d, addr) {
  return addr ? d.personaByAddr.get(addr.toLowerCase()) : undefined;
}

async function blockTimestamp(d, n) {
  if (!index.blockTs.has(n)) index.blockTs.set(n, (await d.provider.getBlock(n)).timestamp);
  return index.blockTs.get(n);
}

function normalize(d, parsed, log, timestamp) {
  const a = parsed.args;
  const ev = {
    id: `${log.transactionHash}-${log.index}`,
    type: parsed.name,
    bookId: null,
    actor: null,
    photoHash: null,
    details: {},
    txHash: log.transactionHash,
    blockNumber: log.blockNumber,
    timestamp,
  };
  switch (parsed.name) {
    case "MemberRegistered":
      ev.actor = d.librarian.address;
      ev.details = { member: a.member, memberName: personaOf(d, a.member)?.name ?? a.member };
      break;
    case "BookAdded":
      ev.bookId = Number(a.id);
      ev.actor = d.librarian.address;
      ev.details = { catalogHash: a.catalogHash };
      break;
    case "Borrowed":
      ev.bookId = Number(a.id);
      ev.actor = a.borrower;
      ev.photoHash = a.photoHash;
      ev.details = { dueAt: Number(a.dueAt) };
      break;
    case "Returned":
      ev.bookId = Number(a.id);
      ev.actor = a.borrower;
      ev.photoHash = a.photoHash;
      ev.details = { late: a.late };
      break;
    case "IncidentReported":
      ev.bookId = Number(a.id);
      ev.actor = a.reporter;
      ev.photoHash = a.evidenceHash === ethers.ZeroHash ? null : a.evidenceHash;
      ev.details = { kind: KIND[Number(a.kind)] };
      break;
    case "IncidentApproved":
    case "IncidentRejected":
      ev.bookId = Number(a.id);
      ev.actor = a.steward;
      ev.details = { kind: KIND[Number(a.kind)] };
      break;
    case "BookRestored":
      ev.bookId = Number(a.id);
      ev.actor = a.steward;
      break;
    default:
      return null;
  }
  const p = personaOf(d, ev.actor);
  ev.actorName = p?.name ?? ev.actor;
  ev.actorRole = p?.role ?? "tidak dikenal";
  return ev;
}

function sync() {
  if (syncing) return syncing;
  syncing = (async () => {
    const d = requireDeployment();
    if (index.key !== d.mtime) {
      Object.assign(index, { key: d.mtime, lastBlock: d.json.deployBlock - 1, events: [], blockTs: new Map() });
    }
    const latest = await d.provider.getBlockNumber();
    if (latest < index.lastBlock) {
      // Node di-restart tanpa deploy ulang: bangun ulang dari awal.
      Object.assign(index, { lastBlock: d.json.deployBlock - 1, events: [], blockTs: new Map() });
    }
    if (latest === index.lastBlock) return;
    const logs = await d.provider.getLogs({
      address: d.json.address,
      fromBlock: index.lastBlock + 1,
      toBlock: latest,
    });
    for (const log of logs) {
      const parsed = d.iface.parseLog(log);
      if (!parsed) continue;
      const ev = normalize(d, parsed, log, await blockTimestamp(d, log.blockNumber));
      if (ev) index.events.push(ev);
    }
    index.lastBlock = latest;
  })().finally(() => {
    syncing = null;
  });
  return syncing;
}

// ----------------------------------------------------------------- bentuk data

async function buildBook(d, catalog, id) {
  const b = await d.ledger.getBook(id);
  const entry = catalog.find((c) => c.id === id);
  const status = STATUS[Number(b.status)];
  const holdingNow = status === "Borrowed" || status === "Overdue";
  const holderPersona = personaOf(d, b.holder);
  const hasHolder = b.holder !== ethers.ZeroAddress;
  const pendingKind = KIND[Number(b.pendingKind)];
  return {
    id,
    code: entry?.code ?? `ITB-${String(id).padStart(4, "0")}`,
    title: entry?.title ?? "(katalog tidak ditemukan)",
    author: entry?.author ?? "",
    callNumber: entry?.callNumber ?? "",
    location: entry?.location ?? "",
    year: entry?.year ?? null,
    catalogHash: b.catalogHash,
    catalogOk: entry ? ethers.id(JSON.stringify(entry)) === b.catalogHash : false,
    status,
    holder: hasHolder ? b.holder : null,
    holderName: hasHolder ? holderPersona?.name ?? b.holder : null,
    holdingNow,
    borrowedAt: holdingNow ? Number(b.borrowedAt) : null,
    dueAt: holdingNow ? Number(b.dueAt) : null,
    pendingIncident:
      pendingKind === "None"
        ? null
        : { kind: pendingKind, evidenceHash: b.pendingEvidence === ethers.ZeroHash ? null : b.pendingEvidence },
    entries: index.events.filter((e) => e.bookId === id).length,
  };
}

async function chainInfo(d) {
  const block = await d.provider.getBlock("latest");
  return { chainId: d.json.chainId, blockNumber: block.number, timestamp: block.timestamp, contract: d.json.address };
}

// ------------------------------------------------------------------- foto/file

function findPhoto(hash) {
  if (!HASH_RE.test(hash) || !fs.existsSync(PHOTO_DIR)) return null;
  const hex = hash.slice(2);
  const file = fs.readdirSync(PHOTO_DIR).find((f) => f.startsWith(hex + "."));
  return file ? { file, full: path.join(PHOTO_DIR, file), ext: file.split(".").pop() } : null;
}

// ------------------------------------------------------------------------ app

const app = express();
app.use(cors());
app.use(express.json());

const wrap = (fn) => (req, res) =>
  fn(req, res).catch((e) => {
    res.status(e.status || 500).json({ error: e.message || String(e) });
  });

app.get("/health", wrap(async (_req, res) => {
  const d = loadDeployment();
  if (!d) return res.json({ ok: false, reason: "Belum ada deployment. Jalankan: npm run deploy" });
  try {
    res.json({ ok: true, ...(await chainInfo(d)), deployedAt: d.json.deployedAt });
  } catch {
    res.json({ ok: false, reason: "Node blockchain tidak terjangkau. Jalankan: npm run chain" });
  }
}));

app.get("/config", wrap(async (_req, res) => {
  res.json(requireDeployment().json);
}));

app.get("/books", wrap(async (_req, res) => {
  const d = requireDeployment();
  await sync();
  const catalog = readCatalog();
  const count = Number(await d.ledger.bookCount());
  const books = await Promise.all(Array.from({ length: count }, (_, i) => buildBook(d, catalog, i + 1)));
  const ledgerEntries = index.events.length;
  res.json({
    books,
    stats: {
      ledgerEntries,
      loanEntries: index.events.filter((e) => e.type === "Borrowed" || e.type === "Returned").length,
      borrowed: books.filter((b) => b.status === "Borrowed").length,
      overdue: books.filter((b) => b.status === "Overdue").length,
      lostOrDamaged: books.filter((b) => b.status === "LostOrDamaged").length,
      pending: books.filter((b) => b.pendingIncident).length,
    },
    chain: await chainInfo(d),
  });
}));

app.get("/books/:id", wrap(async (req, res) => {
  const d = requireDeployment();
  await sync();
  const id = Number(req.params.id);
  const count = Number(await d.ledger.bookCount());
  if (!Number.isInteger(id) || id < 1 || id > count) return res.status(404).json({ error: "Buku tidak ditemukan" });
  const book = await buildBook(d, readCatalog(), id);
  const events = index.events.filter((e) => e.bookId === id);
  res.json({ book, events, chain: await chainInfo(d) });
}));

// Pita transaksi terbaru lintas buku.
app.get("/events", wrap(async (req, res) => {
  requireDeployment();
  await sync();
  const limit = Math.min(Number(req.query.limit) || 12, 100);
  const catalog = readCatalog();
  const recent = index.events
    .filter((e) => e.type !== "MemberRegistered")
    .slice(-limit)
    .reverse()
    .map((e) => ({ ...e, bookTitle: catalog.find((c) => c.id === e.bookId)?.title ?? null }));
  res.json({ events: recent });
}));

// Foto: unggah (hash dihitung ulang di server), tampilkan, verifikasi.
app.post("/photos", express.raw({ type: () => true, limit: "10mb" }), wrap(async (req, res) => {
  const body = req.body;
  if (!Buffer.isBuffer(body) || body.length === 0) return res.status(400).json({ error: "File kosong" });
  const mime = String(req.get("content-type") || "").split(";")[0].trim();
  const ext = EXT_BY_MIME[mime];
  if (!ext) return res.status(415).json({ error: "Format harus PNG, JPEG, WebP, GIF, atau SVG" });

  const actual = sha256(body);
  const claimed = String(req.get("x-photo-hash") || "").toLowerCase();
  if (claimed && claimed !== actual) {
    return res.status(400).json({ error: "Hash dari browser tidak cocok dengan file yang diterima" });
  }
  fs.mkdirSync(PHOTO_DIR, { recursive: true });
  fs.writeFileSync(path.join(PHOTO_DIR, `${actual.slice(2)}.${ext}`), body);
  res.json({ hash: actual, size: body.length, mime });
}));

app.get("/photos/:hash", (req, res) => {
  const hash = req.params.hash.toLowerCase();
  const found = findPhoto(hash);
  if (!found) return res.status(404).json({ error: "Foto tidak ada di storage" });
  res.set("Cache-Control", "no-store");
  res.type(MIME_BY_EXT[found.ext] || "application/octet-stream");
  res.send(fs.readFileSync(found.full));
});

app.get("/photos/:hash/verify", (req, res) => {
  const hash = req.params.hash.toLowerCase();
  const found = findPhoto(hash);
  if (!found) return res.json({ exists: false, ok: false, expected: hash, actual: null });
  const actual = sha256(fs.readFileSync(found.full));
  res.set("Cache-Control", "no-store");
  res.json({ exists: true, ok: actual === hash, expected: hash, actual });
});

// ------------------------------------------------------ alat bantu demo (lokal)

// Menggeser jam chain agar status "terlambat" bisa didemokan tanpa menunggu.
app.post("/dev/time-travel", wrap(async (req, res) => {
  const d = requireDeployment();
  const days = Number(req.body?.days);
  if (!Number.isFinite(days) || days <= 0 || days > 365) return res.status(400).json({ error: "days harus 1-365" });
  await d.provider.send("evm_increaseTime", [Math.round(days * 86400)]);
  await d.provider.send("evm_mine", []);
  res.json({ ok: true, chain: await chainInfo(d) });
}));

// Mengubah satu byte file foto di storage (simulasi pemalsuan setelah dicatat).
app.post("/dev/tamper/:hash", (req, res) => {
  const found = findPhoto(req.params.hash.toLowerCase());
  if (!found) return res.status(404).json({ error: "Foto tidak ada di storage" });
  fs.mkdirSync(ORIGINAL_DIR, { recursive: true });
  const backup = path.join(ORIGINAL_DIR, found.file);
  if (!fs.existsSync(backup)) fs.copyFileSync(found.full, backup);
  fs.appendFileSync(found.full, Buffer.from([0x0a]));
  res.json({ ok: true });
});

app.post("/dev/restore/:hash", (req, res) => {
  const found = findPhoto(req.params.hash.toLowerCase());
  if (!found) return res.status(404).json({ error: "Foto tidak ada di storage" });
  const backup = path.join(ORIGINAL_DIR, found.file);
  if (!fs.existsSync(backup)) return res.json({ ok: true, note: "Tidak ada perubahan untuk dipulihkan" });
  fs.copyFileSync(backup, found.full);
  fs.rmSync(backup);
  res.json({ ok: true });
});

// Mengembalikan chain ke snapshot yang diambil skrip seed (termasuk jam chain), membuang foto yang
// dibuat sesudahnya, dan membangun ulang indeks. Revert menghabiskan snapshot, jadi diambil yang baru.
app.post("/dev/reset", wrap(async (_req, res) => {
  const d = requireDeployment();
  if (!fs.existsSync(STATE_FILE)) {
    return res.status(409).json({ error: "Belum ada snapshot demo. Jalankan: npm run seed" });
  }
  const state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  if (syncing) await syncing.catch(() => {});

  const reverted = await d.provider.send("evm_revert", [state.snapshotId]);
  if (!reverted) {
    return res.status(409).json({ error: "Snapshot sudah tidak berlaku (node di-restart?). Jalankan ulang: npm run dev" });
  }
  state.snapshotId = await d.provider.send("evm_snapshot", []);
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

  // Foto: sisakan hanya yang ada saat snapshot; kembalikan file yang sempat dipalsukan.
  const keep = new Set(state.photos);
  if (fs.existsSync(PHOTO_DIR)) {
    for (const f of fs.readdirSync(PHOTO_DIR)) if (!keep.has(f)) fs.rmSync(path.join(PHOTO_DIR, f), { force: true });
  }
  if (fs.existsSync(ORIGINAL_DIR)) {
    for (const f of fs.readdirSync(ORIGINAL_DIR)) {
      if (keep.has(f)) fs.copyFileSync(path.join(ORIGINAL_DIR, f), path.join(PHOTO_DIR, f));
    }
    fs.rmSync(ORIGINAL_DIR, { recursive: true, force: true });
  }

  Object.assign(index, { lastBlock: d.json.deployBlock - 1, events: [], blockTs: new Map() });
  await sync();
  res.json({ ok: true, chain: await chainInfo(d), ledgerEntries: index.events.length });
}));

// ------------------------------------------------ SUS (kuesioner kemudahan pakai)

const SUS_FILE = path.join(RESULTS_DIR, "sus.json");
const readSus = () => (fs.existsSync(SUS_FILE) ? JSON.parse(fs.readFileSync(SUS_FILE, "utf8")) : []);

function susScore(answers) {
  // Brooke (1996): butir ganjil (skor-1), butir genap (5-skor), jumlah x 2,5.
  const sum = answers.reduce((acc, v, i) => acc + (i % 2 === 0 ? v - 1 : 5 - v), 0);
  return sum * 2.5;
}

app.post("/sus", wrap(async (req, res) => {
  const { answers, role } = req.body || {};
  if (!Array.isArray(answers) || answers.length !== 10 || !answers.every((v) => Number.isInteger(v) && v >= 1 && v <= 5)) {
    return res.status(400).json({ error: "Jawaban harus 10 angka 1-5" });
  }
  const entry = { at: new Date().toISOString(), role: String(role || "tidak disebut").slice(0, 40), answers, score: susScore(answers) };
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(SUS_FILE, JSON.stringify([...readSus(), entry], null, 2));
  res.json(entry);
}));

app.get("/sus", (_req, res) => {
  const all = readSus();
  const average = all.length ? all.reduce((s, r) => s + r.score, 0) / all.length : null;
  res.json({ count: all.length, average, responses: all.map(({ at, role, score }) => ({ at, role, score })) });
});

// ----------------------------------------------------------------------- start

app.listen(PORT, () => {
  console.log(`API indexer siap di http://localhost:${PORT}`);
  if (!loadDeployment()) console.log("Catatan: deployment.json belum ada. Jalankan `npm run deploy` dulu.");
});

// Jaga indeks tetap segar walau tidak ada yang meminta.
setInterval(() => {
  if (loadDeployment()) sync().catch(() => {});
}, 2000);
