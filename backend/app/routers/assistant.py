import base64
import hashlib
import hmac
import json
import os
import re
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

import requests
from dotenv import load_dotenv
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.services import ai_gateway, asr_gateway
from app.services.risk_engine import content_risk_check

PROJECT_ENV = Path(__file__).resolve().parents[3] / ".env"
BACKEND_ENV = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(PROJECT_ENV)
load_dotenv(BACKEND_ENV, override=False)

router = APIRouter()

# 优先使用火山方舟豆包配置
ARK_API_KEY = os.getenv("ARK_API_KEY", "").strip().strip('"').strip("'")
ARK_BASE_URL = os.getenv("ARK_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3").strip().strip('"').strip("'")
ARK_MODEL = os.getenv("ARK_MODEL", "doubao-seed-2-1-turbo-260628").strip().strip('"').strip("'")

# 兼容你之前可能写过的 LLM 配置
LLM_API_KEY = os.getenv("LLM_API_KEY", "").strip().strip('"').strip("'")
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "").strip().strip('"').strip("'")
LLM_MODEL = os.getenv("LLM_MODEL", "").strip().strip('"').strip("'")

# 可选：千问备用
QWEN_API_KEY = os.getenv("QWEN_API_KEY", "").strip().strip('"').strip("'")
QWEN_BASE_URL = os.getenv("QWEN_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1").strip().strip('"').strip("'")
QWEN_MODEL = os.getenv("QWEN_MODEL", "qwen-plus").strip().strip('"').strip("'")
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "").strip().strip('"').strip("'")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com").strip().strip('"').strip("'")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-chat").strip().strip('"').strip("'")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip().strip('"').strip("'")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").strip().strip('"').strip("'")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4.1-mini").strip().strip('"').strip("'")
VIVO_APP_ID = os.getenv("VIVO_APP_ID", "").strip().strip('"').strip("'")
VIVO_APP_KEY = os.getenv("VIVO_APP_KEY", "").strip().strip('"').strip("'")
VIVO_SECRET_KEY = os.getenv("VIVO_SECRET_KEY", "").strip().strip('"').strip("'")
VIVO_BASE_URL = os.getenv("VIVO_BASE_URL", "").strip().strip('"').strip("'")
BLUELM_BASE_URL = os.getenv("BLUELM_BASE_URL", VIVO_BASE_URL).strip().strip('"').strip("'")
BLUELM_API_KEY = os.getenv("BLUELM_API_KEY", "").strip().strip('"').strip("'")
BLUELM_TEXT_MODEL = os.getenv("BLUELM_TEXT_MODEL", os.getenv("BLUELM_MODEL", "")).strip().strip('"').strip("'")
BLUELM_VISION_MODEL = os.getenv("BLUELM_VISION_MODEL", BLUELM_TEXT_MODEL).strip().strip('"').strip("'")
BLUELM_AUTH_MODE = os.getenv("BLUELM_AUTH_MODE", "auto").strip().lower()
BLUELM_ENDPOINT_PATH = os.getenv("BLUELM_ENDPOINT_PATH", "/chat/completions").strip()
STRICT_LLM = os.getenv("STRICT_LLM", "0").strip() == "1"

# 百度 AI 语音服务配置
BAIDU_API_KEY = os.getenv("BAIDU_API_KEY", "").strip().strip('"').strip("'")
BAIDU_SECRET_KEY = os.getenv("BAIDU_SECRET_KEY", "").strip().strip('"').strip("'")
BAIDU_ASR_URL = os.getenv("BAIDU_ASR_URL", "https://vop.baidu.com/server_api").strip().strip('"').strip("'")
BAIDU_TTS_URL = os.getenv("BAIDU_TTS_URL", "https://tsn.baidu.com/text2audio").strip().strip('"').strip("'")
# TTS 发音人：0=普通女声 1=普通男声 3=逍遥男声 4=小梅女声（温柔亲切，推荐老人使用）
BAIDU_TTS_PER = int(os.getenv("BAIDU_TTS_PER", "4").strip().strip('"').strip("'"))
# 音频保存目录
AUDIO_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data", "tts")
os.makedirs(AUDIO_DIR, exist_ok=True)

