from __future__ import annotations

import base64
import os
from pathlib import Path
from typing import Any, Dict

import httpx


def _clean_env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip().strip('"').strip("'")


def configured() -> bool:
    return bool(_clean_env("BAIDU_API_KEY") and _clean_env("BAIDU_SECRET_KEY"))


def _friendly(message: str, error_summary: str = "") -> Dict[str, Any]:
    data: Dict[str, Any] = {
        "ok": False,
        "success": False,
        "text": "",
        "provider": "baidu_asr",
        "message": message,
        "hint": message,
        "fallback": True,
    }
    if error_summary:
        data["error_summary"] = error_summary
    return data


def _access_token() -> str:
    api_key = _clean_env("BAIDU_API_KEY")
    secret = _clean_env("BAIDU_SECRET_KEY")
    if not api_key or not secret:
        raise RuntimeError("baidu_asr_not_configured")
    with httpx.Client(timeout=10) as client:
        res = client.post(
            "https://aip.baidubce.com/oauth/2.0/token",
            params={
                "grant_type": "client_credentials",
                "client_id": api_key,
                "client_secret": secret,
            },
        )
        res.raise_for_status()
        token = res.json().get("access_token")
        if not token:
            raise RuntimeError("baidu_token_empty")
        return token


def speech_to_text(audio_path: str, fmt: str = "wav", dialect: bool = False) -> Dict[str, Any]:
    if not configured():
        return _friendly("百度语音识别未配置，请改用文字输入。", "baidu_asr_not_configured")

    path = Path(audio_path)
    if not path.exists() or path.stat().st_size <= 0:
        return _friendly("没有收到有效录音，请重新说一遍，或改用文字输入。", "audio_file_empty")

    try:
        token = _access_token()
        audio_bytes = path.read_bytes()
        payload = {
            "format": fmt,
            "rate": 16000,
            "channel": 1,
            "cuid": "yixiang_zhicai",
            "token": token,
            "speech": base64.b64encode(audio_bytes).decode("ascii"),
            "len": len(audio_bytes),
        }
        with httpx.Client(timeout=30) as client:
            res = client.post(_clean_env("BAIDU_ASR_URL", "https://vop.baidu.com/server_api"), json=payload)
            res.raise_for_status()
            data = res.json()
        if data.get("err_no") != 0:
            return _friendly("小享没有听清楚，请再说一遍，或者点键盘输入。", str(data.get("err_msg") or data.get("err_no")))
        text = "".join(data.get("result") or []).strip()
        if not text:
            return _friendly("小享没有听到清楚的文字，请再说一遍。", "empty_result")
        return {
            "ok": True,
            "success": True,
            "text": text,
            "provider": "baidu_asr",
            "message": "识别成功",
            "dialect": dialect,
        }
    except Exception as exc:
        return _friendly("语音识别暂不可用，请改用文字输入，或再说一遍。", type(exc).__name__)
