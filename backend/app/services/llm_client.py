from __future__ import annotations

import hashlib
import hmac
import json
import os
import time
import uuid
import base64
from typing import Any, Dict, List, Optional
from urllib.parse import quote, urlparse

import httpx

SAFETY_PROMPT = "安全限制：不承诺收益，不诱导交易，不推荐股票、杠杆、私募、虚拟币或高息返利项目，只做解释、记录、核验、风险提醒和家庭协同。"


def _provider_order() -> List[str]:
    return [x.strip() for x in os.getenv("LLM_PROVIDER_ORDER", "vivo_bluelm,ark,qwen,deepseek,openai,local").split(",") if x.strip()]


def _configs() -> Dict[str, Dict[str, str]]:
    return {
        "vivo_bluelm": {
            "base_url": os.getenv("BLUELM_BASE_URL") or os.getenv("VIVO_BASE_URL", ""),
            "api_key": os.getenv("BLUELM_API_KEY", ""),
            "app_id": os.getenv("VIVO_APP_ID", ""),
            "app_key": os.getenv("VIVO_APP_KEY") or os.getenv("VIVO_SECRET_KEY", ""),
            "model": os.getenv("BLUELM_TEXT_MODEL", ""),
            "auth_mode": os.getenv("BLUELM_AUTH_MODE", "auto"),
        },
        "ark": {"base_url": os.getenv("ARK_BASE_URL", ""), "api_key": os.getenv("ARK_API_KEY", ""), "model": os.getenv("ARK_MODEL", "")},
        "qwen": {"base_url": os.getenv("QWEN_BASE_URL", ""), "api_key": os.getenv("QWEN_API_KEY", ""), "model": os.getenv("QWEN_MODEL", "")},
        "deepseek": {"base_url": os.getenv("DEEPSEEK_BASE_URL", ""), "api_key": os.getenv("DEEPSEEK_API_KEY", ""), "model": os.getenv("DEEPSEEK_MODEL", "")},
        "openai": {"base_url": os.getenv("OPENAI_BASE_URL", ""), "api_key": os.getenv("OPENAI_API_KEY", ""), "model": os.getenv("OPENAI_MODEL", "")},
    }


def _chat_url(base_url: str, request_id: str = "") -> str:
    url = (base_url or "").rstrip("/")
    if not (url.endswith("/chat/completions") or url.endswith("/vivogpt/completions")):
        path = os.getenv("BLUELM_ENDPOINT_PATH", "/chat/completions")
        url = url + "/" + path.lstrip("/")
    query_name = os.getenv("BLUELM_REQUEST_ID_QUERY", "requestId").strip()
    if request_id and query_name and query_name not in url:
        url += ("&" if "?" in url else "?") + f"{query_name}={quote(request_id)}"
    return url


def _extract_content(data: Dict[str, Any]) -> str:
    try:
        return str(data["choices"][0]["message"]["content"])
    except Exception:
        pass
    for path in [
        ("data", "content"),
        ("data", "answer"),
        ("data", "text"),
        ("result", "content"),
        ("result", "answer"),
        ("answer",),
        ("content",),
    ]:
        cur: Any = data
        for key in path:
            if not isinstance(cur, dict) or key not in cur:
                cur = None
                break
            cur = cur[key]
        if cur not in [None, ""]:
            return str(cur)
    return json.dumps(data, ensure_ascii=False)


