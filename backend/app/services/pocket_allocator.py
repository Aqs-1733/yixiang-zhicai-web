from __future__ import annotations

from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP, ROUND_FLOOR
import math
from typing import Any, Dict, List


POCKETS = [
    {
        "key": "daily",
        "name": "日常开销账户",
        "purpose": "吃饭、买菜、交通、水电、日用品，保证每天生活顺手。",
        "tags": ["餐饮", "蔬菜生鲜", "水果生鲜", "交通", "水电煤", "购物"],
    },
    {
        "key": "medical",
        "name": "医疗备用账户",
        "purpose": "看病、买药、体检和突发健康支出，要求安全、灵活、取用方便。",
        "tags": ["医疗", "药品", "体检"],
    },
    {
        "key": "emergency",
        "name": "应急金账户",
        "purpose": "突发事件、家庭紧急支出和备用现金，不追求高收益。",
        "tags": ["应急", "备用金"],
    },
    {
        "key": "growth",
        "name": "养老增值账户",
        "purpose": "长期不用的钱，可学习国债、大额存单、货币基金和中低风险理财。",
        "tags": ["国债", "大额存单", "货币基金", "中低风险理财"],
    },
]


def _num(value: Any, default: float = 0.0) -> float:
    try:
        if value in [None, ""]:
            return default
        result = float(str(value).replace(",", "").replace("元", ""))
        return result if math.isfinite(result) else default
    except Exception:
        return default


def apportion(total: Any, weights: Dict[str, float], places: int = 2) -> Dict[str, float]:
    """Largest-remainder allocation: displayed amounts always add up to the total."""
    factor = Decimal(10) ** places
    units = int((Decimal(str(max(0, _num(total)))) * factor).quantize(Decimal('1'), rounding=ROUND_HALF_UP))
    values = {k: Decimal(str(max(0, _num(v)))) for k, v in weights.items()}
    weight_sum = sum(values.values())
    if not values or weight_sum <= 0:
        raise ValueError('Allocation weights must have a positive sum')
    exact = {k: Decimal(units) * v / weight_sum for k, v in values.items()}
    allocated = {k: int(v.to_integral_value(rounding=ROUND_FLOOR)) for k, v in exact.items()}
    remaining = units - sum(allocated.values())
    for key in sorted(values, key=lambda k: exact[k] - allocated[k], reverse=True)[:remaining]:
        allocated[key] += 1
    return {k: float(Decimal(v) / factor) for k, v in allocated.items()}


def _health_attention(profile: Dict[str, Any], health: Dict[str, Any]) -> bool:
    status = str(profile.get("health_status") or "")
    bp = str((health or {}).get("bp") or "")
    if any(k in status for k in ["差", "慢病", "高血压", "糖尿病", "需关注"]):
        return True
    if "/" in bp:
        try:
            high, low = [int(x) for x in bp.replace(" ", "").split("/")[:2]]
            return high >= 140 or low >= 90
        except Exception:
            return False
    return False


def allocate(profile: Dict[str, Any], ledger_summary: Dict[str, Any] | None = None, health: Dict[str, Any] | None = None, risk_alerts: List[Dict[str, Any]] | None = None) -> Dict[str, Any]:
    profile = profile or {}
    ledger_summary = ledger_summary or {}
    risk_alerts = risk_alerts or []
    income = _num(profile.get("monthly_income"), 0)
    expense = _num(profile.get("monthly_expense"), 0)
    liquid = _num(profile.get("liquid_asset"), 0)
    fixed = _num(profile.get("fixed_asset"), 0)
    debt = _num(profile.get("debt"), 0)
    total = max(0.0, liquid + fixed - debt)
    risk_pref = str(profile.get("risk_preference") or "")

    ratios = {"daily": 0.25, "medical": 0.20, "emergency": 0.20, "growth": 0.35}
    if _health_attention(profile, health or {}):
        ratios["medical"] += 0.08
        ratios["growth"] -= 0.08
    if income > 0 and expense / income >= 0.85:
        ratios["daily"] += 0.08
        ratios["emergency"] += 0.06
        ratios["growth"] -= 0.14
    if "保守" in risk_pref:
        ratios["emergency"] += 0.05
        ratios["growth"] -= 0.05
    if any(str(a.get("level")) in {"high", "critical"} for a in risk_alerts):
        ratios["emergency"] += 0.08
        ratios["growth"] -= 0.08

    for key in ratios:
        ratios[key] = max(0.05, ratios[key])
    total_ratio = sum(ratios.values())
    ratios = {k: v / total_ratio for k, v in ratios.items()}

    amounts = apportion(total, ratios)
    percentages = apportion(100, ratios, places=1)
    cards = []
    for item in POCKETS:
        key = item["key"]
        ratio = ratios[key]
        amount = amounts[key]
        if key == "growth" and ("保守" in risk_pref or any(str(a.get("level")) in {"high", "critical"} for a in risk_alerts)):
            status = "暂停新增高风险，只看低风险"
            advice = "只学习国债、大额存单、货币基金或中低风险产品，先不碰股票、私募、虚拟币。"
        elif key == "medical" and _health_attention(profile, health or {}):
            status = "需提高"
            advice = "近期健康指标需关注，医疗备用金建议放在灵活可取的位置。"
        elif key == "daily" and income > 0 and expense / income >= 0.85:
            status = "优先保障"
            advice = "月支出接近月收入，先保障生活费，暂缓新增理财。"
        else:
            status = "平稳"
            advice = "可按月收支变化调整预留金额。"
        cards.append({
            **item,
            "ratio": percentages[key],
            "amount": amount,
            "amount_text": f"{amount:,.2f}".rstrip('0').rstrip('.'),
            "status": status,
            "advice": advice,
        })

    return {
        "success": True,
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "total_asset": round(total, 2),
        "total_asset_text": f"{round(total, 2):,.2f}".rstrip('0').rstrip('.'),
        "monthly_income": income,
        "monthly_expense": expense,
        "cards": cards,
        "summary": "建议把养老钱分成日常、医疗、应急、养老增值四个账户。这里只做建议和账本标签，不做真实资金划转。",
        "safe_boundary": "不提供真实转账、购买、扣款；所有交易相关动作都只做模拟确认、风控和记录。",
    }


def simulate(profile: Dict[str, Any], changes: Dict[str, Any]) -> Dict[str, Any]:
    merged = dict(profile or {})
    merged.update(changes or {})
    return allocate(merged)