# 百度 OAuth token 缓存
_baidu_token = None
_baidu_token_expires = 0


class AssistantChatRequest(BaseModel):
    session_id: str = ""
    message: str
    mode: str = "chat"
    term: str = ""
    profile: Dict[str, Any] = Field(default_factory=dict)
    history: List[Dict[str, Any]] = Field(default_factory=list)


class AssistantAskRequest(BaseModel):
    question: str = ""
    message: str = ""
    prompt: str = ""
    scene: str = "general"
    profile: Dict[str, Any] = Field(default_factory=dict)


class TextToVoiceRequest(BaseModel):
    text: str

class QueryRewriteRequest(BaseModel):
    text: str
    scene: str = "general"
    profile: Dict[str, Any] = Field(default_factory=dict)

class VectorSearchRequest(BaseModel):
    query: str
    scene: str = "finance"
    top_k: int = 5

class MultimodalAnalyzeRequest(BaseModel):
    text: str = ""
    image_base64: str = ""
    scene: str = "finance_product"
    profile: Dict[str, Any] = Field(default_factory=dict)


def get_baidu_token() -> str:
    """获取百度 AI OAuth access_token，自动缓存和刷新"""
    global _baidu_token, _baidu_token_expires
    import time
    now = time.time()
    if _baidu_token and now < _baidu_token_expires - 60:
        return _baidu_token
    if not BAIDU_API_KEY or not BAIDU_SECRET_KEY:
        raise RuntimeError("百度语音 API Key 或 Secret Key 未配置，请在 .env 中设置 BAIDU_API_KEY 和 BAIDU_SECRET_KEY")
    resp = requests.post(
        "https://aip.baidubce.com/oauth/2.0/token",
        params={
            "grant_type": "client_credentials",
            "client_id": BAIDU_API_KEY,
            "client_secret": BAIDU_SECRET_KEY,
        },
        timeout=10,
    )
    if resp.status_code >= 400:
        raise RuntimeError(f"百度 OAuth 失败：{resp.status_code} {resp.text[:200]}")
    data = resp.json()
    _baidu_token = data.get("access_token", "")
    _baidu_token_expires = now + data.get("expires_in", 2592000)
    if not _baidu_token:
        raise RuntimeError(f"百度 OAuth 未返回 access_token：{data}")
    return _baidu_token


def clean_nickname(name: str) -> str:
    name = (name or "").strip()
    bad_names = ["shit", "null", "undefined", "none", "微信用户"]
    if not name or name.lower() in bad_names:
        return "您"
    return name


def profile_to_text(profile: Dict[str, Any]) -> str:
    if not profile:
        return "用户还没有填写完整画像。"

    nickname = clean_nickname(str(profile.get("nickname", "")))

    items = [
        ("昵称", nickname),
        ("年龄", profile.get("age")),
        ("月收入", profile.get("monthly_income")),
        ("月支出", profile.get("monthly_expense")),
        ("总资产", profile.get("total_asset")),
        ("流动资金", profile.get("liquid_asset")),
        ("固定资金", profile.get("fixed_asset")),
        ("风险偏好", profile.get("risk_preference")),
        ("风险等级", profile.get("risk_level")),
        ("健康情况", profile.get("health_status")),
        ("紧急联系人", profile.get("child_support")),
        ("养老目标", profile.get("goals")),
        ("身份", profile.get("role")),
        ("家庭协同", profile.get("family_context")),
        ("对话记忆", profile.get("memory_summary")),
    ]

    lines = []
    for k, v in items:
        if v not in [None, "", [], {}]:
            lines.append(f"{k}：{v}")

    return "\n".join(lines) if lines else "用户还没有填写完整画像。"


