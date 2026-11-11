# LOCAL_ACCEPTANCE — 颐享智财本机验收

日期：2026-11-11；时区：Asia/Shanghai。项目已本地部署，不是公网发布。**尚未达到所有细分功能1:1验收。**

## 环境、目录与输入

- 私人运行：`D:\Projects\YixiangZhicai_Local`
- 安全源码：`D:\Projects\YixiangZhicai_Web`
- 私人证据/数据库副本/回滚包：`D:\Projects\YixiangZhicai_Execution_20261111`
- 实际输入：`D:\YXZC\本机完整项目` 与 `D:\YXZC\GitHub安全源码`；没有找到指定的两个独立同名ZIP，但交接README确认这两个目录即对应完整项目与安全源码。
- 找到总交接包：`D:\Documents\Downloads\YXZC.zip`。ZIP完整性成功，549个文件与两个原始目录逐字节匹配。SHA256：`479020b97165774b4ffcb3d8338edc26c69ce2347a2becb06ca334d7b0a67061`。
- 原始ZIP及`D:\YXZC`均保留未改；目标目录创建前不存在，未覆盖既有修改。
- Windows、Python 3.12.10、Git 2.55.0.windows.2、官方便携gh 2.103.3、Edge/Playwright。`.venv`位于私人项目；pip缓存位于D盘。`pip check`：`No broken requirements found.`
- 8000初查空闲；私人服务监听127.0.0.1:8000；业务测试使用独立副本acceptance.db与8001，回滚验证使用另一副本与8003。测试端LLM_PROVIDER_ORDER=local，不冒充云模型。

## 运行结果与启动

- 网站：http://127.0.0.1:8000/site/
- Swagger：http://127.0.0.1:8000/docs
- `/healthz`、`/integrations/status`、网站与文档实际均HTTP200；浏览器已打开真实私人运行服务登录页。
- 启动：双击`D:\Projects\YixiangZhicai_Local\启动网站.bat`。
- 对应命令：在`D:\Projects\YixiangZhicai_Local\backend`执行：
  `D:\Projects\YixiangZhicai_Local\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-access-log`
- 后端正确读取`backend/.env`；DB_PATH解析为`backend/app/data/yixiang.db`；私人.env未改。数据库原件备份为证据目录`private_database_original.db`。运行初始化仅改变sqlite_sequence元数据；原有业务表记录逐列比对未变，测试账号与写删均不在私人运行数据库内。

## 测试数量（相互独立的层级）

| 套件 | 通过 | 失败 | 结果/退出码 |
|---|---:|---:|---|
| 原结构、JS语法和基础HTTP | 23 | 0 | RESULT 23 / 23；exit0 |
| 业务HTTP | 129 | 1 | API_RESULT 129 / 130；exit1，课程MP4缺失 |
| Edge UI与三档路由/整页横溢 | 201 | 0 | UI_RESULT 201 / 201；exit0 |
| 术语高亮/追问专项 | 4 | 0 | 全部通过 |
| 家庭跳转+编辑弹窗回归 | 1 | 0 | REGRESSION=PASS；exit0 |
| 允许录音合成设备专项 | 1 | 0 | 38444字节RIFF/WAV；非硬件麦克风 |
| **主要功能自动检查合计** | **359** | **1** | **360项；不含外部付费API与人工全站验收** |

补充视觉测量：5个样本对比度均≥4.5；减少动画时可见动画0。具体数值在本地`visual_measurements.json`。

业务矩阵38项状态：已实测通过20项；API凭证待续5项；有问题已修复7项；尚未测6项。其中“每日一课完整播放”未完成，已经实测接口404失败。完整清单、30页、5组件、162个OpenAPI方法见`FUNCTION_ACCEPTANCE_MATRIX.md`。

实际验证了合成账号注册/双角色登录退出/密保找回、画像、账本CRUD/导入/统计、持仓更新与跨用户拒绝、家庭绑定/授权/撤权/解绑/群聊/私信/周报、健康提醒和电话CRUD。HTTP200仅作为被测用例的链路证据，不代表推荐质量或所有外部数据成功。

## 外部API真实联网（凭证只记[MASKED]）

