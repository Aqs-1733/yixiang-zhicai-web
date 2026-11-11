from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import sqlite3
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import quote, urlparse

import httpx
from dotenv import load_dotenv

logger = logging.getLogger("uvicorn.error")


BASE_DIR = Path(__file__).resolve().parents[2]
PROJECT_DIR = BASE_DIR.parent
load_dotenv(PROJECT_DIR / ".env")
load_dotenv(BASE_DIR / ".env", override=False)
raw_db = os.getenv("DB_PATH", "")
DB_PATH = Path(raw_db) if raw_db else BASE_DIR / "data" / "yixiang.db"
if not DB_PATH.is_absolute():
    DB_PATH = BASE_DIR / DB_PATH

DATA_DIR = BASE_DIR / "data"
AUDIO_DIR = DATA_DIR / "tts"
AUDIO_DIR.mkdir(parents=True, exist_ok=True)

PROVIDER_ORDER = [
    item.strip().lower()
    for item in os.getenv("LLM_PROVIDER_ORDER", "vivo_bluelm,ark,qwen,deepseek,openai,llm,local").split(",")
    if item.strip()
]
STRICT_LLM = os.getenv("STRICT_LLM", "0").strip() == "1"
LLM_TIMEOUT = float(os.getenv("LLM_TIMEOUT", "45"))


def _clean_env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip().strip('"').strip("'")


def provider_configs() -> Dict[str, Dict[str, str]]:
    llm_key = _clean_env("LLM_API_KEY")
    llm_base = _clean_env("LLM_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3")
    llm_model = _clean_env("LLM_MODEL", "doubao-seed-2-1-turbo-260628")
    vivo_base = _clean_env("BLUELM_BASE_URL") or _clean_env("VIVO_BASE_URL")
    return {
        "vivo_bluelm": {
            "name": "vivo_bluelm",
            "base_url": vivo_base,
            "api_key": _clean_env("BLUELM_API_KEY"),
            "app_id": _clean_env("VIVO_APP_ID"),
            "app_key": _clean_env("VIVO_APP_KEY") or _clean_env("VIVO_SECRET_KEY"),
            "auth_mode": _clean_env("BLUELM_AUTH_MODE", "auto").lower(),
            "model": _clean_env("BLUELM_TEXT_MODEL") or _clean_env("BLUELM_MODEL"),
            "vision_model": _clean_env("BLUELM_VISION_MODEL") or _clean_env("BLUELM_TEXT_MODEL") or _clean_env("BLUELM_MODEL"),
        },
        "ark": {"name": "ark", "base_url": _clean_env("ARK_BASE_URL", llm_base), "api_key": _clean_env("ARK_API_KEY") or llm_key, "model": _clean_env("ARK_MODEL", llm_model)},
        "qwen": {"name": "qwen", "base_url": _clean_env("QWEN_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1"), "api_key": _clean_env("QWEN_API_KEY"), "model": _clean_env("QWEN_MODEL", "qwen-plus")},
        "deepseek": {"name": "deepseek", "base_url": _clean_env("DEEPSEEK_BASE_URL", "https://api.deepseek.com"), "api_key": _clean_env("DEEPSEEK_API_KEY"), "model": _clean_env("DEEPSEEK_MODEL", "deepseek-chat")},
        "openai": {"name": "openai", "base_url": _clean_env("OPENAI_BASE_URL", "https://api.openai.com/v1"), "api_key": _clean_env("OPENAI_API_KEY"), "model": _clean_env("OPENAI_MODEL", "gpt-4.1-mini")},
        "llm": {"name": "llm", "base_url": llm_base, "api_key": llm_key, "model": llm_model},
    }


def configured_providers() -> List[Dict[str, str]]:
    configs = provider_configs()
    items: List[Dict[str, str]] = []
    for name in PROVIDER_ORDER:
        if name == "local":
            continue
        cfg = configs.get(name)
        if not cfg:
            continue
        has_gateway = name == "vivo_bluelm" and bool(cfg.get("app_id") and cfg.get("app_key"))
        has_bearer = bool(cfg.get("api_key"))
        if cfg.get("base_url") and cfg.get("model") and (has_gateway or has_bearer):
            items.append(cfg)
    return items


