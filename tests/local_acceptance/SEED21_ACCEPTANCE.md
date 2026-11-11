# Seed 2.1 Lite接入增量验收

日期：2026-11-11（Asia/Shanghai）。使用原项目兼容的Chat Completions API接入所选模型，未启用示例中的联网搜索工具。

当前模型：`doubao-seed-2-1-lite-260915`。网站：http://127.0.0.1:8000/site/ 。

| 验证 | 结果 |
|---|---|
| 真实直连：文字、多轮上下文、图片、音频 | 4/4通过；HTTP200；四次直连usage共1549 Token，不代表全部验收请求总用量 |
| 独立DB后端：问答、图片、录音、集成状态 | 4/4通过；ark/ark_asr；fallback=false |
| Edge：文字发送、合成麦克风录制上传、理财图片文件上传 | 3/3通过；真实后端响应，无响应替换 |
| 新适配器离线单元测试 | 10/10通过；模拟仅用于空响应/协议回归，不计外部API成功 |
| 原结构/静态检查 | 23/23通过；30页/5组件保留 |
| 回滚 | 另一份副本4个运行文件哈希恢复；旧模型/百度ASR/旧空响应行为均重现；实际运行副本保持修改版 |

本轮新增44/44检查通过。已有课程视频缺失、聚合资讯/金融、银行正式数据与微信支付缺口仍保留；真实硬件麦克风、方言及所有图片准确率未全量验收。此前359/360部署检查没有全部重跑。

本地配置变更：ARK_MODEL、LLM_MODEL、ARK_THINKING_MODE=disabled、ARK_ASR_ENABLED=1。语音识别优先Ark，失败保留原有vivo/百度链路；语音播报保留百度TTS。公共.env.example的ARK_ASR_ENABLED默认0，凭证字段保持空白。

截图：`seed21_text_connected.png`、`seed21_audio_connected.png`、`seed21_image_connected.png`，位于`D:\Projects\YixiangZhicai_Web\tests\local_acceptance`，不提交Git。

脱敏证据与可执行回滚保存在`D:\Projects\YixiangZhicai_Execution_20261111\seed21_integration`。其中环境副本含私人凭证，只留本机；Git只包含代码、空白模板及本报告。没有读取或上传私人数据库记录进行模型测试；全部写入测试使用独立数据库。
