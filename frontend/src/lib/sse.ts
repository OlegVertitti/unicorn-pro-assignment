import type { AnalyzeEvent, ApiErrorBody } from "../types";

/**
 * Streams /api/analyze via fetch instead of EventSource, because EventSource
 * only supports GET and this endpoint needs a POST body (the Drive URL).
 * Parses the standard "data: {...}\n\n" SSE framing by hand.
 */
export async function streamAnalyze(
  driveUrl: string,
  onEvent: (event: AnalyzeEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: driveUrl }),
      signal,
    });
  } catch {
    if (signal?.aborted) return;
    onEvent({ stage: "error", error: { code: "network_error", message: "Couldn't reach the server." } });
    return;
  }

  if (!response.ok || !response.body) {
    const body: { error?: ApiErrorBody } | null = await response.json().catch(() => null);
    onEvent({
      stage: "error",
      error: body?.error ?? { code: "network_error", message: `Request failed (${response.status}).` },
    });
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() ?? "";
      for (const chunk of chunks) {
        const dataLine = chunk.split("\n").find((line) => line.startsWith("data:"));
        if (!dataLine) continue;
        try {
          onEvent(JSON.parse(dataLine.slice(5).trim()));
        } catch {
          // ignore a malformed chunk rather than failing the whole stream
        }
      }
    }
  } catch {
    if (signal?.aborted) return;
    onEvent({ stage: "error", error: { code: "network_error", message: "Connection to the server was interrupted." } });
  }
}
