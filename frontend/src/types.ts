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
  code: string;
  message: string;
}

export type Stage = "downloading" | "uploading" | "processing" | "analyzing";

export type AnalyzeEvent =
  | { stage: Stage }
  | { stage: "done"; result: AnalysisResult }
  | { stage: "error"; error: ApiErrorBody };

export type JobStatus = "queued" | Stage | "done" | "error";

export interface Job {
  id: string;
  url: string;
  status: JobStatus;
  result?: AnalysisResult;
  error?: ApiErrorBody;
}
