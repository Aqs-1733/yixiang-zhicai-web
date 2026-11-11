function explainTerm(term, nearbyText, scene) {
  const cleanTerm = normalizeTermInput(term)
  return getApp().request({
    url: '/term/explain',
    method: 'POST',
    data: { term: cleanTerm, nearby_text: nearbyText || '', scene: scene || 'miniapp', force_llm: false },
    loading: true
  })
}

const DOUBLE_TAP_MS = 420
const MAX_POPUPS = 6
const TERM_CANDIDATES = [
  // === 理财基础 ===
  '业绩比较基准', '七日年化', '年化收益率', '参考收益', '净值', '单位净值',
  '风险等级', '风险测评', 'R1', 'R2', 'R3', 'R4', 'R5', '流动性', '期限',
  '申购', '赎回', '买入', '卖出', '到期', '分红', '利息', '收益',
  '本金', '保本', '非保本', '大额存单', '储蓄国债', '国债', '货币基金',
  '债券基金', '银行理财', '养老理财', '存款保险', '登记编码', '官方渠道',
  '起购金额', '封闭期', '开放期', '提前支取', '管理费', '托管费',
  '申购费', '认购费', '赎回费', '销售服务费', '转换费', '手续费', '业绩报酬',
  '募集期', '锁定期', '到期日', '赎回到账', 'T+1', 'T+2',
  '持仓', '回撤', '波动', '备用金', '延时到账',
  '资产配置', '分散配置', '期限匹配', '资金安全', '养老钱', '医疗备用金',
  '理财资金', '生活备用金', '固定收益', '固收', '债券', '基金', '股票', '保险',
  '养老金', '个人养老金', '收益来源', '到账方式', '发行机构', '持牌机构',
  '银行柜台', '银行App', '银行客服', '金融网点', '风险偏好', '风险承受能力',
  '产品说明书', '理财说明书', '合格投资者', '代销机构', '理财子公司',
  '净值型理财', '现金管理', '转账', '陌生链接', '私人二维码', '验证码',
  '高收益诱导', '冒充客服', '非法集资', '虚假平台', '个人收款码', '内部消息',
  '稳赚不赔', '保证收益', '先交保证金', '刷单返利', '杀猪盘', '养老项目骗局',
  '收益率', '利率', '贷款', '还本付息', '自动续作', '赎回到账',
  '稳健型', '稳健', '银发群体', '老年用户', '适老化', '防诈骗',
  '反诈提醒', '医疗资金', '生活费', '结余', '日常收支', '理财收益',
  '生活支出', '理财持仓', '收支明细', '账本分析', '金融认知', '风险提示',
  '月收入', '月支出', '流动资金', '固定资金', '子女权限',
  '用钱时间', '期限搭配', '风险评估', '亲情协同', '家庭协同', '家庭金融周报',
  '家人消息', '绑定码', '协同账号', '健康状态', '身体情况', '高风险内容',
  '联系子女', '蔬菜生鲜', '水果生鲜', '安全优先',

  // === 银行与信贷 ===
  '存款', '贷款', '信用卡', '房贷', '车贷', '征信', '央行', '商业银行',
  '储蓄', '定期', '活期', '通知存款', '大额存款', '协定存款',
  'LPR', '基准利率', '浮动利率', '固定利率', '优惠利率',
  '首付', '按揭', '抵押', '质押', '担保', '授信', '放款',
  '逾期', '呆账', '坏账', '不良贷款', '拨备', '核销',
  '存款准备金', '逆回购', 'MLF', 'SLF', 'PSL', '公开市场操作',
  '银保监会', '央行', '人民银行', '商业银行', '政策性银行',

  // === 股市与证券 ===
  '股市', 'A股', '港股', '美股', '大盘', '牛市', '熊市', '涨停', '跌停',
  'IPO', '上市公司', '市值', '市盈率', '分红派息', '除权除息',
  '创业板', '科创板', '北交所', '新三板', '主板', '中小板',
  '权重股', '蓝筹股', '白马股', '成长股', '价值股', '周期股',
  '概念股', '题材股', '妖股', '次新股', 'ST股',
  'K线', '阳线', '阴线', '成交量', '换手率', '振幅',
  '支撑位', '压力位', '突破', '回调', '反弹', '反转',
  '解禁', '减持', '增持', '回购', '定增', '配股', '送股',
  '熔断', '做空', '做多', '杠杆', '保证金', '强平',
  'QFII', '北向资金', '南向资金', '主力资金', '游资',

  // === 基金与资管 ===
  'ETF', 'LOF', 'QDII', 'REITs', 'FOF', 'MOM',
  '指数基金', '主动基金', '被动基金', '量化基金', '对冲基金',
  '信托', '私募', '公募', '专户', '资管计划',
  '净值', '累计净值', '估算净值', '分红', '拆分',
  '申购费', '赎回费', '管理费', '托管费', '销售服务费',
  '权益类', '固收类', '混合类', '货币类', '另类投资',

  // === 债券与固收 ===
  '国债收益率', '地方债', '城投债', '企业债', '公司债', '可转债',
  '信用评级', '违约', '兑付', '到期收益率', '票面利率', '久期',
  '利率债', '信用债', '短融', '中票', '定向工具',

  // === 保险 ===
  '社保', '医保', '失业保险', '工伤保险', '生育保险',
  '养老保险', '商业保险', '重疾险', '医疗险', '意外险', '寿险',
  '年金险', '万能险', '投连险', '分红险',
  '投保', '续保', '理赔', '免赔额', '等待期', '犹豫期',
  '退保', '现金价值', '保额', '保费',

  // === 房地产 ===
  '房价', '楼市', '调控', '住房公积金', '限购', '限贷', '限售',
  '公租房', '廉租房', '保障房', '共有产权', '租购并举',
  '房价收入比', '空置率', '去库存', '棚改', '旧改',

  // === 宏观经济 ===
  'GDP', 'PMI', 'CPI', 'PPI', '宏观经济', '财政政策', '货币政策',
  '通胀', '通货膨胀', '通缩', '贬值', '增值', '加息', '降息', '降准',
  '赤字', '国债', '地方债', '城投债', '信用评级',
  '经济增速', '三驾马车', '内需', '外需', '进出口',
  '工业增加值', '社会消费品零售总额', '固定资产投资',
  '居民消费', '人均收入', '可支配收入', '恩格尔系数',
  '基尼系数', '贫富差距', '共同富裕', '乡村振兴',

  // === 国际金融 ===
  '汇率', '人民币', '美元', '欧元', '外汇', '外汇储备', '离岸人民币',
  '美联储', '欧央行', '加息周期', '缩表', '量化宽松', 'QE',
  '贸易顺差', '贸易逆差', '关税', '贸易战', '制裁',
  '金砖国家', '一带一路', 'RCEP', 'WTO', 'IMF',

  // === 数字经济 ===
  '数字经济', '金融科技', '移动支付', '数字货币', '区块链',
  '人工智能', '大数据', '云计算', '物联网', '5G',
  '互联网金融', 'P2P', '众筹', '第三方支付', '刷脸支付',

  // === 税收与财政 ===
  '印花税', '个人所得税', '增值税', '企业所得税', '起征点',
  '消费税', '房产税', '遗产税', '关税', '出口退税',
  '财政收入', '财政支出', '转移支付', '专项债', '特别国债',

  // === 监管与合规 ===
  '反洗钱', '证监会', '国务院', '发改委', '财政部',
  '银保监会', '央行', '国务院金融稳定发展委员会',
  '退市', '停牌', '问询函', '监管函', '立案调查', '处罚',
  '内幕交易', '操纵市场', '老鼠仓', '信披违规',

  // === 退休与养老 ===
  '退休金', '延迟退休', '养老金', '企业年金', '职业年金',
  '以房养老', '社区养老', '居家养老', '机构养老', '医养结合',

  // === 日常生活财经 ===
  '消费', '投资', '理财', '薪资', '年终奖', '加班费',
  '公积金', '五险一金', '个税起征点', '专项附加扣除',
  '油价', '电价', '水价', '气价', '菜价', '肉价',
  '最低工资', '平均工资', '灵活就业', '新就业形态',

  // === 公司财务 ===
  '营收', '净利润', '毛利润', '毛利率', '净利率', 'ROE', 'ROA',
  '现金流', '负债', '资产负债率', '应收账款', '存货',
  '分红', '股息率', '每股收益', '每股净资产',
  '并购', '重组', '剥离', '拆分上市', '借壳上市',

  // === 新兴领域 ===
  '碳中和', '碳达峰', '新能源', 'ESG', '绿色金融', '可持续投资',
  '元宇宙', 'Web3', 'NFT', 'DeFi', '智能合约',
]

