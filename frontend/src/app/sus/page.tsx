"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { usePolling } from "@/lib/hooks";

// 10 butir System Usability Scale (Brooke, 1996), terjemahan yang lazim dipakai.
const QUESTIONS = [
  "Saya berpikir akan menggunakan sistem ini lagi.",
  "Saya merasa sistem ini rumit untuk digunakan.",
  "Saya merasa sistem ini mudah digunakan.",
  "Saya membutuhkan bantuan dari orang teknis untuk dapat menggunakan sistem ini.",
  "Saya merasa fitur-fitur pada sistem ini berjalan dengan semestinya.",
  "Saya merasa ada banyak hal yang tidak konsisten pada sistem ini.",
  "Saya merasa orang lain akan memahami cara menggunakan sistem ini dengan cepat.",
  "Saya merasa sistem ini membingungkan.",
  "Saya merasa tidak ada hambatan dalam menggunakan sistem ini.",
  "Saya perlu membiasakan diri terlebih dahulu sebelum menggunakan sistem ini.",
];

export default function SusPage() {
  const [answers, setAnswers] = useState<(number | null)[]>(Array(10).fill(null));
  const [role, setRole] = useState("peminjam");
  const [score, setScore] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const summary = usePolling(() => api.sus(), [score], 10000);
  const complete = answers.every((a) => a !== null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      setScore((await api.submitSus(answers as number[], role)).score);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page narrow">
      <div className="page-head">
        <h1>Kuesioner kemudahan pakai (SUS)</h1>
        <p className="lede">
          Isi setelah mencoba alur pinjam, kembali, dan cek riwayat. Skor dihitung dengan rumus Brooke (1996) dan disimpan di <code>backend/results/sus.json</code>.
        </p>
      </div>

      {score !== null ? (
        <section className="panel">
          <h2>Skor SUS Anda: {score.toFixed(1)}</h2>
          <p>{score >= 68 ? "Di atas rata-rata benchmark SUS (68)." : "Di bawah rata-rata benchmark SUS (68)."}</p>
          <button
            className="btn btn-quiet"
            onClick={() => {
              setScore(null);
              setAnswers(Array(10).fill(null));
            }}
          >
            Isi lagi untuk responden berikutnya
          </button>
        </section>
      ) : (
        <>
          <div className="field">
            <label htmlFor="role">Peran responden</label>
            <select id="role" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="pustakawan">Pustakawan</option>
              <option value="peminjam">Mahasiswa peminjam</option>
              <option value="pengurus">Pengurus</option>
            </select>
          </div>
          {QUESTIONS.map((q, i) => (
            <fieldset key={i} className="sus-q">
              <legend>
                {i + 1}. {q}
              </legend>
              <div className="sus-scale">
                <span className="muted small">Sangat tidak setuju</span>
                {[1, 2, 3, 4, 5].map((v) => (
                  <label key={v}>
                    <input
                      type="radio"
                      name={`q${i}`}
                      checked={answers[i] === v}
                      onChange={() => setAnswers((a) => a.map((x, j) => (j === i ? v : x)))}
                    />
                    <span>{v}</span>
                  </label>
                ))}
                <span className="muted small">Sangat setuju</span>
              </div>
            </fieldset>
          ))}
          <button className="btn" disabled={!complete || busy} onClick={submit}>
            Hitung dan simpan skor
          </button>
          {!complete && <p className="muted small">Jawab semua 10 butir untuk menghitung skor.</p>}
          {error && <p className="field-error">{error}</p>}
        </>
      )}

      <p className="muted small">
        {summary.data
          ? summary.data.count > 0
            ? `${summary.data.count} responden tersimpan, rata-rata SUS ${summary.data.average?.toFixed(1)}.`
            : "Belum ada responden tersimpan."
          : ""}
      </p>
    </div>
  );
}