def build_messages(req: AssistantChatRequest) -> List[Dict[str, str]]:
    profile_text = profile_to_text(req.profile)
    is_child = str(req.profile.get("role") or "").lower() == "child"
    role_style = (
        "当前用户是子女端。使用正常成年人口吻，清楚、平等、直接；不要把用户当老人，不使用‘老人家’‘养老钱您要慢慢看’等长辈话术。"
        if is_child else
        "当前用户是长辈端。语气温和、耐心，多用短句和白话，可以称‘您’，适合长辈阅读。"
    )
    mode_rule = ""
    if req.mode == "term_popup":
        mode_rule = (
            f"当前来自术语弹窗，弹窗术语是‘{req.term}’。结合历史里的弹窗解释回答最新追问；"
            "如果最新追问是普通聊天、生活或情绪问题，就只按该问题正常回答，不继续解释术语；"
            "只有追问与术语或金融风险有关时，才结合弹窗上下文解释术语和风险。"
        )
    elif req.mode == "explain" and req.term:
        mode_rule = f"用户正在询问术语‘{req.term}’，请按当前用户身份用通俗语言解释含义、用途和主要风险。"

    system_prompt = f"""
你是”问小享”，是颐享智财小程序里的智能助手。

你的核心风格：
1. 亲切礼貌：尊重用户身份，直接回答当前问题
2. 回答简短：用最精炼的话说清问题，控制在3-5句话以内，切忌长篇大论
3. 真诚自然：像聊天一样，不要念稿子、不要用模板
4. 千万千万要简单的回答，用简单的语言解释清楚问题，切忌切忌长篇大论

{role_style}
{mode_rule}

你可以回答的范围：
1. 日常生活问题；
2. 健康提醒和生活习惯建议；
3. 养老规划；
4. 防诈骗；
5. 理财知识解释；
6. 稳健资产安排；
7. 紧急联系人与可选帮助；
8. 用户随口聊天、情绪表达、普通问题。

回答铁律：
1. 针对用户刚刚问的问题，直接回答，不要铺垫废话
2. 回答尽量控制在3-5句话，短小精悍，信息密度高
3. 只有用户最新问题明确提到理财、养老金、资产、收益、产品、风险等级、诈骗、转账、验证码、陌生链接或账本收支等，才回复金融或反诈内容
4. 不得因为用户画像、历史对话或系统说明中出现了金融词，就把最新的普通问题判成金融意图
5. 普通聊天、生活、健康、情绪、脑洞和天马行空内容必须按原问题正常回答，禁止强行扯到理财
6. 用户问专业词汇，用符合当前端身份的通俗语言说清楚
7. 涉及健康问题可以给生活建议，但要提醒身体明显不舒服时及时就医
8. 不确定的事情诚实说不知道，不瞎编
9. 绝对不用Markdown格式，不用**、###、代码块
10. 不要固定模板，不要套话，结尾不要每次都加邀请继续提问
11. 用户情绪不好时，先安抚再回应
12. 涉及转账、验证码、陌生链接、保证金、高收益保本、私募、股票、虚拟币或杠杆时，必须提醒暂停、核验官方渠道，必要时联系家人

用户画像如下：
{profile_text}
""".strip()

    if req.mode == "explain" and req.term:
        user_message = f"请用通俗语言解释这个词：{req.term}。用户原问题：{req.message}"
    else:
        user_message = req.message

    messages = [{"role": "system", "content": system_prompt}]

    for item in req.history[-10:]:
        role = item.get("role", "user")
        if role not in ["user", "assistant"]:
            role = "user"

        content = item.get("text") or item.get("content") or ""
        content = str(content).strip()

        if content:
            messages.append({
                "role": role,
                "content": content
            })

    messages.append({
        "role": "user",
        "content": user_message
    })

    return messages


def chat_url(base_url: str) -> str:
    url = (base_url or "").rstrip("/")
    if url.endswith("/chat/completions") or url.endswith("/vivogpt/completions"):
        return url
    return url + "/" + BLUELM_ENDPOINT_PATH.lstrip("/")


def extract_chat_content(data: Dict[str, Any]) -> str:
    try:
        return str(data["choices"][0]["message"]["content"]).strip()
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
            return str(cur).strip()
    return json.dumps(data, ensure_ascii=False)


