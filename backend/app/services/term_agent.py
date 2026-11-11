async def explain(term: str, nearby_text: str = "") -> dict:
    return {"term": term, "explanation": f"{term}需要结合页面内容理解。", "risk_tip": "不要把参考收益当保证收益。"}
