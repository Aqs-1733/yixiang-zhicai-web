from __future__ import annotations
import os
import re
import hmac
import json
import math
import time
import base64
import random
import hashlib
import ipaddress
import sqlite3
import uuid
import shutil
from pathlib import Path
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import quote, unquote, urlparse
from html import unescape

import httpx
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Header, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel, Field

from app.services import ai_gateway, asr_gateway
from app.services.local_ocr import recognize_image as local_ocr_recognize
from app.services.pocket_allocator import allocate as allocate_pockets
from app.services.pocket_allocator import simulate as simulate_pockets
from app.services.risk_engine import behavior_risk_check, content_risk_check, family_alert_payload

PROJECT_ENV = Path(__file__).resolve().parents[2] / ".env"
BACKEND_ENV = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(PROJECT_ENV)
load_dotenv(BACKEND_ENV, override=False)

BASE_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = BASE_DIR.parent
_RAW_DB_PATH = os.getenv("DB_PATH", "").strip()
if _RAW_DB_PATH:
    configured_db_path = Path(_RAW_DB_PATH)
    if configured_db_path.is_absolute():
        DB_PATH = configured_db_path
    elif configured_db_path.parts and configured_db_path.parts[0].lower() == "backend":
        DB_PATH = PROJECT_DIR / configured_db_path
    else:
        DB_PATH = BASE_DIR / configured_db_path
else:
    DB_PATH = BASE_DIR / "app" / "data" / "yixiang.db"
DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
USE_MYSQL = DATABASE_URL.startswith("mysql://") or DATABASE_URL.startswith("mysql+pymysql://")
SECRET_KEY = (os.getenv("JWT_SECRET") or os.getenv("SECRET_KEY") or "yixiang-zhicai-change-me").strip().strip('"').strip("\'")
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "43200"))
APP_PORT = int(os.getenv("APP_PORT", "8000"))
LLM_API_KEY = os.getenv("LLM_API_KEY", "").strip()
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3").rstrip("/")
LLM_MODEL = os.getenv("LLM_MODEL", "doubao-seed-2-1-turbo-260628")
LLM_TIMEOUT = float(os.getenv("LLM_TIMEOUT", "40"))
STRICT_LLM = os.getenv("STRICT_LLM", "0").strip() == "1"

WECHAT_APPID = os.getenv("WECHAT_APPID", "").strip().strip('"').strip("\'")
WECHAT_SECRET = os.getenv("WECHAT_SECRET", "").strip().strip('"').strip("\'")
WECHAT_CODE2SESSION_URL = "https://api.weixin.qq.com/sns/jscode2session"

ARK_API_KEY = os.getenv("ARK_API_KEY", LLM_API_KEY).strip().strip('"').strip("'")
ARK_BASE_URL = os.getenv("ARK_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3").rstrip("/")
ARK_MODEL = os.getenv("ARK_MODEL", LLM_MODEL).strip().strip('"').strip("'")
QWEN_API_KEY = os.getenv("QWEN_API_KEY", "").strip().strip('"').strip("'")
QWEN_BASE_URL = os.getenv("QWEN_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1").rstrip("/")
QWEN_MODEL = os.getenv("QWEN_MODEL", "qwen-plus").strip().strip('"').strip("'")
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "").strip().strip('"').strip("'")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com").rstrip("/")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-chat").strip().strip('"').strip("'")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip().strip('"').strip("'")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4.1-mini").strip().strip('"').strip("'")
VIVO_APP_ID = os.getenv("VIVO_APP_ID", "").strip().strip('"').strip("'")
VIVO_APP_KEY = os.getenv("VIVO_APP_KEY", "").strip().strip('"').strip("'")
VIVO_SECRET_KEY = os.getenv("VIVO_SECRET_KEY", "").strip().strip('"').strip("'")
VIVO_BASE_URL = os.getenv("VIVO_BASE_URL", "").rstrip("/")
BLUELM_BASE_URL = os.getenv("BLUELM_BASE_URL", VIVO_BASE_URL).rstrip("/")
BLUELM_API_KEY = os.getenv("BLUELM_API_KEY", "").strip().strip('"').strip("'")
BLUELM_TEXT_MODEL = os.getenv("BLUELM_TEXT_MODEL", os.getenv("BLUELM_MODEL", "")).strip().strip('"').strip("'")
BLUELM_VISION_MODEL = os.getenv("BLUELM_VISION_MODEL", BLUELM_TEXT_MODEL).strip().strip('"').strip("'")
BLUELM_AUTH_MODE = os.getenv("BLUELM_AUTH_MODE", "auto").strip().lower()
BLUELM_ENDPOINT_PATH = os.getenv("BLUELM_ENDPOINT_PATH", "/chat/completions").strip()
LLM_PROVIDER_ORDER = [
    item.strip().lower()
    for item in os.getenv("LLM_PROVIDER_ORDER", "vivo_bluelm,ark,qwen,deepseek,openai,llm,local").split(",")
    if item.strip()
]

BANK_PRODUCTS_URL = os.getenv("BANK_PRODUCTS_URL", "").strip().strip('"').strip("'")
BANK_API_KEY = os.getenv("BANK_API_KEY", "").strip().strip('"').strip("'")
BANK_API_AUTH_HEADER = os.getenv("BANK_API_AUTH_HEADER", "Authorization").strip() or "Authorization"
PRODUCT_FEED_URL = os.getenv("PRODUCT_FEED_URL", "").strip().strip('"').strip("'")
JUHE_FINANCE_URL = os.getenv("JUHE_FINANCE_URL", "https://op.juhe.cn/onebox/stock/query").strip().strip('"').strip("'")
JUHE_FINANCE_KEY = os.getenv("JUHE_FINANCE_KEY", "").strip().strip('"').strip("'")
JUHE_BULLETIN_URL = os.getenv("JUHE_BULLETIN_URL", "https://apis.juhe.cn/fapigx/caijing/query").strip().strip('"').strip("'")
JUHE_BULLETIN_KEY = os.getenv("JUHE_BULLETIN_KEY", "").strip().strip('"').strip("'")
DATA_API_TIMEOUT = float(os.getenv("DATA_API_TIMEOUT", "12"))
PRODUCT_CACHE_TTL_SECONDS = int(os.getenv("PRODUCT_CACHE_TTL_SECONDS", "300"))
DAILY_LESSON_VIDEO_URL = os.getenv("DAILY_LESSON_VIDEO_URL", "").strip()
DAILY_LESSON_VIDEO_POSTER = os.getenv("DAILY_LESSON_VIDEO_POSTER", "").strip()
LOCAL_LESSON_VIDEO_DIR = PROJECT_DIR / "miniprogram" / "assets" / "videos"
LOCAL_DAILY_LESSON_VIDEO = PROJECT_DIR / "miniprogram" / "assets" / "videos" / "daily_lesson.mp4"
LOCAL_DAILY_LESSON_VIDEO_PATH = "/media/daily_lesson.mp4"
WECHAT_PAY_ENABLED = os.getenv("WECHAT_PAY_ENABLED", "0").strip() == "1"
WECHAT_PAY_MCH_ID = os.getenv("WECHAT_PAY_MCH_ID", "").strip()
BAIDU_API_KEY = os.getenv("BAIDU_API_KEY", "").strip().strip('"').strip("'")
BAIDU_SECRET_KEY = os.getenv("BAIDU_SECRET_KEY", "").strip().strip('"').strip("'")
TENCENT_MAP_KEY = (
    os.getenv("TENCENT_MAP_KEY")
    or os.getenv("QQ_MAP_KEY")
    or os.getenv("MAP_API_KEY")
    or ""
).strip().strip('"').strip("'")

app = FastAPI(title="颐享智财 API", version="3.0.0")
from app.routers import assistant as assistant_router
app.include_router(assistant_router.router, prefix="/assistant", tags=["assistant"])
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", response_class=HTMLResponse)
def root_page() -> str:
    return """
    <!doctype html>
    <html lang="zh-CN">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width,initial-scale=1" />
      <title>颐享智财 3.0 后端</title>
      <style>
        body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;background:#f7f8fb;color:#172033}
        main{max-width:880px;margin:48px auto;padding:0 20px}
        h1{font-size:30px;margin:0 0 10px}
        p{line-height:1.7;color:#4b5563}
        .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-top:22px}
        a{display:block;padding:16px;border:1px solid #dfe3ea;border-radius:8px;background:white;color:#1d4ed8;text-decoration:none}
        a span{display:block;color:#6b7280;font-size:13px;margin-top:6px}
      </style>
    </head>
    <body>
      <main>
        <h1>颐享智财 3.0 API 已启动</h1>
        <p>这是后端服务入口。蓝心大模型、原有 AI 协同、图片识别、文档分析、家庭协同、账本和持仓接口都从这里提供。</p>
        <div class="grid">
          <a href="/docs">Swagger 接口文档<span>可直接测试上传图片和文档</span></a>
          <a href="/healthz">健康检查<span>查看蓝心和旧模型 provider 顺序</span></a>
          <a href="/integrations/status">集成状态<span>查看蓝心、聚合数据、微信等配置</span></a>
        </div>
      </main>
    </body>
    </html>
    """


@app.api_route("/media/daily_lesson.mp4", methods=["GET", "HEAD"])
def daily_lesson_video_file() -> FileResponse:
    video_file = LOCAL_DAILY_LESSON_VIDEO if LOCAL_DAILY_LESSON_VIDEO.exists() else None
    if video_file is None:
        local_videos = get_local_lesson_video_files()
        if local_videos:
            video_file = local_videos[0]
    if video_file is None:
        raise HTTPException(status_code=404, detail="每日一课视频文件不存在")
    return FileResponse(str(video_file), media_type="video/mp4", filename=video_file.name)


def build_lesson_video_title(video_file: Path) -> str:
    metadata=video_file.with_suffix(".json")
    if metadata.is_file():
        try:
            title=json.loads(metadata.read_text(encoding="utf-8")).get("title")
            if title:return str(title)
        except Exception:pass
    if video_file.stem == "daily_lesson":
        return "理财基础：先看懂，再决定"
    return re.sub(r"[_-]+", " ", video_file.stem).strip() or "视频课程"


def lesson_video_sort_key(video_file: Path) -> tuple[int, int, str]:
    name = video_file.name
    priority_map = {
        "投资方式的种类及区别（一）.mp4": (0, 0),
        "投资方式的种类及区别（二）.mp4": (0, 1),
        "投资方式的种类及区别（三）.mp4": (0, 2),
    }
    if name in priority_map:
        return priority_map[name][0], priority_map[name][1], name.lower()
    if name == "daily_lesson.mp4":
        return 1, 0, name.lower()
    return 2, 0, name.lower()


def get_local_lesson_video_files() -> List[Path]:
    if not LOCAL_LESSON_VIDEO_DIR.exists():
        return []

    return sorted(
        [p for p in LOCAL_LESSON_VIDEO_DIR.iterdir() if p.is_file() and p.suffix.lower() == ".mp4"],
        key=lesson_video_sort_key
    )


def build_local_lesson_video_options(base_url: str) -> List[Dict[str, str]]:
    remote = [
        {"id": "投资方式的种类及区别（一）", "title": "投资方式的种类及区别（一）", "url": "https://resource.lndx.edu.cn/media/c936c606792da54629b9d925181d26d3/play/760e34622d985d8ba4f2e6c7bbfea422.m3u8"},
        {"id": "投资方式的种类及区别（二）", "title": "投资方式的种类及区别（二）", "url": "https://resource.lndx.edu.cn/media/44ebd9c760715a869fc6ca4a4771f635/play/93614a77272373765040e5077d597f2f.m3u8"},
        {"id": "投资方式的种类及区别（三）", "title": "投资方式的种类及区别（三）", "url": "https://resource.lndx.edu.cn/media/280da38b97ae1dd0d72a0c404c525781/play/8edd2344885ada7fad1633f612e6d8c8.m3u8"},
        {"id": "互联网金融与理财", "title": "互联网金融与理财", "url": "https://resource.lndx.edu.cn/media/89ff25977e30513df8295be3982643bf/play/d7b4ae97078097b2e12af96011cd2944.m3u8"},
        {"id": "七天年化收益率和年利率的区别", "title": "七天年化收益率和年利率的区别", "url": "https://resource.lndx.edu.cn/media/f1dcb14dc114aeef97edc81744c766db/play/b6475abac28986d9023ce52d982bed75.m3u8"},
        {"id": "外汇投资与结算", "title": "外汇投资与结算", "url": "https://resource.lndx.edu.cn/media/68ab41f7dbfbf4f822d3fe98101b6ac1/play/6131349d6b8a3ba4a8cce1b4acf640d5.m3u8"},
        {"id": "如何选择适合的投资方式", "title": "如何选择适合的投资方式", "url": "https://resource.lndx.edu.cn/media/35edadf4cff7c4875fa120a176949f39/play/31a60b0de05686c6313d4fe0083d6790.m3u8"},
        {"id": "个人所得税", "title": "个人所得税", "url": "https://resource.lndx.edu.cn/media/c893ead36014fd48004e87c0aa53be6e/play/7bae48bab6e844b9360cb420fdd2b105.m3u8"}
    ]

    local = [{"id": video.stem, "title": build_lesson_video_title(video), "url": base_url + "/media/lesson-videos/" + quote(video.name)} for video in get_local_lesson_video_files()]
    for item in local:
        try:metadata=json.loads((LOCAL_LESSON_VIDEO_DIR / (item["id"]+".json")).read_text(encoding="utf-8"))
        except Exception:metadata={}
        item.update({k:metadata.get(k,"") for k in ("license","license_url","source_url","attribution","updated_at")})
        item["source"]=metadata.get("attribution") or "颐享智财原创课程"
    for item in remote:item.update(source="国家老年大学 · 外部课程",license="未标注开放授权，仅保留原来源播放链接",source_url="https://www.lndx.edu.cn/")
    return local + remote


@app.api_route("/media/lesson-videos/{filename:path}", methods=["GET", "HEAD"])
def lesson_video_file(filename: str) -> FileResponse:
    safe_name = Path(unquote(filename)).name
    file_path = LOCAL_LESSON_VIDEO_DIR / safe_name
    if safe_name in {"", ".", ".."} or file_path.suffix.lower() != ".mp4" or not file_path.exists():
        raise HTTPException(status_code=404, detail="视频文件不存在")
    return FileResponse(str(file_path), media_type="video/mp4", filename=safe_name)

# ------------------------- database -------------------------

class DictRow(dict):
    def __getitem__(self, key):
        if isinstance(key, int):
            return list(self.values())[key]
        return super().__getitem__(key)


class MySQLCursor:
    def __init__(self, raw):
        self.raw = raw

    @staticmethod
    def _sql(sql: str) -> str:
        return sql.replace("INSERT OR REPLACE INTO", "REPLACE INTO").replace("?", "%s")

    def execute(self, sql: str, params: Any = None):
        self.raw.execute(self._sql(sql), params or ())
        return self

    def executemany(self, sql: str, seq_of_params: Any):
        self.raw.executemany(self._sql(sql), seq_of_params)
        return self

    def fetchone(self):
        row = self.raw.fetchone()
        return DictRow(row) if row else None

    def fetchall(self):
        return [DictRow(row) for row in self.raw.fetchall()]


class MySQLConnection:
    def __init__(self):
        try:
            import pymysql
            from pymysql.cursors import DictCursor
        except Exception as e:
            raise RuntimeError("使用 MySQL 需要先安装 pymysql：python -m pip install pymysql") from e

        url = DATABASE_URL.replace("mysql+pymysql://", "mysql://", 1)
        parsed = urlparse(url)
        self.raw = pymysql.connect(
            host=parsed.hostname or "127.0.0.1",
            port=parsed.port or 3306,
            user=unquote(parsed.username or "root"),
            password=unquote(parsed.password or ""),
            database=(parsed.path or "/yixiang_zhicai").lstrip("/"),
            charset="utf8mb4",
            cursorclass=DictCursor,
            autocommit=False,
        )

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        if exc_type:
            self.raw.rollback()
        self.raw.close()

    def execute(self, sql: str, params: Any = None):
        cursor = MySQLCursor(self.raw.cursor())
        return cursor.execute(sql, params)

    def executemany(self, sql: str, seq_of_params: Any):
        cursor = MySQLCursor(self.raw.cursor())
        return cursor.executemany(sql, seq_of_params)

    def commit(self) -> None:
        self.raw.commit()


def conn():
    if USE_MYSQL:
        return MySQLConnection()
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    return c


def now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def row_to_dict(row: sqlite3.Row | None) -> Dict[str, Any]:
    return dict(row) if row else {}


def parse_json_value(value: Any, default: Any = None) -> Any:
    if value in [None, ""]:
        return default
    if isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(value)
    except Exception:
        return default


def normalize_ledger_type(value: Any) -> str:
    text = str(value or "").strip().lower()
    if text in {"收入", "income", "in", "入账", "到账"}:
        return "收入"
    return "支出"


def chinese_amount_to_float(text: str) -> Optional[float]:
    text = str(text or "").strip()
    if not text or not re.fullmatch(r"[零〇一二两三四五六七八九十百千万]+(?:元|块)?", text):
        return None
    text = text.replace("元", "").replace("块", "")
    digit = {"零": 0, "〇": 0, "一": 1, "二": 2, "两": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}
    unit = {"十": 10, "百": 100, "千": 1000}
    total = 0
    section = 0
    number = 0
    for ch in text:
        if ch in digit:
            number = digit[ch]
        elif ch in unit:
            section += (number or 1) * unit[ch]
            number = 0
        elif ch == "万":
            total += (section + number) * 10000
            section = 0
            number = 0
    return float(total + section + number)


def parse_money_amount(value: Any, default: float = 0.0) -> float:
    if value in [None, ""]:
        return default
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).replace(",", "").strip()
    match = re.search(r"([+-]?\d+(?:\.\d+)?)(万|元|块)?", text)
    if not match:
        cn = chinese_amount_to_float(text)
        return cn if cn is not None else default
    amount = float(match.group(1))
    if match.group(2) == "万":
        amount *= 10000
    return abs(amount)


def insert_ledger_record(
    c,
    user_id: int,
    record_type: str,
    title: str,
    amount: float,
    record_date: Optional[str] = None,
    category: str = "",
    description: str = "",
    source: str = "manual",
) -> Optional[int]:
    record_type = normalize_ledger_type(record_type)
    title = (title or ("收入记录" if record_type == "收入" else "支出记录")).strip()[:128]
    record_date = (record_date or date.today().isoformat())[:10]
    category = (category or "").strip()[:64]
    description = (description or "").strip()[:500]
    try:
        c.execute(
            """
            INSERT INTO ledger_records(user_id,type,title,amount,date,category,description,source,created_at)
            VALUES(?,?,?,?,?,?,?,?,?)
            """,
            (user_id, record_type, title, float(amount), record_date, category, description, source, now_iso()),
        )
    except Exception:
        c.execute(
            "INSERT INTO ledger_records(user_id,type,title,amount,date,created_at) VALUES(?,?,?,?,?,?)",
            (user_id, record_type, title, float(amount), record_date, now_iso()),
        )
    try:
        return c.execute("SELECT LAST_INSERT_ID() AS id" if USE_MYSQL else "SELECT last_insert_rowid() AS id").fetchone()[0]
    except Exception:
        return None


def hash_password(password: str) -> str:
    salt = "yxzc"
    return hashlib.sha256((salt + password).encode("utf-8")).hexdigest()


def sign(payload: str) -> str:
    return hmac.new(SECRET_KEY.encode(), payload.encode(), hashlib.sha256).hexdigest()


def make_token(user_id: int) -> str:
    payload = json.dumps({"uid": user_id, "exp": int(time.time()) + JWT_EXPIRE_MINUTES * 60}, ensure_ascii=False)
    b64 = base64.urlsafe_b64encode(payload.encode()).decode().rstrip("=")
    return f"{b64}.{sign(b64)}"


def parse_token(token: str) -> int:
    try:
        b64, sig = token.split(".", 1)
        if not hmac.compare_digest(sign(b64), sig):
            raise ValueError("bad sign")
        payload = json.loads(base64.urlsafe_b64decode(b64 + "=" * (-len(b64) % 4)).decode())
        if payload.get("exp", 0) < time.time():
            raise ValueError("expired")
        return int(payload["uid"])
    except Exception:
        raise HTTPException(status_code=401, detail="登录已过期，请重新登录")


def current_user(authorization: str = Header(default="")) -> Dict[str, Any]:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="请先登录")
    uid = parse_token(authorization.replace("Bearer ", "", 1).strip())
    with conn() as c:
        user = c.execute("SELECT id, phone, nickname, role FROM users WHERE id=?", (uid,)).fetchone()
    if not user:
        raise HTTPException(status_code=401, detail="用户不存在")
    return dict(user)


def ensure_demo_user(c, phone: str, password: str, nickname: str, role: str) -> int:
    insert_ignore = "INSERT IGNORE INTO" if USE_MYSQL else "INSERT OR IGNORE INTO"
    c.execute(
        f"{insert_ignore} users(phone,password_hash,nickname,role,created_at) VALUES(?,?,?,?,?)",
        (phone, hash_password(password), nickname, role, now_iso()),
    )
    row = c.execute("SELECT id,nickname,role,password_hash FROM users WHERE phone=?", (phone,)).fetchone()
    if not row:
        raise RuntimeError(f"演示账号初始化失败：{phone}")
    uid = row["id"]
    updates = []
    params: List[Any] = []
    if row["role"] != role:
        updates.append("role=?")
        params.append(role)
    if row["password_hash"] != hash_password(password):
        updates.append("password_hash=?")
        params.append(hash_password(password))
    if not row["nickname"] or str(row["nickname"]).startswith("微信用户"):
        updates.append("nickname=?")
        params.append(nickname)
    if updates:
        params.append(phone)
        c.execute(f"UPDATE users SET {','.join(updates)} WHERE phone=?", tuple(params))
    profile_row = c.execute("SELECT data FROM profiles WHERE user_id=?", (uid,)).fetchone()
    if profile_row:
        profile = parse_json_value(profile_row["data"], default_profile(row["nickname"] or nickname, role))
        ensure_structured_profile(c, uid, role, profile)
    return int(uid)


def save_seed_profile_if_missing(c, uid: int, role: str, profile: Dict[str, Any]) -> Dict[str, Any]:
    profile_row = c.execute("SELECT data FROM profiles WHERE user_id=?", (uid,)).fetchone()
    if profile_row:
        existing = parse_json_value(profile_row["data"], default_profile(profile.get("nickname") or "用户", role))
        ensure_structured_profile(c, uid, role, existing)
        return existing
    c.execute("INSERT OR REPLACE INTO profiles(user_id,data,updated_at) VALUES(?,?,?)", (uid, json.dumps(profile, ensure_ascii=False), now_iso()))
    ensure_structured_profile(c, uid, role, profile)
    return profile


def ensure_demo_family_binding(c, elder_id: int, child_id: int) -> int:
    row = c.execute(
        "SELECT id FROM family_bindings WHERE elder_user_id=? AND child_user_id=? AND status='active' ORDER BY id DESC LIMIT 1",
        (elder_id, child_id),
    ).fetchone()
    if row:
        binding_id = int(row["id"])
    else:
        c.execute(
            """
            INSERT INTO family_bindings(elder_user_id,child_user_id,relation,child_name,child_phone,status,bind_code_id,created_at,confirmed_at,updated_at)
            VALUES(?,?,?,?,?,'active',NULL,?,?,?)
            """,
            (elder_id, child_id, "子女", "安心子女", "13900000000", now_iso(), now_iso(), now_iso()),
        )
        binding_id = int(c.execute("SELECT LAST_INSERT_ID() AS id" if USE_MYSQL else "SELECT last_insert_rowid() AS id").fetchone()[0])
    try:
        grant_default_permissions(c, binding_id)
    except Exception:
        pass
    return binding_id


def seed_demo_data(c) -> None:
    cleanup_demo_seed_data(c)
    elder_id = ensure_demo_user(c, "13800000000", "123456", "张叔叔", "elder")
    child_id = ensure_demo_user(c, "13900000000", "123456", "安心子女", "child")
    binding_id = ensure_demo_family_binding(c, elder_id, child_id)

    elder_profile = default_profile("张叔叔", "elder")
    save_seed_profile_if_missing(c, elder_id, "elder", elder_profile)
    child_profile = default_profile("安心子女", "child")
    save_seed_profile_if_missing(c, child_id, "child", child_profile)

    ledger_count = c.execute("SELECT COUNT(*) AS n FROM ledger_records WHERE user_id=? AND source='demo_seed'", (elder_id,)).fetchone()["n"]
    if not ledger_count:
        rows = [
            ("收入", "养老金到账", 5200, date.today().replace(day=1).isoformat(), "养老金", "本月养老金到账", "demo_seed"),
            ("支出", "买菜", 56, date.today().isoformat(), "蔬菜生鲜", "菜市场买菜", "demo_seed"),
            ("支出", "药店买药", 126, date.today().isoformat(), "医疗", "社区药店购药", "demo_seed"),
            ("支出", "超市日用品", 88, date.today().isoformat(), "购物", "超市购买日用品", "demo_seed"),
            ("收入", "国债利息", 180, date.today().isoformat(), "理财收益", "储蓄国债利息到账", "demo_seed"),
        ]
        c.executemany(
            "INSERT INTO ledger_records(user_id,type,title,amount,date,category,description,source,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
            [(elder_id, *row, now_iso()) for row in rows],
        )

    pos_count = c.execute("SELECT COUNT(*) AS n FROM wealth_positions WHERE user_id=? AND source='demo_seed'", (elder_id,)).fetchone()["n"]
    if not pos_count:
        positions = [
            ("三年期储蓄国债", "财政部/银行渠道", "GD2026-DEMO", 30000, 1, 1.018, "demo_seed", {"risk": "低风险", "status": "已记录"}),
            ("中低风险固收理财", "银行理财子公司", "PR2-DEMO", 20000, 1, 1.006, "demo_seed", {"risk": "中低风险", "status": "已记录"}),
        ]
        c.executemany(
            """
            INSERT INTO wealth_positions(user_id,product_name,institution,product_code,buy_amount,buy_net_value,current_net_value,buy_date,latest_date,source,raw_info,created_at,updated_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            [(elder_id, name, inst, code, amount, buy_nv, current_nv, date.today().isoformat(), date.today().isoformat(), source, json.dumps(info, ensure_ascii=False), now_iso(), now_iso()) for name, inst, code, amount, buy_nv, current_nv, source, info in positions],
        )

    phone_count = c.execute("SELECT COUNT(*) AS n FROM service_phones WHERE user_id=?", (elder_id,)).fetchone()["n"]
    if not phone_count:
        c.executemany(
            "INSERT INTO service_phones(user_id,name,type,phone) VALUES(?,?,?,?)",
            [
                (elder_id, "银行客服", "金融", "95588"),
                (elder_id, "附近医院咨询", "医疗", "120"),
                (elder_id, "社区服务站", "生活服务", "02212345678"),
            ],
        )

    med_count = c.execute("SELECT COUNT(*) AS n FROM meds WHERE user_id=?", (elder_id,)).fetchone()["n"]
    if not med_count:
        c.executemany(
            "INSERT INTO meds(user_id,name,time,dose,done,alarm) VALUES(?,?,?,?,0,?)",
            [
                (elder_id, "降压药", "08:00", "按医嘱一片", 1),
                (elder_id, "晚间复测血压", "20:30", "记录数值", 1),
            ],
        )

    if USE_MYSQL:
        safe_execute(c, """
            CREATE TABLE IF NOT EXISTS health_metrics(
              id BIGINT PRIMARY KEY AUTO_INCREMENT,user_id BIGINT NOT NULL,bp VARCHAR(32) DEFAULT '',hr INT DEFAULT 0,
              weight DECIMAL(10,2) DEFAULT 0,sleep VARCHAR(32) DEFAULT '',steps VARCHAR(32) DEFAULT '',updated_at VARCHAR(32) NOT NULL,
              INDEX idx_health_metrics_user(user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)
    else:
        safe_execute(c, """
            CREATE TABLE IF NOT EXISTS health_metrics(
              id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,bp TEXT DEFAULT '',hr INTEGER DEFAULT 0,
              weight REAL DEFAULT 0,sleep TEXT DEFAULT '',steps TEXT DEFAULT '',updated_at TEXT NOT NULL
            )
        """)
    health_count = c.execute("SELECT COUNT(*) AS n FROM health_metrics WHERE user_id=?", (elder_id,)).fetchone()["n"]
    if not health_count:
        c.execute(
            "INSERT INTO health_metrics(user_id,bp,hr,weight,sleep,steps,updated_at) VALUES(?,?,?,?,?,?,?)",
            (elder_id, "142/86", 76, 63.5, "6.5小时", "4200步", now_iso()),
        )

    try:
        grant_default_permissions(c, binding_id)
    except Exception:
        pass


def cleanup_demo_seed_data(c) -> None:
    for sql, params in [
        ("DELETE FROM family_members WHERE phone IN ('13900000000','13800000000')", ()),
        ("UPDATE family_bindings SET child_name='' WHERE child_phone IN ('13900000000','13800000000')", ()),
        ("DELETE FROM family_messages WHERE content='爸，今天记得量血压，遇到转账或理财截图先发我看看。'", ()),
        ("DELETE FROM alert_events WHERE source='demo_seed' AND event_type='risk_demo'", ()),
        ("DELETE FROM service_phones WHERE phone='13900000000' AND name='安心子女'", ()),
    ]:
        safe_execute(c, sql, params)


def safe_execute(c, sql: str, params: Any = None) -> None:
    try:
        c.execute(sql, params or ())
    except Exception:
        pass


def ensure_user_optional_columns(c) -> None:
    if USE_MYSQL:
        safe_execute(c, "ALTER TABLE users ADD COLUMN openid VARCHAR(128) NULL")
        safe_execute(c, "ALTER TABLE users ADD COLUMN wechat_bound_at VARCHAR(32) NULL")
        safe_execute(c, "ALTER TABLE users ADD COLUMN avatar TEXT NULL")
        safe_execute(c, "ALTER TABLE users ADD COLUMN updated_at VARCHAR(32) NULL")
    else:
        safe_execute(c, "ALTER TABLE users ADD COLUMN openid TEXT")
        safe_execute(c, "ALTER TABLE users ADD COLUMN wechat_bound_at TEXT")
        safe_execute(c, "ALTER TABLE users ADD COLUMN avatar TEXT")
        safe_execute(c, "ALTER TABLE users ADD COLUMN updated_at TEXT")


def init_extra_schema(c) -> None:
    """3.0 复赛新增结构化表。保留旧表，增量兼容 SQLite/MySQL。"""
    if USE_MYSQL:
        for sql in [
            "ALTER TABLE users ADD COLUMN openid VARCHAR(128) NULL UNIQUE",
            "ALTER TABLE users ADD COLUMN wechat_bound_at VARCHAR(32) NULL",
            "ALTER TABLE users ADD COLUMN avatar TEXT NULL",
            "ALTER TABLE users ADD COLUMN status VARCHAR(16) NOT NULL DEFAULT 'active'",
            "ALTER TABLE users ADD COLUMN updated_at VARCHAR(32) NULL",
            "CREATE INDEX idx_users_role ON users(role)",
            "ALTER TABLE ledger_records ADD COLUMN category VARCHAR(64) NOT NULL DEFAULT ''",
            "ALTER TABLE ledger_records ADD COLUMN description TEXT NULL",
            "ALTER TABLE ledger_records ADD COLUMN source VARCHAR(32) NOT NULL DEFAULT 'manual'",
        ]:
            safe_execute(c, sql)
        stmts = [
            """
            CREATE TABLE IF NOT EXISTS elder_profiles(
              id BIGINT PRIMARY KEY AUTO_INCREMENT, user_id BIGINT NOT NULL UNIQUE, age INT NULL,
              monthly_income DECIMAL(18,2) DEFAULT 0, monthly_expense DECIMAL(18,2) DEFAULT 0,
              liquid_asset DECIMAL(18,2) DEFAULT 0, fixed_asset DECIMAL(18,2) DEFAULT 0, debt DECIMAL(18,2) DEFAULT 0,
              risk_preference VARCHAR(32) DEFAULT '', health_status VARCHAR(64) DEFAULT '', phone_difficulty VARCHAR(64) DEFAULT '',
              child_support VARCHAR(64) DEFAULT '', liquidity_need VARCHAR(64) DEFAULT '', pension_goal VARCHAR(255) DEFAULT '',
              emergency_months INT DEFAULT 0, updated_at VARCHAR(32) NOT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """,
            """
            CREATE TABLE IF NOT EXISTS child_profiles(
              id BIGINT PRIMARY KEY AUTO_INCREMENT, user_id BIGINT NOT NULL UNIQUE, relation_default VARCHAR(32) DEFAULT '子女',
              emergency_contact VARCHAR(64) DEFAULT '', notify_preference VARCHAR(64) DEFAULT 'risk_alert',
              created_at VARCHAR(32) NOT NULL, updated_at VARCHAR(32) NOT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """,
            """
            CREATE TABLE IF NOT EXISTS family_bind_codes(
              id BIGINT PRIMARY KEY AUTO_INCREMENT, elder_user_id BIGINT NOT NULL, code_hash VARCHAR(128) NOT NULL,
              code_plain_demo VARCHAR(12) DEFAULT '', expires_at VARCHAR(32) NOT NULL, used TINYINT NOT NULL DEFAULT 0,
              created_at VARCHAR(32) NOT NULL, INDEX idx_bind_code_elder(elder_user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """,
            """
            CREATE TABLE IF NOT EXISTS family_bindings(
              id BIGINT PRIMARY KEY AUTO_INCREMENT, elder_user_id BIGINT NOT NULL, child_user_id BIGINT NOT NULL,
              relation VARCHAR(32) DEFAULT '子女', child_name VARCHAR(64) DEFAULT '', child_phone VARCHAR(32) DEFAULT '',
              status VARCHAR(16) NOT NULL DEFAULT 'pending', bind_code_id BIGINT NULL,
              created_at VARCHAR(32) NOT NULL, confirmed_at VARCHAR(32) NULL, updated_at VARCHAR(32) NOT NULL,
              INDEX idx_family_binding_elder(elder_user_id), INDEX idx_family_binding_child(child_user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """,
            """
            CREATE TABLE IF NOT EXISTS family_permissions(
              id BIGINT PRIMARY KEY AUTO_INCREMENT, binding_id BIGINT NOT NULL, permission_key VARCHAR(64) NOT NULL,
              enabled TINYINT NOT NULL DEFAULT 1, updated_at VARCHAR(32) NOT NULL,
              UNIQUE KEY uniq_permission(binding_id, permission_key)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """,
            """
            CREATE TABLE IF NOT EXISTS family_messages(
              id BIGINT PRIMARY KEY AUTO_INCREMENT, elder_user_id BIGINT NOT NULL, from_user_id BIGINT NOT NULL,
              to_user_id BIGINT NOT NULL, content TEXT NOT NULL, message_type VARCHAR(32) DEFAULT 'family',
              status VARCHAR(16) DEFAULT 'unread', created_at VARCHAR(32) NOT NULL,
              INDEX idx_family_msg_elder(elder_user_id), INDEX idx_family_msg_to_user(to_user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """,
            """
            CREATE TABLE IF NOT EXISTS family_group_messages(
              id BIGINT PRIMARY KEY AUTO_INCREMENT, family_id BIGINT NOT NULL, sender_id BIGINT NOT NULL,
              sender_name VARCHAR(64) DEFAULT '', sender_role VARCHAR(16) DEFAULT '', content TEXT NOT NULL,
              message_type VARCHAR(16) DEFAULT 'user', created_at VARCHAR(32) NOT NULL,
              INDEX idx_family_group_family(family_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """,
            """
            CREATE TABLE IF NOT EXISTS family_group_reads(
              id BIGINT PRIMARY KEY AUTO_INCREMENT, user_id BIGINT NOT NULL, family_id BIGINT NOT NULL,
              last_read_message_id BIGINT NOT NULL DEFAULT 0, updated_at VARCHAR(32) NOT NULL,
              UNIQUE KEY uniq_family_group_read(user_id, family_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """,
            """
            CREATE TABLE IF NOT EXISTS family_member_remarks(
              id BIGINT PRIMARY KEY AUTO_INCREMENT, viewer_user_id BIGINT NOT NULL, peer_user_id BIGINT NOT NULL,
              remark VARCHAR(64) DEFAULT '', updated_at VARCHAR(32) NOT NULL,
              UNIQUE KEY uniq_family_remark(viewer_user_id, peer_user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """,
            """
            CREATE TABLE IF NOT EXISTS alert_events(
              id BIGINT PRIMARY KEY AUTO_INCREMENT, elder_user_id BIGINT NOT NULL, event_type VARCHAR(64) NOT NULL,
              level VARCHAR(16) NOT NULL, title VARCHAR(128) NOT NULL, detail TEXT, source VARCHAR(64) DEFAULT '',
              related_record_id BIGINT NULL, status VARCHAR(16) DEFAULT 'unread', created_at VARCHAR(32) NOT NULL, handled_at VARCHAR(32) NULL,
              INDEX idx_alert_elder(elder_user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """,
            """
            CREATE TABLE IF NOT EXISTS weekly_reports(
              id BIGINT PRIMARY KEY AUTO_INCREMENT, elder_user_id BIGINT NOT NULL, period_start VARCHAR(16) NOT NULL,
              period_end VARCHAR(16) NOT NULL, summary TEXT, asset_summary_json JSON, ledger_summary_json JSON,
              position_summary_json JSON, risk_summary_json JSON, ai_advice TEXT, created_at VARCHAR(32) NOT NULL,
              INDEX idx_weekly_elder(elder_user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """,
        ]
        for sql in stmts:
            c.execute(sql)
    else:
        for sql in [
            "ALTER TABLE users ADD COLUMN openid TEXT UNIQUE",
            "ALTER TABLE users ADD COLUMN wechat_bound_at TEXT",
            "ALTER TABLE users ADD COLUMN avatar TEXT",
            "ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'",
            "ALTER TABLE users ADD COLUMN updated_at TEXT",
            "CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)",
            "ALTER TABLE ledger_records ADD COLUMN category TEXT NOT NULL DEFAULT ''",
            "ALTER TABLE ledger_records ADD COLUMN description TEXT",
            "ALTER TABLE ledger_records ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'",
        ]:
            safe_execute(c, sql)
        c.executescript(
            """
            CREATE TABLE IF NOT EXISTS elder_profiles(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id INTEGER NOT NULL UNIQUE,
              age INTEGER,
              monthly_income REAL DEFAULT 0,
              monthly_expense REAL DEFAULT 0,
              liquid_asset REAL DEFAULT 0,
              fixed_asset REAL DEFAULT 0,
              debt REAL DEFAULT 0,
              risk_preference TEXT DEFAULT '',
              health_status TEXT DEFAULT '',
              phone_difficulty TEXT DEFAULT '',
              child_support TEXT DEFAULT '',
              liquidity_need TEXT DEFAULT '',
              pension_goal TEXT DEFAULT '',
              emergency_months INTEGER DEFAULT 0,
              updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS child_profiles(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id INTEGER NOT NULL UNIQUE,
              relation_default TEXT DEFAULT '子女',
              emergency_contact TEXT DEFAULT '',
              notify_preference TEXT DEFAULT 'risk_alert',
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS family_bind_codes(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              elder_user_id INTEGER NOT NULL,
              code_hash TEXT NOT NULL,
              code_plain_demo TEXT DEFAULT '',
              expires_at TEXT NOT NULL,
              used INTEGER NOT NULL DEFAULT 0,
              created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_bind_code_elder ON family_bind_codes(elder_user_id);
            CREATE TABLE IF NOT EXISTS family_bindings(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              elder_user_id INTEGER NOT NULL,
              child_user_id INTEGER NOT NULL,
              relation TEXT DEFAULT '子女',
              child_name TEXT DEFAULT '',
              child_phone TEXT DEFAULT '',
              status TEXT NOT NULL DEFAULT 'pending',
              bind_code_id INTEGER,
              created_at TEXT NOT NULL,
              confirmed_at TEXT,
              updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_family_binding_elder ON family_bindings(elder_user_id);
            CREATE INDEX IF NOT EXISTS idx_family_binding_child ON family_bindings(child_user_id);
            CREATE TABLE IF NOT EXISTS family_permissions(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              binding_id INTEGER NOT NULL,
              permission_key TEXT NOT NULL,
              enabled INTEGER NOT NULL DEFAULT 1,
              updated_at TEXT NOT NULL,
              UNIQUE(binding_id, permission_key)
            );
            CREATE TABLE IF NOT EXISTS family_messages(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              elder_user_id INTEGER NOT NULL,
              from_user_id INTEGER NOT NULL,
              to_user_id INTEGER NOT NULL,
              content TEXT NOT NULL,
              message_type TEXT DEFAULT 'family',
              status TEXT DEFAULT 'unread',
              created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_family_msg_elder ON family_messages(elder_user_id);
            CREATE INDEX IF NOT EXISTS idx_family_msg_to_user ON family_messages(to_user_id);
            CREATE TABLE IF NOT EXISTS family_group_messages(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              family_id INTEGER NOT NULL,
              sender_id INTEGER NOT NULL,
              sender_name TEXT DEFAULT '',
              sender_role TEXT DEFAULT '',
              content TEXT NOT NULL,
              message_type TEXT DEFAULT 'user',
              created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_family_group_family ON family_group_messages(family_id);
            CREATE TABLE IF NOT EXISTS family_group_reads(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id INTEGER NOT NULL,
              family_id INTEGER NOT NULL,
              last_read_message_id INTEGER NOT NULL DEFAULT 0,
              updated_at TEXT NOT NULL,
              UNIQUE(user_id, family_id)
            );
            CREATE TABLE IF NOT EXISTS family_member_remarks(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              viewer_user_id INTEGER NOT NULL,
              peer_user_id INTEGER NOT NULL,
              remark TEXT DEFAULT '',
              updated_at TEXT NOT NULL,
              UNIQUE(viewer_user_id, peer_user_id)
            );
            CREATE TABLE IF NOT EXISTS alert_events(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              elder_user_id INTEGER NOT NULL,
              event_type TEXT NOT NULL,
              level TEXT NOT NULL,
              title TEXT NOT NULL,
              detail TEXT,
              source TEXT DEFAULT '',
              related_record_id INTEGER,
              status TEXT DEFAULT 'unread',
              created_at TEXT NOT NULL,
              handled_at TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_alert_elder ON alert_events(elder_user_id);
            CREATE TABLE IF NOT EXISTS weekly_reports(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              elder_user_id INTEGER NOT NULL,
              period_start TEXT NOT NULL,
              period_end TEXT NOT NULL,
              summary TEXT,
              asset_summary_json TEXT,
              ledger_summary_json TEXT,
              position_summary_json TEXT,
              risk_summary_json TEXT,
              ai_advice TEXT,
              created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_weekly_elder ON weekly_reports(elder_user_id);
            """
        )
    init_more_demo_tables(c)


def init_more_demo_tables(c) -> None:
    if USE_MYSQL:
        stmts = [
            "CREATE TABLE IF NOT EXISTS questionnaire_templates(id BIGINT PRIMARY KEY AUTO_INCREMENT,user_id BIGINT NULL,template_type VARCHAR(32),title VARCHAR(128),description TEXT,source_model VARCHAR(64),created_at VARCHAR(32) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
            "CREATE TABLE IF NOT EXISTS questionnaire_questions(id BIGINT PRIMARY KEY AUTO_INCREMENT,template_id BIGINT NOT NULL,question_key VARCHAR(64),title TEXT,`desc` TEXT,terms_json JSON,options_json JSON,order_no INT DEFAULT 0) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
            "CREATE TABLE IF NOT EXISTS questionnaire_answers(id BIGINT PRIMARY KEY AUTO_INCREMENT,user_id BIGINT NOT NULL,template_id BIGINT NULL,answers_json JSON,created_at VARCHAR(32) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
            "CREATE TABLE IF NOT EXISTS risk_assessments(id BIGINT PRIMARY KEY AUTO_INCREMENT,user_id BIGINT NOT NULL,template_id BIGINT NULL,risk_score INT,risk_level VARCHAR(32),summary TEXT,suggestion_json JSON,model_used VARCHAR(64),created_at VARCHAR(32) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
            "CREATE TABLE IF NOT EXISTS input_attachments(id BIGINT PRIMARY KEY AUTO_INCREMENT,user_id BIGINT NOT NULL,scene VARCHAR(64),input_type VARCHAR(16),file_path TEXT,original_name TEXT,mime_type VARCHAR(128),size BIGINT,sha256 VARCHAR(128),extracted_text TEXT,parsed_json JSON,created_at VARCHAR(32) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
            "CREATE TABLE IF NOT EXISTS ledger_imports(id BIGINT PRIMARY KEY AUTO_INCREMENT,user_id BIGINT NOT NULL,source VARCHAR(64),raw_text TEXT,parsed_json JSON,duplicate_count INT DEFAULT 0,imported_count INT DEFAULT 0,created_at VARCHAR(32) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
            "CREATE TABLE IF NOT EXISTS wealth_position_snapshots(id BIGINT PRIMARY KEY AUTO_INCREMENT,position_id BIGINT NOT NULL,current_net_value DECIMAL(18,6),estimated_value DECIMAL(18,2),profit_amount DECIMAL(18,2),profit_rate DECIMAL(18,4),risk_status VARCHAR(32),source VARCHAR(64),raw_info JSON,snapshot_date VARCHAR(16),created_at VARCHAR(32) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
            "CREATE TABLE IF NOT EXISTS term_explain_cache(id BIGINT PRIMARY KEY AUTO_INCREMENT,user_id BIGINT NULL,term VARCHAR(64),scene VARCHAR(64),nearby_text TEXT,explanation TEXT,risk_tip TEXT,model_used VARCHAR(64),created_at VARCHAR(32) NOT NULL,expires_at VARCHAR(32) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
            "CREATE TABLE IF NOT EXISTS llm_call_logs(id BIGINT PRIMARY KEY AUTO_INCREMENT,user_id BIGINT NULL,provider VARCHAR(64),model VARCHAR(128),scene VARCHAR(64),prompt_hash VARCHAR(128),input_summary TEXT,output_summary TEXT,success TINYINT,error_message TEXT,latency_ms INT,created_at VARCHAR(32) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
            "CREATE TABLE IF NOT EXISTS audit_logs(id BIGINT PRIMARY KEY AUTO_INCREMENT,user_id BIGINT NULL,action VARCHAR(64),target_type VARCHAR(64),target_id VARCHAR(64),detail_json JSON,created_at VARCHAR(32) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
            "CREATE TABLE IF NOT EXISTS account_security_questions(id BIGINT PRIMARY KEY AUTO_INCREMENT,user_id BIGINT NOT NULL UNIQUE,question VARCHAR(255) NOT NULL,answer_hash VARCHAR(128) NOT NULL,created_at VARCHAR(32) NOT NULL,updated_at VARCHAR(32) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        ]
        for sql in stmts:
            c.execute(sql)
    else:
        c.executescript(
            """
            CREATE TABLE IF NOT EXISTS questionnaire_templates(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,template_type TEXT,title TEXT,description TEXT,source_model TEXT,created_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS questionnaire_questions(id INTEGER PRIMARY KEY AUTOINCREMENT,template_id INTEGER NOT NULL,question_key TEXT,title TEXT,desc TEXT,terms_json TEXT,options_json TEXT,order_no INTEGER DEFAULT 0);
            CREATE TABLE IF NOT EXISTS questionnaire_answers(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,template_id INTEGER,answers_json TEXT,created_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS risk_assessments(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,template_id INTEGER,risk_score INTEGER,risk_level TEXT,summary TEXT,suggestion_json TEXT,model_used TEXT,created_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS input_attachments(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,scene TEXT,input_type TEXT,file_path TEXT,original_name TEXT,mime_type TEXT,size INTEGER,sha256 TEXT,extracted_text TEXT,parsed_json TEXT,created_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS ledger_imports(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,source TEXT,raw_text TEXT,parsed_json TEXT,duplicate_count INTEGER DEFAULT 0,imported_count INTEGER DEFAULT 0,created_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS wealth_position_snapshots(id INTEGER PRIMARY KEY AUTOINCREMENT,position_id INTEGER NOT NULL,current_net_value REAL,estimated_value REAL,profit_amount REAL,profit_rate REAL,risk_status TEXT,source TEXT,raw_info TEXT,snapshot_date TEXT,created_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS term_explain_cache(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,term TEXT,scene TEXT,nearby_text TEXT,explanation TEXT,risk_tip TEXT,model_used TEXT,created_at TEXT NOT NULL,expires_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS llm_call_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,provider TEXT,model TEXT,scene TEXT,prompt_hash TEXT,input_summary TEXT,output_summary TEXT,success INTEGER,error_message TEXT,latency_ms INTEGER,created_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS audit_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,action TEXT,target_type TEXT,target_id TEXT,detail_json TEXT,created_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS account_security_questions(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL UNIQUE,question TEXT NOT NULL,answer_hash TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
            """
        )


def init_mysql_db() -> None:
    with conn() as c:
        for sql in [
            """
            CREATE TABLE IF NOT EXISTS users(
              id BIGINT PRIMARY KEY AUTO_INCREMENT,
              phone VARCHAR(20) UNIQUE NOT NULL,
              password_hash VARCHAR(128) NOT NULL,
              nickname VARCHAR(64) NOT NULL,
              role VARCHAR(32) NOT NULL DEFAULT 'elder',
              created_at VARCHAR(32) NOT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
            """,
            """
            CREATE TABLE IF NOT EXISTS profiles(
              user_id BIGINT PRIMARY KEY,
              data JSON NOT NULL,
              updated_at VARCHAR(32) NOT NULL,
              CONSTRAINT fk_profiles_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
            """,
            """
            CREATE TABLE IF NOT EXISTS ledger_records(
              id BIGINT PRIMARY KEY AUTO_INCREMENT,
              user_id BIGINT NOT NULL,
              type VARCHAR(16) NOT NULL,
              title VARCHAR(128) NOT NULL,
              amount DECIMAL(18,2) NOT NULL,
              date DATE NOT NULL,
              category VARCHAR(64) NOT NULL DEFAULT '',
              description TEXT NULL,
              source VARCHAR(32) NOT NULL DEFAULT 'manual',
              created_at VARCHAR(32) NOT NULL,
              INDEX idx_ledger_user_date(user_id, date),
              CONSTRAINT fk_ledger_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
            """,
            """
            CREATE TABLE IF NOT EXISTS family_members(
              id BIGINT PRIMARY KEY AUTO_INCREMENT,
              user_id BIGINT NOT NULL,
              name VARCHAR(64) NOT NULL,
              relation VARCHAR(32) NOT NULL,
              phone VARCHAR(32) NOT NULL,
              enabled TINYINT NOT NULL DEFAULT 1,
              permissions JSON NOT NULL,
              created_at VARCHAR(32) NOT NULL,
              INDEX idx_family_user(user_id),
              CONSTRAINT fk_family_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
            """,
            """
            CREATE TABLE IF NOT EXISTS service_phones(
              id BIGINT PRIMARY KEY AUTO_INCREMENT,
              user_id BIGINT NOT NULL,
              name VARCHAR(64) NOT NULL,
              type VARCHAR(32) NOT NULL,
              phone VARCHAR(32) NOT NULL,
              INDEX idx_service_user(user_id),
              CONSTRAINT fk_service_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
            """,
            """
            CREATE TABLE IF NOT EXISTS meds(
              id BIGINT PRIMARY KEY AUTO_INCREMENT,
              user_id BIGINT NOT NULL,
              name VARCHAR(64) NOT NULL,
              time VARCHAR(16) NOT NULL,
              dose VARCHAR(64) NOT NULL,
              done TINYINT NOT NULL DEFAULT 0,
              alarm TINYINT NOT NULL DEFAULT 0,
              INDEX idx_meds_user(user_id),
              CONSTRAINT fk_meds_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
            """,
            """
            CREATE TABLE IF NOT EXISTS sport_tasks(
              id BIGINT PRIMARY KEY AUTO_INCREMENT,
              user_id BIGINT NOT NULL,
              name VARCHAR(64) NOT NULL,
              minutes INT NOT NULL,
              note VARCHAR(255) NOT NULL,
              done TINYINT NOT NULL DEFAULT 0,
              task_date DATE NOT NULL,
              INDEX idx_sport_user_date(user_id, task_date),
              CONSTRAINT fk_sport_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
            """,
            """
            CREATE TABLE IF NOT EXISTS input_records(
              id BIGINT PRIMARY KEY AUTO_INCREMENT,
              user_id BIGINT NOT NULL,
              input_type VARCHAR(32) NOT NULL,
              raw_text TEXT NOT NULL,
              parsed_json JSON NOT NULL,
              created_at VARCHAR(32) NOT NULL,
              INDEX idx_input_user_time(user_id, created_at),
              CONSTRAINT fk_input_records_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
            """,
            """
            CREATE TABLE IF NOT EXISTS wealth_positions(
              id BIGINT PRIMARY KEY AUTO_INCREMENT,
              user_id BIGINT NOT NULL,
              product_name VARCHAR(255) NOT NULL,
              institution VARCHAR(128) NOT NULL,
              product_code VARCHAR(128) NOT NULL DEFAULT '',
              buy_amount DECIMAL(18,2) NOT NULL,
              buy_net_value DECIMAL(18,6) NOT NULL DEFAULT 1,
              current_net_value DECIMAL(18,6) NOT NULL DEFAULT 1,
              buy_date DATE NOT NULL,
              latest_date DATE NOT NULL,
              source VARCHAR(64) NOT NULL,
              raw_info JSON NOT NULL,
              created_at VARCHAR(32) NOT NULL,
              updated_at VARCHAR(32) NOT NULL,
              INDEX idx_wealth_user(user_id),
              CONSTRAINT fk_wealth_positions_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
            """,
            """
            CREATE TABLE IF NOT EXISTS product_info_cache(
              id BIGINT PRIMARY KEY AUTO_INCREMENT,
              query VARCHAR(255) NOT NULL UNIQUE,
              info_json JSON NOT NULL,
              source VARCHAR(64) NOT NULL,
              fetched_at VARCHAR(32) NOT NULL,
              expires_at VARCHAR(32) NOT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
            """,
        ]:
            c.execute(sql)
        init_extra_schema(c)
        seed_demo_data(c)
        for binding_row in c.execute("SELECT id FROM family_bindings WHERE status='active'").fetchall():
            grant_default_permissions(c, int(binding_row["id"]))
        c.commit()


def init_db() -> None:
    if USE_MYSQL:
        init_mysql_db()
        return
    with conn() as c:
        c.executescript(
            """
            CREATE TABLE IF NOT EXISTS users(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              phone TEXT UNIQUE NOT NULL,
              password_hash TEXT NOT NULL,
              nickname TEXT NOT NULL,
              role TEXT NOT NULL DEFAULT 'elder',
              created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS profiles(
              user_id INTEGER PRIMARY KEY,
              data TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS ledger_records(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id INTEGER NOT NULL,
              type TEXT NOT NULL,
              title TEXT NOT NULL,
              amount REAL NOT NULL,
              date TEXT NOT NULL,
              category TEXT NOT NULL DEFAULT '',
              description TEXT,
              source TEXT NOT NULL DEFAULT 'manual',
              created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS family_members(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id INTEGER NOT NULL,
              name TEXT NOT NULL,
              relation TEXT NOT NULL,
              phone TEXT NOT NULL,
              enabled INTEGER NOT NULL DEFAULT 1,
              permissions TEXT NOT NULL,
              created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS service_phones(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id INTEGER NOT NULL,
              name TEXT NOT NULL,
              type TEXT NOT NULL,
              phone TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS meds(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id INTEGER NOT NULL,
              name TEXT NOT NULL,
              time TEXT NOT NULL,
              dose TEXT NOT NULL,
              done INTEGER NOT NULL DEFAULT 0,
              alarm INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS sport_tasks(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id INTEGER NOT NULL,
              name TEXT NOT NULL,
              minutes INTEGER NOT NULL,
              note TEXT NOT NULL,
              done INTEGER NOT NULL DEFAULT 0,
              task_date TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS input_records(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id INTEGER NOT NULL,
              input_type TEXT NOT NULL,
              raw_text TEXT NOT NULL,
              parsed_json TEXT NOT NULL,
              created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS wealth_positions(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id INTEGER NOT NULL,
              product_name TEXT NOT NULL,
              institution TEXT NOT NULL,
              product_code TEXT NOT NULL,
              buy_amount REAL NOT NULL,
              buy_net_value REAL NOT NULL DEFAULT 1,
              current_net_value REAL NOT NULL DEFAULT 1,
              buy_date TEXT NOT NULL,
              latest_date TEXT NOT NULL,
              source TEXT NOT NULL,
              raw_info TEXT NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS product_info_cache(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              query TEXT UNIQUE NOT NULL,
              info_json TEXT NOT NULL,
              source TEXT NOT NULL,
              fetched_at TEXT NOT NULL,
              expires_at TEXT NOT NULL
            );
            """
        )
        # 兼容已有数据库：为 meds 表添加 alarm 列
        try:
            c.execute("ALTER TABLE meds ADD COLUMN alarm INTEGER NOT NULL DEFAULT 0")
        except Exception:
            pass
        init_extra_schema(c)
        seed_demo_data(c)
        for binding_row in c.execute("SELECT id FROM family_bindings WHERE status='active'").fetchall():
            grant_default_permissions(c, int(binding_row["id"]))
        c.commit()


@app.on_event("startup")
def _startup() -> None:
    init_db()

# ------------------------- models -------------------------

class RegisterIn(BaseModel):
    phone: str
    password: str
    confirm: Optional[str] = None
    code: Optional[str] = None
    role: str = "elder"
    bind_code: Optional[str] = None
    nickname: str = ""
    avatar: str = ""

class LoginIn(BaseModel):
    phone: str
    password: str
    role: Optional[str] = None
    code: str = ""

class WechatLoginIn(BaseModel):
    code: str = ''
    role: str = 'elder'
    phone: Optional[str] = None
    password: Optional[str] = None
    nickname: Optional[str] = None
    avatar: Optional[str] = None

class ProfileBasicIn(BaseModel):
    nickname: str = ''
    avatar: str = ''

class ChatIn(BaseModel):
    message: str

class ProfileIn(BaseModel):
    data: Dict[str, Any]

class RiskIn(BaseModel):
    answers: Dict[str, Any]

class ProductExplainIn(BaseModel):
    product: Dict[str, Any]

class PortfolioAskIn(BaseModel):
    request_text: str = "请根据我的画像和资产情况，给出稳健资产建议"

class GenericTextIn(BaseModel):
    text: str = ""

class PhoneIn(BaseModel):
    name: str = ""
    phone: str = ""
    type: str = "自定义"
    text: str = ""

class LedgerRecordIn(BaseModel):
    text: str = ""
    type: str = "支出"
    title: str = ""
    amount: float = 0
    date: str = Field(default_factory=lambda: date.today().isoformat())
    category: str = ""
    category_name: str = ""
    description: str = ""
    source: str = "manual"

class MedIn(BaseModel):
    name: str = ""
    time: str = "08:00"
    dose: str = "按医嘱"
    alarm: bool = False

class MedUpdateIn(BaseModel):
    done: Optional[bool] = None
    alarm: Optional[bool] = None
    name: Optional[str] = None
    time: Optional[str] = None
    dose: Optional[str] = None

class HealthMetricsIn(BaseModel):
    bp: str = "128/78"
    hr: int = 72
    weight: float = 61.5
    sleep: str = "6.8小时"
    steps: str = "4200"

class SmartLedgerIn(BaseModel):
    input_type: str = Field(default="text", description="text/voice/image")
    text: str = ""
    recognized_text: str = ""
    attachment_url: str = ""

class WealthPositionIn(BaseModel):
    product_name: str
    institution: str = ""
    product_code: str = ""
    buy_amount: float
    buy_net_value: float = 1
    current_net_value: float = 1
    buy_date: str = Field(default_factory=lambda: date.today().isoformat())

class PaymentLedgerIn(BaseModel):
    title: str = "微信支付记账"
    amount: float
    payee: str = ""
    transaction_id: str = ""

class FinanceParseIn(BaseModel):
    text: str = ""
    source: str = "text"

class TermExplainIn(BaseModel):
    term: str
    scene: str = "general"
    nearby_text: str = ""
    force_llm: bool = False

class QuestionnaireSubmitIn(BaseModel):
    template_id: Optional[int] = None
    answers: Dict[str, Any] = Field(default_factory=dict)

class ContentGenerateIn(BaseModel):
    topic: str = "养老理财风险教育"
    scene: str = "lesson"
    audience: str = "elder"
    style: str = "warm"
    facts: Dict[str, Any] = Field(default_factory=dict)

class DocumentAnalyzeIn(BaseModel):
    filename: str = "document.txt"
    text: str = ""
    scene: str = "finance_document"

class ImageRecognizeIn(BaseModel):
    image_base64: str = ""
    mime_type: str = "image/jpeg"
    scene: str = "general_image"
    prompt: str = ""

# ------------------------- domain helpers -------------------------

def default_profile(nickname: str = "用户", role: str = "elder") -> Dict[str, Any]:
    return {
        "nickname": nickname,
        "avatar": "",
        "role": normalize_role(role),
        "onboarding_completed": normalize_role(role) == "child",
        "profile_source": "registration",
    }


_LEGACY_QUESTIONNAIRE_RANGES = {
    "age": {68: "65岁以上", 62: "55-65岁", 50: "45-55岁", 40: "35-45岁", 30: "35岁以下"},
    "monthly_income": {2500: "3000以下", 4000: "3000-5000", 5000: "5000-8000", 9000: "8000-12000", 12000: "12000以上"},
    "monthly_expense": {1800: "2000以下", 2800: "2000-3000", 4000: "3000-5000", 6500: "5000-8000", 8500: "8000以上"},
    "liquid_asset": {8000: "1万以下", 30000: "1-5万", 80000: "5-10万", 180000: "10-30万", 350000: "30万以上"},
    "fixed_asset": {0: "没有", 30000: "5万以下", 120000: "5-20万", 300000: "20-50万", 600000: "50万以上"},
}
_PROFILE_RANGE_KEYS = {
    "age": "age_range",
    "monthly_income": "monthly_income_range",
    "monthly_expense": "monthly_expense_range",
    "liquid_asset": "liquid_asset_range",
    "fixed_asset": "fixed_asset_range",
}


def clean_legacy_profile_defaults(profile: Dict[str, Any], role: str) -> Dict[str, Any]:
    cleaned = dict(profile or {})
    cleaned["role"] = normalize_role(role)
    source = str(cleaned.get("profile_source") or "")
    if source in {"questionnaire_range", "manual", "demo"}:
        return cleaned

    demo_signature = {
        "age": 68,
        "monthly_income": 5200,
        "monthly_expense": 3100,
        "liquid_asset": 90000,
        "fixed_asset": 260000,
    }
    if all(cleaned.get(key) == value for key, value in demo_signature.items()):
        identity = default_profile(str(cleaned.get("nickname") or "用户"), role)
        identity["avatar"] = str(cleaned.get("avatar") or "")
        return identity

    exact_values = {key: cleaned.get(key) for key in _PROFILE_RANGE_KEYS}
    looks_like_old_questionnaire = bool(cleaned.get("onboarding_completed")) and all(
        isinstance(value, (int, float)) and value in _LEGACY_QUESTIONNAIRE_RANGES[key]
        for key, value in exact_values.items()
    )
    if looks_like_old_questionnaire:
        for key, range_key in _PROFILE_RANGE_KEYS.items():
            cleaned[range_key] = _LEGACY_QUESTIONNAIRE_RANGES[key][cleaned[key]]
            cleaned.pop(key, None)
        cleaned["profile_source"] = "questionnaire_range"
        return cleaned

    if not cleaned.get("onboarding_completed") or normalize_role(role) == "child":
        legacy_defaults = {
            "age": 62,
            "monthly_income": 5000,
            "monthly_expense": 2800,
            "liquid_asset": 80000,
            "fixed_asset": 300000,
            "debt": 0,
            "risk_preference": "稳健",
            "health_status": "一般",
            "experience": "少量",
            "phone_difficulty": "中等",
            "child_support": "可选添加",
            "liquidity_need": "半年",
        }
        for key, value in legacy_defaults.items():
            if cleaned.get(key) == value:
                cleaned.pop(key, None)
        if cleaned.get("goals") == ["养老储备", "医疗备用金", "稳健理财"]:
            cleaned.pop("goals", None)
        cleaned["profile_source"] = "registration"
    return cleaned


def get_profile(uid: int) -> Dict[str, Any]:
    with conn() as c:
        row = c.execute("SELECT data FROM profiles WHERE user_id=?", (uid,)).fetchone()
        user = c.execute("SELECT nickname,role FROM users WHERE id=?", (uid,)).fetchone()
    nickname = user["nickname"] if user else "用户"
    role = user["role"] if user else "elder"
    if row:
        profile = parse_json_value(row["data"], default_profile(nickname, role))
        cleaned = clean_legacy_profile_defaults(profile, role)
        if cleaned != profile:
            save_profile(uid, cleaned)
        return cleaned
    p = default_profile(nickname, role)
    save_profile(uid, p)
    return p


def save_profile(uid: int, data: Dict[str, Any]) -> None:
    with conn() as c:
        c.execute("INSERT OR REPLACE INTO profiles(user_id,data,updated_at) VALUES(?,?,?)", (uid, json.dumps(data, ensure_ascii=False), now_iso()))
        c.commit()


def fmt_money(n: float) -> str:
    value = float(n or 0)
    if abs(value - round(value)) < 0.005:
        return f"{value:,.0f}"
    return f"{value:,.2f}".rstrip("0").rstrip(".")


def profile_risk(profile: Dict[str, Any]) -> Dict[str, Any]:
    if not profile.get("risk_preference"):
        return {
            "risk_score": None,
            "risk_level": "待完善",
            "tags": [],
            "summary": "请先完成画像问卷或填写真实数据，再生成风险评估。",
            "risk_reason": "当前画像信息不足，暂不做风险等级判断。",
            "fraud_tip": "涉及转账、验证码或陌生链接时，请先暂停并通过官方渠道核验。",
        }
    pref = str(profile.get("risk_preference") or "")
    age = int(profile.get("age") or 0)
    exp = str(profile.get("experience") or "")
    liquidity = str(profile.get("liquidity_need") or profile.get("money_time") or "")
    score = 62
    if pref == "保守": score -= 12
    if pref == "平衡": score += 8
    if age >= 65: score -= 6
    if exp == "没有": score -= 6
    if liquidity == "随时": score -= 8
    score = max(30, min(82, score))
    level = "低风险" if score < 50 else "稳健型" if score < 70 else "平衡稳健"
    tags = ["安全优先", "适合大字模式", "需要白话解释"]
    if profile.get("child_support") != "不需要": tags.append("紧急联系人可选")
    if liquidity == "随时": tags.append("重视流动性")
    else: tags.append("可做期限搭配")
    return {
        "risk_score": score,
        "risk_level": level,
        "tags": tags,
        "summary": f"{profile.get('nickname','您')}当前更适合稳健型养老资金管理：先保留日常和医疗备用金，再少量配置中低风险、期限清楚的产品。",
        "risk_reason": "年龄、现金流、用钱时间和过往经验综合判断，建议以安全、可取、看得懂为优先。",
        "fraud_tip": "凡是承诺保本高收益、要求先转账、让您绕开子女或银行客服的，都建议先停止操作并问小享。",
    }


DEFAULT_PERMISSION_KEYS = [
    "view_positions",
    "view_ledger_summary",
    "receive_alerts",
    "view_messages",
    "view_group_chat",
    "view_health",
    "view_location",
]

PERMISSION_LABELS = {
    "view_positions": "理财记录",
    "view_ledger_summary": "日常收支记录",
    "receive_alerts": "风险提示",
    "view_messages": "留言",
    "view_group_chat": "群聊",
    "view_health": "健康",
    "view_location": "位置",
}


def normalize_role(role: str) -> str:
    role = str(role or "elder").strip().lower()
    elder_aliases = {"elder", "parent", "old", "senior", "长辈", "长辈端", "长辈用户", "老人", "老人端"}
    child_aliases = {"child", "family", "kid", "children", "子女", "子女端", "子女用户", "子女协助用户", "家人", "家人端"}
    if role in elder_aliases:
        return "elder"
    if role in child_aliases:
        return "child"
    if role not in {"elder", "child"}:
        raise HTTPException(400, detail="身份只能选择长辈或子女")
    return role


def ensure_structured_profile(c, uid: int, role: str, profile: Optional[Dict[str, Any]] = None) -> None:
    profile = profile or get_profile(uid)
    insert_ignore = "INSERT IGNORE INTO" if USE_MYSQL else "INSERT OR IGNORE INTO"
    if role == "child":
        c.execute(
            f"{insert_ignore} child_profiles(user_id,relation_default,emergency_contact,notify_preference,created_at,updated_at) VALUES(?,?,?,?,?,?)",
            (uid, "子女", "", "risk_alert", now_iso(), now_iso()),
        )
        return
    c.execute(
        f"""
        {insert_ignore} elder_profiles(
          user_id,age,monthly_income,monthly_expense,liquid_asset,fixed_asset,debt,risk_preference,
          health_status,phone_difficulty,child_support,liquidity_need,pension_goal,emergency_months,updated_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """,
        (
            uid,
            int(profile["age"]) if profile.get("age") not in [None, ""] else None,
            float(profile["monthly_income"]) if profile.get("monthly_income") not in [None, ""] else None,
            float(profile["monthly_expense"]) if profile.get("monthly_expense") not in [None, ""] else None,
            float(profile["liquid_asset"]) if profile.get("liquid_asset") not in [None, ""] else None,
            float(profile["fixed_asset"]) if profile.get("fixed_asset") not in [None, ""] else None,
            float(profile["debt"]) if profile.get("debt") not in [None, ""] else None,
            str(profile.get("risk_preference") or ""),
            str(profile.get("health_status") or ""),
            str(profile.get("phone_difficulty") or ""),
            str(profile.get("child_support") or ""),
            str(profile.get("liquidity_need") or profile.get("money_time") or ""),
            ",".join(profile.get("goals") or []),
            0,
            now_iso(),
        ),
    )


PRODUCTS = [
    {"id": 1, "name": "三年期储蓄国债", "yield_rate": "以财政部发行公告为准", "term": "3年", "min_buy": "100元", "risk": "低风险", "safe": True, "institution": "财政部/承销银行", "source": "compliance_reference", "desc": "国家信用，适合作为养老增值的一部分，到期前注意流动性。"},
    {"id": 2, "name": "银行大额存单", "yield_rate": "以银行挂牌利率为准", "term": "1-3年", "min_buy": "20万元", "risk": "低风险", "safe": True, "institution": "商业银行", "source": "compliance_reference", "desc": "本金相对稳，适合已有较多闲置资金的用户，需看清是否可转让。"},
    {"id": 3, "name": "货币基金现金管理", "yield_rate": "以基金公司披露为准", "term": "灵活", "min_buy": "1元", "risk": "低风险", "safe": True, "institution": "基金公司/代销机构", "source": "compliance_reference", "desc": "适合日常备用金，收益不高但取用较方便。"},
    {"id": 4, "name": "中低风险固收理财", "yield_rate": "业绩比较基准不等于实际收益", "term": "90-360天", "min_buy": "1元/1000元", "risk": "中低风险", "safe": True, "institution": "银行理财子公司", "source": "compliance_reference", "desc": "净值可能小幅波动，适合能接受轻微波动且不用急钱的部分资金。"},
]

_PRODUCT_CACHE: Dict[str, Any] = {"expires_at": 0.0, "payload": None}


def configured_market_sources() -> List[Dict[str, Any]]:
    return [
        {
            "name": "licensed_bank_api",
            "label": "银行/理财机构授权产品接口",
            "configured": bool(BANK_PRODUCTS_URL and BANK_API_KEY),
            "required_env": ["BANK_PRODUCTS_URL", "BANK_API_KEY"],
            "legal_note": "仅在已获得银行或理财机构授权、签署数据使用协议后启用。",
        },
        {
            "name": "product_feed",
            "label": "合规金融数据服务商产品接口",
            "configured": bool(PRODUCT_FEED_URL),
            "required_env": ["PRODUCT_FEED_URL"],
            "legal_note": "用于接入已购买或获授权的数据服务商 JSON Feed。",
        },
        {
            "name": "juhe_finance",
            "label": "聚合数据金融接口",
            "configured": bool(JUHE_FINANCE_URL and JUHE_FINANCE_KEY),
            "required_env": ["JUHE_FINANCE_URL", "JUHE_FINANCE_KEY"],
            "legal_note": "按聚合数据所购接口的授权范围展示，不越权抓取。",
        },
        {
            "name": "juhe_bulletin",
            "label": "聚合数据公告/资讯接口",
            "configured": bool(JUHE_BULLETIN_URL and JUHE_BULLETIN_KEY),
            "required_env": ["JUHE_BULLETIN_URL", "JUHE_BULLETIN_KEY"],
            "legal_note": "仅用于资讯/公告摘要，不能替代产品说明书。",
        },
        {
            "name": "official_verification",
            "label": "官方查询平台核验",
            "configured": True,
            "links": ["https://www.chinawealth.com.cn/", "https://www.jrcpcx.cn/"],
            "legal_note": "中国理财网/金融产品查询平台用于人工核验登记编码；未默认爬取网页。",
        },
    ]


def _extract_items(payload: Any) -> List[Dict[str, Any]]:
    if isinstance(payload, list):
        return [x for x in payload if isinstance(x, dict)]
    if not isinstance(payload, dict):
        return []
    for key in ("items", "data", "result", "products", "list", "rows", "newslist"):
        value = payload.get(key)
        if isinstance(value, list):
            return [x for x in value if isinstance(x, dict)]
        if isinstance(value, dict):
            nested = _extract_items(value)
            if nested:
                return nested
    return []


def response_json_with_encoding(response: httpx.Response) -> Any:
    for encoding in ("utf-8-sig", "utf-8", "gb18030"):
        try:
            return json.loads(response.content.decode(encoding))
        except Exception:
            continue
    return response.json()


def normalize_news_item(raw: Dict[str, Any], idx: int) -> Dict[str, Any]:
    title = str(raw.get("title") or raw.get("name") or raw.get("news_title") or "").strip()
    source = str(raw.get("source") or raw.get("src") or raw.get("author") or raw.get("media") or "").strip()
    published_at = str(
        raw.get("time")
        or raw.get("date")
        or raw.get("publish_time")
        or raw.get("published_at")
        or raw.get("ctime")
        or ""
    ).strip()
    content = str(raw.get("content") or raw.get("detail") or raw.get("body") or "").strip()
    summary = str(raw.get("summary") or raw.get("digest") or raw.get("description") or content or title).strip()
    url = str(raw.get("url") or raw.get("link") or raw.get("share_url") or "").strip()

    return {
        "id": str(raw.get("id") or raw.get("news_id") or f"news-{idx}"),
        "title": title,
        "source": source or "新闻API",
        "time": published_at,
        "summary": summary[:180],
        "content": (content or summary or title)[:2000],
        "url": url,
    }


def local_risk_education_news(limit: int = 8, reason: str = "") -> Dict[str, Any]:
    today = date.today().isoformat()
    items = [
        {
            "id": "local-risk-1",
            "title": "保本高收益先暂停，养老钱不着急转账",
            "source": "小享风险教育",
            "time": today,
            "summary": "正规理财不能承诺稳赚不赔，遇到高收益、先交保证金、陌生链接时先停下来。",
            "content": "养老钱最重要是安全。凡是让您马上转账、保证高收益、要求输入验证码或扫陌生二维码的，都建议先暂停，联系官方客服或让子女一起核验。",
            "url": "",
        },
        {
            "id": "local-risk-2",
            "title": "看理财产品先看风险等级、期限和赎回规则",
            "source": "小享金融课堂",
            "time": today,
            "summary": "业绩比较基准不是实际收益，风险等级和能不能取出来更重要。",
            "content": "买前先确认发行机构、官方渠道、登记编码、风险等级、封闭期和赎回规则。看不懂的词可以点术语解释或问小享。",
            "url": "",
        },
        {
            "id": "local-risk-3",
            "title": "养老资金建议分成日常、医疗、应急和养老增值四个账户",
            "source": "小享四账户",
            "time": today,
            "summary": "先保障吃饭、看病和应急，再考虑国债、大额存单、货币基金等稳健增值。",
            "content": "四账户只是分账建议，不做真实资金划转。近期健康异常或支出偏高时，医疗备用和应急金要优先。",
            "url": "",
        },
    ]
    return {
        "success": True,
        "message": "外部新闻API暂不可用，已显示本地风险教育内容",
        "items": items[:limit],
        "source": "local_risk_education",
        "real_time": False,
        "fallback": True,
        "error": reason[:200],
    }


def fetch_real_market_news(limit: int = 8, force: bool = False) -> Dict[str, Any]:
    from app.services.live_news import get_news
    return get_news(limit,force)


def public_http_url(value: str) -> bool:
    try:
        parsed = urlparse(str(value or "").strip())
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            return False
        host = parsed.hostname.lower()
        if host in {"localhost", "127.0.0.1", "::1"}:
            return False
        try:
            address = ipaddress.ip_address(host)
            return not (
                address.is_private
                or address.is_loopback
                or address.is_link_local
                or address.is_reserved
            )
        except ValueError:
            return True
    except Exception:
        return False


@app.get("/news/article-content")
def news_article_content(url: str = Query(default="")) -> Dict[str, Any]:
    from app.services.live_news import find_article
    article=find_article(url=unquote(url))
    if not article:raise HTTPException(400,detail="仅支持资讯列表中已核验的来源链接")
    return {"ok":True,"title":article['title'],"source":article['source'],"date":article['time'],"paragraphs":[article['summary']],"url":article['url'],"content_kind":"publisher_headline"}


def normalize_product(raw: Dict[str, Any], source: str, idx: int) -> Dict[str, Any]:
    name = raw.get("name") or raw.get("product_name") or raw.get("prodName") or raw.get("title") or "未命名产品"
    risk = raw.get("risk") or raw.get("risk_level") or raw.get("riskLevel") or raw.get("riskName") or "以说明书为准"
    term = raw.get("term") or raw.get("duration") or raw.get("period") or raw.get("maturity") or "以说明书为准"
    min_buy = raw.get("min_buy") or raw.get("minPurchase") or raw.get("startAmount") or raw.get("minimum") or "以说明书为准"
    yield_rate = (
        raw.get("yield_rate")
        or raw.get("rate")
        or raw.get("performance_benchmark")
        or raw.get("benchmark")
        or raw.get("expectedYield")
        or "以机构披露为准"
    )
    institution = raw.get("institution") or raw.get("issuer") or raw.get("bank") or raw.get("manager") or "持牌金融机构"
    desc = raw.get("desc") or raw.get("description") or raw.get("summary") or "请以产品说明书、风险揭示书和官方登记信息为准。"
    code = raw.get("code") or raw.get("product_code") or raw.get("registration_code") or raw.get("registerCode") or ""
    return {
        "id": raw.get("id") or f"{source}-{idx}",
        "name": str(name),
        "yield_rate": str(yield_rate),
        "term": str(term),
        "min_buy": str(min_buy),
        "risk": str(risk),
        "safe": str(risk).lower() in ["低风险", "r1", "pr1"] or "低" in str(risk),
        "institution": str(institution),
        "registration_code": str(code),
        "source": source,
        "desc": str(desc),
        "compliance_tip": "理财非存款，产品有风险，投资须谨慎；最终以销售文件和官方登记信息为准。",
    }


def fetch_json_source(url: str, source: str, headers: Optional[Dict[str, str]] = None, params: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    if not url:
        return []
    try:
        with httpx.Client(timeout=DATA_API_TIMEOUT) as client:
            r = client.get(url, headers=headers or {}, params=params or {})
            r.raise_for_status()
            return [normalize_product(item, source, i + 1) for i, item in enumerate(_extract_items(r.json()))]
    except Exception:
        return []


def load_external_products() -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    if BANK_PRODUCTS_URL and BANK_API_KEY:
        token = BANK_API_KEY if BANK_API_KEY.lower().startswith("bearer ") else f"Bearer {BANK_API_KEY}"
        items.extend(fetch_json_source(BANK_PRODUCTS_URL, "licensed_bank_api", headers={BANK_API_AUTH_HEADER: token}))
    if PRODUCT_FEED_URL:
        items.extend(fetch_json_source(PRODUCT_FEED_URL, "product_feed"))
    if JUHE_FINANCE_URL and JUHE_FINANCE_KEY:
        items.extend(fetch_json_source(JUHE_FINANCE_URL, "juhe_finance", params={"key": JUHE_FINANCE_KEY}))
    return items


def product_catalog(refresh: bool = False) -> Dict[str, Any]:
    if not refresh and _PRODUCT_CACHE["payload"] and time.time() < float(_PRODUCT_CACHE["expires_at"]):
        return _PRODUCT_CACHE["payload"]
    external = load_external_products()
    items = external or PRODUCTS
    payload = {
        "items": items,
        "source": "external" if external else "compliance_reference",
        "real_time": bool(external),
        "sources": configured_market_sources(),
        "disclaimer": "本页仅做信息展示和风险教育，不构成收益承诺、投资建议或交易指令；购买前请通过官方渠道核验登记编码和销售文件。",
    }
    _PRODUCT_CACHE["payload"] = payload
    _PRODUCT_CACHE["expires_at"] = time.time() + PRODUCT_CACHE_TTL_SECONDS
    return payload

def build_chat_url(base_url: str, request_id: str = "") -> str:
    url = (base_url or "").rstrip("/")
    if not (url.endswith("/chat/completions") or url.endswith("/vivogpt/completions")):
        path = BLUELM_ENDPOINT_PATH or "/chat/completions"
        url = f"{url}/{path.lstrip('/')}"
    query_name = os.getenv("BLUELM_REQUEST_ID_QUERY", "requestId").strip()
    if request_id and query_name and query_name not in url:
        joiner = "&" if "?" in url else "?"
        url = f"{url}{joiner}{query_name}={quote(request_id)}"
    return url


def extract_llm_content(data: Dict[str, Any]) -> str:
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


def vivo_gateway_headers(provider: Dict[str, str], body: str, method: str = "POST", uri: str = "", query: Optional[Dict[str, str]] = None) -> Dict[str, str]:
    app_id = provider.get("app_id") or VIVO_APP_ID
    app_key = provider.get("app_key") or VIVO_APP_KEY or VIVO_SECRET_KEY
    timestamp = str(int(time.time()))
    nonce = uuid.uuid4().hex[:8]
    mode = os.getenv("BLUELM_SIGNATURE_MODE", "official").strip().lower()
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
    if mode == "body":
        template = os.getenv("BLUELM_SIGNATURE_TEMPLATE", "{app_id}{timestamp}{nonce}{body}")
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
        sign_text = f"{method.upper()}\n{uri or '/'}\n{canonical_query}\n{app_id}\n{timestamp}\n{signed_block}"
        signature = base64.b64encode(hmac.new(app_key.encode("utf-8"), sign_text.encode("utf-8"), hashlib.sha256).digest()).decode("utf-8")
        headers[os.getenv("BLUELM_SIGNED_HEADERS_HEADER", "X-AI-GATEWAY-SIGNED-HEADERS")] = signed_headers
    headers[signature_header] = signature
    return headers


def llm_headers_for(provider: Dict[str, str], body: str, uri: str = "", query: Optional[Dict[str, str]] = None) -> Dict[str, str]:
    has_gateway = provider.get("name") == "vivo_bluelm" and provider.get("auth_mode", "auto") in {"auto", "vivo_gateway"} and provider.get("app_id") and provider.get("app_key")
    if has_gateway:
        headers = vivo_gateway_headers(provider, body, uri=uri, query=query)
        if provider.get("api_key"):
            headers["Authorization"] = f"Bearer {provider['api_key']}"
        return headers
    return {"Authorization": f"Bearer {provider.get('api_key', '')}", "Content-Type": "application/json"}


def llm_provider_configs() -> List[Dict[str, str]]:
    all_providers = {
        "vivo_bluelm": {
            "name": "vivo_bluelm",
            "api_key": BLUELM_API_KEY,
            "app_id": VIVO_APP_ID,
            "app_key": VIVO_APP_KEY or VIVO_SECRET_KEY,
            "auth_mode": BLUELM_AUTH_MODE,
            "base_url": BLUELM_BASE_URL,
            "model": BLUELM_TEXT_MODEL,
        },
        "ark": {"name": "ark", "api_key": ARK_API_KEY or LLM_API_KEY, "base_url": ARK_BASE_URL, "model": ARK_MODEL or LLM_MODEL},
        "qwen": {"name": "qwen", "api_key": QWEN_API_KEY, "base_url": QWEN_BASE_URL, "model": QWEN_MODEL},
        "deepseek": {"name": "deepseek", "api_key": DEEPSEEK_API_KEY, "base_url": DEEPSEEK_BASE_URL, "model": DEEPSEEK_MODEL},
        "openai": {"name": "openai", "api_key": OPENAI_API_KEY, "base_url": OPENAI_BASE_URL, "model": OPENAI_MODEL},
        "llm": {"name": "llm", "api_key": LLM_API_KEY, "base_url": LLM_BASE_URL, "model": LLM_MODEL},
    }
    providers: List[Dict[str, str]] = []
    for name in LLM_PROVIDER_ORDER:
        item = all_providers.get(name)
        if not item:
            continue
        has_bearer = bool(item.get("api_key"))
        has_gateway = item.get("name") == "vivo_bluelm" and bool(item.get("app_id") and item.get("app_key"))
        if item.get("base_url") and item.get("model") and (has_bearer or has_gateway):
            providers.append(item)
    return providers


def log_llm_call(provider: str, model: str, scene: str, prompt: str, output: str = "", success: bool = True, error: str = "", latency_ms: int = 0, user_id: Optional[int] = None) -> None:
    try:
        with conn() as c:
            c.execute(
                "INSERT INTO llm_call_logs(user_id,provider,model,scene,prompt_hash,input_summary,output_summary,success,error_message,latency_ms,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                (
                    user_id,
                    provider,
                    model,
                    scene,
                    hashlib.sha256(prompt.encode("utf-8")).hexdigest(),
                    prompt[:300],
                    output[:300],
                    1 if success else 0,
                    error[:300],
                    latency_ms,
                    now_iso(),
                ),
            )
            c.commit()
    except Exception:
        pass


async def call_llm(messages: List[Dict[str, str]], temperature: float = 0.35) -> str:
    """统一走 ai_gateway，保留旧函数名给已有接口复用。"""
    res = await ai_gateway.chat_text(messages, scene="main", profile={}, user_id=None, temperature=temperature)
    if res.get("ok") is False and STRICT_LLM:
        raise HTTPException(status_code=502, detail=res.get("answer") or "大模型接口均不可用")
    return res.get("answer") or res.get("reply") or ""


def image_dimensions(content: bytes) -> Dict[str, Any]:
    if content.startswith(b"\x89PNG\r\n\x1a\n") and len(content) >= 24:
        return {"format": "png", "width": int.from_bytes(content[16:20], "big"), "height": int.from_bytes(content[20:24], "big")}
    if content.startswith(b"\xff\xd8"):
        i = 2
        while i + 9 < len(content):
            if content[i] != 0xFF:
                i += 1
                continue
            marker = content[i + 1]
            i += 2
            if marker in {0xD8, 0xD9}:
                continue
            if i + 2 > len(content):
                break
            size = int.from_bytes(content[i:i + 2], "big")
            if marker in range(0xC0, 0xC4) and i + 7 < len(content):
                return {"format": "jpeg", "width": int.from_bytes(content[i + 5:i + 7], "big"), "height": int.from_bytes(content[i + 3:i + 5], "big")}
            i += max(size, 2)
    if content[:6] in {b"GIF87a", b"GIF89a"} and len(content) >= 10:
        return {"format": "gif", "width": int.from_bytes(content[6:8], "little"), "height": int.from_bytes(content[8:10], "little")}
    if content.startswith(b"RIFF") and content[8:12] == b"WEBP":
        return {"format": "webp", "width": None, "height": None}
    return {"format": "unknown", "width": None, "height": None}


def strip_data_url(image_base64: str) -> tuple[str, str]:
    text = (image_base64 or "").strip()
    if text.startswith("data:") and "," in text:
        head, body = text.split(",", 1)
        mime = head[5:].split(";", 1)[0] or "image/jpeg"
        return body, mime
    return text, "image/jpeg"


def build_image_prompt(scene: str, extra_prompt: str = "") -> str:
    prompts = {
        "finance_product": (
            "请逐区、逐行识别这张理财产品、理财账单、银行 App、宣传页、合同或持仓截图。"
            "图片里实际出现什么就识别什么，禁止补写图片中没有的信息，禁止套用示例产品，禁止把起购金额当成实际交易金额。"
            "复杂页面中的总资产、昨日收益、累计收益、风险偏好、每条持仓、资产分布、每条交易记录都要尽量完整提取。"
            "只输出 JSON，不要 Markdown。格式为："
            "{\"image_summary\":\"\",\"extracted_text\":\"完整可见文字\","
            "\"recognized_fields\":[{\"label\":\"页面中的字段名\",\"value\":\"页面中的值\",\"section\":\"所属区域\"}],"
            "\"products\":[{\"name\":\"每个独立产品或持仓名称\",\"institution\":\"\",\"product_type\":\"\",\"risk_level\":\"\",\"term\":\"\",\"yield_expression\":\"\",\"amount\":\"\",\"income\":\"\",\"redemption_rule\":\"\"}],"
            "\"product\":{\"name\":\"\",\"institution\":\"\",\"product_type\":\"\",\"risk_level\":\"\","
            "\"term\":\"\",\"yield_expression\":\"\",\"min_buy\":\"\",\"registration_code\":\"\","
            "\"redemption_rule\":\"\",\"customer_service\":\"\"},"
            "\"holdings\":[{\"name\":\"\",\"amount\":\"\",\"income\":\"\",\"yield\":\"\"}],"
            "\"transactions\":[{\"date\":\"\",\"title\":\"\",\"type\":\"收入或支出\",\"amount\":\"\"}],"
            "\"risk_words\":[],\"risk_notes\":[]}."
            "一张图里有几个独立产品或持仓，就在 products 和 holdings 中分别返回几项，不得把不同产品的金额、收益和期限串在一起。"
            "像‘金额(元)’‘日期’‘类型’只是列标题，不能作为产品名称。没有看清的值使用空字符串或不返回该字段，不得猜测。"
        ),
        "ledger_wechat": "请识别微信/支付宝/银行账单、购物小票、手写记账、银行流水或理财交易截图。必须结合图片中的可见文字和物品含义判断“干了什么”：例如写着买菜就是蔬菜生鲜，苹果/香蕉/水果就是水果生鲜，药/医院就是医疗药品，养老金/工资/补贴到账就是日常收入，国债/基金/理财/存单买入或赎回就是理财记录。不要只返回金额；如果只看到金额也要结合旁边文字给出 title 和 category。把日常消费/日常收入与理财买入/理财收益/赎回分开。只输出 JSON，格式为 {\"items\":[...]}; 每项包含 title、amount、type(收入或支出)、category、record_kind(daily或finance)、source_text。amount 用正数。如果图片不是账单或理财信息，请输出 {\"items\":[],\"hint\":\"无关图片/无法入账\"}，不要编造金额。",
        "fraud": "请识别这张聊天、短信、海报或付款码截图是否存在金融诈骗风险。重点看陌生链接、二维码、保本高收益、催促转账、验证码、保证金、冒充客服等信号。",
        "general_image": "请识别图片内容，重点提取文字、金额、机构、二维码/链接/按钮等可见信息，并给出适合老人理解的安全提醒。",
    }
    return f"{prompts.get(scene, prompts['general_image'])}\n{extra_prompt or ''}".strip()


async def call_vision_llm(prompt: str, image_bytes: bytes, mime_type: str, scene: str, user_id: Optional[int] = None) -> Dict[str, Any]:
    meta = image_dimensions(image_bytes)
    res = await ai_gateway.chat_vision(prompt, image_bytes, mime_type or "image/jpeg", scene=scene, profile={}, user_id=user_id)
    res["image_meta"] = meta
    return res


def system_prompt(profile: Dict[str, Any]) -> str:
    return (
        "你是颐享智财的小享，定位是银发稳健理财管家。必须使用中文，语气温和，面向老年人，白话解释。"
        "原则：安全第一、操作极简、风险可控、亲情联动、合规透明。"
        "只能推荐大额存单、国债、货币基金、中低风险理财；禁止推荐股票、杠杆、私募、虚拟币、高收益骗局。"
        "不能承诺收益，不能代替用户交易，只做教育和辅助分析。"
        f"用户画像：{json.dumps(profile, ensure_ascii=False)}"
    )


def fallback_llm(text: str) -> str:
    t = text.lower()
    if any(k in text for k in ["诈骗", "陌生", "转账", "高收益", "保证金", "内幕"]):
        return "这类信息要先按高风险处理：不要点陌生链接，不要转保证金，不要相信“保本高收益”。建议截图保存，联系银行官方客服或让可信亲友协助核实。"
    if any(k in text for k in ["买什么", "理财", "推荐", "钱生钱"]):
        return "按稳健原则，可以先留足3到6个月生活费和医疗备用金；短期钱放货币基金或活期，1年以上不用的钱可看国债或大额存单，少量考虑中低风险固收理财。不要把全部钱放进一个产品。"
    if any(k in text for k in ["分配", "资产", "养老金"]):
        return "建议分成四个账户：日常开销约25%，医疗备用约20%，应急金约20%，养老增值约35%。如果近期要用钱，养老增值比例要降低。"
    return "我建议先看三件事：这笔钱什么时候要用、能不能接受波动、产品是不是正规渠道。说给我产品名称或截图里的文字，我可以帮您逐句解释。"



def fetch_wechat_session(code: str, role: str) -> Dict[str, Any]:
    """正式微信登录：使用 wx.login 返回的 code 换取 openid。失败时明确提示注册或检查配置。"""
    code = (code or "").strip()
    role = role or "elder"
    if not code:
        raise HTTPException(400, detail="微信登录失败，请先注册，或检查 wx.login 是否返回 code")
    if not WECHAT_APPID or not WECHAT_SECRET:
        raise HTTPException(503, detail="微信登录未配置 APPID/SECRET，请先使用手机号注册登录")
    try:
        with httpx.Client(timeout=DATA_API_TIMEOUT) as client:
            r = client.get(
                WECHAT_CODE2SESSION_URL,
                params={
                    "appid": WECHAT_APPID,
                    "secret": WECHAT_SECRET,
                    "js_code": code,
                    "grant_type": "authorization_code",
                },
            )
            r.raise_for_status()
            data = r.json()
        if data.get("errcode"):
            raise HTTPException(502, detail="微信登录失败，请先注册或稍后重试")
        openid = data.get("openid")
        if not openid:
            raise HTTPException(502, detail="微信登录失败，请先注册或稍后重试")
        return {
            "openid": str(openid),
            "unionid": str(data.get("unionid") or ""),
            "session_key": str(data.get("session_key") or ""),
            "source": "wechat_code2session",
            "role": role,
        }
    except Exception as e:
        if isinstance(e, HTTPException):
            raise
        raise HTTPException(502, detail="微信登录失败，请先注册或检查网络")

# ------------------------- auth -------------------------

@app.post("/auth/register")
def register(data: RegisterIn) -> Dict[str, Any]:
    init_db()
    role = normalize_role(data.role)
    bind_code = str(data.bind_code or "").strip()
    if not re.fullmatch(r"1\d{10}", data.phone):
        raise HTTPException(400, detail="手机号格式不正确")
    if len(data.password) < 4:
        raise HTTPException(400, detail="密码至少4位")
    if data.confirm and data.confirm != data.password:
        raise HTTPException(400, detail="两次密码不一致")
    if role == "child" and not re.fullmatch(r"\d{6}", bind_code):
        raise HTTPException(400, detail="子女端注册必须填写长辈提供的6位家庭绑定码")
    nickname = str(data.nickname or "").strip()[:20]
    if not nickname:
        raise HTTPException(400, detail="请先设置昵称")
    avatar = str(data.avatar or "").strip()
    try:
        with conn() as c:
            c.execute("INSERT INTO users(phone,password_hash,nickname,role,avatar,created_at) VALUES(?,?,?,?,?,?)", (data.phone, hash_password(data.password), nickname, role, avatar, now_iso()))
            uid = c.execute("SELECT id FROM users WHERE phone=?", (data.phone,)).fetchone()[0]
            profile = default_profile(nickname, role)
            profile["avatar"] = avatar
            # 子女端不填写长辈风险问卷；长辈首次登录后进入画像问卷。
            profile["onboarding_completed"] = role == "child"
            if USE_MYSQL:
                c.execute(
                    "INSERT INTO profiles(user_id,data,updated_at) VALUES(?,?,?) ON DUPLICATE KEY UPDATE data=VALUES(data),updated_at=VALUES(updated_at)",
                    (uid, json.dumps(profile, ensure_ascii=False), now_iso()),
                )
            else:
                c.execute("INSERT OR REPLACE INTO profiles(user_id,data,updated_at) VALUES(?,?,?)", (uid, json.dumps(profile, ensure_ascii=False), now_iso()))
            ensure_structured_profile(c, uid, role, profile)
            binding = {}
            if role == "child":
                binding = bind_child_with_code(c, bind_code, {"id": uid, "phone": data.phone, "nickname": nickname, "role": role}, "子女")
            c.commit()
    except Exception as e:
        if isinstance(e, sqlite3.IntegrityError) or e.__class__.__name__ == "IntegrityError":
            raise HTTPException(400, detail="手机号已注册")
        raise
    user = {"id": uid, "phone": data.phone, "nickname": nickname, "role": role}
    return {
        "token": make_token(uid),
        "user": {**user, "avatar": avatar},
        "profile": profile,
        "questionnaire_required": role != "child",
        "binding": binding if role == "child" else None,
    }

@app.post("/auth/password-login")
def password_login(data: LoginIn) -> Dict[str, Any]:
    with conn() as c:
        ensure_user_optional_columns(c)
        row = c.execute("SELECT id,phone,password_hash,nickname,role,openid,wechat_bound_at FROM users WHERE phone=?", (data.phone,)).fetchone()
    if not row or row["password_hash"] != hash_password(data.password):
        raise HTTPException(401, detail="手机号或密码不正确")
    requested_role = normalize_role(data.role) if data.role else ""
    wechat: Dict[str, Any] = {"openid_bound": bool(row["openid"])}
    if str(data.code or "").strip():
        try:
            wx_session = fetch_wechat_session(data.code, row["role"])
            openid = wx_session["openid"]
            with conn() as c:
                ensure_user_optional_columns(c)
                owner = c.execute("SELECT id FROM users WHERE openid=?", (openid,)).fetchone()
                if owner and int(owner["id"]) != int(row["id"]):
                    raise HTTPException(400, detail="当前微信已绑定其他手机号账号")
                bound_at = now_iso()
                c.execute("UPDATE users SET openid=?,wechat_bound_at=?,updated_at=? WHERE id=?", (openid, bound_at, now_iso(), row["id"]))
                c.commit()
            wechat = {
                "source": wx_session.get("source"),
                "openid_bound": True,
                "password_free_until": (datetime.fromisoformat(bound_at) + timedelta(days=7)).isoformat(timespec="seconds"),
            }
        except HTTPException as exc:
            # 微信配置或绑定冲突不应阻断已经验证成功的手机号登录。
            wechat = {"openid_bound": bool(row["openid"]), "bind_error": str(exc.detail)}
        except Exception:
            wechat = {"openid_bound": bool(row["openid"]), "bind_error": "微信绑定暂未完成，请稍后再用手机号登录重试"}
    profile = get_profile(row["id"])
    user = {"id": row["id"], "phone": row["phone"], "nickname": row["nickname"], "role": row["role"], "avatar": profile.get("avatar", "")}
    return {
        "token": make_token(row["id"]),
        "user": user,
        "profile": profile,
        "questionnaire_required": row["role"] != "child" and not bool(profile.get("onboarding_completed", True)),
        "role_corrected": bool(requested_role and requested_role != row["role"]),
        "wechat": wechat,
    }

@app.post("/auth/wechat-login")
def wechat_login(data: WechatLoginIn) -> Dict[str, Any]:
    role = normalize_role(data.role)
    wx_session = fetch_wechat_session(data.code, data.role)
    openid = wx_session["openid"]
    with conn() as c:
        ensure_user_optional_columns(c)
        row = c.execute("SELECT id,phone,password_hash,nickname,role,wechat_bound_at FROM users WHERE openid=?", (openid,)).fetchone()
        if row:
            role_corrected = bool(role and row["role"] != role)
            bound_at = str(row["wechat_bound_at"] or "")
            try:
                bound_time = datetime.fromisoformat(bound_at) if bound_at else datetime.min
            except Exception:
                bound_time = datetime.min
            expires_at = bound_time + timedelta(days=7)
            if expires_at <= datetime.now():
                phone = str(data.phone or "").strip()
                password = str(data.password or "")
                password_ok = bool(password) and hmac.compare_digest(str(row["password_hash"]), hash_password(password))
                if phone != str(row["phone"]) or not password_ok:
                    raise HTTPException(401, detail="微信免密登录已超过7天，请输入手机号和密码重新验证")
                bound_at = now_iso()
                expires_at = datetime.fromisoformat(bound_at) + timedelta(days=7)
                c.execute("UPDATE users SET wechat_bound_at=?,updated_at=? WHERE id=?", (bound_at, now_iso(), row["id"]))
                c.commit()
            profile = get_profile(row["id"])
            user = {"id": row["id"], "phone": row["phone"], "nickname": row["nickname"], "role": row["role"], "avatar": profile.get("avatar", "")}
            return {"token": make_token(row["id"]), "user": user, "profile": profile, "questionnaire_required": row["role"] != "child" and not bool(profile.get("onboarding_completed", True)), "role_corrected": role_corrected, "wechat": {"source": wx_session.get("source"), "openid_bound": True, "password_free_until": expires_at.isoformat(timespec="seconds")}}

        phone = str(data.phone or "").strip()
        password = str(data.password or "")
        if not re.fullmatch(r"1\d{10}", phone) or not password:
            raise HTTPException(404, detail="请先完成手机号注册，并在本页输入手机号和密码后再绑定微信登录")
        user_row = c.execute("SELECT id,phone,password_hash,nickname,role FROM users WHERE phone=?", (phone,)).fetchone()
        if not user_row or user_row["password_hash"] != hash_password(password):
            raise HTTPException(401, detail="手机号或密码不正确，无法绑定微信")
        role_corrected = bool(role and user_row["role"] != role)
        try:
            bound_at = now_iso()
            c.execute("UPDATE users SET openid=?,wechat_bound_at=?,updated_at=? WHERE id=?", (openid, bound_at, now_iso(), user_row["id"]))
            c.commit()
        except Exception as e:
            if isinstance(e, sqlite3.IntegrityError) or e.__class__.__name__ == "IntegrityError":
                raise HTTPException(400, detail="该微信已绑定其他账号")
            raise
    profile = get_profile(user_row["id"])
    user = {"id": user_row["id"], "phone": user_row["phone"], "nickname": user_row["nickname"], "role": user_row["role"], "avatar": profile.get("avatar", "")}
    return {"token": make_token(user_row["id"]), "user": user, "profile": profile, "questionnaire_required": user_row["role"] != "child" and not bool(profile.get("onboarding_completed", True)), "role_corrected": role_corrected, "wechat": {"source": wx_session.get("source"), "openid_bound": True, "password_free_until": (datetime.fromisoformat(bound_at) + timedelta(days=7)).isoformat(timespec="seconds")}}

@app.get("/auth/me")
def auth_me(user=Depends(current_user)) -> Dict[str, Any]:
    profile = get_profile(user["id"])
    return {"user": {**user, "avatar": profile.get("avatar", "")}, "profile": profile, "questionnaire_required": user["role"] != "child" and not bool(profile.get("onboarding_completed", True))}


def hash_security_answer(answer: str) -> str:
    normalized = re.sub(r"\s+", "", str(answer or "")).lower()
    return hmac.new(SECRET_KEY.encode("utf-8"), normalized.encode("utf-8"), hashlib.sha256).hexdigest()


@app.post("/auth/security-question")
def set_security_question(data: Dict[str, Any], user=Depends(current_user)) -> Dict[str, Any]:
    question = str(data.get("question") or "").strip()[:200]
    answer = str(data.get("answer") or "").strip()
    if len(question) < 4 or len(answer) < 2:
        raise HTTPException(400, detail="密保问题和答案不能为空，答案至少2个字")
    with conn() as c:
        if USE_MYSQL:
            c.execute(
                """
                INSERT INTO account_security_questions(user_id,question,answer_hash,created_at,updated_at)
                VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE question=VALUES(question),answer_hash=VALUES(answer_hash),updated_at=VALUES(updated_at)
                """,
                (user["id"], question, hash_security_answer(answer), now_iso(), now_iso()),
            )
        else:
            c.execute(
                "INSERT OR REPLACE INTO account_security_questions(user_id,question,answer_hash,created_at,updated_at) VALUES(?,?,?,?,?)",
                (user["id"], question, hash_security_answer(answer), now_iso(), now_iso()),
            )
        c.commit()
    return {"ok": True, "message": "密保问题已保存"}


@app.get("/auth/security-question")
def get_security_question(phone: str = Query(default="")) -> Dict[str, Any]:
    if not re.fullmatch(r"1\d{10}", str(phone or "").strip()):
        raise HTTPException(400, detail="手机号格式不正确")
    with conn() as c:
        row = c.execute(
            "SELECT q.question FROM account_security_questions q JOIN users u ON u.id=q.user_id WHERE u.phone=?",
            (phone,),
        ).fetchone()
    if not row:
        raise HTTPException(404, detail="该账号未设置密保问题，请联系家人协助处理")
    return {"ok": True, "question": row["question"]}


@app.post("/auth/password-reset")
def reset_password_with_security(data: Dict[str, Any]) -> Dict[str, Any]:
    phone = str(data.get("phone") or "").strip()
    answer = str(data.get("answer") or "").strip()
    new_password = str(data.get("new_password") or data.get("password") or "")
    if not re.fullmatch(r"1\d{10}", phone):
        raise HTTPException(400, detail="手机号格式不正确")
    if len(new_password) < 4:
        raise HTTPException(400, detail="新密码至少4位")
    with conn() as c:
        row = c.execute(
            "SELECT u.id,q.answer_hash FROM users u LEFT JOIN account_security_questions q ON q.user_id=u.id WHERE u.phone=?",
            (phone,),
        ).fetchone()
        if not row or not row["answer_hash"]:
            raise HTTPException(404, detail="该账号未设置密保问题")
        if not hmac.compare_digest(str(row["answer_hash"]), hash_security_answer(answer)):
            raise HTTPException(400, detail="密保答案不正确")
        c.execute("UPDATE users SET password_hash=?,updated_at=? WHERE id=?", (hash_password(new_password), now_iso(), row["id"]))
        c.commit()
    return {"ok": True, "message": "密码已重置，请返回登录"}

# ------------------------- profile / risk -------------------------

@app.get("/profile/me")
def profile_me(user=Depends(current_user)) -> Dict[str, Any]:
    return {"profile": get_profile(user["id"]), "user": user}


def validate_profile_patch(patch: Dict[str, Any]) -> Dict[str, Any]:
    normalized = dict(patch or {})
    if "nickname" in normalized:
        nickname = str(normalized.get("nickname") or "").strip()
        if not nickname:
            raise HTTPException(400, detail="昵称不能为空")
        normalized["nickname"] = nickname[:20]
    numeric_fields = {"age", "monthly_income", "monthly_expense", "liquid_asset", "fixed_asset", "debt"}
    for key in numeric_fields:
        if key not in normalized:
            continue
        value = normalized[key]
        if value in [None, ""]:
            normalized.pop(key, None)
            continue
        try:
            number = float(value)
        except (TypeError, ValueError):
            raise HTTPException(400, detail=f"{key} 必须填写有效数字")
        if not math.isfinite(number):
            raise HTTPException(400, detail=f"{key} 必须填写有效数字")
        if key == "age":
            if not number.is_integer() or number < 1 or number > 120:
                raise HTTPException(400, detail="年龄必须是1到120之间的整数")
            normalized[key] = int(number)
        else:
            if number < 0 or number > 1_000_000_000_000:
                raise HTTPException(400, detail=f"{key} 不能为负数且不能超过一万亿元")
            normalized[key] = round(number, 2)

    allowed_ranges = {
        _PROFILE_RANGE_KEYS[key]: set(values.values())
        for key, values in _LEGACY_QUESTIONNAIRE_RANGES.items()
    }
    for key, allowed in allowed_ranges.items():
        if key in normalized and str(normalized[key]) not in allowed:
            raise HTTPException(400, detail=f"{key} 不是有效问卷区间")
    allowed_choices = {
        "risk_preference": {"保守", "稳健", "积极", "保守型", "稳健型", "积极型", "进取型"},
        "money_time": {"1个月内", "3个月内", "半年", "半年内", "1年", "1年左右", "3年以上"},
        "child_support": {"无需协助", "部分协助", "完全协助", "按项授权", "可选添加", "已绑定子女", "协助查看风险提醒"},
    }
    for key, allowed in allowed_choices.items():
        if key in normalized and normalized[key] not in [None, ""] and str(normalized[key]) not in allowed:
            raise HTTPException(400, detail=f"{key} 不是有效选项")
    return normalized

@app.post("/profile/init")
def profile_init(data: ProfileIn, user=Depends(current_user)) -> Dict[str, Any]:
    profile = validate_profile_patch(data.data)
    save_profile(user["id"], profile)
    return {"ok": True, "profile": profile}

@app.post("/profile/basic")
def profile_basic(data: ProfileBasicIn, user=Depends(current_user)) -> Dict[str, Any]:
    profile = get_profile(user["id"])
    nickname = (data.nickname or profile.get("nickname") or user.get("nickname") or "用户").strip()[:20]
    avatar = data.avatar or profile.get("avatar", "")
    profile["nickname"] = nickname
    profile["avatar"] = avatar
    save_profile(user["id"], profile)
    with conn() as c:
        c.execute("UPDATE users SET nickname=?,avatar=? WHERE id=?", (nickname, avatar, user["id"]))
        c.commit()
    return {"ok": True, "profile": profile, "user": {**user, "nickname": nickname}}

@app.post("/profile/update")
def profile_update(data: Dict[str, Any], user=Depends(current_user)) -> Dict[str, Any]:
    profile = get_profile(user["id"])
    patch = dict(data.get("data")) if isinstance(data.get("data"), dict) else dict(data)
    patch.pop("clear_fields", None)
    patch = validate_profile_patch(patch or {})
    clear_fields = data.get("clear_fields") if isinstance(data.get("clear_fields"), list) else []
    clearable_fields = set(_PROFILE_RANGE_KEYS) | set(_PROFILE_RANGE_KEYS.values()) | {
        "income", "expense", "liquid", "fixed", "cash", "deposit_asset", "finance_asset", "financial_asset"
    }
    for key in clear_fields:
        if key in clearable_fields:
            profile.pop(key, None)
    profile.update(patch)
    save_profile(user["id"], profile)
    nickname = profile.get("nickname") or user.get("nickname") or "用户"
    with conn() as c:
        c.execute("UPDATE users SET nickname=?,avatar=? WHERE id=?", (nickname, profile.get("avatar", ""), user["id"]))
        c.commit()
    return {"ok": True, "profile": profile}


@app.post("/profile/location")
def profile_location(data: Dict[str, Any], user=Depends(current_user)) -> Dict[str, Any]:
    latitude = float(data.get("latitude") or 0)
    longitude = float(data.get("longitude") or 0)
    if not (-90 <= latitude <= 90 and -180 <= longitude <= 180) or (not latitude and not longitude):
        raise HTTPException(400, detail="位置坐标不正确")
    profile = get_profile(user["id"])
    profile["last_location"] = {
        "latitude": latitude,
        "longitude": longitude,
        "address": str(data.get("address") or "已授权位置")[:160],
        "source": str(data.get("source") or "user_authorized")[:32],
    }
    profile["location_updated_at"] = now_iso()
    save_profile(user["id"], profile)
    return {"ok": True, "location": profile["last_location"], "updated_at": profile["location_updated_at"]}

@app.get("/user/profile")
def user_profile(user=Depends(current_user)) -> Dict[str, Any]:
    profile = get_profile(user["id"])
    return {"ok": True, "profile": profile, "user": {**user, "avatar": profile.get("avatar", "")}}

@app.post("/user/profile/update")
def user_profile_update(data: Dict[str, Any], user=Depends(current_user)) -> Dict[str, Any]:
    return profile_update(data, user)

@app.post("/user/avatar/update")
def user_avatar_update(data: Dict[str, Any], user=Depends(current_user)) -> Dict[str, Any]:
    avatar = str(data.get("avatar") or data.get("avatarUrl") or "").strip()
    if not avatar:
        raise HTTPException(400, detail="头像不能为空")
    profile = get_profile(user["id"])
    profile["avatar"] = avatar
    save_profile(user["id"], profile)
    with conn() as c:
        c.execute("UPDATE users SET avatar=?,updated_at=? WHERE id=?", (avatar, now_iso(), user["id"]))
        c.commit()
    return {"ok": True, "avatar": avatar, "profile": profile}


@app.get("/media/avatars/{filename}")
def avatar_file(filename: str) -> FileResponse:
    safe_name = Path(filename).name
    path = BASE_DIR / "data" / "avatars" / safe_name
    if not path.is_file():
        raise HTTPException(404, detail="头像不存在")
    suffix = path.suffix.lower()
    media_type = {".png": "image/png", ".webp": "image/webp", ".gif": "image/gif"}.get(suffix, "image/jpeg")
    return FileResponse(str(path), media_type=media_type)


@app.post("/user/avatar/upload")
async def upload_user_avatar(file: UploadFile = File(...), user=Depends(current_user)) -> Dict[str, Any]:
    content = await file.read()
    if not content:
        raise HTTPException(400, detail="头像文件不能为空")
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(400, detail="头像不能超过5MB")
    suffix = Path(file.filename or "avatar.jpg").suffix.lower()
    if suffix not in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
        suffix = ".jpg"
    avatar_dir = BASE_DIR / "data" / "avatars"
    avatar_dir.mkdir(parents=True, exist_ok=True)
    filename = f"u{user['id']}_{hashlib.sha256(content).hexdigest()[:16]}{suffix}"
    (avatar_dir / filename).write_bytes(content)
    avatar = f"/media/avatars/{filename}"
    profile = get_profile(user["id"])
    profile["avatar"] = avatar
    save_profile(user["id"], profile)
    with conn() as c:
        c.execute("UPDATE users SET avatar=?,updated_at=? WHERE id=?", (avatar, now_iso(), user["id"]))
        c.commit()
    return {"ok": True, "avatar": avatar, "profile": profile}

@app.post("/profile/analyze")
async def profile_analyze(user=Depends(current_user)) -> Dict[str, Any]:
    profile = get_profile(user["id"])
    base = profile_risk(profile)
    # 这里调用大模型补充一句白话总结，失败时不影响接口。
    llm = await call_llm([
        {"role": "system", "content": system_prompt(profile)},
        {"role": "user", "content": "用80字以内总结我的画像和最重要的风险提醒，不要列复杂条目。"}
    ])
    base["summary"] = llm[:160]
    return base

@app.post("/risk/evaluate")
async def risk_evaluate(data: RiskIn, user=Depends(current_user)) -> Dict[str, Any]:
    profile = get_profile(user["id"])
    profile.update(data.answers)
    save_profile(user["id"], profile)
    result = profile_risk(profile)
    result["summary"] = await call_llm([
        {"role":"system", "content": system_prompt(profile)},
        {"role":"user", "content": f"根据问卷答案{json.dumps(data.answers,ensure_ascii=False)}，给出100字内风险评估结果。"}
    ])
    return result

# ------------------------- portfolio / products / chat -------------------------

@app.get("/portfolio/overview")
def portfolio_overview(user=Depends(current_user)) -> Dict[str, Any]:
    p = get_profile(user["id"])
    has_liquid = p.get("liquid_asset") not in [None, ""]
    has_fixed = p.get("fixed_asset") not in [None, ""]
    if not has_liquid and not has_fixed:
        return {
            "success": True,
            "data_complete": False,
            "total": 0,
            "total_asset": 0,
            "total_asset_text": "--",
            "total_text": "--",
            "today_gain_text": "--",
            "deposit_text": "--",
            "finance_text": "--",
            "fund_text": "--",
            "safe_ratio": 0,
        }
    liquid = float(p.get("liquid_asset") or 0)
    fixed = float(p.get("fixed_asset") or 0)
    debt = float(p.get("debt", 0) or 0)
    deposit = liquid * 0.55 + fixed * 0.25
    finance = fixed * 0.55
    fund = liquid * 0.20 + fixed * 0.08
    total = deposit + finance + fund - debt
    safe_ratio = round((deposit + liquid * 0.25) / max(total,1) * 100)
    return {
        "success": True,
        "total": total,
        "total_asset": total,
        "total_asset_text": fmt_money(total),
        "total_text": fmt_money(total),
        "today_gain_text": "+" + fmt_money(max(3, total * 0.00004)),
        "deposit_text": fmt_money(deposit),
        "finance_text": fmt_money(finance),
        "fund_text": fmt_money(fund),
        "safe_ratio": safe_ratio,
    }

@app.get("/portfolio/recommendation")
def portfolio_recommendation(user=Depends(current_user)) -> Dict[str, Any]:
    p = get_profile(user["id"])
    if not p.get("risk_preference"):
        return {"title": "小享给您推荐 ✨", "content": "请先完成画像问卷或补充真实数据，再生成个性化建议。"}
    return {
        "title": "小享给您推荐 ✨",
        "content": f"按{p.get('risk_preference')}偏好，先保留医疗备用金，再核对期限、风险等级和官方说明。"
    }

@app.post("/portfolio/assistant")
async def portfolio_assistant(data: PortfolioAskIn, user=Depends(current_user)) -> Dict[str, Any]:
    p = get_profile(user["id"])
    catalog = product_catalog()
    ans = await call_llm([
        {"role":"system", "content": system_prompt(p)},
        {"role":"user", "content": data.request_text + "\n\n可参考的合规产品信息如下，只能做适配解释，不能承诺收益或代客交易：" + json.dumps(catalog["items"][:8], ensure_ascii=False)}
    ])
    return {"answer": ans, "summary": ans[:160], "allocation": suggest_allocation(p), "products": catalog["items"][:8], "data_source": catalog["source"]}


def suggest_allocation(p: Dict[str, Any]) -> Dict[str, Any]:
    income = float(p.get("monthly_income") or 0)
    expense = float(p.get("monthly_expense") or 0)
    spare = max(0, income - expense)
    return {
        "data_complete": p.get("monthly_income") not in [None, ""] and p.get("monthly_expense") not in [None, ""],
        "monthly_spare": spare,
        "daily": round(spare * 0.25, 2),
        "medical": round(spare * 0.20, 2),
        "emergency": round(spare * 0.20, 2),
        "growth": round(spare * 0.35, 2),
    }

@app.get("/products")
def products(user=Depends(current_user)) -> Dict[str, Any]:
    return product_catalog()

@app.get("/market/sources")
def market_sources() -> Dict[str, Any]:
    return {"items": configured_market_sources()}

@app.get("/market/products")
def market_products(user=Depends(current_user)) -> Dict[str, Any]:
    return product_catalog()

@app.post("/market/refresh")
def market_refresh(user=Depends(current_user)) -> Dict[str, Any]:
    catalog = product_catalog(refresh=True)
    return {"ok": True, "source": catalog["source"], "real_time": catalog["real_time"], "count": len(catalog["items"])}


def product_verification_view(item: Dict[str, Any]) -> Dict[str, Any]:
    risk_level = str(item.get("risk") or "以说明书为准")
    return {
        "code": str(item.get("registration_code") or ""),
        "name": str(item.get("name") or "未命名产品"),
        "bank": str(item.get("institution") or "未披露机构"),
        "bank_code": "",
        "risk_level": risk_level,
        "risk_desc": f"风险等级为{risk_level}，请结合本人风险承受能力判断",
        "product_type": str(item.get("product_type") or "以产品说明书为准"),
        "yield_type": "收益不固定，不构成保本或收益承诺",
        "yield_benchmark": str(item.get("yield_rate") or "以机构披露为准"),
        "term": str(item.get("term") or "以说明书为准"),
        "term_days": None,
        "min_amount": str(item.get("min_buy") or "以说明书为准"),
        "start_date": None,
        "end_date": None,
        "status": str(item.get("status") or "请向发行机构确认"),
        "operation_mode": str(item.get("operation_mode") or "以说明书为准"),
        "raise_method": str(item.get("raise_method") or "以说明书为准"),
        "currency": str(item.get("currency") or "人民币"),
        "is_valid": True,
        "last_update": date.today().isoformat(),
    }


def product_query_result(product_code: str) -> Dict[str, Any]:
    code = str(product_code or "").strip().upper()
    if not re.fullmatch(r"C\d{13,15}", code):
        return {"ok": False, "reason_code": "invalid_format", "error": "登记编码格式不正确，应为C开头加13至15位数字"}
    catalog = product_catalog(refresh=True)
    if not catalog.get("real_time"):
        return {
            "ok": False,
            "reason_code": "not_configured",
            "error": "尚未配置真实产品数据源，当前不能确认产品真伪。请到发行机构或官方登记平台复核。",
            "source": catalog.get("source", "unconfigured"),
        }
    matched = next(
        (
            item for item in catalog.get("items", [])
            if str(item.get("registration_code") or "").strip().upper() == code
        ),
        None,
    )
    if not matched:
        return {
            "ok": False,
            "reason_code": "not_found",
            "error": "当前授权数据源没有查到该登记编码，暂时不能确认真伪。请核对编码并通过官方渠道复核。",
            "source": catalog.get("source", "external"),
        }
    product = product_verification_view(matched)
    risk_level = product["risk_level"]
    return {
        "ok": True,
        "reason_code": "verified",
        "source": matched.get("source") or catalog.get("source", "external"),
        "cached": False,
        "product": product,
        "warning": {
            "title": "风险提示",
            "content": [
                "查询到登记信息不等于产品保本，也不代表适合本人",
                "业绩比较基准不是实际收益或收益承诺",
                "购买前还要核对销售机构、风险揭示书、期限和赎回规则",
            ],
            "elderly_tips": "先确认是官方渠道，再看风险和期限；不懂就先不转账，请家人一起核对。",
        },
        "explain": {
            "risk_level": f"{risk_level}表示产品风险分级，不是收益高低保证。",
            "yield_type": "业绩比较基准只是参考，最后可能高于或低于这个数字。",
            "term": f"产品期限为{product['term']}，要确认急用钱时能否取出。",
            "operation_mode": f"运作方式为{product['operation_mode']}，具体以说明书为准。",
        },
    }


@app.post("/products/query")
def query_registered_product(data: Dict[str, Any]) -> Dict[str, Any]:
    return product_query_result(str(data.get("product_code") or data.get("code") or ""))


@app.get("/products/verify")
def verify_registered_product(code: str = Query(default="")) -> Dict[str, Any]:
    result = product_query_result(code)
    product = result.get("product") or {}
    return {
        "ok": bool(result.get("ok")),
        "is_valid": bool(result.get("ok")),
        "name": product.get("name"),
        "bank": product.get("bank"),
        "risk_level": product.get("risk_level"),
        "status": product.get("status"),
        "quick_tips": (result.get("warning") or {}).get("elderly_tips"),
        "error": result.get("error"),
        "source": result.get("source"),
    }


@app.get("/products/search")
def search_registered_products(
    bank: str = Query(default=""),
    risk_level: str = Query(default=""),
    status: str = Query(default=""),
    page: int = Query(default=1, ge=1),
    size: int = Query(default=10, ge=1, le=50),
) -> Dict[str, Any]:
    catalog = product_catalog(refresh=True)
    if not catalog.get("real_time"):
        return {
            "ok": False,
            "total": 0,
            "page": page,
            "size": size,
            "products": [],
            "error": "尚未配置真实产品数据源",
        }
    products = [product_verification_view(item) for item in catalog.get("items", [])]
    if bank:
        products = [item for item in products if bank in item["bank"]]
    if risk_level:
        products = [item for item in products if item["risk_level"].upper() == risk_level.upper()]
    if status:
        products = [item for item in products if status in item["status"]]
    total = len(products)
    start = (page - 1) * size
    return {
        "ok": True,
        "total": total,
        "page": page,
        "size": size,
        "products": products[start:start + size],
        "source": catalog.get("source", "external"),
    }


@app.get("/products/banks")
def product_bank_list() -> Dict[str, Any]:
    catalog = product_catalog(refresh=True)
    names = sorted({
        str(item.get("institution") or "").strip()
        for item in catalog.get("items", [])
        if str(item.get("institution") or "").strip()
    }) if catalog.get("real_time") else []
    return {
        "ok": bool(catalog.get("real_time")),
        "banks": [{"code": "", "name": name, "short_name": name, "type": "持牌机构"} for name in names],
        "total": len(names),
        "error": None if catalog.get("real_time") else "尚未配置真实产品数据源",
    }


@app.get("/products/example")
def product_code_examples() -> Dict[str, Any]:
    catalog = product_catalog(refresh=True)
    examples = []
    if catalog.get("real_time"):
        for item in catalog.get("items", []):
            code = str(item.get("registration_code") or "").strip()
            if code:
                examples.append({
                    "code": code,
                    "name": str(item.get("name") or ""),
                    "bank": str(item.get("institution") or ""),
                })
            if len(examples) >= 3:
                break
    return {
        "ok": True,
        "examples": examples,
        "format_hint": "登记编码一般为C开头加13至15位数字",
        "where_to_find": "可在产品说明书、银行官方App产品详情页或合同中查找",
        "source": catalog.get("source", "unconfigured"),
    }


def build_finance_advice(profile: Dict[str, Any]) -> Dict[str, Any]:
    risk = str(profile.get("risk_preference") or "")
    if not risk:
        return {
            "level": "待完善画像",
            "focus": [],
            "ratio": {},
            "recommendation": "请先完成画像问卷或补充真实数据，再生成个性化建议。",
            "disclaimer": "这是教育型信息，不构成投资建议；实际购买请到持牌机构官方渠道核验。",
        }
    age = int(profile.get("age") or 0)
    liquidity = str(profile.get("liquidity_need") or profile.get("money_time") or "")
    if "保守" in risk or age >= 70 or "随时" in liquidity:
        level = "保守学习型"
        focus = ["存款保险", "储蓄国债", "货币基金", "防诈骗"]
        ratio = {"现金备用": 55, "低风险学习": 35, "观察了解": 10}
        recommendation = "先把日常和医疗备用金放在第一位，只了解低风险、期限短、看得懂的产品。"
    elif "平衡" in risk or "积极" in risk:
        level = "稳健平衡型"
        focus = ["国债", "大额存单", "中低风险固收", "养老金融"]
        ratio = {"现金备用": 35, "稳健产品": 50, "学习观察": 15}
        recommendation = "可以了解期限搭配，但养老钱仍不碰高波动、高杠杆和不透明产品。"
    else:
        level = "稳健学习型"
        focus = ["国债", "大额存单", "货币基金", "银行理财风险等级"]
        ratio = {"现金备用": 45, "稳健产品": 45, "学习观察": 10}
        recommendation = "适合先学习正规产品怎么查、风险等级怎么看，再慢慢比较期限和流动性。"
    return {
        "level": level,
        "focus": focus,
        "ratio": ratio,
        "recommendation": recommendation,
        "disclaimer": "这是教育型信息推荐，不构成投资建议，不提供购买入口；实际购买请到持牌机构官方渠道并核验登记编码。",
    }


@app.get("/finance/advice")
def finance_advice(authorization: str = Header(default="")) -> Dict[str, Any]:
    # 尝试获取用户信息，如果没有登录则使用默认用户
    user = None
    if authorization.startswith("Bearer "):
        try:
            uid = parse_token(authorization.replace("Bearer ", "", 1).strip())
            with conn() as c:
                user = c.execute("SELECT id, phone, nickname, role FROM users WHERE id=?", (uid,)).fetchone()
        except:
            pass
    
    if user:
        profile = get_profile(user["id"])
    else:
        profile = default_profile("用户", "elder")
    
    advice = build_finance_advice(profile)
    catalog = product_catalog()
    articles = market_daily()
    # 根据用户偏好推荐资讯
    recommended_articles = recommend_by_preference(profile, articles.get("items", []))
    return {
        "advice": advice,
        "intro_products": catalog["items"][:6],
        "articles": recommended_articles,
        "data_source": catalog["source"],
        "real_time": catalog["real_time"],
        "article_source": articles.get("source", "juhe_bulletin"),
        "official_verify": [
            {"name": "中国理财网", "url": "https://www.chinawealth.com.cn/"},
            {"name": "金融产品查询平台", "url": "https://www.jrcpcx.cn/"},
        ],
    }


@app.post("/finance/advice")
async def finance_advice_by_profile(data: Dict[str, Any], user=Depends(current_user)) -> Dict[str, Any]:
    stored_profile = get_profile(user["id"])
    request_profile = data.get("profile") if isinstance(data.get("profile"), dict) else {}
    profile = {**stored_profile, **{k: v for k, v in request_profile.items() if v not in [None, ""]}}
    advice = build_finance_advice(profile)
    if advice.get("level") == "待完善画像":
        catalog = product_catalog()
        return {
            "ok": True,
            "advice": advice,
            "intro_products": catalog["items"][:6],
            "articles": [],
            "data_source": catalog["source"],
            "real_time": catalog["real_time"],
        }
    prompt = (
        "根据以下真实用户画像生成一段120字以内的适老理财认知建议。"
        "必须先讲生活费、医疗备用金和用钱时间，再讲风险等级、期限和流动性；"
        "不推荐具体股票、私募、虚拟币或杠杆，不承诺收益。没有的数据不要编造。"
        f"\n用户画像：{json.dumps(profile, ensure_ascii=False)}"
        f"\n规则分析：{json.dumps(advice, ensure_ascii=False)}"
    )
    recommendation = await call_llm([
        {"role": "system", "content": "你是颐享智财的小享，用短句和白话帮助长辈建立理财认知。"},
        {"role": "user", "content": prompt},
    ], temperature=0.3)
    if recommendation:
        advice["recommendation"] = recommendation[:500]
    catalog = product_catalog()
    return {
        "ok": True,
        "advice": advice,
        "intro_products": catalog.get("items", [])[:6] if catalog.get("real_time") else [],
        "articles": [],
        "data_source": catalog.get("source", "unconfigured"),
        "real_time": bool(catalog.get("real_time")),
    }

@app.post("/products/explain")
async def products_explain(data: ProductExplainIn, user=Depends(current_user)) -> Dict[str, Any]:
    p = get_profile(user["id"])
    prod = data.product
    ans = await call_llm([
        {"role":"system", "content": system_prompt(p)},
        {"role":"user", "content": f"用老人能听懂的话解释这个产品，包含是否安全、收益、期限、起购金额、适合什么钱买。必须说明业绩比较基准不等于实际收益，不能承诺收益，购买前要核验登记编码和产品说明书。产品：{json.dumps(prod, ensure_ascii=False)}"}
    ])
    return {"explanation": ans}

@app.post("/chat")
async def chat(data: ChatIn, user=Depends(current_user)) -> Dict[str, Any]:
    p = get_profile(user["id"])
    ans = await call_llm([
        {"role":"system", "content": system_prompt(p)},
        {"role":"user", "content": data.message}
    ])
    return {"answer": ans}

# ------------------------- ledger -------------------------

def family_ledger_user_ids(c, user: Dict[str, Any], elder_id: Optional[int] = None) -> Tuple[List[int], int]:
    """Resolve one elder household while keeping separately bound elders selectable."""
    selected_elder = int(elder_id or (user["id"] if user["role"] == "elder" else 0))
    if user["role"] == "child":
        if not selected_elder:
            row = c.execute(
                "SELECT elder_user_id FROM family_bindings WHERE child_user_id=? AND status='active' ORDER BY id DESC LIMIT 1",
                (user["id"],),
            ).fetchone()
            if not row:
                raise HTTPException(400, detail="暂无绑定长辈，请先完成家庭绑定")
            selected_elder = int(row["elder_user_id"])
        bindings = c.execute(
            "SELECT id,elder_user_id FROM family_bindings WHERE child_user_id=? AND status='active' ORDER BY id DESC",
            (user["id"],),
        ).fetchall()
        binding = None
        for candidate in bindings:
            direct_elder = int(candidate["elder_user_id"])
            if selected_elder in {direct_elder, canonical_elder_family_id(c, direct_elder)}:
                binding = candidate
                selected_elder = direct_elder
                break
        if not binding:
            raise HTTPException(403, detail="您未绑定该长辈")
        permission = c.execute(
            "SELECT enabled FROM family_permissions WHERE binding_id=? AND permission_key='view_ledger_summary'",
            (binding["id"],),
        ).fetchone()
        if permission and not bool(permission["enabled"]):
            raise HTTPException(403, detail="长辈暂未授权查看家庭账本")
    elif selected_elder != int(user["id"]):
        assert_bound_peer(c, user, selected_elder)

    elder_ids = {selected_elder}
    changed = True
    while changed:
        changed = False
        placeholders = ",".join("?" for _ in elder_ids)
        rows = c.execute(
            f"""SELECT b.elder_user_id,b.child_user_id
                FROM family_bindings b
                JOIN users a ON a.id=b.elder_user_id
                JOIN users z ON z.id=b.child_user_id
                WHERE b.status='active' AND a.role='elder' AND z.role='elder'
                  AND (b.elder_user_id IN ({placeholders}) OR b.child_user_id IN ({placeholders}))""",
            tuple(elder_ids) + tuple(elder_ids),
        ).fetchall()
        for row in rows:
            for value in (row["elder_user_id"], row["child_user_id"]):
                value = int(value)
                if value not in elder_ids:
                    elder_ids.add(value)
                    changed = True

    placeholders = ",".join("?" for _ in elder_ids)
    member_rows = c.execute(
        f"SELECT child_user_id FROM family_bindings WHERE status='active' AND elder_user_id IN ({placeholders})",
        tuple(elder_ids),
    ).fetchall()
    member_ids = set(elder_ids)
    member_ids.update(int(row["child_user_id"]) for row in member_rows)
    return sorted(member_ids), selected_elder

@app.get("/ledger/summary")
def ledger_summary(scope: str = Query(default="own"), elder_id: Optional[int] = Query(default=None), user=Depends(current_user)) -> Dict[str, Any]:
    today = date.today()
    first = today.replace(day=1).isoformat()
    with conn() as c:
        if scope == "family":
            user_ids, selected_elder = family_ledger_user_ids(c, user, elder_id)
        else:
            user_ids, selected_elder = [int(user["id"])], int(user["id"])
        placeholders = ",".join("?" for _ in user_ids)
        rows = c.execute(
            f"""SELECT r.*,u.nickname AS owner_name,u.role AS owner_role
                FROM ledger_records r JOIN users u ON u.id=r.user_id
                WHERE r.user_id IN ({placeholders})
                ORDER BY r.date DESC,r.id DESC LIMIT 160""",
            tuple(user_ids),
        ).fetchall()
    records = [dict(r) for r in rows]
    for record in records:
        record["date"] = str(record["date"])
        record["amount"] = float(record.get("amount") or 0)
        record_text = " ".join(str(record.get(k, "")) for k in ["title", "category", "description", "source"])
        record["record_kind"] = "finance" if is_finance_text(record_text) else "daily"
        record["amount_text"] = fmt_money(record["amount"])
        record["editable"] = int(record.get("user_id") or 0) == int(user["id"])
        record.update(enrich_ledger_item(record))
    month_records = [r for r in records if r["date"] >= first]
    daily_records = [r for r in records if r.get("record_kind") != "finance"]
    finance_records = [r for r in records if r.get("record_kind") == "finance"]
    income = sum(float(r["amount"]) for r in month_records if r["type"] == "收入")
    expense = sum(float(r["amount"]) for r in month_records if r["type"] == "支出")
    balance = income - expense
    category_total: Dict[str, float] = {}
    for record in month_records:
        if record["type"] != "支出":
            continue
        category = record.get("category") or record.get("category_name") or record.get("title") or "其他支出"
        category_total[category] = category_total.get(category, 0.0) + float(record["amount"])
    top_categories = [
        {"name": name, "amount": round(amount, 2), "amount_text": fmt_money(amount)}
        for name, amount in sorted(category_total.items(), key=lambda item: item[1], reverse=True)[:5]
    ]
    saving_rate = round(balance / income * 100, 1) if income > 0 else 0
    advice = "本月结余比较稳，可以继续留足医疗和生活备用金。"
    risk_tips: List[str] = []
    if expense > income and income > 0:
        advice = "本月支出已经高于收入，建议先缓一缓新增理财，把生活费和医疗备用金放前面。"
        risk_tips.append("支出高于收入时，不适合再买期限长、赎回慢的产品。")
    elif balance > 0 and balance < max(expense * 0.15, 500):
        advice = "本月还有结余，但空间不大，建议先补备用金，再考虑低风险产品。"
    if any(r["amount"] >= 20000 and r["type"] == "支出" for r in month_records):
        risk_tips.append("本月有较大额支出，若是理财或转账，请到官方渠道核验并让家人帮忙看一眼。")
    summary = {
        "income": round(income, 2),
        "expense": round(expense, 2),
        "balance": round(balance, 2),
        "income_text": fmt_money(income),
        "expense_text": fmt_money(expense),
        "balance_text": fmt_money(balance),
        "saving_rate": saving_rate,
        "top_categories": top_categories,
        "advice": advice,
        "risk_tips": risk_tips,
    }
    return {
        "scope": "family" if scope == "family" else "own",
        "selected_elder_id": selected_elder,
        "member_user_ids": user_ids,
        "summary": summary,
        "records": records,
        "daily_records": daily_records,
        "finance_records": finance_records,
        "analysis": summary,
    }

@app.post("/ledger/records")
def ledger_add(data: LedgerRecordIn, type: str = Query(default=""), user=Depends(current_user)) -> Dict[str, Any]:
    if data.text and not data.title and not data.amount:
        parsed = parse_smart_money_text(data.text)
        amount = parsed["amount"]
        record_type = parsed["type"]
        title = parsed["title"]
        category = "智能识别"
        description = data.text
    else:
        amount = parse_money_amount(data.amount)
        record_type = normalize_ledger_type(data.type or type)
        title = (data.title or data.description or data.category_name or ("收入记录" if record_type == "收入" else "支出记录")).strip()
        category = data.category_name or data.category or ("收入" if record_type == "收入" else "支出")
        description = data.description
    if amount <= 0:
        raise HTTPException(400, detail="金额必须大于0")
    with conn() as c:
        rid = insert_ledger_record(c, user["id"], record_type, title, amount, data.date, category, description, data.source or "manual")
        explicit_risk = bool(re.search(r"陌生|保证金|验证码|转账|汇款|私人账户|二维码|高收益|虚拟币|杠杆", f"{title} {description}"))
        if amount >= 20000 and record_type == "支出" and explicit_risk:
            create_alert(c, user["id"], "large_expense", "medium", "大额支出提醒", f"记录了 {fmt_money(amount)} 元支出：{title}。如涉及理财或转账，请先核验官方渠道。", "ledger")
        c.commit()
    return {"ok": True, "record": {"id": rid, "type": record_type, "title": title, "amount": amount, "date": data.date, "category": category}}


@app.put("/ledger/records/{record_id}")
def ledger_update(record_id: int, data: LedgerRecordIn, user=Depends(current_user)) -> Dict[str, Any]:
    amount = parse_money_amount(data.amount)
    if amount <= 0:
        raise HTTPException(400, detail="金额必须大于0")
    record_type = normalize_ledger_type(data.type)
    title = (data.title or data.description or data.category_name or ("收入记录" if record_type == "收入" else "支出记录")).strip()[:128]
    category = (data.category_name or data.category or ("收入" if record_type == "收入" else "支出")).strip()[:64]
    record_date = (data.date or date.today().isoformat())[:10]
    description = (data.description or "").strip()
    source = (data.source or "manual").strip()[:32]
    with conn() as c:
        row = c.execute("SELECT id FROM ledger_records WHERE id=? AND user_id=?", (record_id, user["id"])).fetchone()
        if not row:
            raise HTTPException(404, detail="记录不存在")
        c.execute(
            "UPDATE ledger_records SET type=?,title=?,amount=?,date=?,category=?,description=?,source=? WHERE id=? AND user_id=?",
            (record_type, title, amount, record_date, category, description, source, record_id, user["id"]),
        )
        c.commit()
    return {
        "ok": True,
        "record": {
            "id": record_id,
            "type": record_type,
            "title": title,
            "amount": amount,
            "date": record_date,
            "category": category,
            "description": description,
            "source": source,
        },
    }


@app.delete("/ledger/records/{record_id}")
def ledger_delete(record_id: int, user=Depends(current_user)) -> Dict[str, Any]:
    with conn() as c:
        row = c.execute("SELECT id FROM ledger_records WHERE id=? AND user_id=?", (record_id, user["id"])).fetchone()
        if not row:
            raise HTTPException(404, detail="记录不存在")
        c.execute("DELETE FROM ledger_records WHERE id=? AND user_id=?", (record_id, user["id"]))
        c.commit()
    return {"ok": True, "deleted_id": record_id}


FINANCE_KEYWORDS = ["理财", "基金", "国债", "存单", "存款", "利息", "收益", "分红", "赎回", "申购", "买入", "卖出", "净值", "年化", "债券", "保险", "养老金产品", "养老理财", "持仓", "到期"]
FINANCE_BUY_KEYWORDS = ["买了", "购买", "申购", "买入", "定投", "转入理财", "认购"]
FINANCE_INCOME_KEYWORDS = ["收益", "利息", "分红", "赎回", "卖出", "到期", "到账", "回款"]
DAILY_CATEGORY_RULES = [
    ("水果生鲜", ["水果", "苹果", "香蕉", "橙子", "梨", "葡萄", "西瓜", "草莓", "桃子"]),
    ("蔬菜生鲜", ["买菜", "菜市场", "蔬菜", "青菜", "白菜", "土豆", "番茄", "肉", "鱼", "生鲜"]),
    ("餐饮", ["餐饮", "吃饭", "早餐", "午餐", "晚餐", "饭店", "外卖", "小吃"]),
    ("超市购物", ["超市购物", "超市", "便利店", "商场"]),
    ("日用品购物", ["购物", "淘宝", "京东", "衣服", "鞋", "日用品", "生活用品", "纸巾", "洗衣液"]),
    ("医疗药品", ["医疗", "医院", "药", "药费", "门诊", "挂号", "体检", "保健"]),
    ("交通", ["交通", "公交", "地铁", "打车", "加油", "停车", "车费"]),
    ("水电煤", ["水费", "电费", "燃气", "煤气", "物业", "话费", "网费", "缴费"]),
    ("娱乐", ["娱乐", "电影", "旅游", "棋牌", "公园", "活动"]),
    ("人情往来", ["红包", "转账给", "给孙子", "礼金", "份子钱"]),
]
INCOME_CATEGORY_RULES = [
    ("养老金", ["养老金", "退休金"]),
    ("工资", ["工资", "薪水"]),
    ("补贴", ["补贴", "津贴", "报销"]),
    ("理财收益", ["收益", "利息", "分红", "回款"]),
    ("房租收入", ["房租", "租金"]),
    ("子女补贴", ["子女", "儿子", "女儿", "孩子", "家人转入"]),
    ("退款", ["退款", "退回"]),
]


def has_any(text: str, keywords: List[str]) -> bool:
    return any(k in text for k in keywords)


def is_finance_text(text: str) -> bool:
    return has_any(text, FINANCE_KEYWORDS) or bool(re.search(r"\bR[1-5]\b|业绩比较基准|七日年化|登记编码", text, re.I))


def extract_amount_from_text(text: str) -> float:
    text = str(text or "").replace(",", "")
    unit_patterns = [
        r"(?:¥|￥)?\s*([+-]?\d+(?:\.\d+)?\s*(?:万|元|块))",
        r"([零〇一二两三四五六七八九十百千万]+(?:元|块))",
    ]
    for pattern in unit_patterns:
        matches = re.findall(pattern, text)
        if matches:
            return parse_money_amount(matches[-1])
    candidates = []
    for m in re.finditer(r"(?<![A-Za-z])([+-]?\d+(?:\.\d+)?)(?!\s*(?:年|个月|月|天|日|%|％))", text):
        before = text[max(0, m.start() - 2):m.start()]
        if before.upper().endswith("R"):
            continue
        candidates.append(m.group(1))
    return parse_money_amount(candidates[-1], 0.0) if candidates else 0.0


def has_explicit_ledger_amount(text: str, record_kind: str = "daily") -> bool:
    text = str(text or "")
    money_unit = r"(?:￥|¥)?\s*[+-]?\d+(?:\.\d+)?\s*(?:万\s*)?(?:元|块)"
    chinese_money = r"[零〇一二两三四五六七八九十百千万]+(?:元|块)"
    if re.search(money_unit, text) or re.search(chinese_money, text):
        return True
    if record_kind == "finance":
        finance_amount_intent = (
            r"(?:买入|购买|申购|投入|转入|赎回|卖出|收益|利息|分红|到账|买|卖)"
            r"[^\d]{0,18}[+-]?\d+(?:\.\d+)?(?!\s*(?:天|日|个月|月|年|%|％))"
        )
        return bool(re.search(finance_amount_intent, text))
    return bool(re.search(r"[+-]?\d+(?:\.\d+)?(?!\s*(?:天|日|个月|月|年|%|％))", text))


def infer_record_type(text: str, record_kind: str) -> str:
    income_words = ["收入", "收到", "收款", "入账", "到账", "转入", "转来", "家人转入", "工资", "养老金", "退休金", "补贴", "退款", "报销", "赎回", "卖出", "收益", "利息", "分红", "回款"]
    expense_words = ["支出", "付款", "支付", "消费", "扣款", "买", "购买", "申购", "缴费", "转出", "还款"]
    if record_kind == "finance" and has_any(text, FINANCE_BUY_KEYWORDS):
        return "支出"
    if has_any(text, income_words) or re.search(r"(^|[^\d])\+\s*\d", text):
        return "收入"
    if has_any(text, expense_words) or re.search(r"(^|[^\d])-\s*\d", text):
        return "支出"
    return "支出"


def infer_daily_category(text: str, record_type: str) -> str:
    if record_type == "收入":
        for category, words in INCOME_CATEGORY_RULES:
            if has_any(text, words):
                return category
        return "其他收入"
    for category, words in DAILY_CATEGORY_RULES:
        if has_any(text, words):
            return category
    return "其他支出"


def infer_finance_category(text: str, record_type: str) -> str:
    if record_type == "收入":
        if "赎回" in text or "卖出" in text or "到期" in text:
            return "理财赎回"
        return "理财收益"
    if "基金" in text:
        return "基金买入"
    if "国债" in text:
        return "国债买入"
    if "存单" in text or "存款" in text:
        return "存款/存单"
    return "理财买入"


def enrich_ledger_item(item: Dict[str, Any]) -> Dict[str, Any]:
    enriched = dict(item)
    title = str(enriched.get("title") or enriched.get("category") or "账本记录").strip()
    category = str(enriched.get("category") or "").strip()
    record_type = str(enriched.get("type") or "支出")
    record_kind = str(enriched.get("record_kind") or "daily")
    amount = float(enriched.get("amount") or 0)
    if record_kind == "finance":
        detail = f"{record_type}明细：{title}，归类为{category or '理财记录'}，金额{fmt_money(amount)}元。"
    elif record_type == "收入":
        detail = f"收入明细：{title}，收入类别为{category or '其他收入'}，金额{fmt_money(amount)}元。"
    else:
        detail = f"消费明细：{title}，购物/支出类别为{category or '其他支出'}，金额{fmt_money(amount)}元。"
    enriched["category_name"] = category
    enriched["detail"] = enriched.get("detail") or detail
    enriched["detail_items"] = enriched.get("detail_items") or [title]
    return enriched


def clean_record_title(text: str, record_type: str, category: str) -> str:
    title = re.sub(r"(?:¥|￥)?\s*[+-]?\d+(?:\.\d+)?\s*(?:万元|万|元|块)?", "", text)
    title = re.sub(r"[零〇一二两三四五六七八九十百千万]+(?:元|块)", "", title)
    title = re.sub(r"[\"'“”‘’{}【】\[\]]", "", title)
    title = re.sub(r"(金额|实付|合计|总计|支付金额|付款金额|收款金额|价格|单价)\s*[：:]\s*", "", title)
    title = re.sub(r"\b(items?|amount|money|type|category|record_kind|date|time)\s*[:：]\s*[^,，;；]*", "", title, flags=re.I)
    title = re.sub(r"\b(title|name|merchant|payee|payer)\s*[:：]\s*", "", title, flags=re.I)
    for word in ["我", "记录", "一笔", "支出", "收入", "付款", "支付", "收到", "收款", "入账", "到账"]:
        title = title.replace(word, "")
    title = title.strip(" ：:，,。；;、-")
    if title in ["金额", "实付", "合计", "总计", "元", "金额元"]:
        title = ""
    return title[:80] or category or ("收入记录" if record_type == "收入" else "支出记录")


def record_title_from_json(rec: Dict[str, Any], record_type: str, category: str) -> str:
    title_keys = [
        "title", "merchant", "payee", "payer", "name", "商品", "项目", "内容",
        "用途", "备注", "说明", "摘要", "交易说明", "交易名称", "商户",
        "商户名称", "对方", "收款方", "付款方", "类别", "分类", "消费类型"
    ]
    for key in title_keys:
        value = str(rec.get(key) or "").strip()
        if value and value not in ["金额", "元", "无", "未知", "账单记录"]:
            return clean_record_title(value, record_type, category)
    source = json.dumps(rec, ensure_ascii=False)
    return clean_record_title(source, record_type, category)


def merge_amount_context_segments(segments: List[str]) -> List[str]:
    merged: List[str] = []
    pending_context = ""
    amount_only_re = re.compile(r"^[\s\"'“”‘’{}【】\[\]]*(金额|实付|合计|总计|支付金额|付款金额|收款金额|价格|单价)\s*[：:：]?", re.I)
    for segment in segments:
        text = (segment or "").strip()
        if not text:
            continue
        has_amount = extract_amount_from_text(text) > 0
        if has_amount:
            rest = re.sub(r"(金额|实付|合计|总计|支付金额|付款金额|收款金额|价格|单价)\s*[：:：]?", "", text, flags=re.I)
            rest = re.sub(r"(?:¥|￥)?\s*[+-]?\d+(?:\.\d+)?\s*(?:万元|万|元|块)?", "", rest)
            rest = re.sub(r"[零〇一二两三四五六七八九十百千万]+(?:元|块)", "", rest)
            rest = re.sub(r"[\s\"'“”‘’{}【】\[\]:：,，。；;、-]+", "", rest)
            amount_only = amount_only_re.search(text) or not rest
            if pending_context and amount_only:
                merged.append((pending_context + " " + text).strip())
                pending_context = ""
            else:
                if pending_context:
                    merged.append(pending_context)
                    pending_context = ""
                merged.append(text)
            continue
        cleaned = re.sub(r"[\s\"'“”‘’{}【】\[\]:：,，。；;]+", "", text)
        if cleaned and not amount_only_re.fullmatch(cleaned):
            if pending_context:
                merged.append(pending_context)
            pending_context = text
    if pending_context:
        merged.append(pending_context)
    return merged


def infer_product_name(text: str, title: str) -> str:
    name = title or text
    for word in ["买了", "购买", "申购", "买入", "赎回", "卖出", "收益", "利息", "分红", "理财投资", "养老"]:
        name = name.replace(word, "")
    return name.strip(" ：:，,。；;、-")[:80]


def split_ledger_segments(text: str) -> List[str]:
    chunks = [p.strip() for p in re.split(r"[\n；;]+", text or "") if p.strip()]
    segments: List[str] = []
    for chunk in chunks or ([text.strip()] if text and text.strip() else []):
        amount_count = len(re.findall(r"(?:¥|￥)?\s*\d+(?:\.\d+)?\s*(?:万|元|块)?", chunk))
        if amount_count > 1:
            segments.extend([p.strip() for p in re.split(r"[，,。]+", chunk) if p.strip()])
        else:
            segments.append(chunk)
    return segments


def parse_json_ledger_items(text: str) -> List[Dict[str, Any]]:
    raw = (text or "").strip()
    raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw, flags=re.I | re.S).strip()
    candidates = [raw]
    for open_ch, close_ch in [("[", "]"), ("{", "}")]:
        if open_ch in raw and close_ch in raw:
            candidates.append(raw[raw.find(open_ch):raw.rfind(close_ch) + 1])
    for candidate in candidates:
        try:
            payload = json.loads(candidate)
        except Exception:
            continue
        records = payload.get("items") if isinstance(payload, dict) else payload
        if not isinstance(records, list):
            records = [payload] if isinstance(payload, dict) else []
        items = []
        for rec in records:
            if not isinstance(rec, dict):
                continue
            rough_text = json.dumps(rec, ensure_ascii=False)
            context_text = " ".join(
                str(rec.get(k) or "")
                for k in ["title", "merchant", "payee", "payer", "name", "商品", "项目", "内容", "用途", "备注", "说明", "摘要", "交易说明", "交易名称", "商户", "商户名称", "对方", "收款方", "付款方", "类别", "分类", "消费类型", "category"]
            ).strip()
            context_probe = re.sub(r"其他支出|其他收入|支出|收入|日常|记录|金额|分类|类别", "", context_text)
            tech_probe = re.sub(r"amount|money|type|category|record_kind|items?|title|name|merchant|payee|date|time|source_text|金额|收支|分类|类别|识别原文|原文|其他支出|其他收入|支出|收入|日常|记录", "", rough_text, flags=re.I)
            if not re.search(r"[\u4e00-\u9fa5A-Za-z]", context_probe) and not re.search(r"[\u4e00-\u9fa5A-Za-z]", tech_probe):
                continue
            record_kind = "finance" if is_finance_text(rough_text) else "daily"
            amount_raw = rec.get("amount") or rec.get("money") or rec.get("金额") or rec.get("支付金额") or rec.get("实付") or rec.get("合计")
            amount = parse_money_amount(amount_raw)
            record_type = normalize_ledger_type(rec.get("type") or rec.get("direction") or rec.get("收支"))
            if not (rec.get("type") or rec.get("direction") or rec.get("收支")):
                raw_amount_text = str(amount_raw or "")
                if raw_amount_text.strip().startswith("+"):
                    record_type = "收入"
                elif raw_amount_text.strip().startswith("-"):
                    record_type = "支出"
            category = str(
                rec.get("category") or rec.get("分类") or rec.get("类别") or
                (infer_finance_category(rough_text, record_type) if record_kind == "finance" else infer_daily_category(rough_text, record_type))
            )
            title = record_title_from_json(rec, record_type, category)
            if amount <= 0:
                continue
            items.append({
                "time": str(rec.get("time") or rec.get("date") or now_iso().replace("T", " ")),
                "type": record_type,
                "title": title[:80],
                "amount": amount,
                "payee": str(rec.get("payee") or rec.get("merchant") or ""),
                "category": category,
                "record_kind": record_kind,
                "product_name": infer_product_name(title, title) if record_kind == "finance" else "",
                "source_text": json.dumps(rec, ensure_ascii=False),
                "confidence": 0.88,
            })
        if items:
            return items
    return []


def extract_loose_field(text: str, keys: List[str], stop_keys: List[str]) -> str:
    key_pattern = "|".join(re.escape(k) for k in keys)
    stop_pattern = "|".join(re.escape(k) for k in stop_keys)
    pattern = rf"(?:^|[,，;；\n\s])(?:{key_pattern})\s*[:：]\s*(.*?)(?=(?:[,，;；\n\s]+(?:{stop_pattern})\s*[:：])|$)"
    match = re.search(pattern, text, re.I | re.S)
    if not match:
        return ""
    return match.group(1).strip(" \t\r\n,，;；。")


def parse_loose_ledger_items(text: str) -> List[Dict[str, Any]]:
    raw = (text or "").strip()
    if not re.search(r"(?:items?|title|amount|type|category|record_kind|金额|用途|分类)\s*[:：]", raw, re.I):
        return []
    normalized = raw.replace("\r\n", "\n")
    blocks = re.split(r"(?=(?:^|[,，;；\n])\s*(?:title|标题|用途|项目|商品|商户)\s*[:：])", normalized, flags=re.I)
    if len(blocks) <= 1:
        blocks = [normalized]
    items: List[Dict[str, Any]] = []
    stop_keys = [
        "items", "item", "title", "标题", "用途", "项目", "商品", "商户", "name",
        "amount", "money", "金额", "type", "收支", "direction", "category", "分类",
        "record_kind", "kind", "date", "time", "source_text"
    ]
    for block in blocks:
        text_block = block.strip(" ,，;；\n")
        if not text_block:
            continue
        amount_text = extract_loose_field(text_block, ["amount", "money", "金额", "支付金额", "实付", "合计"], stop_keys)
        amount = parse_money_amount(amount_text) or extract_amount_from_text(text_block)
        if amount <= 0:
            continue
        title_text = extract_loose_field(text_block, ["title", "标题", "用途", "项目", "商品", "商户", "name"], stop_keys)
        category_text = extract_loose_field(text_block, ["category", "分类", "类别"], stop_keys)
        type_text = extract_loose_field(text_block, ["type", "收支", "direction"], stop_keys)
        kind_text = extract_loose_field(text_block, ["record_kind", "kind"], stop_keys).lower()
        context_probe = re.sub(
            r"items?|title|amount|money|type|category|record_kind|date|time|source_text|识别原文|原文|金额|分类|类别|支出|收入|其他支出|其他收入|记录|[:：{}\"'，,;；。\s\d.+\-]+",
            "",
            text_block,
            flags=re.I,
        )
        if not (title_text or category_text) and not re.search(r"[\u4e00-\u9fa5A-Za-z]", context_probe):
            continue
        kind_source = " ".join([text_block, category_text, kind_text])
        record_kind = "finance" if kind_text == "finance" or is_finance_text(kind_source) else "daily"
        record_type = normalize_ledger_type(type_text) if type_text else infer_record_type(kind_source, record_kind)
        category = category_text or (infer_finance_category(kind_source, record_type) if record_kind == "finance" else infer_daily_category(kind_source, record_type))
        title = clean_record_title(title_text or text_block, record_type, category)
        items.append({
            "time": now_iso().replace("T", " "),
            "type": record_type,
            "title": title[:80],
            "amount": amount,
            "payee": "",
            "category": category,
            "record_kind": record_kind,
            "product_name": infer_product_name(title, title) if record_kind == "finance" else "",
            "source_text": text_block,
            "confidence": 0.82,
        })
    return items


def parse_smart_money_text(text: str) -> Dict[str, Any]:
    clean = (text or "").strip()
    record_kind = "finance" if is_finance_text(clean) else "daily"
    amount = extract_amount_from_text(clean)
    record_type = infer_record_type(clean, record_kind)
    category = infer_finance_category(clean, record_type) if record_kind == "finance" else infer_daily_category(clean, record_type)
    title = clean_record_title(clean, record_type, category)
    product_name = infer_product_name(clean, title) if record_kind == "finance" else ""
    return {
        "type": record_type,
        "title": title,
        "amount": amount,
        "category": category,
        "record_kind": record_kind,
        "is_position": bool(record_kind == "finance" and record_type == "支出" and amount > 0),
        "product_name": product_name,
        "confidence": 0.78 if amount > 0 else 0.38,
        "source_text": clean,
    }


def search_product_items(query: str, limit: int = 8, refresh: bool = False) -> List[Dict[str, Any]]:
    q = (query or "").strip().lower()
    items = product_catalog(refresh=refresh)["items"]
    if not q:
        return items[:limit]
    matched = []
    for item in items:
        haystack = " ".join(str(item.get(k, "")) for k in ["name", "institution", "registration_code", "source"]).lower()
        if q in haystack or any(part and part in haystack for part in re.split(r"\s+", q)):
            matched.append(item)
    return matched[:limit]


def numeric_from_product(item: Dict[str, Any]) -> Optional[float]:
    for key in ["current_net_value", "net_value", "unit_net_value", "nav"]:
        if item.get(key) not in [None, ""]:
            try:
                return float(item[key])
            except Exception:
                pass
    return None


def normalize_position(row: Dict[str, Any]) -> Dict[str, Any]:
    item = dict(row)
    for key in ["buy_amount", "buy_net_value", "current_net_value"]:
        item[key] = float(item.get(key) or 0)
    item["buy_date"] = str(item.get("buy_date") or "")
    item["latest_date"] = str(item.get("latest_date") or "")
    item["raw_info"] = parse_json_value(item.get("raw_info"), {})
    item["amount"] = item["buy_amount"]
    item["amount_text"] = fmt_money(item["buy_amount"])
    item["current_value"] = round(item["buy_amount"] * (item["current_net_value"] / item["buy_net_value"]), 2) if item["buy_net_value"] > 0 else item["buy_amount"]
    item["current_value_text"] = fmt_money(item["current_value"])
    if item["buy_net_value"] > 0:
        item["profit"] = round(item["buy_amount"] * (item["current_net_value"] / item["buy_net_value"] - 1), 2)
        item["profit_rate"] = round((item["current_net_value"] / item["buy_net_value"] - 1) * 100, 2)
        item["profit_status"] = "赚钱" if item["profit"] > 0 else "亏钱" if item["profit"] < 0 else "持平"
    else:
        item["profit"] = 0
        item["profit_rate"] = 0
        item["profit_status"] = "暂无净值"
    item["profit_text"] = fmt_money(item["profit"])
    raw = item.get("raw_info") if isinstance(item.get("raw_info"), dict) else {}
    product = raw.get("product") if isinstance(raw.get("product"), dict) else {}
    item["source_label"] = "图片识别" if item.get("source") == "image_recognition" else (item.get("source") or "手动记录")
    item["status_label"] = raw.get("status") or "已记录"
    item["risk_summary"] = raw.get("risk_summary") or ""
    item["elder_explanation"] = raw.get("elder_explanation") or raw.get("remark") or ""
    item["risk_level"] = raw.get("risk_level_label") or product.get("risk_level") or ""
    item["benchmark"] = raw.get("benchmark") or product.get("yield_expression") or ""
    item["term"] = raw.get("term") or product.get("term") or ""
    item["min_amount"] = raw.get("min_amount") or product.get("min_buy") or ""
    item["redeem_rule"] = raw.get("redeem_rule") or product.get("redemption_rule") or ""
    item["service_phone"] = raw.get("service_phone") or product.get("customer_service") or ""
    return item


def create_position_from_ledger_item(c, user_id: int, item: Dict[str, Any], source: str = "ledger") -> Optional[int]:
    if item.get("record_kind") != "finance" or item.get("type") != "支出" or float(item.get("amount") or 0) <= 0:
        return None
    product_name = item.get("product_name") or item.get("title") or ""
    if not product_name:
        return None
    matches = search_product_items(product_name, limit=1)
    info = matches[0] if matches else {}
    current = numeric_from_product(info) or 1.0
    c.execute(
        """
        INSERT INTO wealth_positions(
          user_id,product_name,institution,product_code,buy_amount,buy_net_value,current_net_value,
          buy_date,latest_date,source,raw_info,created_at,updated_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
        """,
        (
            user_id,
            product_name,
            info.get("institution", item.get("institution", "")),
            info.get("registration_code", item.get("product_code", "")),
            float(item.get("amount") or 0),
            current,
            current,
            date.today().isoformat(),
            date.today().isoformat(),
            info.get("source", source),
            json.dumps({**info, "ledger_item": item}, ensure_ascii=False),
            now_iso(),
            now_iso(),
        ),
    )
    return c.execute("SELECT LAST_INSERT_ID() AS id" if USE_MYSQL else "SELECT last_insert_rowid() AS id").fetchone()[0]


def create_alert(c, elder_id: int, event_type: str, level: str, title: str, detail: str, source: str = "rules") -> None:
    c.execute(
        "INSERT INTO alert_events(elder_user_id,event_type,level,title,detail,source,status,created_at) VALUES(?,?,?,?,?,?,?,?)",
        (elder_id, event_type, level, title, detail, source, "unread", now_iso()),
    )


def analyze_risk_text(text: str, profile: Optional[Dict[str, Any]] = None) -> List[Dict[str, str]]:
    return content_risk_check(text or "", profile).get("risk_flags", [])


def extract_ai_json_payload(text: str) -> Dict[str, Any]:
    raw = (text or "").strip()
    raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw, flags=re.I | re.S).strip()
    candidates = [raw]
    if "{" in raw and "}" in raw:
        candidates.append(raw[raw.find("{"):raw.rfind("}") + 1])
    for candidate in candidates:
        try:
            payload = json.loads(candidate)
            if isinstance(payload, dict):
                return payload
            if isinstance(payload, list):
                text_items = [str(item.get("text") or "").strip() for item in payload if isinstance(item, dict) and str(item.get("text") or "").strip()]
                if text_items:
                    return {
                        "extracted_text": "\n".join(text_items),
                        "recognized_fields": [
                            {"label": f"识别内容{index}", "value": value, "section": "图片文字"}
                            for index, value in enumerate(text_items, 1)
                        ],
                    }
        except Exception:
            continue
    return {}


def clean_ocr_extracted_text(value: Any) -> str:
    text = str(value or "").replace("\ufeff", "").replace("\ufffd", "").strip()
    if not text:
        return ""
    if re.search(r'["\']score["\']\s*:', text, re.I) and re.search(r'["\']text["\']\s*:', text, re.I):
        tokens = re.findall(r'["\']text["\']\s*:\s*["\']([^"\']+)["\']', text, re.I)
        tokens = [token.strip() for token in tokens if token.strip()]
        if tokens:
            text = "\n".join(tokens)
    text = re.sub(r"```(?:json)?|```", "", text, flags=re.I)
    text = re.sub(r"(?:^|\n)\s*#{1,6}\s*", "\n", text)
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    return text.strip()


def finance_visible_fields(payload: Dict[str, Any], extracted_text: str = "") -> List[Dict[str, str]]:
    fields: List[Dict[str, str]] = []
    seen = set()

    def add(label: Any, value: Any, section: Any = "") -> None:
        label_text = str(label or "").strip().strip("：:")
        if isinstance(value, (dict, list)):
            value_text = json.dumps(value, ensure_ascii=False)
        else:
            value_text = str(value if value is not None else "").strip()
        if not label_text or not value_text or value_text.lower() in {"null", "none", "undefined"}:
            return
        key = (label_text, value_text)
        if key in seen:
            return
        seen.add(key)
        fields.append({"label": label_text[:80], "value": value_text[:500], "section": str(section or "")[:80]})

    for item in payload.get("recognized_fields") or payload.get("fields") or []:
        if isinstance(item, dict):
            label = item.get("label") or item.get("name") or item.get("key")
            # OCR/视觉模型有时会返回“识别文字51”这类序号占位名；它没有业务含义，不能直接展示给用户。
            if re.fullmatch(r"(?:识别文字|文字|text|field|字段)\s*\d+", str(label or ""), re.I):
                continue
            add(label, item.get("value") or item.get("text"), item.get("section"))

    section_lists = [("持仓明细", payload.get("holdings")), ("交易记录", payload.get("transactions"))]
    labels = {
        "name": "名称", "product_name": "产品名称", "institution": "发行机构", "amount": "金额",
        "income": "收益", "yield": "收益率", "date": "日期", "title": "类型/摘要", "type": "收支类型",
        "risk_level": "风险等级", "term": "期限", "yield_expression": "收益/业绩比较基准",
        "min_buy": "起购金额", "registration_code": "登记编码", "redemption_rule": "赎回规则",
        "customer_service": "客服电话",
    }
    for section, rows in section_lists:
        if not isinstance(rows, list):
            continue
        for index, row in enumerate(rows, 1):
            if not isinstance(row, dict):
                continue
            for key, value in row.items():
                add(f"{section}{index}·{labels.get(key, key)}", value, section)

    for line in re.split(r"[\n\r]+", extracted_text or ""):
        match = re.match(r"\s*([^：:]{1,40})[：:]\s*(.+?)\s*$", line)
        if match:
            add(match.group(1), match.group(2), "识别原文")
    return fields


def semantic_statement_title(title: str, record_type: str, category: str) -> str:
    """Turn an OCR row into a short title that still describes the real transaction."""
    cleaned = clean_record_title(title, record_type, category)
    if category in {"理财收益", "理财赎回", "基金买入", "国债买入", "存款/存单", "理财买入"}:
        return cleaned or category
    if record_type == "收入":
        income_titles = {
            "工资": "工资收入",
            "养老金": "养老金收入",
            "补贴": "补贴收入",
            "房租收入": "房租收入",
            "子女补贴": "家人转入",
            "退款": "退款",
            "理财收益": "理财收益",
        }
        return income_titles.get(category, cleaned or category or "收入记录")
    if category == "蔬菜生鲜" and re.search(r"买菜|菜市场|蔬菜|青菜|白菜|土豆|番茄|生鲜", title):
        return "买菜"
    if category == "水果生鲜" and re.search(r"水果|苹果|香蕉|橙子|梨|葡萄|西瓜|草莓|桃子", title):
        return "买水果"
    return cleaned or category or "支出记录"


def parse_statement_rows(text: str) -> List[Dict[str, Any]]:
    """Parse OCR statement tables such as date/time/item/signed amount into ledger rows."""
    lines = [re.sub(r"\s+", " ", line).strip(" >›") for line in re.split(r"[\r\n]+", text or "")]
    lines = [line for line in lines if line]
    if not lines:
        return []
    year_match = re.search(r"\b(20\d{2})\s*年", text or "")
    default_year = year_match.group(1) if year_match else str(date.today().year)
    ignored = {
        "日期", "时间", "项目", "类型", "金额", "金额(元)", "金额（元）", "消费明细", "交易记录",
        "全部记录", "持仓明细", "产品名称", "相关收益", "日常消费账单", "理财账单",
    }
    date_re = re.compile(r"^(?:(20\d{2})[-/.年])?(\d{1,2})[-/.月](\d{1,2})(?:日)?$")
    time_re = re.compile(r"^\d{1,2}:\d{2}(?::\d{2})?$")
    money_re = re.compile(r"^[+\-]?\s*[¥￥]?\s*\d[\d,]*(?:\.\d+)?\s*(?:元)?$")
    rows: List[Dict[str, Any]] = []
    seen = set()
    detail_markers = [i for i, value in enumerate(lines) if value in {"消费明细", "交易记录", "收支明细", "账单明细"}]
    detail_start = min(detail_markers) if detail_markers else -1

    for index, line in enumerate(lines):
        if detail_start >= 0 and index <= detail_start:
            continue
        date_match = date_re.fullmatch(line.replace(" ", ""))
        if not date_match:
            continue
        row_year = date_match.group(1) or default_year
        month = int(date_match.group(2))
        day = int(date_match.group(3))
        if month < 1 or month > 12 or day < 1 or day > 31:
            continue
        row_date = f"{row_year}-{month:02d}-{day:02d}"
        row_time = ""
        title = ""
        amount_token = ""
        for following in lines[index + 1:index + 8]:
            compact = following.replace(" ", "")
            if date_re.fullmatch(compact):
                break
            if not row_time and time_re.fullmatch(compact):
                row_time = compact
                continue
            if money_re.fullmatch(compact) and ("¥" in compact or "￥" in compact or compact.startswith(("+", "-"))):
                amount_token = compact
                break
            if not title and following not in ignored and re.search(r"[\u4e00-\u9fa5A-Za-z]", following):
                title = following
        if not title or not amount_token:
            continue
        signed_amount = parse_money_amount(amount_token, 0.0)
        if signed_amount == 0:
            continue
        record_kind = "finance" if is_finance_text(title) else "daily"
        if amount_token.lstrip().startswith("-"):
            record_type = "支出"
        elif amount_token.lstrip().startswith("+"):
            record_type = "收入"
        else:
            record_type = infer_record_type(title, record_kind)
        amount = abs(float(signed_amount))
        category = infer_finance_category(title, record_type) if record_kind == "finance" else infer_daily_category(title, record_type)
        semantic_title = semantic_statement_title(title, record_type, category)
        key = (row_date, row_time, semantic_title, record_type, round(amount, 2))
        if key in seen:
            continue
        seen.add(key)
        rows.append(enrich_ledger_item({
            "date": row_date,
            "time": f"{row_date} {row_time or '00:00'}:00" if row_time and row_time.count(":") == 1 else f"{row_date} {row_time or '00:00:00'}",
            "title": semantic_title,
            "amount": round(amount, 2),
            "type": record_type,
            "category": category,
            "record_kind": record_kind,
            "product_name": title if record_kind == "finance" else "",
            "source_text": f"{line} {row_time} {title} {amount_token}".strip(),
            "confidence": 0.96,
        }))
    return rows


def parse_finance_product_text(text: str, profile: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    source_text = (text or "").strip()
    payload = extract_ai_json_payload(source_text)
    text = clean_ocr_extracted_text(payload.get("extracted_text") or payload.get("text") or source_text)
    product_payload = payload.get("product") if isinstance(payload.get("product"), dict) else {}

    def pick(patterns: List[str], default: str = "") -> str:
        for pattern in patterns:
            m = re.search(pattern, text, re.I | re.S)
            if m:
                value = (m.group(1) if m.lastindex else m.group(0)).strip()
                value = re.split(r"[，,。；;\n\r]", value)[0].strip()
                if value:
                    return value
        return default

    def from_payload(*keys: str) -> str:
        for key in keys:
            value = product_payload.get(key)
            if value not in [None, ""]:
                return str(value).strip()
            value = payload.get(key)
            if value not in [None, ""]:
                return str(value).strip()
        return ""

    finance_context = is_finance_text(text) or bool(product_payload or payload.get("products") or payload.get("holdings"))
    product_name = from_payload("name", "product_name") or (pick([
        r"产品名称[：:\s]*([^\n，,。；;]+)",
        r"名称[：:\s]*([^\n，,。；;]+)",
        r"([\u4e00-\u9fa5A-Za-z0-9]{2,24}(?:理财|存款|基金|债券|国债)[A-Za-z0-9\u4e00-\u9fa5]*)",
    ]) if finance_context else "")
    institution = from_payload("institution", "issuer") or pick([
        r"发行机构[：:\s]*([^\n，,。；;]+)",
        r"机构[：:\s]*([^\n，,。；;]+)",
        r"([\u4e00-\u9fa5]{2,16}(?:银行|基金|理财子|证券|保险|信托))",
    ])
    product_type = from_payload("product_type") or pick([r"产品类型[：:\s]*([^\n，,。；;]+)", r"(净值型理财|银行理财|货币基金|债券基金|结构性存款|养老理财)"])
    risk_level_text = from_payload("risk_level", "risk_level_label") or pick([r"风险等级[：:\s]*([Rr][1-5][^，,。；;\n]*)", r"(\bR[1-5]\b|低风险|中低风险|中风险|高风险)"])
    term_patterns = [r"产品期限[：:\s]*([^\n，,。；;]+)", r"期限[：:\s]*([^\n，,。；;]+)"]
    if finance_context:
        term_patterns.append(r"(?<!\d)(\d{1,3}\s*(?:天|个月))(?!\s*(?:账单|度))")
    term_text = from_payload("term") or pick(term_patterns)
    if re.fullmatch(r"20\d{2}\s*年", term_text or ""):
        term_text = ""
    benchmark_text = from_payload("yield_expression", "benchmark") or pick([r"业绩比较基准[：:\s]*([0-9.]+%\s*(?:~|-|至)?\s*[0-9.]*%?)", r"(?:年化|收益率|利率)[：:\s]*([0-9.]+%\s*(?:~|-|至)?\s*[0-9.]*%?)"])
    min_amount_text = from_payload("min_buy", "min_amount") or pick([r"起购金额[：:\s]*([0-9,.]+\s*(?:万|元))", r"起购[：:\s]*([0-9,.]+\s*(?:万|元))"])
    expected_due_date = from_payload("expected_maturity_date", "expected_due_date") or pick([r"预计到期日[：:\s]*([0-9]{4}[-/年][0-9]{1,2}[-/月][0-9]{1,2}日?)"])
    purchase_time = from_payload("purchase_time") or pick([r"申购时间[：:\s]*([^\n，,。；;]+)"])
    redeem_rule = from_payload("redemption_rule", "redeem_rule") or pick([r"赎回规则[：:\s]*([^\n。；;]+)", r"(到期后可赎回|随时赎回|封闭期内不可赎回)"])
    service_phone = from_payload("customer_service", "service_phone") or pick([r"(?:客服电话|服务热线)[：:\s]*([0-9\-]{5,20})", r"\b(9[0-9]{4}(?:-[0-9]{3,8})?)\b"])
    no_guarantee = bool(re.search(r"不承诺保本保息|不保本|非存款|产品有风险", text))
    promise_guarantee = bool(re.search(r"(?<!不承诺)(?<!不)保本保息|保证收益|无风险|稳赚", text))
    principal_guarantee = "否" if no_guarantee and not promise_guarantee else ("疑似承诺保本" if promise_guarantee else "")
    suspicious_words = [str(item).strip() for item in (payload.get("risk_words") or []) if str(item).strip()]
    for word in ["高收益", "稳赚", "保本保息", "内部渠道", "陌生链接", "老师带单", "非官方渠道", "个人账户", "虚拟币", "股票群", "返利", "限时抢购", "年化超过8%", "保证收益", "无风险", "稳健增值"]:
        if word in text and not (word == "保本保息" and no_guarantee and not promise_guarantee):
            if word not in suspicious_words:
                suspicious_words.append(word)
    risk_result = content_risk_check(text, profile)
    flags = risk_result.get("risk_flags", [])
    for word in suspicious_words:
        flags.append({"type": "suspicious_word", "level": "medium", "reason": f"识别到“{word}”话术，需核对是否为官方披露，不能只按宣传语判断安全。"})
    if no_guarantee:
        flags.append({"type": "capital_not_guaranteed", "level": "medium", "reason": "识别到理财非存款或不承诺保本保息，说明本金和收益都需要承担波动风险。"})
    if suspicious_words or no_guarantee or promise_guarantee:
        word_text = "、".join(suspicious_words) if suspicious_words else "暂无明显高风险宣传词"
        guarantee_text = "且不承诺保本保息" if no_guarantee else "仍需核验是否保本和收益来源"
        risk_summary = f"该产品为{product_type}，风险等级{risk_level_text or '未识别'}，宣传或说明中出现“{word_text}”，{guarantee_text}，建议通过官方渠道核验说明书和风险揭示书后再决定。"
    elif text:
        risk_summary = "本次识别未发现明显高风险宣传词；这只代表图片文字分析结果，不等于产品没有风险。"
    else:
        risk_summary = "图片文字未能识别清楚，请换一张清晰截图或手动输入。"
    next_steps = ["按需添加到收支", "按需添加到理财记录", "问小享解释"]
    product = {
        "name": product_name,
        "institution": institution,
        "product_type": product_type,
        "risk_level": risk_level_text,
        "term": term_text,
        "yield_expression": benchmark_text,
        "min_buy": min_amount_text,
        "registration_code": pick([r"登记编码[：:\s]*([A-Za-z0-9\-]+)"], ""),
        "expected_maturity_date": expected_due_date,
        "purchase_time": purchase_time,
        "redemption_rule": redeem_rule,
        "customer_service": service_phone,
        "capital_guarantee": principal_guarantee,
    }
    product = {key: value for key, value in product.items() if value not in [None, ""]}
    recognized_fields = finance_visible_fields(payload, text)
    known_fields = [
        ("产品名称", product_name), ("发行机构", institution), ("产品类型", product_type),
        ("风险等级", risk_level_text), ("收益/业绩比较基准", benchmark_text), ("期限", term_text),
        ("起购金额", min_amount_text), ("预计到期日", expected_due_date), ("申购时间", purchase_time),
        ("赎回规则", redeem_rule), ("客服电话", service_phone), ("是否保本", principal_guarantee),
    ]
    existing = {(item.get("label"), item.get("value")) for item in recognized_fields}
    for label, value in known_fields:
        if value and (label, value) not in existing:
            recognized_fields.append({"label": label, "value": value, "section": "关键信息"})
    holdings = payload.get("holdings") if isinstance(payload.get("holdings"), list) else []
    transactions = payload.get("transactions") if isinstance(payload.get("transactions"), list) else []
    source_products = payload.get("products") if isinstance(payload.get("products"), list) else []
    ledger_items = parse_statement_rows(text)
    payload_items = payload.get("items") if isinstance(payload.get("items"), list) else []
    for raw in payload_items + transactions:
        if not isinstance(raw, dict):
            continue
        raw_title = str(raw.get("title") or raw.get("name") or raw.get("product_name") or raw.get("category") or "").strip()
        raw_amount = parse_money_amount(raw.get("amount") or raw.get("money") or 0, 0.0)
        if not raw_title or raw_amount == 0:
            continue
        raw_kind = str(raw.get("record_kind") or ("finance" if is_finance_text(raw_title) else "daily"))
        raw_type = str(raw.get("type") or "").strip()
        if raw_type not in {"收入", "支出"}:
            raw_type = "支出" if str(raw.get("amount") or "").lstrip().startswith("-") else infer_record_type(raw_title, raw_kind)
        raw_category = str(raw.get("category") or "").strip()
        if not raw_category:
            raw_category = infer_finance_category(raw_title, raw_type) if raw_kind == "finance" else infer_daily_category(raw_title, raw_type)
        normalized_item = enrich_ledger_item({
            **raw,
            "title": semantic_statement_title(raw_title, raw_type, raw_category),
            "amount": abs(float(raw_amount)),
            "type": raw_type,
            "category": raw_category,
            "record_kind": raw_kind,
            "source_text": str(raw.get("source_text") or raw_title),
        })
        duplicate = any(
            item.get("title") == normalized_item.get("title")
            and item.get("type") == normalized_item.get("type")
            and abs(float(item.get("amount") or 0) - float(normalized_item.get("amount") or 0)) < 0.001
            for item in ledger_items
        )
        if not duplicate:
            ledger_items.append(normalized_item)
    daily_items = [item for item in ledger_items if item.get("record_kind") != "finance"]
    finance_items = [item for item in ledger_items if item.get("record_kind") == "finance"]

    products: List[Dict[str, Any]] = []
    product_seen = set()

    def add_product_card(raw: Any, source: str = "产品信息") -> None:
        if not isinstance(raw, dict):
            return
        raw_name = str(raw.get("name") or raw.get("product_name") or raw.get("title") or "").strip()
        if re.fullmatch(r"金额(?:\(元\)|（元）)?|日期|类型|产品名称|全部记录|相关收益|理财账单|理财产品|理财", raw_name, re.I):
            raw_name = ""
        inferred_type = ""
        for candidate in ["货币基金", "债券基金", "指数基金", "银行理财", "净值型理财", "国债", "存款"]:
            if candidate in raw_name:
                inferred_type = candidate
                break
        allow_shared = source != "持仓明细" or len(holdings) <= 1
        normalized = {
            "name": raw_name,
            "institution": raw.get("institution") or raw.get("issuer") or (institution if allow_shared else ""),
            "product_type": raw.get("product_type") or raw.get("type") or inferred_type or (product_type if allow_shared else ""),
            "risk_level": raw.get("risk_level") or raw.get("risk_level_label") or (risk_level_text if allow_shared else ""),
            "term": raw.get("term") or raw.get("duration") or (term_text if allow_shared else ""),
            "yield_expression": raw.get("yield_expression") or raw.get("benchmark") or raw.get("yield") or "",
            "amount": raw.get("amount") or raw.get("buy_amount") or "",
            "income": raw.get("income") or raw.get("profit") or "",
            "min_buy": raw.get("min_buy") or raw.get("min_amount") or "",
            "redemption_rule": raw.get("redemption_rule") or raw.get("redeem_rule") or "",
            "expected_maturity_date": raw.get("expected_maturity_date") or raw.get("expected_due_date") or "",
            "purchase_time": raw.get("purchase_time") or raw.get("date") or "",
            "registration_code": raw.get("registration_code") or raw.get("product_code") or "",
            "customer_service": raw.get("customer_service") or raw.get("service_phone") or "",
            "capital_guarantee": raw.get("capital_guarantee") or raw.get("principal_guarantee") or "",
            "source_section": source,
        }
        normalized = {key: value for key, value in normalized.items() if value not in [None, ""]}
        if not normalized.get("name") and len(normalized) <= 2:
            return
        normalized_name = str(normalized.get("name") or "").strip().lower()
        if normalized_name and any(str(item.get("name") or "").strip().lower() == normalized_name for item in products):
            return
        key = (str(normalized.get("name") or ""), str(normalized.get("amount") or ""), str(normalized.get("institution") or ""))
        if key in product_seen:
            return
        product_seen.add(key)
        products.append(normalized)

    for item in source_products:
        add_product_card(item, "产品信息")
    for item in holdings:
        add_product_card(item, "持仓明细")
    if product and finance_context and not products:
        add_product_card(product, "产品信息")
    image_summary = str(payload.get("image_summary") or "").strip()
    recognized = bool(text or recognized_fields or holdings or transactions or ledger_items)
    if daily_items and not products and not finance_items:
        risk_summary = "这是日常收支账单，已按每笔消费或收入分别整理，不按理财产品处理。"
    elder_explanation = (
        f"识别到的内容涉及{product_name or product_type or '理财信息'}。"
        f"{risk_summary}业绩比较基准不是承诺收益，添加记录前请确认金额和收支方向。"
        if products or finance_items else (
            f"识别到{len(daily_items)}条日常收支，已经按用途和收支方向分别整理。请确认后再加入账本。"
            if daily_items else "这张图没有识别清楚，请换一张更清晰、文字更完整的图片。"
        )
    )
    return {
        "ok": recognized,
        "scene": "finance_product",
        "type": "finance_product",
        "image_type": "text_input",
        "extracted_text": text,
        "image_summary": image_summary,
        "recognized_fields": recognized_fields,
        "holdings": holdings,
        "transactions": transactions,
        "ledger_items": ledger_items,
        "daily_items": daily_items,
        "finance_items": finance_items,
        "content_type": "mixed" if daily_items and (finance_items or products) else ("daily" if daily_items else "finance"),
        "products": products,
        "product": product,
        "product_name": product_name,
        "issuer": institution,
        "product_type": product_type,
        "risk_level_label": risk_level_text,
        "term": term_text,
        "min_amount": min_amount_text,
        "benchmark": benchmark_text,
        "expected_due_date": expected_due_date,
        "purchase_time": purchase_time,
        "redeem_rule": redeem_rule,
        "service_phone": service_phone,
        "principal_guarantee": principal_guarantee,
        "risk_tips": [item.get("reason", "") for item in flags if item.get("reason")],
        "risk_summary": risk_summary,
        "suspicious_words": suspicious_words,
        "risk_score": risk_result.get("risk_score", 25),
        "risk_flags": flags,
        "risk_cards": risk_result.get("risk_cards", []),
        "risk_level": risk_result.get("risk_level", "low"),
        "suitability": risk_result.get("suitability", "请结合本人风险承受能力判断"),
        "plain_explanation": risk_result.get("plain_explanation", ""),
        "elder_explanation": elder_explanation,
        "suggested_actions": next_steps,
        "next_steps": next_steps,
        "message": (
            f"识别到{len(daily_items)}条日常收支、{len(finance_items)}条理财收支和{len(products)}项理财产品，请逐条确认后保存。"
            if recognized else "这张图没有识别清楚，请换一张清晰截图或手动输入。"
        ),
    }


def build_ledger_parse_payload(text: str, items: List[Dict[str, Any]], source: str = "text", warnings: Optional[List[str]] = None) -> Dict[str, Any]:
    items = [enrich_ledger_item(item) for item in items]
    daily_items = [item for item in items if item.get("record_kind") != "finance"]
    finance_items = [item for item in items if item.get("record_kind") == "finance"]
    daily_income = sum(float(item.get("amount") or 0) for item in daily_items if item.get("type") == "收入")
    daily_expense = sum(float(item.get("amount") or 0) for item in daily_items if item.get("type") == "支出")
    finance_income = sum(float(item.get("amount") or 0) for item in finance_items if item.get("type") == "收入")
    finance_expense = sum(float(item.get("amount") or 0) for item in finance_items if item.get("type") == "支出")
    risk_flags = analyze_risk_text(text)
    summary = {
        "daily_count": len(daily_items),
        "finance_count": len(finance_items),
        "daily_income": round(daily_income, 2),
        "daily_expense": round(daily_expense, 2),
        "finance_income": round(finance_income, 2),
        "finance_expense": round(finance_expense, 2),
        "daily_income_text": fmt_money(daily_income),
        "daily_expense_text": fmt_money(daily_expense),
        "finance_income_text": fmt_money(finance_income),
        "finance_expense_text": fmt_money(finance_expense),
    }
    if items:
        message = f"识别到 {len(daily_items)} 条日常收支、{len(finance_items)} 条理财记录。请确认后写入账本。"
        hint = "理财记录会单独进入持仓/收益分析，日常购物和收入会进入生活账本。"
    elif is_finance_text(text):
        message = "看到了理财相关内容，但没有识别到明确金额，暂不能入账。"
        hint = "请补充买入金额、赎回金额或收益金额，也可以先到钱生钱页面做风险核验。"
    elif (text or "").strip():
        message = "没有识别到可入账的收支记录。"
        hint = "这可能不是账单或理财截图。请上传包含金额、商户/产品名、收入或支出方向的图片，或直接输入如“买菜35元”。"
    else:
        message = "没有识别到文字内容。"
        hint = "请重新上传更清晰的账单截图，或手动输入文字。"
    return {
        "items": items,
        "daily_items": daily_items,
        "finance_items": finance_items,
        "duplicate_items": [],
        "need_confirm": True,
        "source": source,
        "summary": summary,
        "risk_flags": risk_flags,
        "warnings": warnings or [],
        "message": message,
        "hint": hint,
        "irrelevant": not items and not is_finance_text(text or ""),
    }


def has_meaningful_ledger_context(text: str) -> bool:
    probe = re.sub(
        r"items?|item|title|amount|money|type|category|record_kind|kind|date|time|source_text|raw_text|"
        r"识别原文|原文|金额|收支|分类|类别|支出|收入|其他支出|其他收入|日常|记录|"
        r"[:：{}[\]\"'，,;；。\s\d.+\-]+",
        "",
        text or "",
        flags=re.I,
    )
    return bool(re.search(r"[\u4e00-\u9fa5A-Za-z]", probe))


def parse_ledger_items(text: str, source: str = "text") -> Dict[str, Any]:
    json_items = parse_json_ledger_items(text)
    warnings: List[str] = []
    if json_items:
        return build_ledger_parse_payload(text, json_items, source, warnings)
    loose_items = parse_loose_ledger_items(text)
    if loose_items:
        return build_ledger_parse_payload(text, loose_items, source, warnings)
    if is_finance_text(text) and not has_explicit_ledger_amount(text, "finance"):
        warnings.append("这段内容像是理财咨询，但没有明确买入、赎回或收益金额，已暂不入账。")
        return build_ledger_parse_payload(text, [], source, warnings)
    items = []
    for line in merge_amount_context_segments(split_ledger_segments(text)):
        if not has_meaningful_ledger_context(line):
            continue
        if is_finance_text(line) and not has_explicit_ledger_amount(line, "finance"):
            warnings.append(f"“{line[:28]}”像是理财信息，但没有明确买入、赎回或收益金额，已暂不入账。")
            continue
        parsed = parse_smart_money_text(line)
        if parsed["amount"] <= 0:
            if is_finance_text(line):
                warnings.append(f"“{line[:28]}”像是理财信息，但缺少明确金额，已暂不入账。")
            continue
        items.append({
            "time": now_iso().replace("T", " "),
            "type": parsed["type"],
            "title": parsed["title"],
            "amount": parsed["amount"],
            "payee": "",
            "category": parsed["category"],
            "record_kind": parsed["record_kind"],
            "product_name": parsed["product_name"],
            "source_text": parsed["source_text"],
            "confidence": parsed["confidence"],
        })
    return build_ledger_parse_payload(text, items, source, warnings)


def default_questionnaire_payload() -> Dict[str, Any]:
    return {
        "title": "稳健养老理财风险问卷",
        "description": "用于了解您的用钱时间和风险承受能力。",
        "questions": [
            {"key": "liquidity_need", "title": "这笔钱多久可能会用到？", "desc": "越快要用的钱，越要容易取出。", "terms": ["流动性", "期限"], "options": [{"value": "随时", "label": "随时可能用", "score": 1, "tip": "优先现金和活期"}, {"value": "半年", "label": "半年内可能用", "score": 2, "tip": "期限不要太长"}, {"value": "一年以上", "label": "一年以上不用", "score": 3, "tip": "可了解国债或存单"}]},
            {"key": "risk_preference", "title": "看到本金短期波动，您会不会担心？", "desc": "养老钱更适合看得懂、睡得着的安排。", "terms": ["净值", "风险等级"], "options": [{"value": "保守", "label": "很担心", "score": 1, "tip": "低风险优先"}, {"value": "稳健", "label": "能接受一点", "score": 2, "tip": "稳健搭配"}, {"value": "平衡", "label": "能接受小幅波动", "score": 3, "tip": "仍需分散"}]},
            {"key": "experience", "title": "您以前买过理财产品吗？", "desc": "经验越少，越要先核验和白话解释。", "terms": ["风险测评"], "options": [{"value": "没有", "label": "没有买过", "score": 1, "tip": "先学习再决定"}, {"value": "少量", "label": "买过少量", "score": 2, "tip": "看清说明书"}, {"value": "较多", "label": "比较熟悉", "score": 3, "tip": "也要防诈骗"}]},
            {"key": "phone_difficulty", "title": "您操作手机支付或理财 App 困难吗？", "desc": "操作困难时，应多用提醒和家人协同。", "terms": ["延时到账", "官方渠道"], "options": [{"value": "高", "label": "经常看不清", "score": 1, "tip": "开启大字和家人提醒"}, {"value": "中等", "label": "偶尔需要帮忙", "score": 2, "tip": "关键操作先确认"}, {"value": "低", "label": "基本没问题", "score": 3, "tip": "仍需核验"}]},
            {"key": "emergency_months", "title": "您准备了几个月生活和医疗备用金？", "desc": "备用金不足时，不宜买期限长的产品。", "terms": ["备用金"], "options": [{"value": "1", "label": "不到3个月", "score": 1, "tip": "先补备用金"}, {"value": "6", "label": "3到6个月", "score": 2, "tip": "较稳妥"}, {"value": "12", "label": "6个月以上", "score": 3, "tip": "可做期限搭配"}]},
            {"key": "child_support", "title": "您愿意让家人收到高风险提醒吗？", "desc": "家人只能看授权摘要，不能操作您的钱。", "terms": ["家庭协同"], "options": [{"value": "需要", "label": "愿意", "score": 3, "tip": "风险时多一层保护"}, {"value": "可选添加", "label": "需要时再说", "score": 2, "tip": "可先生成绑定码"}, {"value": "不需要", "label": "暂时不需要", "score": 1, "tip": "也请保留官方电话"}]},
        ],
    }


@app.post("/ledger/smart-input")
async def ledger_smart_input(data: SmartLedgerIn, user=Depends(current_user)) -> Dict[str, Any]:
    raw_text = (data.recognized_text or data.text or "").strip()
    if not raw_text:
        raise HTTPException(400, detail="请先输入文字，或上传语音/图片识别后的文字")
    parsed = parse_ledger_items(raw_text, source=f"smart_{data.input_type}")
    if not parsed.get("items") and is_finance_text(raw_text):
        profile = get_profile(user["id"])
        finance_parse = parse_finance_product_text(raw_text, profile)
        product = finance_parse.get("product") or {}
        prompt = (
            "你是适老化养老理财小程序的小享助手。请只根据用户输入做白话解释和风险核验，"
            "不要虚构产品数据，不要推荐购买，不要承诺收益。"
            "如果缺少金额、期限、风险等级、登记编码或官方渠道，要明确提醒用户补充。"
            "输出不超过180字，分成：识别到什么、要注意什么、下一步怎么做。"
            f"\n用户输入：{raw_text}"
            f"\n初步识别：{json.dumps(product, ensure_ascii=False)}"
        )
        try:
            answer = await call_llm([
                {"role": "system", "content": "你是小享，负责养老理财场景的适老化解释和风险提醒。"},
                {"role": "user", "content": prompt},
            ], temperature=0.25)
        except Exception:
            answer = finance_parse.get("elder_explanation") or "这段内容像是理财咨询，但缺少可直接入账的金额。请先确认官方渠道、风险等级、期限、登记编码和是否承诺收益。"
        merged_flags = []
        seen_flags = set()
        for flag in (parsed.get("risk_flags") or []) + (finance_parse.get("risk_flags") or []):
            key = (flag.get("type"), flag.get("level"), flag.get("reason"))
            if key in seen_flags:
                continue
            seen_flags.add(key)
            merged_flags.append(flag)
        parsed["risk_flags"] = merged_flags
        parsed["analysis"] = {
            "type": "finance_consultation",
            "title": "理财咨询识别",
            "answer": answer,
            "product": product,
            "risk_flags": merged_flags,
        }
        parsed["message"] = "已识别为理财咨询，建议先阅读说明，确认金额后再入账。"
        parsed["hint"] = "如果要记账，请补充买入、赎回或收益金额；如果还不确定，可以继续问小享。"
    with conn() as c:
        c.execute(
            "INSERT INTO input_records(user_id,input_type,raw_text,parsed_json,created_at) VALUES(?,?,?,?,?)",
            (user["id"], data.input_type, raw_text, json.dumps(parsed, ensure_ascii=False), now_iso()),
        )
        record_ids = []
        position_ids = []
        for item in parsed.get("items", []):
            rid = insert_ledger_record(
                c,
                user["id"],
                item.get("type") or "支出",
                item.get("title") or "智能记账",
                float(item.get("amount") or 0),
                date.today().isoformat(),
                item.get("category", ""),
                item.get("source_text", raw_text),
                f"smart_{data.input_type}",
            )
            if rid:
                record_ids.append(rid)
            pid = create_position_from_ledger_item(c, user["id"], item, f"smart_{data.input_type}")
            if pid:
                position_ids.append(pid)
        for flag in parsed.get("risk_flags", []):
            if flag.get("level") in {"medium", "high"}:
                create_alert(c, user["id"], flag["type"], flag["level"], "智能记账风险提醒", flag["reason"], "ledger_smart")
        c.commit()
    imported = len(record_ids)
    message = f"已记录 {imported} 条，其中日常 {len(parsed.get('daily_items', []))} 条、理财 {len(parsed.get('finance_items', []))} 条。"
    if not imported:
        message = parsed.get("message") or "没有识别到可入账记录。"
    return {**parsed, "ok": True, "parsed": parsed, "record_ids": record_ids, "position_ids": position_ids, "position_id": position_ids[0] if position_ids else None, "imported_count": imported, "message": message}


@app.get("/risk/questionnaire")
def risk_questionnaire(mode: str = Query(default="default"), user=Depends(current_user)) -> Dict[str, Any]:
    payload = default_questionnaire_payload()
    payload["mode"] = mode
    return payload


@app.post("/risk/questionnaire/generate")
async def risk_questionnaire_generate(data: Dict[str, Any] = None, user=Depends(current_user)) -> Dict[str, Any]:
    payload = default_questionnaire_payload()
    payload["title"] = "AI 生成稳健养老风险问卷"
    payload["source_model"] = "local_safe_fallback"
    with conn() as c:
        c.execute(
            "INSERT INTO questionnaire_templates(user_id,template_type,title,description,source_model,created_at) VALUES(?,?,?,?,?,?)",
            (user["id"], "ai_generated", payload["title"], payload["description"], payload["source_model"], now_iso()),
        )
        tid = c.execute("SELECT LAST_INSERT_ID() AS id" if USE_MYSQL else "SELECT last_insert_rowid() AS id").fetchone()[0]
        for idx, q in enumerate(payload["questions"], 1):
            desc_col = "`desc`" if USE_MYSQL else "desc"
            c.execute(
                f"INSERT INTO questionnaire_questions(template_id,question_key,title,{desc_col},terms_json,options_json,order_no) VALUES(?,?,?,?,?,?,?)",
                (tid, q["key"], q["title"], q.get("desc", ""), json.dumps(q.get("terms", []), ensure_ascii=False), json.dumps(q.get("options", []), ensure_ascii=False), idx),
            )
        c.commit()
    payload["template_id"] = tid
    return payload


@app.post("/risk/evaluate-ai")
async def risk_evaluate_ai(data: QuestionnaireSubmitIn, user=Depends(current_user)) -> Dict[str, Any]:
    profile = get_profile(user["id"])
    profile.update(data.answers)
    save_profile(user["id"], profile)
    result = profile_risk(profile)
    with conn() as c:
        ensure_structured_profile(c, user["id"], user["role"], profile)
        c.execute("INSERT INTO questionnaire_answers(user_id,template_id,answers_json,created_at) VALUES(?,?,?,?)", (user["id"], data.template_id, json.dumps(data.answers, ensure_ascii=False), now_iso()))
        c.execute(
            "INSERT INTO risk_assessments(user_id,template_id,risk_score,risk_level,summary,suggestion_json,model_used,created_at) VALUES(?,?,?,?,?,?,?,?)",
            (user["id"], data.template_id, result["risk_score"], result["risk_level"], result["summary"], json.dumps(result, ensure_ascii=False), "local_safe_fallback", now_iso()),
        )
        c.commit()
    return result


@app.get("/risk/history")
def risk_history(user=Depends(current_user)) -> Dict[str, Any]:
    with conn() as c:
        rows = c.execute("SELECT * FROM risk_assessments WHERE user_id=? ORDER BY id DESC LIMIT 20", (user["id"],)).fetchall()
    return {"items": [dict(r) for r in rows]}


@app.post("/finance/parse-input")
def finance_parse_input(data: FinanceParseIn, user=Depends(current_user)) -> Dict[str, Any]:
    profile = get_profile(user["id"])
    parsed = parse_finance_product_text(data.text, profile)
    with conn() as c:
        c.execute(
            "INSERT INTO input_attachments(user_id,scene,input_type,extracted_text,parsed_json,created_at) VALUES(?,?,?,?,?,?)",
            (user["id"], "finance_product", data.source or "text", data.text, json.dumps(parsed, ensure_ascii=False), now_iso()),
        )
        for flag in parsed["risk_flags"]:
            if flag.get("level") in {"medium", "high"}:
                create_alert(c, user["id"], flag["type"], flag["level"], "理财产品风险提醒", flag["reason"], "finance_parse")
        c.commit()
    return parsed


@app.post("/finance/risk-check")
def finance_risk_check(data: Dict[str, Any], user=Depends(current_user)) -> Dict[str, Any]:
    text = str(data.get("text") or data.get("content") or data.get("product_text") or json.dumps(data, ensure_ascii=False))
    profile = get_profile(user["id"])
    result = content_risk_check(text, profile)
    flags = result.get("risk_flags", [])
    with conn() as c:
        for flag in flags:
            create_alert(c, user["id"], flag["type"], flag["level"], "风险核验提醒", flag["reason"], "risk_check")
        c.commit()
    return {
        **result,
        "success": True,
        "safe_note": "只做解释、核验和提醒，不提供购买入口。",
    }


@app.post("/risk/behavior-check")
def risk_behavior_check(data: Dict[str, Any], user=Depends(current_user)) -> Dict[str, Any]:
    profile = get_profile(user["id"])
    result = behavior_risk_check(data or {}, profile)
    if result.get("child_notify"):
        with conn() as c:
            create_alert(
                c,
                user["id"],
                "behavior_risk",
                result.get("risk_level", "medium"),
                "行为风控提醒",
                result.get("elder_message", "存在需要核验的操作"),
                "behavior_check",
            )
            c.commit()
    return {"success": True, **result}


@app.post("/image/recognize")
async def image_recognize(file: UploadFile = File(...), scene: str = Query(default="general_image"), prompt: str = Query(default=""), user=Depends(current_user)) -> Dict[str, Any]:
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="图片不能为空")
    digest = hashlib.sha256(content).hexdigest()
    upload_dir = BASE_DIR / "data" / "uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)
    safe_name = f"{digest[:16]}_{Path(file.filename or 'upload.jpg').name}"
    path = upload_dir / safe_name
    path.write_bytes(content)
    result = await call_vision_llm(build_image_prompt(scene, prompt), content, file.content_type or "image/jpeg", scene, user["id"])
    flags = analyze_risk_text(result.get("answer", ""), get_profile(user["id"]))
    with conn() as c:
        c.execute(
            "INSERT INTO input_attachments(user_id,scene,input_type,file_path,original_name,mime_type,size,sha256,extracted_text,parsed_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
            (user["id"], scene, "image", str(path), file.filename or "", file.content_type or "", len(content), digest, result.get("answer", ""), json.dumps({**result, "risk_flags": flags}, ensure_ascii=False), now_iso()),
        )
        for flag in flags:
            if flag.get("level") in {"medium", "high"}:
                create_alert(c, user["id"], flag["type"], flag["level"], "图片识别风险提醒", flag["reason"], "image_recognize")
        c.commit()
    return {**result, "risk_flags": flags, "attachment_sha256": digest}


@app.post("/image/recognize-base64")
async def image_recognize_base64(data: ImageRecognizeIn, user=Depends(current_user)) -> Dict[str, Any]:
    body, inferred_mime = strip_data_url(data.image_base64)
    if not body:
        raise HTTPException(status_code=400, detail="image_base64 不能为空")
    try:
        content = base64.b64decode(body, validate=False)
    except Exception:
        raise HTTPException(status_code=400, detail="image_base64 不是有效图片数据")
    result = await call_vision_llm(build_image_prompt(data.scene, data.prompt), content, data.mime_type or inferred_mime, data.scene, user["id"])
    flags = analyze_risk_text(result.get("answer", ""), get_profile(user["id"]))
    return {**result, "risk_flags": flags}


def fallback_finance_image_parse(filename: str = "", profile: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    return {
        "ok": False,
        "scene": "finance_product",
        "image_type": "unrecognized_image",
        "extracted_text": "",
        "recognized_fields": [],
        "product": {},
        "holdings": [],
        "transactions": [],
        "risk_flags": [],
        "risk_tips": [],
        "fallback": True,
        "message": "这张图没有识别清楚，请换一张文字更清晰的截图，或手动输入图片上的内容。",
    }


def finance_payload_from_local_ocr(ocr: Dict[str, Any]) -> Dict[str, Any]:
    texts = [str(item.get("text") or "").strip() for item in (ocr.get("lines") or []) if str(item.get("text") or "").strip()]
    section = "页面内容"
    fields: List[Dict[str, str]] = []
    section_heads = {"持仓明细", "资产分布", "交易记录", "产品详情", "风险提示", "账户概览"}
    known_labels = {
        "产品名称", "发行机构", "产品类型", "风险等级", "产品期限", "期限", "起购金额",
        "业绩比较基准", "预计到期日", "申购时间", "赎回规则", "客服电话", "持有金额",
        "相关收益", "日期", "类型", "金额（元）", "金额(元)", "总资产（元）", "总资产(元)",
        "昨日收益（元）", "累计收益（元）", "风险偏好",
    }
    consumed = set()
    for index, line in enumerate(texts):
        clean = line.strip(" >›")
        if clean in section_heads:
            section = clean
            consumed.add(index)
            continue
        pair = re.match(r"^([^：:]{1,24})[：:]\s*(.+)$", clean)
        if pair:
            fields.append({"label": pair.group(1).strip(), "value": pair.group(2).strip(), "section": section})
            consumed.add(index)
            continue
        normalized_label = clean.replace(" ", "")
        if normalized_label in known_labels:
            value_index = next((pos for pos in range(index + 1, min(index + 4, len(texts))) if pos not in consumed and texts[pos].strip(" >›").replace(" ", "") not in known_labels and texts[pos].strip(" >›") not in section_heads), None)
            if value_index is not None:
                fields.append({"label": clean, "value": texts[value_index].strip(" >›"), "section": section})
                consumed.update({index, value_index})

    transactions: List[Dict[str, str]] = []
    transaction_start = next((i for i, value in enumerate(texts) if "交易记录" in value), len(texts))
    for index, line in enumerate(texts[transaction_start + 1:], transaction_start + 1):
        if not re.fullmatch(r"\d{2}[-/.]\d{2}", line):
            continue
        title = ""
        amount_text = ""
        for following in texts[index + 1:index + 6]:
            if not title and re.search(r"[\u4e00-\u9fa5A-Za-z]", following) and following not in {"日期", "类型", "金额（元）", "金额 (元)"}:
                title = following.strip(" >›")
                continue
            if re.search(r"[+\-]?\s*[¥￥]?\s*\d[\d,]*(?:\.\d+)?", following) and ("¥" in following or "￥" in following or following.startswith(("+", "-"))):
                amount_text = following.strip(" >›")
                break
        if title and amount_text:
            record_type = "支出" if amount_text.lstrip().startswith("-") or re.search(r"购买|买入|定投|申购", title) else "收入"
            transactions.append({"date": line, "title": title, "type": record_type, "amount": amount_text})

    holdings: List[Dict[str, str]] = []
    holding_start = next((i for i, value in enumerate(texts) if "持仓明细" in value), -1)
    holding_end = next((i for i, value in enumerate(texts) if "交易记录" in value), len(texts))
    if holding_start >= 0:
        for index in range(holding_start + 1, holding_end):
            name = texts[index].strip(" >›")
            if not re.search(r"理财|基金|国债|存款|保险", name) or name in {"产品名称", "稳健理财"}:
                continue
            preceding = texts[max(holding_start + 1, index - 2):index]
            if not any(re.fullmatch(r"[1-9]", value) for value in preceding):
                continue
            window = texts[index + 1:min(index + 8, holding_end)]
            amount = next((value for value in window if re.search(r"[¥￥]\s*\d[\d,]*(?:\.\d+)?", value)), "")
            if not amount:
                continue
            income = next((value for value in window if value.lstrip().startswith(("+¥", "+￥", "-¥", "-￥")) and value != amount), "")
            yield_text = next((value for value in window if re.fullmatch(r"[+\-]?\d+(?:\.\d+)?%", value.strip())), "")
            holdings.append({"name": name, "amount": amount, "income": income, "yield": yield_text})

    image_summary = next((line.strip(" >›") for line in texts if re.search(r"理财.*账单|账单|持仓", line)), "")
    return {
        "image_summary": image_summary,
        "extracted_text": "\n".join(texts),
        "recognized_fields": fields,
        "product": {},
        "holdings": holdings,
        "transactions": transactions,
        "risk_words": [word for word in ["高收益", "保本保息", "陌生链接", "非官方渠道", "私募", "虚拟币", "杠杆"] if any(word in line for line in texts)],
        "risk_notes": [],
    }


@app.post("/finance/parse-image")
async def finance_parse_image(file: UploadFile = File(...), user=Depends(current_user)) -> Dict[str, Any]:
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="图片不能为空")
    digest = hashlib.sha256(content).hexdigest()
    upload_dir = BASE_DIR / "data" / "uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)
    safe_name = f"{digest[:16]}_{Path(file.filename or 'upload.jpg').name}"
    path = upload_dir / safe_name
    path.write_bytes(content)
    vision = await call_vision_llm(build_image_prompt("finance_product"), content, file.content_type or "image/jpeg", "finance_product", user["id"])
    extracted = (vision.get("answer") or vision.get("extracted_text") or "").strip()
    profile = get_profile(user["id"])
    if not extracted or vision.get("fallback"):
        ocr = local_ocr_recognize(str(path))
        if ocr.get("ok"):
            ocr_payload = finance_payload_from_local_ocr(ocr)
            extracted = json.dumps(ocr_payload, ensure_ascii=False)
            parsed = parse_finance_product_text(extracted, profile)
            parsed["fallback"] = False
            parsed["ocr"] = {"ok": True, "provider": ocr.get("provider") or "rapidocr", "line_count": len(ocr.get("lines") or [])}
            parsed["message"] = (
                "云端视觉暂不可用，已使用本地OCR识别："
                f"{len(parsed.get('daily_items') or [])}条日常收支、"
                f"{len(parsed.get('finance_items') or [])}条理财收支、"
                f"{len(parsed.get('products') or [])}项理财产品。"
            )
            vision = {**vision, "cloud_fallback": True, "provider": "rapidocr", "model": "PP-OCRv6", "fallback": False}
        else:
            parsed = fallback_finance_image_parse(file.filename or "", profile)
            parsed["ocr"] = {"ok": False, "provider": ocr.get("provider") or "rapidocr"}
    else:
        parsed = parse_finance_product_text(extracted, profile)
    if not parsed.get("image_type") or parsed.get("image_type") == "text_input":
        parsed["image_type"] = "ai_recognized_finance_image"
    extracted = str(parsed.get("extracted_text") or extracted or "")
    parsed["attachment_sha256"] = digest
    parsed["vision"] = {
        "provider": vision.get("provider") or "",
        "model": vision.get("model") or "",
        "fallback": bool(vision.get("fallback")),
    }
    with conn() as c:
        c.execute(
            "INSERT INTO input_attachments(user_id,scene,input_type,file_path,original_name,mime_type,size,sha256,extracted_text,parsed_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
            (user["id"], "finance_product", "image", str(path), file.filename or "", file.content_type or "", len(content), digest, extracted, json.dumps(parsed, ensure_ascii=False), now_iso()),
        )
        for flag in parsed.get("risk_flags", []):
            # 普通产品说明和“不保本”知识提示不等于家庭异常；只有明确高风险行为才通知家人。
            if flag.get("level") == "high":
                create_alert(c, user["id"], flag["type"], flag["level"], "理财截图风险提醒", flag["reason"], "finance_parse_image")
        c.commit()
    return parsed


@app.post("/finance/track-from-analysis")
def finance_track_from_analysis(data: Dict[str, Any], user=Depends(current_user)) -> Dict[str, Any]:
    product = data.get("product") or data
    transactions = data.get("transactions") if isinstance(data.get("transactions"), list) else []
    first_transaction = transactions[0] if transactions and isinstance(transactions[0], dict) else {}
    amount = parse_money_amount(data.get("record_amount") or first_transaction.get("amount") or product.get("amount") or product.get("buy_amount") or 0)
    product_name = str(product.get("name") or data.get("product_name") or data.get("image_summary") or "").strip()
    if not product_name:
        raise HTTPException(400, detail="没有识别到可作为理财记录名称的内容，请先补充名称")
    raw_info = {
        **data,
        "product": product,
        "status": "已记录",
        "risk_flags": data.get("risk_flags", []),
        "elder_explanation": data.get("elder_explanation", ""),
        "remark": "由用户确认后从图片识别结果保存。",
    }
    with conn() as c:
        c.execute(
            """
            INSERT INTO wealth_positions(user_id,product_name,institution,product_code,buy_amount,buy_net_value,current_net_value,buy_date,latest_date,source,raw_info,created_at,updated_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                user["id"],
                product_name,
                product.get("institution") or data.get("issuer") or "",
                product.get("registration_code") or "",
                amount,
                1,
                1,
                date.today().isoformat(),
                date.today().isoformat(),
                "image_recognition",
                json.dumps(raw_info, ensure_ascii=False),
                now_iso(),
                now_iso(),
            ),
        )
        pid = c.execute("SELECT LAST_INSERT_ID() AS id" if USE_MYSQL else "SELECT last_insert_rowid() AS id").fetchone()[0]
        c.commit()
    return {"ok": True, "success": True, "id": pid, "message": "已添加到理财记录。", "status": "已记录"}


@app.post("/money/parse-finance-image")
async def money_parse_finance_image(file: UploadFile = File(...), user=Depends(current_user)) -> Dict[str, Any]:
    result = await finance_parse_image(file, user)
    result["entry_scene"] = "money"
    result.setdefault("message", "已按图片实际内容识别，请选择是否添加到收支或理财记录。")
    return result


@app.post("/ledger/import/wechat-text")
def ledger_import_wechat_text(data: GenericTextIn, user=Depends(current_user)) -> Dict[str, Any]:
    parsed = parse_ledger_items(data.text, source="wechat_text")
    with conn() as c:
        c.execute(
            "INSERT INTO ledger_imports(user_id,source,raw_text,parsed_json,duplicate_count,imported_count,created_at) VALUES(?,?,?,?,?,?,?)",
            (user["id"], "wechat_text", data.text, json.dumps(parsed, ensure_ascii=False), 0, 0, now_iso()),
        )
        import_id = c.execute("SELECT LAST_INSERT_ID() AS id" if USE_MYSQL else "SELECT last_insert_rowid() AS id").fetchone()[0]
        c.commit()
    return {**parsed, "import_id": import_id}


@app.post("/ledger/import/wechat-image")
async def ledger_import_wechat_image(file: UploadFile = File(...), user=Depends(current_user)) -> Dict[str, Any]:
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="图片不能为空")
    digest = hashlib.sha256(content).hexdigest()
    upload_dir = BASE_DIR / "data" / "uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)
    safe_name = f"{digest[:16]}_{Path(file.filename or 'wechat.jpg').name}"
    path = upload_dir / safe_name
    path.write_bytes(content)
    vision = await call_vision_llm(build_image_prompt("ledger_wechat"), content, file.content_type or "image/jpeg", "ledger_wechat", user["id"])
    extracted = vision.get("answer", "")
    parsed = parse_ledger_items(extracted, source="wechat_image")
    parsed["need_confirm"] = True
    parsed["vision"] = vision
    parsed["attachment_sha256"] = digest
    if not parsed.get("items"):
        parsed["hint"] = parsed.get("hint") or "截图已识别，但没有拆出明确交易。请人工确认识别文本，或补充粘贴账单文字。"
    with conn() as c:
        c.execute(
            "INSERT INTO ledger_imports(user_id,source,raw_text,parsed_json,duplicate_count,imported_count,created_at) VALUES(?,?,?,?,?,?,?)",
            (user["id"], "wechat_screenshot", extracted or digest, json.dumps(parsed, ensure_ascii=False), 0, 0, now_iso()),
        )
        import_id = c.execute("SELECT LAST_INSERT_ID() AS id" if USE_MYSQL else "SELECT last_insert_rowid() AS id").fetchone()[0]
        c.commit()
    return {**parsed, "import_id": import_id}


@app.post("/ledger/import/wechat-file")
async def ledger_import_wechat_file(file: UploadFile = File(...), user=Depends(current_user)) -> Dict[str, Any]:
    raw = (await file.read()).decode("utf-8", errors="ignore")
    return ledger_import_wechat_text(GenericTextIn(text=raw), user)


@app.post("/ledger/import/confirm")
def ledger_import_confirm(data: Dict[str, Any], user=Depends(current_user)) -> Dict[str, Any]:
    import_id = int(data.get("import_id") or 0)
    items = data.get("items")
    with conn() as c:
        if not items and import_id:
            row = c.execute("SELECT parsed_json FROM ledger_imports WHERE id=? AND user_id=?", (import_id, user["id"])).fetchone()
            parsed = parse_json_value(row["parsed_json"], {}) if row else {}
            items = parsed.get("items", [])
        count = 0
        position_ids = []
        for item in items or []:
            amount = float(item.get("amount") or 0)
            if amount <= 0:
                continue
            insert_ledger_record(
                c,
                user["id"],
                item.get("type") or "支出",
                item.get("title") or "微信账单",
                amount,
                date.today().isoformat(),
                item.get("category", ""),
                item.get("source_text", ""),
                data.get("source") or "ledger_import",
            )
            pid = create_position_from_ledger_item(c, user["id"], item, data.get("source") or "ledger_import")
            if pid:
                position_ids.append(pid)
            count += 1
        if import_id:
            c.execute("UPDATE ledger_imports SET imported_count=? WHERE id=? AND user_id=?", (count, import_id, user["id"]))
        c.commit()
    return {"ok": True, "imported_count": count, "position_ids": position_ids}


@app.get("/ledger/imports")
def ledger_import_list(user=Depends(current_user)) -> Dict[str, Any]:
    with conn() as c:
        rows = c.execute("SELECT * FROM ledger_imports WHERE user_id=? ORDER BY id DESC LIMIT 20", (user["id"],)).fetchall()
    items = []
    for r in rows:
        d = dict(r)
        d["parsed_json"] = parse_json_value(d.get("parsed_json"), {})
        items.append(d)
    return {"items": items}


@app.post("/wealth/search-and-track")
def wealth_search_and_track(data: Dict[str, Any], user=Depends(current_user)) -> Dict[str, Any]:
    product_name = str(data.get("product_name") or data.get("text") or "").strip()
    if not product_name:
        raise HTTPException(400, detail="请填写理财记录名称")
    matches = search_product_items(product_name, limit=1)
    info = matches[0] if matches else {}
    payload = {"product": {"name": product_name, "institution": info.get("institution", data.get("institution", "")), "registration_code": info.get("registration_code", ""), "amount": data.get("amount", 0)}}
    result = finance_track_from_analysis(payload, user)
    result["matched"] = bool(matches)
    result["match_info"] = info
    return result


@app.get("/wealth/positions/{position_id}")
def get_wealth_position(position_id: int, user=Depends(current_user)) -> Dict[str, Any]:
    with conn() as c:
        row = c.execute("SELECT * FROM wealth_positions WHERE id=? AND user_id=?", (position_id, user["id"])).fetchone()
    if not row:
        raise HTTPException(404, detail="持仓不存在")
    return {"item": normalize_position(dict(row))}


@app.get("/wealth/positions/{position_id}/snapshots")
def wealth_position_snapshots(position_id: int, user=Depends(current_user)) -> Dict[str, Any]:
    with conn() as c:
        pos = c.execute("SELECT id FROM wealth_positions WHERE id=? AND user_id=?", (position_id, user["id"])).fetchone()
        if not pos:
            raise HTTPException(404, detail="持仓不存在")
        rows = c.execute("SELECT * FROM wealth_position_snapshots WHERE position_id=? ORDER BY id DESC", (position_id,)).fetchall()
    return {"items": [dict(r) for r in rows]}


@app.post("/wealth/positions/{position_id}/set-reminder")
def wealth_set_reminder(position_id: int, data: Dict[str, Any], user=Depends(current_user)) -> Dict[str, Any]:
    with conn() as c:
        pos = c.execute("SELECT * FROM wealth_positions WHERE id=? AND user_id=?", (position_id, user["id"])).fetchone()
        if not pos:
            raise HTTPException(404, detail="持仓不存在")
        create_alert(c, user["id"], "unknown_product", "low", "理财到期/核验提醒", data.get("message") or "请在官方渠道核验该产品状态和到期时间。", "wealth")
        c.commit()
    return {"ok": True}


@app.post("/wealth/positions/{position_id}/risk-recheck")
def wealth_risk_recheck(position_id: int, user=Depends(current_user)) -> Dict[str, Any]:
    with conn() as c:
        pos = c.execute("SELECT * FROM wealth_positions WHERE id=? AND user_id=?", (position_id, user["id"])).fetchone()
        if not pos:
            raise HTTPException(404, detail="持仓不存在")
        text = json.dumps(dict(pos), ensure_ascii=False)
        flags = analyze_risk_text(text, get_profile(user["id"]))
        for flag in flags:
            create_alert(c, user["id"], flag["type"], flag["level"], "持仓风险复查", flag["reason"], "wealth")
        c.commit()
    return {"risk_flags": flags}


def term_explain_map() -> Dict[str, tuple[str, str]]:
    return {
        "七日年化": ("最近7天收益折算成一年的参考数，不代表以后每天都能拿这么多。", "它会变化，不能当成固定利息。"),
        "年化收益率": ("把一段时间的收益换算成一年口径，方便比较。", "年化只是算法口径，不等于承诺收益。"),
        "参考收益": ("页面上用于参考的收益展示，通常不是保证能拿到的钱。", "一定要看是否写着不保本、净值波动或以实际为准。"),
        "净值": ("可以理解为产品现在每份值多少钱，会涨也会跌。", "净值波动说明不是存款，别只看短期收益。"),
        "单位净值": ("每一份基金或净值型理财当前的价格。", "买入后价格可能涨也可能跌，要看风险等级和持有期限。"),
        "业绩比较基准": ("这是产品拿来参考的目标，不是保证能拿到的收益。", "看到基准也要看风险等级和说明书。"),
        "流动性": ("就是这笔钱取出来方不方便、要等多久。", "近期要用的钱不要放进期限太长的产品。"),
        "期限": ("期限就是这笔钱大概要放多久，比如30天、1年、3年。", "期限越长，越要确认中途能不能取、取出有没有损失。"),
        "风险等级": ("银行理财常见 R1 到 R5，数字越大波动和亏损可能越大。", "养老钱通常优先看 R1、R2 或自己能理解的低波动产品。"),
        "风险测评": ("购买理财前了解自己能承受多大风险的一份问卷或评估。", "不要让别人代答，也不要为了买高收益产品故意选高风险。"),
        "R1": ("R1 通常是低风险等级，主要追求稳。", "低风险也不等于绝对无风险，仍要看说明书。"),
        "R2": ("R2 通常是中低风险，可能有小幅波动。", "适合前提是能接受净值变化，并确认是正规渠道。"),
        "R3": ("R3 通常是中风险，波动会更明显。", "养老钱不宜配置太多，买前最好和家人一起核验。"),
        "大额存单": ("银行发行的较大金额定期存款，通常利率比普通定期略高。", "要确认起存金额、期限、提前支取规则和是否为本人银行账户。"),
        "国债": ("国家发行的债，通俗说是把钱借给国家，到期按规则还本付息。", "也要通过银行等正规渠道购买，别信私人代买。"),
        "储蓄国债": ("面向个人的国债，适合偏稳健的人学习了解。", "额度、期限和利率以财政部和银行公告为准。"),
        "货币基金": ("主要投向短期、流动性较好的资产，常用于现金管理。", "收益会变化，不是存款，也不是保本承诺。"),
        "基金": ("基金是把大家的钱集合起来，由专业机构投资。", "不同基金风险差别很大，养老钱不要只听别人推荐。"),
        "银行理财": ("银行或理财子公司发行的理财产品，很多是净值型。", "多数不保本，必须看风险等级、期限、登记编码和说明书。"),
        "申购": ("申购就是买入基金或理财产品。", "点确认前先核验产品、金额、期限和风险。"),
        "赎回": ("赎回就是把基金或理财份额卖出换回钱。", "到账可能需要时间，也可能遇到净值波动。"),
        "起购金额": ("起购金额是第一次购买至少要投入多少钱。", "不要为了凑起购金额动用生活费和医疗备用金。"),
        "登记编码": ("正规银行理财通常能查到产品登记编码。", "查不到编码时，要先去官方平台核验，别急着转账。"),
        "官方渠道": ("官方渠道是银行 App、柜台、官网、客服电话等可核验入口。", "陌生链接、私人二维码、微信群收款都要谨慎。"),
        "存款保险": ("符合条件的银行存款受存款保险制度保护。", "理财、基金、保险产品通常不等同于银行存款。"),
        "本金": ("本金就是您拿出去的原始钱。", "任何说本金绝对安全又高收益的说法都要警惕。"),
        "保本": ("保本是保证本金不亏的意思。", "现在很多理财不能承诺保本，听到保本高收益要特别小心。"),
        "非保本": ("非保本表示本金可能亏损，收益也不固定。", "养老钱遇到非保本产品，要先确认能不能承受亏损。"),
        "利率": ("利率是计算利息的比例，常见于存款、贷款、国债等。", "比较利率时要同时看期限、提前支取和费用。"),
        "收益": ("收益就是这笔钱可能多出来的部分。", "收益越高往往风险越高，不要只看数字。"),
        "分红": ("分红是产品把一部分收益分给持有人。", "分红不代表一定赚钱，还要看净值和总收益。"),
        "到期": ("到期是产品约定期限结束。", "到期后钱是否自动到账、是否续作，都要提前看清楚。"),
        "封闭期": ("封闭期内通常不能随时取出或赎回。", "近期要用的钱不要放进封闭期长的产品。"),
        "开放期": ("开放期是产品允许申购或赎回的时间窗口。", "错过开放期可能要等下一次才能取钱。"),
        "提前支取": ("提前支取是没到期先把钱取出来。", "可能损失利息、收益或需要等待到账。"),
        "管理费": ("管理费是产品管理机构收取的费用。", "费用会影响实际收益，不能只看展示收益。"),
        "托管费": ("托管费是资产托管服务产生的费用。", "看说明书时要把各类费用一起看。"),
        "赎回费": ("赎回费是卖出或取回产品时可能收取的费用。", "短期赎回费用可能较高，买前要看清规则。"),
        "申购费": ("申购费是买入基金或理财产品时可能收取的费用。", "费用会减少实际投入金额，要看清打折后费率和收费方式。"),
        "认购费": ("认购费是产品募集期内首次购买时可能收取的费用。", "认购费和申购费名称相近，具体以正式说明书为准。"),
        "销售服务费": ("销售服务费是销售机构按约定持续收取的费用。", "即使页面不单独扣款，也可能每天从产品净值里计提。"),
        "转换费": ("转换费是把一只基金换成另一只基金时可能产生的费用。", "转换前要比较赎回费、申购费和到账时间。"),
        "手续费": ("手续费是办理买入、卖出、转账或服务时收取的钱。", "要看清收费项目、费率和是否通过官方渠道。"),
        "业绩报酬": ("业绩报酬是产品达到约定表现后，管理人可能提取的一部分收益。", "它会影响您真正拿到的收益，计算规则要在合同里核对。"),
        "募集期": ("募集期是产品集中接受认购、还没正式开始运作的时间。", "募集期内钱何时计息、能否撤单，要以说明书为准。"),
        "锁定期": ("锁定期内通常不能卖出或赎回。", "近期可能要用的钱，不适合放进锁定期长的产品。"),
        "到期日": ("到期日是产品约定结束或进入结算的日期。", "到期不一定当天到账，要继续看清清算和到账时间。"),
        "赎回到账": ("赎回到账是提交取回申请后，资金真正回到银行卡或账户的时间。", "T+1、T+2是工作日计算，节假日可能顺延。"),
        "T+1": ("T+1通常表示申请后的下一个工作日处理或到账。", "周末和节假日一般不算工作日，急用钱要提前安排。"),
        "T+2": ("T+2通常表示申请后的第二个工作日处理或到账。", "具体从确认日还是申请日计算，要看产品规则。"),
        "高收益诱导": ("高收益诱导是用明显高于常见水平的收益吸引您尽快转账。", "遇到催促、陌生链接或私人收款码，立即暂停并联系官方或家人。"),
        "冒充客服": ("冒充客服是骗子假装银行、平台或公检法人员联系您。", "官方客服不会索要支付密码、短信验证码或让您转到个人账户。"),
        "非法集资": ("非法集资是未经许可向很多人吸收资金，并常用高回报作诱饵。", "不要向个人账户转钱，先核验机构资质和官方登记。"),
        "虚假平台": ("虚假平台是仿冒正规金融机构的网站、App或小程序。", "只从官方应用商店、银行官网或柜台进入，不点陌生链接。"),
        "持仓": ("持仓就是您现在还持有的产品和金额。", "要定期看风险变化，不要只看买入那天的信息。"),
        "回撤": ("回撤是从高点跌下来的幅度，用来看波动和亏损压力。", "回撤越大，越要确认自己能不能睡得着。"),
        "波动": ("波动表示价格或净值会上下变化。", "养老钱更适合自己能理解、波动能承受的产品。"),
        "延时到账": ("延时到账是转账或赎回后过一段时间才到账。", "着急用钱时要提前安排，陌生人催你转账更要警惕。"),
        "固收": ("固收通常指偏债券、票据等固定收益类资产。", "固收不等于稳赚不赔，仍可能有净值波动。"),
        "债券基金": ("主要投资债券的基金，风险通常低于股票基金但仍会波动。", "养老钱配置前要看回撤、期限和自己的承受能力。"),
        "养老理财": ("养老理财是面向养老资金规划的理财产品或服务。", "名字里有养老不代表保本，仍要核验风险等级和登记编码。"),
        "备用金": ("备用金是随时能用的钱，用来应对生活、医疗和突发情况。", "备用金不足时，不建议买期限长或赎回慢的产品。"),
        "稳健型": ("稳健型通常表示更看重本金波动小、收益平稳，不追求特别高收益。", "稳健不等于没有风险，仍要看风险等级、期限和说明书。"),
        "稳健": ("稳健就是尽量少冒大风险，先把钱放在看得懂、取用安排清楚的地方。", "别把“稳健”当成保本承诺，买前仍要核验。"),
        "银发群体": ("银发群体一般指老年朋友或即将退休的人群。", "面向老年人的产品也要看官方渠道和风险提示，别只听宣传。"),
        "老年用户": ("老年用户就是主要为长辈使用习惯设计的用户群体。", "操作资金前最好留出确认步骤，避免误点和被诱导转账。"),
        "适老化": ("适老化是把字、按钮、语音和流程做得更适合长辈使用。", "界面更友好不代表产品更安全，涉及钱仍要核验。"),
        "防诈骗": ("防诈骗就是提前识别高收益诱惑、冒充亲友、陌生链接等风险。", "遇到催转账、要验证码、承诺高收益，先停下来问家人或官方客服。"),
        "反诈提醒": ("反诈提醒是发现可疑转账、陌生电话或高收益话术时给出的安全提示。", "提醒不是吓人，是帮您多确认一步。"),
        "医疗资金": ("医疗资金是看病、买药、体检和突发健康情况要预留的钱。", "这部分钱优先保证随时可用，不建议放进期限长、赎回慢的产品。"),
        "医疗备用金": ("医疗备用金是专门留给看病、买药、体检和突发情况的钱。", "这笔钱要优先保证随时可用，不建议拿去买期限长或赎回慢的产品。"),
        "理财资金": ("理财资金是暂时不影响日常生活和看病的钱，用来了解或配置稳健产品。", "先留足生活费和医疗备用金，再考虑理财资金怎么安排。"),
        "蔬菜生鲜": ("蔬菜生鲜是买菜、肉蛋鱼、菜市场这类日常食品支出。", "这类钱属于生活费，要和理财资金分开记录。"),
        "水果生鲜": ("水果生鲜是苹果、香蕉、橙子等水果类日常支出。", "它属于生活账本，方便以后看清每月日常花销。"),
        "生活费": ("生活费是买菜、吃饭、缴费等日常要用的钱。", "日常要用的钱不要为了收益放太久，避免急用取不出来。"),
        "生活支出": ("生活支出是买菜、吃饭、看病、缴费等日常花出去的钱。", "先把日常支出记清楚，才能知道每月能安全结余多少。"),
        "结余": ("结余就是收入减去支出后剩下的钱。", "结余可以分成日常备用、医疗备用和稳健理财几部分。"),
        "日常收支": ("日常收支是平时收入和花销的记录，比如买菜、吃饭、工资和养老金。", "先把日常账记清楚，再决定哪些钱适合做理财。"),
        "理财收益": ("理财收益是理财产品可能带来的增加部分，可能为正也可能变少。", "收益不等于承诺，先看风险、期限和费用。"),
        "收支明细": ("收支明细是每一笔收入或支出的具体内容、金额和时间。", "明细越清楚，越容易发现异常扣款和不必要花销。"),
        "账本分析": ("账本分析是把日常花销、收入和理财记录整理成提醒和建议。", "分析结果供参考，涉及转账和购买仍要自己确认。"),
        "金融认知": ("金融认知是理解常见金融词、风险和正规操作流程的能力。", "不懂的词先问清楚，别被复杂话术催着操作。"),
        "风险提示": ("风险提示是提醒您这件事可能有亏损、诈骗、期限或操作风险。", "看到风险提示时先暂停，确认清楚再继续。"),
        "理财持仓": ("理财持仓是您现在还持有的理财产品和投入金额。", "持仓要定期复查风险等级、净值变化和到期时间。"),
        "月收入": ("月收入是一个月里稳定收到的钱，比如养老金、工资、补贴或房租。", "规划养老资金时，要先保证收入能覆盖日常支出。"),
        "月支出": ("月支出是一个月里花出去的钱，比如买菜、看病、缴费和交通。", "月支出越清楚，越容易判断还能留多少备用金。"),
        "流动资金": ("流动资金是短期内能方便取用的钱，也可以理解为手边活钱。", "看病、生活和突发情况要优先留足流动资金。"),
        "固定资金": ("固定资金是短期不方便动用的钱，比如长期存放或固定用途的钱。", "固定资金不能替代日常备用金，急用钱时要先看能否取出。"),
        "子女权限": ("子女权限是让您分别控制账本、风险、健康和对话信息是否推送给家人，家人不能替您操作资金。", "授权范围要由本人控制，验证码和密码不要告诉任何人。"),
        "风险偏好": ("风险偏好是您面对收益波动和可能亏损时能接受到什么程度。", "养老钱建议选自己能理解、睡得着的风险范围。"),
        "风险评估": ("风险评估是根据年龄、收入、用钱时间和经验判断适合多大风险。", "评估结果是提醒，不是购买指令，仍要看官方说明。"),
        "用钱时间": ("用钱时间是这笔钱大概多久可能会用到。", "越快要用的钱，越不要放进期限长、赎回慢的产品。"),
        "期限搭配": ("期限搭配是把钱按短期、中期、长期分开放，满足不同用钱时间。", "先留短期生活和医疗备用金，再考虑更长期限。"),
        "亲情协同": ("亲情协同是长辈和子女一起查看提醒、周报和风险，不代替长辈决定。", "协同账号不能索要密码、验证码，也不能越权操作资金。"),
        "家庭协同": ("家庭协同是长辈授权子女查看提醒、周报和健康摘要，一起守护资金安全。", "子女端只能看授权内容，不能代替长辈转账或购买。"),
        "家庭金融周报": ("家庭金融周报是把一周账本、资产和风险提醒整理成摘要给家人看。", "周报用于提醒和沟通，不是让子女替长辈操作资金。"),
        "家人消息": ("家人消息是长辈和子女之间互相留言、提醒和求助的功能。", "涉及钱的急事可以先发给家人确认，避免被催着操作。"),
        "绑定码": ("绑定码是长辈生成给子女绑定协同账号的一次性数字。", "绑定码只给可信家人，不要发给陌生人。"),
        "协同账号": ("协同账号是长辈和子女各自登录后形成的家庭协助关系。", "协同账号不共享密码，权限由长辈控制。"),
        "健康状态": ("健康状态是根据血压、心率、睡眠、步数等记录做出的生活提醒。", "身体不舒服要看医生，小享只做日常提醒。"),
        "身体情况": ("身体情况是长辈近期健康记录和提醒的概括。", "子女看到异常时应先关心确认，不要替代医生判断。"),
        "高风险内容": ("高风险内容是可能涉及诈骗、陌生转账、保证金、高收益诱导或验证码的信息。", "看到这类内容先暂停，联系家人或官方客服核验。"),
        "联系子女": ("联系子女是遇到不懂、紧急或高风险情况时给家人发消息求助。", "涉及转账和验证码时先联系子女，不要自己急着操作。"),
        "安全优先": ("安全优先是先保证本金、生活费和医疗备用金，再考虑收益。", "看到高收益诱惑时，先核验风险和官方渠道。"),
    }


def pick_term_key(term: str, local_map: Dict[str, tuple[str, str]]) -> str:
    clean = term.strip()
    if clean in local_map:
        return clean
    for key in sorted(local_map.keys(), key=len, reverse=True):
        if key in clean:
            return key
    return clean


def elder_example_for_term(term: str) -> str:
    if any(k in term for k in ["医疗", "备用金", "流动资金", "生活费"]):
        return "比如这笔钱可能下周看病、买药或交水电费，就要放在方便取用的位置。"
    if any(k in term for k in ["风险", "保本", "高收益", "官方渠道", "登记编码"]):
        return "比如有人说收益很高又让您扫私人二维码，先停下来，到银行官方渠道核验。"
    if any(k in term for k in ["收益", "七日年化", "年化", "净值", "业绩比较基准"]):
        return "比如页面写的收益只是参考，实际拿到多少还要看净值变化和产品规则。"
    if any(k in term for k in ["期限", "封闭期", "开放期", "赎回", "到期"]):
        return "比如半年后要用的钱，就不要随便放进一年封闭期的产品。"
    if any(k in term for k in ["账本", "收支", "买菜", "养老金", "支出", "收入"]):
        return "比如买菜50元记到日常支出，养老金到账记到收入，理财收益单独放到理财记录。"
    return "比如您看到这个词时，先看它和金额、期限、风险、能否取出有什么关系。"


def related_terms_for_term(term: str, nearby_text: str, local_map: Dict[str, tuple[str, str]]) -> List[str]:
    buckets = [
        ["本金", "收益", "风险等级", "官方渠道", "登记编码"],
        ["医疗备用金", "生活费", "流动资金", "备用金"],
        ["期限", "封闭期", "赎回", "到期"],
        ["七日年化", "年化收益率", "净值", "业绩比较基准"],
        ["家庭协同", "绑定码", "子女协助", "家庭金融周报"],
        ["日常收支", "收支明细", "账本分析", "理财收益"],
    ]
    text = f"{term} {nearby_text or ''}"
    picked: List[str] = []
    for bucket in buckets:
        if any(item in text for item in bucket):
            picked.extend(bucket)
    if not picked:
        picked = [item for item in ["风险等级", "期限", "官方渠道", "本金", "收益"] if item in local_map]
    result = []
    for item in picked:
        if item != term and item in local_map and item not in result:
            result.append(item)
        if len(result) >= 5:
            break
    return result


@app.post("/term/explain")
async def term_explain(data: TermExplainIn, user=Depends(current_user)) -> Dict[str, Any]:
    term = data.term.strip()[:60]
    if not term:
        raise HTTPException(400, detail="term 不能为空")
    expires = (datetime.now() + timedelta(days=30)).isoformat(timespec="seconds")
    local_map = term_explain_map()
    key = pick_term_key(term, local_map)
    with conn() as c:
        cached = c.execute(
            "SELECT * FROM term_explain_cache WHERE user_id=? AND term=? AND scene=? AND expires_at>? ORDER BY id DESC LIMIT 1",
            (user["id"], term, data.scene, now_iso()),
        ).fetchone()
        if cached and not data.force_llm:
            return {
                "term": term,
                "matched_term": pick_term_key(term, local_map),
                "explanation": cached["explanation"],
                "risk_tip": cached["risk_tip"],
                "elder_example": elder_example_for_term(term),
                "related_terms": related_terms_for_term(term, data.nearby_text, local_map),
                "from_cache": True,
                "model_used": cached["model_used"] if "model_used" in cached.keys() else "cache",
            }
        model_used = "local_safe_fallback"
        if key in local_map:
            explanation, risk_tip = local_map[key]
            model_used = "local_preset"
        elif data.force_llm:
            p = get_profile(user["id"])
            prompt = (
                f"请解释用户刚刚点击的词或短句：“{term}”。\n"
                f"页面上下文：{data.nearby_text[:700]}\n"
                "要求：必须紧扣这个词和页面内容，适合老年用户阅读；"
                "第一句用白话说它在这里是什么意思，第二句说和养老理财/日常资金有什么关系，第三句给风险提醒。"
                "不要编造收益，不要跑题，不要使用Markdown。"
            )
            answer = await call_llm([{"role": "system", "content": system_prompt(p)}, {"role": "user", "content": prompt}], temperature=0.2)
            answer = re.sub(r"\s+", " ", answer or "").strip()
            if answer:
                parts = re.split(r"[。；;\n]", answer, maxsplit=1)
                explanation = (parts[0] + "。")[:160] if parts else answer[:160]
                risk_tip = (parts[1].strip(" 。；;") if len(parts) > 1 else "不懂的词先问清楚，再操作。")[:140]
                model_used = "llm_forced"
            else:
                explanation, risk_tip = (f"{term}需要结合页面内容理解，先看风险、期限和官方渠道。", "不懂的词不要急着确认，先问清楚再操作。")
        else:
            p = get_profile(user["id"])
            prompt = f"请用适合老年用户的白话解释金融词语“{term}”。附近页面文字：{data.nearby_text[:300]}。要求：80字内解释意思，再给一句风险提醒；不得承诺收益。"
            answer = await call_llm([{"role": "system", "content": system_prompt(p)}, {"role": "user", "content": prompt}])
            parts = re.split(r"[。；;\n]", answer, maxsplit=1)
            explanation = (parts[0] + "。")[:120] if parts else f"{term}需要结合页面内容理解，先看风险、期限和官方渠道。"
            risk_tip = (parts[1] if len(parts) > 1 else "不懂的词不要急着确认，先问清楚再操作。")[:120]
            model_used = "llm_or_local_fallback"
        c.execute(
            "INSERT INTO term_explain_cache(user_id,term,scene,nearby_text,explanation,risk_tip,model_used,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?)",
            (user["id"], term, data.scene, data.nearby_text, explanation, risk_tip, model_used, now_iso(), expires),
        )
        c.commit()
    return {
        "term": term,
        "matched_term": key,
        "explanation": explanation,
        "risk_tip": risk_tip,
        "elder_example": elder_example_for_term(key),
        "related_terms": related_terms_for_term(key, data.nearby_text, local_map),
        "from_cache": False,
        "model_used": model_used,
    }


@app.get("/term/hot")
def term_hot(user=Depends(current_user)) -> Dict[str, Any]:
    return {"items": ["本金", "稳健型", "银发群体", "日常收支", "收支明细", "理财收益", "大额存单", "国债", "货币基金", "银行理财", "风险等级", "R2", "业绩比较基准", "七日年化", "年化收益率", "净值", "流动性", "赎回", "申购", "登记编码", "官方渠道", "存款保险", "备用金", "反诈提醒"]}


@app.get("/term/history")
def term_history(user=Depends(current_user)) -> Dict[str, Any]:
    with conn() as c:
        rows = c.execute("SELECT * FROM term_explain_cache WHERE user_id=? ORDER BY id DESC LIMIT 30", (user["id"],)).fetchall()
    return {"items": [dict(r) for r in rows]}


@app.get("/alerts")
def list_alerts(user=Depends(current_user)) -> Dict[str, Any]:
    with conn() as c:
        rows = c.execute("SELECT * FROM alert_events WHERE elder_user_id=? ORDER BY id DESC LIMIT 50", (user["id"],)).fetchall()
    return {"items": [dict(r) for r in rows]}


@app.post("/alerts/{alert_id}/read")
def read_alert(alert_id: int, user=Depends(current_user)) -> Dict[str, Any]:
    with conn() as c:
        c.execute("UPDATE alert_events SET status='read' WHERE id=? AND elder_user_id=?", (alert_id, user["id"]))
        c.commit()
    return {"ok": True}


@app.post("/alerts/{alert_id}/handle")
def handle_alert(alert_id: int, user=Depends(current_user)) -> Dict[str, Any]:
    with conn() as c:
        c.execute("UPDATE alert_events SET status='handled',handled_at=? WHERE id=? AND elder_user_id=?", (now_iso(), alert_id, user["id"]))
        c.commit()
    return {"ok": True}


LBS_TYPE_LABELS = {
    "bank": ("金融网点", "银行营业厅"),
    "hospital": ("医院", "医院"),
    "pharmacy": ("药店", "药店"),
    "community": ("社区服务", "社区服务中心"),
    "community_service": ("社区服务", "社区服务中心"),
    "police": ("派出所", "派出所"),
}


def lbs_type_label(kind: str) -> tuple[str, str]:
    return LBS_TYPE_LABELS.get(kind, LBS_TYPE_LABELS["bank"])


def distance_meters(lat1: float, lng1: float, lat2: float, lng2: float) -> int:
    radius = 6371000
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lam = math.radians(lng2 - lng1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lam / 2) ** 2
    return int(radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)))


def format_lbs_distance(distance: Optional[int]) -> str:
    if not distance or distance <= 0:
        return ""
    if distance >= 1000:
        return f"约{distance / 1000:.1f}公里"
    return f"约{distance}米"


def bd09_to_gcj02(lng: float, lat: float) -> tuple[float, float]:
    x = lng - 0.0065
    y = lat - 0.006
    z = math.sqrt(x * x + y * y) - 0.00002 * math.sin(y * math.pi * 3000.0 / 180.0)
    theta = math.atan2(y, x) - 0.000003 * math.cos(x * math.pi * 3000.0 / 180.0)
    return z * math.cos(theta), z * math.sin(theta)


def gcj02_to_bd09(lng: float, lat: float) -> tuple[float, float]:
    z = math.sqrt(lng * lng + lat * lat) + 0.00002 * math.sin(lat * math.pi * 3000.0 / 180.0)
    theta = math.atan2(lat, lng) + 0.000003 * math.cos(lng * math.pi * 3000.0 / 180.0)
    return z * math.cos(theta) + 0.0065, z * math.sin(theta) + 0.006


def osm_selector_for_lbs(kind: str) -> str:
    selectors = {
        "bank": '["amenity"~"bank|atm"]',
        "pharmacy": '["amenity"="pharmacy"]',
        "hospital": '["amenity"~"hospital|clinic|doctors"]',
        "community": '["amenity"~"community_centre|social_facility|townhall"]',
        "community_service": '["amenity"~"community_centre|social_facility|townhall"]',
        "police": '["amenity"="police"]',
    }
    return selectors.get(kind, selectors["bank"])


def osm_address_from_tags(tags: Dict[str, Any]) -> str:
    explicit = tags.get("addr:full") or tags.get("addr:street")
    parts = [
        tags.get("addr:province"),
        tags.get("addr:city"),
        tags.get("addr:district"),
        explicit,
        tags.get("addr:housenumber"),
    ]
    address = "".join(str(part) for part in parts if part)
    return address or tags.get("address") or "暂无详细地址"


CHINA_CITY_ALIASES = {
    "北京": "Beijing",
    "北京市": "Beijing",
    "天津": "Tianjin",
    "天津市": "Tianjin",
    "上海": "Shanghai",
    "上海市": "Shanghai",
    "重庆": "Chongqing",
    "重庆市": "Chongqing",
}


CHINA_DISTRICT_ALIASES = {
    "东城区": "Dongcheng District",
    "西城区": "Xicheng District",
    "朝阳区": "Chaoyang District",
    "海淀区": "Haidian District",
    "丰台区": "Fengtai District",
    "石景山区": "Shijingshan District",
    "通州区": "Tongzhou District",
    "昌平区": "Changping District",
    "大兴区": "Daxing District",
    "和平区": "Heping District",
    "河西区": "Hexi District",
    "河东区": "Hedong District",
    "南开区": "Nankai District",
    "河北区": "Hebei District",
    "红桥区": "Hongqiao District",
    "东丽区": "Dongli District",
    "西青区": "Xiqing District",
    "津南区": "Jinnan District",
    "北辰区": "Beichen District",
    "武清区": "Wuqing District",
    "宝坻区": "Baodi District",
    "滨海新区": "Binhai New Area",
    "宁河区": "Ninghe District",
    "静海区": "Jinghai District",
    "蓟州区": "Jizhou District",
}


def translated_china_address_queries(address: str) -> List[str]:
    city = ""
    district = ""
    for zh, en in CHINA_CITY_ALIASES.items():
        if zh in address:
            city = en
            break
    for zh, en in CHINA_DISTRICT_ALIASES.items():
        if zh in address:
            district = en
            break
    queries = []
    if city and district:
        queries.append(f"{district}, {city}, China")
        queries.append(f"{district} {city} China")
        queries.append(f"{city}, {district}, China")
        queries.append(f"{city} {district} China")
    elif district:
        queries.append(f"{district} China")
    elif city:
        queries.append(f"{city} China")
    return queries


def nominatim_search_once(query: str) -> Optional[Dict[str, Any]]:
    try:
        with httpx.Client(timeout=DATA_API_TIMEOUT) as client:
            r = client.get(
                "https://nominatim.openstreetmap.org/search",
                params={"q": query, "format": "json", "limit": 1, "addressdetails": 1},
                headers={"User-Agent": "YixiangZhicai/3.0 elderly-finance-miniapp"},
            )
            r.raise_for_status()
            payload = r.json()
        return payload[0] if payload else None
    except Exception:
        return None


def nominatim_item_matches_china_address(item: Dict[str, Any], address: str) -> bool:
    display = str(item.get("display_name") or "") + str(item.get("name") or "")
    for zh in CHINA_CITY_ALIASES:
        if zh in address:
            short = zh.replace("市", "")
            if zh not in display and short not in display:
                return False
            break
    for zh in CHINA_DISTRICT_ALIASES:
        if zh in address and zh not in display:
            return False
    return True


def nominatim_item_to_response(item: Dict[str, Any], address: str, source_note: str = "openstreetmap") -> Dict[str, Any]:
    lat = float(item.get("lat"))
    lng = float(item.get("lon"))
    return {
        "success": True,
        "address": item.get("display_name") or address,
        "location": {"lat": lat, "lng": lng, "latitude": lat, "longitude": lng},
        "source": source_note,
    }


def fallback_geocode_osm(address: str) -> Dict[str, Any]:
    try:
        item = nominatim_search_once(address)
        if item and not nominatim_item_matches_china_address(item, address):
            item = None
        if not item:
            for query in translated_china_address_queries(address):
                item = nominatim_search_once(query)
                if item and nominatim_item_matches_china_address(item, address):
                    return nominatim_item_to_response(item, address)
            return local_geocode_fallback(address, "Nominatim returned empty results")
        return nominatim_item_to_response(item, address)
    except Exception as e:
        for query in translated_china_address_queries(address):
            item = nominatim_search_once(query)
            if item and nominatim_item_matches_china_address(item, address):
                return nominatim_item_to_response(item, address)
        return local_geocode_fallback(address, "Nominatim geocode failed", str(e))


def local_geocode_fallback(address: str, message: str = "local geocode fallback", error: str = "") -> Dict[str, Any]:
    city_points = [
        ("北京", 39.9042, 116.4074),
        ("天津", 39.1200, 117.2000),
        ("上海", 31.2304, 121.4737),
        ("重庆", 29.5630, 106.5516),
        ("广州", 23.1291, 113.2644),
        ("深圳", 22.5431, 114.0579),
        ("杭州", 30.2741, 120.1551),
        ("成都", 30.5728, 104.0668),
        ("西安", 34.3416, 108.9398),
        ("武汉", 30.5928, 114.3055),
    ]
    lat, lng = 39.1200, 117.2000
    for city, city_lat, city_lng in city_points:
        if city in address:
            lat, lng = city_lat, city_lng
            break
    return {
        "success": True,
        "address": address,
        "location": {"lat": lat, "lng": lng, "latitude": lat, "longitude": lng},
        "source": "local_geocode_fallback",
        "fallback": True,
        "message": message,
        "debug_error": error,
        "user_message": "已按城市位置查找附近服务；如需更准确，请使用地图选点或输入街道小区名。",
    }


def fallback_geocode_baidu(address: str) -> Dict[str, Any]:
    if not BAIDU_API_KEY:
        return fallback_geocode_osm(address)
    try:
        with httpx.Client(timeout=DATA_API_TIMEOUT) as client:
            r = client.get(
                "https://api.map.baidu.com/geocoding/v3/",
                params={"address": address, "output": "json", "ak": BAIDU_API_KEY},
            )
            r.raise_for_status()
            payload = r.json()
        if int(payload.get("status", -1)) != 0:
            fallback = fallback_geocode_osm(address)
            fallback["debug_message"] = payload.get("msg") or "Baidu geocode failed"
            return fallback
        loc = ((payload.get("result") or {}).get("location") or {})
        bd_lng = float(loc.get("lng"))
        bd_lat = float(loc.get("lat"))
        lng, lat = bd09_to_gcj02(bd_lng, bd_lat)
        return {
            "success": True,
            "address": address,
            "location": {"lat": lat, "lng": lng, "latitude": lat, "longitude": lng},
            "source": "baidu_map",
        }
    except Exception as e:
        fallback = fallback_geocode_osm(address)
        fallback["debug_message"] = "Baidu geocode failed"
        fallback["baidu_error"] = str(e)
        return fallback


def fallback_nearby_baidu(kind: str, keyword: str, label: str, latitude: float, longitude: float) -> Dict[str, Any]:
    if not BAIDU_API_KEY:
        return fallback_nearby_osm(kind, keyword, label, latitude, longitude)
    try:
        bd_lng, bd_lat = gcj02_to_bd09(longitude, latitude)
        with httpx.Client(timeout=DATA_API_TIMEOUT) as client:
            r = client.get(
                "https://api.map.baidu.com/place/v2/search",
                params={
                    "query": keyword,
                    "location": f"{bd_lat},{bd_lng}",
                    "radius": 3000,
                    "page_size": 10,
                    "output": "json",
                    "ak": BAIDU_API_KEY,
                },
            )
            r.raise_for_status()
            payload = r.json()
        if int(payload.get("status", -1)) != 0:
            fallback = fallback_nearby_osm(kind, keyword, label, latitude, longitude)
            fallback["debug_message"] = payload.get("message") or "Baidu place search failed"
            return fallback
        items = []
        for idx, item in enumerate(payload.get("results") or [], start=1):
            loc = item.get("location") or {}
            if "lat" not in loc or "lng" not in loc:
                continue
            lng, lat = bd09_to_gcj02(float(loc.get("lng")), float(loc.get("lat")))
            phone = item.get("telephone") or ""
            distance = distance_meters(latitude, longitude, lat, lng)
            items.append({
                "id": str(item.get("uid") or f"baidu-{kind}-{idx}"),
                "name": item.get("name") or keyword,
                "type": label,
                "keyword": keyword,
                "address": item.get("address") or "暂无详细地址",
                "phone": phone,
                "distance": format_lbs_distance(distance),
                "latitude": lat,
                "longitude": lng,
                "note": "出发前可先电话确认营业时间和是否办理对应业务。" if phone else "暂无电话，可先打开地图查看详情。",
            })
        if items:
            return {
                "success": True,
                "items": items,
                "message": "ok",
                "privacy_note": "位置服务需用户主动授权；拒绝授权时可手动输入地址搜索。",
                "source": "baidu_map",
            }
        fallback = fallback_nearby_osm(kind, keyword, label, latitude, longitude)
        fallback["debug_message"] = "Baidu place search returned empty results"
        return fallback
    except Exception as e:
        fallback = fallback_nearby_osm(kind, keyword, label, latitude, longitude)
        fallback["debug_message"] = "Baidu place search failed"
        fallback["baidu_error"] = str(e)
        return fallback


def fallback_nearby_osm(kind: str, keyword: str, label: str, latitude: float, longitude: float) -> Dict[str, Any]:
    selector = osm_selector_for_lbs(kind)
    query = f"""
    [out:json][timeout:12];
    (
      node(around:3000,{latitude},{longitude}){selector};
      way(around:3000,{latitude},{longitude}){selector};
      relation(around:3000,{latitude},{longitude}){selector};
    );
    out center tags 20;
    """
    try:
        with httpx.Client(timeout=DATA_API_TIMEOUT) as client:
            r = client.post(
                "https://overpass-api.de/api/interpreter",
                data={"data": query},
                headers={"User-Agent": "YixiangZhicai/3.0 elderly-finance-miniapp"},
            )
            r.raise_for_status()
            payload = r.json()
        items = []
        seen = set()
        for idx, element in enumerate(payload.get("elements") or [], start=1):
            tags = element.get("tags") or {}
            center = element.get("center") or element
            lat = center.get("lat")
            lng = center.get("lon")
            if lat is None or lng is None:
                continue
            name = tags.get("name:zh") or tags.get("name") or f"{label}{idx}"
            key = (name, round(float(lat), 6), round(float(lng), 6))
            if key in seen:
                continue
            seen.add(key)
            phone = tags.get("phone") or tags.get("contact:phone") or ""
            distance = distance_meters(latitude, longitude, float(lat), float(lng))
            items.append({
                "id": f"osm-{element.get('type', 'node')}-{element.get('id', idx)}",
                "name": name,
                "type": label,
                "keyword": keyword,
                "address": osm_address_from_tags(tags),
                "phone": phone,
                "distance": format_lbs_distance(distance),
                "distance_value": distance,
                "latitude": float(lat),
                "longitude": float(lng),
                "note": "出发前可先电话确认营业时间和是否办理对应业务。" if phone else "暂无电话，可先打开地图查看详情。",
            })
        items.sort(key=lambda item: item.get("distance_value") or 999999)
        for item in items:
            item.pop("distance_value", None)
        if not items:
            return local_nearby_fallback(kind, keyword, label, latitude, longitude, "OpenStreetMap 暂无结果")
        return {
            "success": True,
            "items": items[:10],
            "message": "ok",
            "privacy_note": "位置服务需用户主动授权；拒绝授权时可手动输入地址搜索。",
            "source": "openstreetmap",
        }
    except Exception as e:
        return local_nearby_fallback(kind, keyword, label, latitude, longitude, "Overpass nearby search failed", str(e))


def local_nearby_fallback(kind: str, keyword: str, label: str, latitude: float, longitude: float, message: str = "", error: str = "") -> Dict[str, Any]:
    return {
        "success": False,
        "fallback": True,
        "items": [],
        "message": message or "附近服务暂时没有返回真实地点，请稍后再试",
        "privacy_note": "位置服务需用户主动授权；拒绝授权时可手动输入地址搜索。",
        "source": "unavailable",
    }


@app.get("/lbs/nearby")
def lbs_nearby(
    type: str = Query(default="bank"),
    city: str = Query(default="天津"),
    keyword: str = Query(default=""),
    latitude: float = Query(default=39.120,ge=-85,le=85),
    longitude: float = Query(default=117.200,ge=-180,le=180),
    radius: int = Query(default=3000,ge=100,le=30000),
    user=Depends(current_user),
) -> Dict[str, Any]:
    label, default_keyword = lbs_type_label(type)
    query_keyword = (keyword or default_keyword).strip()
    if not TENCENT_MAP_KEY:
        return local_nearby_fallback(type, query_keyword, label, latitude, longitude,"地图服务暂时不可用，请手动选点或稍后重试")
    try:
        with httpx.Client(timeout=DATA_API_TIMEOUT) as client:
            r = client.get(
                "https://apis.map.qq.com/ws/place/v1/search",
                params={
                    "keyword": query_keyword,
                    "boundary": f"nearby({latitude},{longitude},{radius})",
                    "page_size": 10,
                    "key": TENCENT_MAP_KEY,
                },
            )
            r.raise_for_status()
            payload = r.json()
        if int(payload.get("status", -1)) != 0:
            fallback = local_nearby_fallback(type, query_keyword, label, latitude, longitude,"地图服务暂时不可用，请手动选点或稍后重试")
            fallback["debug_message"] = payload.get("message") or "Tencent map place search failed"
            return fallback
        items = []
        for idx, item in enumerate(payload.get("data") or [], start=1):
            loc = item.get("location") or {}
            tel = item.get("tel") or item.get("phone") or ""
            distance = item.get("_distance")
            items.append({
                "id": str(item.get("id") or f"{type}-{idx}"),
                "name": item.get("title") or item.get("name") or query_keyword,
                "type": label,
                "keyword": query_keyword,
                "address": item.get("address") or "",
                "phone": tel,
                "distance_meters":float(distance) if distance not in [None, ""] else None,
                "coordinate_system":"gcj02",
                "source":"tencent_map",
                "distance": f"约{int(distance)}米" if distance not in [None, ""] else "",
                "latitude": float(loc.get("lat") or latitude),
                "longitude": float(loc.get("lng") or longitude),
                "note": "出发前可先电话确认营业时间和是否办理对应业务。" if tel else "暂无电话，可先打开地图查看详情。",
            })
    except Exception as e:
        fallback = local_nearby_fallback(type, query_keyword, label, latitude, longitude,"地图服务暂时不可用，请手动选点或稍后重试")
        fallback["debug_message"] = "Tencent map place search failed"
        fallback["tencent_error"] = type(e).__name__
        return fallback
    return {
        "success": True,
        "items": items,
        "privacy_note": "位置服务需用户主动授权；拒绝授权时可手动输入城市或地址搜索。",
        "source": "tencent_map",
    }


@app.get("/lbs/geocode")
def lbs_geocode(address: str = Query(default=""), user=Depends(current_user)) -> Dict[str, Any]:
    address = (address or "").strip()
    if not address:
        raise HTTPException(400, detail="请输入地址")
    if not TENCENT_MAP_KEY:
        return fallback_geocode_baidu(address)
    try:
        with httpx.Client(timeout=DATA_API_TIMEOUT) as client:
            r = client.get(
                "https://apis.map.qq.com/ws/geocoder/v1/",
                params={"address": address, "key": TENCENT_MAP_KEY},
            )
            r.raise_for_status()
            payload = r.json()
        if int(payload.get("status", -1)) != 0:
            fallback = fallback_geocode_baidu(address)
            fallback["debug_message"] = payload.get("message") or "Tencent map geocode failed"
            return fallback
        loc = ((payload.get("result") or {}).get("location") or {})
        lat = float(loc.get("lat"))
        lng = float(loc.get("lng"))
        return {
            "success": True,
            "address": address,
            "location": {"lat": lat, "lng": lng, "latitude": lat, "longitude": lng},
            "source": "tencent_map",
        }
    except Exception as e:
        fallback = fallback_geocode_baidu(address)
        fallback["debug_message"] = "Tencent map geocode failed"
        fallback["tencent_error"] = str(e)
        return fallback


@app.get("/lbs/reverse-geocode")
def lbs_reverse_geocode(latitude: float = Query(default=39.120), longitude: float = Query(default=117.200), user=Depends(current_user)) -> Dict[str, Any]:
    if not TENCENT_MAP_KEY:
        return {
            "success": True,
            "address": "当前区域",
            "location": {"lat": latitude, "lng": longitude, "latitude": latitude, "longitude": longitude},
            "source": "local_reverse_fallback",
        }
    try:
        with httpx.Client(timeout=DATA_API_TIMEOUT) as client:
            r = client.get(
                "https://apis.map.qq.com/ws/geocoder/v1/",
                params={"location": f"{latitude},{longitude}", "key": TENCENT_MAP_KEY},
            )
            r.raise_for_status()
            payload = r.json()
        if int(payload.get("status", -1)) != 0:
            return {
                "success": True,
                "address": "当前区域",
                "location": {"lat": latitude, "lng": longitude, "latitude": latitude, "longitude": longitude},
                "source": "local_reverse_fallback",
                "debug_message": payload.get("message") or "Tencent reverse geocode failed",
            }
        result = payload.get("result") or {}
        formatted = result.get("formatted_addresses") or {}
        address = formatted.get("recommend") or result.get("address") or "当前区域"
        return {
            "success": True,
            "address": address,
            "location": {"lat": latitude, "lng": longitude, "latitude": latitude, "longitude": longitude},
            "source": "tencent_map",
        }
    except Exception as e:
        return {
            "success": True,
            "address": "当前区域",
            "location": {"lat": latitude, "lng": longitude, "latitude": latitude, "longitude": longitude},
            "source": "local_reverse_fallback",
            "debug_message": str(e)[:120],
        }


@app.get("/lbs/ip-location")
def lbs_ip_location(user=Depends(current_user)) -> Dict[str, Any]:
    if not TENCENT_MAP_KEY:
        return {"success": False, "address":"", "location":{}, "source":"unavailable", "message":"暂未取得所在城市，请手动搜索地址"}
    try:
        with httpx.Client(timeout=DATA_API_TIMEOUT) as client:
            r = client.get("https://apis.map.qq.com/ws/location/v1/ip", params={"key": TENCENT_MAP_KEY})
            r.raise_for_status()
            payload = r.json()
        result = payload.get("result") or {}
        loc = result.get("location") or {}
        lat = float(loc.get("lat"))
        lng = float(loc.get("lng"))
        ad = result.get("ad_info") or {}
        address = "".join(str(v) for v in [ad.get("province"), ad.get("city"), ad.get("district")] if v) or "当前区域"
        return {
            "success": True,
            "address": address,
            "location": {"lat": lat, "lng": lng, "latitude": lat, "longitude": lng},
            "source": "tencent_map",
        }
    except Exception:
        return {"success": False, "address":"", "location":{}, "source":"unavailable", "message":"暂未取得所在城市，请手动搜索地址"}


@app.post("/payments/ledger-record")
def payment_ledger_record(data: PaymentLedgerIn, user=Depends(current_user)) -> Dict[str, Any]:
    if data.amount <= 0:
        raise HTTPException(400, detail="金额必须大于0")
    title = data.title or ("微信支付给" + data.payee if data.payee else "微信支付记账")
    if WECHAT_PAY_ENABLED and not WECHAT_PAY_MCH_ID:
        raise HTTPException(400, detail="已开启微信支付但未配置商户号")
    with conn() as c:
        c.execute(
            "INSERT INTO ledger_records(user_id,type,title,amount,date,created_at) VALUES(?,?,?,?,?,?)",
            (user["id"], "支出", title, data.amount, date.today().isoformat(), now_iso()),
        )
        c.commit()
    return {
        "ok": True,
        "mode": "wechat_pay_callback" if WECHAT_PAY_ENABLED else "ledger_record_only",
        "message": "已作为支出写入账本。正式微信支付需要商户号、证书、回调验签和订单系统。",
    }


# ------------------------- four-pocket allocator -------------------------

def ensure_pocket_history_table(c) -> None:
    if USE_MYSQL:
        safe_execute(c, """
            CREATE TABLE IF NOT EXISTS pocket_history(
              id BIGINT PRIMARY KEY AUTO_INCREMENT,user_id BIGINT NOT NULL,action VARCHAR(32) NOT NULL,
              summary_json JSON,created_at VARCHAR(32) NOT NULL,INDEX idx_pocket_user(user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)
    else:
        safe_execute(c, """
            CREATE TABLE IF NOT EXISTS pocket_history(
              id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,action TEXT NOT NULL,
              summary_json TEXT,created_at TEXT NOT NULL
            )
        """)


def build_pockets_for_user(user: Dict[str, Any]) -> Dict[str, Any]:
    profile = get_profile(user["id"])
    ledger = ledger_summary(scope="own", elder_id=None, user=user).get("summary", {})
    health = health_summary(user).get("health", {})
    with conn() as c:
        alerts = [dict(r) for r in c.execute("SELECT * FROM alert_events WHERE elder_user_id=? AND status!='handled' ORDER BY id DESC LIMIT 20", (user["id"],)).fetchall()]
    payload = allocate_pockets(profile, ledger, health, alerts)
    payload["profile_summary"] = {
        "nickname": profile.get("nickname"),
        "risk_preference": profile.get("risk_preference"),
        "health_status": profile.get("health_status"),
    }
    payload["ledger_summary"] = ledger
    payload["risk_alert_count"] = len(alerts)
    payload["pockets"] = payload.get("cards", [])
    return payload


@app.get("/pockets/summary")
def pockets_summary(user=Depends(current_user)) -> Dict[str, Any]:
    return build_pockets_for_user(user)


@app.post("/pockets/rebalance")
def pockets_rebalance(data: Dict[str, Any] = None, user=Depends(current_user)) -> Dict[str, Any]:
    payload = build_pockets_for_user(user)
    with conn() as c:
        ensure_pocket_history_table(c)
        c.execute(
            "INSERT INTO pocket_history(user_id,action,summary_json,created_at) VALUES(?,?,?,?)",
            (user["id"], "rebalance", json.dumps(payload, ensure_ascii=False), now_iso()),
        )
        c.commit()
    return {**payload, "message": "已生成四账户分账建议。这里只做建议和账本标签，不做真实资金划转。"}


@app.post("/pockets/simulate")
def pockets_simulate(data: Dict[str, Any], user=Depends(current_user)) -> Dict[str, Any]:
    profile = get_profile(user["id"])
    result = simulate_pockets(profile, data or {})
    result["message"] = "这是模拟结果，不会改变真实资产或账本。"
    return result


@app.get("/pockets/history")
def pockets_history(user=Depends(current_user)) -> Dict[str, Any]:
    with conn() as c:
        ensure_pocket_history_table(c)
        rows = c.execute("SELECT * FROM pocket_history WHERE user_id=? ORDER BY id DESC LIMIT 20", (user["id"],)).fetchall()
    items = []
    for row in rows:
        d = dict(row)
        d["summary"] = parse_json_value(d.get("summary_json"), {})
        items.append(d)
    return {"items": items}




def juhe_stock_query(keyword: str) -> Dict[str, Any]:
    """聚合数据股票查询。它不是养老理财产品接口，只用于市场信息学习/查询。"""
    keyword = (keyword or "").strip()
    if not (JUHE_FINANCE_URL and JUHE_FINANCE_KEY and keyword):
        return {"ok": False, "items": [], "reason": "missing_keyword_or_api"}
    try:
        with httpx.Client(timeout=DATA_API_TIMEOUT) as client:
            r = client.get(JUHE_FINANCE_URL, params={"key": JUHE_FINANCE_KEY, "dtype": "json", "stock": keyword})
            r.raise_for_status()
            data = r.json()
        return {"ok": True, "source": "juhe_stock", "raw": data, "items": _extract_items(data)}
    except Exception as e:
        return {"ok": False, "items": [], "reason": str(e)}


def juhe_bulletin() -> Dict[str, Any]:
    """聚合数据财经资讯接口"""
    if not (JUHE_BULLETIN_URL and JUHE_BULLETIN_KEY):
        return {"ok": False, "items": [], "reason": "missing_api_key"}
    try:
        with httpx.Client(timeout=DATA_API_TIMEOUT) as client:
            r = client.get(JUHE_BULLETIN_URL, params={"key": JUHE_BULLETIN_KEY})
            r.raise_for_status()
            data = response_json_with_encoding(r)
        items = _extract_items(data)
        normalized = []
        for i, item in enumerate(items[:10]):
            title = item.get("title") or item.get("content") or ""
            summary = item.get("summary") or item.get("desc") or item.get("content", "")[:100]
            content = (
                item.get("content")
                or item.get("detail")
                or item.get("digest")
                or item.get("summary")
                or item.get("desc")
                or summary
            )
            normalized.append({
                "id": f"news-{i}-{int(time.time())}",
                "title": str(title),
                "summary": str(summary),
                "content": str(content),
                "source": item.get("source") or item.get("channelName") or "聚合数据",
                "url": item.get("url") or "",
                "published_at": item.get("time") or item.get("date") or now_iso(),
                "category": item.get("category") or "财经",
            })
        return {"ok": True, "source": "juhe_bulletin", "items": normalized}
    except Exception as e:
        return {"ok": False, "items": [], "reason": str(e)}


def market_daily(force: bool = False) -> Dict[str, Any]:
    """获取每日财经资讯。只返回真实 API 数据；失败时返回明确错误。"""
    data = fetch_real_market_news(limit=8, force=force)
    data["disclaimer"] = "资讯仅供风险教育和市场了解，不构成投资建议。"
    return data


def recommend_by_preference(profile: Dict[str, Any], articles: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """根据用户偏好筛选资讯"""
    if not articles:
        return []
    
    risk = str(profile.get("risk_preference") or "")
    age = int(profile.get("age") or 0)
    goals = profile.get("goals", [])
    
    # 根据风险偏好和年龄确定关注关键词
    keywords = []
    if not risk and not age:
        keywords = ["防诈骗", "官方渠道", "金融知识", "风险提示"]
    elif "保守" in risk or age >= 70:
        keywords = ["国债", "存款", "存单", "货币基金", "防诈骗", "安全", "稳健", "保本"]
    elif "积极" in risk or (age and age < 50):
        keywords = ["理财", "基金", "债券", "养老金", "配置", "收益"]
    else:
        keywords = ["国债", "存单", "理财", "稳健", "养老", "中低风险"]
    
    # 根据用户目标增加关键词
    if goals:
        if "养老储备" in goals:
            keywords.extend(["养老", "退休", "年金"])
        if "医疗保障" in goals:
            keywords.extend(["医疗", "健康", "保险"])
        if "子女教育" in goals:
            keywords.extend(["教育", "子女", "成长"])
    
    # 优先推荐匹配关键词的资讯
    matched = []
    others = []
    
    for article in articles:
        title = str(article.get("title", "")).lower()
        summary = str(article.get("summary", "")).lower()
        text = title + summary
        
        matched_count = sum(1 for kw in keywords if kw.lower() in text)
        if matched_count > 0:
            matched.append({**article, "_score": matched_count})
        else:
            others.append(article)
    
    # 按匹配度排序
    matched.sort(key=lambda x: x.get("_score", 0), reverse=True)
    
    # 返回最多6条，优先匹配的，如果没有匹配的则返回全部
    result = [item for item in matched[:4]] + others[:2]
    if not result:
        return articles[:6]
    return result


@app.get("/market/stock")
def market_stock(q: str = Query(default=""), user=Depends(current_user)) -> Dict[str, Any]:
    result = juhe_stock_query(q)
    return {
        "query": q,
        "configured": bool(JUHE_FINANCE_URL and JUHE_FINANCE_KEY),
        "source": result.get("source", "juhe_stock"),
        "ok": result.get("ok", False),
        "items": result.get("items", []),
        "raw": result.get("raw", {}),
        "tip": "股票数据只用于市场知识学习，不作为养老理财推荐；老人端仍默认推荐国债、存款、货币基金和中低风险理财。",
        "reason": result.get("reason", ""),
    }

@app.get("/market/search")
def market_search(q: str = Query(default=""), refresh: int = 0, user=Depends(current_user)) -> Dict[str, Any]:
    items = search_product_items(q, limit=12, refresh=bool(refresh))
    return {
        "items": items,
        "query": q,
        "real_time": product_catalog()["real_time"],
        "official_verify": [
            {"name": "中国理财网", "url": "https://www.chinawealth.com.cn/"},
            {"name": "金融产品查询平台", "url": "https://www.jrcpcx.cn/"},
        ],
        "tip": "没有授权接口时仅返回合规学习参考；正式产品请用登记编码到官方平台核验。",
    }


@app.get("/wealth/positions")
def wealth_positions(user=Depends(current_user)) -> Dict[str, Any]:
    with conn() as c:
        rows = c.execute("SELECT * FROM wealth_positions WHERE user_id=? ORDER BY id DESC", (user["id"],)).fetchall()
    return {"items": [normalize_position(dict(r)) for r in rows]}


@app.post("/wealth/positions")
def add_wealth_position(data: WealthPositionIn, user=Depends(current_user)) -> Dict[str, Any]:
    matches = search_product_items(data.product_name, limit=1)
    info = matches[0] if matches else {}
    current = numeric_from_product(info) or data.current_net_value or data.buy_net_value or 1.0
    with conn() as c:
        c.execute(
            """
            INSERT INTO wealth_positions(
              user_id,product_name,institution,product_code,buy_amount,buy_net_value,current_net_value,
              buy_date,latest_date,source,raw_info,created_at,updated_at
            ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                user["id"],
                data.product_name,
                data.institution or info.get("institution", ""),
                data.product_code or info.get("registration_code", ""),
                data.buy_amount,
                data.buy_net_value or current,
                current,
                data.buy_date,
                date.today().isoformat(),
                info.get("source", "manual_record"),
                json.dumps(info, ensure_ascii=False),
                now_iso(),
                now_iso(),
            ),
        )
        pid = c.execute("SELECT LAST_INSERT_ID() AS id" if USE_MYSQL else "SELECT last_insert_rowid() AS id").fetchone()[0]
        c.commit()
    return {"ok": True, "id": pid}


@app.put("/wealth/positions/{position_id}")
def update_wealth_position(position_id: int, data: Dict[str, Any], user=Depends(current_user)) -> Dict[str, Any]:
    with conn() as c:
        row = c.execute("SELECT * FROM wealth_positions WHERE id=? AND user_id=?", (position_id, user["id"])).fetchone()
        if not row:
            raise HTTPException(404, detail="理财记录不存在")
        current = dict(row)
        raw_info = parse_json_value(current.get("raw_info"), {})
        if isinstance(data.get("raw_info"), dict):
            raw_info.update(data["raw_info"])
        c.execute(
            """
            UPDATE wealth_positions
            SET product_name=?,institution=?,product_code=?,buy_amount=?,buy_net_value=?,current_net_value=?,buy_date=?,raw_info=?,updated_at=?
            WHERE id=? AND user_id=?
            """,
            (
                str(data.get("product_name") or current.get("product_name") or "").strip(),
                str(data.get("institution") if data.get("institution") is not None else current.get("institution") or "").strip(),
                str(data.get("product_code") if data.get("product_code") is not None else current.get("product_code") or "").strip(),
                parse_money_amount(data.get("buy_amount"), float(current.get("buy_amount") or 0)),
                float(data.get("buy_net_value") or current.get("buy_net_value") or 1),
                float(data.get("current_net_value") or current.get("current_net_value") or 1),
                str(data.get("buy_date") or current.get("buy_date") or date.today().isoformat())[:10],
                json.dumps(raw_info, ensure_ascii=False),
                now_iso(),
                position_id,
                user["id"],
            ),
        )
        c.commit()
        updated = c.execute("SELECT * FROM wealth_positions WHERE id=? AND user_id=?", (position_id, user["id"])).fetchone()
    return {"ok": True, "item": normalize_position(dict(updated))}


@app.delete("/wealth/positions/{position_id}")
def delete_wealth_position(position_id: int, user=Depends(current_user)) -> Dict[str, Any]:
    with conn() as c:
        row = c.execute("SELECT id FROM wealth_positions WHERE id=? AND user_id=?", (position_id, user["id"])).fetchone()
        if not row:
            raise HTTPException(404, detail="理财记录不存在")
        c.execute("DELETE FROM wealth_position_snapshots WHERE position_id=?", (position_id,))
        c.execute("DELETE FROM wealth_positions WHERE id=? AND user_id=?", (position_id, user["id"]))
        c.commit()
    return {"ok": True, "message": "理财记录已删除"}


@app.post("/wealth/positions/{position_id}/refresh")
def refresh_wealth_position(position_id: int, user=Depends(current_user)) -> Dict[str, Any]:
    with conn() as c:
        row = c.execute("SELECT * FROM wealth_positions WHERE id=? AND user_id=?", (position_id, user["id"])).fetchone()
        if not row:
            raise HTTPException(404, detail="持仓不存在")
        position = normalize_position(dict(row))
        query = position.get("product_code") or position["product_name"]
        matches = search_product_items(query, limit=1, refresh=True)
        info = matches[0] if matches else position.get("raw_info", {})
        current = numeric_from_product(info)
        source = info.get("source", position.get("source", "manual_record")) if info else position.get("source", "manual_record")
        if current is None:
            current = position["current_net_value"] or position["buy_net_value"] or 1.0
            note = "暂未拿到授权实时净值，已保留上次数据；请配置银行/数据服务商接口。"
        else:
            note = "已根据授权数据源刷新净值。"
        c.execute(
            "UPDATE wealth_positions SET current_net_value=?,latest_date=?,source=?,raw_info=?,updated_at=? WHERE id=? AND user_id=?",
            (current, date.today().isoformat(), source, json.dumps(info, ensure_ascii=False), now_iso(), position_id, user["id"]),
        )
        c.commit()
        refreshed = c.execute("SELECT * FROM wealth_positions WHERE id=? AND user_id=?", (position_id, user["id"])).fetchone()
    item = normalize_position(dict(refreshed))
    item["refresh_note"] = note
    return {"ok": True, "item": item}

# ------------------------- family -------------------------

def code_hash(code: str) -> str:
    return hashlib.sha256(("bind:" + code).encode("utf-8")).hexdigest()


def new_bind_code() -> str:
    return f"{random.randint(100000, 999999)}"


def safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return default


def grant_default_permissions(c, binding_id: int) -> None:
    for key in DEFAULT_PERMISSION_KEYS:
        enabled = 1
        if USE_MYSQL:
            c.execute(
                "INSERT IGNORE INTO family_permissions(binding_id,permission_key,enabled,updated_at) VALUES(?,?,?,?)",
                (binding_id, key, enabled, now_iso()),
            )
        else:
            c.execute(
                "INSERT OR IGNORE INTO family_permissions(binding_id,permission_key,enabled,updated_at) VALUES(?,?,?,?)",
                (binding_id, key, enabled, now_iso()),
            )


def remark_for_peer(c, viewer_user_id: int, peer_user_id: int) -> str:
    row = c.execute(
        "SELECT remark FROM family_member_remarks WHERE viewer_user_id=? AND peer_user_id=?",
        (viewer_user_id, peer_user_id),
    ).fetchone()
    return str(row["remark"] or "").strip() if row else ""


def canonical_elder_family_id(c, elder_id: int) -> int:
    """Merge only elder-to-elder links into one chat; a child bound to two elders keeps two selectable families."""
    elder_ids = {int(elder_id)}
    changed = True
    while changed:
        changed = False
        placeholders = ",".join("?" for _ in elder_ids)
        rows = c.execute(
            f"""SELECT b.elder_user_id,b.child_user_id
                FROM family_bindings b
                JOIN users a ON a.id=b.elder_user_id
                JOIN users z ON z.id=b.child_user_id
                WHERE b.status='active' AND a.role='elder' AND z.role='elder'
                  AND (b.elder_user_id IN ({placeholders}) OR b.child_user_id IN ({placeholders}))""",
            tuple(elder_ids) + tuple(elder_ids),
        ).fetchall()
        for row in rows:
            for value in (row["elder_user_id"], row["child_user_id"]):
                value = int(value)
                if value not in elder_ids:
                    elder_ids.add(value)
                    changed = True
    return min(elder_ids)


def family_bound_members(c, user: Dict[str, Any]) -> List[Dict[str, Any]]:
    rows = c.execute(
        """
        SELECT b.id AS binding_id,b.elder_user_id AS family_id,
               CASE WHEN b.elder_user_id=? THEN b.child_user_id ELSE b.elder_user_id END AS peer_id,
               b.relation,u.nickname,u.phone,u.role AS peer_role,b.status
        FROM family_bindings b
        JOIN users u ON u.id=CASE WHEN b.elder_user_id=? THEN b.child_user_id ELSE b.elder_user_id END
        WHERE (b.elder_user_id=? OR b.child_user_id=?) AND b.status='active'
        ORDER BY b.id DESC
        """,
        (user["id"], user["id"], user["id"], user["id"]),
    ).fetchall()
    items = []
    seen = set()
    for row in rows:
        d = dict(row)
        peer_id = int(d["peer_id"])
        if peer_id in seen:
            continue
        seen.add(peer_id)
        remark = remark_for_peer(c, user["id"], peer_id)
        nickname = str(d.get("nickname") or "").strip()
        display_name = remark or nickname or ("长辈用户" if user["role"] == "child" else "子女用户")
        perms = c.execute("SELECT permission_key,enabled FROM family_permissions WHERE binding_id=?", (d["binding_id"],)).fetchall()
        items.append({
            "id": peer_id,
            "peer_id": peer_id,
            "family_id": canonical_elder_family_id(c, int(d["family_id"])),
            "binding_id": int(d["binding_id"]),
            "name": display_name,
            "display_name": display_name,
            "nickname": nickname,
            "remark": remark,
            "relation": (
                "长辈" if d.get("peer_role") == "elder" and user.get("role") == "child"
                else ("子女" if d.get("peer_role") == "child" else (d.get("relation") or "家人"))
            ),
            "phone": d.get("phone") or "",
            "enabled": True,
            "permissions": {p["permission_key"]: bool(p["enabled"]) for p in perms if p["permission_key"] in DEFAULT_PERMISSION_KEYS},
        })
    return items


def assert_bound_peer(c, user: Dict[str, Any], peer_id: int) -> Dict[str, Any]:
    if not peer_id:
        raise HTTPException(400, detail="请选择已绑定家人")
    row = c.execute(
        """SELECT * FROM family_bindings
           WHERE ((elder_user_id=? AND child_user_id=?) OR (elder_user_id=? AND child_user_id=?))
             AND status='active'""",
        (user["id"], peer_id, peer_id, user["id"]),
    ).fetchone()
    if not row:
        raise HTTPException(403, detail="只能给已绑定家人留言")
    return dict(row)


def resolve_family_id(c, user: Dict[str, Any], elder_id: Optional[int] = None) -> int:
    if user["role"] == "elder":
        if elder_id and int(elder_id) != int(user["id"]):
            assert_bound_peer(c, user, int(elder_id))
            return canonical_elder_family_id(c, int(elder_id))
        return canonical_elder_family_id(c, int(user["id"]))
    if elder_id:
        bound = c.execute(
            "SELECT elder_user_id FROM family_bindings WHERE child_user_id=? AND status='active'",
            (user["id"],),
        ).fetchall()
        for row in bound:
            direct_elder = int(row["elder_user_id"])
            family_id = canonical_elder_family_id(c, direct_elder)
            if int(elder_id) in {direct_elder, family_id}:
                return family_id
        raise HTTPException(403, detail="您未绑定该长辈家庭")
    row = c.execute(
        "SELECT elder_user_id FROM family_bindings WHERE child_user_id=? AND status='active' ORDER BY id DESC LIMIT 1",
        (user["id"],),
    ).fetchone()
    if not row:
        raise HTTPException(400, detail="暂无绑定家人，请先添加家人")
    return canonical_elder_family_id(c, int(row["elder_user_id"]))


def bind_child_with_code(c, code: str, child_user: Dict[str, Any], relation: str = "子女") -> Dict[str, Any]:
    code = str(code or "").strip()
    if not code:
        raise HTTPException(400, detail="子女端必须填写长辈提供的6位家庭绑定码")
    if not re.fullmatch(r"\d{6}", code):
        raise HTTPException(400, detail="请输入6位绑定码")
    row = c.execute(
        "SELECT * FROM family_bind_codes WHERE code_hash=? AND used=0 AND expires_at>?",
        (code_hash(code), now_iso()),
    ).fetchone()
    if not row:
        raise HTTPException(400, detail="绑定码无效或已过期")
    elder_id = row["elder_user_id"]
    if int(elder_id) == int(child_user["id"]):
        raise HTTPException(400, detail="不能绑定自己的家庭码")
    exists = c.execute(
        "SELECT * FROM family_bindings WHERE elder_user_id=? AND child_user_id=? AND status IN ('pending','active')",
        (elder_id, child_user["id"]),
    ).fetchone()
    if exists:
        binding_id = int(exists["id"])
        c.execute("UPDATE family_bindings SET status='active',confirmed_at=COALESCE(confirmed_at,?),updated_at=? WHERE id=?", (now_iso(), now_iso(), binding_id))
    else:
        c.execute(
            """
            INSERT INTO family_bindings(elder_user_id,child_user_id,relation,child_name,child_phone,status,bind_code_id,created_at,confirmed_at,updated_at)
            VALUES(?,?,?,?,?,'active',?,?,?,?)
            """,
            (elder_id, child_user["id"], relation or "子女", child_user.get("nickname", "家人"), child_user.get("phone", ""), row["id"], now_iso(), now_iso(), now_iso()),
        )
        binding_id = c.execute("SELECT LAST_INSERT_ID() AS id" if USE_MYSQL else "SELECT last_insert_rowid() AS id").fetchone()[0]
    grant_default_permissions(c, int(binding_id))
    c.execute("UPDATE family_bind_codes SET used=1 WHERE id=?", (row["id"],))
    return {"binding_id": int(binding_id), "elder_user_id": int(elder_id), "status": "active"}


def active_binding_for_child(child_id: int, elder_id: int, permission_key: Optional[str] = None) -> Dict[str, Any]:
    with conn() as c:
        row = c.execute(
            "SELECT * FROM family_bindings WHERE child_user_id=? AND elder_user_id=? AND status='active'",
            (child_id, elder_id),
        ).fetchone()
        if not row:
            raise HTTPException(403, detail="未获得该长辈授权")
        binding = dict(row)
        if permission_key:
            perm = c.execute(
                "SELECT enabled FROM family_permissions WHERE binding_id=? AND permission_key=?",
                (binding["id"], permission_key),
            ).fetchone()
            if not perm or not bool(perm["enabled"]):
                raise HTTPException(403, detail="长辈暂未开放该权限")
    return binding


def binding_permission_enabled(c, binding_id: int, permission_key: str) -> bool:
    row = c.execute(
        "SELECT enabled FROM family_permissions WHERE binding_id=? AND permission_key=?",
        (binding_id, permission_key),
    ).fetchone()
    return bool(row and row["enabled"])


def require_child_family_permission(c, user: Dict[str, Any], elder_id: Optional[int], permission_key: str) -> Dict[str, Any]:
    if user.get("role") != "child":
        return {}
    selected_elder = int(elder_id or 0)
    if selected_elder:
        row = c.execute(
            "SELECT * FROM family_bindings WHERE child_user_id=? AND elder_user_id=? AND status='active'",
            (user["id"], selected_elder),
        ).fetchone()
    else:
        row = c.execute(
            "SELECT * FROM family_bindings WHERE child_user_id=? AND status='active' ORDER BY id DESC LIMIT 1",
            (user["id"],),
        ).fetchone()
    if not row:
        raise HTTPException(403, detail="未获得该长辈授权")
    binding = dict(row)
    if not binding_permission_enabled(c, int(binding["id"]), permission_key):
        raise HTTPException(403, detail="长辈暂未开放该权限")
    return binding


def ensure_weekly_report(c, elder_id: int) -> Dict[str, Any]:
    today = date.today()
    start = today - timedelta(days=6)
    start_text = start.isoformat()
    end_text = today.isoformat()
    ledger_rows = c.execute(
        """
        SELECT type,amount,category,title,date,source
        FROM ledger_records
        WHERE user_id=? AND date>=? AND date<=? AND COALESCE(source,'')!='demo_seed'
        ORDER BY date DESC,id DESC
        """,
        (elder_id, start_text, end_text),
    ).fetchall()
    position_rows = c.execute("SELECT * FROM wealth_positions WHERE user_id=? ORDER BY id DESC", (elder_id,)).fetchall()
    alert_rows = c.execute(
        """
        SELECT * FROM alert_events
        WHERE elder_user_id=? AND COALESCE(source,'')!='demo_seed'
          AND event_type NOT IN ('family_bound','family_message','child_nudge')
        ORDER BY id DESC LIMIT 10
        """,
        (elder_id,),
    ).fetchall()

    income = sum(float(r["amount"] or 0) for r in ledger_rows if r["type"] == "收入")
    expense = sum(float(r["amount"] or 0) for r in ledger_rows if r["type"] == "支出")
    summary_parts = []
    if ledger_rows:
        summary_parts.append(f"本周记录{len(ledger_rows)}笔收支，收入{fmt_money(income)}元，支出{fmt_money(expense)}元")
    if position_rows:
        summary_parts.append(f"当前有{len(position_rows)}条理财/持仓记录需要按官方渠道定期核验")
    if alert_rows:
        summary_parts.append(f"有{len(alert_rows)}条风险或异常提醒待关注")
    summary = ("；".join(summary_parts) + "。") if summary_parts else "暂无金融周报数据。请先记录收支、理财持仓或健康指标，小享会自动生成周报。"
    ledger_payload = {"income": income, "expense": expense, "count": len(ledger_rows)}
    position_payload = {"count": len(position_rows)}
    risk_payload = {"count": len(alert_rows), "items": [dict(r) for r in alert_rows[:5]]}
    ai_advice = "请结合真实账本、持仓和提醒逐项核验；涉及转账、保证金、陌生链接时先暂停并联系家人。" if summary_parts else "暂无可分析数据，先从记一笔、添加持仓或填写健康数据开始。"
    c.execute(
        """
        INSERT INTO weekly_reports(
          elder_user_id,period_start,period_end,summary,asset_summary_json,ledger_summary_json,
          position_summary_json,risk_summary_json,ai_advice,created_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?)
        """,
        (
            elder_id,
            start_text,
            end_text,
            summary,
            json.dumps(portfolio_overview({"id": elder_id}), ensure_ascii=False),
            json.dumps(ledger_payload, ensure_ascii=False),
            json.dumps(position_payload, ensure_ascii=False),
            json.dumps(risk_payload, ensure_ascii=False),
            ai_advice,
            now_iso(),
        ),
    )
    return dict(c.execute("SELECT * FROM weekly_reports WHERE elder_user_id=? ORDER BY id DESC LIMIT 1", (elder_id,)).fetchone())


@app.get("/family/bind-code")
def bind_code(refresh: int = 0, user=Depends(current_user)) -> Dict[str, Any]:
    if user["role"] != "elder":
        raise HTTPException(403, detail="只有长辈可以生成绑定码")
    with conn() as c:
        row = c.execute(
            "SELECT * FROM family_bind_codes WHERE elder_user_id=? AND used=0 AND expires_at>? ORDER BY id DESC LIMIT 1",
            (user["id"], now_iso()),
        ).fetchone()
        if refresh or not row:
            code = new_bind_code()
            expires = (datetime.now() + timedelta(hours=24)).isoformat(timespec="seconds")
            c.execute(
                "UPDATE family_bind_codes SET used=1 WHERE elder_user_id=? AND used=0",
                (user["id"],),
            )
            c.execute(
                "INSERT INTO family_bind_codes(elder_user_id,code_hash,code_plain_demo,expires_at,used,created_at) VALUES(?,?,?,?,0,?)",
                (user["id"], code_hash(code), code, expires, now_iso()),
            )
            c.commit()
            return {"code": code, "expires_at": expires, "expires_in": "24小时"}
    return {"code": row["code_plain_demo"], "expires_at": row["expires_at"], "expires_in": "24小时"}


@app.post("/family/bind-code/refresh")
def refresh_bind_code(user=Depends(current_user)) -> Dict[str, Any]:
    return bind_code(refresh=1, user=user)


@app.post("/family/bind/accept-code")
def accept_bind_code(data: Dict[str, Any], user=Depends(current_user)) -> Dict[str, Any]:
    code = str(data.get("code") or data.get("bind_code") or "").strip()
    if not re.fullmatch(r"\d{6}", code):
        raise HTTPException(400, detail="请输入6位绑定码")
    relation = str(data.get("relation") or ("子女" if user["role"] == "child" else "长辈"))
    with conn() as c:
        binding = bind_child_with_code(c, code, user, relation)
        c.commit()
    return {"ok": True, **binding, "message": "已完成绑定，可直接查看长辈授权信息"}


@app.get("/family/bindings")
def list_bindings(user=Depends(current_user)) -> Dict[str, Any]:
    field = "elder_user_id" if user["role"] == "elder" else "child_user_id"
    with conn() as c:
        rows = c.execute(f"SELECT * FROM family_bindings WHERE {field}=? ORDER BY id DESC", (user["id"],)).fetchall()
        items = []
        for r in rows:
            d = dict(r)
            peer_id = int(d["child_user_id"] if user["role"] == "elder" else d["elder_user_id"])
            peer = c.execute("SELECT nickname,phone,role FROM users WHERE id=?", (peer_id,)).fetchone()
            remark = remark_for_peer(c, int(user["id"]), peer_id)
            d["remark"] = remark
            d["peer_id"] = peer_id
            d["nickname"] = str(peer["nickname"] or "") if peer else ""
            d["phone"] = str(peer["phone"] or "") if peer else ""
            d["display_name"] = remark or d["nickname"] or ("子女" if user["role"] == "elder" else "长辈")
            d["relation"] = "子女" if user["role"] == "elder" and (not peer or peer["role"] == "child") else "长辈"
            perms = c.execute("SELECT permission_key,enabled FROM family_permissions WHERE binding_id=?", (d["id"],)).fetchall()
            d["permissions"] = {p["permission_key"]: bool(p["enabled"]) for p in perms}
            items.append(d)
    return {"items": items}


@app.get("/family/pending-bindings")
def pending_bindings(user=Depends(current_user)) -> Dict[str, Any]:
    if user["role"] != "elder":
        raise HTTPException(403, detail="只有长辈可以查看待确认绑定")
    with conn() as c:
        rows = c.execute("SELECT * FROM family_bindings WHERE elder_user_id=? AND status='pending' ORDER BY id DESC", (user["id"],)).fetchall()
    return {"items": [dict(r) for r in rows]}


@app.post("/family/bindings/{binding_id}/confirm")
def confirm_binding(binding_id: int, user=Depends(current_user)) -> Dict[str, Any]:
    if user["role"] != "elder":
        raise HTTPException(403, detail="只有长辈可以确认绑定")
    with conn() as c:
        row = c.execute("SELECT * FROM family_bindings WHERE id=? AND elder_user_id=?", (binding_id, user["id"])).fetchone()
        if not row:
            raise HTTPException(404, detail="绑定申请不存在")
        c.execute("UPDATE family_bindings SET status='active',confirmed_at=?,updated_at=? WHERE id=?", (now_iso(), now_iso(), binding_id))
        grant_default_permissions(c, binding_id)
        c.commit()
    return {"ok": True, "status": "active"}


@app.post("/family/bindings/{binding_id}/reject")
def reject_binding(binding_id: int, user=Depends(current_user)) -> Dict[str, Any]:
    if user["role"] != "elder":
        raise HTTPException(403, detail="只有长辈可以拒绝绑定")
    with conn() as c:
        c.execute("UPDATE family_bindings SET status='rejected',updated_at=? WHERE id=? AND elder_user_id=?", (now_iso(), binding_id, user["id"]))
        c.commit()
    return {"ok": True, "status": "rejected"}


@app.put("/family/bindings/{binding_id}/permissions")
def update_binding_permissions(binding_id: int, data: Dict[str, Any], user=Depends(current_user)) -> Dict[str, Any]:
    if user["role"] != "elder":
        raise HTTPException(403, detail="只有长辈可以设置权限")
    permissions = data.get("permissions") or data
    with conn() as c:
        row = c.execute("SELECT id FROM family_bindings WHERE id=? AND elder_user_id=?", (binding_id, user["id"])).fetchone()
        if not row:
            raise HTTPException(404, detail="绑定关系不存在")
        for key in DEFAULT_PERMISSION_KEYS:
            if isinstance(permissions, dict) and key not in permissions:
                continue
            enabled = bool(permissions.get(key, False)) if isinstance(permissions, dict) else key in permissions
            if USE_MYSQL:
                c.execute(
                    "INSERT INTO family_permissions(binding_id,permission_key,enabled,updated_at) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE enabled=VALUES(enabled),updated_at=VALUES(updated_at)",
                    (binding_id, key, 1 if enabled else 0, now_iso()),
                )
            else:
                c.execute(
                    "INSERT OR REPLACE INTO family_permissions(binding_id,permission_key,enabled,updated_at) VALUES(?,?,?,?)",
                    (binding_id, key, 1 if enabled else 0, now_iso()),
                )
        c.commit()
    return {"ok": True, "permissions": {key: bool(permissions.get(key, False)) for key in DEFAULT_PERMISSION_KEYS if isinstance(permissions, dict) and key in permissions}}


@app.delete("/family/bindings/{binding_id}")
def delete_binding(binding_id: int, user=Depends(current_user)) -> Dict[str, Any]:
    if user["role"] != "elder":
        raise HTTPException(403, detail="只有长辈可以解除绑定")
    with conn() as c:
        c.execute("UPDATE family_bindings SET status='removed',updated_at=? WHERE id=? AND elder_user_id=?", (now_iso(), binding_id, user["id"]))
        c.commit()
    return {"ok": True, "status": "removed"}

@app.get("/family/members")
def family_members(user=Depends(current_user)) -> Dict[str, Any]:
    with conn() as c:
        items = family_bound_members(c, user)
    return {
        "success": True,
        "items": items,
        "message": "" if items else "暂无绑定家人，请先添加家人",
    }

@app.post("/family/members")
def family_add(data: Dict[str, Any], user=Depends(current_user)) -> Dict[str, Any]:
    phone = str(data.get("phone") or "").strip()
    name = str(data.get("name") or "").strip()
    relation = str(data.get("relation") or "家人").strip()
    permissions = data.get("permissions") or ["异常提醒", "资产周报"]
    if not name or not phone:
        raise HTTPException(400, detail="请填写家人姓名和电话")
    with conn() as c:
        exists = c.execute("SELECT id FROM family_members WHERE user_id=? AND phone=? LIMIT 1", (user["id"], phone)).fetchone()
        if exists:
            c.execute(
                "UPDATE family_members SET name=?,relation=?,enabled=1,permissions=? WHERE id=? AND user_id=?",
                (name, relation, json.dumps(permissions, ensure_ascii=False), exists["id"], user["id"]),
            )
            c.commit()
            return {"ok": True, "updated": True, "id": exists["id"]}
        c.execute("INSERT INTO family_members(user_id,name,relation,phone,enabled,permissions,created_at) VALUES(?,?,?,?,?,?,?)",
                  (user["id"], name, relation, phone, 1, json.dumps(permissions, ensure_ascii=False), now_iso()))
        c.commit()
    return {"ok": True}


@app.put("/family/members/{peer_id}/remark")
def family_update_remark(peer_id: int, data: Dict[str, Any], user=Depends(current_user)) -> Dict[str, Any]:
    remark = str(data.get("remark") or "").strip()[:40]
    with conn() as c:
        assert_bound_peer(c, user, peer_id)
        c.execute(
            "INSERT OR REPLACE INTO family_member_remarks(viewer_user_id,peer_user_id,remark,updated_at) VALUES(?,?,?,?)",
            (user["id"], peer_id, remark, now_iso()),
        )
        c.commit()
    return {"success": True, "remark": remark}

@app.post("/family/member/remark")
def family_member_remark(data: Dict[str, Any], user=Depends(current_user)) -> Dict[str, Any]:
    peer_id = safe_int(data.get("peer_id") or data.get("member_id") or data.get("user_id"))
    if not peer_id:
        raise HTTPException(400, detail="请选择要备注的家人")
    return family_update_remark(peer_id, data, user)

@app.put("/family/members/{mid}")
def family_update(mid: int, data: Dict[str, Any], user=Depends(current_user)) -> Dict[str, Any]:
    enabled = 1 if data.get("enabled", True) else 0
    with conn() as c:
        c.execute("UPDATE family_members SET enabled=? WHERE id=? AND user_id=?", (enabled, mid, user["id"]))
        c.commit()
    return {"ok": True}

@app.delete("/family/members/{mid}")
def family_delete(mid: int, user=Depends(current_user)) -> Dict[str, Any]:
    with conn() as c:
        c.execute("DELETE FROM family_members WHERE id=? AND user_id=?", (mid, user["id"]))
        c.commit()
    return {"ok": True}

@app.get("/family/anomaly")
def family_anomaly(user=Depends(current_user)) -> Dict[str, Any]:
    with conn() as c:
        rows = c.execute(
            """
            SELECT * FROM alert_events
            WHERE elder_user_id=? AND status!='handled' AND COALESCE(source,'')!='demo_seed'
              AND event_type NOT IN ('family_bound','family_message','child_nudge')
            ORDER BY id DESC LIMIT 20
            """,
            (user["id"],),
        ).fetchall()
    items = [dict(r) for r in rows]
    return {
        "success": True,
        "items": items,
        "summary": "暂无异常提醒" if not items else f"当前有{len(items)}条异常提醒待处理",
    }

@app.get("/family/weekly-report")
def family_report(user=Depends(current_user)) -> Dict[str, Any]:
    with conn() as c:
        report = ensure_weekly_report(c, user["id"])
        c.commit()
    if not report:
        return {"success": True, "summary": "暂无金融周报数据", "report": None}
    for key in ["asset_summary_json", "ledger_summary_json", "position_summary_json", "risk_summary_json"]:
        report[key] = parse_json_value(report.get(key), {})
    return {"success": True, "summary": report.get("summary", ""), "report": report}


@app.get("/family/messages")
def family_messages(
    peer_id: Optional[int] = Query(default=None),
    elder_id: Optional[int] = Query(default=None),
    user=Depends(current_user),
) -> Dict[str, Any]:
    with conn() as c:
        members = family_bound_members(c, user)
        if not members:
            return {"success": True, "items": [], "unread_count": 0, "members": [], "message": "暂无绑定家人，请先添加家人"}
        if peer_id is None and elder_id and user["role"] == "child":
            peer_id = elder_id
        if peer_id is None:
            peer_id = int(members[0]["peer_id"])
        binding = assert_bound_peer(c, user, int(peer_id))
        if user.get("role") == "child" and not binding_permission_enabled(c, int(binding["id"]), "view_messages"):
            raise HTTPException(403, detail="长辈暂未开放该权限")
        family_id = int(binding["elder_user_id"])
        rows = c.execute(
            """
            SELECT m.*,fu.nickname AS from_name,tu.nickname AS to_name
            FROM family_messages m
            JOIN users fu ON fu.id=m.from_user_id
            JOIN users tu ON tu.id=m.to_user_id
            WHERE m.elder_user_id=?
              AND ((m.from_user_id=? AND m.to_user_id=?) OR (m.from_user_id=? AND m.to_user_id=?))
            ORDER BY m.id ASC LIMIT 100
            """,
            (family_id, user["id"], int(peer_id), int(peer_id), user["id"]),
        ).fetchall()
        unread = c.execute("SELECT COUNT(*) AS n FROM family_messages WHERE to_user_id=? AND status='unread'", (user["id"],)).fetchone()["n"]
        c.execute("UPDATE family_messages SET status='read' WHERE to_user_id=? AND status='unread'", (user["id"],))
        c.commit()
    items = []
    for r in rows:
        d = dict(r)
        d["family_id"] = d["elder_user_id"]
        d["sender_id"] = d["from_user_id"]
        d["receiver_id"] = d["to_user_id"]
        d["sender_name"] = d.get("from_name") or ""
        d["receiver_name"] = d.get("to_name") or ""
        d["read_status"] = d.get("status") or "unread"
        items.append(d)
    return {"success": True, "items": items, "unread_count": int(unread), "members": members, "peer_id": int(peer_id)}


@app.post("/family/messages")
def send_family_message(data: Dict[str, Any], user=Depends(current_user)) -> Dict[str, Any]:
    content = str(data.get("content") or data.get("message") or "").strip()
    if not content:
        raise HTTPException(400, detail="消息不能为空")
    content = content[:300]
    message_type = str(data.get("message_type") or "family")[:32]
    with conn() as c:
        receiver_id = safe_int(data.get("receiver_id") or data.get("peer_id") or data.get("child_id") or data.get("to_user_id") or data.get("elder_id"))
        binding = assert_bound_peer(c, user, receiver_id)
        if user.get("role") == "child" and not binding_permission_enabled(c, int(binding["id"]), "view_messages"):
            raise HTTPException(403, detail="长辈暂未开放该权限")
        elder_user_id = int(binding["elder_user_id"])
        c.execute(
            "INSERT INTO family_messages(elder_user_id,from_user_id,to_user_id,content,message_type,status,created_at) VALUES(?,?,?,?,?,?,?)",
            (elder_user_id, user["id"], receiver_id, content, message_type, "unread", now_iso()),
        )
        msg_id = c.execute("SELECT LAST_INSERT_ID() AS id" if USE_MYSQL else "SELECT last_insert_rowid() AS id").fetchone()[0]
        if message_type == "high_risk":
            create_alert(c, elder_user_id, "high_risk_family_message", "high", "高风险内容提醒", content, "family_message")
        c.commit()
        row = c.execute(
            """
            SELECT m.*,fu.nickname AS from_name,tu.nickname AS to_name
            FROM family_messages m
            JOIN users fu ON fu.id=m.from_user_id
            JOIN users tu ON tu.id=m.to_user_id
            WHERE m.id=?
            """,
            (msg_id,),
        ).fetchone()
    data_out = dict(row) if row else {"id": msg_id, "content": content, "sender_id": user["id"], "receiver_id": receiver_id}
    data_out["family_id"] = data_out.get("elder_user_id")
    data_out["sender_id"] = data_out.get("from_user_id", user["id"])
    data_out["receiver_id"] = data_out.get("to_user_id", receiver_id)
    data_out["sender_name"] = data_out.get("from_name") or user.get("nickname") or ""
    data_out["receiver_name"] = data_out.get("to_name") or ""
    data_out["read_status"] = data_out.get("status") or "unread"
    return {"success": True, "message": "留言已发送", "data": data_out}


@app.post("/family/voice-message")
async def send_family_voice_message(
    file: UploadFile = File(...),
    receiver_id: int = Query(...),
    duration: int = Query(0),
    user=Depends(current_user),
) -> Dict[str, Any]:
    content = await file.read()
    if not content:
        raise HTTPException(400, detail="语音文件不能为空")
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(400, detail="语音文件不能超过5MB")
    suffix = Path(file.filename or "voice.wav").suffix.lower()
    if suffix not in {".wav", ".mp3", ".aac", ".m4a", ".amr", ".silk"}:
        suffix = ".wav"
    directory = BASE_DIR / "data" / "voice_uploads"
    directory.mkdir(parents=True, exist_ok=True)
    filename = f"v{user['id']}_{hashlib.sha256(content).hexdigest()[:16]}{suffix}"
    (directory / filename).write_bytes(content)
    voice_url = f"/media/voice/{filename}"
    voice_text = str(file.filename or "语音消息")
    with conn() as c:
        binding = assert_bound_peer(c, user, receiver_id)
        elder_user_id = int(binding["elder_user_id"])
        c.execute(
            "INSERT INTO family_messages(elder_user_id,from_user_id,to_user_id,content,message_type,status,created_at) VALUES(?,?,?,?,?,?,?)",
            (elder_user_id, user["id"], receiver_id, voice_url, "voice", "unread", now_iso()),
        )
        msg_id = c.execute("SELECT last_insert_rowid() AS id").fetchone()[0]
        c.commit()
        row = c.execute(
            "SELECT m.*,fu.nickname AS from_name,tu.nickname AS to_name FROM family_messages m JOIN users fu ON fu.id=m.from_user_id JOIN users tu ON tu.id=m.to_user_id WHERE m.id=?",
            (msg_id,),
        ).fetchone()
    data_out = dict(row) if row else {"id": msg_id, "content": voice_url, "sender_id": user["id"], "receiver_id": receiver_id}
    data_out["family_id"] = data_out.get("elder_user_id")
    data_out["sender_id"] = data_out.get("from_user_id", user["id"])
    data_out["receiver_id"] = data_out.get("to_user_id", receiver_id)
    data_out["sender_name"] = data_out.get("from_name") or user.get("nickname") or ""
    data_out["receiver_name"] = data_out.get("to_name") or ""
    data_out["read_status"] = data_out.get("status") or "unread"
    data_out["voice_url"] = voice_url
    data_out["voice_duration"] = duration
    return {"success": True, "message": "语音已发送", "data": data_out}


def normalize_group_message(row: Any) -> Dict[str, Any]:
    d = dict(row)
    message_type = d.get("message_type") or "user"
    avatar = "/assets/ui/assistant_avatar.png" if message_type == "assistant" else ""
    sender_id = safe_int(d.get("sender_id"))
    if sender_id:
        try:
            avatar = get_profile(sender_id).get("avatar") or avatar
        except Exception:
            pass
    return {
        "id": d.get("id"),
        "family_id": d.get("family_id"),
        "sender_id": sender_id,
        "sender_name": d.get("sender_name") or ("小享" if message_type == "assistant" else ""),
        "sender_role": d.get("sender_role") or "",
        "content": d.get("content") or "",
        "message_type": message_type,
        "avatar": avatar,
        "created_at": d.get("created_at") or "",
    }


@app.get("/media/voice/{filename}")
def family_voice_media(filename: str) -> FileResponse:
    safe_name = Path(filename).name
    path = BASE_DIR / "data" / "voice_uploads" / safe_name
    if not path.is_file():
        raise HTTPException(404, detail="语音文件不存在")
    suffix = path.suffix.lower()
    media_type = {".mp3": "audio/mpeg", ".aac": "audio/aac", ".m4a": "audio/mp4", ".amr": "audio/amr", ".wav": "audio/wav"}.get(suffix, "audio/wav")
    return FileResponse(str(path), media_type=media_type)


@app.get("/media/family-chat/{filename}")
def family_chat_media(filename: str) -> FileResponse:
    safe_name = Path(filename).name
    path = BASE_DIR / "data" / "family_chat" / safe_name
    if not path.is_file():
        raise HTTPException(404, detail="图片不存在")
    suffix = path.suffix.lower()
    media_type = {".png": "image/png", ".webp": "image/webp", ".gif": "image/gif"}.get(suffix, "image/jpeg")
    return FileResponse(str(path), media_type=media_type)


@app.post("/family/group-chat/upload")
async def upload_family_chat_image(file: UploadFile = File(...), user=Depends(current_user)) -> Dict[str, Any]:
    content = await file.read()
    if not content:
        raise HTTPException(400, detail="图片不能为空")
    if len(content) > 8 * 1024 * 1024:
        raise HTTPException(400, detail="图片不能超过8MB")
    suffix = Path(file.filename or "chat.jpg").suffix.lower()
    if suffix not in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
        suffix = ".jpg"
    directory = BASE_DIR / "data" / "family_chat"
    directory.mkdir(parents=True, exist_ok=True)
    filename = f"u{user['id']}_{hashlib.sha256(content).hexdigest()[:18]}{suffix}"
    (directory / filename).write_bytes(content)
    return {"ok": True, "url": f"/media/family-chat/{filename}"}


def mark_family_group_read(c, user_id: int, family_id: int, message_id: int) -> None:
    if USE_MYSQL:
        c.execute(
            """INSERT INTO family_group_reads(user_id,family_id,last_read_message_id,updated_at)
               VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE
               last_read_message_id=VALUES(last_read_message_id),updated_at=VALUES(updated_at)""",
            (user_id, family_id, message_id, now_iso()),
        )
    else:
        c.execute(
            """INSERT INTO family_group_reads(user_id,family_id,last_read_message_id,updated_at)
               VALUES(?,?,?,?) ON CONFLICT(user_id,family_id) DO UPDATE SET
               last_read_message_id=excluded.last_read_message_id,updated_at=excluded.updated_at""",
            (user_id, family_id, message_id, now_iso()),
        )


@app.get("/family/group-chat/unread")
def family_group_chat_unread(user=Depends(current_user)) -> Dict[str, Any]:
    with conn() as c:
        members = family_bound_members(c, user)
        family_ids = {
            int(item["family_id"])
            for item in members
            if item.get("family_id") and (
                user.get("role") == "elder" or bool((item.get("permissions") or {}).get("view_group_chat"))
            )
        }
        if user.get("role") == "elder":
            family_ids.add(canonical_elder_family_id(c, int(user["id"])))
        total = 0
        families = []
        for family_id in sorted(family_ids):
            last_row = c.execute(
                "SELECT COALESCE(MAX(id),0) AS last_id FROM family_group_messages WHERE family_id=? AND sender_id!=?",
                (family_id, user["id"]),
            ).fetchone()
            read_row = c.execute(
                "SELECT last_read_message_id FROM family_group_reads WHERE user_id=? AND family_id=?",
                (user["id"], family_id),
            ).fetchone()
            last_id = int(last_row["last_id"] or 0)
            read_id = int(read_row["last_read_message_id"] or 0) if read_row else 0
            count_row = c.execute(
                "SELECT COUNT(*) AS n FROM family_group_messages WHERE family_id=? AND sender_id!=? AND id>?",
                (family_id, user["id"], read_id),
            ).fetchone()
            count = int(count_row["n"] or 0)
            if count:
                families.append({"family_id": family_id, "count": count, "last_message_id": last_id})
                total += count
    return {"ok": True, "count": total, "families": families}


@app.get("/family/group-chat")
def family_group_chat(elder_id: Optional[int] = Query(default=None), user=Depends(current_user)) -> Dict[str, Any]:
    with conn() as c:
        try:
            require_child_family_permission(c, user, elder_id, "view_group_chat")
            family_id = resolve_family_id(c, user, elder_id)
        except HTTPException as e:
            if e.status_code == 400:
                return {"success": True, "items": [], "messages": [], "message": "暂无绑定家人，请先添加家人"}
            raise
        rows = c.execute(
            "SELECT * FROM family_group_messages WHERE family_id=? ORDER BY id ASC LIMIT 200",
            (family_id,),
        ).fetchall()
        members = family_bound_members(c, user)
        last_message_id = max((int(row["id"]) for row in rows), default=0)
        mark_family_group_read(c, int(user["id"]), int(family_id), last_message_id)
        c.commit()
    messages = [normalize_group_message(r) for r in rows]
    return {"success": True, "family_id": family_id, "items": messages, "messages": messages, "members": members}


@app.post("/family/group-chat")
async def send_family_group_chat(data: Dict[str, Any], user=Depends(current_user)) -> Dict[str, Any]:
    content = str(data.get("content") or "").strip()
    if not content:
        raise HTTPException(400, detail="群聊消息不能为空")
    content = content[:800]
    message_type = str(data.get("message_type") or "user").strip()
    if message_type not in {"user", "image", "voice_text"}:
        message_type = "user"
    elder_id = safe_int(data.get("elder_id") or data.get("family_id"))
    created_messages: List[Dict[str, Any]] = []
    with conn() as c:
        require_child_family_permission(c, user, elder_id or None, "view_group_chat")
        family_id = resolve_family_id(c, user, elder_id or None)
        sender_name = user.get("nickname") or ("子女用户" if user.get("role") == "child" else "长辈用户")
        c.execute(
            "INSERT INTO family_group_messages(family_id,sender_id,sender_name,sender_role,content,message_type,created_at) VALUES(?,?,?,?,?,?,?)",
            (family_id, user["id"], sender_name, user.get("role") or "", content, message_type, now_iso()),
        )
        user_msg_id = c.execute("SELECT LAST_INSERT_ID() AS id" if USE_MYSQL else "SELECT last_insert_rowid() AS id").fetchone()[0]
        row = c.execute("SELECT * FROM family_group_messages WHERE id=?", (user_msg_id,)).fetchone()
        created_messages.append(normalize_group_message(row))
        c.commit()

    if message_type == "user" and "@小享" in content:
        question = content.replace("@小享", "").strip() or "请和大家打个招呼。"
        sender_profile = dict(get_profile(int(user["id"])) or {})
        sender_profile.update({
            "role": user.get("role") or sender_profile.get("role") or "elder",
            "nickname": user.get("nickname") or sender_profile.get("nickname") or sender_name,
        })
        result = await ai_gateway.chat_text(
            [
                {"role": "system", "content": "你在颐享智财家庭群聊中回答被@的问题。直接回答，不超过180字，并严格按发问者角色使用对应口吻。"},
                {"role": "user", "content": question},
            ],
            scene="family",
            profile=sender_profile,
            user_id=int(user["id"]),
            temperature=0.4,
        )
        answer = str(result.get("answer") or result.get("reply") or "").strip()
        if not answer or result.get("ok") is False:
            answer = ai_gateway.local_fallback("family", question, sender_profile)
        with conn() as c:
            c.execute(
                "INSERT INTO family_group_messages(family_id,sender_id,sender_name,sender_role,content,message_type,created_at) VALUES(?,?,?,?,?,?,?)",
                (family_id, 0, "小享", "assistant", answer[:1000], "assistant", now_iso()),
            )
            assistant_msg_id = c.execute("SELECT LAST_INSERT_ID() AS id" if USE_MYSQL else "SELECT last_insert_rowid() AS id").fetchone()[0]
            row = c.execute("SELECT * FROM family_group_messages WHERE id=?", (assistant_msg_id,)).fetchone()
            c.commit()
        created_messages.append(normalize_group_message(row))

    return {"success": True, "messages": created_messages, "items": created_messages}


# ------------------------- child collaboration -------------------------

@app.get("/child/elders")
def child_elders(user=Depends(current_user)) -> Dict[str, Any]:
    if user["role"] != "child":
        raise HTTPException(403, detail="请使用子女/家人身份访问")
    with conn() as c:
        rows = c.execute(
            """
            SELECT b.*, u.nickname, u.phone
            FROM family_bindings b
            JOIN users u ON u.id=b.elder_user_id
            WHERE b.child_user_id=? AND b.status='active'
            ORDER BY b.id DESC
            """,
            (user["id"],),
        ).fetchall()
        items = []
        for r in rows:
            d = dict(r)
            perms = c.execute("SELECT permission_key,enabled FROM family_permissions WHERE binding_id=?", (d["id"],)).fetchall()
            d["permissions"] = {p["permission_key"]: bool(p["enabled"]) for p in perms}
            d["unread_alerts"] = c.execute(
                "SELECT COUNT(*) AS n FROM alert_events WHERE elder_user_id=? AND status!='handled' AND level='high'",
                (d["elder_user_id"],),
            ).fetchone()["n"] if d["permissions"].get("receive_alerts") else 0
            d["peer_id"] = int(d["elder_user_id"])
            d["remark"] = remark_for_peer(c, int(user["id"]), int(d["elder_user_id"]))
            d["display_name"] = d["remark"] or d.get("nickname") or "长辈"
            d["relation"] = "长辈"
            items.append(d)
    return {"items": items}


@app.get("/child/elders/{elder_id}/overview")
def child_elder_overview(elder_id: int, user=Depends(current_user)) -> Dict[str, Any]:
    binding = active_binding_for_child(user["id"], elder_id)
    with conn() as c:
        rows = c.execute("SELECT permission_key,enabled FROM family_permissions WHERE binding_id=?", (binding["id"],)).fetchall()
    permissions = {row["permission_key"]: bool(row["enabled"]) for row in rows}
    profile = get_profile(elder_id)
    return {
        "profile_summary": {"nickname": profile.get("nickname"), "risk_preference": profile.get("risk_preference"), "health_status": profile.get("health_status")},
        "asset_summary": portfolio_overview({"id": elder_id}) if permissions.get("view_positions") else {},
        "risk_summary": profile_risk(profile) if permissions.get("receive_alerts") else {},
        "permissions": permissions,
        "safe_note": "子女端仅展示摘要与风险提醒，不能代替长辈转账、购买或修改资产。",
    }


@app.get("/child/elders/{elder_id}/alerts")
def child_elder_alerts(elder_id: int, user=Depends(current_user)) -> Dict[str, Any]:
    active_binding_for_child(user["id"], elder_id, "receive_alerts")
    with conn() as c:
        rows = c.execute("SELECT * FROM alert_events WHERE elder_user_id=? AND level='high' ORDER BY id DESC LIMIT 50", (elder_id,)).fetchall()
    return {"items": [dict(r) for r in rows]}


@app.get("/child/elders/{elder_id}/weekly-report")
def child_elder_weekly(elder_id: int, user=Depends(current_user)) -> Dict[str, Any]:
    binding = active_binding_for_child(user["id"], elder_id)
    with conn() as c:
        if not (
            binding_permission_enabled(c, int(binding["id"]), "view_ledger_summary")
            or binding_permission_enabled(c, int(binding["id"]), "view_positions")
        ):
            raise HTTPException(403, detail="长辈暂未开放该权限")
        report = ensure_weekly_report(c, elder_id)
        c.commit()
    if not report:
        return {"success": True, "report": None, "message": "暂无金融周报数据"}
    for key in ["asset_summary_json", "ledger_summary_json", "position_summary_json", "risk_summary_json"]:
        report[key] = parse_json_value(report.get(key), {})
    return {"success": True, "report": report}


@app.get("/child/elders/{elder_id}/ledger-summary")
def child_elder_ledger(elder_id: int, user=Depends(current_user)) -> Dict[str, Any]:
    active_binding_for_child(user["id"], elder_id, "view_ledger_summary")
    data = ledger_summary(scope="own", elder_id=None, user={"id": elder_id, "role": "elder"})
    data["records"] = data.get("records", [])[:8]
    data["safe_note"] = "这里只展示摘要，子女不能代替长辈进行资金操作。"
    return data


@app.get("/child/elders/{elder_id}/positions")
def child_elder_positions(elder_id: int, user=Depends(current_user)) -> Dict[str, Any]:
    active_binding_for_child(user["id"], elder_id, "view_positions")
    with conn() as c:
        rows = c.execute("SELECT * FROM wealth_positions WHERE user_id=? ORDER BY id DESC", (elder_id,)).fetchall()
    return {"items": [normalize_position(dict(r)) for r in rows], "safe_note": "子女端只读，不提供购买或赎回入口。"}


@app.get("/child/elders/{elder_id}/health-reminders")
def child_elder_health(elder_id: int, user=Depends(current_user)) -> Dict[str, Any]:
    active_binding_for_child(user["id"], elder_id, "view_health")
    source = health_summary({"id": elder_id})
    meds = [
        {
            "id": item.get("id"),
            "name": str(item.get("name") or "未填写药名"),
            "time": str(item.get("time") or ""),
            "dose": str(item.get("dose") or ""),
            "done": bool(item.get("done")),
            "alarm": bool(item.get("alarm")),
        }
        for item in source.get("meds", [])
    ]
    journal = source.get("journal", [])
    meals = [
        {
            "id": item.get("id"),
            "content": str(item.get("content") or "饮食照片记录"),
            "analysis": str(item.get("analysis") or ""),
            "created_at": str(item.get("created_at") or ""),
        }
        for item in journal if str(item.get("kind") or "") == "food"
    ]
    exercises = [
        {
            "id": item.get("id"),
            "content": str(item.get("content") or "运动记录"),
            "analysis": str(item.get("analysis") or ""),
            "created_at": str(item.get("created_at") or ""),
        }
        for item in journal if str(item.get("kind") or "") == "exercise"
    ]
    return {
        "ok": True,
        "meds": meds,
        "meals": meals,
        "exercises": exercises,
        "summary": f"已记录{len(meds)}项用药、{len(meals)}条饮食和{len(exercises)}条运动。",
    }


@app.get("/child/elders/{elder_id}/location")
def child_elder_location(elder_id: int, user=Depends(current_user)) -> Dict[str, Any]:
    active_binding_for_child(user["id"], elder_id, "view_location")
    profile = get_profile(elder_id)
    location = profile.get("last_location") if isinstance(profile.get("last_location"), dict) else {}
    if not location:
        return {"ok": True, "location": None, "message": "长辈暂未保存位置"}
    return {
        "ok": True,
        "location": {
            "latitude": float(location.get("latitude") or 0),
            "longitude": float(location.get("longitude") or 0),
            "address": str(location.get("address") or "已授权位置"),
            "source": str(location.get("source") or "user_authorized"),
            "updated_at": str(profile.get("location_updated_at") or ""),
        },
    }


@app.post("/child/elders/{elder_id}/nudge")
def child_nudge(elder_id: int, data: Dict[str, Any], user=Depends(current_user)) -> Dict[str, Any]:
    active_binding_for_child(user["id"], elder_id, "receive_alerts")
    msg = str(data.get("message") or "家人提醒：遇到转账或陌生链接先别急，先和我确认一下。")[:200]
    with conn() as c:
        c.execute(
            "INSERT INTO alert_events(elder_user_id,event_type,level,title,detail,source,status,created_at) VALUES(?,?,?,?,?,?,?,?)",
            (elder_id, "child_nudge", "low", "家人提醒", msg, "child", "unread", now_iso()),
        )
        c.commit()
    return {"ok": True, "message": "已发送给长辈端"}


@app.post("/child/elders/{elder_id}/explain-to-elder")
async def child_explain_to_elder(elder_id: int, data: Dict[str, Any], user=Depends(current_user)) -> Dict[str, Any]:
    active_binding_for_child(user["id"], elder_id, "view_messages")
    text = str(data.get("text") or data.get("product_text") or "")
    prompt = f"请帮子女生成一段给爸妈解释金融产品或风险的话，80字以内，温和白话，不承诺收益，不诱导购买：{text}"
    ans = await call_llm([{"role": "system", "content": system_prompt(get_profile(elder_id))}, {"role": "user", "content": prompt}])
    return {"message": ans[:220]}


@app.get("/home/elder-dashboard")
def elder_dashboard(user=Depends(current_user)) -> Dict[str, Any]:
    if user["role"] != "elder":
        raise HTTPException(403, detail="请使用长辈身份访问")
    with conn() as c:
        alerts = c.execute("SELECT * FROM alert_events WHERE elder_user_id=? ORDER BY id DESC LIMIT 5", (user["id"],)).fetchall()
        pending = c.execute("SELECT COUNT(*) AS n FROM family_bindings WHERE elder_user_id=? AND status='pending'", (user["id"],)).fetchone()["n"]
    return {
        "profile_summary": get_profile(user["id"]),
        "asset_summary": portfolio_overview(user),
        "ledger_summary": ledger_summary(scope="own", elder_id=None, user=user).get("summary", {}),
        "position_summary": wealth_positions(user).get("items", [])[:3],
        "today_lesson": lesson_today(Request, user) if False else {"title": "每日理财课堂：保本高收益可信吗？", "summary": "高收益先核验，转账先暂停。"},
        "risk_alerts": [dict(r) for r in alerts],
        "family_status": {"pending_bindings": pending},
        "health_reminders": health_summary(user).get("meds", [])[:3],
        "quick_actions": ["问小享", "识别理财产品", "导入微信账单", "生成绑定码"],
    }


@app.get("/home/child-dashboard")
def child_dashboard(user=Depends(current_user)) -> Dict[str, Any]:
    if user["role"] != "child":
        raise HTTPException(403, detail="请使用子女/家人身份访问")
    elders = child_elders(user).get("items", [])
    weekly_reports = []
    health_summaries = []
    latest_messages = []
    urgent_items = []
    with conn() as c:
        for elder in elders:
            permissions = elder.get("permissions") or {}
            if permissions.get("view_ledger_summary") or permissions.get("view_positions"):
                report = ensure_weekly_report(c, elder["elder_user_id"])
                if report:
                    weekly_reports.append({"elder_user_id": elder["elder_user_id"], "summary": report.get("summary", "")})
            if permissions.get("view_messages"):
                msg_rows = c.execute(
                    """
                    SELECT m.*,fu.nickname AS from_name,tu.nickname AS to_name
                    FROM family_messages m
                    JOIN users fu ON fu.id=m.from_user_id
                    JOIN users tu ON tu.id=m.to_user_id
                    WHERE m.elder_user_id=? AND (m.from_user_id=? OR m.to_user_id=?)
                    ORDER BY m.id DESC LIMIT 3
                    """,
                    (elder["elder_user_id"], user["id"], user["id"]),
                ).fetchall()
                latest_messages.extend([dict(r) for r in msg_rows])
            if permissions.get("receive_alerts"):
                rows = c.execute("SELECT * FROM alert_events WHERE elder_user_id=? AND level='high' AND status!='handled' ORDER BY id DESC LIMIT 3", (elder["elder_user_id"],)).fetchall()
                urgent_items.extend([dict(r) for r in rows])
            if permissions.get("view_health"):
                summary = health_summary({"id": elder["elder_user_id"]})
                health_summaries.append({"elder_user_id": elder["elder_user_id"], **summary})
        allowed_message_elders = [int(item["elder_user_id"]) for item in elders if (item.get("permissions") or {}).get("view_messages")]
        if allowed_message_elders:
            placeholders = ",".join("?" for _ in allowed_message_elders)
            message_unread = c.execute(
                f"SELECT COUNT(*) AS n FROM family_messages WHERE to_user_id=? AND status='unread' AND elder_user_id IN ({placeholders})",
                (user["id"], *allowed_message_elders),
            ).fetchone()["n"]
        else:
            message_unread = 0
        c.commit()
    return {
        "bound_elders": elders,
        "total_unread_alerts": sum(int(e.get("unread_alerts", 0)) for e in elders),
        "weekly_reports": weekly_reports,
        "health_summaries": health_summaries,
        "latest_messages": latest_messages[:6],
        "message_unread_count": int(message_unread),
        "urgent_items": urgent_items,
        "quick_actions": ["输入绑定码", "查看风险提醒", "查看家庭周报", "家人消息", "帮爸妈解释产品"],
    }

# ------------------------- health/service/sport/lesson -------------------------

def ensure_health_metrics_table(c) -> None:
    if USE_MYSQL:
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS health_metrics(
              id BIGINT PRIMARY KEY AUTO_INCREMENT,
              user_id BIGINT NOT NULL,
              bp VARCHAR(32) DEFAULT '',
              hr INT DEFAULT 0,
              weight DECIMAL(10,2) DEFAULT 0,
              sleep VARCHAR(32) DEFAULT '',
              steps VARCHAR(32) DEFAULT '',
              updated_at VARCHAR(32) NOT NULL,
              INDEX idx_health_metrics_user(user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """
        )
    else:
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS health_metrics(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id INTEGER NOT NULL,
              bp TEXT DEFAULT '',
              hr INTEGER DEFAULT 0,
              weight REAL DEFAULT 0,
              sleep TEXT DEFAULT '',
              steps TEXT DEFAULT '',
              updated_at TEXT NOT NULL
            )
            """
        )


def ensure_health_journal_table(c) -> None:
    if USE_MYSQL:
        c.execute(
            """CREATE TABLE IF NOT EXISTS health_journal(
                 id BIGINT PRIMARY KEY AUTO_INCREMENT,user_id BIGINT NOT NULL,kind VARCHAR(24) NOT NULL,
                 content TEXT,analysis TEXT,image_path TEXT,created_at VARCHAR(32) NOT NULL,
                 INDEX idx_health_journal_user(user_id,created_at)
               ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"""
        )
    else:
        c.execute(
            """CREATE TABLE IF NOT EXISTS health_journal(
                 id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,kind TEXT NOT NULL,
                 content TEXT,analysis TEXT,image_path TEXT,created_at TEXT NOT NULL
               )"""
        )
def build_health_analysis(health: Dict[str, Any]) -> Dict[str, Any]:
    tips: List[str] = []
    level = "平稳"
    bp = str(health.get("bp") or "")
    hr = int(float(health.get("hr") or 0))
    steps_num = int(float(re.sub(r"[^\d.]", "", str(health.get("steps") or "0")) or 0))
    sleep_num = float(re.sub(r"[^\d.]", "", str(health.get("sleep") or "0")) or 0)
    if not any([bp, hr, steps_num, sleep_num, float(health.get("weight") or 0)]):
        return {"level": "暂无记录", "summary": "暂无健康记录，请由长辈本人填写后再分析。", "tips": []}
    m = re.match(r"(\d{2,3})\D+(\d{2,3})", bp)
    if m:
        high, low = int(m.group(1)), int(m.group(2))
        if high >= 140 or low >= 90:
            level = "需关注"
            tips.append("血压偏高，建议连续记录并联系医生确认用药。")
        elif high < 90 or low < 60:
            level = "需关注"
            tips.append("血压偏低，如头晕乏力请及时联系家人或医生。")
    if hr and (hr > 100 or hr < 55):
        level = "需关注"
        tips.append("心率不在常见平稳范围，若伴随不适请先休息并咨询医生。")
    if sleep_num and sleep_num < 6:
        tips.append("睡眠偏少，建议午后少喝浓茶，睡前减少刷手机。")
    if steps_num and steps_num < 2500:
        tips.append("活动量偏少，可从饭后慢走10到15分钟开始。")
    if not tips:
        tips.append("当前记录整体平稳，继续按时吃药、规律作息并保留医疗备用金。")
    return {
        "level": level,
        "summary": "；".join(tips[:2]),
        "tips": tips[:4],
    }


@app.get("/health/summary")
def health_summary(user=Depends(current_user)) -> Dict[str, Any]:
    with conn() as c:
        ensure_health_metrics_table(c)
        ensure_health_journal_table(c)
        meds_rows = c.execute("SELECT * FROM meds WHERE user_id=? ORDER BY time ASC", (user["id"],)).fetchall()
        row = c.execute("SELECT * FROM health_metrics WHERE user_id=? ORDER BY id DESC LIMIT 1", (user["id"],)).fetchone()
        journal_rows = c.execute("SELECT * FROM health_journal WHERE user_id=? ORDER BY id DESC LIMIT 8", (user["id"],)).fetchall()
    # 将 alarm 字段转为布尔值，兼容旧数据无此字段的情况
    meds_list = []
    for r in meds_rows:
        d = dict(r)
        d["done"] = bool(d.get("done", 0))
        d["alarm"] = bool(d.get("alarm", 0))
        meds_list.append(d)
    health = {
        "bp": (row["bp"] if row else ""),
        "hr": int(row["hr"] if row and row["hr"] else 0),
        "weight": float(row["weight"] if row and row["weight"] else 0),
        "sleep": (row["sleep"] if row else ""),
        "steps": (row["steps"] if row else ""),
    }
    analysis = build_health_analysis(health)
    return {
        "success": True,
        "health": health,
        "summary": analysis.get("summary", ""),
        "level": analysis.get("level", "normal"),
        "health_cards": [
            {"title": "血压", "value": health["bp"] or "暂无记录", "desc": "连续偏高时请联系医生，不要自行加减药。"},
            {"title": "心率", "value": f"{health['hr']}次/分" if health["hr"] else "暂无记录", "desc": "胸闷、心慌或头晕时先休息并联系家人。"},
            {"title": "睡眠", "value": health["sleep"] or "暂无记录", "desc": "睡前少刷手机，保持固定作息。"},
            {"title": "步数", "value": health["steps"] or "暂无记录", "desc": "饭后慢走即可，膝盖不舒服时不要勉强。"},
        ],
        "analysis": analysis,
        "checklist": [
            "早晚量血压并记录异常",
            "用药按医嘱，不随意停药",
            "保留常用医院、药店和家人电话",
            "把医疗备用金和理财资金分开管理",
        ],
        "care_cards": [
            {"title": "慢病复诊", "desc": "高血压、糖尿病等慢病建议按医生要求复诊，复诊前带上最近用药和测量记录。"},
            {"title": "医保与药店", "desc": "买药优先选择医保定点药店，付款前核对药名、规格、数量和金额。"},
            {"title": "紧急联系", "desc": "身体明显不适先联系家人或拨打急救电话，不要独自硬扛。"},
        ],
        "meds": meds_list,
        "journal": [dict(item) for item in journal_rows],
        "tip": "饭后散步15分钟，按时吃药，血压连续异常时及时联系医生。"
    }


@app.post("/health/activity")
async def add_health_activity(data: Dict[str, Any], user=Depends(current_user)) -> Dict[str, Any]:
    content = str(data.get("content") or "").strip()[:500]
    if not content:
        raise HTTPException(400, detail="请填写运动内容和大概时长")
    profile = get_profile(user["id"])
    answer = await call_llm([
        {"role": "system", "content": "你是适老健康生活助手，不诊断疾病、不替代医生。请用80字以内评价运动量，提醒循序渐进、疼痛或不适时停止。"},
        {"role": "user", "content": f"用户画像：{json.dumps(profile, ensure_ascii=False)}\n本次运动：{content}"},
    ], temperature=0.3)
    with conn() as c:
        ensure_health_journal_table(c)
        c.execute(
            "INSERT INTO health_journal(user_id,kind,content,analysis,image_path,created_at) VALUES(?,?,?,?,?,?)",
            (user["id"], "exercise", content, answer, "", now_iso()),
        )
        journal_id = c.execute("SELECT LAST_INSERT_ID() AS id" if USE_MYSQL else "SELECT last_insert_rowid() AS id").fetchone()[0]
        c.commit()
    return {"ok": True, "id": journal_id, "kind": "exercise", "content": content, "analysis": answer, "created_at": now_iso()}


@app.post("/health/meal")
async def add_health_meal(data: Dict[str, Any], user=Depends(current_user)) -> Dict[str, Any]:
    content = str(data.get("content") or "").strip()[:500]
    if not content:
        raise HTTPException(400, detail="请填写这顿饭吃了什么")
    profile = get_profile(user["id"])
    answer = await call_llm([
        {"role": "system", "content": "你是适老健康生活助手，不诊断疾病、不替代医生。请用80字以内评价这顿饭的搭配，用白话给出下一餐建议。"},
        {"role": "user", "content": f"用户画像：{json.dumps(profile, ensure_ascii=False)}\n本次饮食：{content}"},
    ], temperature=0.3)
    with conn() as c:
        ensure_health_journal_table(c)
        c.execute(
            "INSERT INTO health_journal(user_id,kind,content,analysis,image_path,created_at) VALUES(?,?,?,?,?,?)",
            (user["id"], "food", content, answer, "", now_iso()),
        )
        journal_id = c.execute("SELECT LAST_INSERT_ID() AS id" if USE_MYSQL else "SELECT last_insert_rowid() AS id").fetchone()[0]
        c.commit()
    return {"ok": True, "id": journal_id, "kind": "food", "content": content, "analysis": answer, "created_at": now_iso()}


@app.post("/health/food-image")
async def analyze_health_food_image(file: UploadFile = File(...), user=Depends(current_user)) -> Dict[str, Any]:
    content = await file.read()
    if not content:
        raise HTTPException(400, detail="图片不能为空")
    upload_dir = BASE_DIR / "data" / "uploads" / "health"
    upload_dir.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256(content).hexdigest()
    path = upload_dir / f"{digest[:16]}_{Path(file.filename or 'food.jpg').name}"
    path.write_bytes(content)
    profile = get_profile(user["id"])
    prompt = (
        "识别图片里实际看见的食物和大致份量，不要编造。结合当前时间和用户画像，"
        "用适合长辈的白话说明搭配是否均衡、盐油糖是否可能偏多、下一餐怎么调整。"
        "不要诊断疾病，不要替代医生。输出普通中文，不要Markdown。"
        f"\n当前时间：{datetime.now().strftime('%Y-%m-%d %H:%M')}\n用户画像：{json.dumps(profile, ensure_ascii=False)}"
    )
    vision = await call_vision_llm(prompt, content, file.content_type or "image/jpeg", "health_food", user["id"])
    answer = str(vision.get("answer") or vision.get("extracted_text") or "").strip()
    if not answer or vision.get("fallback"):
        return {"ok": False, "message": "这张食物图片暂时没有看清，请换一张光线更好、能看见整盘食物的照片。"}
    with conn() as c:
        ensure_health_journal_table(c)
        c.execute(
            "INSERT INTO health_journal(user_id,kind,content,analysis,image_path,created_at) VALUES(?,?,?,?,?,?)",
            (user["id"], "food", "食物拍照记录", answer, str(path), now_iso()),
        )
        journal_id = c.execute("SELECT LAST_INSERT_ID() AS id" if USE_MYSQL else "SELECT last_insert_rowid() AS id").fetchone()[0]
        c.commit()
    return {"ok": True, "id": journal_id, "kind": "food", "analysis": answer, "created_at": now_iso(), "provider": vision.get("provider")}


@app.put("/health/metrics")
def update_health_metrics(data: HealthMetricsIn, user=Depends(current_user)) -> Dict[str, Any]:
    health = {
        "bp": (data.bp or "").strip() or "128/78",
        "hr": int(data.hr or 0),
        "weight": float(data.weight or 0),
        "sleep": (data.sleep or "").strip() or "6.8小时",
        "steps": (data.steps or "").strip() or "4200",
    }
    with conn() as c:
        ensure_health_metrics_table(c)
        c.execute(
            "INSERT INTO health_metrics(user_id,bp,hr,weight,sleep,steps,updated_at) VALUES(?,?,?,?,?,?,?)",
            (user["id"], health["bp"], health["hr"], health["weight"], health["sleep"], health["steps"], now_iso()),
        )
        c.commit()
    return {"ok": True, "health": health, "analysis": build_health_analysis(health)}

@app.post("/health/meds")
def add_med(data: MedIn, user=Depends(current_user)) -> Dict[str, Any]:
    name = (data.name or "").strip() or "新药提醒"
    tm = (data.time or "").strip() or "08:00"
    dose = (data.dose or "").strip() or "按医嘱"
    alarm = 1 if data.alarm else 0
    with conn() as c:
        c.execute(
            "INSERT INTO meds(user_id,name,time,dose,done,alarm) VALUES(?,?,?,?,0,?)",
            (user["id"], name, tm, dose, alarm)
        )
        c.commit()
    return {"ok": True}

@app.put("/health/meds/{mid}")
def update_med(mid: int, data: MedUpdateIn, user=Depends(current_user)) -> Dict[str, Any]:
    # 构建动态 SQL 更新
    fields = []
    values = []
    if data.done is not None:
        fields.append("done=?")
        values.append(1 if data.done else 0)
    if data.alarm is not None:
        fields.append("alarm=?")
        values.append(1 if data.alarm else 0)
    if data.name is not None and data.name.strip():
        fields.append("name=?")
        values.append(data.name.strip())
    if data.time is not None and data.time.strip():
        fields.append("time=?")
        values.append(data.time.strip())
    if data.dose is not None and data.dose.strip():
        fields.append("dose=?")
        values.append(data.dose.strip())
    if not fields:
        return {"ok": True}
    values.extend([mid, user["id"]])
    sql = f"UPDATE meds SET {', '.join(fields)} WHERE id=? AND user_id=?"
    with conn() as c:
        c.execute(sql, values)
        c.commit()
    return {"ok": True}

@app.delete("/health/meds/{mid}")
def delete_med(mid: int, user=Depends(current_user)) -> Dict[str, Any]:
    with conn() as c:
        c.execute("DELETE FROM meds WHERE id=? AND user_id=?", (mid, user["id"]))
        c.commit()
    return {"ok": True}

@app.get("/service/phones")
def get_phones(user=Depends(current_user)) -> Dict[str, Any]:
    with conn() as c:
        rows = c.execute("SELECT * FROM service_phones WHERE user_id=? ORDER BY id DESC", (user["id"],)).fetchall()
    return {"items": [dict(r) for r in rows]}

@app.post("/service/phones")
def add_phone(data: PhoneIn, user=Depends(current_user)) -> Dict[str, Any]:
    parts = (data.text or "").split()
    name = (data.name or (parts[0] if parts else "") or "常用电话").strip()
    phone = (data.phone or (parts[1] if len(parts) > 1 else "") or "10086").strip()
    phone_type = (data.type or "自定义").strip()
    if not re.sub(r"[^\d+]", "", phone):
        raise HTTPException(status_code=400, detail="电话号码不能为空")
    with conn() as c:
        c.execute("INSERT INTO service_phones(user_id,name,type,phone) VALUES(?,?,?,?)", (user["id"], name, phone_type, phone))
        c.commit()
    return {"ok": True}

@app.delete("/service/phones/{phone_id}")
def delete_phone(phone_id: int, user=Depends(current_user)) -> Dict[str, Any]:
    with conn() as c:
        c.execute("DELETE FROM service_phones WHERE id=? AND user_id=?", (phone_id, user["id"]))
        c.commit()
    return {"ok": True}

@app.get("/sport/today")
def sport_today(user=Depends(current_user)) -> Dict[str, Any]:
    today = date.today().isoformat()
    with conn() as c:
        count = c.execute("SELECT COUNT(*) FROM sport_tasks WHERE user_id=? AND task_date=?", (user["id"], today)).fetchone()[0]
        if count == 0:
            c.executemany("INSERT INTO sport_tasks(user_id,name,minutes,note,done,task_date) VALUES(?,?,?,?,0,?)", [
                (user["id"], "饭后慢走", 15, "以不喘为宜", today),
                (user["id"], "肩颈放松", 8, "坐姿也可做", today),
                (user["id"], "睡前拉伸", 6, "动作要慢", today),
            ])
            c.commit()
        rows = c.execute("SELECT * FROM sport_tasks WHERE user_id=? AND task_date=? ORDER BY id", (user["id"], today)).fetchall()
    tasks = [dict(r) | {"done": bool(r["done"])} for r in rows]
    return {"streak": 6, "recommend": {"title": "饭后慢走15分钟", "desc": "不追求步数，重点是稳定坚持。"}, "tasks": tasks, "tip": "运动前先喝水，膝盖不舒服时减少爬楼和快走。"}

@app.put("/sport/tasks/{tid}")
def sport_done(tid: int, data: Dict[str, Any], user=Depends(current_user)) -> Dict[str, Any]:
    with conn() as c:
        c.execute("UPDATE sport_tasks SET done=? WHERE id=? AND user_id=?", (1 if data.get("done", True) else 0, tid, user["id"]))
        c.commit()
    return {"ok": True}

@app.get("/lesson/today")
def lesson_today(request: Request, user=Depends(current_user)) -> Dict[str, Any]:
    base_url = str(request.base_url).rstrip("/")
    video_options = build_local_lesson_video_options(base_url)
    lesson_video_url = DAILY_LESSON_VIDEO_URL
    lesson_video_title = "每日理财知识视频"

    if not lesson_video_url and video_options:
        lesson_video_url = video_options[0]["url"]
        lesson_video_title = video_options[0]["title"]
    elif lesson_video_url:
        video_options = [{
            "id": "daily_lesson",
            "title": lesson_video_title,
            "url": lesson_video_url
        }] + [item for item in video_options if item["url"] != lesson_video_url]

    return {
        "title": "每日理财课堂：保本高收益可信吗？",
        "summary": "每日一课 · 防诈骗和稳健理财",
        "content": "正规理财不会承诺“稳赚不赔”。如果有人说收益很高、又让您马上转账，先不要操作。\n\n看产品时记住三句话：一看发行机构是否正规，二看风险等级，三看钱什么时候能取出来。",
        "video_title": lesson_video_title,
        "video_url": lesson_video_url,
        "video_poster": DAILY_LESSON_VIDEO_POSTER or "/site/assets/videos/daily_lesson_poster.png",
        "video_tip": "可在下方切换视频课程；若播放失败，则自动显示文字课程。",
        "video_options": video_options
    }

@app.post("/lesson/explain")
async def lesson_explain(data: Dict[str, Any], user=Depends(current_user)) -> Dict[str, Any]:
    p = get_profile(user["id"])
    ans = await call_llm([
        {"role":"system", "content": system_prompt(p)},
        {"role":"user", "content": f"把课程《{data.get('title','每日理财课')}》讲给老人听，120字以内，举一个生活例子。"}
    ])
    return {"answer": ans}


def extract_document_text(filename: str, content: bytes) -> Dict[str, Any]:
    suffix = Path(filename or "").suffix.lower()
    doc_type = suffix.lstrip(".") or "unknown"
    text = ""
    method = "metadata_only"
    if suffix in {".txt", ".md", ".csv", ".tsv", ".json", ".xml", ".html", ".htm"}:
        for enc in ["utf-8", "gb18030", "gbk", "latin-1"]:
            try:
                text = content.decode(enc, errors="ignore")
                method = f"text_decode:{enc}"
                break
            except Exception:
                continue
    elif suffix == ".docx":
        try:
            import zipfile
            import xml.etree.ElementTree as ET
            from io import BytesIO

            with zipfile.ZipFile(BytesIO(content)) as zf:
                xml_data = zf.read("word/document.xml")
            root = ET.fromstring(xml_data)
            parts = [node.text or "" for node in root.iter() if node.tag.endswith("}t")]
            text = "\n".join([p for p in parts if p.strip()])
            method = "docx_xml"
        except Exception:
            text = ""
    elif suffix == ".pdf":
        raw = content[:200000].decode("latin-1", errors="ignore")
        fragments = re.findall(r"\(([^\(\)]{2,200})\)", raw)
        text = "\n".join(fragments[:200])
        method = "pdf_best_effort" if text.strip() else "metadata_only"
    return {
        "filename": filename,
        "type": doc_type,
        "size": len(content),
        "sha256": hashlib.sha256(content).hexdigest(),
        "extracted_text": text[:12000],
        "extraction_method": method,
        "needs_bluelm_review": True,
    }


@app.post("/document/analyze")
async def document_analyze(file: UploadFile = File(...), scene: str = Query(default="finance_document"), user=Depends(current_user)) -> Dict[str, Any]:
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="文件不能为空")
    extracted = extract_document_text(file.filename or "document", content)
    profile = get_profile(user["id"])
    meta = {k: v for k, v in extracted.items() if k != "extracted_text"}
    prompt = (
        "请作为养老金融合规助手，分析这个用户上传的文档。"
        "如果文本不足，请明确说明需要补充截图/OCR或产品说明书原文。"
        "输出：1风险等级 2关键条款 3老人版解释 4子女协助建议 5不能直接购买的原因。"
        f"\n场景：{scene}\n文件元信息：{json.dumps(meta, ensure_ascii=False)}"
        f"\n可读文本：{extracted['extracted_text'] or '未能本地抽取正文，请根据文件类型和元信息给出下一步核验建议。'}"
    )
    answer = await call_llm([
        {"role": "system", "content": system_prompt(profile)},
        {"role": "user", "content": prompt},
    ])
    with conn() as c:
        c.execute(
            "INSERT INTO input_attachments(user_id,scene,input_type,file_path,original_name,mime_type,size,sha256,extracted_text,parsed_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
            (user["id"], scene, "document", "", file.filename or "", file.content_type or "", len(content), extracted["sha256"], extracted["extracted_text"], json.dumps({"answer": answer, "meta": extracted}, ensure_ascii=False), now_iso()),
        )
        c.commit()
    return {"ok": True, "provider_chain": [p["name"] for p in llm_provider_configs()] or ["local"], "document": extracted, "answer": answer}


@app.post("/document/analyze-text")
async def document_analyze_text(data: DocumentAnalyzeIn, user=Depends(current_user)) -> Dict[str, Any]:
    profile = get_profile(user["id"])
    answer = await call_llm([
        {"role": "system", "content": system_prompt(profile)},
        {"role": "user", "content": f"请分析这份{data.scene}文档，输出风险等级、关键条款、老人版解释、子女协助建议。文件名：{data.filename}\n正文：{data.text[:12000]}"},
    ])
    return {"ok": True, "answer": answer, "provider_chain": [p["name"] for p in llm_provider_configs()] or ["local"]}


@app.post("/content/generate-lesson-card")
async def content_generate_lesson_card(data: ContentGenerateIn, user=Depends(current_user)) -> Dict[str, Any]:
    prompt = f"生成一张适合银发用户的小程序理财课堂卡片，主题：{data.topic}。要求返回标题、60字摘要、三个要点、一个温和提醒。资料：{json.dumps(data.facts, ensure_ascii=False)}"
    answer = await call_llm([{"role": "system", "content": system_prompt(get_profile(user["id"]))}, {"role": "user", "content": prompt}], temperature=0.45)
    return {"ok": True, "type": "lesson_card", "topic": data.topic, "content": answer, "provider_chain": [p["name"] for p in llm_provider_configs()] or ["local"]}


@app.post("/content/generate-risk-poster")
async def content_generate_risk_poster(data: ContentGenerateIn, user=Depends(current_user)) -> Dict[str, Any]:
    prompt = f"生成反诈/理财风险海报文案，主题：{data.topic}。返回主标题、副标题、3条短口号、按钮文案、适合小程序海报的视觉建议。禁止承诺收益。"
    answer = await call_llm([{"role": "system", "content": system_prompt(get_profile(user["id"]))}, {"role": "user", "content": prompt}], temperature=0.5)
    return {"ok": True, "type": "risk_poster", "topic": data.topic, "content": answer, "provider_chain": [p["name"] for p in llm_provider_configs()] or ["local"]}


@app.post("/content/generate-lesson-video")
async def content_generate_lesson_video(data: ContentGenerateIn, user=Depends(current_user)) -> Dict[str, Any]:
    prompt = f"为小程序生成60秒银发理财短视频脚本，主题：{data.topic}。返回分镜、旁白、屏幕字幕、风险提示，语言要老人听得懂。"
    answer = await call_llm([{"role": "system", "content": system_prompt(get_profile(user["id"]))}, {"role": "user", "content": prompt}], temperature=0.5)
    return {"ok": True, "type": "lesson_video_script", "topic": data.topic, "script": answer, "provider_chain": [p["name"] for p in llm_provider_configs()] or ["local"]}


@app.post("/content/generate-anti-fraud-video")
async def content_generate_anti_fraud_video(data: ContentGenerateIn, user=Depends(current_user)) -> Dict[str, Any]:
    prompt = f"生成一个反金融诈骗短视频脚本，主题：{data.topic}。必须包含暂停转账、核验官方渠道、找家人商量三个动作。"
    answer = await call_llm([{"role": "system", "content": system_prompt(get_profile(user["id"]))}, {"role": "user", "content": prompt}], temperature=0.45)
    return {"ok": True, "type": "anti_fraud_video_script", "topic": data.topic, "script": answer, "provider_chain": [p["name"] for p in llm_provider_configs()] or ["local"]}

# ------------------------- market / risk text -------------------------

@app.get("/market/daily")
def market_daily(force: bool = False) -> Dict[str, Any]:
    data = fetch_real_market_news(limit=8, force=force)
    data["disclaimer"] = "资讯仅供风险教育和市场了解，不构成投资建议。"
    return data

def weather_suggestion(weather: str, temperature: Any = "") -> str:
    text = str(weather or "")
    try:
        temp = float(str(temperature).replace("℃", "").strip())
    except Exception:
        temp = None
    if "雨" in text or "雪" in text:
        return "出门请带伞，雨雪天路滑，建议穿防滑鞋，必要时让家人陪同。"
    if temp is not None and temp >= 32:
        return "天气偏热，老人尽量避开中午外出，多喝水，随身带好常用药。"
    if temp is not None and temp <= 5:
        return "天气偏冷，注意保暖，早晚外出慢一点，避免长时间在室外停留。"
    if any(word in text for word in ["霾", "沙", "尘", "污染"]):
        return "空气不太好，建议减少户外停留，外出可戴口罩。"
    return "天气适合查看今日资讯和安排附近服务，外出前记得带好手机和证件。"


def fallback_weather(city: str = "天津") -> Dict[str, Any]:
    return {"ok":False,"success":False,"city":city,"weather":"暂未取得天气","temperature":"","temp":"","wind":"","humidity":"","update_time":"","suggestion":"请以当地气象服务的实际预报为准。","source":"unavailable","message":"天气服务暂未返回真实数据"}


def open_meteo_weather(city: str, latitude: float, longitude: float) -> Dict[str, Any]:
    code_map = {
        0: "晴",
        1: "晴间多云",
        2: "多云",
        3: "阴",
        45: "雾",
        48: "雾",
        51: "小雨",
        53: "小雨",
        55: "中雨",
        61: "小雨",
        63: "中雨",
        65: "大雨",
        71: "小雪",
        73: "中雪",
        75: "大雪",
        80: "阵雨",
        81: "阵雨",
        82: "强阵雨",
        95: "雷阵雨",
    }
    with httpx.Client(timeout=DATA_API_TIMEOUT) as client:
        r = client.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": latitude,
                "longitude": longitude,
                "current": "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m",
                "timezone": "Asia/Shanghai",
            },
        )
        r.raise_for_status()
        payload = r.json()
    current = payload.get("current") or {}
    temp = current.get("temperature_2m")
    humidity = current.get("relative_humidity_2m")
    code = int(current.get("weather_code") or 0)
    weather = code_map.get(code, "多云")
    temp_text = f"{temp}℃" if temp not in ["", None] else ""
    humidity_text = f"{humidity}%" if humidity not in ["", None] else ""
    wind = current.get("wind_speed_10m")
    wind_text = f"{wind}km/h" if wind not in ["", None] else "微风"
    return {
        "ok": True,
        "success": True,
        "city": city or "当前区域",
        "weather": weather,
        "temperature": temp_text,
        "temp": temp_text,
        "wind": wind_text,
        "humidity": humidity_text,
        "update_time": str(current.get("time") or now_iso())[:16].replace("T", " "),
        "suggestion": weather_suggestion(weather, temp),
        "source": "real",
    }


@app.get("/weather/today")
def weather_today(
    city: str = Query(default="天津"),
    latitude: float = Query(default=39.0851),
    longitude: float = Query(default=117.1994),
    lat: Optional[float] = Query(default=None),
    lng: Optional[float] = Query(default=None),
) -> Dict[str, Any]:
    latitude = lat if lat is not None else latitude
    longitude = lng if lng is not None else longitude
    try:
        if TENCENT_MAP_KEY:
            with httpx.Client(timeout=DATA_API_TIMEOUT) as client:
                r = client.get(
                    "https://apis.map.qq.com/ws/weather/v1/",
                    params={"location": f"{latitude},{longitude}", "key": TENCENT_MAP_KEY},
                )
                r.raise_for_status()
                payload = r.json()
            if int(payload.get("status", -1)) == 0:
                realtime = (payload.get("result") or {}).get("realtime") or {}
                if isinstance(realtime, list):
                    realtime = realtime[0] if realtime else {}
                infos = realtime.get("infos") if isinstance(realtime, dict) else {}
                if isinstance(infos, dict) and infos:
                    realtime = {**realtime, **infos}
                weather = realtime.get("weather") or realtime.get("text") or "晴"
                temp = realtime.get("temperature", realtime.get("temp", ""))
                humidity = realtime.get("humidity", "")
                wind = " ".join(str(v) for v in [realtime.get("wind_direction"), realtime.get("wind_power")] if v)
                temp_text = f"{temp}℃" if temp not in ["", None] and "℃" not in str(temp) else str(temp or "")
                humidity_text = f"{humidity}%" if humidity not in ["", None] and "%" not in str(humidity) else str(humidity or "")
                return {
                    "ok": True,
                    "success": True,
                    "city": city or "当前区域",
                    "weather": str(weather),
                    "temperature": temp_text,
                    "temp": temp_text,
                    "wind": wind or "微风",
                    "humidity": humidity_text,
                    "update_time": str(realtime.get("update_time") or now_iso())[:16].replace("T", " "),
                    "suggestion": weather_suggestion(str(weather), temp),
                    "source": "real",
                }
        return open_meteo_weather(city, latitude, longitude)
    except Exception as exc:
        data = fallback_weather(city)
        data["message"] = "天气API调用失败，已使用兜底天气"
        data["error_summary"] = type(exc).__name__
        return data


@app.post("/risk/text-check")
async def risk_text_check(data: GenericTextIn, user=Depends(current_user)) -> Dict[str, Any]:
    p = get_profile(user["id"])
    ans = await call_llm([
        {"role":"system", "content": system_prompt(p)},
        {"role":"user", "content": f"判断这段话是否像金融诈骗，给出风险等级和处理建议：{data.text}"}
    ])
    return {"answer": ans}


@app.get("/integrations/status")
def integrations_status() -> Dict[str, Any]:
    ai_status = ai_gateway.status()
    return {
        "wechat_login": {
            "configured": bool(WECHAT_APPID and WECHAT_SECRET),
            "mode": "official_code2session" if WECHAT_APPID and WECHAT_SECRET else "not_configured",
        },
        "llm": {
            "configured": bool(ai_status.get("configured_providers")),
            "providers": ai_status.get("configured_providers", []),
            "provider_order": ai_status.get("provider_order", []),
            "strict": STRICT_LLM,
            "local_fallback": ai_status.get("local_fallback", True),
        },
        "vivo_bluelm": {
            "configured": bool(ai_status.get("configured", {}).get("vivo_bluelm")),
            "base_url_configured": bool(BLUELM_BASE_URL),
            "model_configured": bool(BLUELM_TEXT_MODEL),
            "vision_model_configured": bool(BLUELM_VISION_MODEL),
            "auth_mode": BLUELM_AUTH_MODE,
            "gateway_configured": bool(VIVO_APP_ID and (VIVO_APP_KEY or VIVO_SECRET_KEY)),
            "bearer_configured": bool(BLUELM_API_KEY),
            "endpoint_path": BLUELM_ENDPOINT_PATH,
        },
        "vision": {
            "configured": bool(ai_status.get("vision_configured")),
            "provider": next(iter(ai_status.get("vision_providers",[])),"not_configured"),
            "providers": ai_status.get("vision_providers",[]),
            "fallback": "empty_result_with_error_message",
            "scenes": ["finance_product", "ledger_wechat", "general_image"],
        },
        "speech": {
            "configured": bool(ai_status.get("asr_configured") or ai_status.get("tts_configured")),
            "asr": bool(ai_status.get("asr_configured")),
            "tts": bool(ai_status.get("tts_configured")),
            "fallback": "ok_false_with_text_hint_no_frontend_crash",
        },
        "asr": asr_gateway.status(),
        "weather": {
            "configured": bool(TENCENT_MAP_KEY),
            "source": "real" if TENCENT_MAP_KEY else "real_no_key_or_fallback",
            "last_ok": True,
            "fallback": True,
        },
        "ocr": {
            "configured": True,
            "providers": ["cloud_vision", "rapidocr_local"],
            "cloud_configured": bool(ai_status.get("ocr_configured")),
            "local_configured": True,
            "fallback": "真实本地OCR；识别不到时提示重新上传，不生成默认内容",
        },
        "lbs": {"configured": bool(ai_status.get("lbs_configured")), "coordinate_system":"gcj02", "route_provider":"tencent_directions", "fallback":"manual_address_selection_no_fabricated_route"},
        "news":{"source":"public_official_feeds","sources":["中国政府网","中国人民银行"],"refresh_interval_seconds":600,"fallback":"cached_headlines_with_original_dates_or_empty"},
        "juhe": {
            "finance_configured": bool(JUHE_FINANCE_URL and JUHE_FINANCE_KEY),
            "bulletin_configured": bool(JUHE_BULLETIN_URL and JUHE_BULLETIN_KEY),
            "finance_url": JUHE_FINANCE_URL,
            "bulletin_url": JUHE_BULLETIN_URL,
        },
        "market_sources": configured_market_sources(),
        "database": "mysql" if USE_MYSQL else "sqlite",
    }


@app.get("/healthz")
def healthz() -> Dict[str, Any]:
    ai_status = ai_gateway.status()
    return {
        "ok": True,
        "status": "ok",
        "llm_configured": bool(ai_status.get("configured_providers")),
        "llm_provider_order": ai_status.get("provider_order", []),
        "llm_providers": ai_status.get("configured_providers", []),
        "local_fallback": ai_status.get("local_fallback", True),
        "vivo_bluelm_configured": bool(ai_status.get("configured", {}).get("vivo_bluelm")),
        "vivo_bluelm_auth_mode": BLUELM_AUTH_MODE,
        "vivo_bluelm_vision_configured": bool(ai_status.get("vision_configured")),
        "baidu_speech_configured": bool(ai_status.get("asr_configured") or ai_status.get("tts_configured")),
        "wechat_login_configured": bool(WECHAT_APPID and WECHAT_SECRET),
        "juhe_bulletin_configured": bool(JUHE_BULLETIN_URL and JUHE_BULLETIN_KEY),
        "juhe_finance_configured": bool(JUHE_FINANCE_URL and JUHE_FINANCE_KEY),
        "ocr_configured": True,
        "lbs_configured": bool(ai_status.get("lbs_configured")),
        "finance_data_configured": bool(ai_status.get("finance_data_configured")),
        "market_sources": configured_market_sources(),
        "database": "mysql" if USE_MYSQL else "sqlite",
        "db_path": str(DB_PATH) if not USE_MYSQL else "",
    }

# Web platform static app; the original API remains unchanged.
from fastapi.staticfiles import StaticFiles
app.mount("/web", StaticFiles(directory=str(BASE_DIR.parent / "site"), html=True), name="web")


# Web 1:1 responsive adapter: original WeChat mini-program business API remains unchanged.
from fastapi.staticfiles import StaticFiles
WEB_SITE_DIR = PROJECT_DIR / "site"
if WEB_SITE_DIR.is_dir():
    app.mount("/site", StaticFiles(directory=str(WEB_SITE_DIR), html=True), name="yixiang_site")


@app.get("/lbs/static-map")
def lbs_static_map(latitude: float = Query(ge=-85, le=85), longitude: float = Query(ge=-180, le=180), zoom: int = Query(default=14, ge=4, le=18), width: int = Query(default=640, ge=50, le=1000), height: int = Query(default=360, ge=50, le=800), user=Depends(current_user)):
    from app.map_adapter import static_map
    return static_map(latitude, longitude, zoom, width, height)


@app.get("/lbs/convert-coordinates")
def convert_coordinates(latitude: float = Query(ge=-85,le=85), longitude: float = Query(ge=-180,le=180), user=Depends(current_user)):
    from app.services.geo_gateway import convert
    return convert(latitude,longitude)

@app.get("/lbs/route")
def walking_route(start_latitude: float = Query(ge=-85,le=85), start_longitude: float = Query(ge=-180,le=180), latitude: float = Query(ge=-85,le=85), longitude: float = Query(ge=-180,le=180), user=Depends(current_user)):
    from app.services.geo_gateway import walking
    return walking(start_latitude,start_longitude,latitude,longitude)