def _vivo_gateway_headers(cfg: Dict[str, str], body: str, uri: str = "", query: Optional[Dict[str, str]] = None) -> Dict[str, str]:
    app_id = cfg.get("app_id") or os.getenv("VIVO_APP_ID", "")
    app_key = cfg.get("app_key") or os.getenv("VIVO_APP_KEY", "") or os.getenv("VIVO_SECRET_KEY", "")
    timestamp = str(int(time.time()))
    nonce = uuid.uuid4().hex[:8]
    app_id_header = os.getenv("BLUELM_APP_ID_HEADER", "X-AI-GATEWAY-APP-ID")
    timestamp_header = os.getenv("BLUELM_TIMESTAMP_HEADER", "X-AI-GATEWAY-TIMESTAMP")
    nonce_header = os.getenv("BLUELM_NONCE_HEADER", "X-AI-GATEWAY-NONCE")
    signature_header = os.getenv("BLUELM_SIGNATURE_HEADER", "X-AI-GATEWAY-SIGNATURE")
    headers = {
        app_id_header: app_id,
        timestamp_header: timestamp,
        nonce_header: nonce,
        "Content-Type": "application/json",
    }
    protocol = os.getenv("BLUELM_PROTOCOL_HEADER_VALUE", "openai").strip()
    if protocol:
        headers[os.getenv("BLUELM_PROTOCOL_HEADER", "X-AI-GATEWAY-PROTOCOL")] = protocol
    if os.getenv("BLUELM_SIGNATURE_MODE", "official").strip().lower() == "body":
        template = os.getenv("BLUELM_SIGNATURE_TEMPLATE", "{app_id}{timestamp}{nonce}{body}")
        sign_text = template.format(app_id=app_id, timestamp=timestamp, nonce=nonce, body=body)
        signature = hmac.new(app_key.encode("utf-8"), sign_text.encode("utf-8"), hashlib.sha256).hexdigest()
    else:
        signed_headers = f"{app_id_header.lower()};{timestamp_header.lower()};{nonce_header.lower()}"
        signed_block = f"{app_id_header.lower()}:{app_id}\n{timestamp_header.lower()}:{timestamp}\n{nonce_header.lower()}:{nonce}"
        canonical_query = "&".join(f"{quote(str(k), safe='')}={quote(str(v), safe='')}" for k, v in sorted((query or {}).items()) if v not in [None, ""])
        sign_text = f"POST\n{uri or '/'}\n{canonical_query}\n{app_id}\n{timestamp}\n{signed_block}"
        signature = base64.b64encode(hmac.new(app_key.encode("utf-8"), sign_text.encode("utf-8"), hashlib.sha256).digest()).decode("utf-8")
        headers[os.getenv("BLUELM_SIGNED_HEADERS_HEADER", "X-AI-GATEWAY-SIGNED-HEADERS")] = signed_headers
    headers[signature_header] = signature
    return headers


def _headers_for(name: str, cfg: Dict[str, str], body: str, uri: str = "", query: Optional[Dict[str, str]] = None) -> Dict[str, str]:
    if name == "vivo_bluelm" and cfg.get("auth_mode", "auto") in {"auto", "vivo_gateway"} and cfg.get("app_id") and cfg.get("app_key"):
        headers = _vivo_gateway_headers(cfg, body, uri=uri, query=query)
        if cfg.get("api_key"):
            headers["Authorization"] = f"Bearer {cfg['api_key']}"
        return headers
    return {"Authorization": f"Bearer {cfg.get('api_key', '')}", "Content-Type": "application/json"}


def _fallback(text: str, scene: str) -> Dict[str, Any]:
    if scene == "term":
        return {"provider": "local", "model": "local_safe_fallback", "content": "请先看风险、期限和官方渠道；不懂的词先问清楚再操作。"}
    return {"provider": "local", "model": "local_safe_fallback", "content": "大模型暂不可用，已使用本地安全兜底：涉及钱的操作先暂停，核验官方渠道，再和家人商量。"}


async def chat_text(messages: List[Dict[str, str]], scene: str, user_id: Optional[int] = None, temperature: float = 0.3, json_mode: bool = False) -> Dict[str, Any]:
    safe_messages = [{"role": "system", "content": SAFETY_PROMPT}] + (messages or [])
    started = time.time()
    last_error = ""
    for name in _provider_order():
        if name == "local":
            break
        cfg = _configs().get(name) or {}
        has_bearer = bool(cfg.get("api_key"))
        has_gateway = name == "vivo_bluelm" and bool(cfg.get("app_id") and cfg.get("app_key"))
        if not (cfg.get("base_url") and (has_bearer or has_gateway) and cfg.get("model")):
            continue
        request_id = uuid.uuid4().hex if name == "vivo_bluelm" else ""
        url = _chat_url(cfg["base_url"], request_id=request_id)
        payload: Dict[str, Any] = {"model": cfg["model"], "messages": safe_messages, "temperature": temperature}
        if json_mode:
            payload["response_format"] = {"type": "json_object"}
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        query = {"requestId": request_id} if request_id and os.getenv("BLUELM_REQUEST_ID_QUERY", "requestId").strip() else {}
        parsed_url = urlparse(url)
        try:
            async with httpx.AsyncClient(timeout=float(os.getenv("BLUELM_TIMEOUT", "45"))) as client:
                res = await client.post(url, headers=_headers_for(name, cfg, body, uri=parsed_url.path, query=query), content=body)
                res.raise_for_status()
                content = _extract_content(res.json())
                return {"provider": name, "model": cfg["model"], "content": content, "success": True, "latency_ms": int((time.time() - started) * 1000)}
        except Exception as exc:
            last_error = str(exc)
    out = _fallback(json.dumps(messages, ensure_ascii=False), scene)
    out.update({"success": True, "fallback": True, "error_message": last_error, "latency_ms": int((time.time() - started) * 1000)})
    return out


