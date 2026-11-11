# 功能逐项验收矩阵

日期：2026-11-11（Asia/Shanghai）。仅标记实际完成的层级；本地兜底、渲染通过与外部API成功分别记录。

## 业务与适老化清单

| 项目 | 状态 | 实测证据与边界 |
|---|---|---|
| 原始项目与输入备份 | 已实测通过 | 原始ZIP完整性通过；549个文件与已解压交接目录逐字节相同；原始目录未改动。 |
| 网站/文档/健康与配置状态入口 | 已实测通过 | 8000私人服务及8001副本服务实测HTTP200。 |
| 长辈账户全流程 | 已实测通过 | 注册、密码登录、退出、密保设置/找回/新旧密码；全部仅合成账号。 |
| 子女账户与绑定 | 已实测通过 | 合成账号注册、登录/退出、长辈码、绑定/解绑。 |
| 资产隔离与家庭授权 | 已实测通过 | 他人读写、无绑定读取、撤权访问、子女改权均验证拒绝；授予权限后可读。 |
| 问小享文字会话/历史 | 已实测通过 | 浏览器发送和历史弹层、多轮请求结构通过；结果为local兜底，不是云端推理。 |
| 问小享云端多轮语义效果 | API凭证待续 | 方舟端点关闭；蓝心404；没有把兜底认定为云模型成功。 |
| 术语高亮、解释、追问、关闭 | 已实测通过 | 4项浏览器交互通过；解释/追问本地链路，云端效果未验收。 |
| 通用图片云视觉 | API凭证待续 | /image/recognize只有local fallback；没有识别出测试文字。 |
| 本地OCR与理财图片上传 | 已实测通过 | RapidOCR识别合成图片中的TEST文字，/finance/parse-image返回识别字段；真实浏览器文件上传与结果显示通过。 |
| 产品文字识别与风险提示 | 已实测通过 | 命名的合成产品文字实测；无产品名称时前端会滤掉不完整产品卡，完整性仍有限。 |
| 麦克风授权状态/拒绝降级 | 有问题已修复 | 删除“总是允许”的权限伪报，使用浏览器实际Permissions状态；拒绝时提示改用文字。 |
| 浏览器录音允许路径 | 已实测通过 | 合成音频设备录制38444字节WAV；不等于真实硬件麦克风验收。 |
| 百度语音ASR/TTS | 已实测通过 | 真实OAuth、TTS、ASR和后端上传/音频获取成功；音频只包含“你好”。 |
| 真实物理麦克风/方言/噪声 | 尚未测 | 未采集用户真实麦克风；没有完成方言与噪声环境测试。 |
| 产品检索、示例与核验本地状态 | 已实测通过 | 检索/列表接口及无效编码核验状态通过，非银行官方实时报价。 |
| 银行官方产品数据与推荐依据 | API凭证待续 | BANK_PRODUCTS_URL、BANK_API_KEY缺失；未启用真实银行数据。 |
| 风险问卷与本地评估 | 已实测通过 | 问卷获取、评估、历史接口通过；未完成云端推荐解释质量验收。 |
| 账本与账单导入 | 已实测通过 | 增改查删、金额校验、统计、导入预览/确认、历史与他人修改拒绝。 |
| 持仓与画像/资金规划 | 已实测通过 | 持仓新增读取更新和跨账号拒绝；画像持久化；资金分配/养老金模拟本地接口。 |
| 财经资讯与金融查询真实数据 | API凭证待续 | 资讯10001请求Key错误；金融10020接口维护；本地资讯内容不是实时成功。 |
| 新闻详情全部来源/格式 | 尚未测 | 页面三档渲染已过；全部真实新闻来源的详情解析尚未完成。 |
| 每日一课完整播放 | 尚未测 | 已测视频接口失败HTTP404；原始包未提供MP4，配置视频URL也为空；未擅自合成或替换课程。 |
| 天气与腾讯附近服务 | 已实测通过 | 腾讯地址解析、带认证的附近服务成功；天气后端source=real。地图Web为OpenStreetMap跳转，不是小程序原生地图。 |
| 健康提醒、指标与常用电话 | 已实测通过 | 健康指标保存、提醒新增/完成/删除、电话新增/删除；拨打电话未实际呼叫。 |
| 家庭消息、群聊、周报和风险提醒 | 已实测通过 | 私信/群聊写读、未授权拒绝、周报生成、风险提示本地链路通过；语音家庭消息未全量验收。 |
| 长辈家庭页和快捷入口 | 有问题已修复 | Web不再自动跳首页；家庭账本/留言/群聊/周报保留，原小程序端行为不改变。 |
| 可编辑弹窗 | 有问题已修复 | Web补齐输入框、content返回、取消/确认；备注与绑定码输入不再无框。 |
| 全局字号与播报开关 | 已实测通过 | 浏览器字号切换和自动播报开关已点测；并非全站每段文字都逐一朗读。 |
| 30页×三档视口 | 已实测通过 | 1440/768/390各30页：路由渲染、零JS记录错误、整页无横向溢出，180项通过；非每个按钮都验收。 |
| 手机家庭卡片裁切 | 有问题已修复 | 家庭分析卡改为响应式网格，390px单列；保留原卡片和内容。 |
| 返回/关闭按钮触控尺寸 | 有问题已修复 | 相关点击区域增至48px；理财页抽样最小高度检查通过。 |
| 理财按钮文字对比度 | 有问题已修复 | 保留橙色填充，改暖棕文字；五个样本最低4.67，文字识别渐变最差5.04，产品识别5.68。 |
| prefers-reduced-motion | 有问题已修复 | 补强减少动画覆盖；实测可见动画数量0；常规偏好下原动画保留。 |
| 全部细分按钮/弹层/视觉状态 | 尚未测 | 未穷尽30页所有子流程、每种叠层/卡片状态和全部文字对比度。 |
| Android/iOS实机与其他浏览器 | 尚未测 | 本轮为Windows Edge桌面/视口模拟，不等同真实手机或Safari验收。 |
| 微信Web OAuth与原生小程序能力 | 尚未测 | Web OAuth未实现；wx.login保留明确提示；选点/小程序跳转等仅兼容提示。 |
| 微信支付 | API凭证待续 | 缺商户号、APIv3密钥、证书序列号；WECHAT_PAY_ENABLED=0，未发起交易。 |