def vivo_bluelm_headers(body: str, uri: str = "", request_id: str = "") -> Dict[str, str]:
    app_key = VIVO_APP_KEY or VIVO_SECRET_KEY
    timestamp = str(int(time.time()))
    nonce = uuid.uuid4().hex[:8]
    mode = os.getenv("BLUELM_SIGNATURE_MODE", "official").strip().lower()
    app_id_header = os.getenv("BLUELM_APP_ID_HEADER", "X-AI-GATEWAY-APP-ID")
    timestamp_header = os.getenv("BLUELM_TIMESTAMP_HEADER", "X-AI-GATEWAY-TIMESTAMP")
    nonce_header = os.getenv("BLUELM_NONCE_HEADER", "X-AI-GATEWAY-NONCE")
    signature_header = os.getenv("BLUELM_SIGNATURE_HEADER", "X-AI-GATEWAY-SIGNATURE")
    headers = {
        app_id_header: VIVO_APP_ID,
        timestamp_header: timestamp,
        nonce_header: nonce,
        "Content-Type": "application/json",
    }
    protocol = os.getenv("BLUELM_PROTOCOL_HEADER_VALUE", "openai").strip()
    if protocol:
        headers[os.getenv("BLUELM_PROTOCOL_HEADER", "X-AI-GATEWAY-PROTOCOL")] = protocol
    if mode == "body":
        template = os.getenv("BLUELM_SIGNATURE_TEMPLATE", "{app_id}{timestamp}{nonce}{body}")
        sign_text = template.format(app_id=VIVO_APP_ID, timestamp=timestamp, nonce=nonce, body=body)
        signature = hmac.new(app_key.encode("utf-8"), sign_text.encode("utf-8"), hashlib.sha256).hexdigest()
    else:
        signed_headers = f"{app_id_header.lower()};{timestamp_header.lower()};{nonce_header.lower()}"
        signed_block = f"{app_id_header.lower()}:{VIVO_APP_ID}\n{timestamp_header.lower()}:{timestamp}\n{nonce_header.lower()}:{nonce}"
        query_name = os.getenv("BLUELM_REQUEST_ID_QUERY", "requestId").strip()
        canonical_query = f"{query_name}={request_id}" if query_name and request_id else ""
        sign_text = f"POST\n{uri or '/'}\n{canonical_query}\n{VIVO_APP_ID}\n{timestamp}\n{signed_block}"
        signature = base64.b64encode(hmac.new(app_key.encode("utf-8"), sign_text.encode("utf-8"), hashlib.sha256).digest()).decode("utf-8")
        headers[os.getenv("BLUELM_SIGNED_HEADERS_HEADER", "X-AI-GATEWAY-SIGNED-HEADERS")] = signed_headers
    headers[signature_header] = signature
    if BLUELM_API_KEY:
        headers["Authorization"] = f"Bearer {BLUELM_API_KEY}"
    return headers


def chat_completion_bluelm(messages: List[Dict[str, str]]) -> str:
    has_gateway = BLUELM_AUTH_MODE in {"auto", "vivo_gateway"} and VIVO_APP_ID and (VIVO_APP_KEY or VIVO_SECRET_KEY)
    has_bearer = bool(BLUELM_API_KEY)
    if not (BLUELM_BASE_URL and BLUELM_TEXT_MODEL and (has_gateway or has_bearer)):
        raise RuntimeError("BlueLM not configured")

    payload = {
        "model": BLUELM_TEXT_MODEL,
        "messages": messages,
        "temperature": 0.55,
        "top_p": 0.9,
        "max_tokens": 1200,
    }
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    url = chat_url(BLUELM_BASE_URL)
    request_id = uuid.uuid4().hex
    query_name = os.getenv("BLUELM_REQUEST_ID_QUERY", "requestId").strip()
    if has_gateway and query_name and query_name not in url:
        url += ("&" if "?" in url else "?") + f"{query_name}={request_id}"
    uri = urlparse(url).path
    headers = vivo_bluelm_headers(body, uri=uri, request_id=request_id) if has_gateway else {"Authorization": f"Bearer {BLUELM_API_KEY}", "Content-Type": "application/json"}
    response = requests.post(url, headers=headers, data=body.encode("utf-8"), timeout=60)
    if response.status_code >= 400:
        raise RuntimeError(f"BlueLM API error: {response.status_code} {response.text[:300]}")
    return extract_chat_content(response.json())


