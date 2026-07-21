/** Sentence-by-sentence TTS playback queue for voice-originated chat turns.
    ChatPanel.tsx feeds it completed sentences as they're detected in the
    streamed answer (see extractCompleteSentences below); this module owns
    fetching each sentence's audio from /api/voice/speak and scheduling it
    for gapless back-to-back playback on a shared AudioContext. No UI code -
    see lib/vad.ts and lib/wav.ts for the same convention on the input side. */

/** Matches backend/app/voice.py's TTS_SAMPLE_RATE - Kokoro always outputs
    24kHz mono float32 PCM, not configurable, so this is a plain constant
    rather than something threaded through from the response. */
const TTS_SAMPLE_RATE = 24000;

/** Split the not-yet-dispatched tail of a streaming answer into complete
    sentences plus a leftover remainder.

    Only punctuation followed by actual whitespace counts as a boundary -
    punctuation at the very end of `pending` is deliberately NOT treated as
    complete, since during streaming that just means "no more tokens have
    arrived yet", not "the sentence is finished" (the next token might be a
    continuation, e.g. mid-abbreviation or a decimal number). The caller is
    responsible for flushing whatever's left as a final "sentence" once the
    stream itself ends (done in ChatPanel.tsx after its SSE loop exits). */
export function extractCompleteSentences(pending: string): { sentences: string[]; rest: string } {
  const sentences: string[] = [];
  const boundary = /[.!?](?=\s)/g;
  let consumed = 0;
  let match: RegExpExecArray | null;
  while ((match = boundary.exec(pending))) {
    const end = match.index + 1; // up to and including the punctuation
    const sentence = pending.slice(consumed, end).trim();
    if (sentence) sentences.push(sentence);
    consumed = end;
  }
  return { sentences, rest: pending.slice(consumed) };
}

export type SpeechQueue = {
  /** Fetch this sentence's audio and schedule it to play immediately after
      whatever was previously enqueued (in enqueue order). The fetch itself
      is not serialized against prior sentences - only the playback
      scheduling step is - so a slow sentence doesn't hold up requesting the
      next one. A failed fetch/synthesis is logged and skipped rather than
      breaking the chain for subsequent sentences. No-op once stopped. */
  enqueue: (sentence: string) => void;
  /** Stop and discard any currently playing or scheduled audio, and ignore
      any fetches still in flight when they land. Safe to call any time,
      including when nothing is playing. */
  stop: () => void;
};

/** Create a playback queue bound to `audioContext`. Callers own the
    AudioContext's lifecycle (creation must happen inside a user-gesture
    handler for autoplay policy - see ChatPanel.tsx's startVoice() - and it
    should be closed on unmount); this module only ever calls
    createBufferSource()/createBuffer() on it. */
export function createSpeechQueue(audioContext: AudioContext): SpeechQueue {
  let stopped = false;
  const activeSources: AudioBufferSourceNode[] = [];
  // Chains playback scheduling in enqueue order; each link resolves to the
  // end time of the sentence it just scheduled (or the previous end time,
  // unchanged, if that sentence failed/was empty), so the next link's
  // start time is always max(now, previous end).
  let schedule: Promise<number> = Promise.resolve(audioContext.currentTime);

  function enqueue(sentence: string) {
    if (stopped) return;
    const text = sentence.trim();
    if (!text) return;

    const audioPromise = fetch("/api/voice/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    })
      .then((resp) => {
        if (!resp.ok) throw new Error(`speak failed: ${resp.status}`);
        return resp.arrayBuffer();
      })
      .catch((err) => {
        console.error("TTS request failed for a sentence; skipping it.", err);
        return null;
      });

    schedule = schedule.then(async (prevEndTime) => {
      const raw = await audioPromise;
      if (stopped || raw === null || raw.byteLength === 0) return prevEndTime;

      const samples = new Float32Array(raw);
      const buffer = audioContext.createBuffer(1, samples.length, TTS_SAMPLE_RATE);
      buffer.copyToChannel(samples, 0);

      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContext.destination);
      source.onended = () => {
        const i = activeSources.indexOf(source);
        if (i !== -1) activeSources.splice(i, 1);
      };

      // Re-check after the await above - stop() may have landed while this
      // sentence's fetch was in flight.
      if (stopped) return prevEndTime;
      const startTime = Math.max(audioContext.currentTime, prevEndTime);
      source.start(startTime);
      activeSources.push(source);
      return startTime + buffer.duration;
    });
  }

  function stop() {
    stopped = true;
    for (const source of activeSources.splice(0)) {
      try {
        source.stop();
      } catch {
        // Already finished/stopped - nothing to do.
      }
    }
  }

  return { enqueue, stop };
}
