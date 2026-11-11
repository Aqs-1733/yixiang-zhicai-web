from __future__ import annotations

from .risk_engine import content_risk_check


def scan_text(text: str) -> list:
    return content_risk_check(text).get("risk_flags", [])
