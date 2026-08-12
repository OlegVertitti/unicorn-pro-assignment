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
  constructor(message = "Посилання не схоже на публічне посилання Google Drive.") {
    super("invalid_url", message, 400);
  }
}

export class DriveAccessError extends AppError {
  constructor(
    message = "Не вдалося завантажити файл із Google Drive. Перевірте, що доступ відкрито «для всіх, хто має посилання».",
  ) {
    super("drive_access_error", message, 422);
  }
}

export class UnsupportedFileTypeError extends AppError {
  constructor(mimeType: string) {
    super(
      "unsupported_file_type",
      `Непідтримуваний тип файлу: ${mimeType}. Очікується зображення або відео.`,
      422,
    );
  }
}

export class FileTooLargeError extends AppError {
  constructor(message = "Файл завеликий для обробки.") {
    super("file_too_large", message, 422);
  }
}

export class GeminiError extends AppError {
  constructor(message: string, httpStatus = 502) {
    super("gemini_error", message, httpStatus);
  }
}

export class GeminiSafetyBlockError extends AppError {
  constructor(
    message = "Gemini відмовився аналізувати цей креатив (спрацював safety-фільтр).",
  ) {
    super("gemini_safety_block", message, 422);
  }
}
