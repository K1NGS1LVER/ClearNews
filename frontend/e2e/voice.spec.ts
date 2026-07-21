import { test, expect, type Page } from "@playwright/test";

// Real microphone capture and the Silero ONNX model can't run in headless
// CI Chromium, so these tests replace both: navigator.mediaDevices.getUserMedia
// is stubbed (in case any real code path still reaches it) and src/lib/vad.ts
// itself is swapped for a fake module that lets the test fire onSpeechEnd on
// demand via a window hook. That isolates what these tests actually cover -
// the mic button's state machine and its wiring into the existing send()
// chat flow - from VAD/ONNX internals, which task-3-brief.md calls out as
// something that has to be sanity-checked manually instead (see
// task-3-report.md).
const FAKE_VAD_MODULE = `
  export const VAD_SAMPLE_RATE = 16000;
  export async function startVad(speechEnd, speechStart) {
    // Stands in for the real mic-permission prompt / VAD asset load, which
    // can take a real amount of time - tests that need to observe
    // ChatPanel's behavior while this is still pending arm the gate via
    // armVoiceStartGate() before clicking the mic button.
    if (window.__voiceStartGate) {
      await window.__voiceStartGate;
    }
    window.__voiceTest = {
      // Fire-and-forget on purpose: page.evaluate() awaits whatever this
      // returns, so returning speechEnd()'s promise (ChatPanel's async
      // handleSpeechEnd) would block the test until the whole
      // transcribe+send flow finished, instead of letting it observe the
      // intermediate "transcribing" state.
      fireSpeechEnd: (len) => {
        speechEnd(new Float32Array(len ?? 1600));
      },
    };
    if (speechStart) speechStart();
    return {
      stop: () => {
        window.__voiceTest = undefined;
      },
    };
  }
`;

async function stubVoiceInput(page: Page) {
  await page.addInitScript(() => {
    // @ts-expect-error - test shim; getUserMedia is never actually reached
    // since lib/vad.ts itself is stubbed below, but stub it too in case a
    // real code path is exercised (e.g. a future regression).
    navigator.mediaDevices ??= {};
    // @ts-expect-error - see above
    navigator.mediaDevices.getUserMedia = async () => new MediaStream();
  });
  await page.route(/\/src\/lib\/vad\.ts(\?.*)?$/, (route) =>
    route.fulfill({ contentType: "application/javascript", body: FAKE_VAD_MODULE }),
  );
}

function fireSpeechEnd(page: Page) {
  return page.evaluate(() => (window as unknown as { __voiceTest?: { fireSpeechEnd: () => void } }).__voiceTest?.fireSpeechEnd());
}

// Installs a gate that FAKE_VAD_MODULE's startVad() awaits before doing
// anything else, so a test can click the mic button (which resolves
// synchronously up to that await, per ChatPanel's startVoice()) and then
// act - e.g. cancel - while the mic-permission/asset-load promise is still
// pending, before calling releaseVoiceStart() to let it resolve.
function armVoiceStartGate(page: Page) {
  return page.evaluate(() => {
    let release: () => void = () => {};
    (window as unknown as { __voiceStartGate: Promise<void> }).__voiceStartGate = new Promise<void>((r) => {
      release = r;
    });
    (window as unknown as { __releaseVoiceStart: () => void }).__releaseVoiceStart = () => release();
  });
}

function releaseVoiceStart(page: Page) {
  return page.evaluate(() => (window as unknown as { __releaseVoiceStart?: () => void }).__releaseVoiceStart?.());
}

function voiceTestActive(page: Page) {
  return page.evaluate(() => Boolean((window as unknown as { __voiceTest?: unknown }).__voiceTest));
}