async def chat_vision(prompt: str, image_path: str = None, image_base64: str = None, scene: str = "vision", user_id: Optional[int] = None, json_schema: Any = None) -> Dict[str, Any]:
    image_text = image_base64 or ""
    if image_path and not image_text:
        with open(image_path, "rb") as f:
            image_text = base64.b64encode(f.read()).decode("ascii")
    if image_text.startswith("data:") and "," in image_text:
        data_url = image_text
    else:
        data_url = "data:image/jpeg;base64," + image_text
    started = time.time()
    last_error = ""
    for name in _provider_order():
        if name == "local":
            break
        cfg = (_configs().get(name) or {}).copy()
        if name == "vivo_bluelm":
            cfg["model"] = os.getenv("BLUELM_VISION_MODEL", cfg.get("model", ""))
        has_bearer = bool(cfg.get("api_key"))
        has_gateway = name == "vivo_bluelm" and bool(cfg.get("app_id") and cfg.get("app_key"))
        if not (cfg.get("base_url") and (has_bearer or has_gateway) and cfg.get("model")):
            continue
        request_id = uuid.uuid4().hex if name == "vivo_bluelm" else ""
        url = _chat_url(cfg["base_url"], request_id=request_id)
        payload: Dict[str, Any] = {
            "model": cfg["model"],
            "messages": [
                {"role": "system", "content": SAFETY_PROMPT},
                {"role": "user", "content": [{"type": "text", "text": prompt}, {"type": "image_url", "image_url": {"url": data_url}}]},
            ],
            "temperature": 0.2,
        }
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        query = {"requestId": request_id} if request_id and os.getenv("BLUELM_REQUEST_ID_QUERY", "requestId").strip() else {}
        parsed_url = urlparse(url)
        try:
            async with httpx.AsyncClient(timeout=float(os.getenv("BLUELM_TIMEOUT", "45"))) as client:
                res = await client.post(url, headers=_headers_for(name, cfg, body, uri=parsed_url.path, query=query), content=body)
                res.raise_for_status()
                content = _extract_content(res.json())
                return {"provider": name, "model": cfg["model"], "content": content, "success": True, "latency_ms": int((time.time() - started) * 1000)}
        except Exception as exc:
            last_error = str(exc)
    return {"provider": "local", "model": "local_image_fallback", "content": {"extracted_text": "", "summary": "图片已收到；云端视觉暂不可用，请补充截图文字以继续分析。", "error_message": last_error}, "success": True, "fallback": True}


async def explain_term(term: str, scene: str, nearby_text: str = "", profile: Dict[str, Any] = None, user_id: Optional[int] = None) -> Dict[str, Any]:
    result = await chat_text([{"role": "user", "content": f"80字以内解释术语：{term}。上下文：{nearby_text}"}], "term", user_id, json_mode=False)
    return {"term": term, "explanation": result["content"][:120], "risk_tip": "不懂先问清楚，不把参考收益当承诺收益。", "model_used": result["model"]}


async def generate_questionnaire(profile: Dict[str, Any], purpose: str = "risk", user_id: Optional[int] = None) -> Dict[str, Any]:
    return {"title": "稳健养老理财风险问卷", "description": "本地兜底问卷，可由蓝心模型替换生成。", "questions": []}


async def parse_finance_text(text: str, profile: Dict[str, Any] = None, user_id: Optional[int] = None) -> Dict[str, Any]:
    return {"text": text, "prompt_hash": hashlib.sha256(text.encode("utf-8")).hexdigest(), "risk_tip": "请核验官方渠道和登记编码。"}


async def parse_finance_image(image_path: str, profile: Dict[str, Any] = None, user_id: Optional[int] = None) -> Dict[str, Any]:
    return await chat_vision("解析理财产品截图", image_path=image_path, scene="finance_product", user_id=user_id)


async def parse_ledger_text(text: str, user_id: Optional[int] = None) -> Dict[str, Any]:
    return {"items": [], "raw_text": text, "need_confirm": True}


async def parse_ledger_image(image_path: str, user_id: Optional[int] = None) -> Dict[str, Any]:
    return {"items": [], "image_path": image_path, "need_confirm": True}


async def rewrite_query(text: str, scene: str, user_id: Optional[int] = None) -> Dict[str, Any]:
    return {"query": text.strip(), "scene": scene}


async def text_to_speech(text: str, voice_style: str = "elder_friendly", speed: str = "slow", user_id: Optional[int] = None) -> Dict[str, Any]:
    return {"text": text, "voice_style": voice_style, "speed": speed, "reserved": True}


async def speech_to_text(audio_path: str, dialect: bool = False, user_id: Optional[int] = None) -> Dict[str, Any]:
    return {"text": "", "audio_path": audio_path, "dialect": dialect, "reserved": True}
