from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Dict, List, Optional


CONTENT_RULES = [
    {
        "patterns": ["高收益", "高息", "高回报", "月收益", "日收益", "翻倍"],
        "type": "high_yield",
        "level": "high",
        "reason": "出现高收益或高回报话术，养老钱要先按高风险处理。",
        "advice": "先不要转账，要求对方提供官方产品说明书、登记编码和正规销售渠道。",
    },
    {
        "patterns": ["保本保息", "保本高收益", "保本付息", "稳赚不赔", "稳赚", "包赚", "零风险"],
        "type": "guaranteed_return",
        "level": "critical",
        "reason": "正规理财不能承诺保本保息或稳赚不赔，这是典型风险信号。",
        "advice": "立即暂停操作，不点链接、不付款，并联系官方客服或家人核验。",
    },
    {
        "patterns": ["内部渠道", "内部名额", "内部项目", "原始股", "老师带单", "带单", "荐股群"],
        "type": "unofficial_channel",
        "level": "critical",
        "reason": "所谓内部渠道、老师带单常见于非法荐股或集资骗局。",
        "advice": "不要加入群聊或下载陌生 APP，通过银行、基金公司、监管官网核验。",
    },
    {
        "patterns": ["陌生链接", "点击链接", "下载app", "非官方app", "网址", "二维码", "群二维码", "扫码付款"],
        "type": "suspicious_link_or_qr",
        "level": "high",
        "reason": "陌生链接、二维码和非官方 APP 可能盗取账户或诱导付款。",
        "advice": "不要扫码或输入银行卡、验证码，先让子女帮忙确认来源。",
    },
    {
        "patterns": ["保证金", "解冻金", "手续费", "认证金", "先交钱", "先付款"],
        "type": "advance_fee",
        "level": "critical",
        "reason": "先交保证金、解冻金或手续费再返利，是常见诈骗套路。",
        "advice": "不要先付款，保留截图并联系官方客服电话核实。",
    },
    {
        "patterns": ["私募", "股票", "炒股", "虚拟币", "数字货币", "币圈", "杠杆", "期货", "外汇"],
        "type": "unsuitable_product",
        "level": "high",
        "reason": "私募、股票、虚拟币、杠杆等不适合作为普通老人养老资金主选。",
        "advice": "养老钱优先看国债、存款、货币基金和中低风险正规理财。",
    },
    {
        "patterns": ["限时抢购", "马上转", "最后名额", "错过没有", "不要告诉家人", "验证码"],
        "type": "pressure_or_privacy",
        "level": "critical",
        "reason": "催促立刻操作、要求保密或索要验证码，风险非常高。",
        "advice": "先停下来，不透露验证码，不绕开家人和官方客服。",
    },
    {
        "patterns": ["登记编码", "风险等级", "业绩比较基准", "七日年化", "净值", "赎回", "封闭期"],
        "type": "needs_explanation",
        "level": "low",
        "reason": "包含需要解释的金融术语，购买前应逐项看懂。",
        "advice": "先理解风险等级、期限、赎回规则和收益来源，再决定是否继续了解。",
    },
]

LEVEL_SCORE = {"low": 1, "medium": 2, "high": 3, "critical": 4}


def normalize_level(flags: List[Dict[str, Any]]) -> str:
    if not flags:
        return "low"
    return max((flag.get("level", "low") for flag in flags), key=lambda v: LEVEL_SCORE.get(v, 1))


def _contains(text: str, pattern: str) -> bool:
    if pattern.lower() in text.lower():
        return True
    if re.fullmatch(r"[A-Za-z0-9_%\\.\-\u4e00-\u9fa5]+", pattern):
        return False
    try:
        return bool(re.search(pattern, text, re.I))
    except Exception:
        return False


