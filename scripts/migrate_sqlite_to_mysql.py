"""Read-only SQLite snapshot -> empty MySQL schema, with per-row verification.

Credentials come from --env-file (ignored by Git) or the process environment.
The source is never modified. A populated target is rejected, not overwritten.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sqlite3
import sys
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))


def identifier(value):
    if not re.fullmatch(r'[A-Za-z_][A-Za-z_0-9]*', value):
        raise ValueError('Unexpected SQL identifier')
    return '`' + value + '`'


def normalized(value, kind):
    if value is None:
        return None
    if kind == 'json':
        return json.loads(value) if isinstance(value, str) else value
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if kind in {'decimal', 'double', 'float', 'real', 'bigint', 'int', 'tinyint', 'smallint', 'mediumint'}:
        return str(Decimal(str(value)).normalize())
    return str(value)


def digest(rows, columns, kinds):
    normalized_rows = [[normalized(row[col], kinds[col]) for col in columns] for row in rows]
    # Sort canonical rows so verification does not depend on the query plan.
    data = sorted(json.dumps(r, ensure_ascii=False, sort_keys=True, separators=(',', ':')) for r in normalized_rows)
    return hashlib.sha256('\n'.join(data).encode('utf-8')).hexdigest()


def migrate(source, report_path):
    from app.database import conn, initialize_schema
    source = source.resolve(strict=True)
    original_hash = hashlib.sha256(source.read_bytes()).hexdigest()
    disk = sqlite3.connect(source.as_uri() + '?mode=ro', uri=True)
    snapshot = sqlite3.connect(':memory:')
    disk.backup(snapshot)
    disk.close()
    snapshot.row_factory = sqlite3.Row
    names = [r[0] for r in snapshot.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
    names.sort(key=lambda t: (t != 'users', t))
    initialize_schema()
    results = []
    sequences = {}
    if snapshot.execute("SELECT 1 FROM sqlite_master WHERE name='sqlite_sequence'").fetchone():
        sequences = dict(snapshot.execute('SELECT name,seq FROM sqlite_sequence'))
    with conn() as c:
        targets = [r['TABLE_NAME'] for r in c.execute('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()').fetchall()]
        for table in targets:
            if c.execute('SELECT COUNT(*) AS n FROM ' + identifier(table)).fetchone()['n']:
                raise RuntimeError('Target must be empty: ' + table)
        # All rows are one transaction; foreign keys remain enabled.
        for table in names:
            if table not in targets:
                raise RuntimeError('Source table is not in the MySQL schema: ' + table)
            columns = [r['name'] for r in snapshot.execute('PRAGMA table_info(' + identifier(table) + ')')]
            info = c.execute('SELECT COLUMN_NAME,DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?', (table,)).fetchall()
            kinds = {r['COLUMN_NAME']: r['DATA_TYPE'] for r in info}
            if set(columns) - kinds.keys():
                raise RuntimeError('Unmapped source columns: ' + table)
            rows = snapshot.execute('SELECT * FROM ' + identifier(table)).fetchall()
            if rows:
                c.executemany('INSERT INTO ' + identifier(table) + '(' + ','.join(map(identifier, columns)) + ') VALUES(' + ','.join('?' for _ in columns) + ')',
                              [tuple(row[col] for col in columns) for row in rows])
            actual = c.execute('SELECT ' + ','.join(map(identifier, columns)) + ' FROM ' + identifier(table)).fetchall()
            before = digest(rows, columns, kinds)
            after = digest(actual, columns, kinds)
            if len(actual) != len(rows) or before != after:
                raise RuntimeError('Row verification failed; rolling back: ' + table)
            results.append(dict(table=table, rows=len(rows), source_digest=before, target_digest=after, verified=True))
        if hashlib.sha256(source.read_bytes()).hexdigest() != original_hash:
            raise RuntimeError('Source changed during migration; retry after stopping writers')
        c.commit()
        # Preserve deleted ID high-water marks as well as all current primary keys.
        for table, seq in sequences.items():
            if table in targets:
                c.execute('ALTER TABLE ' + identifier(table) + ' AUTO_INCREMENT=' + str(int(seq) + 1))
    snapshot.close()
    result = dict(status='verified', source=str(source), source_sha256=original_hash,
                  source_unchanged=True, tables=len(results), rows=sum(r['rows'] for r in results), details=results)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print('MIGRATION_VERIFIED tables=' + str(result['tables']) + ' rows=' + str(result['rows']) + ' source_unchanged=true')
    return result


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source', required=True, type=Path)
    p.add_argument('--env-file', type=Path)
    p.add_argument('--report', required=True, type=Path)
    a = p.parse_args()
    if a.env_file:
        from dotenv import load_dotenv
        load_dotenv(a.env_file, override=True)
    migrate(a.source, a.report)


if __name__ == '__main__':
    main()