状态统计：已实测通过20项；API凭证待续5项；有问题已修复7项；尚未测6项。

## 原30页面

| 原路由 | 渲染/整页横溢 | 完整细分交互 |
|---|---|---|
| `pages/assistant/assistant` | 三档已实测通过 | 参照上表；未穷尽所有细分 |
| `pages/child/alerts/alerts` | 三档已实测通过 | 参照上表；未穷尽所有细分 |
| `pages/child/assist/assist` | 三档已实测通过 | 参照上表；未穷尽所有细分 |
| `pages/child/bind/bind` | 三档已实测通过 | 参照上表；未穷尽所有细分 |
| `pages/child/elder-dashboard/elder-dashboard` | 三档已实测通过 | 参照上表；未穷尽所有细分 |
| `pages/child/elder-list/elder-list` | 三档已实测通过 | 参照上表；未穷尽所有细分 |
| `pages/child/health/health` | 三档已实测通过 | 参照上表；未穷尽所有细分 |
| `pages/child/index/index` | 三档已实测通过 | 参照上表；未穷尽所有细分 |
| `pages/child/ledger/ledger` | 三档已实测通过 | 参照上表；未穷尽所有细分 |
| `pages/child/location/location` | 三档已实测通过 | 参照上表；未穷尽所有细分 |
| `pages/child/permissions/permissions` | 三档已实测通过 | 参照上表；未穷尽所有细分 |
| `pages/child/positions/positions` | 三档已实测通过 | 参照上表；未穷尽所有细分 |
| `pages/child/profile/profile` | 三档已实测通过 | 参照上表；未穷尽所有细分 |
| `pages/child/weekly/weekly` | 三档已实测通过 | 参照上表；未穷尽所有细分 |
| `pages/family-group-chat/family-group-chat` | 三档已实测通过 | 参照上表；未穷尽所有细分 |
| `pages/family-messages/family-messages` | 三档已实测通过 | 参照上表；未穷尽所有细分 |
| `pages/family/family` | 三档已实测通过 | 参照上表；未穷尽所有细分 |
| `pages/finance/finance` | 三档已实测通过 | 参照上表；未穷尽所有细分 |
| `pages/forgot-password/forgot-password` | 三档已实测通过 | 参照上表；未穷尽所有细分 |
| `pages/health/health` | 三档已实测通过 | 参照上表；未穷尽所有细分 |
| `pages/index/index` | 三档已实测通过 | 参照上表；未穷尽所有细分 |
| `pages/login/login` | 三档已实测通过 | 参照上表；未穷尽所有细分 |
| `pages/money/money` | 三档已实测通过 | 参照上表；未穷尽所有细分 |
| `pages/nearby/nearby` | 三档已实测通过 | 参照上表；未穷尽所有细分 |
| `pages/news-detail/news-detail` | 三档已实测通过 | 参照上表；未穷尽所有细分 |
| `pages/profile/profile` | 三档已实测通过 | 参照上表；未穷尽所有细分 |
| `pages/questionnaire/questionnaire` | 三档已实测通过 | 参照上表；未穷尽所有细分 |
| `pages/register/register` | 三档已实测通过 | 参照上表；未穷尽所有细分 |
| `pages/security-question/security-question` | 三档已实测通过 | 参照上表；未穷尽所有细分 |
| `pages/service/service` | 三档已实测通过 | 参照上表；未穷尽所有细分 |