def chat_completion_bluelm_vision(prompt: str, image_base64: str, mime_type: str = "image/jpeg") -> str:
    has_gateway = BLUELM_AUTH_MODE in {"auto", "vivo_gateway"} and VIVO_APP_ID and (VIVO_APP_KEY or VIVO_SECRET_KEY)
    has_bearer = bool(BLUELM_API_KEY)
    if not (BLUELM_BASE_URL and BLUELM_VISION_MODEL and (has_gateway or has_bearer)):
        raise RuntimeError("BlueLM vision not configured")
    image_text = (image_base64 or "").strip()
    if image_text.startswith("data:") and "," in image_text:
        data_url = image_text
    else:
        data_url = f"data:{mime_type};base64,{image_text}"
    payload = {
        "model": BLUELM_VISION_MODEL,
        "messages": [
            {"role": "system", "content": "你是养老金融图片识别助手，只做识别、解释、风险提醒和核验建议，不诱导交易。"},
            {"role": "user", "content": [{"type": "text", "text": prompt}, {"type": "image_url", "image_url": {"url": data_url}}]},
        ],
        "temperature": 0.2,
        "max_tokens": 1200,
    }
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    url = chat_url(BLUELM_BASE_URL)
    request_id = uuid.uuid4().hex
    query_name = os.getenv("BLUELM_REQUEST_ID_QUERY", "requestId").strip()
    if has_gateway and query_name and query_name not in url:
        url += ("&" if "?" in url else "?") + f"{query_name}={request_id}"
    uri = urlparse(url).path
    headers = vivo_bluelm_headers(body, uri=uri, request_id=request_id) if has_gateway else {"Authorization": f"Bearer {BLUELM_API_KEY}", "Content-Type": "application/json"}
    response = requests.post(url, headers=headers, data=body.encode("utf-8"), timeout=60)
    if response.status_code >= 400:
        raise RuntimeError(f"BlueLM vision API error: {response.status_code} {response.text[:300]}")
    return extract_chat_content(response.json())


def chat_completion(base_url: str, api_key: str, model: str, messages: List[Dict[str, str]]) -> str:
    if not api_key:
        raise RuntimeError("API_KEY 为空")

    url = base_url.rstrip("/")
    if not url.endswith("/chat/completions"):
        url = url + "/chat/completions"

    response = requests.post(
        url,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": model,
            "messages": messages,
            "temperature": 0.65,
            "top_p": 0.9,
            "max_tokens": 1200,
        },
        timeout=60,
    )

    if response.status_code >= 400:
        raise RuntimeError(f"大模型接口错误：{response.status_code} {response.text}")

    data = response.json()
    return extract_chat_content(data)


def local_safe_answer(text: str, profile: Optional[Dict[str, Any]] = None) -> str:
    clean = str(text or "").strip()
    is_child = str((profile or {}).get("role") or "").lower() == "child"
    you = "你" if is_child else "您"
    if any(k in clean for k in ["转账", "验证码", "陌生链接", "保证金", "高收益保本", "保本高收益", "稳赚不赔", "私募", "股票", "虚拟币", "杠杆"]):
        return "请先暂停操作：不要转账，不要提供验证码，也不要点陌生链接。请通过银行或平台官方渠道核验，必要时联系家人一起确认。"
    if "七日年化" in clean:
        return "七日年化是根据最近7天的收益，换算成一年的参考比例。它不是承诺收益，之后可能升也可能降，还要一起看风险等级和赎回规则。"
    if any(k in clean for k in ["梦到", "做梦", "梦见"]):
        return f"梦通常没有固定含义，更多是近期见闻、情绪和想象混在一起。鱼在天上飞挺有画面感，也许只是大脑在自由拼故事；{you}不用太担心。"
    if any(k in clean for k in ["你好", "您好", "在吗", "早上好", "晚上好"]):
        return "你好，我在。想聊什么，直接说就好。" if is_child else "您好，我在呢。想聊什么，您直接说就好。"
    if any(k in clean for k in ["吃什么", "晚饭", "午饭", "早餐", "做饭", "菜谱"]):
        return f"可以选清淡、好消化的搭配，比如蒸鱼或鸡蛋配青菜，再加一点杂粮。少油少盐，按{you}的身体情况调整；有慢性病时遵医嘱。"
    if any(k in clean for k in ["心情", "难过", "孤单", "睡不着", "烦"]):
        return f"听起来{you}现在有些不好受。先慢慢呼吸、喝口水，也可以找信任的人聊聊；如果持续难受或有伤害自己的想法，请马上联系家人和专业帮助。"
    if any(k in clean for k in ["理财", "养老金", "养老钱", "资产", "收益", "产品", "风险等级", "诈骗", "账本", "收支", "收入", "支出"]):
        if is_child:
            return "先看资金什么时候要用、风险等级是否匹配、是否能在官方渠道查到登记或说明书。不要只看收益数字，确认期限、费用和赎回规则后再判断。"
        return "稳健理财先看三点：钱什么时候要用、风险等级能不能接受、是否能在官方渠道查到登记或说明书。养老钱建议先留足生活和医疗备用金，再少量考虑国债、存单、货币基金或中低风险产品。"
    return f"我听到了。请把具体情况再说一两句，比如发生了什么、{you}最想解决哪一步，我会按这件事本身给{you}一个清楚的答复。"