test.describe("Voice input", () => {
  test.beforeEach(async ({ page }) => {
    await stubVoiceInput(page);
  });

  test("mic button records, transcribes, and sends the transcript through the normal chat flow", async ({ page }) => {
    let chatRequestBody: unknown = null;
    await page.route("**/api/chat/sessions", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: 1 }) }),
    );
    await page.route("**/api/chat", async (route) => {
      chatRequestBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: 'data: {"type":"token","content":"The sky is blue."}\n\ndata: {"type":"done"}\n\n',
      });
    });
    await page.route("**/api/voice/transcribe", async (route) => {
      // Small artificial delay so the "transcribing" state is observable
      // rather than flashing by within a single event-loop tick.
      await new Promise((r) => setTimeout(r, 200));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ transcript: "why is the sky blue" }),
      });
    });

    await page.goto("/chat");

    const micBtn = page.getByRole("button", { name: "Record a voice question" });
    await expect(micBtn).toBeVisible();

    // idle -> listening
    await micBtn.click();
    await expect(page.getByRole("button", { name: "Stop recording" })).toBeVisible();
    await expect(page.locator("text=● REC")).toBeVisible();

    await page.waitForFunction(() => Boolean((window as unknown as { __voiceTest?: unknown }).__voiceTest));
    await fireSpeechEnd(page);

    // listening -> transcribing
    await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();

    // transcribing -> idle, with the transcript having gone through send()
    // exactly like a typed message would.
    await expect(page.getByRole("button", { name: "Record a voice question" })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=why is the sky blue")).toBeVisible();
    await expect(page.locator("text=The sky is blue.")).toBeVisible();

    expect(chatRequestBody).toMatchObject({ content: "why is the sky blue" });
  });

  test("manual cancel during listening returns to idle without transcribing", async ({ page }) => {
    let transcribeCalled = false;
    await page.route("**/api/voice/transcribe", (route) => {
      transcribeCalled = true;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ transcript: "nope" }) });
    });

    await page.goto("/chat");
    const micBtn = page.getByRole("button", { name: "Record a voice question" });
    await micBtn.click();
    await expect(page.getByRole("button", { name: "Stop recording" })).toBeVisible();

    await page.getByRole("button", { name: "Stop recording" }).click();

    await expect(page.getByRole("button", { name: "Record a voice question" })).toBeVisible();
    expect(transcribeCalled).toBe(false);
  });

  test("cancelling while the mic permission/asset load is still pending stops the session once it resolves instead of leaving the mic armed", async ({ page }) => {
    // Regression test for a race: startVoice() flips voiceState to
    // "listening" synchronously, then awaits startVad() - which can take a
    // real amount of time (mic permission prompt, VAD asset load). If the
    // user cancels while that's still in flight, vadRef.current is still
    // null so the old code's cancelVoice() had nothing to stop, and the
    // session that later lands from the resolved startVad() promise was
    // stored unconditionally - arming a hot mic the UI showed as idle.
    let transcribeCalled = false;
    await page.route("**/api/voice/transcribe", (route) => {
      transcribeCalled = true;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ transcript: "nope" }) });
    });

    await page.goto("/chat");
    await armVoiceStartGate(page);

    const micBtn = page.getByRole("button", { name: "Record a voice question" });
    await micBtn.click();

    // idle -> listening happens before startVad()'s gated promise resolves.
    await expect(page.getByRole("button", { name: "Stop recording" })).toBeVisible();

    // Cancel now, while the gate is still closed - vadRef.current is null
    // at this point.
    await page.getByRole("button", { name: "Stop recording" }).click();
    await expect(page.getByRole("button", { name: "Record a voice question" })).toBeVisible();

    // Let startVad() resolve. The fix must stop the just-created session
    // immediately rather than storing it in vadRef / arming the mic.
    await releaseVoiceStart(page);
    await expect.poll(() => voiceTestActive(page)).toBe(false);

    // UI must still read idle, and firing speech-end on whatever session
    // came back must not reach transcribe/send.
    await expect(page.getByRole("button", { name: "Record a voice question" })).toBeVisible();
    await fireSpeechEnd(page);
    await page.waitForTimeout(100);
    expect(transcribeCalled).toBe(false);
    await expect(page.getByRole("button", { name: "Record a voice question" })).toBeVisible();
  });

  test("cancel during transcribing returns to idle without waiting for the response", async ({ page }) => {
    // A transcribe response that never arrives within the test's lifetime -
    // if cancel didn't work, the button would stay stuck on "Cancel".
    await page.route("**/api/voice/transcribe", () => {});

    await page.goto("/chat");
    const micBtn = page.getByRole("button", { name: "Record a voice question" });
    await micBtn.click();
    await page.waitForFunction(() => Boolean((window as unknown as { __voiceTest?: unknown }).__voiceTest));
    await fireSpeechEnd(page);

    const cancelBtn = page.getByRole("button", { name: "Cancel" });
    await expect(cancelBtn).toBeVisible();
    await cancelBtn.click();

    await expect(page.getByRole("button", { name: "Record a voice question" })).toBeVisible();
  });

  test("a failed transcription shows an error and resets to idle", async ({ page }) => {
    await page.route("**/api/voice/transcribe", (route) =>
      route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "unavailable" }) }),
    );

    await page.goto("/chat");
    const micBtn = page.getByRole("button", { name: "Record a voice question" });
    await micBtn.click();
    await page.waitForFunction(() => Boolean((window as unknown as { __voiceTest?: unknown }).__voiceTest));
    await fireSpeechEnd(page);

    await expect(page.locator("text=Voice transcription is unavailable right now.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Record a voice question" })).toBeVisible();
  });

  test("a rate-limited transcription (429) shows a specific message distinct from the generic fallback", async ({ page }) => {
    await page.route("**/api/voice/transcribe", (route) =>
      route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ detail: "too many requests, try again shortly" }) }),
    );

    await page.goto("/chat");
    const micBtn = page.getByRole("button", { name: "Record a voice question" });
    await micBtn.click();
    await page.waitForFunction(() => Boolean((window as unknown as { __voiceTest?: unknown }).__voiceTest));
    await fireSpeechEnd(page);

    await expect(page.locator("text=Too many voice requests - wait a moment and try again.")).toBeVisible();
    // Not the generic fallback that any other unhandled status code falls through to.
    await expect(page.locator("text=transcribe failed: 429")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Record a voice question" })).toBeVisible();
  });

  test("the voice error message is exposed as a polite live region for screen readers", async ({ page }) => {
    await page.route("**/api/voice/transcribe", (route) =>
      route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "unavailable" }) }),
    );

    await page.goto("/chat");
    const micBtn = page.getByRole("button", { name: "Record a voice question" });
    await micBtn.click();
    await page.waitForFunction(() => Boolean((window as unknown as { __voiceTest?: unknown }).__voiceTest));
    await fireSpeechEnd(page);

    const errorStatus = page.locator("text=Voice transcription is unavailable right now.");
    await expect(errorStatus).toBeVisible();
    await expect(errorStatus).toHaveAttribute("aria-live", "polite");
    await expect(errorStatus).toHaveAttribute("role", "status");
  });

  test("voice state transitions are announced via a hidden live region", async ({ page }) => {
    await page.route("**/api/voice/transcribe", async (route) => {
      await new Promise((r) => setTimeout(r, 200));
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ transcript: "" }) });
    });

    await page.goto("/chat");
    const statusRegion = page.locator('span[role="status"]').first();
    await expect(statusRegion).toHaveAttribute("aria-live", "polite");
    await expect(statusRegion).toHaveText("");

    const micBtn = page.getByRole("button", { name: "Record a voice question" });
    await micBtn.click();
    await expect(statusRegion).toHaveText("Listening for your question.");

    await page.waitForFunction(() => Boolean((window as unknown as { __voiceTest?: unknown }).__voiceTest));
    await fireSpeechEnd(page);
    await expect(statusRegion).toHaveText("Transcribing your question.");

    await expect(page.getByRole("button", { name: "Record a voice question" })).toBeVisible({ timeout: 10_000 });
    await expect(statusRegion).toHaveText("");
  });

  test("mic button is disabled while an answer is streaming", async ({ page }) => {
    await page.route("**/api/chat/sessions", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: 1 }) }),
    );
    // Never fulfilled, keeping `busy` true for the test's lifetime so we
    // can assert the mic button's disabled state.
    await page.route("**/api/chat", () => {});

    await page.goto("/chat");
    await page.fill("input[placeholder*='Ask']", "typed question");
    await page.click("button:has-text('Send')");

    await expect(page.getByRole("button", { name: "Record a voice question" })).toBeDisabled();
  });
});