## 原5组件

| 组件 | 状态 |
|---|---|
| `components/child-bottom-nav/child-bottom-nav` | 原源码与模板保留；术语/语音/子女导航有部分实测，完整组件所有状态尚未测 |
| `components/family-care-modal/family-care-modal` | 原源码与模板保留；术语/语音/子女导航有部分实测，完整组件所有状态尚未测 |
| `components/family-message-modal/family-message-modal` | 原源码与模板保留；术语/语音/子女导航有部分实测，完整组件所有状态尚未测 |
| `components/term-popups/term-popups` | 原源码与模板保留；术语/语音/子女导航有部分实测，完整组件所有状态尚未测 |
| `components/voice-input/voice-input` | 原源码与模板保留；术语/语音/子女导航有部分实测，完整组件所有状态尚未测 |

## 后端路由逐项

只有被本轮HTTP用例命中的方法才标实测，未命中路由不按页面渲染推断成功。

| 方法 | 路由 | HTTP用例覆盖 |
|---|---|---|
| GET | `/` | 尚未测 |
| GET | `/alerts` | 已实测通过（限定用例） |
| POST | `/alerts/{alert_id}/handle` | 尚未测 |
| POST | `/alerts/{alert_id}/read` | 尚未测 |
| POST | `/assistant/ask` | 尚未测 |
| GET | `/assistant/audio/{filename}` | 尚未测 |
| POST | `/assistant/chat` | 已实测通过（限定用例） |
| POST | `/assistant/multimodal-analyze` | 尚未测 |
| POST | `/assistant/rewrite-query` | 尚未测 |
| POST | `/assistant/text-to-voice` | 已实测通过（限定用例） |
| POST | `/assistant/vector-search` | 尚未测 |
| POST | `/assistant/voice-to-text` | 已实测通过（限定用例） |
| GET | `/auth/me` | 已实测通过（限定用例） |
| POST | `/auth/password-login` | 已实测通过（限定用例） |
| POST | `/auth/password-reset` | 已实测通过（限定用例） |
| POST | `/auth/register` | 已实测通过（限定用例） |
| POST | `/auth/security-question` | 已实测通过（限定用例） |
| GET | `/auth/security-question` | 已实测通过（限定用例） |
| POST | `/auth/wechat-login` | 尚未测 |
| POST | `/chat` | 尚未测 |
| GET | `/child/elders` | 已实测通过（限定用例） |
| GET | `/child/elders/{elder_id}/alerts` | 已实测通过（限定用例） |
| POST | `/child/elders/{elder_id}/explain-to-elder` | 尚未测 |
| GET | `/child/elders/{elder_id}/health-reminders` | 已实测通过（限定用例） |
| GET | `/child/elders/{elder_id}/ledger-summary` | 已实测通过（限定用例） |
| GET | `/child/elders/{elder_id}/location` | 已实测通过（限定用例） |
| POST | `/child/elders/{elder_id}/nudge` | 尚未测 |
| GET | `/child/elders/{elder_id}/overview` | 已实测通过（限定用例） |
| GET | `/child/elders/{elder_id}/positions` | 已实测通过（限定用例） |
| GET | `/child/elders/{elder_id}/weekly-report` | 已实测通过（限定用例） |
| POST | `/content/generate-anti-fraud-video` | 尚未测 |
| POST | `/content/generate-lesson-card` | 尚未测 |
| POST | `/content/generate-lesson-video` | 尚未测 |
| POST | `/content/generate-risk-poster` | 尚未测 |
| POST | `/document/analyze` | 尚未测 |
| POST | `/document/analyze-text` | 尚未测 |
| GET | `/family/anomaly` | 尚未测 |
| GET | `/family/bind-code` | 已实测通过（限定用例） |
| POST | `/family/bind-code/refresh` | 尚未测 |
| POST | `/family/bind/accept-code` | 已实测通过（限定用例） |
| GET | `/family/bindings` | 已实测通过（限定用例） |
| DELETE | `/family/bindings/{binding_id}` | 已实测通过（限定用例） |
| POST | `/family/bindings/{binding_id}/confirm` | 尚未测 |
| PUT | `/family/bindings/{binding_id}/permissions` | 已实测通过（限定用例） |
| POST | `/family/bindings/{binding_id}/reject` | 尚未测 |
| GET | `/family/group-chat` | 已实测通过（限定用例） |
| POST | `/family/group-chat` | 已实测通过（限定用例） |
| GET | `/family/group-chat/unread` | 尚未测 |
| POST | `/family/group-chat/upload` | 尚未测 |
| POST | `/family/member/remark` | 尚未测 |
| GET | `/family/members` | 已实测通过（限定用例） |
| POST | `/family/members` | 尚未测 |
| PUT | `/family/members/{mid}` | 尚未测 |
| DELETE | `/family/members/{mid}` | 尚未测 |
| PUT | `/family/members/{peer_id}/remark` | 尚未测 |
| GET | `/family/messages` | 已实测通过（限定用例） |
| POST | `/family/messages` | 已实测通过（限定用例） |
| GET | `/family/pending-bindings` | 已实测通过（限定用例） |
| POST | `/family/voice-message` | 尚未测 |
| GET | `/family/weekly-report` | 已实测通过（限定用例） |
| GET | `/finance/advice` | 尚未测 |
| POST | `/finance/advice` | 尚未测 |
| POST | `/finance/parse-image` | 尚未测 |
| POST | `/finance/parse-input` | 尚未测 |
| POST | `/finance/risk-check` | 尚未测 |
| POST | `/finance/track-from-analysis` | 尚未测 |
| POST | `/health/activity` | 尚未测 |
| POST | `/health/food-image` | 尚未测 |
| POST | `/health/meal` | 尚未测 |
| POST | `/health/meds` | 已实测通过（限定用例） |
| PUT | `/health/meds/{mid}` | 已实测通过（限定用例） |
| DELETE | `/health/meds/{mid}` | 已实测通过（限定用例） |
| PUT | `/health/metrics` | 已实测通过（限定用例） |
| GET | `/health/summary` | 已实测通过（限定用例） |
| GET | `/healthz` | 已实测通过（限定用例） |
| GET | `/home/child-dashboard` | 已实测通过（限定用例） |
| GET | `/home/elder-dashboard` | 已实测通过（限定用例） |
| POST | `/image/recognize` | 尚未测 |
| POST | `/image/recognize-base64` | 尚未测 |
| GET | `/integrations/status` | 已实测通过（限定用例） |
| GET | `/lbs/geocode` | 尚未测 |
| GET | `/lbs/ip-location` | 尚未测 |
| GET | `/lbs/nearby` | 尚未测 |
| GET | `/lbs/reverse-geocode` | 尚未测 |
| POST | `/ledger/import/confirm` | 已实测通过（限定用例） |
| POST | `/ledger/import/wechat-file` | 尚未测 |
| POST | `/ledger/import/wechat-image` | 尚未测 |
| POST | `/ledger/import/wechat-text` | 已实测通过（限定用例） |
| GET | `/ledger/imports` | 已实测通过（限定用例） |
| POST | `/ledger/records` | 已实测通过（限定用例） |
| PUT | `/ledger/records/{record_id}` | 已实测通过（限定用例） |
| DELETE | `/ledger/records/{record_id}` | 已实测通过（限定用例） |
| POST | `/ledger/smart-input` | 尚未测 |
| GET | `/ledger/summary` | 已实测通过（限定用例） |
| POST | `/lesson/explain` | 尚未测 |
| GET | `/lesson/today` | 已实测通过（限定用例） |
| GET | `/market/daily` | 尚未测 |
| GET | `/market/products` | 已实测通过（限定用例） |
| POST | `/market/refresh` | 尚未测 |
| GET | `/market/search` | 尚未测 |
| GET | `/market/sources` | 已实测通过（限定用例） |
| GET | `/market/stock` | 尚未测 |
| GET | `/media/avatars/{filename}` | 尚未测 |
| GET | `/media/daily_lesson.mp4` | 已测失败：视频缺失 |
| HEAD | `/media/daily_lesson.mp4` | 尚未测 |
| GET | `/media/family-chat/{filename}` | 尚未测 |
| GET | `/media/lesson-videos/{filename}` | 尚未测 |
| HEAD | `/media/lesson-videos/{filename}` | 尚未测 |
| GET | `/media/voice/{filename}` | 尚未测 |
| POST | `/money/parse-finance-image` | 尚未测 |
| GET | `/news/article-content` | 尚未测 |
| POST | `/payments/ledger-record` | 尚未测 |
| GET | `/pockets/history` | 已实测通过（限定用例） |
| POST | `/pockets/rebalance` | 尚未测 |
| POST | `/pockets/simulate` | 已实测通过（限定用例） |
| GET | `/pockets/summary` | 已实测通过（限定用例） |
| POST | `/portfolio/assistant` | 尚未测 |
| GET | `/portfolio/overview` | 已实测通过（限定用例） |
| GET | `/portfolio/recommendation` | 已实测通过（限定用例） |
| GET | `/products` | 已实测通过（限定用例） |
| GET | `/products/banks` | 已实测通过（限定用例） |
| GET | `/products/example` | 已实测通过（限定用例） |
| POST | `/products/explain` | 尚未测 |
| POST | `/products/query` | 尚未测 |
| GET | `/products/search` | 已实测通过（限定用例） |
| GET | `/products/verify` | 已实测通过（限定用例） |
| POST | `/profile/analyze` | 尚未测 |
| POST | `/profile/basic` | 尚未测 |
| POST | `/profile/init` | 尚未测 |
| POST | `/profile/location` | 尚未测 |
| GET | `/profile/me` | 已实测通过（限定用例） |
| POST | `/profile/update` | 已实测通过（限定用例） |
| POST | `/risk/behavior-check` | 已实测通过（限定用例） |
| POST | `/risk/evaluate` | 已实测通过（限定用例） |
| POST | `/risk/evaluate-ai` | 尚未测 |
| GET | `/risk/history` | 已实测通过（限定用例） |
| GET | `/risk/questionnaire` | 已实测通过（限定用例） |
| POST | `/risk/questionnaire/generate` | 尚未测 |
| POST | `/risk/text-check` | 已实测通过（限定用例） |
| GET | `/service/phones` | 已实测通过（限定用例） |
| POST | `/service/phones` | 已实测通过（限定用例） |
| DELETE | `/service/phones/{phone_id}` | 已实测通过（限定用例） |
| PUT | `/sport/tasks/{tid}` | 尚未测 |
| GET | `/sport/today` | 已实测通过（限定用例） |
| POST | `/term/explain` | 已实测通过（限定用例） |
| GET | `/term/history` | 已实测通过（限定用例） |
| GET | `/term/hot` | 尚未测 |
| POST | `/user/avatar/update` | 尚未测 |
| POST | `/user/avatar/upload` | 尚未测 |
| GET | `/user/profile` | 尚未测 |
| POST | `/user/profile/update` | 尚未测 |
| GET | `/wealth/positions` | 已实测通过（限定用例） |
| POST | `/wealth/positions` | 已实测通过（限定用例） |
| GET | `/wealth/positions/{position_id}` | 已实测通过（限定用例） |
| PUT | `/wealth/positions/{position_id}` | 已实测通过（限定用例） |
| DELETE | `/wealth/positions/{position_id}` | 已实测通过（限定用例） |
| POST | `/wealth/positions/{position_id}/refresh` | 尚未测 |
| POST | `/wealth/positions/{position_id}/risk-recheck` | 尚未测 |
| POST | `/wealth/positions/{position_id}/set-reminder` | 尚未测 |
| GET | `/wealth/positions/{position_id}/snapshots` | 尚未测 |
| POST | `/wealth/search-and-track` | 尚未测 |
| GET | `/weather/today` | 尚未测 |

OpenAPI方法总数：162；HTTP套件命中：78；其余：84（部分另由浏览器/专项测试覆盖，未计入此数）。
