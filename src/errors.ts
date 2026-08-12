export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus: number,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class InvalidUrlError extends AppError {
  constructor(message = "This doesn't look like a public Google Drive link.") {
    super("invalid_url", message, 400);
  }
}

export class DriveAccessError extends AppError {
  constructor(
    message = "Couldn't download the file from Google Drive. Make sure it's shared with \"Anyone with the link\".",
  ) {
    super("drive_access_error", message, 422);
  }
}

export class UnsupportedFileTypeError extends AppError {
  constructor(mimeType: string) {
    super(
      "unsupported_file_type",
      `Unsupported file type: ${mimeType}. Expected an image or a video.`,
      422,
    );
  }
}

export class FileTooLargeError extends AppError {
  constructor(message = "The file is too large to process.") {
    super("file_too_large", message, 422);
  }
}

export class GeminiError extends AppError {
  constructor(message: string, httpStatus = 502) {
    super("gemini_error", message, httpStatus);
  }
}

export class GeminiSafetyBlockError extends AppError {
  constructor(message = "Gemini refused to analyze this creative (safety filter triggered).") {
    super("gemini_safety_block", message, 422);
  }
}
