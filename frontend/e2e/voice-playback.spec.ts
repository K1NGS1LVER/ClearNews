import http from "node:http";
import { test, expect, type Page } from "@playwright/test";

// Task 4: sentence-buffer + TTS playback for voice-originated chat turns.
//
// Real microphone/VAD is out of scope here (see voice.spec.ts's note on
// that); this file reuses the same fake VAD module so a voice-originated
// send() can be triggered on demand via fireSpeechEnd(). What IS real in
// these tests is the AudioContext/AudioBuffer/AudioBufferSourceNode machinery
// in lib/tts.ts - headless Chromium's Web Audio implementation is exercised
// for real (confirmed working via a throwaway probe test before writing
// these: `new AudioContext()` reaches "running" state and
// AudioBufferSourceNode.start() schedules without error), so these tests
// mock only the network boundary (/api/chat, /api/voice/speak,
// /api/voice/transcribe) and let the real playback-queue code run against
// real Web Audio APIs. What can't be verified in this environment is
// whether audio is *audible* through real hardware - these tests confirm
// requests are made with the right sentence-sized text, in the right order,
// at the right time relative to the stream, and that failures/Stop are
// handled correctly, not that a human would hear correct sound.
const FAKE_VAD_MODULE = `
  export const VAD_SAMPLE_RATE = 16000;
  export async function startVad(speechEnd, speechStart) {
    if (window.__voiceStartGate) {
      await window.__voiceStartGate;
    }
    window.__voiceTest = {
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

async function mockChatSession(page: Page) {
  await page.route("**/api/chat/sessions", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: 1 }) }),
  );
}

async function mockTranscribe(page: Page, transcript: string) {
  await page.route("**/api/voice/transcribe", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ transcript }) }),
  );
}

/** Raw PCM float32 bytes standing in for a real Kokoro response - matches
    the wire format lib/tts.ts expects (mono float32, no header), just very
    short (10ms of silence at 24kHz) since these tests only check that a
    playable AudioBuffer gets constructed and scheduled, not its content. */
function fakePcmBody(): Buffer {
  return Buffer.from(new Float32Array(240).buffer);
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/** Start a real local HTTP server streaming `parts` as separate TCP writes
    with a real delay between them, and return a URL a test can redirect
    the page's /api/chat fetch to via route.continue({ url }). This is the
    only way to get genuine incremental SSE delivery in these tests -
    Playwright's route.fulfill() only supports a single complete body, so it
    can't itself simulate a slow/chunked stream (confirmed via a throwaway
    probe: route.continue({ url }) redirecting to a locally-bound Node
    server did deliver separate reader.read() chunks with the real
    inter-write delay, which route.fulfill cannot). This lets the "not
    before it's complete" assertion below check real timing rather than
    just final call counts. */
async function startStreamingChatServer(parts: string[], delayMs: number): Promise<{ url: string; close: () => void }> {
  const server = http.createServer((req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(200, corsHeaders);
      res.end();
      return;
    }
    res.writeHead(200, { ...corsHeaders, "Content-Type": "text/event-stream" });
    void (async () => {
      for (const part of parts) {
        res.write(part);
        await new Promise((r) => setTimeout(r, delayMs));
      }
      res.end();
    })();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  return { url: `http://127.0.0.1:${port}/api/chat`, close: () => server.close() };
}

async function routeChatToStreamingServer(page: Page, url: string) {
  await page.route("**/api/chat", (route) => {
    if (route.request().method() === "OPTIONS") {
      return route.fulfill({ status: 200, headers: corsHeaders });
    }
    return route.continue({ url });
  });
}

