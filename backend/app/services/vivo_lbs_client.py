async def nearby(kind: str, city: str = "") -> dict:
    return {"items": [], "provider": "vivo_lbs_reserved", "type": kind, "city": city}
