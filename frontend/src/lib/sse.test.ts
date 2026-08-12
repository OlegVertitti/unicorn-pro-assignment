import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnalyzeEvent } from "../types";
import { streamAnalyze } from "./sse";

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

describe("streamAnalyze", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses multiple SSE events, even when a chunk boundary lands mid-event", async () => {
    const raw =
      'data: {"stage":"downloading"}\n\n' +
      'data: {"stage":"analyzing"}\n\n' +
      'data: {"stage":"done","result":{"mediaType":"image","personDetected":false,"person":null,"hasSpeech":false,"transcript":null}}\n\n';
    const mid = 40; // arbitrary offset that falls inside the second event's JSON
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => sseResponse([raw.slice(0, mid), raw.slice(mid)])),
    );

    const events: AnalyzeEvent[] = [];
    await streamAnalyze("https://drive.google.com/file/d/abc/view", (e) => events.push(e));

    expect(events.map((e) => e.stage)).toEqual(["downloading", "analyzing", "done"]);
    expect(events[2]).toMatchObject({ stage: "done", result: { mediaType: "image" } });
  });

  it("surfaces the server's error body when the request isn't ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { code: "invalid_url", message: "bad url" } }), {
            status: 400,
          }),
      ),
    );

    const events: AnalyzeEvent[] = [];
    await streamAnalyze("https://drive.google.com/file/d/abc/view", (e) => events.push(e));

    expect(events).toEqual([{ stage: "error", error: { code: "invalid_url", message: "bad url" } }]);
  });

  it("emits an error event when fetch itself rejects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    const events: AnalyzeEvent[] = [];
    await streamAnalyze("https://drive.google.com/file/d/abc/view", (e) => events.push(e));

    expect(events).toHaveLength(1);
    expect(events[0].stage).toBe("error");
  });
});
