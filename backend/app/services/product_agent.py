async def parse_product(text: str, profile: dict = None) -> dict:
    return {"text": text, "profile": profile or {}, "risk_tip": "请核验产品登记编码。"}