def status() -> Dict[str, Any]:
    configs = provider_configs()
    configured = {name: bool(name == "local" or any(p["name"] == name for p in configured_providers())) for name in PROVIDER_ORDER}
    baidu_asr = bool(_clean_env("BAIDU_API_KEY") and _clean_env("BAIDU_SECRET_KEY"))
    vivo = configs.get("vivo_bluelm", {})
    vision=[p["name"] for p in configured_providers() if p["name"] in {"ark","openai","vivo_bluelm"} or "vl" in p.get("model","").lower()]
    return {
        "provider_order": PROVIDER_ORDER,
        "configured": configured,
        "configured_providers": [p["name"] for p in configured_providers()] or ["local"],
        "local_fallback": not STRICT_LLM,
        "vision_configured": bool(vision),
        "vision_providers": vision,
        "asr_configured": baidu_asr,
        "tts_configured": baidu_asr,
        "ocr_configured": bool(vision),
        "lbs_configured": bool(_clean_env("TENCENT_MAP_KEY") or _clean_env("QQ_MAP_KEY") or _clean_env("MAP_API_KEY")),
        "finance_data_configured": bool(_clean_env("JUHE_FINANCE_KEY") or _clean_env("BANK_API_KEY") or _clean_env("PRODUCT_FEED_URL")),
    }


def _chat_url(base_url: str, request_id: str = "") -> str:
    url = (base_url or "").rstrip("/")
    if not (url.endswith("/chat/completions") or url.endswith("/vivogpt/completions")):
        path = _clean_env("BLUELM_ENDPOINT_PATH", "/chat/completions")
        url = f"{url}/{path.lstrip('/')}"
    query_name = _clean_env("BLUELM_REQUEST_ID_QUERY", "requestId")
    if request_id and query_name and query_name not in url:
        url += ("&" if "?" in url else "?") + f"{query_name}={quote(request_id)}"
    return url


def _extract_content(data: Dict[str, Any]) -> str:
    choices = data.get("choices") if isinstance(data, dict) else None
    if isinstance(choices, list) and choices:
        message = choices[0].get("message") or {}
        content = message.get("content")
        if isinstance(content, str):
            return content.strip()
        if isinstance(content, list):
            return "".join(str(item.get("text") or "") for item in content if isinstance(item, dict)).strip()
        return ""
    for path in [("data", "content"), ("data", "answer"), ("data", "text"), ("result", "content"), ("result", "answer"), ("answer",), ("content",)]:
        cur: Any = data
        for key in path:
            if not isinstance(cur, dict) or key not in cur:
                cur = None
                break
            cur = cur[key]
        if isinstance(cur, str) and cur.strip():
            return cur.strip()
    return ""


def _apply_ark_options(payload: Dict[str, Any], provider: Dict[str, str]) -> None:
    # Short interactive replies should not spend their output budget on hidden reasoning.
    if provider.get("name") == "ark" and str(provider.get("model", "")).startswith("doubao-seed-"):
        mode = _clean_env("ARK_THINKING_MODE", "disabled")
        payload["thinking"] = {"type": mode if mode in {"enabled", "disabled"} else "disabled"}