function normalizeTermInput(term) {
  const raw = String(term || '').replace(/\s+/g, ' ').trim()
  if (!raw) return ''
  const detected = extractTermsFromText(raw, 1)
  if (detected.length && (raw.length > detected[0].length || raw.length > 16 || /[，。；：,.!?！？]/.test(raw))) {
    return detected[0]
  }
  if (raw.length > 24) return raw.slice(0, 24)
  return raw
}

function getEventTerm(e, fallback) {
  return normalizeTermInput(
    fallback ||
    (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.term) ||
    ''
  )
}

function popupPosition(index) {
  const n = index % 6
  return {
    top: 220 + n * 100,
    left: (n % 2 === 0) ? 40 : 70
  }
}

function ensurePopupList(page) {
  if (!page) return []
  const list = (page.data && page.data.termExplainPopups) || []
  if (!page.data || !page.data.termExplainPopups) {
    page.setData({ termExplainPopups: list })
  }
  return list
}

function setPopupList(page, list) {
  if (!page || !page.setData) return
  page.setData({ termExplainPopups: list.slice(-MAX_POPUPS) })
}

function updatePopup(page, id, patch) {
  const list = ensurePopupList(page).map(item => {
    if (item.id === id) return { ...item, ...patch }
    return item
  })
  setPopupList(page, list)
}

