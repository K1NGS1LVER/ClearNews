"""Configuration, speech-to-text, and text-to-speech for push-to-talk voice.

Both STT and TTS follow the same lazy-singleton shape, in the style of
`pipeline/nlp.py`'s `_embedder()`: the model/pipeline loads on first use (not
at import time, so app startup isn't slowed for sessions that never use
voice), and concurrent first callers are serialized behind a lock so it loads
exactly once. Each half keeps its own module-level state so a failure/reset
in one doesn't affect the other.
"""

import logging
import os
import re
import threading
import unicodedata
from typing import Iterator

import numpy as np

logger = logging.getLogger(__name__)

# English-only distil-whisper checkpoint: ClearNews's corpus and expected
# voice input are English-language news, so the multilingual large-v3
# checkpoint's extra language coverage isn't needed here, and medium.en is
# smaller/faster for the same English transcription quality. See
# tests/test_voice_deps.py for the comparison this default is based on.
STT_MODEL = os.getenv("STT_MODEL", "Systran/faster-distil-whisper-medium.en")

TTS_VOICE = os.getenv("TTS_VOICE", "af_heart")

# Kokoro always outputs 24kHz mono float32 PCM (confirmed in Task 0's smoke
# test); not configurable, so it's a plain constant rather than an env var.
TTS_SAMPLE_RATE = 24000

_model = None
_model_lock = threading.Lock()
_load_failed = False


def _load_model():
    from faster_whisper import WhisperModel

    return WhisperModel(STT_MODEL, device="cpu", compute_type="int8")


def _get_model(loader=_load_model):
    """Lazy-load the Whisper model on first use (thread-safe, loads once).

    `loader` is injectable so tests can substitute a fake without touching
    faster-whisper. If loading previously failed, short-circuits without
    retrying on every call (a corrupt cache or OOM won't recover on retry,
    and retrying per-request would be a needless stall under load).
    """
    global _model, _load_failed
    if _model is not None or _load_failed:
        return _model
    with _model_lock:
        if _model is not None or _load_failed:
            return _model
        try:
            logger.info(f"Loading STT model: {STT_MODEL} (int8, CPU)...")
            _model = loader()
            logger.info("STT model loaded.")
        except Exception:
            logger.exception(f"Failed to load STT model '{STT_MODEL}'; speech-to-text disabled.")
            _load_failed = True
    return _model


def is_available() -> bool:
    """True if speech-to-text can be used (loads the model on first call)."""
    return _get_model() is not None


def transcribe(audio_path: str) -> dict | None:
    """Transcribe an audio file at `audio_path` to text.

    Returns {"transcript", "language", "duration"} on success, or None if the
    model could not be loaded (callers should surface a clear "unavailable"
    error, e.g. a 503, rather than an unhandled exception).
    """
    model = _get_model()
    if model is None:
        return None

    segments, info = model.transcribe(audio_path, beam_size=5)
    # segments is a generator; materialize it to pull the full transcript.
    text = "".join(segment.text for segment in segments).strip()
    return {
        "transcript": text,
        "language": getattr(info, "language", None),
        "duration": round(float(getattr(info, "duration", 0.0)), 2),
    }


# ---------------------------------------------------------------------------
# TTS: lazy-loaded Kokoro KPipeline singleton + synthesize_stream()
# ---------------------------------------------------------------------------

_pipeline = None
_pipeline_lock = threading.Lock()
_tts_load_failed = False


def _load_pipeline():
    from kokoro import KPipeline

    # lang_code "a" = American English; matches the af_/am_ voices.
    return KPipeline(lang_code="a")


def _get_pipeline(loader=_load_pipeline):
    """Lazy-load the Kokoro TTS pipeline on first use (thread-safe, loads once).

    Mirrors `_get_model()` above: `loader` is injectable so tests can
    substitute a fake without touching kokoro, and a load failure short-
    circuits without retrying on every call.
    """
    global _pipeline, _tts_load_failed
    if _pipeline is not None or _tts_load_failed:
        return _pipeline
    with _pipeline_lock:
        if _pipeline is not None or _tts_load_failed:
            return _pipeline
        try:
            logger.info("Loading Kokoro TTS pipeline (American English)...")
            _pipeline = loader()
            logger.info("Kokoro TTS pipeline loaded.")
        except Exception:
            logger.exception("Failed to load Kokoro TTS pipeline; text-to-speech disabled.")
            _tts_load_failed = True
    return _pipeline


def tts_is_available() -> bool:
    """True if text-to-speech can be used (loads the pipeline on first call)."""
    return _get_pipeline() is not None


def _sanitize(text: str) -> str:
    """Normalize text before synthesis so the grapheme-to-phoneme step (misaki)
    is less likely to choke on it.

    Ported from docSeek's `app/core/tts.py`: NFKC-normalize unicode (turning
    fancy quotes/dashes into plain ASCII where possible), drop control
    characters, and collapse whitespace. Hard-won defensive detail, not
    incidental -- keep it even though it looks like it should be unnecessary.
    """
    if not text:
        return ""
    text = unicodedata.normalize("NFKC", text)
    text = "".join(ch for ch in text if ch == "\n" or unicodedata.category(ch)[0] != "C")
    return re.sub(r"\s+", " ", text).strip()


def synthesize_stream(text: str, voice: str = TTS_VOICE) -> Iterator[bytes]:
    """Synthesize speech for `text`, yielding raw PCM bytes one chunk per sentence.

    Ported from docSeek's `synthesize_stream()`: splits text on sentence
    boundaries and yields each sentence's audio as soon as it's produced,
    rather than waiting for the whole input to finish synthesizing, so a
    caller's time-to-first-audio is the cost of one sentence rather than the
    whole answer. If one sentence's G2P/synthesis fails (e.g. an
    out-of-vocabulary token), that sentence is skipped and the rest of the
    stream continues -- one bad sentence can't abort an otherwise-good reply.

    Yields nothing if the pipeline is unavailable or the text is empty after
    sanitization; callers should check `tts_is_available()` themselves before
    starting a streaming response, so they can return a clean 503 instead of
    a silently empty stream.
    """
    pipeline = _get_pipeline()
    if pipeline is None:
        return
    text = _sanitize(text)
    if not text:
        return

    for sentence in re.split(r"(?<=[.!?])\s+", text):
        sentence = sentence.strip()
        if not sentence:
            continue
        try:
            segments = [
                (audio.detach().cpu().numpy() if hasattr(audio, "detach") else np.asarray(audio)).astype(
                    np.float32
                )
                for _graphemes, _phonemes, audio in pipeline(sentence, voice=voice)
            ]
        except Exception:
            logger.warning(f"TTS skipped an unsynthesizable sentence ({sentence[:60]!r}...)", exc_info=True)
            continue
        if segments:
            yield np.concatenate(segments).tobytes()