def _vivo_headers(provider: Dict[str, str], body: str, uri: str = "", query: Optional[Dict[str, str]] = None) -> Dict[str, str]:
    app_id = provider.get("app_id") or _clean_env("VIVO_APP_ID")
    app_key = provider.get("app_key") or _clean_env("VIVO_APP_KEY") or _clean_env("VIVO_SECRET_KEY")
    timestamp = str(int(time.time()))
    nonce = uuid.uuid4().hex[:8]
    app_id_header = _clean_env("BLUELM_APP_ID_HEADER", "X-AI-GATEWAY-APP-ID")
    timestamp_header = _clean_env("BLUELM_TIMESTAMP_HEADER", "X-AI-GATEWAY-TIMESTAMP")
    nonce_header = _clean_env("BLUELM_NONCE_HEADER", "X-AI-GATEWAY-NONCE")
    signature_header = _clean_env("BLUELM_SIGNATURE_HEADER", "X-AI-GATEWAY-SIGNATURE")
    headers = {
        app_id_header: app_id,
        timestamp_header: timestamp,
        nonce_header: nonce,
        "Content-Type": "application/json",
    }
    protocol = _clean_env("BLUELM_PROTOCOL_HEADER_VALUE", "openai")
    if protocol:
        headers[_clean_env("BLUELM_PROTOCOL_HEADER", "X-AI-GATEWAY-PROTOCOL")] = protocol
    if _clean_env("BLUELM_SIGNATURE_MODE", "official").lower() == "body":
        template = _clean_env("BLUELM_SIGNATURE_TEMPLATE", "{app_id}{timestamp}{nonce}{body}")
        sign_text = template.format(app_id=app_id, timestamp=timestamp, nonce=nonce, body=body)
        signature = hmac.new(app_key.encode("utf-8"), sign_text.encode("utf-8"), hashlib.sha256).hexdigest()
    else:
        signed_headers = f"{app_id_header.lower()};{timestamp_header.lower()};{nonce_header.lower()}"
        signed_block = f"{app_id_header.lower()}:{app_id}\n{timestamp_header.lower()}:{timestamp}\n{nonce_header.lower()}:{nonce}"
        canonical_query = "&".join(
            f"{quote(str(k), safe='')}={quote(str(v), safe='')}"
            for k, v in sorted((query or {}).items())
            if v not in [None, ""]
        )
        sign_text = f"POST\n{uri or '/'}\n{canonical_query}\n{app_id}\n{timestamp}\n{signed_block}"
        signature = base64.b64encode(hmac.new(app_key.encode("utf-8"), sign_text.encode("utf-8"), hashlib.sha256).digest()).decode("utf-8")
        headers[_clean_env("BLUELM_SIGNED_HEADERS_HEADER", "X-AI-GATEWAY-SIGNED-HEADERS")] = signed_headers
    headers[signature_header] = signature
    if provider.get("api_key"):
        headers["Authorization"] = f"Bearer {provider['api_key']}"
    return headers


def _headers(provider: Dict[str, str], body: str, uri: str = "", query: Optional[Dict[str, str]] = None) -> Dict[str, str]:
    if provider["name"] == "vivo_bluelm" and provider.get("auth_mode", "auto") in {"auto", "vivo_gateway"} and provider.get("app_id") and provider.get("app_key"):
        return _vivo_headers(provider, body, uri=uri, query=query)
    return {"Authorization": f"Bearer {provider.get('api_key', '')}", "Content-Type": "application/json"}


def _log(provider: str, model: str, scene: str, prompt: str, output: str = "", success: bool = True, error: str = "", latency_ms: int = 0, user_id: Optional[int] = None) -> None:
    try:
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(str(DB_PATH)) as c:
            c.execute(
                """
                CREATE TABLE IF NOT EXISTS llm_call_logs(
                  id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,provider TEXT,model TEXT,scene TEXT,
                  prompt_hash TEXT,input_summary TEXT,output_summary TEXT,success INTEGER,error_message TEXT,
                  latency_ms INTEGER,created_at TEXT NOT NULL
                )
                """
            )
            c.execute(
                "INSERT INTO llm_call_logs(user_id,provider,model,scene,prompt_hash,input_summary,output_summary,success,error_message,latency_ms,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,datetime('now','localtime'))",
                (
                    user_id,
                    provider,
                    model,
                    scene,
                    hashlib.sha256((prompt or "").encode("utf-8")).hexdigest(),
                    (prompt or "")[:300],
                    (output or "")[:300],
                    1 if success else 0,
                    (error or "")[:300],
                    latency_ms,
                ),
            )
            c.commit()
    except Exception:
        pass


def _profile_text(profile: Optional[Dict[str, Any]]) -> str:
    p = profile or {}
    if not p:
        return "用户画像暂未填写完整。"
    keys = ["nickname", "role", "age", "monthly_income", "monthly_expense", "liquid_asset", "fixed_asset", "risk_preference", "health_status", "child_support", "family_context", "memory_summary"]
    return "；".join(f"{k}:{p.get(k)}" for k in keys if p.get(k) not in [None, "", [], {}])


def _last_user_text(messages: List[Dict[str, Any]]) -> str:
    for message in reversed(messages or []):
        if str(message.get("role") or "").lower() != "user":
            continue
        content = message.get("content", "")
        if isinstance(content, str):
            return content.strip()
        if isinstance(content, list):
            return "\n".join(
                str(item.get("text") or "").strip()
                for item in content
                if isinstance(item, dict) and item.get("type") == "text"
            ).strip()
        return str(content or "").strip()
    return ""


def _runtime_log(provider: str, fallback: bool, latency_ms: int, error_type: str = "") -> None:
    logger.info(
        "ai_gateway provider=%s fallback=%s latency_ms=%s error_type=%s",
        provider,
        fallback,
        latency_ms,
        error_type or "none",
    )


