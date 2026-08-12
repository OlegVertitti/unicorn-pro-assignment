# Ad Creative Analyzer

An internal tool for a performance-marketing team: paste a public Google Drive link (image or video), get a structured analysis of the person in frame and a transcript of any speech — all powered by the Gemini API.

**Live URL:** https://unicorn-pro-assignment.olegvertitti.workers.dev

## Stack

| Component | Choice |
|---|---|
| Backend | Cloudflare Worker (Hono) |
| Frontend | React + Vite (TypeScript) |
| Deploy | A single Cloudflare Worker with Static Assets (not separate Workers + Pages) |
| LLM | Gemini API, model alias `gemini-flash-latest` |
| Validation | Zod (both on the request and on Gemini's response) |

## Flow

1. The frontend accepts one or more Drive links (one per line) and, for each, opens `POST /api/analyze { url }` against the same Worker (same-origin, no CORS needed) as a **Server-Sent Events** stream.
2. The Worker parses the `fileId` out of the Drive link, downloads the raw bytes directly from Google Drive, and emits a `downloading` progress event.
3. Image → sent inline as base64 in a single `generateContent` call (emits `analyzing`). Video → uploaded to the Gemini Files API (resumable upload, emits `uploading`), the Worker waits for `ACTIVE` (emits `processing`), then references the file by `file_uri` in that same single `generateContent` call (emits `analyzing`).
4. One request returns both the person's attributes and the transcript together — enforced via `responseSchema` (an enum per field), not just described in the prompt text. A final `done` event carries the result, or an `error` event carries a code + message.
5. The frontend renders one card per link: a live Google Drive preview (embedded via Drive's own `/preview` endpoint, no bytes proxied through the Worker), a stage-aware progress indicator while it runs, then a parameters table plus transcript section on success — batching multiple links runs them with a client-side concurrency cap of 3 at a time.

## Architectural decisions

- **One Worker with Static Assets, not separate Workers + Pages.** The brief allowed either; a single deployment removes CORS and simplifies the config — a deliberate trade-off for simplicity within a 5-6 hour budget.
- **One Gemini request per file**, not two (separate vision call + separate transcript call). Gemini already processes a video's frames and audio together in one call, so a second request would just double cost and latency for no benefit.
- **Files API for video, inline base64 for images.** Images are always small, so inline is simplest. For video, the Files API removes ambiguity around inline payload limits (Google's own docs are inconsistent — 20MB vs 100MB) and doesn't count against the Worker's CPU time (only I/O wait).
- **`responseSchema` with enums**, not "return JSON" as prose in the prompt — this technically constrains the model to the values from the parameter table instead of just asking it to comply.
- **An `AppError` hierarchy** (`src/errors.ts`) with distinct codes/HTTP statuses for invalid_url / drive_access_error / unsupported_file_type / gemini_error / gemini_safety_block — the frontend shows the user a readable message tied to the actual cause instead of a generic "something went wrong".
- **`gemini-flash-latest` instead of a pinned model version.** During development it turned out the entire `gemini-2.5-*` line is already unavailable for new API keys ("no longer available to new users") — Google points to newer models instead. The alias automatically tracks whichever model is currently recommended, reducing the risk of sudden deprecation.
- **Progress via hand-rolled SSE, not `EventSource`.** `EventSource` only supports `GET`, and this endpoint needs a `POST` body (the Drive URL), so the frontend uses `fetch` + a manual `ReadableStream` reader that parses the standard `data: {...}\n\n` framing itself (`frontend/src/lib/sse.ts`). The backend uses Hono's `streamSSE` helper (`src/index.ts`) so each pipeline stage (`downloading` / `uploading` / `processing` / `analyzing`) is pushed to the client as it happens instead of one opaque spinner.
- **Batch mode reuses the single-URL endpoint N times, client-side**, rather than adding a batch endpoint. Each line the user pastes becomes its own SSE connection and its own card with independent state; a small concurrency cap (3 at a time) throttles how many run in parallel. This turned out not to be a hypothetical concern — Gemini's free-tier per-minute rate limit was hit repeatedly during this session's own testing, which is also why `fetchWithRetry` now backs off with 1s/2s exponential delays instead of a single flat retry.
- **Media preview via Drive's own `/preview` iframe**, not by proxying the downloaded bytes back through the Worker. The file is already public, so the browser can embed `drive.google.com/file/d/{id}/preview` directly (verified it isn't blocked by `X-Frame-Options`/CSP) — this avoids doubling bandwidth and Worker time for something purely cosmetic.

## Edge case handling

| Case | Behavior |
|---|---|
| No person in focus | `personDetected: false`, `person: null`; the transcript (voiceover) is still analyzed independently |
| Video with no speech (music/silence) | `transcript: null`, `hasSpeech: false` |
| Image | `transcript` and `hasSpeech` are forced to `null`/`false` in code, even if the model returned something else |
| Non-English speech | Returned in the original language, no translation (explicit instruction in the prompt) |
| Ambiguous ethnicity | Defaults to `multiethnic` (this is also the only bucket for, e.g., a white person — the given category list has no separate "caucasian" option) |
| **Two people equally in focus** (found on a test image — a couple embracing, even though the brief says "always one person") | The prompt explicitly says to pick whoever is closer to camera/more centered; if truly indistinguishable, pick the one on the left |
| Google Drive: large file / "can't scan for viruses" interstitial | Primary path is `drive.usercontent.google.com/download?...&confirm=t` (bypasses the warning for all 6 test files with no extra steps); a fallback parses a confirm token out of the HTML if the interstitial still appears |
| Drive file not public / inaccessible | Detected via `Content-Type: text/html` instead of binary → a clear error is returned to the user |
| Unsupported file type | `Content-Type` is checked before the file is ever sent to Gemini |
| Gemini rate limit (429) / 503 | Two retries with exponential backoff (1s, 2s) — added after this session's own testing hit the free-tier rate limit repeatedly |
| Gemini safety block | Distinct error code `gemini_safety_block` (in practice, never triggered on any of the 6 test files — see below) |

## Results on the 6 provided test creatives

All 6 were processed successfully end to end (Drive → Worker → Gemini → JSON), with no safety-filter refusals even on direct dating-vertical content ("Lesbians over 50 need to know about this...", "After my divorce I was done with men...").

| # | Type | Result |
|---|---|---|
| 1 | video, 7.4MB | ✅ woman, selfie, transcript extracted |
| 2 | image, 2.4MB | ✅ couple embracing — the man was picked as primary (closer/more centered) |
| 3 | video, 14MB | ✅ woman, talking, transcript extracted |
| 4 | video, 19.7MB | ✅ woman, eating, transcript extracted |
| 5 | video, 4.5MB | ✅ woman, selfie, transcript extracted |
| 6 | video, 3.3MB | ✅ woman, dancing, short transcript |

No file failed, so there's nothing to document as a known-broken case.

## How AI tools were used

The entire codebase was written pair-programming with Claude Code (Sonnet 5). A few things worth calling out beyond "an AI wrote the code":

- **Empirical testing before writing app code.** Before a single line of application code was written, all 6 Drive links and several prompt variants were run directly through `curl` against the Gemini REST API and Drive's download endpoint. This immediately surfaced two facts that shaped the architecture: the brief's own fields (ethnicity/body type/lingerie on real photos, "ignore blurred background people") are a genuine safety-filter risk worth testing empirically rather than assuming, and the model I'd have defaulted to from training knowledge (`gemini-2.5-flash`) is already blocked for new API keys.
- **Current facts instead of stale knowledge.** The model's knowledge cutoff is January 2026 and it is now August 2026 — in that gap, `gemini-flash-latest`/Gemini 3.x shipped, Cloudflare Workers limits changed (subrequests, CPU time), and the recommended way to deploy a frontend shifted (Static Assets over standalone Pages). All of these were verified via search before finalizing the plan, not recalled from memory.
- **Debugging from evidence, not assumption.** When the Files API returned `200` with an empty `{}` instead of an upload URL, the first hypothesis was a Workers-specific header-stripping bug (a debug route was added to compare outgoing headers via httpbin). Only after that came up empty did rereading the code surface the real cause: a missing `/upload/` path segment, lost when the URL was copied from a shell test into TypeScript.
- **The agent also drove infrastructure, not just code**: registering a workers.dev subdomain via the Cloudflare API (since `wrangler deploy` couldn't handle the corresponding interactive prompt non-interactively), setting secrets, and the full deploy.

## Testing

- `npm test` (root) — Vitest against `src/drive.ts` and `src/gemini.ts` in a plain Node environment, with `fetch` mocked using real `Response` objects. Covers Drive URL parsing, the confirm-token interstitial fallback, the image/video branching in `analyzeCreative`, the forced-null transcript on images, safety-block detection, and the 429 retry.
- `npm --prefix frontend test` — Vitest + Testing Library + jsdom. `lib/sse.test.ts` exercises the hand-rolled SSE parser directly (including a chunk boundary landing mid-event); `CreativeCard.test.tsx` covers each render state from props; `App.test.tsx` mocks `streamAnalyze` to drive the full submit → progress → result flow, including batch mode and the client-side invalid-URL case.
- **Scope note:** these are component/integration tests (jsdom, mocked network), not full browser end-to-end tests — Playwright wasn't set up given the time budget, and the Chrome extension used for live manual testing during this session was unavailable partway through. The current tests catch logic/rendering regressions but not real-browser issues (actual iframe embedding, real streaming timing, layout).

## What I'd do next (with ~5 more hours)

- Real browser e2e (Playwright) against the deployed URL, including the Drive preview iframe actually rendering.
- Cache analysis results by `fileId` (Workers KV) so re-analyzing the same creative isn't billed twice.
- Surface Gemini's 429 rate limit to the user as a visible "retrying in Ns…" countdown instead of a silent backoff — this repeatedly happened during this session's own testing and a silent retry under a generic spinner would be a confusing UX moment.
- Rate limiting and lightweight auth — the tool is fully public right now, as the brief required, but a real internal tool should sit behind at least a basic password/token.
- Explicitly delete the file from the Gemini Files API right after analysis instead of relying on its automatic 48h expiry.
- A cancel button per card (the `AbortController` plumbing is already there client-side, just not wired to a UI control).

## Local development

```
npm install
npm --prefix frontend install
cp .dev.vars.example .dev.vars   # add your own GEMINI_API_KEY
npm --prefix frontend run build  # the Worker serves the built dist/ via Static Assets
npm run dev                      # wrangler dev on :8787
```

## Deploy

```
npx wrangler secret put GEMINI_API_KEY
npm run deploy
```
