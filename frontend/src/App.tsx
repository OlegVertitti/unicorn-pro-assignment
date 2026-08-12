import { useState } from "react";
import type { AnalysisResult, ApiErrorBody } from "./types";

type Status = "idle" | "loading" | "error" | "success";

const PARAM_LABELS: Record<keyof NonNullable<AnalysisResult["person"]>, string> = {
  ethnicity: "Раса",
  gender: "Стать",
  age: "Вік",
  activity: "Активність",
  hairColor: "Колір волосся",
  bodyType: "Тип тіла",
  clothing: "Одяг",
};

function isValidDriveUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    return /(^|\.)drive\.google\.com$/.test(parsed.hostname);
  } catch {
    return false;
  }
}

export default function App() {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  const canSubmit = isValidDriveUrl(url) && status !== "loading";

  async function handleAnalyze(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidDriveUrl(url)) return;

    setStatus("loading");
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });

      if (!response.ok) {
        const body: ApiErrorBody | null = await response.json().catch(() => null);
        setError(body?.error?.message ?? `Сталася помилка (${response.status}).`);
        setStatus("error");
        return;
      }

      const data: AnalysisResult = await response.json();
      setResult(data);
      setStatus("success");
    } catch {
      setError("Не вдалося з'єднатися із сервером. Перевірте інтернет-з'єднання і спробуйте ще раз.");
      setStatus("error");
    }
  }

  return (
    <div className="page">
      <header className="header">
        <h1>Аналізатор рекламних креативів</h1>
        <p className="subtitle">
          Вставте публічне посилання на Google Drive — отримайте структурований аналіз людини в
          кадрі та транскрипт мовлення.
        </p>
      </header>

      <form className="form" onSubmit={handleAnalyze}>
        <input
          type="text"
          placeholder="https://drive.google.com/file/d/.../view?usp=sharing"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={status === "loading"}
          aria-label="Google Drive URL"
        />
        <button type="submit" disabled={!canSubmit}>
          {status === "loading" ? "Аналізуємо…" : "Аналізувати"}
        </button>
      </form>

      {status === "idle" && (
        <p className="hint">Приклад: https://drive.google.com/file/d/FILE_ID/view</p>
      )}

      {status === "loading" && (
        <div className="state-box loading" role="status">
          <span className="spinner" aria-hidden="true" />
          <span>Завантажуємо файл із Google Drive і надсилаємо в Gemini. Це може зайняти до хвилини для відео…</span>
        </div>
      )}

      {status === "error" && (
        <div className="state-box error" role="alert">
          <strong>Не вдалося проаналізувати креатив.</strong>
          <span>{error}</span>
        </div>
      )}

      {status === "success" && result && (
        <div className="result">
          <div className="result-badge">{result.mediaType === "video" ? "Відео" : "Зображення"}</div>

          <section className="card">
            <h2>Людина в кадрі</h2>
            {result.personDetected && result.person ? (
              <table className="params-table">
                <tbody>
                  {(Object.keys(PARAM_LABELS) as Array<keyof typeof PARAM_LABELS>).map((key) => (
                    <tr key={key}>
                      <th>{PARAM_LABELS[key]}</th>
                      <td>{result.person![key]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="empty-note">Людину в фокусі не виявлено в цьому креативі.</p>
            )}
          </section>

          {result.mediaType === "video" && (
            <section className="card">
              <h2>Транскрипт</h2>
              {result.hasSpeech && result.transcript ? (
                <p className="transcript">{result.transcript}</p>
              ) : (
                <p className="empty-note">Мова у відео відсутня (тільки музика або тиша).</p>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