def sanitize_assistant_reply(value: Any) -> str:
    text = str(value or "").replace("\ufeff", "").replace("\ufffd", "").strip()
    if not text:
        return ""
    if text.startswith("{"):
        try:
            parsed = json.loads(text)
            text = extract_chat_content(parsed)
        except Exception:
            pass
    text = text.replace("\\r\\n", "\n").replace("\\n", "\n").replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"```(?:json|markdown|text)?|```", "", text, flags=re.I)
    text = re.sub(r"^\s*#{1,6}\s*", "", text, flags=re.M)
    text = re.sub(r"\*\*(.*?)\*\*|__(.*?)__", lambda m: m.group(1) or m.group(2) or "", text)
    text = re.sub(r"`([^`]+)`", r"\1", text)
    text = re.sub(r"(?:^|\n)\s*(?:Error|Traceback|HTTPException|provider|model|debug|status_code|request_id)\s*[:：].*", "", text, flags=re.I)
    text = re.sub(r"\{\s*[\"']text[\"']\s*:\s*[\"']([^\"']+)[\"']\s*,\s*[\"']score[\"']\s*:[^}]+\}", r"\1", text, flags=re.I)
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()[:1600]


@router.post("/chat")
async def assistant_chat(req: AssistantChatRequest):
    if not req.message or not req.message.strip():
        raise HTTPException(status_code=400, detail="message 不能为空")

    messages = build_messages(req)
    result = await ai_gateway.chat_text(
        messages,
        scene="assistant_chat",
        profile=req.profile,
        user_id=None,
        temperature=0.35,
    )
    reply = sanitize_assistant_reply(result.get("answer") or result.get("reply") or "")
    if not reply:
        reply = local_safe_answer(req.message, req.profile)
        result = {**result, "ok": True, "provider": result.get("provider") or "local", "fallback": True}

    risk = content_risk_check(f"{req.message}\n{reply}", req.profile or {})
    return {
        "ok": bool(result.get("ok", True)),
        "success": bool(result.get("ok", True)),
        "provider": result.get("provider", "local"),
        "model": result.get("model", ""),
        "fallback": bool(result.get("fallback", False)),
        "session_id": req.session_id,
        "reply": reply,
        "answer": reply,
        "risk_level": risk.get("risk_level", "low"),
        "risk_cards": risk.get("risk_cards", []),
        "should_pause": risk.get("should_pause", False),
    }


# ---------- 百度语音识别（ASR）----------

