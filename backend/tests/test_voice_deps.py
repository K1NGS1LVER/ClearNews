"""Dependency spike: prove faster-whisper and Kokoro actually load and run
inference in this venv, not just that the resolver accepted them.

Marked `real_model` so it's opt-in only (multi-hundred-MB model downloads on
first run; never run in CI or the default `uv run pytest`). Run manually with:

    uv run pytest -m real_model tests/test_voice_deps.py
"""

import shutil
import subprocess

import numpy as np
import pytest

from app.voice import STT_MODEL, TTS_VOICE

pytestmark = pytest.mark.real_model

SAMPLE_TEXT = "The central bank raised interest rates by a quarter point on Wednesday."


@pytest.fixture(scope="module")
def sample_wav(tmp_path_factory):
    """A short spoken sample, synthesized locally via macOS `say`.

    Piping through `say` (rather than committing a binary fixture) keeps this
    test self-contained; `say`'s own WAV header isn't read by libsndfile, but
    faster-whisper decodes it fine via its bundled PyAV, so we hand it the
    file path directly instead of routing it through soundfile.
    """
    if shutil.which("say") is None:
        pytest.skip("macOS `say` not available to synthesize a sample clip")
    path = tmp_path_factory.mktemp("audio") / "sample.wav"
    subprocess.run(
        ["say", "-o", str(path), "--data-format=LEI16@16000", SAMPLE_TEXT],
        check=True,
    )
    return str(path)


@pytest.mark.parametrize(
    "checkpoint",
    [
        "Systran/faster-distil-whisper-medium.en",
        "Systran/faster-distil-whisper-large-v3",
    ],
)
def test_faster_whisper_transcribes_sample(sample_wav, checkpoint):
    """Both candidate checkpoints load on CPU (int8) and transcribe real audio."""
    from faster_whisper import WhisperModel

    model = WhisperModel(checkpoint, device="cpu", compute_type="int8")
    segments, info = model.transcribe(sample_wav, beam_size=5)
    text = "".join(seg.text for seg in segments).strip()

    assert text, f"{checkpoint} produced an empty transcript"
    # Loose check: distil-whisper should recover most of the wording.
    assert "interest rates" in text.lower() or "central bank" in text.lower()
    assert info.duration > 0


def test_stt_model_default_transcribes_sample(sample_wav):
    """The configured default (app.voice.STT_MODEL) works end to end."""
    from faster_whisper import WhisperModel

    model = WhisperModel(STT_MODEL, device="cpu", compute_type="int8")
    segments, info = model.transcribe(sample_wav, beam_size=5)
    text = "".join(seg.text for seg in segments).strip()

    assert text
    assert info.language == "en"


@pytest.mark.filterwarnings(
    "ignore:dropout option adds dropout:UserWarning",
    "ignore:`torch.nn.utils.weight_norm` is deprecated:FutureWarning",
)
def test_kokoro_synthesizes_nonempty_audio():
    """Kokoro loads and produces real, non-empty 24kHz mono float32 audio."""
    from kokoro import KPipeline

    pipeline = KPipeline(lang_code="a")
    segments = []
    for _graphemes, _phonemes, audio in pipeline("Ready to help.", voice=TTS_VOICE):
        arr = audio.detach().cpu().numpy() if hasattr(audio, "detach") else np.asarray(audio)
        segments.append(arr.astype(np.float32))

    assert segments, "Kokoro produced no audio segments"
    waveform = np.concatenate(segments)
    assert waveform.dtype == np.float32
    assert waveform.ndim == 1  # mono
    assert waveform.size > 0
    assert np.abs(waveform).max() > 0  # not silence
