# MySQL 部署与迁移

## 当前方式

运行时只使用 MySQL。账户、账本、画像、持仓、健康、家庭权限/消息、风险记录、周报、AI调用日志共用 `app.database` 连接层。`backend/schema/mysql.sql` 包含35张 InnoDB / utf8mb4 表，应用启动时幂等创建，不自动生成默认账号。

`scripts/migrate_sqlite_to_mysql.py` 是唯一保留 SQLite 读取的离线工具，用于迁移旧数据。它不会让网站继续使用 SQLite，也不会改动源文件。新闻的公共抓取缓存、视频、上传的图片和语音仍为文件，不是另一套业务数据库。

## 建库与配置

由数据库管理员创建空库和专用账号。示例中的占位密码必须自行替换，不把密码提交到仓库：

```sql
CREATE DATABASE yixiang_zhicai CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;
CREATE USER 'yixiang_app'@'127.0.0.1' IDENTIFIED BY 'REPLACE_WITH_YOUR_PRIVATE_PASSWORD';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES
  ON yixiang_zhicai.* TO 'yixiang_app'@'127.0.0.1';
```

在被Git忽略的 `backend/.env` 填写 `MYSQL_HOST`、`MYSQL_PORT`、`MYSQL_DATABASE`、`MYSQL_USER`、`MYSQL_PASSWORD`，并将 `DATABASE_URL` 留空；也可单独使用 `mysql+pymysql://...` 连接URL，用户名和密码须URL编码。云数据库可用URL的 `ssl_ca` 参数指定本机CA证书。账号来源主机限制应按实际部署调整，不给应用root账号。

```powershell
.\.venv\Scripts\python.exe scripts\check_mysql.py
.\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8004
```

`/healthz` 通过实际 `SELECT 1` 检查连接，正常返回 `database: mysql`、`database_ready: true`。错误配置会阻止启动，不回退到空的SQLite库。导入旧API配置时会保留现有MySQL配置，不再复制旧DB_PATH。

## 迁移现有数据

1. 停止旧网站的写入进程，保留原源码、私有.env、数据库和上传文件的备份。
2. 连接**空的目标MySQL库**，不要把测试脚本指向已有业务库。
3. 执行迁移，报告放在仓库外的私人目录：

```powershell
.\.venv\Scripts\python.exe scripts\migrate_sqlite_to_mysql.py `
  --source 'D:\PRIVATE_BACKUP\yixiang.db' `
  --env-file 'D:\PRIVATE_CONFIG\mysql.env' `
  --report 'D:\PRIVATE_BACKUP\migration-report.json'
```

工具使用只读SQLite连接建立一致性快照；保留用户ID、密码散列、消息、授权、JSON、日期和自增高水位。所有数据写入一个事务，逐表按全部原列对比规范化行摘要，检查行数。无法映射的表/列、精度变化或校验不一致会终止并回滚，不静默丢弃。目标中有记录时直接拒绝覆盖。表结构的DDL在数据事务之前完成，失败后可能保留空表，原数据不受影响。

4. 校验报告全部通过后切换网站的私有配置，启动新服务；测试现有账号信息和业务读取。再次执行迁移不会覆盖已经迁入的记录。

事务和utf8mb4取值遵循 [MySQL SQL模式说明](https://dev.mysql.com/doc/refman/8.0/en/sql-mode.html) 与 [Unicode字符集说明](https://dev.mysql.com/doc/refman/8.0/en/charset-unicode-sets.html)。保留严格模式，金额用DECIMAL，日期用DATE。兼容层将返回值转为原API的数字/ISO日期，JSON仍保持原接口结构。

## 本机与公网服务器

本机运行只需要本机的MySQL和Python服务持续开启，现有电脑可以测试，不必为本机测试购买云服务器。本次本机实例的数据放在D盘，连接仅绑定127.0.0.1，不改动其他项目的MySQL服务。

给其他人正式使用时，需要持续在线的后端运行环境、MySQL、上传文件存储、HTTPS和域名配置。可同机运行后端与MySQL，也可连接独立/托管MySQL；数据库端口只开放给后端网络，不直接暴露给浏览器。GitHub公开仓库用于分享源码，GitHub Pages不能运行这里的Python后端和MySQL。麦克风、定位等网页功能也需要合适的HTTPS访问环境（本机localhost例外）。

公开模板中没有可用密码或API密钥。fork后需要配置自己的数据库与API。公开源码、建表SQL和迁移工具可以提交；`.env`、数据库导出、凭据文件、上传资料、私有备份均应单独保管。

## 备份与回滚

- 使用数据库工具制作一致性MySQL备份，凭据放入本机受控配置，避免明文命令参数；同时备份上传目录。不要把含数据的SQL导出放进Git。
- 本轮切换前的原SQLite与私有配置均保留在本机独立证据目录，回滚脚本在独立副本验证，不覆盖正在运行的网站。
- 切换以后新产生的数据只在MySQL。若未来要回退旧版，先停止写入、导出MySQL新增数据并制定合并方案，不能直接恢复旧SQLite而丢弃新记录。
- 本机现有MySQL二进制版本较旧；正式公网部署前需使用维护中的MySQL版本，并另做备份恢复、权限、负载和安全验收。本轮迁移通过不等于全站所有历史问题已经解决。
