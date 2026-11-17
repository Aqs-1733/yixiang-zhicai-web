"""One MySQL connection layer for business records and AI audit logs.

SQLite is accepted only by the offline migration utility, never at runtime.
Question-mark parameters are retained at call sites; literals are not rewritten.
"""
from __future__ import annotations

import os
import threading
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

import pymysql
from dotenv import load_dotenv
from pymysql.cursors import DictCursor

BASE_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BASE_DIR.parent / '.env')
load_dotenv(BASE_DIR / '.env', override=False)


def connection_settings() -> dict:
    url = os.getenv('DATABASE_URL', '').strip()
    settings = dict(host=os.getenv('MYSQL_HOST', '127.0.0.1'),
                    port=int(os.getenv('MYSQL_PORT', '3306')),
                    user=os.getenv('MYSQL_USER', 'yixiang_app'),
                    password=os.getenv('MYSQL_PASSWORD', ''),
                    database=os.getenv('MYSQL_DATABASE', 'yixiang_zhicai'))
    if url:
        parsed = urlparse(url.replace('mysql+pymysql://', 'mysql://', 1))
        if parsed.scheme != 'mysql':
            raise RuntimeError('数据库现已统一为 MySQL，请修改 backend/.env 中的 DATABASE_URL 或 MYSQL_* 配置')
        settings.update(host=parsed.hostname or '127.0.0.1', port=parsed.port or 3306,
                        user=unquote(parsed.username or ''), password=unquote(parsed.password or ''),
                        database=unquote(parsed.path.lstrip('/')))
        query = parse_qs(parsed.query)
        if query.get('ssl_ca'):
            settings['ssl'] = {'ca': query['ssl_ca'][0], 'check_hostname': True}
    if not settings['database'] or not settings['user']:
        raise RuntimeError('MySQL 数据库名和用户名不能为空')
    return dict(settings, charset='utf8mb4', cursorclass=DictCursor, autocommit=False,
                connect_timeout=5, read_timeout=30, write_timeout=30,
                init_command="SET time_zone = '+08:00'")


class DictRow(dict):
    def __getitem__(self, key):
        return list(self.values())[key] if isinstance(key, int) else super().__getitem__(key)


def _value(value):
    # Preserve the pre-migration JSON contract and Python arithmetic at API call sites.
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value


def parameter_sql(sql: str) -> str:
    result = []
    quote = None
    escaped = False
    for char in sql:
        if char == '%':
            result.append('%%')
        elif char == '?' and quote is None:
            result.append('%s')
        else:
            result.append(char)
        if escaped:
            escaped = False
        elif char == '\\' and quote:
            escaped = True
        elif char in "'\"`":
            if quote == char:
                quote = None
            elif quote is None:
                quote = char
    return ''.join(result)


class MySQLCursor:
    def __init__(self, raw):
        self.raw = raw

    def execute(self, sql, params=None):
        self.raw.execute(parameter_sql(sql), () if params is None else params)
        return self

    def executemany(self, sql, rows):
        self.raw.executemany(parameter_sql(sql), rows)
        return self

    @property
    def lastrowid(self):
        return self.raw.lastrowid

    @property
    def rowcount(self):
        return self.raw.rowcount

    def fetchone(self):
        row = self.raw.fetchone()
        return DictRow({k: _value(v) for k, v in row.items()}) if row is not None else None

    def fetchall(self):
        return [DictRow({k: _value(v) for k, v in row.items()}) for row in self.raw.fetchall()]


class MySQLConnection:
    def __init__(self):
        self.raw = pymysql.connect(**connection_settings())
        self._cursors = []

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        try:
            if exc_type:
                self.raw.rollback()
        finally:
            for cursor in self._cursors:
                cursor.raw.close()
            self.raw.close()

    def execute(self, sql, params=None):
        cursor = MySQLCursor(self.raw.cursor())
        self._cursors.append(cursor)
        return cursor.execute(sql, params)

    def executemany(self, sql, rows):
        cursor = MySQLCursor(self.raw.cursor())
        self._cursors.append(cursor)
        return cursor.executemany(sql, rows)

    def commit(self):
        self.raw.commit()

    def rollback(self):
        self.raw.rollback()


def conn():
    return MySQLConnection()


_schema_lock = threading.Lock()
_schema_ready = False


def initialize_schema():
    global _schema_ready
    if _schema_ready:
        return
    with _schema_lock:
        if _schema_ready:
            return
        schema = (BASE_DIR / 'schema' / 'mysql.sql').read_text(encoding='utf-8')
        schema = '\n'.join(line for line in schema.splitlines() if not line.lstrip().startswith('--'))
        with conn() as c:
            for statement in schema.split(';'):
                if statement.strip():
                    c.execute(statement)
            c.commit()
        _schema_ready = True


def readiness():
    with conn() as c:
        c.execute('SELECT 1 AS ready').fetchone()
    return True