| 服务 | HTTP/业务码 | 结果 | 处理字段 |
|---|---|---|---|
| 方舟/豆包 | HTTP400；InvalidEndpoint.ClosedEndpoint | 失败：配置端点关闭 | 在本人方舟控制台启用有效端点，更新ARK_MODEL及需要的授权配置；不单凭此断定Key过期 |
| vivo蓝心 | HTTP404 | 失败：当前URL/模型/授权组合待核对 | 重新核对BLUELM_BASE_URL、ENDPOINT_PATH、模型、AUTH_MODE及对应凭证；VIVO_APP_KEY/SECRET_KEY为空，当前为Bearer配置 |
| 百度OAuth | HTTP200 | 外部实测成功 | 凭证[MASKED] |
| 百度TTS | HTTP200，9216字节音频 | 外部实测成功，后端音频GET200 | 凭证[MASKED] |
| 百度ASR | HTTP200，err_no=0 | 外部实测成功，转写非空；后端上传链路亦成功 | 凭证[MASKED] |
| 聚合资讯 | HTTP200；10001 | 失败：请求Key错误 | 重新获取与资讯接口匹配的JUHE_BULLETIN_KEY |
| 聚合金融 | HTTP200；10020 | 失败：接口维护 | 核对服务恢复和可用接口，不据此要求更换有效Key |
| 腾讯位置 | HTTP200；status=0 | 地址解析成功；认证后的附近服务source=tencent_map且非空 | 凭证[MASKED] |

初次独立烟雾记录8项：4成功/4异常。后端专项另证实百度ASR/TTS、腾讯附近服务和天气source=real；问答真实后端仍provider=local、fallback=true，不计云端成功。本次没有出现DNS失败、401/403或明确配额不足；蓝心404按原样记录，未擅改成凭证失效。

聚合10001/10020释义参考官方文档：https://www.juhe.cn/docs/api/id/159 。

通用云视觉测试仅返回local fallback、extracted_text为空；理财图片的本地RapidOCR读到合成TEST文字，二者分开记录。原始联网响应未复制到公开源码/测试截图。

## 已修复与剩余缺口

已修复：长辈Web家庭页自动跳转与对应快捷入口；可编辑弹窗缺输入与content；麦克风权限总是true；390px家庭卡裁切；返回/关闭触控尺寸；理财按钮低对比度；减少动画覆盖优先级。`.env.example`改为本地监听和一致SQLite路径；启动缓存限定项目盘。

仍需补齐：
1. 课程视频：输入包无任何MP4，视频URL为空；接口404，未生成替代素材冒充原课。
2. 云模型/云视觉、实时资讯、官方银行产品数据及微信支付配置，见上表；银行和支付保持禁用。
3. 所有30页的每个子流程、全部叠层/卡片/按钮状态与全站文字对比度未穷尽。
4. 物理麦克风、方言/噪声、真实手机、Safari等未实测；本轮视口模拟不等于实机测试。
5. 网页微信OAuth未实现；小程序选点/跳转等保留兼容提示；地图使用OpenStreetMap跳转，与原生微信地图非1:1。
6. 未命名产品只有风险/期限时，前端会滤掉无标题产品卡；完整识别质量和云端推荐解释效果尚未达到1:1。

## 证据与回滚

- HTTP/UI原始记录、合成夹具、独立数据库与联网脱敏记录仅保存在证据目录，不提交GitHub。
- 截图目录：`D:\Projects\YixiangZhicai_Web\tests\local_acceptance`；文件名清单见`SCREENSHOTS.md`；截图均来自本轮浏览器实际操作，只含合成验收用户或登录空白页。
- `VERIFICATION.txt`记录BASELINE/MODIFIED/ROLLBACK的完整命令、输入、字面输出和退出码。
- `MODIFIED_FILE.zip`、`DIFF_FILE.patch`、`VERIFICATION.txt`、可执行`ROLLBACK.sh`均位于证据目录。
- 回滚只在另一份`rollback_validation`中验证；哈希恢复成功，原“跳回首页/无输入框”行为重现；实际Web和私人运行目录保持修改版。

## Git隔离

安全源码来自安全交接目录；私人.env、真实SQLite、微信私有配置、私钥、压缩包、旧测试日志和本轮私人截图/日志均排除。提交前扫描Git暂存blob，包括已知私人配置值、常见令牌/私钥/SQLite头及文件名。扫描报告另存证据目录。仓库可见性、main与远端提交由推送后的GitHub核验单独确认，不以创建命令推断推送成功。
