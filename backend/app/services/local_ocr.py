from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List

_ENGINE = None


def _engine():
    global _ENGINE
    if _ENGINE is None:
        from rapidocr import RapidOCR

        _ENGINE = RapidOCR()
    return _ENGINE


def recognize_image(image_path: str) -> Dict[str, Any]:
    path = Path(image_path)
    if not path.is_file():
        return {"ok": False, "provider": "rapidocr", "text": "", "lines": [], "message": "图片文件不存在"}
    try:
        result = _engine()(str(path))
        texts: List[str] = [str(item).strip() for item in (getattr(result, "txts", None) or []) if str(item).strip()]
        scores = [round(float(item), 4) for item in (getattr(result, "scores", None) or [])]
        lines = [
            {"text": text, "score": scores[index] if index < len(scores) else 0.0}
            for index, text in enumerate(texts)
        ]
        return {
            "ok": bool(texts),
            "provider": "rapidocr",
            "text": "\n".join(texts),
            "lines": lines,
            "message": "本地OCR识别成功" if texts else "本地OCR没有识别到文字",
        }
    except Exception as exc:
        return {
            "ok": False,
            "provider": "rapidocr",
            "text": "",
            "lines": [],
            "message": f"本地OCR暂不可用：{type(exc).__name__}",
        }
