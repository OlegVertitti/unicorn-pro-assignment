import { useRef, useState } from "react";
import { CreativeCard } from "./components/CreativeCard";
import { isValidDriveUrl } from "./lib/drive";
import { streamAnalyze } from "./lib/sse";
import type { Job } from "./types";

const MAX_CONCURRENT = 3;

function parseUrls(raw: string): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const line of raw.split(/[\n,]/)) {
    const trimmed = line.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    urls.push(trimmed);
  }
  return urls;
}

export default function App() {
  const [input, setInput] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const abortControllers = useRef<Map<string, AbortController>>(new Map());

  const urls = parseUrls(input);
  const canSubmit = urls.length > 0 && !isRunning;

  function updateJob(id: string, patch: Partial<Job>) {
    setJobs((prev) => prev.map((job) => (job.id === id ? { ...job, ...patch } : job)));
  }

  async function runJob(job: Job) {
    const controller = new AbortController();
    abortControllers.current.set(job.id, controller);

    if (!isValidDriveUrl(job.url)) {
      updateJob(job.id, {
        status: "error",
        error: {
          code: "invalid_url",
          message: "This doesn't look like a public Google Drive link.",
        },
      });
      return;
    }

    updateJob(job.id, { status: "downloading" });
    await streamAnalyze(
      job.url,
      (event) => {
        if (event.stage === "done") {
          updateJob(job.id, { status: "done", result: event.result });
        } else if (event.stage === "error") {
          updateJob(job.id, { status: "error", error: event.error });
        } else {
          updateJob(job.id, { status: event.stage });
        }
      },
      controller.signal,
    );
  }

  async function handleAnalyze(e: React.FormEvent) {
    e.preventDefault();
    if (urls.length === 0 || isRunning) return;

    for (const controller of abortControllers.current.values()) controller.abort();
    abortControllers.current.clear();

    const newJobs: Job[] = urls.map((url, i) => ({
      id: `${Date.now()}-${i}`,
      url,
      status: "queued",
    }));
    setJobs(newJobs);
    setIsRunning(true);

    let nextIndex = 0;
    async function worker() {
      while (nextIndex < newJobs.length) {
        const job = newJobs[nextIndex++];
        await runJob(job);
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(MAX_CONCURRENT, newJobs.length) }, () => worker()),
    );

    setIsRunning(false);
  }

  return (
    <div className="page">
      <header className="header">
        <h1>Ad Creative Analyzer</h1>
        <p className="subtitle">
          Paste one or more public Google Drive links (one per line) to get a structured analysis of
          the person in frame and a transcript of any speech.
        </p>
      </header>

      <form className="form" onSubmit={handleAnalyze}>
        <textarea
          placeholder={
            "https://drive.google.com/file/d/.../view\nhttps://drive.google.com/file/d/.../view"
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isRunning}
          aria-label="Google Drive URLs, one per line"
          rows={3}
        />
        <button type="submit" disabled={!canSubmit}>
          {isRunning
            ? "Analyzing…"
            : urls.length > 1
              ? `Analyze ${urls.length} creatives`
              : "Analyze"}
        </button>
      </form>

      {jobs.length === 0 && (
        <p className="hint">Example: https://drive.google.com/file/d/FILE_ID/view</p>
      )}

      {jobs.length > 0 && (
        <div className="results-grid">
          {jobs.map((job) => (
            <CreativeCard key={job.id} job={job} />
          ))}
        </div>
      )}
    </div>
  );
}
