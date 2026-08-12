import { DriveAccessError, InvalidUrlError, UnsupportedFileTypeError } from "./errors";
import type { DownloadedFile } from "./types";

const FILE_ID_PATTERNS = [
  /\/file\/d\/([\w-]+)/, // https://drive.google.com/file/d/{id}/view
  /[?&]id=([\w-]+)/, // https://drive.google.com/uc?id={id} or ...&id={id}
  /\/d\/([\w-]+)/, // shortened variants of the /file/d/ pattern
];

export function extractDriveFileId(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    throw new InvalidUrlError();
  }
  if (!/(^|\.)drive\.google\.com$/.test(parsed.hostname)) {
    throw new InvalidUrlError();
  }
  for (const pattern of FILE_ID_PATTERNS) {
    const match = parsed.pathname.match(pattern) ?? url.match(pattern);
    if (match) return match[1];
  }
  throw new InvalidUrlError("Couldn't find a file ID in this Google Drive link.");
}

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/**
 * Google Drive serves an HTML "can't scan for viruses" interstitial for large
 * files instead of the binary. The confirm=t query param on this endpoint
 * bypasses that for the vast majority of files; the regex fallback below
 * handles the rarer case where Drive still returns the interstitial and
 * embeds a one-off confirm token in the page instead.
 */
async function fetchDriveBytes(fileId: string, confirmToken?: string): Promise<Response> {
  const url = new URL("https://drive.usercontent.google.com/download");
  url.searchParams.set("id", fileId);
  url.searchParams.set("export", "download");
  url.searchParams.set("confirm", confirmToken ?? "t");
  return fetch(url.toString(), {
    headers: { "User-Agent": USER_AGENT },
    redirect: "follow",
  });
}

function extractConfirmToken(html: string): string | null {
  const match =
    html.match(/confirm=([0-9A-Za-z_-]+)/) ?? html.match(/name="confirm"\s+value="([^"]+)"/);
  return match ? match[1] : null;
}

export async function downloadDriveFile(url: string): Promise<DownloadedFile> {
  const fileId = extractDriveFileId(url);

  let response = await fetchDriveBytes(fileId);
  let contentType = response.headers.get("content-type") ?? "";

  if (response.ok && contentType.startsWith("text/html")) {
    // Got the interstitial page instead of the file — try to pull a confirm token and retry once.
    const html = await response.text();
    const token = extractConfirmToken(html);
    if (!token) {
      throw new DriveAccessError();
    }
    response = await fetchDriveBytes(fileId, token);
    contentType = response.headers.get("content-type") ?? "";
  }

  if (!response.ok) {
    throw new DriveAccessError();
  }
  if (contentType.startsWith("text/html")) {
    // Still HTML after the retry — most likely a private file or Drive quota/login wall.
    throw new DriveAccessError();
  }

  const mimeType = contentType.split(";")[0].trim() || "application/octet-stream";
  if (!mimeType.startsWith("image/") && !mimeType.startsWith("video/")) {
    throw new UnsupportedFileTypeError(mimeType);
  }

  const bytes = await response.arrayBuffer();
  if (bytes.byteLength === 0) {
    throw new DriveAccessError("Google Drive returned an empty file.");
  }

  return { bytes, mimeType };
}