def local_fallback(scene: str, user_text: str, profile: Optional[Dict[str, Any]] = None) -> str:
    # user_text 必须是最后一条 user 消息，不能把 system prompt 混进意图判断。
    text = str(user_text or "").strip()
    is_child = str((profile or {}).get("role") or "").lower() == "child"
    you = "你" if is_child else "您"
    safety_keywords = ["转账", "验证码", "陌生链接", "保证金", "高收益保本", "保本高收益", "保本保息", "稳赚不赔", "稳赚", "私募", "股票", "虚拟币", "杠杆"]
    finance_keywords = ["理财", "养老金", "养老钱", "资产", "收益", "七日年化", "产品", "风险等级", "诈骗", "账本", "收支", "收入", "支出", "分账"]
    if scene in {"assistant_chat", "chat", "family"}:
        if any(k in text for k in safety_keywords):
            return f"这类情况先暂停：不要转账，不要提供验证码，也不要点陌生链接。请通过银行或平台官方渠道核验，必要时联系家人一起确认。"
        if "七日年化" in text:
            return "七日年化是根据最近7天的收益，换算成一年的参考比例。它不是承诺收益，之后可能升也可能降，还要一起看风险等级和赎回规则。"
        if any(k in text for k in finance_keywords):
            return f"这属于金融问题。先看资金用途、风险等级、期限和官方说明；涉及操作时别着急，先核验官方渠道，必要时和家人商量。"
        if any(k in text for k in ["梦到", "做梦", "梦见"]):
            return f"梦通常没有固定含义，更多是近期见闻、情绪和想象混在一起。鱼在天上飞挺有画面感，也许只是大脑在自由拼故事；{you}不用太担心。"
        if any(k in text for k in ["心情不好", "难过", "孤单", "烦", "情绪"]):
            return f"听起来{you}现在有些不好受。先让自己慢下来，喝口水、走一走，或找信任的人聊几句；如果这种难受持续很久，记得寻求专业帮助。"
        if any(k in text for k in ["吃什么", "早餐", "午饭", "晚饭", "做饭"]):
            return f"可以选清淡、好消化的饭菜，比如鸡蛋或鱼肉配青菜，再加一点杂粮。少油少盐，按{you}的身体情况和医生建议调整。"
        if any(k in text for k in ["你好", "您好", "在吗"]):
            return "你好，我在。想聊什么，直接说就好。" if is_child else "您好，我在呢。想聊什么，您直接说就好。"
        return f"我听到了。请再说说具体发生了什么、最想解决哪一步，我会按这件事本身给{you}答复。"
    if scene in {"finance", "risk", "vision"}:
        return "先看三点：是不是官方渠道、风险等级能不能接受、钱什么时候能取。凡是保本高收益、陌生链接、私募、股票、虚拟币、先交保证金，都建议暂停并让家人核验。"
    if scene == "term":
        return "这个词可以理解成理财产品里的一个规则。不要只看收益数字，还要看风险、期限、能否赎回和官方说明。"
    return "我先给您一个稳妥建议：涉及钱的操作不要着急，先核验官方渠道，再和家人商量。"


