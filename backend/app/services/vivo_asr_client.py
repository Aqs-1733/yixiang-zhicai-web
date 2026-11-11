from __future__ import annotations

import asyncio
import json
import os
import shutil
import string
import subprocess
import time
import uuid
from pathlib import Path
from typing import Any, Dict
from urllib.parse import urlencode


def _clean_env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip().strip('"').strip("'")


def configured() -> bool:
    return bool(_clean_env("VIVO_ASR_APP_KEY"))


def _friendly(message: str, error_summary: str = "") -> Dict[str, Any]:
    data = {
        "ok": False,
        "success": False,
        "text": "",
        "provider": "vivo_asr",
        "message": message,
        "hint": message,
        "fallback": True,
    }
    if error_summary:
        data["error_summary"] = error_summary
    return data


def _make_user_id() -> str:
    raw = uuid.uuid4().hex
    allowed = set(string.ascii_lowercase + string.digits)
    return "".join(ch for ch in raw.lower() if ch in allowed)[:32].ljust(32, "0")


def _ffmpeg_to_pcm(audio_path: Path, pcm_path: Path) -> Dict[str, Any]:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        try:
            import imageio_ffmpeg  # type: ignore

            ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
        except Exception:
            ffmpeg = ""
    if not ffmpeg:
        return _friendly("语音转码工具未安装，请先安装 ffmpeg，或改用文字输入。", "ffmpeg_not_found")
    cmd = [
        ffmpeg,
        "-y",
        "-i",
        str(audio_path),
        "-ac",
        "1",
        "-ar",
        "16000",
        "-f",
        "s16le",
        str(pcm_path),
    ]
    try:
        completed = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20)
    except subprocess.TimeoutExpired:
        return _friendly("语音转码超时，请录短一点再试，或改用文字输入。", "ffmpeg_timeout")
    if completed.returncode != 0 or not pcm_path.exists() or pcm_path.stat().st_size <= 0:
        return _friendly("语音转码失败，请换用文字输入，或录一段更清楚的语音。", "ffmpeg_failed")
    return {"ok": True}


async def speech_to_text(audio_path: str, dialect: bool = False) -> Dict[str, Any]:
    app_key = _clean_env("VIVO_ASR_APP_KEY")
    if not app_key:
        return _friendly("语音识别暂未配置，请先配置 VIVO_ASR_APP_KEY，或改用文字输入。", "vivo_asr_not_configured")

    source = Path(audio_path)
    if not source.exists() or source.stat().st_size <= 0:
        return _friendly("没有收到有效录音，请重新说一遍，或改用文字输入。", "audio_file_empty")

    pcm_path = source.with_suffix(".pcm")
    transcode = _ffmpeg_to_pcm(source, pcm_path)
    if not transcode.get("ok"):
        return transcode

    try:
        import websockets  # type: ignore
    except Exception:
        return _friendly("语音识别依赖未安装，请先安装 websockets，或改用文字输入。", "websockets_not_installed")

    request_id = uuid.uuid4().hex
    engine_id = _clean_env("VIVO_ASR_ENGINE_ID", "shortasrinput")
    base_url = _clean_env("VIVO_ASR_URL", "ws://api-ai.vivo.com.cn/asr/v2")
    params = {
        "client_version": "unknown",
        "package": "unknown",
        "sdk_version": "unknown",
        "user_id": _make_user_id(),
        "android_version": "unknown",
        "system_time": str(int(time.time() * 1000)),
        "net_type": "1",
        "engineid": engine_id,
        "requestId": request_id,
    }
    url = base_url + ("&" if "?" in base_url else "?") + urlencode(params)
    started = {
        "type": "started",
        "request_id": request_id,
        "asr_info": {
            "end_vad_time": 1000,
            "audio_type": "pcm",
            "chinese2digital": 1,
            "punctuation": 1,
        },
    }
    texts = []
    async def _run_ws(header_arg: str) -> Dict[str, Any]:
        kwargs = {
            header_arg: {"Authorization": f"Bearer {app_key}"},
            "open_timeout": 10,
            "close_timeout": 5,
            "max_size": 4 * 1024 * 1024,
        }
        async with websockets.connect(url, **kwargs) as ws:
            await ws.send(json.dumps(started, ensure_ascii=False))
            with pcm_path.open("rb") as f:
                while True:
                    chunk = f.read(1280)
                    if not chunk:
                        break
                    await ws.send(chunk)
                    await asyncio.sleep(0.04)
            await ws.send(b"--end--")
            deadline = time.time() + 15
            final_text = ""
            while time.time() < deadline:
                try:
                    msg = await asyncio.wait_for(ws.recv(), timeout=2)
                except asyncio.TimeoutError:
                    continue
                if isinstance(msg, bytes):
                    continue
                try:
                    payload = json.loads(msg)
                except Exception:
                    continue
                if payload.get("action") == "result":
                    data = payload.get("data") or {}
                    text = str(data.get("text") or "").strip()
                    if text:
                        texts.append(text)
                        if data.get("is_last") is True or payload.get("is_last") is True:
                            final_text = text
                            break
            await ws.send(b"--close--")
            final_text = (final_text or (texts[-1] if texts else "")).strip()
            if final_text:
                return {"ok": True, "success": True, "text": final_text, "provider": "vivo_asr", "message": "识别成功", "dialect": dialect}
            return _friendly("语音识别暂不可用，请改用文字输入，或再说一遍。", "empty_result")

    try:
        try:
            return await _run_ws("additional_headers")
        except TypeError:
            return await _run_ws("extra_headers")
    except Exception as exc:
        return _friendly("语音识别暂不可用，请改用文字输入，或再说一遍。", type(exc).__name__)
