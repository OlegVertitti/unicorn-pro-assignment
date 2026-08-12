import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Job } from "../types";
import { CreativeCard } from "./CreativeCard";

const BASE_URL = "https://drive.google.com/file/d/1abcXYZ/view";

function job(overrides: Partial<Job>): Job {
  return { id: "1", url: BASE_URL, status: "queued", ...overrides };
}

describe("CreativeCard", () => {
  it("shows a queued message before analysis starts", () => {
    render(<CreativeCard job={job({ status: "queued" })} />);
    expect(screen.getByText(/waiting in queue/i)).toBeInTheDocument();
  });

  it("shows a stage-specific loading message while in progress", () => {
    render(<CreativeCard job={job({ status: "processing" })} />);
    expect(screen.getByText(/processing the video/i)).toBeInTheDocument();
  });

  it("renders the full parameter table when a person is detected", () => {
    render(
      <CreativeCard
        job={job({
          status: "done",
          result: {
            mediaType: "image",
            personDetected: true,
            person: {
              ethnicity: "asian",
              gender: "male",
              age: "young",
              activity: "hugging",
              hairColor: "black",
              bodyType: "athletic",
              clothing: "casual",
            },
            hasSpeech: false,
            transcript: null,
          },
        })}
      />,
    );
    expect(screen.getByText("Image")).toBeInTheDocument();
    expect(screen.getByText("Ethnicity")).toBeInTheDocument();
    expect(screen.getByText("asian")).toBeInTheDocument();
    expect(screen.getByText("athletic")).toBeInTheDocument();
    // still an image, so no transcript section at all
    expect(screen.queryByText("Transcript")).not.toBeInTheDocument();
  });

  it("shows an empty-state note when no person was detected", () => {
    render(
      <CreativeCard
        job={job({
          status: "done",
          result: {
            mediaType: "image",
            personDetected: false,
            person: null,
            hasSpeech: false,
            transcript: null,
          },
        })}
      />,
    );
    expect(screen.getByText(/no person in focus was detected/i)).toBeInTheDocument();
  });

  it("renders the transcript for a video with speech", () => {
    render(
      <CreativeCard
        job={job({
          status: "done",
          result: {
            mediaType: "video",
            personDetected: true,
            person: {
              ethnicity: "latina",
              gender: "female",
              age: "middle-aged",
              activity: "talking",
              hairColor: "blonde",
              bodyType: "average",
              clothing: "casual",
            },
            hasSpeech: true,
            transcript: "hello from the video",
          },
        })}
      />,
    );
    expect(screen.getByText("hello from the video")).toBeInTheDocument();
  });

  it("shows a no-speech note for a video without speech", () => {
    render(
      <CreativeCard
        job={job({
          status: "done",
          result: {
            mediaType: "video",
            personDetected: false,
            person: null,
            hasSpeech: false,
            transcript: null,
          },
        })}
      />,
    );
    expect(screen.getByText(/no speech in this video/i)).toBeInTheDocument();
  });

  it("shows the error message when analysis failed", () => {
    render(
      <CreativeCard
        job={job({
          status: "error",
          error: { code: "drive_access_error", message: "cannot access file" },
        })}
      />,
    );
    expect(screen.getByText(/couldn't analyze this creative/i)).toBeInTheDocument();
    expect(screen.getByText("cannot access file")).toBeInTheDocument();
  });
});
