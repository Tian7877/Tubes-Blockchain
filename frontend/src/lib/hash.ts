// Hash dihitung di browser (SHA-256), sebelum file meninggalkan perangkat pengguna.
// crypto.subtle hanya tersedia di konteks aman: buka lewat http://localhost:3000.
export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return "0x" + Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

// Foto contoh (dummy) supaya demo bisa jalan tanpa kamera. Goresan acak membuat tiap foto unik.
export async function makeSamplePhoto(title: string, phase: string): Promise<Blob> {
  const c = document.createElement("canvas");
  c.width = 640;
  c.height = 420;
  const g = c.getContext("2d")!;
  const hue = Math.floor(Math.random() * 360);
  g.fillStyle = `hsl(${hue} 25% 90%)`;
  g.fillRect(0, 0, 640, 420);
  g.fillStyle = `hsl(${hue} 45% 32%)`;
  g.fillRect(190, 50, 260, 300);
  g.strokeStyle = `hsl(${hue} 40% 72%)`;
  g.lineWidth = 2;
  g.strokeRect(206, 66, 228, 268);
  g.strokeStyle = "rgba(255,255,255,0.35)";
  for (let i = 0; i < 6; i++) {
    g.beginPath();
    g.moveTo(206 + Math.random() * 228, 66 + Math.random() * 268);
    g.lineTo(206 + Math.random() * 228, 66 + Math.random() * 268);
    g.stroke();
  }
  g.textAlign = "center";
  g.fillStyle = "#fff";
  g.font = "bold 20px sans-serif";
  g.fillText(title.slice(0, 24), 320, 180);
  g.font = "13px sans-serif";
  g.fillStyle = `hsl(${hue} 40% 85%)`;
  g.fillText("Foto contoh (dummy)", 320, 206);
  g.textAlign = "left";
  g.fillStyle = "#223";
  g.font = "13px monospace";
  g.fillText(`${phase}  ${new Date().toLocaleString("id-ID")}`, 24, 396);
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error("Gagal membuat foto contoh"))), "image/png")
  );
}