def call_asr_baidu(audio_bytes: bytes, audio_format: str = "wav", sample_rate: int = 16000) -> str:
    """调用百度语音识别，将音频转为文字"""
    token = get_baidu_token()
    audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")

    resp = requests.post(
        BAIDU_ASR_URL,
        json={
            "format": audio_format,
            "rate": sample_rate,
            "channel": 1,
            "cuid": "yixiang_zhicai_user",
            "token": token,
            "speech": audio_b64,
            "len": len(audio_bytes),
        },
        timeout=30,
    )
    if resp.status_code >= 400:
        raise RuntimeError(f"百度 ASR 接口返回 {resp.status_code}: {resp.text[:200]}")

    data = resp.json()
    err_no = data.get("err_no", -1)
    if err_no != 0:
        raise RuntimeError(f"百度 ASR 错误 [{err_no}]: {data.get('err_msg', '未知错误')}")

    result = data.get("result", [])
    if result:
        return "".join(result).strip()
    return ""


@router.post("/voice-to-text")
async def voice_to_text(file: Optional[UploadFile] = File(default=None), audio: Optional[UploadFile] = File(default=None)):
    """接收小程序录音，按 vivo -> 百度 -> 本地兜底识别，不让前端白屏。"""
    upload = file or audio
    if not upload or not upload.filename:
        return {
            "ok": False,
            "success": False,
            "text": "",
            "provider": "local",
            "message": "未收到音频文件，请重新录音，或改用文字输入。",
            "hint": "未收到音频文件，请重新录音，或改用文字输入。",
        }

    audio_bytes = await upload.read()
    if not audio_bytes or len(audio_bytes) < 100:
        return {
            "ok": False,
            "success": False,
            "text": "",
            "message": "录音太短啦，您可以再说一遍，或者先用文字输入。",
            "hint": "录音太短啦，您可以再说一遍，或者先用文字输入。",
            "provider": "local",
        }

    tmp_dir = Path(AUDIO_DIR).parent / "voice_uploads"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    suffix = Path(upload.filename or "voice.aac").suffix or ".aac"
    tmp_path = tmp_dir / f"voice_{uuid.uuid4().hex}{suffix}"
    tmp_path.write_bytes(audio_bytes)

    try:
        result = await asr_gateway.speech_to_text(str(tmp_path), upload.filename or "", dialect=False)
        result.setdefault("message", result.get("hint") or ("识别成功" if result.get("ok") else "语音识别暂不可用，请改用文字输入，或再说一遍。"))
        result.setdefault("hint", result.get("message"))
        return {"success": bool(result.get("ok")), **result}
    except Exception as exc:
        return {
            "ok": False,
            "success": False,
            "text": "",
            "provider": "vivo_asr",
            "message": "语音识别暂不可用，请改用文字输入，或再说一遍。",
            "hint": "语音识别暂不可用，请改用文字输入，或再说一遍。",
            "error_summary": type(exc).__name__,
        }


# ---------- 百度语音合成（TTS）----------

def call_tts_baidu(text: str) -> bytes:
    """调用百度语音合成，将文字转为 MP3 音频"""
    token = get_baidu_token()

    resp = requests.post(
        BAIDU_TTS_URL,
        data={
            "tex": text,
            "tok": token,
            "cuid": "yixiang_zhicai_user",
            "ctp": 1,
            "lan": "zh",
            "spd": 4,            # 语速 0-15，4 偏慢适合老人
            "pit": 5,            # 音调 0-15
            "vol": 6,            # 音量 0-15
            "per": BAIDU_TTS_PER,  # 发音人：4=小梅女声
            "aue": 3,            # 输出格式：3=mp3
        },
        timeout=30,
    )

    # 百度 TTS 成功返回音频二进制，失败返回 JSON
    content_type = resp.headers.get("Content-Type", "")
    if "application/json" in content_type:
        data = resp.json()
        raise RuntimeError(f"百度 TTS 错误 [{data.get('err_no')}]: {data.get('err_msg', '未知错误')}")

    if not resp.content or len(resp.content) < 100:
        raise RuntimeError("百度 TTS 返回的音频数据为空")

    return resp.content


@router.post("/text-to-voice")
def text_to_voice(req: TextToVoiceRequest):
    """将文字转为百度 TTS 语音文件，返回音频 URL"""
    text = (req.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="text 不能为空")

    result = ai_gateway.text_to_speech(text[:500])
    return {"success": bool(result.get("ok")), **result}