test.describe("Voice playback (TTS)", () => {
  let pageErrors: Error[];

  test.beforeEach(async ({ page }) => {
    pageErrors = [];
    page.on("pageerror", (err) => pageErrors.push(err));
    await stubVoiceInput(page);
  });

  test.afterEach(() => {
    expect(pageErrors, `unexpected uncaught page errors: ${pageErrors.map((e) => e.message).join("; ")}`).toEqual([]);
  });

  test("a voice-originated turn speaks each sentence once it's complete, not before, and not the whole answer at once", async ({ page }) => {
    const speakRequests: string[] = [];
    await mockChatSession(page);
    await mockTranscribe(page, "why is the sky blue");
    await page.route("**/api/voice/speak", async (route) => {
      speakRequests.push((route.request().postDataJSON() as { text: string }).text);
      await route.fulfill({ status: 200, contentType: "application/octet-stream", body: fakePcmBody() });
    });

    // event1's content ends in "." with nothing after it yet - per the
    // sentence-boundary rule (punctuation must be followed by whitespace to
    // count as complete, not just be the end of what's arrived so far) this
    // must NOT dispatch on its own. Only once event2 arrives, whose content
    // starts with a space, does "The sky is blue. " become a genuine
    // boundary - a real 350ms gap over the wire, not a compressed mock.
    const server = await startStreamingChatServer(
      [
        'data: {"type":"token","content":"The sky is blue."}\n\n',
        'data: {"type":"token","content":" Grass is green."}\n\n',
        'data: {"type":"done"}\n\n',
      ],
      350,
    );
    try {
      await routeChatToStreamingServer(page, server.url);

      await page.goto("/chat");
      await page.getByRole("button", { name: "Record a voice question" }).click();
      await page.waitForFunction(() => Boolean((window as unknown as { __voiceTest?: unknown }).__voiceTest));
      await fireSpeechEnd(page);

      // Well within the 350ms gap before event2 - only event1 has landed,
      // and it must not have triggered a speak call yet.
      await page.waitForTimeout(150);
      expect(speakRequests).toEqual([]);

      // Past the 350ms mark: event2 has landed, completing sentence 1.
      await expect.poll(() => speakRequests.length, { timeout: 3000 }).toBeGreaterThanOrEqual(1);
      expect(speakRequests[0]).toBe("The sky is blue.");
      // Sentence-sized, not the whole answer.
      expect(speakRequests[0]).not.toContain("Grass");

      // "done" flushes the trailing text (never hit a followed-by-whitespace
      // boundary) as the final sentence.
      await expect.poll(() => speakRequests.length, { timeout: 3000 }).toBe(2);
      expect(speakRequests[1]).toBe("Grass is green.");
    } finally {
      server.close();
    }
  });

  test("a typed turn's streamed answer does not trigger any /api/voice/speak calls", async ({ page }) => {
    let speakCalled = false;
    await page.route("**/api/voice/speak", (route) => {
      speakCalled = true;
      return route.fulfill({ status: 200, contentType: "application/octet-stream", body: fakePcmBody() });
    });
    await mockChatSession(page);
    await page.route("**/api/chat", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: 'data: {"type":"token","content":"The sky is blue. Grass is green."}\n\ndata: {"type":"done"}\n\n',
      }),
    );

    await page.goto("/chat");
    await page.fill("input[placeholder*='Ask']", "why is the sky blue");
    await page.click("button:has-text('Send')");

    await expect(page.locator("text=The sky is blue. Grass is green.")).toBeVisible();
    expect(speakCalled).toBe(false);
  });

  test("hitting Stop mid-answer stops further speech requests", async ({ page }) => {
    const speakRequests: string[] = [];
    await mockChatSession(page);
    await mockTranscribe(page, "why is the sky blue");
    await page.route("**/api/voice/speak", async (route) => {
      speakRequests.push((route.request().postDataJSON() as { text: string }).text);
      await route.fulfill({ status: 200, contentType: "application/octet-stream", body: fakePcmBody() });
    });

    const server = await startStreamingChatServer(
      [
        'data: {"type":"token","content":"First sentence. "}\n\n',
        'data: {"type":"token","content":"Second sentence."}\n\n',
        'data: {"type":"done"}\n\n',
      ],
      400,
    );
    try {
      await routeChatToStreamingServer(page, server.url);

      await page.goto("/chat");
      await page.getByRole("button", { name: "Record a voice question" }).click();
      await page.waitForFunction(() => Boolean((window as unknown as { __voiceTest?: unknown }).__voiceTest));
      await fireSpeechEnd(page);

      // First sentence completed and dispatched (its trailing space is
      // already in the first event, so it's a real boundary as soon as
      // that event is processed - no need to wait for event2).
      await expect.poll(() => speakRequests.length, { timeout: 3000 }).toBe(1);
      expect(speakRequests[0]).toBe("First sentence.");

      // Stop before event2/done land (400ms gap gives plenty of room).
      await page.click("button:has-text('Stop')");

      // Long enough for event2 and done to have arrived had the stream not
      // been aborted - the second sentence must never be requested.
      await page.waitForTimeout(700);
      expect(speakRequests).toEqual(["First sentence."]);
    } finally {
      server.close();
    }
  });

  test("a failed /api/voice/speak call for one sentence does not prevent subsequent sentences", async ({ page }) => {
    const speakRequests: string[] = [];
    await mockChatSession(page);
    await mockTranscribe(page, "tell me two things");
    await page.route("**/api/voice/speak", async (route) => {
      const text = (route.request().postDataJSON() as { text: string }).text;
      speakRequests.push(text);
      if (text === "First sentence.") {
        await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "tts blew up" }) });
      } else {
        await route.fulfill({ status: 200, contentType: "application/octet-stream", body: fakePcmBody() });
      }
    });
    await page.route("**/api/chat", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: 'data: {"type":"token","content":"First sentence. Second sentence."}\n\ndata: {"type":"done"}\n\n',
      }),
    );

    await page.goto("/chat");
    await page.getByRole("button", { name: "Record a voice question" }).click();
    await page.waitForFunction(() => Boolean((window as unknown as { __voiceTest?: unknown }).__voiceTest));
    await fireSpeechEnd(page);

    await expect.poll(() => speakRequests, { timeout: 3000 }).toEqual(["First sentence.", "Second sentence."]);
  });

  test("a malformed 200 /api/voice/speak response for one sentence does not prevent subsequent sentences", async ({ page }) => {
    // Regression test: a 200 response whose body length isn't a multiple of
    // 4 bytes makes `new Float32Array(raw)` throw a RangeError in the
    // playback-scheduling stage (after the fetch itself already succeeded),
    // which is a different failure point than the HTTP-500 case covered
    // above - that one is caught by the fetch chain's .catch(), this one
    // previously was not, and would silently kill every later sentence in
    // the same turn.
    const speakRequests: string[] = [];
    await mockChatSession(page);
    await mockTranscribe(page, "tell me two things");
    await page.route("**/api/voice/speak", async (route) => {
      const text = (route.request().postDataJSON() as { text: string }).text;
      speakRequests.push(text);
      if (text === "First sentence.") {
        // 5 bytes: not a multiple of 4, so `new Float32Array()` on this
        // buffer throws a RangeError once the queue tries to schedule it.
        await route.fulfill({ status: 200, contentType: "application/octet-stream", body: Buffer.from([0, 1, 2, 3, 4]) });
      } else {
        await route.fulfill({ status: 200, contentType: "application/octet-stream", body: fakePcmBody() });
      }
    });
    await page.route("**/api/chat", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: 'data: {"type":"token","content":"First sentence. Second sentence."}\n\ndata: {"type":"done"}\n\n',
      }),
    );

    await page.goto("/chat");
    await page.getByRole("button", { name: "Record a voice question" }).click();
    await page.waitForFunction(() => Boolean((window as unknown as { __voiceTest?: unknown }).__voiceTest));
    await fireSpeechEnd(page);

    await expect.poll(() => speakRequests, { timeout: 3000 }).toEqual(["First sentence.", "Second sentence."]);
  });
});
