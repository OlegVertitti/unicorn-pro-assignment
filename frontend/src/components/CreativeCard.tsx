import { extractDriveFileId } from "../lib/drive";
import type { AnalysisResult, Job, Stage } from "../types";

const STAGE_LABELS: Record<Stage, string> = {
  downloading: "Downloading from Google Drive…",
  uploading: "Uploading to Gemini…",
  processing: "Gemini is processing the video…",
  analyzing: "Analyzing with Gemini…",
};

const PARAM_LABELS: Record<keyof NonNullable<AnalysisResult["person"]>, string> = {
  ethnicity: "Ethnicity",
  gender: "Gender",
  age: "Age",
  activity: "Activity",
  hairColor: "Hair color",
  bodyType: "Body type",
  clothing: "Clothing",
};

export function CreativeCard({ job }: { job: Job }) {
  const fileId = extractDriveFileId(job.url);
  const isProgressStage =
    job.status !== "queued" && job.status !== "done" && job.status !== "error";

  return (
    <div className="creative-card">
      <div className="preview">
        {fileId ? (
          <iframe
            src={`https://drive.google.com/file/d/${fileId}/preview`}
            allow="autoplay"
            loading="lazy"
            title={`Preview of ${job.url}`}
          />
        ) : (
          <div className="preview-fallback">No preview</div>
        )}
      </div>

      <div className="creative-body">
        <p className="creative-url" title={job.url}>
          {job.url}
        </p>

        {job.status === "queued" && <p className="empty-note">Waiting in queue…</p>}

        {isProgressStage && (
          <div className="state-box loading" role="status">
            <span className="spinner" aria-hidden="true" />
            <span>{STAGE_LABELS[job.status as Stage]}</span>
          </div>
        )}

        {job.status === "error" && (
          <div className="state-box error" role="alert">
            <strong>Couldn't analyze this creative.</strong>
            <span>{job.error?.message}</span>
          </div>
        )}

        {job.status === "done" && job.result && (
          <div className="result">
            <div className="result-badge">
              {job.result.mediaType === "video" ? "Video" : "Image"}
            </div>

            <section className="card">
              <h2>Person in frame</h2>
              {job.result.personDetected && job.result.person ? (
                <table className="params-table">
                  <tbody>
                    {(Object.keys(PARAM_LABELS) as Array<keyof typeof PARAM_LABELS>).map((key) => (
                      <tr key={key}>
                        <th>{PARAM_LABELS[key]}</th>
                        <td>{job.result!.person![key]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="empty-note">No person in focus was detected in this creative.</p>
              )}
            </section>

            {job.result.mediaType === "video" && (
              <section className="card">
                <h2>Transcript</h2>
                {job.result.hasSpeech && job.result.transcript ? (
                  <p className="transcript">{job.result.transcript}</p>
                ) : (
                  <p className="empty-note">No speech in this video (music only or silence).</p>
                )}
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