async def chat_text(messages: List[Dict[str, str]], scene: str = "assistant_chat", profile: Optional[Dict[str, Any]] = None, user_id: Optional[int] = None, temperature: float = 0.35) -> Dict[str, Any]:
    started = time.time()
    profile_line = _profile_text(profile)
    is_child = str((profile or {}).get("role") or "").lower() == "child"
    role_style = "当前是子女端，使用正常成年人口吻，清楚、平等、直接；不要把子女当老人，不说‘老人家’或‘养老钱您要慢慢看’。" if is_child else "当前是长辈端，语气温和、耐心，多用短句和白话，可以称‘您’，适合长辈阅读。"
    system = (
        "你是颐享智财的小享，是能回答生活、健康、出行、家庭协同和金融问题的智能助手。"
        f"{role_style}必须结合用户画像和最近对话。"
        "只有用户最新问题明确提到理财、养老金、资产、收益、产品、风险等级、诈骗、转账、验证码、陌生链接或账本收支等，才回复金融或反诈内容。"
        "不得因为用户画像、历史对话或系统说明中出现了金融词，就把最新的普通问题判成金融意图。"
        "普通聊天、生活、健康、情绪、脑洞和天马行空问题必须按原问题正常回答，禁止强行扯到理财。"
        "金融场景只做解释、核验、风险提醒和账本建议；禁止推荐股票、杠杆、私募、虚拟币、高收益保本或非法集资。"
        "涉及转账、验证码、陌生链接、保证金、高收益保本、私募、股票、虚拟币或杠杆时，必须提醒暂停、核验官方渠道，必要时联系家人。"
        f"用户画像：{profile_line}"
    )
    final_messages = [{"role": "system", "content": system}] + (messages or [])
    prompt = "\n".join(str(m.get("content", "")) for m in final_messages[-4:])
    fallback_user_text = _last_user_text(messages or [])
    errors: List[str] = []
    for provider in configured_providers():
        request_id = uuid.uuid4().hex if provider["name"] == "vivo_bluelm" else ""
        url = _chat_url(provider["base_url"], request_id=request_id)
        payload = {
            "model": provider["model"],
            "messages": final_messages,
            "temperature": temperature,
            "top_p": 0.9,
            "max_tokens": 1200,
        }
        _apply_ark_options(payload, provider)
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        query = {"requestId": request_id} if request_id and _clean_env("BLUELM_REQUEST_ID_QUERY", "requestId") else {}
        parsed = urlparse(url)
        try:
            async with httpx.AsyncClient(timeout=LLM_TIMEOUT) as client:
                res = await client.post(url, headers=_headers(provider, body, uri=parsed.path, query=query), content=body)
                res.raise_for_status()
                content = _extract_content(res.json())
                if not content:
                    raise ValueError("EmptyModelResponse")
            latency = int((time.time() - started) * 1000)
            _log(provider["name"], provider["model"], scene, prompt, content, True, "", latency, user_id)
            _runtime_log(provider["name"], False, latency)
            return {"ok": True, "provider": provider["name"], "model": provider["model"], "answer": content, "reply": content, "fallback": False, "latency_ms": latency}
        except Exception as exc:
            error_type = type(exc).__name__
            latency = int((time.time() - started) * 1000)
            errors.append(f"{provider['name']}:{error_type}")
            _log(provider["name"], provider.get("model", ""), scene, prompt, "", False, error_type, latency, user_id)
            _runtime_log(provider["name"], False, latency, error_type)

    if STRICT_LLM:
        detail = "大模型接口均不可用：" + "；".join(errors)
        _runtime_log("none", False, int((time.time() - started) * 1000), errors[-1].split(":")[-1] if errors else "NotConfigured")
        return {"ok": False, "provider": "none", "answer": detail, "reply": detail, "fallback": False, "errors": errors}

    answer = local_fallback(scene, fallback_user_text, profile)
    latency = int((time.time() - started) * 1000)
    _log("local", "local_safety_fallback", scene, fallback_user_text, answer, True, errors[-1].split(":")[-1] if errors else "", latency, user_id)
    _runtime_log("local", True, latency, errors[-1].split(":")[-1] if errors else "")
    return {"ok": True, "provider": "local", "model": "local_safety_fallback", "answer": answer, "reply": answer, "fallback": True, "errors": errors, "latency_ms": latency}


