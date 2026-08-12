import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import type { AnalyzeEvent } from "./types";

vi.mock("./lib/sse", () => ({
  streamAnalyze: vi.fn(),
}));

import { streamAnalyze } from "./lib/sse";

const mockedStreamAnalyze = vi.mocked(streamAnalyze);

function scriptedStream(events: AnalyzeEvent[]) {
  return async (_url: string, onEvent: (e: AnalyzeEvent) => void) => {
    for (const e of events) onEvent(e);
  };
}

const IMAGE_RESULT: AnalyzeEvent = {
  stage: "done",
  result: {
    mediaType: "image",
    personDetected: true,
    person: {
      ethnicity: "asian",
      gender: "male",
      age: "young",
      activity: "posing",
      hairColor: "black",
      bodyType: "slim",
      clothing: "casual",
    },
    hasSpeech: false,
    transcript: null,
  },
};

describe("App", () => {
  beforeEach(() => {
    mockedStreamAnalyze.mockReset();
  });

  it("shows the idle hint before anything is submitted", () => {
    render(<App />);
    expect(screen.getByText(/example: https:\/\/drive\.google\.com/i)).toBeInTheDocument();
  });

  it("runs a single URL through downloading -> analyzing -> done", async () => {
    mockedStreamAnalyze.mockImplementation(
      scriptedStream([{ stage: "downloading" }, { stage: "analyzing" }, IMAGE_RESULT]),
    );

    const user = userEvent.setup();
    render(<App />);
    await user.type(
      screen.getByLabelText(/google drive urls/i),
      "https://drive.google.com/file/d/1abc/view",
    );
    await user.click(screen.getByRole("button", { name: /^analyze$/i }));

    expect(await screen.findByText("Image")).toBeInTheDocument();
    expect(screen.getByText("asian")).toBeInTheDocument();
    expect(mockedStreamAnalyze).toHaveBeenCalledTimes(1);
  });

  it("renders one card per URL in batch mode", async () => {
    mockedStreamAnalyze.mockImplementation(scriptedStream([IMAGE_RESULT]));

    const user = userEvent.setup();
    render(<App />);
    await user.type(
      screen.getByLabelText(/google drive urls/i),
      "https://drive.google.com/file/d/1abc/view\nhttps://drive.google.com/file/d/2def/view",
    );
    expect(screen.getByRole("button", { name: /analyze 2 creatives/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /analyze 2 creatives/i }));

    const badges = await screen.findAllByText("Image");
    expect(badges).toHaveLength(2);
    expect(mockedStreamAnalyze).toHaveBeenCalledTimes(2);
  });

  it("shows a client-side error for an invalid line without calling the backend", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText(/google drive urls/i), "https://example.com/not-drive");
    await user.click(screen.getByRole("button", { name: /^analyze$/i }));

    expect(await screen.findByText(/couldn't analyze this creative/i)).toBeInTheDocument();
    expect(mockedStreamAnalyze).not.toHaveBeenCalled();
  });
});
