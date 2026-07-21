/** Package mono float32 PCM samples (range [-1, 1], as captured by
    lib/vad.ts's onSpeechEnd) into a 16-bit PCM WAV File, ready for
    multipart upload to /api/voice/transcribe. A hand-rolled encoder
    rather than a dependency: the WAV header is ~40 bytes of fixed
    fields, not worth pulling in an audio-processing library for. */
export function pcmToWavFile(samples: Float32Array, sampleRate: number, filename = "voice.wav"): File {
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = bytesPerSample; // mono
  const dataSize = samples.length * bytesPerSample;

  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeAscii(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }

  return new File([buffer], filename, { type: "audio/wav" });
}
