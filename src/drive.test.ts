import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadDriveFile, extractDriveFileId } from "./drive";
import { DriveAccessError, InvalidUrlError, UnsupportedFileTypeError } from "./errors";

describe("extractDriveFileId", () => {
  it("extracts the id from a standard /file/d/ share link", () => {
    expect(extractDriveFileId("https://drive.google.com/file/d/1abcXYZ_-9/view?usp=sharing")).toBe(
      "1abcXYZ_-9",
    );
  });

  it("extracts the id from a uc?id= style link", () => {
    expect(extractDriveFileId("https://drive.google.com/uc?export=download&id=1abcXYZ_-9")).toBe(
      "1abcXYZ_-9",
    );
  });

  it("rejects a non-Drive hostname", () => {
    expect(() => extractDriveFileId("https://example.com/file/d/1abcXYZ/view")).toThrow(
      InvalidUrlError,
    );
  });

  it("rejects a malformed URL", () => {
    expect(() => extractDriveFileId("not a url at all")).toThrow(InvalidUrlError);
  });

  it("rejects a Drive URL with no recognizable file id", () => {
    expect(() => extractDriveFileId("https://drive.google.com/drive/my-drive")).toThrow(
      InvalidUrlError,
    );
  });
});

describe("downloadDriveFile", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const validUrl = "https://drive.google.com/file/d/1abcXYZ_-9/view";

  it("returns bytes and mime type on a direct binary response", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(new Uint8Array([1, 2, 3, 4]), {
          status: 200,
          headers: { "content-type": "video/mp4" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await downloadDriveFile(validUrl);
    expect(result.mimeType).toBe("video/mp4");
    expect(result.bytes.byteLength).toBe(4);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries with a confirm token when Drive returns the virus-scan interstitial", async () => {
    let call = 0;
    const fetchMock = vi.fn(async () => {
      call++;
      if (call === 1) {
        return new Response("<html>...confirm=abc123...</html>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
      return new Response(new Uint8Array([9, 9]), {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await downloadDriveFile(validUrl);
    expect(result.mimeType).toBe("image/png");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws DriveAccessError when the interstitial has no confirm token", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response("<html>no token here</html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(downloadDriveFile(validUrl)).rejects.toThrow(DriveAccessError);
  });

  it("throws DriveAccessError on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 })),
    );
    await expect(downloadDriveFile(validUrl)).rejects.toThrow(DriveAccessError);
  });

  it("throws UnsupportedFileTypeError for a non-image/video mime type", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(new Uint8Array([1]), {
            status: 200,
            headers: { "content-type": "application/pdf" },
          }),
      ),
    );
    await expect(downloadDriveFile(validUrl)).rejects.toThrow(UnsupportedFileTypeError);
  });

  it("throws DriveAccessError on an empty body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(new Uint8Array([]), {
            status: 200,
            headers: { "content-type": "image/png" },
          }),
      ),
    );
    await expect(downloadDriveFile(validUrl)).rejects.toThrow(DriveAccessError);
  });
});
