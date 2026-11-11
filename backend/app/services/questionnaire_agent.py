async def generate(profile: dict, purpose: str = "risk") -> dict:
    return {"title": "稳健养老理财风险问卷", "questions": [], "profile": profile, "purpose": purpose}
