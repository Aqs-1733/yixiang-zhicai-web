async def weekly_report(profile: dict, ledger: dict, alerts: list) -> dict:
    return {"summary": "本周资产结构稳定，建议保留医疗备用金。", "profile": profile, "alerts": alerts}
