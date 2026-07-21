"""Configuration and speech-to-text for push-to-talk voice.

STT is a lazy-loaded `faster_whisper.WhisperModel` singleton, in the style of
`pipeline/nlp.py`'s `_embedder()`: the model loads on first use (not at
import time, so app startup isn't slowed for sessions that never use voice),
and concurrent first callers are serialized behind a lock so the model loads
exactly once.

TTS (voice.py's other half) is a separate task; this file only covers STT.
"""

import logging
import os
import threading

logger = logging.getLogger(__name__)

# English-only distil-whisper checkpoint: ClearNews's corpus and expected
# voice input are English-language news, so the multilingual large-v3
# checkpoint's extra language coverage isn't needed here, and medium.en is
# smaller/faster for the same English transcription quality. See
# tests/test_voice_deps.py for the comparison this default is based on.
STT_MODEL = os.getenv("STT_MODEL", "Systran/faster-distil-whisper-medium.en")

TTS_VOICE = os.getenv("TTS_VOICE", "af_heart")

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