def content_risk_check(text: str, profile: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    raw = str(text or "")
    flags: List[Dict[str, Any]] = []
    seen = set()
    for rule in CONTENT_RULES:
        matched = [p for p in rule["patterns"] if _contains(raw, p)]
        if not matched:
            continue
        key = (rule["type"], ",".join(matched[:3]))
        if key in seen:
            continue
        seen.add(key)
        flags.append({
            "type": rule["type"],
            "level": rule["level"],
            "keyword": matched[0],
            "keywords": matched,
            "reason": rule["reason"],
            "advice": rule["advice"],
        })

    yield_match = re.search(r"(年化|收益|收益率|利率|回报|月收益|日收益)[^\d%]{0,10}(\d{1,3}(?:\.\d+)?)\s*%", raw)
    if yield_match:
        value = float(yield_match.group(2))
        if value >= 8:
            flags.append({
                "type": "abnormal_yield",
                "level": "critical" if value >= 15 else "high",
                "keyword": yield_match.group(0),
                "keywords": [yield_match.group(0)],
                "reason": f"收益率约 {value:g}% 明显需要谨慎核验，不能当成承诺收益。",
                "advice": "先查产品说明书和登记编码，不要因为收益高就转账。",
            })

    amount_match = re.search(r"(\d+(?:\.\d+)?)(万|元|块)", raw)
    amount = 0.0
    if amount_match:
        amount = float(amount_match.group(1)) * (10000 if amount_match.group(2) == "万" else 1)

    profile = profile or {}
    age = int(profile.get("age") or 0)
    if flags and age >= 65:
        for flag in flags:
            if flag.get("level") == "medium":
                flag["level"] = "high"
                flag["reason"] += " 用户为银发群体，风险等级上调。"
                break

    level = normalize_level(flags)
    should_pause = level in {"high", "critical"}
    return {
        "risk_level": level,
        "risk_score": LEVEL_SCORE.get(level, 1) * 25,
        "risk_flags": flags,
        "risk_cards": [
            {
                "title": "高风险提醒" if flag["level"] in {"high", "critical"} else "需要看懂",
                "level": flag["level"],
                "reason": flag["reason"],
                "next_step": flag["advice"],
            }
            for flag in flags
        ],
        "should_pause": should_pause,
        "elder_message": (
            "这段内容有明显风险，请先暂停，不要转账、不要点链接、不要给验证码。"
            if should_pause else
            "目前没有发现强风险话术，但涉及钱的事仍要先看清官方渠道、期限和风险等级。"
        ),
        "suitability": "不适合直接操作" if should_pause else "可继续了解但不能代替核验",
        "plain_explanation": (
            "它像是在催您用钱冒险。养老钱最怕看不清、取不出、被骗走。"
            if should_pause else
            "这类内容可以先当知识看，等确认正规渠道和规则后再考虑。"
        ),
        "next_steps": (
            ["暂停操作", "保存截图", "联系官方客服", "告知家人一起核验"]
            if should_pause else
            ["查看产品说明书", "核验登记编码", "确认风险等级和赎回规则"]
        ),
        "amount": amount,
    }


def behavior_risk_check(payload: Dict[str, Any], profile: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    now = datetime.now()
    amount = float(payload.get("amount") or 0)
    text = " ".join(str(payload.get(k, "")) for k in ["text", "scene", "payee", "target", "url", "product_name"])
    flags = content_risk_check(text, profile).get("risk_flags", [])
    if now.hour >= 22 or now.hour < 6:
        flags.append({
            "type": "late_night_operation",
            "level": "medium",
            "keyword": "深夜操作",
            "reason": "深夜更容易疲劳误操作，建议明天白天再处理。",
            "advice": "先延迟，第二天和家人或官方客服确认。",
        })
    if amount >= 20000:
        flags.append({
            "type": "large_amount",
            "level": "high",
            "keyword": "大额金额",
            "reason": f"金额 {amount:g} 元较大，养老钱大额操作需要二次确认。",
            "advice": "先暂停，建议子女确认或去银行网点核验。",
        })
    if payload.get("first_payee") or payload.get("unknown_account"):
        flags.append({
            "type": "unknown_payee",
            "level": "high",
            "keyword": "陌生账户",
            "reason": "首次或陌生收款人需要谨慎，可能存在转错或被骗风险。",
            "advice": "先打官方电话核验，不要直接转账。",
        })
    level = normalize_level(flags)
    required_action = "none"
    if level == "critical":
        required_action = "child_confirm"
    elif level == "high":
        required_action = "manual_verify"
    elif level == "medium":
        required_action = "delay"
    return {
        "risk_level": level,
        "risk_flags": flags,
        "should_pause": level in {"high", "critical"},
        "elder_message": "请先停一下，这个操作需要核验。" if level in {"high", "critical"} else "建议慢一点操作，看清楚再确认。",
        "child_notify": level in {"high", "critical"},
        "required_action": required_action,
        "next_steps": ["重新朗读风险提示", "核验官方渠道", "必要时请子女确认"] if level != "low" else ["继续核对信息"],
    }


def family_alert_payload(text: str, profile: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    result = content_risk_check(text, profile)
    if result["risk_level"] in {"high", "critical"}:
        return {
            "level": result["risk_level"],
            "title": "高风险金融内容提醒",
            "detail": result["elder_message"] + " 内容：" + str(text or "")[:120],
            "should_create": True,
        }
    return {"should_create": False, "level": result["risk_level"], "title": "", "detail": ""}