function openTermPopup(page, term, nearbyText, scene) {
  if (!term) {
    wx.showToast({ title: '暂无可解释内容', icon: 'none' })
    return Promise.resolve(null)
  }

  const current = ensurePopupList(page)
  const pos = popupPosition(current.length)
  const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`
  const loadingItem = {
    id,
    term: normalizeTermInput(term),
    explanation: '小享正在解释这个词...',
    risk_tip: '',
    loading: true,
    top: pos.top,
    left: pos.left
  }

  setPopupList(page, current.concat(loadingItem))

  return explainTerm(loadingItem.term, nearbyText, scene).then(res => {
    updatePopup(page, id, {
      term: normalizeTermInput(res.term || loadingItem.term),
      explanation: res.explanation || `${loadingItem.term}需要结合风险、期限、收益来源和官方渠道理解。`,
      risk_tip: res.risk_tip || '不懂的词先问清楚，再操作。',
      loading: false
    })
    return res
  }).catch(() => {
    updatePopup(page, id, {
      explanation: `${loadingItem.term}要结合风险、期限、收益来源和官方渠道理解。`,
      risk_tip: '不要因为别人催促或承诺高收益就急着转账。',
      loading: false
    })
    return null
  })
}

function handleDoubleTap(page, e, options = {}) {
  const term = getEventTerm(e, options.term)
  const scene = options.scene || 'miniapp'
  const nearbyText = typeof options.nearbyText === 'function'
    ? options.nearbyText()
    : (options.nearbyText || '')

  if (!term) {
    wx.showToast({ title: '暂无可解释内容', icon: 'none' })
    return Promise.resolve(null)
  }

  return openTermPopup(page, term, nearbyText, scene)
}

function closeTermPopup(page, e) {
  const id = String(
    (e && e.detail && e.detail.id) ||
    (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id) ||
    e ||
    ''
  )
  if (!id) return
  const list = ensurePopupList(page).filter(item => item.id !== id)
  setPopupList(page, list)
}

function extractTermsFromText(text, limit = 12) {
  const raw = String(text || '')
  if (!raw.trim()) return []
  const found = []
  TERM_CANDIDATES.forEach(term => {
    if (raw.includes(term) && !found.includes(term)) {
      found.push(term)
    }
  })
  const riskMatches = raw.match(/\bR[1-5]\b/g) || []
  riskMatches.forEach(term => {
    if (!found.includes(term)) found.push(term)
  })
  return found.slice(0, limit)
}

function buildTermSegments(text, limit = 24) {
  const raw = String(text || '')
  const terms = extractTermsFromText(raw, limit)
    .map(term => ({ term, index: raw.indexOf(term) }))
    .filter(item => item.index >= 0)
    .sort((a, b) => a.index - b.index || b.term.length - a.term.length)
  if (!terms.length) return [{ text: raw, term: '' }]
  const segments = []
  let cursor = 0
  terms.forEach(item => {
    if (item.index < cursor) return
    if (item.index > cursor) {
      segments.push({ text: raw.slice(cursor, item.index), term: '' })
    }
    segments.push({ text: item.term, term: item.term })
    cursor = item.index + item.term.length
  })
  if (cursor < raw.length) segments.push({ text: raw.slice(cursor), term: '' })
  return segments
}

function mergeTerms(base, extra, limit = 16) {
  const list = []
  ;[].concat(base || [], extra || []).forEach(term => {
    const clean = String(term || '').trim()
    if (clean && !list.includes(clean)) list.push(clean)
  })
  return list.slice(0, limit)
}

function showTermExplain(term, nearbyText, scene) {
  if (!term) {
    wx.showToast({ title: '暂无可解释内容', icon: 'none' })
    return Promise.resolve(null)
  }
  return explainTerm(term, nearbyText, scene).then(res => {
    wx.showModal({
      title: res.term || term,
      content: `${res.explanation || ''}\n\n提醒：${res.risk_tip || '不懂的词先问清楚，再操作。'}`,
      showCancel: false,
      confirmText: '知道了'
    })
    return res
  }).catch(() => {
    wx.showModal({
      title: term,
      content: `${term}要结合风险、期限、收益来源和官方渠道理解。提醒：不要因为别人催促或承诺高收益就急着转账。`,
      showCancel: false,
      confirmText: '知道了'
    })
    return null
  })
}

// 点击难词直接跳转AI助手页面一键询问
function goAskTerm(term) {
  const cleanTerm = normalizeTermInput(term)
  if (!cleanTerm) {
    wx.showToast({ title: '暂无可解释内容', icon: 'none' })
    return
  }
  const question = `请帮我解释一下「${cleanTerm}」是什么意思，和我的养老理财有什么关系？`
  wx.navigateTo({
    url: `/pages/assistant/assistant?question=${encodeURIComponent(question)}`
  })
}

module.exports = {
  explainTerm,
  showTermExplain,
  handleDoubleTap,
  openTermPopup,
  closeTermPopup,
  extractTermsFromText,
  buildTermSegments,
  mergeTerms,
  goAskTerm
}
