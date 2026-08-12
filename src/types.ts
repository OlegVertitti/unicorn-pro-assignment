export interface Env {
  GEMINI_API_KEY: string;
  ASSETS: Fetcher;
}

export const ETHNICITIES = ["asian", "latina", "black", "multiethnic"] as const;
export const GENDERS = ["male", "female"] as const;
export const AGES = ["young", "middle-aged", "older"] as const;
export const ACTIVITIES = [
  "posing",
  "dancing",
  "cooking",
  "talking",
  "walking",
  "sitting",
  "exercising",
  "selfie",
  "eating",
  "working",
  "driving",
  "swimming",
  "reading",
  "hugging",
  "kissing",
  "laughing",
  "other",
] as const;
export const HAIR_COLORS = ["black", "brown", "blonde", "red", "gray", "other"] as const;
export const BODY_TYPES = ["slim", "average", "athletic", "curvy", "heavy"] as const;
export const CLOTHING = [
  "casual",
  "formal",
  "sporty",
  "swimwear",
  "lingerie",
  "dress",
  "suit",
  "other",
] as const;

export interface PersonAttributes {
  ethnicity: (typeof ETHNICITIES)[number];
  gender: (typeof GENDERS)[number];
  age: (typeof AGES)[number];
  activity: (typeof ACTIVITIES)[number];
  hairColor: (typeof HAIR_COLORS)[number];
  bodyType: (typeof BODY_TYPES)[number];
  clothing: (typeof CLOTHING)[number];
}

export interface AnalysisResult {
  mediaType: "image" | "video";
  personDetected: boolean;
  person: PersonAttributes | null;
  hasSpeech: boolean;
  transcript: string | null;
}

export interface DownloadedFile {
  bytes: ArrayBuffer;
  mimeType: string;
}
