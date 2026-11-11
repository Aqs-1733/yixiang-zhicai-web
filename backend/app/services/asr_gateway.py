from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path
from typing import Any, Dict, List

from app.services import ai_gateway, baidu_asr_client, vivo_asr_client


def _clean_env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip().strip('"').strip("'")


def ffmpeg_found() -> bool:
    return bool(_ffmpeg_exe())


def _ffmpeg_exe() -> str:
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    try:
        import imageio_ffmpeg  # type: ignore

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return ""


def status() -> Dict[str, Any]:
    ark = _clean_env("ARK_ASR_ENABLED", "0") == "1" and bool(_clean_env("ARK_API_KEY") and _clean_env("ARK_MODEL"))
    vivo = vivo_asr_client.configured()
    baidu = baidu_asr_client.configured()
    return {
        "active_provider": "ark_asr" if ark else ("vivo_asr" if vivo else ("baidu_asr" if baidu else "local")),
        "ark_configured": ark,
        "vivo_configured": vivo,
        "baidu_configured": baidu,
        "ffmpeg_found": ffmpeg_found(),
        "fallback": True,
    }


def _friendly(message: str, provider: str = "local", errors: List[str] | None = None, error_summary: str = "") -> Dict[str, Any]:
    data: Dict[str, Any] = {
        "ok": False,
        "success": False,
        "text": "",
        "provider": provider,
        "message": message,
        "hint": message,
        "fallback": True,
    }
    if errors:
        data["errors"] = errors
    if error_summary:
        data["error_summary"] = error_summary
    return data


def _transcode_to_wav(source: Path, target: Path) -> Dict[str, Any]:
    ffmpeg = _ffmpeg_exe()
    if not ffmpeg:
        return _friendly("语音转码工具未安装，请先安装 ffmpeg，或改用文字输入。", error_summary="ffmpeg_not_found")
    cmd = [
        ffmpeg,
        "-y",
        "-i",
        str(source),
        "-ac",
        "1",
        "-ar",
        "16000",
        "-sample_fmt",
        "s16",
        str(target),
    ]
    try:
        completed = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=25)
    except subprocess.TimeoutExpired:
        return _friendly("语音转码超时，请录短一点再试，或改用文字输入。", error_summary="ffmpeg_timeout")
    if completed.returncode != 0 or not target.exists() or target.stat().st_size <= 0:
        return _friendly("语音转码失败，请换用文字输入，或录一段更清楚的语音。", error_summary="ffmpeg_failed")
    return {"ok": True}


async def speech_to_text(audio_path: str, filename: str = "", dialect: bool = False) -> Dict[str, Any]:
    source = Path(audio_path)
    suffix = (source.suffix or Path(filename or "").suffix or "").lower()
    file_size = source.stat().st_size if source.exists() else 0
    errors: List[str] = []
    state = status()
    print(
        "ASR gateway:",
        {
            "file_size": file_size,
            "suffix": suffix,
            "ffmpeg_found": state["ffmpeg_found"],
            "vivo_configured": state["vivo_configured"],
            "baidu_configured": state["baidu_configured"],
        },
    )
    if not source.exists() or file_size <= 0:
        return _friendly("没有收到有效录音，请重新说一遍，或改用文字输入。", errors=["audio_file_empty"])

    if state.get("ark_configured"):
        result = await ai_gateway.transcribe_ark_audio(source.read_bytes(), filename or source.name, dialect=dialect)
        if result.get("ok") and result.get("text"):
            return result
        errors.append("ark_asr:" + str(result.get("error_summary") or "failed"))

    if not state["ffmpeg_found"]:
        return _friendly("语音转码工具未安装，请先安装 ffmpeg，或改用文字输入。", errors=["ffmpeg_not_found"])

    if state["vivo_configured"]:
        result = await vivo_asr_client.speech_to_text(str(source), dialect=dialect)
        print("ASR provider result:", {"provider": "vivo_asr", "ok": bool(result.get("ok")), "error_stage": result.get("error_summary", "")})
        if result.get("ok") and result.get("text"):
            return result
        errors.append("vivo_asr:" + str(result.get("error_summary") or result.get("message") or "failed"))

    if state["baidu_configured"]:
        wav_path = source.with_suffix(".asr.wav")
        converted = _transcode_to_wav(source, wav_path)
        if converted.get("ok"):
            result = baidu_asr_client.speech_to_text(str(wav_path), fmt="wav", dialect=dialect)
            print("ASR provider result:", {"provider": "baidu_asr", "ok": bool(result.get("ok")), "error_stage": result.get("error_summary", "")})
            if result.get("ok") and result.get("text"):
                return result
            errors.append("baidu_asr:" + str(result.get("error_summary") or result.get("message") or "failed"))
        else:
            errors.append("baidu_asr:" + str(converted.get("error_summary") or "transcode_failed"))

    print("ASR provider result:", {"provider": "local", "ok": False, "error_stage": "all_failed"})
    return _friendly("语音识别暂不可用，请改用文字输入，或再说一遍。", errors=errors)
