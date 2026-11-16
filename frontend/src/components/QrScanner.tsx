"use client";
import { useEffect, useRef, useState } from "react";
import type { Html5Qrcode } from "html5-qrcode";

type State = "idle" | "starting" | "running" | "error";

export function QrScanner({ onScan }: { onScan: (text: string) => void }) {
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState("");
  const scanner = useRef<Html5Qrcode | null>(null);
  const handler = useRef(onScan);
  handler.current = onScan;

  async function stop() {
    const s = scanner.current;
    scanner.current = null;
    if (s) {
      try {
        if (s.isScanning) await s.stop();
        s.clear();
      } catch {
        /* sudah berhenti */
      }
    }
    setState("idle");
  }

  async function start() {
    setState("starting");
    setMessage("");
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const s = new Html5Qrcode("qr-reader");
      scanner.current = s;
      const config = { fps: 10, qrbox: { width: 240, height: 240 } };
      const onDecode = (text: string) => {
        handler.current(text);
        void stop();
      };
      try {
        await s.start({ facingMode: "environment" }, config, onDecode, () => {});
      } catch {
        // Webcam laptop biasanya hanya kamera depan: pakai kamera pertama yang ada.
        const cams = await Html5Qrcode.getCameras();
        if (!cams.length) throw new Error("Tidak ada kamera terdeteksi.");
        await s.start(cams[0].id, config, onDecode, () => {});
      }
      setState("running");
    } catch (e) {
      scanner.current = null;
      setState("error");
      setMessage(
        e instanceof Error && e.message
          ? `${e.message} Izinkan akses kamera di browser, atau masukkan kode buku secara manual.`
          : "Kamera tidak bisa dibuka. Izinkan akses kamera, atau masukkan kode buku secara manual."
      );
    }
  }

  useEffect(() => {
    return () => {
      const s = scanner.current;
      if (s?.isScanning) void s.stop().catch(() => {});
    };
  }, []);

  return (
    <div className="scanner">
      <div id="qr-reader" className={state === "running" ? "qr-live" : "qr-idle"} />
      {state !== "running" ? (
        <button className="btn" onClick={start} disabled={state === "starting"}>
          {state === "starting" ? "Membuka kamera…" : "Buka kamera"}
        </button>
      ) : (
        <button className="btn btn-quiet" onClick={stop}>
          Tutup kamera
        </button>
      )}
      {message && <p className="field-error">{message}</p>}
    </div>
  );
}
