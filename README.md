# 颐享智财 Web

微信小程序迁移的完整 Web 项目：FastAPI + SQLite + 原页面兼容运行层。保留 **30 个业务页面、5 个原组件**及暖黄、薄荷绿、橙色适老化视觉；没有用简化网站替换原项目。

## 结构

- `backend/app/main.py`：账户、画像、理财、账本、持仓、家庭协同、健康和生活服务。
- `backend/app/routers/assistant.py`：问答、图片、ASR、TTS。
- `backend/app/services/`：AI 网关、OCR、语音、风险与资金分配。
- `miniprogram/`：全部原始页面、组件、业务逻辑与素材。
- `site/`：Web 页面模板、业务模块、兼容层与原视觉/动效资源。
- `tests/local_acceptance/`：HTTP、Edge/Playwright、回归和暂存区审计脚本。
- `LOCAL_ACCEPTANCE.md`、`FUNCTION_ACCEPTANCE_MATRIX.md`：本轮事实性验收记录与边界。

## 本地启动（Windows / Python 3.12）

在 D 盘项目目录运行，依赖和缓存留在项目盘，不改变全局 Python 设置：

```powershell
py -3.12 -m venv .venv
$env:PIP_CACHE_DIR="$PWD\.cache\pip"
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
Copy-Item backend\.env.example backend\.env
# 在本地编辑 backend\.env，填写自己的配置；不要粘贴到聊天或前端代码。
.\启动网站.bat
```

网站 `http://127.0.0.1:8000/site/`；文档 `/docs`；本地状态 `/healthz`；配置状态 `/integrations/status`。后两项只反映服务/配置状态，不证明外部 API 已成功。

手动启动：

```powershell
Set-Location backend
..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

SQLite 路径为 `backend/app/data/yixiang.db`；`DB_PATH=app/data/yixiang.db` 相对于 backend 解析。首次初始化会建立表和演示内容。演示账户仅供本机测试；正式部署前更换默认密码、JWT_SECRET 与各服务凭证。

## 两种角色和功能

- 长辈：注册、密码登录、密保找回、问小享、多模态识别、风险问卷、理财认知/核验、账本/导入、持仓/画像、健康、生活服务、家庭授权和消息。
- 子女：用长辈的六位绑定码注册或绑定，在授权范围内读取资产、账本、健康、位置、预警和周报；参与家庭私信/群聊。权限由后端核验，前端隐藏按钮不代替权限检查。
- 网页手机号登录与微信小程序 `wx.login` 不等同。浏览器版微信按钮保留明确提示；没有假装实现网页微信 OAuth。

## API 配置

所有凭证仅填在被忽略的 `backend/.env`：

| 服务 | 配置字段 | 本轮实测 |
|---|---|---|
| 豆包/方舟 | ARK_API_KEY、ARK_BASE_URL、ARK_MODEL | 当前配置端点关闭，需在方舟控制台启用有效端点/模型 |
| vivo 蓝心 | BLUELM_BASE_URL、BLUELM_ENDPOINT_PATH、BLUELM_TEXT_MODEL、授权模式及对应凭证 | 当前 URL 返回404；需核对控制台对应产品的接口与授权方式 |
| 百度语音 | BAIDU_API_KEY、BAIDU_SECRET_KEY | OAuth、TTS、ASR及后端上传链路成功 |
| 聚合资讯 | JUHE_BULLETIN_KEY、JUHE_BULLETIN_URL | 10001：请求 Key 错误，重新获取对应资讯产品 Key |
| 聚合金融 | JUHE_FINANCE_KEY、JUHE_FINANCE_URL | 10020：接口维护；先核对服务恢复/可用接口，不据此判定 Key 过期 |
| 腾讯位置服务 | TENCENT_MAP_KEY | 地址解析、附近服务后端链路成功；天气返回真实来源 |
| 银行产品数据 | BANK_PRODUCTS_URL、BANK_API_KEY | 缺失，保持未启用；本地检索不等于银行官方数据 |
| 微信支付 | 商户号、API v3 密钥、证书序列号 | 配置缺失，WECHAT_PAY_ENABLED=0 |

模型名称、端点路径和授权模式以本人服务控制台为准，模板中的示例不是可用性保证。不要把小程序 AppSecret 当作 Web OAuth 凭证。

## 验收与复现

本轮自动功能检查 359/360 通过；唯一失败为交接包缺失课程 MP4，`/media/daily_lesson.mp4` 返回404。第三方烟雾测试独立计数，不计入本地功能通过数。文字聊天可用的本地兜底不代表云模型成功。图片识别中的本地 OCR 成功不代表云视觉成功。

```powershell
.\.venv\Scripts\python.exe 验证工程.py
# 业务测试只指向独立测试数据库服务器8001，禁止改为私人运行服务8000。
.\.venv\Scripts\python.exe tests\local_acceptance\api_acceptance.py
.\.venv\Scripts\python.exe tests\local_acceptance\browser_acceptance.py
.\.venv\Scripts\python.exe tests\local_acceptance\regression.py
.\.venv\Scripts\python.exe tests\local_acceptance\term_acceptance.py
```

浏览器测试另需 `pip install playwright`，本轮使用本机 Edge，无需下载另一套浏览器。测试脚本用 `YX_EVIDENCE_DIR` 指定隔离证据目录，合成账号与 Token 仅保存在该目录，截图被 Git 忽略。`api_acceptance.py` 先产生合成夹具，其余脚本随后运行。第三方联网测试另行在私人环境执行，不自动批量调用计费接口。

测试服务器示例（仅用于副本，不要指向真实数据库）：

```powershell
$env:DB_PATH='D:\Projects\YixiangZhicai_Execution_20261111\acceptance.db'
$env:DATABASE_URL='sqlite:///acceptance.db'
$env:LLM_PROVIDER_ORDER='local'
Set-Location backend
D:\Projects\YixiangZhicai_Local\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8001 --no-access-log
```

该模式明确只核验本地业务/兜底链路。运行前先复制要测试的数据库并备份，测试结束后关闭测试服务。

## 凭证与提交隔离

`.gitignore` 排除 `.env`、SQLite、虚拟环境、生成媒体、录音、日志、私人小程序配置、压缩包和私钥文件；保留空白 `.env.example`。首次提交前运行暂存区审计，扫描已知私人配置值、常见令牌格式、私钥头、SQLite 文件头及禁用文件名：

```powershell
git add -n .
git add .
D:\Projects\YixiangZhicai_Local\.venv\Scripts\python.exe tests\local_acceptance\audit_staged.py --private-env D:\Projects\YixiangZhicai_Local\backend\.env
```

私人运行副本和安全源码副本严格分离；没有将网站发布到公网托管服务。尚未完整验收所有页面的每个细分按钮、移动实机、物理麦克风、方言识别和全站对比度；完整边界见验收报告。
