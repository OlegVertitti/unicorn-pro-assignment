import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { downloadDriveFile } from "./drive";
import { AppError, FileTooLargeError } from "./errors";
import { analyzeCreative } from "./gemini";
import type { AnalyzeSseEvent, Env } from "./types";

const MAX_FILE_BYTES = 100 * 1024 * 1024; // 100MB - generous for short ad creatives, guards against abuse

const app = new Hono<{ Bindings: Env }>();

const analyzeRequestSchema = z.object({
  url: z.string().min(1, "URL is required"),
});

app.post("/api/analyze", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = analyzeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: "invalid_request", message: "The url field is required." } }, 400);
  }
  const { url } = parsed.data;

  return streamSSE(c, async (stream) => {
    const send = (event: AnalyzeSseEvent) => stream.writeSSE({ data: JSON.stringify(event) });

    try {
      await send({ stage: "downloading" });
      const file = await downloadDriveFile(url);
      if (file.bytes.byteLength > MAX_FILE_BYTES) {
        throw new FileTooLargeError();
      }

      const result = await analyzeCreative(file, c.env.GEMINI_API_KEY, (stage) => send({ stage }));
      await send({ stage: "done", result });
    } catch (err) {
      const appError =
        err instanceof AppError ? err : new AppError("internal_error", "Internal server error.", 500);
      if (!(err instanceof AppError)) {
        console.error("Unhandled error:", err);
      }
      await send({ stage: "error", error: { code: appError.code, message: appError.message } });
    }
  });
});

app.notFound((c) => c.json({ error: { code: "not_found", message: "Not found" } }, 404));

export default app;
