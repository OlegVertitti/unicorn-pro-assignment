import { afterEach, describe, expect, it, vi } from "vitest";
import { GeminiError, GeminiSafetyBlockError } from "./errors";
import { analyzeCreative } from "./gemini";
import type { DownloadedFile } from "./types";

const API_KEY = "test-key";

function generateContentResponse(body: Record<string, unknown>) {
  return new Response(
    JSON.stringify({
      candidates: [
        {
          finishReason: "STOP",
          content: { parts: [{ text: JSON.stringify(body) }] },
        },
      ],
    }),
    { status: 200 },
  );
}

const VALID_PERSON_RESULT = {
  personDetected: true,
  person: {
    ethnicity: "asian",
    gender: "female",
    age: "young",
    activity: "posing",
    hairColor: "black",
    bodyType: "slim",
    clothing: "casual",
  },
  hasSpeech: true,
  transcript: "hello there",
};

describe("analyzeCreative", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("analyzes an image inline in a single request and forces transcript/hasSpeech to false", async () => {
    const fetchMock = vi.fn(async () => generateContentResponse(VALID_PERSON_RESULT));
    vi.stubGlobal("fetch", fetchMock);

    const file: DownloadedFile = { bytes: new Uint8Array([1, 2, 3]).buffer, mimeType: "image/png" };
    const result = await analyzeCreative(file, API_KEY);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.mediaType).toBe("image");
    expect(result.personDetected).toBe(true);
    // Even though the mocked model returned hasSpeech:true/transcript, images must never carry speech.
    expect(result.hasSpeech).toBe(false);
    expect(result.transcript).toBeNull();
  });

  it("uploads video via the Files API, waits for ACTIVE, then analyzes, reporting progress stages in order", async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("/upload/v1beta/files")) {
        calls.push("upload-start");
        return new Response("{}", {
          status: 200,
          headers: { "x-goog-upload-url": "https://mock.example.com/put" },
        });
      }
      if (url.includes("mock.example.com/put")) {
        calls.push("upload-bytes");
        return new Response(
          JSON.stringify({ file: { uri: "https://generativelanguage.googleapis.com/v1beta/files/abc" } }),
          { status: 200 },
        );
      }
      if (url.includes("/v1beta/files/abc")) {
        calls.push("poll");
        return new Response(JSON.stringify({ state: "ACTIVE" }), { status: 200 });
      }
      if (url.includes(":generateContent")) {
        calls.push("generate");
        return generateContentResponse(VALID_PERSON_RESULT);
      }
      throw new Error(`Unexpected fetch call: ${url} ${init?.method}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const progressStages: string[] = [];
    const file: DownloadedFile = { bytes: new Uint8Array([1, 2, 3]).buffer, mimeType: "video/mp4" };
    const result = await analyzeCreative(file, API_KEY, (stage) => {
      progressStages.push(stage);
    });

    expect(calls).toEqual(["upload-start", "upload-bytes", "poll", "generate"]);
    expect(progressStages).toEqual(["uploading", "processing", "analyzing"]);
    expect(result.mediaType).toBe("video");
    expect(result.hasSpeech).toBe(true);
    expect(result.transcript).toBe("hello there");
  });

  it("throws GeminiSafetyBlockError when the prompt is safety-blocked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } }), { status: 200 }),
      ),
    );

    const file: DownloadedFile = { bytes: new Uint8Array([1]).buffer, mimeType: "image/png" };
    await expect(analyzeCreative(file, API_KEY)).rejects.toThrow(GeminiSafetyBlockError);
  });

  it("throws GeminiError when the response doesn't match the expected schema", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => generateContentResponse({ nonsense: true })));

    const file: DownloadedFile = { bytes: new Uint8Array([1]).buffer, mimeType: "image/png" };
    await expect(analyzeCreative(file, API_KEY)).rejects.toThrow(GeminiError);
  });

  it("retries once on a 429 and succeeds on the second attempt", async () => {
    let call = 0;
    const fetchMock = vi.fn(async () => {
      call++;
      if (call === 1) return new Response("rate limited", { status: 429 });
      return generateContentResponse(VALID_PERSON_RESULT);
    });
    vi.stubGlobal("fetch", fetchMock);

    const file: DownloadedFile = { bytes: new Uint8Array([1]).buffer, mimeType: "image/png" };
    const result = await analyzeCreative(file, API_KEY);

    expect(call).toBe(2);
    expect(result.personDetected).toBe(true);
  });
});
