import { z } from "zod";
import { GeminiError, GeminiSafetyBlockError } from "./errors";
import { RESPONSE_SCHEMA, SYSTEM_PROMPT } from "./prompt";
import {
  ACTIVITIES,
  AGES,
  BODY_TYPES,
  CLOTHING,
  ETHNICITIES,
  GENDERS,
  HAIR_COLORS,
  type AnalysisResult,
  type DownloadedFile,
} from "./types";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const MODEL = "gemini-flash-latest";
const FILE_POLL_INTERVAL_MS = 1500;
const FILE_POLL_MAX_ATTEMPTS = 30; // ~45s ceiling for Gemini to finish processing the upload

const geminiResponseSchema = z.object({
  personDetected: z.boolean(),
  person: z
    .object({
      ethnicity: z.enum(ETHNICITIES),
      gender: z.enum(GENDERS),
      age: z.enum(AGES),
      activity: z.enum(ACTIVITIES),
      hairColor: z.enum(HAIR_COLORS),
      bodyType: z.enum(BODY_TYPES),
      clothing: z.enum(CLOTHING),
    })
    .nullable(),
  hasSpeech: z.boolean(),
  transcript: z.string().nullable(),
});

function toBase64(bytes: ArrayBuffer): string {
  return Buffer.from(bytes).toString("base64");
}

async function fetchWithRetry(input: string, init: RequestInit, retries = 1): Promise<Response> {
  const response = await fetch(input, init);
  if ((response.status === 429 || response.status === 503) && retries > 0) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return fetchWithRetry(input, init, retries - 1);
  }
  return response;
}

/**
 * Uploads bytes via the Gemini resumable-upload protocol (start -> upload+finalize)
 * and returns the file's URI once accepted. Used for video, which is too large/costly
 * to ship inline on every request and benefits from the Files API's own encoding.
 */
async function uploadFile(
  bytes: ArrayBuffer,
  mimeType: string,
  apiKey: string,
): Promise<string> {
  const startResponse = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(bytes.byteLength),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { displayName: "creative" } }),
  });
  if (!startResponse.ok) {
    throw new GeminiError(`Failed to initialize upload to Gemini Files API (${startResponse.status}).`);
  }
  const uploadUrl = startResponse.headers.get("x-goog-upload-url");
  if (!uploadUrl) {
    throw new GeminiError("Gemini Files API did not return an upload URL.");
  }

  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(bytes.byteLength),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: bytes,
  });
  if (!uploadResponse.ok) {
    throw new GeminiError(`Failed to upload the file to Gemini (${uploadResponse.status}).`);
  }
  const uploadJson = (await uploadResponse.json()) as { file?: { uri?: string; state?: string } };
  const fileUri = uploadJson.file?.uri;
  if (!fileUri) {
    throw new GeminiError("Gemini Files API did not return a file URI.");
  }
  return fileUri;
}

async function waitUntilActive(fileUri: string, apiKey: string): Promise<void> {
  for (let attempt = 0; attempt < FILE_POLL_MAX_ATTEMPTS; attempt++) {
    const response = await fetch(`${fileUri}?key=${apiKey}`);
    if (!response.ok) {
      throw new GeminiError(`Failed to check file processing status on Gemini (${response.status}).`);
    }
    const json = (await response.json()) as { state?: string };
    if (json.state === "ACTIVE") return;
    if (json.state === "FAILED") {
      throw new GeminiError("Gemini failed to process the uploaded file.");
    }
    await new Promise((resolve) => setTimeout(resolve, FILE_POLL_INTERVAL_MS));
  }
  throw new GeminiError("Timed out waiting for Gemini to finish processing the file.");
}

interface GeminiPart {
  text?: string;
  inline_data?: { mime_type: string; data: string };
  file_data?: { mime_type: string; file_uri: string };
}

async function generateContent(mediaPart: GeminiPart, apiKey: string): Promise<Record<string, unknown>> {
  const body = {
    contents: [
      {
        parts: [{ text: SYSTEM_PROMPT }, mediaPart],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      thinkingConfig: { thinkingLevel: "low" },
    },
  };

  const response = await fetchWithRetry(
    `${API_BASE}/models/${MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    if (response.status === 429) {
      throw new GeminiError("Gemini API is temporarily overloaded (rate limit). Please try again in a minute.", 429);
    }
    const errText = await response.text().catch(() => "");
    throw new GeminiError(`Gemini API error (${response.status}): ${errText.slice(0, 300)}`);
  }

  const json = (await response.json()) as {
    candidates?: Array<{
      finishReason?: string;
      content?: { parts?: Array<{ text?: string }> };
    }>;
    promptFeedback?: { blockReason?: string };
  };

  if (json.promptFeedback?.blockReason) {
    throw new GeminiSafetyBlockError();
  }
  const candidate = json.candidates?.[0];
  if (candidate?.finishReason === "SAFETY") {
    throw new GeminiSafetyBlockError();
  }
  const text = candidate?.content?.parts?.find((p) => p.text)?.text;
  if (!text) {
    throw new GeminiError("Gemini returned an empty response.");
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new GeminiError("Gemini returned invalid JSON.");
  }
}

export async function analyzeCreative(file: DownloadedFile, apiKey: string): Promise<AnalysisResult> {
  const mediaType: "image" | "video" = file.mimeType.startsWith("video/") ? "video" : "image";

  let mediaPart: GeminiPart;
  if (mediaType === "image") {
    mediaPart = { inline_data: { mime_type: file.mimeType, data: toBase64(file.bytes) } };
  } else {
    const fileUri = await uploadFile(file.bytes, file.mimeType, apiKey);
    await waitUntilActive(fileUri, apiKey);
    mediaPart = { file_data: { mime_type: file.mimeType, file_uri: fileUri } };
  }

  const raw = await generateContent(mediaPart, apiKey);
  const parsed = geminiResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new GeminiError("Gemini's response did not match the expected structure.");
  }

  const result = parsed.data;
  // Images never carry speech — enforce this even if the model returns otherwise.
  if (mediaType === "image") {
    return { mediaType, personDetected: result.personDetected, person: result.person, hasSpeech: false, transcript: null };
  }
  return { mediaType, ...result };
}
