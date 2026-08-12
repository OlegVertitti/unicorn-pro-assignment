export interface PersonAttributes {
  ethnicity: string;
  gender: string;
  age: string;
  activity: string;
  hairColor: string;
  bodyType: string;
  clothing: string;
}

export interface AnalysisResult {
  mediaType: "image" | "video";
  personDetected: boolean;
  person: PersonAttributes | null;
  hasSpeech: boolean;
  transcript: string | null;
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}
