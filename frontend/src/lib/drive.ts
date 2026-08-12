const FILE_ID_PATTERNS = [/\/file\/d\/([\w-]+)/, /[?&]id=([\w-]+)/, /\/d\/([\w-]+)/];

export function isValidDriveUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    return /(^|\.)drive\.google\.com$/.test(parsed.hostname);
  } catch {
    return false;
  }
}

/** Used only to build the embeddable preview iframe URL, not for downloading. */
export function extractDriveFileId(url: string): string | null {
  for (const pattern of FILE_ID_PATTERNS) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}
