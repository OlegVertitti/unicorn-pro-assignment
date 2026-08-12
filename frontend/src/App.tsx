import { useState } from "react";
import type { AnalysisResult, ApiErrorBody } from "./types";

type Status = "idle" | "loading" | "error" | "success";

const PARAM_LABELS: Record<keyof NonNullable<AnalysisResult["person"]>, string> = {
  ethnicity: "Ethnicity",
  gender: "Gender",
  age: "Age",
  activity: "Activity",
  hairColor: "Hair color",
  bodyType: "Body type",
  clothing: "Clothing",
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
        setError(body?.error?.message ?? `Something went wrong (${response.status}).`);
        setStatus("error");
        return;
      }

      const data: AnalysisResult = await response.json();
      setResult(data);
      setStatus("success");
    } catch {
      setError("Couldn't reach the server. Check your internet connection and try again.");
      setStatus("error");
    }
  }

  return (
    <div className="page">
      <header className="header">
        <h1>Ad Creative Analyzer</h1>
        <p className="subtitle">
          Paste a public Google Drive link to get a structured analysis of the person in frame
          and a transcript of any speech.
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
          {status === "loading" ? "Analyzing…" : "Analyze"}
        </button>
      </form>

      {status === "idle" && (
        <p className="hint">Example: https://drive.google.com/file/d/FILE_ID/view</p>
      )}

      {status === "loading" && (
        <div className="state-box loading" role="status">
          <span className="spinner" aria-hidden="true" />
          <span>Downloading the file from Google Drive and sending it to Gemini. This can take up to a minute for video…</span>
        </div>
      )}

      {status === "error" && (
        <div className="state-box error" role="alert">
          <strong>Couldn't analyze this creative.</strong>
          <span>{error}</span>
        </div>
      )}

      {status === "success" && result && (
        <div className="result">
          <div className="result-badge">{result.mediaType === "video" ? "Video" : "Image"}</div>

          <section className="card">
            <h2>Person in frame</h2>
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
              <p className="empty-note">No person in focus was detected in this creative.</p>
            )}
          </section>

          {result.mediaType === "video" && (
            <section className="card">
              <h2>Transcript</h2>
              {result.hasSpeech && result.transcript ? (
                <p className="transcript">{result.transcript}</p>
              ) : (
                <p className="empty-note">No speech in this video (music only or silence).</p>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