@router.get("/audio/{filename}")
def serve_audio(filename: str):
    """提供生成的语音文件给小程序播放"""
    filepath = os.path.join(AUDIO_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="音频文件不存在或已过期")
    return FileResponse(filepath, media_type="audio/mpeg")


@router.post("/ask")
async def assistant_ask(req: AssistantAskRequest):
    text = (req.question or req.message or req.prompt or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="question/message 不能为空")
    return await assistant_chat(AssistantChatRequest(
        session_id=req.scene or "ask",
        message=text,
        mode="chat",
        profile=req.profile,
        history=[],
    ))


@router.post("/rewrite-query")
async def rewrite_query(req: QueryRewriteRequest):
    text = (req.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="text 不能为空")
    result = await assistant_chat(AssistantChatRequest(
        session_id="rewrite-query",
        message=f"请把这个问题改写成适合金融养老知识库检索的一句话，保留关键实体，只输出改写结果：{text}",
        mode="chat",
        profile=req.profile,
        history=[],
    ))
    return {"ok": True, "query": result.get("answer") or result.get("reply"), "provider": result.get("provider"), "scene": req.scene}


@router.post("/vector-search")
def vector_search(req: VectorSearchRequest):
    query = (req.query or "").strip()
    if not query:
        raise HTTPException(status_code=400, detail="query 不能为空")
    seeds = [
        {"title": "养老资金安全边界", "summary": "先留足生活费和医疗备用金，再考虑稳健产品。"},
        {"title": "金融诈骗三步暂停法", "summary": "不着急、先核实、找家人商量。"},
        {"title": "理财产品关键条款", "summary": "重点看风险等级、期限、赎回、费用和登记编码。"},
        {"title": "子女协助清单", "summary": "协助核验官方渠道、查看合同、关注异常转账。"},
    ]
    scored = []
    qset = set(query.lower())
    for item in seeds:
        text = (item["title"] + item["summary"]).lower()
        score = sum(1 for ch in qset if ch in text)
        scored.append({**item, "score": score, "source": "local_vector_seed"})
    scored.sort(key=lambda x: x["score"], reverse=True)
    return {"ok": True, "items": scored[: max(1, min(req.top_k, 10))], "scene": req.scene, "query": query}


@router.post("/multimodal-analyze")
async def multimodal_analyze(req: MultimodalAnalyzeRequest):
    text = (req.text or "").strip()
    if req.image_base64:
        prompt = f"请分析这个{req.scene}图片输入，输出风险等级、可见文字、关键信息和下一步核验建议。用户补充：{text}"
        try:
            image_text = req.image_base64.strip()
            if image_text.startswith("data:") and "," in image_text:
                image_text = image_text.split(",", 1)[1]
            image_bytes = base64.b64decode(image_text)
            result = await ai_gateway.chat_vision(prompt, image_bytes, scene=req.scene, profile=req.profile)
            answer = result.get("answer") or result.get("extracted_text") or ""
            risk = content_risk_check(f"{text}\n{answer}", req.profile)
            return {
                "ok": True,
                "success": True,
                "provider": result.get("provider", "local"),
                "answer": answer,
                "extracted_text": result.get("extracted_text", answer),
                "scene": req.scene,
                "fallback": bool(result.get("fallback", False)),
                "risk_level": risk.get("risk_level", "low"),
                "risk_cards": risk.get("risk_cards", []),
            }
        except Exception as e:
            text = f"{text}\n图片视觉识别暂不可用，错误：{str(e)}。请按用户补充文字给出核验建议。"
    result = await assistant_chat(AssistantChatRequest(
        session_id="multimodal-analyze",
        message=f"请分析这个{req.scene}输入，输出风险等级、关键信息和下一步核验建议。\n{text}",
        mode="chat",
        profile=req.profile,
        history=[],
    ))
    return {
        "ok": True,
        "success": True,
        "provider": result.get("provider"),
        "answer": result.get("answer") or result.get("reply"),
        "scene": req.scene,
        "fallback": bool(result.get("fallback", False)),
        "risk_level": result.get("risk_level", "low"),
        "risk_cards": result.get("risk_cards", []),
    }