async def chat_vision(prompt: str, image_bytes: bytes, mime_type: str = "image/jpeg", scene: str = "vision", profile: Optional[Dict[str, Any]] = None, user_id: Optional[int] = None) -> Dict[str, Any]:
    started = time.time()
    data_url = f"data:{mime_type or 'image/jpeg'};base64,{base64.b64encode(image_bytes).decode('ascii')}"
    errors: List[str] = []
    for base_provider in configured_providers():
        provider = dict(base_provider)
        if provider["name"] == "vivo_bluelm":
            provider["model"] = provider.get("vision_model") or provider.get("model", "")
        if not provider.get("model"):
            continue
        request_id = uuid.uuid4().hex if provider["name"] == "vivo_bluelm" else ""
        url = _chat_url(provider["base_url"], request_id=request_id)
        payload = {
            "model": provider["model"],
            "messages": [
                {"role": "system", "content": "你是养老金融图片识别助手，只做识别、解释、风险提醒和核验建议，不诱导交易。"},
                {"role": "user", "content": [{"type": "text", "text": prompt}, {"type": "image_url", "image_url": {"url": data_url}}]},
            ],
            "temperature": 0.2,
            "max_tokens": 1500,
        }
        _apply_ark_options(payload, provider)
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        query = {"requestId": request_id} if request_id and _clean_env("BLUELM_REQUEST_ID_QUERY", "requestId") else {}
        parsed = urlparse(url)
        try:
            async with httpx.AsyncClient(timeout=LLM_TIMEOUT) as client:
                res = await client.post(url, headers=_headers(provider, body, uri=parsed.path, query=query), content=body)
                res.raise_for_status()
                content = _extract_content(res.json())
                if not content:
                    raise ValueError("EmptyModelResponse")
            latency = int((time.time() - started) * 1000)
            _log(provider["name"], provider["model"], scene, prompt, content, True, "", latency, user_id)
            _runtime_log(provider["name"], False, latency)
            return {"ok": True, "provider": provider["name"], "model": provider["model"], "answer": content, "extracted_text": content, "fallback": False, "latency_ms": latency}
        except Exception as exc:
            error_type = type(exc).__name__
            latency = int((time.time() - started) * 1000)
            errors.append(f"{provider['name']}:{error_type}")
            _log(provider["name"], provider.get("model", ""), scene, prompt, "", False, error_type, latency, user_id)
            _runtime_log(provider["name"], False, latency, error_type)

    answer = local_fallback("vision", prompt, profile)
    latency = int((time.time() - started) * 1000)
    _log("local", "local_image_fallback", scene, prompt, answer, True, errors[-1].split(":")[-1] if errors else "", latency, user_id)
    _runtime_log("local", True, latency, errors[-1].split(":")[-1] if errors else "")
    return {
        "ok": True,
        "provider": "local",
        "model": "local_image_fallback",
        "answer": answer,
        "extracted_text": "",
        "fallback": True,
        "latency_ms": latency,
        "errors": errors,
        "hint": "图片已保存；云端视觉暂不可用时，请补充截图文字，小享仍可做风险核验。",
    }


async def transcribe_ark_audio(audio_bytes: bytes, filename: str = "audio.wav", dialect: bool = False) -> Dict[str, Any]:
    started = time.time()
    provider = provider_configs()["ark"]
    if not audio_bytes or not provider.get("api_key") or not provider.get("model"):
        return {"ok": False, "provider": "ark_asr", "fallback": True, "error_summary": "NotConfiguredOrEmptyAudio"}
    fmt = Path(filename or "audio.wav").suffix.lower().lstrip(".") or "wav"
    payload: Dict[str, Any] = {
        "model": provider["model"],
        "messages": [{"role": "user", "content": [
            {"type": "text", "text": "请只转写这段录音中的原话，不回答问题，不添加解释；听不清时返回空字符串。"},
            {"type": "input_audio", "input_audio": {"data": base64.b64encode(audio_bytes).decode("ascii"), "format": fmt}},
        ]}],
        "max_tokens": 512,
        "temperature": 0.1,
    }
    _apply_ark_options(payload, provider)
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    try:
        async with httpx.AsyncClient(timeout=LLM_TIMEOUT) as client:
            response = await client.post(_chat_url(provider["base_url"]), headers=_headers(provider, body), content=body.encode("utf-8"))
            response.raise_for_status()
            text = _extract_content(response.json()).strip().strip('"').strip()
        if not text:
            raise ValueError("EmptyTranscription")
        elapsed = int((time.time() - started) * 1000)
        _runtime_log("ark_asr", False, elapsed)
        return {"ok": True, "success": True, "text": text, "provider": "ark_asr", "model": provider["model"], "fallback": False, "dialect": dialect, "latency_ms": elapsed}
    except Exception as exc:
        # Do not return URLs, response bodies or credential material to the browser/log.
        elapsed = int((time.time() - started) * 1000)
        _runtime_log("ark_asr", True, elapsed, type(exc).__name__)
        return {"ok": False, "success": False, "text": "", "provider": "ark_asr", "fallback": True, "error_summary": type(exc).__name__}


def _baidu_token() -> str:
    api_key = _clean_env("BAIDU_API_KEY")
    secret = _clean_env("BAIDU_SECRET_KEY")
    if not api_key or not secret:
        raise RuntimeError("baidu_speech_not_configured")
    with httpx.Client(timeout=10) as client:
        res = client.post(
            "https://aip.baidubce.com/oauth/2.0/token",
            params={"grant_type": "client_credentials", "client_id": api_key, "client_secret": secret},
        )
        res.raise_for_status()
        token = res.json().get("access_token")
        if not token:
            raise RuntimeError("baidu_token_empty")
        return token


