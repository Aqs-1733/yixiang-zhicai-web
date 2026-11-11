async def text_to_speech(text: str, voice_style: str = "elder_friendly", speed: str = "slow") -> dict:
    return {"audio_url": "", "provider": "vivo_tts_reserved", "text": text, "speed": speed}
