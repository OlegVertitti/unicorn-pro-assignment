import { Hono } from "hono";
import { z } from "zod";
import { downloadDriveFile } from "./drive";
import { AppError, FileTooLargeError } from "./errors";
import { analyzeCreative } from "./gemini";
import type { Env } from "./types";

const MAX_FILE_BYTES = 100 * 1024 * 1024; // 100MB - generous for short ad creatives, guards against abuse

const app = new Hono<{ Bindings: Env }>();

const analyzeRequestSchema = z.object({
  url: z.string().min(1, "URL is required"),
});

app.post("/api/analyze", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = analyzeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: "invalid_request", message: "Вкажіть поле url." } }, 400);
  }

  const file = await downloadDriveFile(parsed.data.url);
  if (file.bytes.byteLength > MAX_FILE_BYTES) {
    throw new FileTooLargeError();
  }

  const result = await analyzeCreative(file, c.env.GEMINI_API_KEY);
  return c.json(result);
});

app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json({ error: { code: err.code, message: err.message } }, err.httpStatus as never);
  }
  console.error("Unhandled error:", err);
  return c.json(
    { error: { code: "internal_error", message: "Внутрішня помилка сервера." } },
    500,
  );
});

app.notFound((c) => c.json({ error: { code: "not_found", message: "Not found" } }, 404));

export default app;
