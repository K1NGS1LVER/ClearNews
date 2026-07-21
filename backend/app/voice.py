"""Configuration surface for push-to-talk voice (STT/TTS).

Just the env var reads with sensible defaults. The actual STT/TTS wrapper
functions (lazy model loading, transcribe/synthesize) are a separate task;
this file only establishes the configurable defaults they'll read from.
"""

import os

# English-only distil-whisper checkpoint: ClearNews's corpus and expected
# voice input are English-language news, so the multilingual large-v3
# checkpoint's extra language coverage isn't needed here, and medium.en is
# smaller/faster for the same English transcription quality. See
# tests/test_voice_deps.py for the comparison this default is based on.
STT_MODEL = os.getenv("STT_MODEL", "Systran/faster-distil-whisper-medium.en")

TTS_VOICE = os.getenv("TTS_VOICE", "af_heart")
