from .risk_rules import scan_text

async def check_risk(text: str, profile: dict = None) -> dict:
    return {"risk_flags": scan_text(text), "profile": profile or {}}