def speech_to_text(audio_bytes: bytes, filename: str = "audio.wav", dialect: bool = False) -> Dict[str, Any]:
    started = time.time()
    if not audio_bytes:
        _runtime_log("local", True, 0, "EmptyAudio")
        return {"ok": False, "text": "", "hint": "没有收到录音，请重新说一遍或改用文字输入。", "provider": "local"}
    try:
        token = _baidu_token()
        lower = (filename or "").lower()
        fmt = "wav"
        if lower.endswith(".pcm"):
            fmt = "pcm"
        elif lower.endswith(".m4a") or lower.endswith(".aac"):
            fmt = "m4a"
        payload = {
            "format": fmt,
            "rate": 16000,
            "channel": 1,
            "cuid": "yixiang_zhicai",
            "token": token,
            "speech": base64.b64encode(audio_bytes).decode("ascii"),
            "len": len(audio_bytes),
        }
        with httpx.Client(timeout=30) as client:
            res = client.post(_clean_env("BAIDU_ASR_URL", "https://vop.baidu.com/server_api"), json=payload)
            res.raise_for_status()
            data = res.json()
        if data.get("err_no") != 0:
            _runtime_log("baidu_asr", False, int((time.time() - started) * 1000), "ProviderError")
            return {"ok": False, "text": "", "hint": "小享没有听清楚，请再说一遍，或者点键盘输入。", "provider": "baidu_asr", "error_summary": str(data.get("err_msg") or data.get("err_no"))}
        text = "".join(data.get("result") or []).strip()
        _runtime_log("baidu_asr", False, int((time.time() - started) * 1000))
        return {"ok": True, "text": text, "provider": "baidu_asr", "dialect": dialect}
    except Exception as exc:
        _runtime_log("local", True, int((time.time() - started) * 1000), type(exc).__name__)
        return {"ok": False, "text": "", "hint": "语音服务暂不可用，请先用文字输入，小享照样能回答。", "provider": "local", "fallback": True, "error_summary": type(exc).__name__}


def text_to_speech(text: str, voice_style: str = "elder_friendly") -> Dict[str, Any]:
    started = time.time()
    text = str(text or "").strip()[:500]
    if not text:
        _runtime_log("local", True, 0, "EmptyText")
        return {"ok": False, "url": "", "hint": "没有可朗读的文字。", "provider": "local"}
    try:
        token = _baidu_token()
        data = {
            "tex": text,
            "tok": token,
            "cuid": "yixiang_zhicai",
            "ctp": 1,
            "lan": "zh",
            "spd": 4,
            "pit": 5,
            "vol": 6,
            "per": int(_clean_env("BAIDU_TTS_PER", "4")),
            "aue": 3,
        }
        with httpx.Client(timeout=30) as client:
            res = client.post(_clean_env("BAIDU_TTS_URL", "https://tsn.baidu.com/text2audio"), data=data)
            res.raise_for_status()
            content_type = res.headers.get("Content-Type", "")
            if "application/json" in content_type:
                _runtime_log("baidu_tts", False, int((time.time() - started) * 1000), "ProviderError")
                return {"ok": False, "url": "", "hint": "语音合成暂不可用，但文字回答已保留。", "provider": "baidu_tts", "error_summary": res.text[:120]}
            audio = res.content
        if len(audio) < 100:
            _runtime_log("baidu_tts", False, int((time.time() - started) * 1000), "EmptyAudio")
            return {"ok": False, "url": "", "hint": "语音合成暂不可用，但文字回答已保留。", "provider": "baidu_tts"}
        filename = f"tts_{uuid.uuid4().hex[:12]}.mp3"
        path = AUDIO_DIR / filename
        path.write_bytes(audio)
        _runtime_log("baidu_tts", False, int((time.time() - started) * 1000))
        return {"ok": True, "url": f"/assistant/audio/{filename}", "filename": filename, "provider": "baidu_tts", "voice_style": voice_style}
    except Exception as exc:
        _runtime_log("local", True, int((time.time() - started) * 1000), type(exc).__name__)
        return {"ok": False, "url": "", "hint": "语音播放暂不可用，您可以直接看文字。", "provider": "local", "fallback": True, "error_summary": type(exc).__name__}
