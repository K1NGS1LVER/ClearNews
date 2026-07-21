/** Thin wrapper around @ricky0123/vad-web's MicVAD, exposing only what
    ChatPanel.tsx's voice-input state machine needs: arm the mic, get
    called back with the captured audio once a speech segment ends, and a
    way to cancel. No UI, no fetch calls - see ChatPanel.tsx for the mic
    button/state machine and lib/wav.ts for packaging the captured audio
    for upload. */

/** Silero VAD's fixed input/output sample rate - @ricky0123/vad-web always
    delivers captured audio at this rate regardless of the mic's native
    rate, so callers encoding the result (see lib/wav.ts) need it too. */
export const VAD_SAMPLE_RATE = 16000;

export type VadSession = {
  /** Stop listening and release the microphone immediately. Does not
      itself trigger onSpeechEnd - this is the manual cancel path. */
  stop: () => void;
};

/** Start a self-hosted Silero VAD session: prompts for mic access and runs
    on-device voice-activity detection until `stop()` is called or a
    speech segment completes (see the `speechEnd` argument). Rejects if
    mic permission is denied or the VAD's model/assets fail to load.
    ONNX model + ONNX Runtime WASM + AudioWorklet assets are served from
    /vad/ (see frontend/public/vad/, copied from @ricky0123/vad-web's and
    onnxruntime-web's published dist/ files) instead of the library's CDN
    default, matching this app's no-third-party-CDN policy. The library
    import itself is dynamic so its ~15MB of ONNX/WASM assets are only
    fetched once a user actually taps the mic button, not on page load. */
export async function startVad(
  speechEnd: (audio: Float32Array) => void,
  speechStart?: () => void,
): Promise<VadSession> {
  const { MicVAD } = await import("@ricky0123/vad-web");

  const vad = await MicVAD.new({
    baseAssetPath: "/vad/",
    onnxWASMBasePath: "/vad/",
    model: "v5",
    onSpeechStart: speechStart,
    onSpeechEnd: speechEnd,
  });

  return {
    stop: () => {
      void vad.destroy();
    },
  };
}
