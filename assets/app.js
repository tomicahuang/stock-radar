(function () {
  'use strict';

  const DATA = window.STOCK_DATA;
  const CELEB = window.CELEB || { people: [], mentions: {} };
  const IND = {
    '01': '水泥', '02': '食品', '03': '塑膠', '04': '紡織纖維', '05': '電機機械', '06': '電器電纜',
    '08': '玻璃陶瓷', '09': '造紙', '10': '鋼鐵', '11': '橡膠', '12': '汽車', '14': '建材營造',
    '15': '航運業', '16': '觀光餐旅', '17': '金融保險業', '18': '貿易百貨', '19': '綜合', '20': '其他',
    '21': '化學', '22': '生技醫療', '23': '油電燃氣',
    '24': '半導體業', '25': '電腦及週邊設備業', '26': '光電業', '27': '通信網路業',
    '28': '電子零組件業', '29': '電子通路業', '30': '資訊服務業', '31': '其他電子業',
    '32': '文化創意', '33': '農業科技', '34': '電子商務', '35': '綠能環保', '36': '數位雲端', '37': '運動休閒', '38': '居家生活'
  };
  const GROUPS = { elec: '電子', ship: '航運', trad: '傳產', fin: '金融' };
  const groupOf = ind => (ind >= '24' && ind <= '31' ? 'elec' : ind === '15' ? 'ship' : ind === '17' ? 'fin' : 'trad');
  const MA_NAME = { 5: '5日線', 10: '10日線', 20: '月線' };
  const MA_SLOPE_LOOK = { 5: 1, 10: 2, 20: 5 };
  const DAYS_LABEL = { 1: '今日', 3: '3 日內', 5: '1 週內', 10: '2 週內', 20: '4 週內' };
  const daysLabel = d => DAYS_LABEL[d] || `${d} 日內`;
  const TOP_CHOICES = [30, 50, 100];
  const MODES = ['break', 'up', 'drop', 'inst', 'macd', 'combo', 'div'];
  const PEOPLE = Object.fromEntries((CELEB.people || []).map(p => [p.id, p]));
  const SUB = window.SUB_IND && window.SUB_IND.groups ? window.SUB_IND : null;
  // Product value chains used for the sub-industry chips; theme chains (AI, cloud…) only show in the drawer.
  const CORE_CHAINS = ['半導體', '電腦及週邊設備', '通信網路', '平面顯示器', '觸控面板', '印刷電路板', '被動元件', '連接器',
    'LED照明產業', '太陽能產業', '能源元件', '電動車輛產業', '軟體服務', '其他'];
  const CHAIN_LABEL = { 'LED照明產業': 'LED照明', '太陽能產業': '太陽能', '電動車輛產業': '電動車', '其他': '其他電子' };
  const CHAIN_PREF = {
    '24': ['半導體'], '25': ['電腦及週邊設備'], '26': ['平面顯示器', 'LED照明產業', '觸控面板', '太陽能產業'],
    '27': ['通信網路'], '28': ['印刷電路板', '被動元件', '連接器', '能源元件', '電腦及週邊設備'],
    '29': ['半導體', '電腦及週邊設備', '通信網路'], '30': ['軟體服務'], '31': ['其他']
  };
  const chainName = c => CHAIN_LABEL[c] || c;
  const shortSub = s => s.replace(/[（(][^）)]*[）)]/g, '').trim();
  const SUB_GROUPS = SUB ? SUB.groups.map(([chain, mid, fine]) => {
    const label = shortSub(fine || mid);
    return { chain, mid, fine, label, key: chain + '|' + label, core: CORE_CHAINS.includes(chain), size: 0 };
  }) : [];
  if (SUB) for (const gs of Object.values(SUB.stocks)) for (const g of gs) if (SUB_GROUPS[g]) SUB_GROUPS[g].size++;
  function primarySub(ind, groups) {
    const core = groups.filter(g => g.core);
    if (!core.length) return null;
    const pref = CHAIN_PREF[ind] || [];
    const tally = {};
    for (const g of core) tally[g.chain] = (tally[g.chain] || 0) + 1;
    const chain = pref.find(c => tally[c]) || Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0];
    const hits = core.filter(g => g.chain === chain);
    if (new Set(hits.map(g => g.label)).size === 1) return hits[0];
    const mids = [...new Set(hits.map(g => g.mid))];
    if (mids.length === 1 && hits[0].fine) return { ...hits[0], label: shortSub(mids[0]) };
    const named = hits.filter(g => !g.label.startsWith('其他'));
    const pool = named.length ? named : hits;
    const best = pool.reduce((a, b) => (b.size > a.size ? b : a));
    const n = new Set(pool.map(g => g.label)).size;
    return n > 1 ? { ...best, label: `${best.label} 等${n}項` } : best;
  }
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  const state = {
    mode: 'break',
    topN: 50,
    breakMa: 20,
    breakDays: 10,
    stillBelow: true,
    slopeDown: false,
    volBreak: false,
    dipOnly: false,
    upMa: 20,
    upDays: 5,
    stillAbove: true,
    upSlope: false,
    upVol: false,
    bullOnly: false,
    minVol: 200,
    groups: new Set(['elec']),
    industries: new Set(),
    subs: new Set(),
    subMore: false,
    celebOnly: false,
    query: '',
    dropBase: 'month',
    dropMetric: 'change',
    threshold: 30,
    onlyHit: false,
    instWho: 'fi',
    instDays: 3,
    instBelow: false,
    macdType: 'osc',
    macdWithin: 5,
    macdSort: 'strength',
    macdStill: true,
    macdLow: false,
    cbMacd: true,
    cbMacdWithin: 5,
    cbFi: true,
    cbFiDays: 3,
    cbDrop: true,
    cbDropBase: 'month',
    cbDropThr: 20,
    cbBreak: true,
    cbBreakMa: 20,
    cbBreakDays: 20,
    cbUp: false,
    cbUpMa: 5,
    cbUpDays: 5,
    comboMatch: 'score',
    divWithin: 30,
    divType: 'all',
    divSort: 'date',
    divAnnOnly: false,
    divCanBuy: true,
    openCeleb: null,
    sortKey: null,
    sortDir: 1
  };
  const WHO = { fi: '外資', it: '投信', dl: '自營商', all: '三大法人合計', both: '外資＋投信同買' };
  const COMBO_KEY = { macd: 'cbMacd', fi: 'cbFi', drop: 'cbDrop', brk: 'cbBreak', up: 'cbUp' };
  const COMBO_ORDER = ['macd', 'fi', 'drop', 'brk', 'up'];
  // <select> controls whose id equals the numeric state key
  const NUM_CTLS = ['topN', 'cbMacdWithin', 'cbFiDays', 'cbDropThr', 'cbBreakMa', 'cbBreakDays', 'cbUpMa', 'cbUpDays'];

  if (!DATA || !DATA.dates || !DATA.stocks) {
    $('#nodata').classList.remove('hidden');
    return;
  }

  const dates = DATA.dates;
  const T = dates.length;
  const LAST = T - 1;
  const instDates = DATA.instDates || [];
  const instT = instDates.map(d => dates.indexOf(d));

  // ------------------------------------------------------------------ math
  function sma(a, n) {
    const out = new Array(a.length).fill(null);
    let sum = 0, valid = 0;
    for (let i = 0; i < a.length; i++) {
      if (a[i] != null) { sum += a[i]; valid++; }
      if (i >= n && a[i - n] != null) { sum -= a[i - n]; valid--; }
      if (i >= n - 1 && valid === n) out[i] = sum / n;
    }
    return out;
  }

  function rsi(a, n) {
    const out = new Array(a.length).fill(null);
    let ag = 0, al = 0, cnt = 0;
    for (let i = 1; i < a.length; i++) {
      if (a[i] == null || a[i - 1] == null) continue;
      const ch = a[i] - a[i - 1];
      const g = Math.max(ch, 0), l = Math.max(-ch, 0);
      if (cnt < n) {
        ag += g; al += l; cnt++;
        if (cnt < n) continue;
        ag /= n; al /= n;
      } else {
        ag = (ag * (n - 1) + g) / n;
        al = (al * (n - 1) + l) / n;
      }
      out[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
    }
    return out;
  }

  function kd(h, l, c, n) {
    const K = new Array(c.length).fill(null), D = new Array(c.length).fill(null);
    let k = 50, d = 50;
    for (let i = n - 1; i < c.length; i++) {
      let hh = -Infinity, ll = Infinity, ok = true;
      for (let j = i - n + 1; j <= i; j++) {
        if (h[j] == null || l[j] == null) { ok = false; break; }
        if (h[j] > hh) hh = h[j];
        if (l[j] < ll) ll = l[j];
      }
      if (!ok || c[i] == null) continue;
      const rsv = hh === ll ? 50 : (c[i] - ll) / (hh - ll) * 100;
      k = k * 2 / 3 + rsv / 3;
      d = d * 2 / 3 + k / 3;
      K[i] = k; D[i] = d;
    }
    return { K, D };
  }

  function ema(a, n) {
    const out = new Array(a.length).fill(null);
    const k = 2 / (n + 1);
    let e = null;
    for (let i = 0; i < a.length; i++) {
      if (a[i] == null) continue;
      e = e == null ? a[i] : a[i] * k + e * (1 - k);
      out[i] = e;
    }
    return out;
  }

  function macd(c) {
    const e12 = ema(c, 12), e26 = ema(c, 26);
    const dif = c.map((_, i) => (e12[i] == null || e26[i] == null ? null : e12[i] - e26[i]));
    const dea = ema(dif, 9);
    const osc = dif.map((x, i) => (x == null || dea[i] == null ? null : x - dea[i]));
    const warm = c.findIndex(x => x != null) + 34;
    for (let i = 0; i < c.length && i < warm; i++) { dif[i] = null; dea[i] = null; osc[i] = null; }
    return { dif, dea, osc };
  }

  // Back-adjust prices for ex-dividend / ex-rights / capital changes using TWSE reference price (close - change).
  function adjustFactors(c, d) {
    const f = new Array(T).fill(1);
    let factor = 1;
    for (let t = T - 1; t >= 0; t--) {
      f[t] = factor;
      if (t > 0 && c[t] != null && d[t] != null) {
        let p = t - 1;
        while (p >= 0 && c[p] == null) p--;
        if (p >= 0) {
          const ref = c[t] - d[t];
          if (ref > 0 && Math.abs(ref / c[p] - 1) > 0.0005) factor *= ref / c[p];
        }
      }
    }
    return f;
  }

  function ffill(a) {
    const out = new Array(a.length).fill(null);
    let last = null;
    for (let i = 0; i < a.length; i++) {
      if (a[i] != null) last = a[i];
      out[i] = last;
    }
    return out;
  }

  const avg = arr => {
    const v = arr.filter(x => x != null);
    return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
  };

  // ------------------------------------------------------------------ precompute
  // s = { c, n, i, o, h, l, cl, v, d, fi?, it?, dl? } with arrays aligned to DATA.dates (stocks and ETFs share this)
  function prep(s) {
    const f = adjustFactors(s.cl, s.d);
    const adj = arr => arr.map((v, i) => (v == null ? null : v * f[i]));
    const c = adj(s.cl);
    const fc = ffill(c);
    const h = adj(s.h).map((v, i) => (v == null ? fc[i] : v));
    const l = adj(s.l).map((v, i) => (v == null ? fc[i] : v));
    const o = adj(s.o).map((v, i) => (v == null ? fc[i] : v));
    const v = s.v.map(x => (x == null ? 0 : x));
    const ma5 = sma(fc, 5), ma10 = sma(fc, 10), ma20 = sma(fc, 20), ma60 = sma(fc, 60);
    const r = rsi(fc, 14);
    const { K, D } = kd(h, l, fc, 9);
    const { dif, dea, osc } = macd(fc);
    const st = {
      code: s.c, name: s.n, ind: s.i, indName: IND[s.i] || s.i, grp: groupOf(s.i),
      raw: s.cl, c, fc, o, h, l, v, ma5, ma10, ma20, ma60, rsi: r, K, D, dif, dea, osc,
      fi: s.fi || null, it: s.it || null, dl: s.dl || null,
      mentions: (CELEB.mentions || {})[s.c] || [],
      halted: s.cl[LAST] == null
    };
    st.close = fc[LAST];
    st.dayChg = fc[LAST - 1] ? fc[LAST] / fc[LAST - 1] - 1 : null;
    st.vol20 = avg(v.slice(Math.max(0, T - 20)));
    st.bias = ma20[LAST] ? fc[LAST] / ma20[LAST] - 1 : null;
    st.below = ma20[LAST] != null && fc[LAST] < ma20[LAST];
    st.slopeDown = ma20[LAST] != null && ma20[LAST - 5] != null && ma20[LAST] < ma20[LAST - 5];
    st.bearAlign = ma5[LAST] != null && ma10[LAST] != null && ma20[LAST] != null && ma5[LAST] < ma10[LAST] && ma10[LAST] < ma20[LAST];
    st.bullAlign = ma5[LAST] != null && ma10[LAST] != null && ma20[LAST] != null && ma5[LAST] > ma10[LAST] && ma10[LAST] > ma20[LAST];
    st.belowMA60 = ma60[LAST] != null && fc[LAST] < ma60[LAST];
    st.rsiNow = r[LAST];
    st.kNow = K[LAST];
    st.dNow = D[LAST];
    st.oversold = st.rsiNow != null && st.rsiNow < 30;
    st.kdGolden = K[LAST] != null && K[LAST - 1] != null && K[LAST] > D[LAST] && K[LAST - 1] <= D[LAST - 1] && K[LAST] < 30;
    st.dip = st.bias != null && st.rsiNow != null && st.bias <= -0.05 && st.rsiNow <= 40;
    st.macdTurn = findCross(osc, 3);
    st.groups = SUB ? (SUB.stocks[s.c] || []).map(g => SUB_GROUPS[g]).filter(Boolean) : [];
    st.subKeys = new Set(st.groups.filter(g => g.core).map(g => g.key));
    st.sub = primarySub(s.i, st.groups);
    return st;
  }
  const stocks = DATA.stocks.map(prep);
  const byCode = Object.fromEntries(stocks.map(s => [s.code, s]));
  let instLast = -1;
  for (let j = instDates.length - 1; j >= 0 && instLast < 0; j--) {
    if (stocks.some(s => s.fi && s.fi[j] != null)) instLast = j;
  }
  for (const st of stocks) {
    const j = instLast;
    st.bothBuy = j >= 0 && st.fi && st.it && st.fi[j] > 0 && st.it[j] > 0;
  }

  // Industry codes that have stocks in the checked groups (electronics / shipping / traditional / finance).
  function visibleCodes() {
    return [...new Set(stocks.filter(s => state.groups.has(s.grp)).map(s => s.ind))].sort();
  }

  // ------------------------------------------------------------------ remember settings on this device
  const SAVE_KEY = 'stock-radar-settings-v2';
  const SAVE_SKIP = new Set(['openCeleb', 'sortKey', 'sortDir', 'subMore', 'query']);
  function saveState() {
    try {
      const o = {};
      for (const [k, v] of Object.entries(state)) if (!SAVE_SKIP.has(k)) o[k] = v instanceof Set ? [...v] : v;
      localStorage.setItem(SAVE_KEY, JSON.stringify(o));
    } catch (e) { /* private mode or storage full: settings just are not kept */ }
  }
  function loadState() {
    let o = null;
    try { o = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { o = null; }
    if (o && typeof o === 'object') {
      for (const [k, v] of Object.entries(o)) {
        if (!(k in state) || SAVE_SKIP.has(k)) continue;
        const cur = state[k];
        if (cur instanceof Set) { if (Array.isArray(v)) state[k] = new Set(v); }
        else if (cur === null || typeof cur === typeof v) state[k] = v;
      }
    }
    if (!MODES.includes(state.mode)) state.mode = 'break';
    if (!TOP_CHOICES.includes(state.topN)) state.topN = 50;
    state.groups = new Set([...state.groups].filter(g => GROUPS[g]));
    if (!state.groups.size) state.groups = new Set(['elec']);
    const vis = new Set(visibleCodes());
    state.industries = new Set([...state.industries].filter(c => vis.has(c)));
    if (!state.industries.size) state.industries = vis;
    const subKeys = new Set(SUB_GROUPS.map(g => g.key));
    state.subs = new Set([...state.subs].filter(k => subKeys.has(k)));
  }
  loadState();

  // Most recent index within the last `within` days where series turns from <= 0 to > 0.
  function findCross(a, within) {
    for (let t = LAST; t > LAST - within && t >= 1; t--) {
      if (a[t] != null && a[t - 1] != null && a[t - 1] <= 0 && a[t] > 0) return t;
    }
    return -1;
  }

  function instNet(st, who, j) {
    const f = st.fi ? st.fi[j] : null, t = st.it ? st.it[j] : null, d = st.dl ? st.dl[j] : null;
    if (who === 'fi') return f;
    if (who === 'it') return t;
    if (who === 'dl') return d;
    if (who === 'all') return f == null && t == null && d == null ? null : (f || 0) + (t || 0) + (d || 0);
    if (f == null || t == null) return null;
    return f > 0 && t > 0 ? f + t : Math.min(f, t);
  }

  function instStreak(st, who) {
    let n = 0, cum = 0;
    for (let j = instLast; j >= 0; j--) {
      const x = instNet(st, who, j);
      if (x == null || x <= 0) break;
      n++; cum += x;
    }
    return { n, cum, startJ: instLast - n + 1 };
  }

  const maOf = (st, n) => st['ma' + n];
  const biasOf = (st, n) => { const m = maOf(st, n)[LAST]; return m ? st.close / m - 1 : null; };
  const isBelow = (st, n) => maOf(st, n)[LAST] != null && st.close < maOf(st, n)[LAST];
  const isAbove = (st, n) => maOf(st, n)[LAST] != null && st.close > maOf(st, n)[LAST];
  function maSlope(st, n) {
    const m = maOf(st, n), p = LAST - MA_SLOPE_LOOK[n];
    return p >= 0 && m[LAST] != null && m[p] != null ? m[LAST] - m[p] : null;
  }

  // Most recent day within the last `days` trading days where the close crosses the n-day MA:
  // dir < 0 = break below (prev close >= MA, close < MA), dir > 0 = move above (prev close <= MA, close > MA).
  function findMaCross(st, n, days, dir) {
    const m = maOf(st, n), from = Math.max(1, T - days);
    for (let t = LAST; t >= from; t--) {
      if (st.raw[t] == null) continue;
      const a = st.fc[t - 1], b = m[t - 1], x = st.fc[t], y = m[t];
      if (a == null || b == null || x == null || y == null) continue;
      if (dir < 0 ? a >= b && x < y : a <= b && x > y) return t;
    }
    return -1;
  }

  function volRatioAt(st, t) {
    const prev = avg(st.v.slice(Math.max(0, t - 5), t));
    return prev ? st.v[t] / prev : null;
  }

  function dropBaseIndex(base = state.dropBase) {
    if (base === 'rolling') return Math.max(0, LAST - 20);
    const ym = dates[LAST].slice(0, 7);
    const first = dates.findIndex(d => d.slice(0, 7) === ym);
    return Math.max(0, first - 1);
  }

  // ------------------------------------------------------------------ formatting
  const fmtP = v => (v == null ? '–' : v >= 1000 ? v.toFixed(0) : v >= 100 ? v.toFixed(1) : v.toFixed(2));
  const fmtPct = (v, d = 2) => (v == null ? '–' : (v > 0 ? '+' : '') + (v * 100).toFixed(d) + '%');
  const cls = v => (v == null || Math.abs(v) < 1e-9 ? 'flat' : v > 0 ? 'up' : 'down');
  const fmtInt = v => (v == null ? '–' : Math.round(v).toLocaleString('zh-TW'));
  const md = d => d.slice(5).replace('-', '/');
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const links = code =>
    `<a href="https://tw.stock.yahoo.com/quote/${code}.TW/technical-analysis" target="_blank" rel="noopener" title="Yahoo股市 技術分析">Y</a>` +
    `<a href="https://pchome.megatime.com.tw/stock/sid${code}.html" target="_blank" rel="noopener" title="PChome股市">P</a>` +
    `<a href="https://goodinfo.tw/tw/StockDetail.asp?STOCK_ID=${code}" target="_blank" rel="noopener" title="Goodinfo">G</a>`;

  function signalTags(st, extra) {
    const t = [];
    if (extra && extra.note) t.push(`<span class="tag neutral">${extra.note}</span>`);
    if (st.bullAlign) t.push('<span class="tag bull">多頭排列</span>');
    if (st.bearAlign) t.push('<span class="tag bear">空頭排列</span>');
    if (st.slopeDown) t.push('<span class="tag bear">月線下彎</span>');
    if (extra && extra.volBreak) t.push('<span class="tag bear">量增跌破</span>');
    if (extra && extra.volUp) t.push('<span class="tag bull">量增站上</span>');
    if (st.belowMA60) t.push('<span class="tag bear">破季線</span>');
    if (st.oversold) t.push('<span class="tag bull">RSI 超賣</span>');
    if (st.kdGolden) t.push('<span class="tag bull">KD 低檔金叉</span>');
    if (st.dip) t.push('<span class="tag dip">低接觀察</span>');
    if (st.macdTurn >= 0 && st.osc[LAST] > 0) t.push('<span class="tag bull">MACD 翻正</span>');
    if (st.bothBuy) t.push('<span class="tag inst">土洋同買</span>');
    if (st.halted) t.push('<span class="tag muted">今日無成交</span>');
    return t.join('');
  }

  function indCell(st) {
    if (!st.sub) return `<span class="flat">${st.indName}</span>`;
    const all = [...new Set(st.groups.map(g => `${chainName(g.chain)}・${g.label}`))].join('\n');
    const picked = [...state.subs].filter(k => st.subKeys.has(k)).map(k => k.slice(k.indexOf('|') + 1));
    const label = picked.length ? picked.join('、') : st.sub.label;
    return `<span class="flat" title="${esc(all)}">${st.indName}<span class="sub-name">${esc(label)}</span></span>`;
  }

  function celebBadges(st) {
    const who = [...new Set(st.mentions.map(m => m.w))];
    return who.map(w => {
      const p = PEOPLE[w];
      const tip = st.mentions.filter(m => m.w === w).map(m => m.t).join('；');
      return p ? `<span class="badge ${w}" title="${esc(p.name + '：' + tip)}">${p.badge}</span>` : '';
    }).join('');
  }

  // ------------------------------------------------------------------ filtering
  function baseUniverse(ignoreIndustry, ignoreSubs = ignoreIndustry) {
    const q = state.query.trim().toLowerCase();
    const subs = ignoreSubs ? [] : [...state.subs];
    return stocks.filter(st => {
      if (st.close == null || st.ma20[LAST] == null) return false;
      if (!state.groups.has(st.grp)) return false;
      if ((st.vol20 || 0) < state.minVol) return false;
      if (!ignoreIndustry && !state.industries.has(st.ind)) return false;
      if (subs.length && !subs.some(k => st.subKeys.has(k))) return false;
      if (state.celebOnly && !st.mentions.length) return false;
      if (q && !(st.code.includes(q) || st.name.toLowerCase().includes(q))) return false;
      return true;
    });
  }

  function computeRows() {
    const uni = baseUniverse(false);
    if (state.mode === 'break' || state.mode === 'up') {
      const isUp = state.mode === 'up';
      const n = isUp ? state.upMa : state.breakMa;
      const days = isUp ? state.upDays : state.breakDays;
      const baseIdx = Math.max(0, LAST - days);
      let rows = [];
      for (const st of uni) {
        const ci = findMaCross(st, n, days, isUp ? 1 : -1);
        if (ci < 0) continue;
        const side = isUp ? isAbove(st, n) : isBelow(st, n);
        if ((isUp ? state.stillAbove : state.stillBelow) && !side) continue;
        const sl = maSlope(st, n);
        if (isUp ? state.upSlope && !(sl > 0) : state.slopeDown && !(sl < 0)) continue;
        const vr = volRatioAt(st, ci);
        const volHit = vr != null && vr >= 1.5;
        if ((isUp ? state.upVol : state.volBreak) && !volHit) continue;
        if (!isUp && state.dipOnly && !st.dip) continue;
        if (isUp && state.bullOnly && !st.bullAlign) continue;
        rows.push({
          st, crossIdx: ci, daysAgo: LAST - ci, volRatio: vr, volHit, side, bias: biasOf(st, n),
          periodChg: st.fc[baseIdx] ? st.close / st.fc[baseIdx] - 1 : null
        });
      }
      // break: deepest below the MA first; up: most recent cross first, then the strongest volume
      rows.sort(isUp
        ? (a, b2) => a.daysAgo - b2.daysAgo || (b2.volRatio ?? 0) - (a.volRatio ?? 0)
        : (a, b2) => (a.bias ?? 0) - (b2.bias ?? 0));
      const total = rows.length;
      rows = rows.slice(0, state.topN);
      rows.forEach((r, i) => (r.rank = i + 1));
      return { uni, rows, total };
    }
    if (state.mode === 'inst') {
      if (instLast < 0) return { uni, rows: [], total: 0 };
      let rows = [];
      for (const st of uni) {
        if (state.instBelow && !st.below) continue;
        const s = instStreak(st, state.instWho);
        if (s.n < state.instDays) continue;
        const t0 = instT[s.startJ], tPrev = t0 > 0 ? t0 - 1 : t0;
        rows.push({
          st, streak: s.n, cum: s.cum,
          cumRatio: st.vol20 ? s.cum / st.vol20 : null,
          streakChg: st.fc[tPrev] ? st.close / st.fc[tPrev] - 1 : null,
          fiNow: st.fi ? st.fi[instLast] : null,
          itNow: st.it ? st.it[instLast] : null,
          dlNow: st.dl ? st.dl[instLast] : null
        });
      }
      rows.sort((a, b2) => b2.streak - a.streak || b2.cum - a.cum);
      const total = rows.length;
      rows = rows.slice(0, state.topN);
      rows.forEach((r, i) => (r.rank = i + 1));
      return { uni, rows, total };
    }
    if (state.mode === 'combo') {
      const keys = COMBO_ORDER.filter(k => state[COMBO_KEY[k]]);
      const b = dropBaseIndex(state.cbDropBase);
      const counts = { macd: 0, fi: 0, drop: 0, brk: 0, up: 0, all: 0 };
      let rows = uni.map(st => {
        const turn = findCross(st.osc, state.cbMacdWithin);
        const fiN = instLast >= 0 ? instStreak(st, 'fi').n : 0;
        const chg = st.fc[b] ? st.close / st.fc[b] - 1 : null;
        const bi = findMaCross(st, state.cbBreakMa, state.cbBreakDays, -1);
        const ui = findMaCross(st, state.cbUpMa, state.cbUpDays, 1);
        const ok = {
          macd: turn >= 0 && st.osc[LAST] > 0,
          fi: fiN >= state.cbFiDays,
          drop: chg != null && chg <= -state.cbDropThr / 100,
          brk: bi >= 0 && isBelow(st, state.cbBreakMa),
          up: ui >= 0 && isAbove(st, state.cbUpMa)
        };
        for (const k of Object.keys(ok)) if (ok[k]) counts[k]++;
        const score = keys.filter(k => ok[k]).length;
        if (keys.length && score === keys.length) counts.all++;
        return { st, ok, score, need: keys.length, turn, fiN, chg, breakIdx: bi, upIdx: ui };
      });
      rows = rows.filter(r => r.need > 0 && (state.comboMatch === 'all' ? r.score === r.need : r.score > 0));
      rows.sort((a, b2) => b2.score - a.score || (a.chg ?? 0) - (b2.chg ?? 0));
      const total = rows.length;
      rows = rows.slice(0, state.topN);
      rows.forEach((r, i) => (r.rank = i + 1));
      return { uni, rows, total, counts, keys, baseDate: dates[b] };
    }
    if (state.mode === 'div') {
      let rows = [];
      for (const st of uni) {
        const n = st.sNext;
        if (!n || (state.divAnnOnly && n.est)) continue;
        const days = dayDiff(TODAY, n.ex), buy = lastBuyDay(n.ex);
        if (days > state.divWithin || (state.divCanBuy && buy < TODAY)) continue;
        if (state.divType === 'cash' && !n.type.includes('息')) continue;
        if (state.divType === 'stock' && !n.type.includes('權')) continue;
        const cash = divCash(n);
        rows.push({ st, n, days, buy, cash, cy: cash != null ? cash / st.close : null });
      }
      const by = {
        date: (a, b2) => a.days - b2.days || (b2.cy ?? -1) - (a.cy ?? -1),
        yield: (a, b2) => (b2.cy ?? -1) - (a.cy ?? -1),
        ttm: (a, b2) => (b2.st.sYield ?? -1) - (a.st.sYield ?? -1)
      }[state.divSort];
      rows.sort(by);
      const total = rows.length;
      rows = rows.slice(0, state.topN);
      rows.forEach((r, i) => (r.rank = i + 1));
      return { uni, rows, total };
    }
    if (state.mode === 'macd') {
      const line = state.macdType === 'osc' ? 'osc' : 'dif';
      let rows = [];
      for (const st of uni) {
        const ti = findCross(st[line], state.macdWithin);
        if (ti < 0) continue;
        if (state.macdStill && !(st[line][LAST] > 0)) continue;
        if (state.macdLow && !(st.dif[LAST] < 0)) continue;
        rows.push({
          st, turnIdx: ti, daysAgo: LAST - ti,
          dif: st.dif[LAST], dea: st.dea[LAST], osc: st.osc[LAST],
          oscPct: st.close ? st.osc[LAST] / st.close : null,
          turnChg: st.fc[ti - 1] ? st.close / st.fc[ti - 1] - 1 : null
        });
      }
      const by = {
        strength: (a, b2) => b2.oscPct - a.oscPct,
        recent: (a, b2) => a.daysAgo - b2.daysAgo || b2.oscPct - a.oscPct,
        volume: (a, b2) => (b2.st.vol20 || 0) - (a.st.vol20 || 0)
      }[state.macdSort];
      rows.sort(by);
      const total = rows.length;
      rows = rows.slice(0, state.topN);
      rows.forEach((r, i) => (r.rank = i + 1));
      return { uni, rows, total };
    }
    const b = dropBaseIndex();
    const rows = uni.map(st => {
      let peak = -Infinity;
      for (let t = b; t <= LAST; t++) if (st.fc[t] != null && st.fc[t] > peak) peak = st.fc[t];
      const change = st.fc[b] ? st.close / st.fc[b] - 1 : null;
      const drawdown = peak > 0 ? st.close / peak - 1 : null;
      const metric = state.dropMetric === 'change' ? change : drawdown;
      return { st, change, drawdown, metric, hit: metric != null && metric <= -state.threshold / 100, breakIdx: findMaCross(st, 20, 20, -1) };
    }).filter(r => r.metric != null);
    rows.sort((a, b2) => a.metric - b2.metric);
    let top = rows.slice(0, state.topN);
    if (state.onlyHit) top = top.filter(r => r.hit);
    top.forEach((r, i) => (r.rank = i + 1));
    return { uni, rows: top, allHits: rows.filter(r => r.hit).length, baseDate: dates[b] };
  }

  // ------------------------------------------------------------------ table
  const pctCell = v => `<span class="${cls(v)}">${fmtPct(v)}</span>`;
  const BK = {
    name: { k: 'name', t: '股票', l: true, v: r => r.st.code, h: r => `<span class="code">${r.st.code}</span><span class="name">${esc(r.st.name)}</span>` },
    ind: { k: 'ind', t: '產業', l: true, v: r => r.st.indName + (r.st.sub ? r.st.sub.label : ''), h: r => indCell(r.st) },
    close: { k: 'close', t: '收盤', v: r => r.st.close, h: r => fmtP(r.st.close) },
    day: { k: 'day', t: '日漲跌', v: r => r.st.dayChg, h: r => pctCell(r.st.dayChg) },
    ma20: { k: 'ma20', t: '月線', v: r => r.st.ma20[LAST], h: r => fmtP(r.st.ma20[LAST]) },
    bias: { k: 'bias', t: '月線乖離', v: r => r.st.bias, h: r => pctCell(r.st.bias) },
    rsi: { k: 'rsi', t: 'RSI14', v: r => r.st.rsiNow, h: r => (r.st.rsiNow == null ? '–' : r.st.rsiNow.toFixed(1)) },
    kd: { k: 'kd', t: 'K / D', v: r => r.st.kNow, h: r => (r.st.kNow == null ? '–' : `${r.st.kNow.toFixed(0)} / ${r.st.dNow.toFixed(0)}`) },
    vol: { k: 'vol', t: '20日均量', v: r => r.st.vol20, h: r => fmtInt(r.st.vol20) },
    celeb: { k: 'celeb', t: '名人', l: true, v: r => r.st.mentions.length, h: r => celebBadges(r.st) },
    lnk: { k: 'lnk', t: '連結', l: true, v: () => 0, h: r => `<span class="links">${links(r.st.code)}</span>` }
  };
  const RANK = { k: 'rank', t: '#', v: r => r.rank, h: r => `<span class="rank">${r.rank}</span>` };
  const SIG = { k: 'sig', t: '技術訊號', l: true, v: r => (r.st.dip ? 1 : 0), h: r => signalTags(r.st) };
  const fmtLots = v => (v == null ? '–' : (v > 0 ? '+' : '') + Math.round(v).toLocaleString('zh-TW'));
  const fmtM = v => (v == null ? '–' : Math.abs(v) >= 100 ? v.toFixed(1) : v.toFixed(2));
  const lotsCell = v => `<span class="${cls(v)}">${fmtLots(v)}</span>`;

  // Break-below / move-above tables follow the MA picked in the controls (5 / 10 / 20 days).
  function colsCross() {
    const isUp = state.mode === 'up';
    const n = isUp ? state.upMa : state.breakMa, nm = MA_NAME[n];
    const extra = r => (isUp
      ? { note: r.side ? null : `已跌回${nm}下`, volUp: r.volHit }
      : { note: r.side ? null : `已站回${nm}`, volBreak: r.volHit });
    return [
      RANK, BK.name, BK.ind, BK.close, BK.day,
      { k: 'ma', t: nm, v: r => maOf(r.st, n)[LAST], h: r => fmtP(maOf(r.st, n)[LAST]) },
      { k: 'mb', t: nm + '乖離', v: r => r.bias, h: r => pctCell(r.bias) },
      { k: 'cd', t: isUp ? '站上日' : '跌破日', v: r => r.crossIdx, h: r => md(dates[r.crossIdx]) },
      { k: 'ago', t: '距今(日)', v: r => r.daysAgo, h: r => r.daysAgo },
      { k: 'pc', t: '期間漲跌', v: r => r.periodChg, h: r => pctCell(r.periodChg) },
      { k: 'vr', t: isUp ? '站上量比' : '破線量比', v: r => r.volRatio, h: r => (r.volRatio == null ? '–' : r.volRatio.toFixed(2) + 'x') },
      ...(n === 20 ? [] : [BK.bias]),
      BK.rsi, BK.kd, BK.vol,
      { k: 'sig', t: '技術訊號', l: true, v: r => (r.st.dip ? 1 : 0), h: r => signalTags(r.st, extra(r)) },
      BK.celeb, BK.lnk
    ];
  }

  const COLS_DROP = [
    RANK, BK.name, BK.ind, BK.close, BK.day,
    { k: 'chg', t: '區間跌幅', v: r => r.change, h: r => pctCell(r.change) },
    { k: 'dd', t: '高點回撤', v: r => r.drawdown, h: r => pctCell(r.drawdown) },
    BK.ma20, BK.bias,
    { k: 'bd', t: '4週內跌破月線', v: r => r.breakIdx, h: r => (r.breakIdx >= 0 ? md(dates[r.breakIdx]) : '<span class="flat">–</span>') },
    BK.rsi, BK.kd, BK.vol, SIG, BK.celeb, BK.lnk
  ];

  const COLS_INST = [
    RANK, BK.name, BK.ind, BK.close, BK.day,
    { k: 'streak', t: '連買天數', v: r => r.streak, h: r => `<b class="up">${r.streak}${r.streak >= instDates.length ? '+' : ''}</b> 天` },
    { k: 'cum', t: '連買累計(張)', v: r => r.cum, h: r => lotsCell(r.cum) },
    { k: 'cr', t: '累計/均量', v: r => r.cumRatio, h: r => (r.cumRatio == null ? '–' : (r.cumRatio * 100).toFixed(0) + '%') },
    { k: 'sc', t: '連買期間漲跌', v: r => r.streakChg, h: r => `<span class="${cls(r.streakChg)}">${fmtPct(r.streakChg)}</span>` },
    { k: 'fi', t: '外資(最新)', v: r => r.fiNow, h: r => lotsCell(r.fiNow) },
    { k: 'it', t: '投信(最新)', v: r => r.itNow, h: r => lotsCell(r.itNow) },
    { k: 'dl', t: '自營(最新)', v: r => r.dlNow, h: r => lotsCell(r.dlNow) },
    BK.bias, BK.rsi, BK.vol, SIG, BK.celeb, BK.lnk
  ];

  const COLS_MACD = [
    RANK, BK.name, BK.ind, BK.close, BK.day,
    { k: 'td', t: '翻正日', v: r => r.turnIdx, h: r => md(dates[r.turnIdx]) },
    { k: 'ago', t: '距今(日)', v: r => r.daysAgo, h: r => r.daysAgo },
    { k: 'tc', t: '翻正後漲跌', v: r => r.turnChg, h: r => `<span class="${cls(r.turnChg)}">${fmtPct(r.turnChg)}</span>` },
    { k: 'dif', t: 'DIF', v: r => r.dif, h: r => `<span class="${cls(r.dif)}">${fmtM(r.dif)}</span>` },
    { k: 'dea', t: 'DEA', v: r => r.dea, h: r => fmtM(r.dea) },
    { k: 'osc', t: 'OSC 柱', v: r => r.osc, h: r => `<span class="${cls(r.osc)}">${fmtM(r.osc)}</span>` },
    { k: 'op', t: '柱狀體強度', v: r => r.oscPct, h: r => `<span class="${cls(r.oscPct)}">${fmtPct(r.oscPct)}</span>` },
    { k: 'zero', t: 'DIF 位置', l: true, v: r => r.dif, h: r => (r.dif >= 0 ? '<span class="up">0 軸上</span>' : '<span class="down">0 軸下（低檔）</span>') },
    BK.bias, BK.rsi, BK.kd, BK.vol, SIG, BK.celeb, BK.lnk
  ];

  const hitCell = (ok, html) => `<span class="${ok ? 'met' : 'unmet'}">${ok ? '✓ ' : ''}${html}</span>`;
  function colsCombo() {
    const bn = MA_NAME[state.cbBreakMa], un = MA_NAME[state.cbUpMa];
    return [
      RANK, BK.name, BK.ind, BK.close, BK.day,
      { k: 'score', t: '符合條件', v: r => r.score, h: r => `<b class="${r.score === r.need ? 'up' : ''}">${r.score} / ${r.need}</b>` },
      { k: 'cm', t: 'MACD 翻正', v: r => (r.ok.macd ? -r.turn : null), h: r => hitCell(r.ok.macd, r.turn >= 0 ? md(dates[r.turn]) : '–') },
      { k: 'cf', t: '外資連買', v: r => r.fiN, h: r => hitCell(r.ok.fi, r.fiN + ' 天') },
      { k: 'cd', t: '月跌幅', v: r => r.chg, h: r => hitCell(r.ok.drop, fmtPct(r.chg)) },
      { k: 'cb', t: '跌破' + bn, v: r => (r.ok.brk ? -r.breakIdx : null),
        h: r => hitCell(r.ok.brk, r.breakIdx >= 0 ? md(dates[r.breakIdx]) + (isBelow(r.st, state.cbBreakMa) ? '' : '（已站回）') : '–') },
      { k: 'cu', t: '站上' + un, v: r => (r.ok.up ? -r.upIdx : null),
        h: r => hitCell(r.ok.up, r.upIdx >= 0 ? md(dates[r.upIdx]) + (isAbove(r.st, state.cbUpMa) ? '' : '（已跌回）') : '–') },
      BK.bias, BK.rsi, BK.vol, SIG, BK.celeb, BK.lnk
    ];
  }

  const COLS_DIV = [
    RANK, BK.name, BK.ind, BK.close, BK.day,
    { k: 'ex', t: '除權息日', v: r => r.days,
      h: r => `<span class="${r.n.est ? 'flat' : 'up'}">${md(r.n.ex)}${r.n.est ? ' 預估' : ''}</span><span class="sub-name">${r.days} 天後</span>` },
    { k: 'buy', t: '最慢買進日', v: r => r.buy, h: r => buyCell(r.n.ex, r.n.est) },
    { k: 'type', t: '類別', l: true, v: r => r.n.type, h: r => divTypeTag(r.n) },
    { k: 'cash', t: '現金股利', v: r => r.cash,
      h: r => (r.cash == null ? `<span class="flat">${r.n.est || !r.n.type.includes('息') ? '–' : '待公告'}</span>` : `${r.n.est ? '約 ' : ''}${fmtAmt(r.cash)} 元`) },
    { k: 'sr', t: '配股／現增', l: true, v: r => r.n.sr || r.n.ir || 0, h: r => stockPart(r.n) },
    { k: 'cy', t: '本次現金殖利率', v: r => r.cy, h: r => `<b class="${r.cy ? 'up' : 'flat'}">${fmtYield(r.cy)}</b>` },
    { k: 'ttm', t: '近12月殖利率', v: r => r.st.sYield, h: r => fmtYield(r.st.sYield) },
    { k: 'last', t: '上次除權息・填權息', v: r => (r.st.sLast ? r.st.sLast.ex : null), h: r => lastStockCell(r.st) },
    BK.bias, BK.vol, SIG, BK.celeb, BK.lnk
  ];

  function colsFor(mode) {
    if (mode === 'break' || mode === 'up') return colsCross();
    if (mode === 'combo') return colsCombo();
    return { drop: COLS_DROP, inst: COLS_INST, macd: COLS_MACD, div: COLS_DIV }[mode];
  }

  function comboLabels() {
    return {
      macd: `MACD 翻正（${daysLabel(state.cbMacdWithin)}）`,
      fi: `外資連買 ≥ ${state.cbFiDays} 天`,
      drop: `${state.cbDropBase === 'month' ? '本月' : '近 20 日'}跌幅 ≥ ${state.cbDropThr}%`,
      brk: `${daysLabel(state.cbBreakDays)}跌破${MA_NAME[state.cbBreakMa]}`,
      up: `${daysLabel(state.cbUpDays)}站上${MA_NAME[state.cbUpMa]}`
    };
  }

  function renderComboStats(res) {
    const L = comboLabels();
    const items = COMBO_ORDER.map(k => {
      const on = res.keys.includes(k);
      return `<span class="cstat ${on ? '' : 'off'}">${L[k]} <b>${res.counts[k]}</b> 檔</span>`;
    });
    items.push(`<span class="cstat all">勾選條件全部符合 <b>${res.keys.length ? res.counts.all : 0}</b> 檔</span>`);
    $('#comboStats').innerHTML = items.join('');
  }

  function tableTitle(res, n) {
    const pick = by => (res.total > n ? `依${by}取前 ${n} 名` : `全部列出（依${by}排序）`);
    if (state.mode === 'break') {
      return `${daysLabel(state.breakDays)}跌破${MA_NAME[state.breakMa]}：符合 ${res.total} 檔，${pick(MA_NAME[state.breakMa] + '乖離（跌最深）')}`;
    }
    if (state.mode === 'up') {
      return `${daysLabel(state.upDays)}站上${MA_NAME[state.upMa]}：符合 ${res.total} 檔，${pick('最新站上、量比大')}`;
    }
    if (state.mode === 'drop') {
      const lbl = state.dropBase === 'month' ? `本月（基準 ${md(res.baseDate)} 收盤）` : `近 20 交易日（基準 ${md(res.baseDate)}）`;
      const m = state.dropMetric === 'change' ? '區間跌幅' : '高點回撤';
      return `${lbl}${m}排行：前 ${n} 名，達 ${state.threshold}% 門檻 ${res.allHits} 檔`;
    }
    if (state.mode === 'inst') {
      if (instLast < 0) return '法人連續買超：尚無法人資料';
      return `${WHO[state.instWho]}連續買超 ≥ ${state.instDays} 天：符合 ${res.total} 檔，${pick('連買天數')}（法人資料至 ${md(instDates[instLast])}）`;
    }
    if (state.mode === 'div') {
      const sort = { date: '最快除權息', yield: '本次現金殖利率', ttm: '近 12 月殖利率' }[state.divSort];
      const w = state.divWithin >= 400 ? '一年內' : `${state.divWithin} 天內`;
      return `${w}除權息（${state.divAnnOnly ? '只看已公告' : '含依規律預估'}${state.divCanBuy ? '・還來得及買' : ''}）：符合 ${res.total} 檔，${pick(sort)}`;
    }
    if (state.mode === 'combo') {
      if (!res.keys.length) return '多條件組合：請至少勾選一個條件';
      const L = comboLabels();
      const conds = res.keys.map(k => L[k]).join(' ＋ ');
      const how = state.comboMatch === 'all' ? '全部符合' : '至少符合一項';
      return `多條件組合【${conds}】${how}：${res.total} 檔，${pick('符合數')}`;
    }
    const def = state.macdType === 'osc' ? '柱狀體翻紅' : 'DIF 突破 0 軸';
    const within = daysLabel(state.macdWithin);
    const sort = { strength: '柱狀體強度', recent: '最新翻正', volume: '成交量' }[state.macdSort];
    return `MACD ${def}（${within}）：符合 ${res.total} 檔，${pick(sort)}`;
  }

  function renderTable(res) {
    const cols = colsFor(state.mode);
    let rows = res.rows.slice();
    const key = state.sortKey || 'rank';
    const col = cols.find(c => c.k === key) || cols[0];
    const dir = state.sortKey ? state.sortDir : 1;
    rows.sort((a, b) => {
      const va = col.v(a), vb = col.v(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return (va > vb ? 1 : va < vb ? -1 : 0) * dir;
    });
    currentRows = rows;

    $('#tableTitle').textContent = tableTitle(res, rows.length);
    if (state.mode === 'combo') renderComboStats(res);

    if (!rows.length) {
      const msg = state.mode === 'inst' && instLast < 0
        ? '尚無法人買賣超資料，請重新執行「更新資料.bat」。'
        : '沒有符合條件的股票，試著放寬天數、期間或均量門檻。';
      $('#tableWrap').innerHTML = `<div class="empty">${msg}</div>`;
      return;
    }
    const head = cols.map(c => {
      const on = c.k === key;
      const arrow = on ? (dir > 0 ? ' ▲' : ' ▼') : '';
      return `<th class="${c.l ? 'l' : ''} ${on ? 'sorted' : ''}" data-k="${c.k}">${c.t}${arrow}</th>`;
    }).join('');
    const body = rows.map(r => {
      const hit = state.mode === 'drop' && r.hit ? 'hit' : '';
      return `<tr class="${hit}" data-code="${r.st.code}">${cols.map(c => `<td class="${c.l ? 'l' : ''}">${c.h(r)}</td>`).join('')}</tr>`;
    }).join('');
    $('#tableWrap').innerHTML = `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  }
  let currentRows = [];

  // ------------------------------------------------------------------ KPIs, breadth, market
  function renderKpis(res) {
    const uni = res.uni;
    const belowN = uni.filter(s => s.below).length;
    const mentionedInRows = res.rows.filter(r => r.st.mentions.length).length;
    const dipN = res.rows.filter(r => r.st.dip).length;
    const avgBias = avg(res.rows.map(r => r.st.bias));
    const hitLbl = {
      break: `${daysLabel(state.breakDays)}跌破${MA_NAME[state.breakMa]}`,
      up: `${daysLabel(state.upDays)}站上${MA_NAME[state.upMa]}`,
      drop: '排行檔數',
      inst: `${WHO[state.instWho]}連買 ≥ ${state.instDays} 天`,
      macd: `${daysLabel(state.macdWithin)} MACD 翻正`,
      combo: state.comboMatch === 'all' ? '勾選條件全部符合' : '至少符合一項條件',
      div: `${state.divWithin >= 400 ? '一年內' : state.divWithin + ' 天內'}除權息`
    }[state.mode];
    const hitN = res.total != null ? res.total : res.rows.length;
    const grpNames = Object.keys(GROUPS).filter(g => state.groups.has(g)).map(g => GROUPS[g]).join('＋');
    const k = [
      { lbl: `觀察母體（上市${grpNames}）`, val: uni.length, sub: `均量 ≥ ${state.minVol.toLocaleString()} 張・已選 ${state.industries.size} 個產業${state.subs.size ? `・${state.subs.size} 個細產業` : ''}` },
      { lbl: hitLbl, val: hitN, sub: uni.length ? `占母體 ${(hitN / uni.length * 100).toFixed(1)}%` : '' },
      { lbl: '目前收盤在月線下', val: `${uni.length ? (belowN / uni.length * 100).toFixed(1) : 0}%`, sub: `${belowN} / ${uni.length} 檔` },
      { lbl: '結果平均月線乖離', val: avgBias == null ? '–' : fmtPct(avgBias, 1), sub: `低接觀察訊號 ${dipN} 檔`, c: cls(avgBias) },
      { lbl: '名人提及股入選', val: mentionedInRows, sub: `名人提及共 ${Object.keys(CELEB.mentions || {}).filter(c => byCode[c]).length} 檔` }
    ];
    $('#kpis').innerHTML = k.map(x => `<div class="kpi"><div class="lbl">${x.lbl}</div><div class="val ${x.c || ''}">${x.val}</div><div class="sub">${x.sub}</div></div>`).join('');
  }

  function renderBreadth(res) {
    const uni = baseUniverse(true);
    const rowCodes = new Set(res.rows.map(r => r.st.code));
    const groups = visibleCodes().map(id => {
      const g = uni.filter(s => s.ind === id);
      const below = g.filter(s => s.below).length;
      const hits = g.filter(s => rowCodes.has(s.code)).length;
      return { id, name: IND[id] || id, n: g.length, below, pct: g.length ? below / g.length : 0, hits };
    }).filter(g => g.n).sort((a, b) => b.pct - a.pct);
    const overall = uni.length ? uni.filter(s => s.below).length / uni.length : 0;
    const solo = state.industries.size === 1 ? [...state.industries][0] : null;
    $('#breadth').innerHTML = groups.map(g => `
      <div class="brow ${solo === g.id ? 'sel' : ''}" data-ind="${g.id}" title="點選只看${g.name}；再點一次恢復全部">
        <div class="nm">${g.name}</div>
        <div class="bar"><i style="width:${(g.pct * 100).toFixed(1)}%"></i><b style="left:0;width:${(overall * 100).toFixed(1)}%"></b></div>
        <div class="num"><strong>${(g.pct * 100).toFixed(0)}%</strong>（${g.below}/${g.n}）・入選 ${g.hits}</div>
      </div>`).join('') +
      `<p class="hint">綠條 = 該產業收盤在月線下的比例；金線 = 母體平均 ${(overall * 100).toFixed(1)}%。</p>`;
  }

  function seriesBias(arr) {
    const a = arr.map(x => (x == null ? null : x));
    const m = sma(ffill(a), 20);
    const c = ffill(a)[LAST];
    return { c, ma: m[LAST], bias: m[LAST] ? c / m[LAST] - 1 : null, chg: ffill(a)[LAST - 1] ? c / ffill(a)[LAST - 1] - 1 : null };
  }

  function futCard() {
    const F = DATA.fut;
    if (!F || !F.c) return '';
    const x = seriesBias(F.c);
    if (x.c == null) return '';
    const exp = F.exp[LAST] || '';
    const spot = DATA.index && DATA.index.taiex ? ffill(DATA.index.taiex)[LAST] : null;
    const basis = spot != null && F.c[LAST] != null ? F.c[LAST] - spot : null;
    const n = F.night;
    const night = n ? `夜盤 ${n.date.slice(4, 6)}/${n.date.slice(6)}：<span class="${cls(n.ch)}">${n.c.toLocaleString('zh-TW')} ${n.ch == null ? '' : (n.ch > 0 ? '+' : '') + n.ch}</span>` : '';
    return `
      <div class="mkt fut">
        <div class="lbl">台指期 近月${exp ? `（${exp.slice(0, 4)}/${exp.slice(4)}）` : ''}</div>
        <div class="val ${cls(x.chg)}">${x.c.toLocaleString('zh-TW')} <small>${fmtPct(x.chg)}</small></div>
        <div class="sub ${cls(x.bias)}">月線 ${x.ma ? x.ma.toFixed(0) : '–'}・乖離 ${fmtPct(x.bias)}・${x.bias < 0 ? '月線下' : '月線上'}</div>
        <div class="sub">${basis == null ? '' : `<span class="basis ${cls(basis)}">${basis >= 0 ? '正' : '逆'}價差 ${Math.abs(basis).toFixed(0)} 點</span>`}${night ? '・' + night : ''}</div>
      </div>`;
  }

  function renderMarket() {
    const items = [];
    if (DATA.index && DATA.index.taiex) items.push(['加權指數', seriesBias(DATA.index.taiex)]);
    if (DATA.index && DATA.index.elec) items.push(['電子類指數', seriesBias(DATA.index.elec)]);
    $('#market').innerHTML = items.filter(([, x]) => x.c != null).map(([n, x]) => `
      <div class="mkt">
        <div class="lbl">${n}</div>
        <div class="val ${cls(x.chg)}">${x.c.toLocaleString('zh-TW', { maximumFractionDigits: 2 })} <small>${fmtPct(x.chg)}</small></div>
        <div class="sub ${cls(x.bias)}">月線 ${x.ma ? x.ma.toFixed(0) : '–'}・乖離 ${fmtPct(x.bias)}・${x.bias < 0 ? '月線下' : '月線上'}</div>
      </div>`).join('') + futCard();
    $('#meta').innerHTML = `資料日期 <b>${dates[LAST]}</b><br>共 ${T} 個交易日（${dates[0]} 起）<br>更新於 ${DATA.generatedAt}`;
  }

  // ------------------------------------------------------------------ celebrity cards
  function watchList(p) {
    return Object.entries(CELEB.mentions || {})
      .filter(([code, arr]) => arr.some(m => m.w === p.id) && anyCode(code))
      .map(([code]) => anyCode(code))
      .sort((a, b) => (a.bias ?? 0) - (b.bias ?? 0));
  }

  function renderCelebs() {
    const people = CELEB.people || [];
    $('#celebUpdated').textContent = CELEB.updated ? `更新於 ${CELEB.updated.replace(/-/g, '/')}` : '';
    $('#celebList').innerHTML = people.map(p => {
      const latest = (p.posts.find(x => /^\d{4}-\d{2}-\d{2}$/.test(x.date)) || {}).date;
      const open = state.openCeleb === p.id;
      return `
        <button class="pcard ${p.id} ${open ? 'open' : ''}" data-person="${p.id}" aria-expanded="${open}">
          <div class="avatar">${p.badge}</div>
          <div class="pc-main">
            <div class="pc-name">${p.name} <span class="alias">${p.alias}</span></div>
            <div class="pc-style">${esc(p.style)}</div>
            <div class="pc-meta">${p.posts.length} 則發表・最新 ${latest ? md(latest) : '–'}・提及上市股／ETF ${watchList(p).length} 檔</div>
          </div>
          <span class="chev">${open ? '收合 ▴' : '展開 ▾'}</span>
        </button>`;
    }).join('');

    const p = PEOPLE[state.openCeleb];
    if (!p) { $('#celebDetail').innerHTML = ''; return; }
    const watch = watchList(p);
    const chips = watch.map(st => `
      <span class="w" data-code="${st.code}" title="${esc(st.mentions.filter(m => m.w === p.id).map(m => m.t).join('；'))}">
        ${st.code} ${esc(st.name)}
        <span class="st ${cls(st.bias)}">${st.below ? '月線下' : '月線上'} ${fmtPct(st.bias, 1)}</span>
      </span>`).join('');
    const posts = p.posts.map(x => `
      <li><span class="d">${x.date}</span><span class="s">${x.site}</span>
        <a href="${x.url}" target="_blank" rel="noopener">${esc(x.title)}</a>
        <span class="p">${esc(x.point)}</span></li>`).join('');
    $('#celebDetail').innerHTML = `
      <article class="celeb ${p.id}">
        <div class="celeb-head">
          <div class="avatar">${p.badge}</div>
          <div>
            <h3>${p.name} <span class="alias">${p.alias}</span></h3>
            <div class="style">${esc(p.style)}</div>
          </div>
          <button class="btn small" data-preset="${p.id}">${p.presetLabel}</button>
        </div>
        <div class="celeb-body">
          <div>
            <p>${esc(p.stance)}</p>
            <div class="tech">${esc(p.technical)}</div>
            <div class="src-note">來源說明：${esc(p.sourceNote)}</div>
            ${watch.length ? `<div class="hint">提及個股目前月線狀態（依乖離排序，點選看 K 線）</div><div class="watch">${chips}</div>` : ''}
          </div>
          <div>
            <div class="hint">近期發表</div>
            <ul class="posts">${posts}</ul>
          </div>
        </div>
      </article>`;
  }

  // ------------------------------------------------------------------ chart drawer
  function chartSVG(st, mark) {
    const n = Math.min(65, T), s0 = T - n;
    const W = 820, padL = 10, padR = 62, top = 14, priceH = 260, volTop = 290, volH = 70;
    const mTop = volTop + volH + 22, mH = 80, H = mTop + mH + 26;
    const cw = (W - padL - padR) / n;
    let hi = -Infinity, lo = Infinity, vmax = 0;
    for (let i = s0; i < T; i++) {
      for (const x of [st.h[i], st.l[i], st.ma20[i], st.ma60[i], st.ma5[i], st.ma10[i]]) {
        if (x == null) continue;
        if (x > hi) hi = x;
        if (x < lo) lo = x;
      }
      if (st.v[i] > vmax) vmax = st.v[i];
    }
    const pad = (hi - lo) * 0.06 || 1;
    hi += pad; lo -= pad;
    const X = i => padL + (i - s0 + 0.5) * cw;
    const Y = p => top + (hi - p) / (hi - lo) * priceH;
    let g = '';
    for (let k = 0; k <= 4; k++) {
      const p = lo + (hi - lo) * k / 4, y = Y(p);
      g += `<line x1="${padL}" x2="${W - padR}" y1="${y}" y2="${y}" style="stroke:var(--chart-grid)" stroke-dasharray="3 4"/>`;
      g += `<text x="${W - padR + 6}" y="${y + 4}" style="fill:var(--chart-text)" font-size="11">${fmtP(p)}</text>`;
    }
    for (let i = s0; i < T; i += 10) {
      g += `<text x="${X(i)}" y="${H - 6}" style="fill:var(--chart-text)" font-size="11" text-anchor="middle">${md(dates[i])}</text>`;
    }
    for (let i = s0; i < T; i++) {
      if (st.raw[i] == null) continue;
      const o = st.o[i], c = st.c[i], h = st.h[i], l = st.l[i];
      const up = c >= o, col = up ? 'var(--up)' : 'var(--down)';
      const x = X(i), bw = Math.max(1.5, cw * 0.62);
      g += `<line x1="${x}" x2="${x}" y1="${Y(h)}" y2="${Y(l)}" style="stroke:${col}"/>`;
      const y1 = Y(Math.max(o, c)), y2 = Y(Math.min(o, c));
      g += `<rect x="${x - bw / 2}" y="${y1}" width="${bw}" height="${Math.max(1, y2 - y1)}" style="fill:${up ? 'var(--chart-bg)' : col};stroke:${col}"/>`;
      const vh = vmax ? st.v[i] / vmax * volH : 0;
      g += `<rect x="${x - bw / 2}" y="${volTop + volH - vh}" width="${bw}" height="${vh}" style="fill:${col}" opacity=".55"/>`;
    }
    const line = (arr, color, w) => {
      const pts = [];
      for (let i = s0; i < T; i++) if (arr[i] != null) pts.push(`${X(i).toFixed(1)},${Y(arr[i]).toFixed(1)}`);
      return pts.length ? `<polyline points="${pts.join(' ')}" fill="none" style="stroke:${color}" stroke-width="${w}"/>` : '';
    };
    g += line(st.ma60, 'var(--ma60)', 1.2) + line(st.ma10, 'var(--ma10)', 1.2) + line(st.ma5, 'var(--ma5)', 1.2) + line(st.ma20, 'var(--ma20)', 2.2);
    if (mark && mark.idx >= s0) {
      const x = X(mark.idx), y = Y(st.h[mark.idx]) - 8, col = mark.up ? 'var(--up)' : 'var(--mark)';
      g += `<path d="M${x - 6},${y - 10} L${x + 6},${y - 10} L${x},${y} Z" style="fill:${col}"/>`;
      g += `<text x="${x}" y="${y - 14}" style="fill:${col}" font-size="11" text-anchor="middle">${mark.label}</text>`;
    }
    g += `<text x="${padL}" y="${volTop - 4}" style="fill:var(--chart-text)" font-size="11">成交量（張）最大 ${fmtInt(vmax)}</text>`;

    let mmax = 0;
    for (let i = s0; i < T; i++) for (const x of [st.dif[i], st.dea[i], st.osc[i]]) if (x != null) mmax = Math.max(mmax, Math.abs(x));
    if (mmax > 0) {
      const MY = x => mTop + mH / 2 - x / mmax * (mH / 2);
      g += `<line x1="${padL}" x2="${W - padR}" y1="${MY(0)}" y2="${MY(0)}" style="stroke:var(--chart-zero)"/>`;
      for (let i = s0; i < T; i++) {
        const x = st.osc[i];
        if (x == null) continue;
        const bw = Math.max(1.5, cw * 0.5), y0 = MY(0), y1 = MY(x);
        g += `<rect x="${X(i) - bw / 2}" y="${Math.min(y0, y1)}" width="${bw}" height="${Math.max(0.5, Math.abs(y1 - y0))}" style="fill:${x > 0 ? 'var(--up)' : 'var(--down)'}" opacity=".7"/>`;
      }
      const mline = (arr, color) => {
        const pts = [];
        for (let i = s0; i < T; i++) if (arr[i] != null) pts.push(`${X(i).toFixed(1)},${MY(arr[i]).toFixed(1)}`);
        return pts.length ? `<polyline points="${pts.join(' ')}" fill="none" style="stroke:${color}" stroke-width="1.4"/>` : '';
      };
      g += mline(st.dif, 'var(--dif)') + mline(st.dea, 'var(--dea)');
      if (st.macdTurn >= s0) {
        const x = X(st.macdTurn);
        g += `<path d="M${x - 5},${mTop + mH + 2} L${x + 5},${mTop + mH + 2} L${x},${mTop + mH - 7} Z" style="fill:var(--up)"/>`;
      }
      g += `<text x="${padL}" y="${mTop - 4}" style="fill:var(--chart-text)" font-size="11">MACD(12,26,9)　DIF ${fmtM(st.dif[LAST])}　DEA ${fmtM(st.dea[LAST])}　OSC ${fmtM(st.osc[LAST])}</text>`;
    }
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${g}</svg>`;
  }

  function openDrawer(code) {
    const st = byCode[code];
    if (!st) { openEtfDrawer(code); return; }
    const bi = findMaCross(st, 20, 20, -1);
    const mk = state.mode === 'up' ? { n: state.upMa, dir: 1 } : state.mode === 'break' ? { n: state.breakMa, dir: -1 } : { n: 20, dir: -1 };
    const mi = findMaCross(st, mk.n, 20, mk.dir);
    const mark = mi >= 0 ? { idx: mi, up: mk.dir > 0, label: (mk.dir > 0 ? '站上' : '跌破') + MA_NAME[mk.n] } : null;
    const pos = n => (maOf(st, n)[LAST] == null ? '–' : isAbove(st, n) ? '<span class="up">線上</span>' : '<span class="down">線下</span>');
    const notes = st.mentions.map(m => `<li><span class="badge ${m.w}">${PEOPLE[m.w] ? PEOPLE[m.w].badge : ''}</span>${esc((PEOPLE[m.w] || {}).name || '')}：${esc(m.t)}</li>`).join('');
    const stats = [
      ['月線 (MA20)', fmtP(st.ma20[LAST])], ['月線乖離', `<span class="${cls(st.bias)}">${fmtPct(st.bias)}</span>`],
      ['MA5 / MA10', `${fmtP(st.ma5[LAST])} / ${fmtP(st.ma10[LAST])}`], ['季線 (MA60)', fmtP(st.ma60[LAST])],
      ['RSI(14)', st.rsiNow == null ? '–' : st.rsiNow.toFixed(1)], ['K / D', st.kNow == null ? '–' : `${st.kNow.toFixed(1)} / ${st.dNow.toFixed(1)}`],
      ['20 日均量', fmtInt(st.vol20) + ' 張'], ['4 週內跌破月線', bi >= 0 ? `${dates[bi]}（${LAST - bi} 日前）` : '無'],
      ['MACD DIF / DEA', `${fmtM(st.dif[LAST])} / ${fmtM(st.dea[LAST])}`], ['OSC 柱', `<span class="${cls(st.osc[LAST])}">${fmtM(st.osc[LAST])}</span>`],
      ['外資連買', instLast >= 0 ? instStreak(st, 'fi').n + ' 天' : '–'], ['投信連買', instLast >= 0 ? instStreak(st, 'it').n + ' 天' : '–'],
      ['收盤 vs 5／10／20日線', `${pos(5)} / ${pos(10)} / ${pos(20)}`], ['均線排列', st.bullAlign ? '<span class="up">多頭</span>' : st.bearAlign ? '<span class="down">空頭</span>' : '糾結'],
      ['下次除權息', st.sNext ? `${st.sNext.ex} ${DIV_TYPE[st.sNext.type] || st.sNext.type}${st.sNext.est ? '（預估）' : ''}` : '近一年無紀錄'],
      ['最慢買進日', st.sNext ? buyCell(st.sNext.ex, st.sNext.est) : '–'],
      ['近 12 月現金股利', st.sTtm == null ? '–' : fmtAmt(st.sTtm) + ' 元'], ['近 12 月殖利率', fmtYield(st.sYield)]
    ];
    const divRows = st.sdivs.slice().reverse().map(x => `<tr><td class="l">${md(lastBuyDay(x.ex))}</td><td class="l">${x.ex}</td>
      <td class="l">${divTypeTag(x)}</td><td>${divCash(x) == null ? (x.val != null ? `權值+息值 ${fmtAmt(x.val)}` : '待公告') : fmtAmt(divCash(x)) + ' 元'}</td>
      <td class="l">${stockPart(x)}</td><td class="l">${x.ex > TODAY ? '<span class="up">已公告</span>' : fillText(fillOf(st, x.ex, x.pre || undefined))}</td></tr>`);
    if (st.sNext && st.sNext.est) {
      divRows.unshift(`<tr><td class="l">${md(lastBuyDay(st.sNext.ex))}</td><td class="l">${st.sNext.ex}</td><td class="l">${divTypeTag(st.sNext)}</td>
        <td>${st.sNext.cash == null ? '–' : '約 ' + fmtAmt(st.sNext.cash) + ' 元'}</td><td class="l">–</td><td class="l"><span class="flat">依規律預估</span></td></tr>`);
    }
    const divTable = divRows.length ? `<h3>除權息紀錄（近 13 個月，含已公告與預估）</h3>
      <div class="table-wrap mini"><table><thead><tr><th class="l">最慢買進</th><th class="l">除權息日</th><th class="l">類別</th><th>現金股利</th><th class="l">配股／現增</th><th class="l">填權息／狀態</th></tr></thead>
      <tbody>${divRows.join('')}</tbody></table></div>` : '';
    let instTable = '';
    if (instLast >= 0 && st.fi) {
      const js = [];
      for (let j = instLast; j >= 0 && js.length < 10; j--) js.push(j);
      instTable = `<h3>近 ${js.length} 日法人買賣超（張）</h3>
        <div class="table-wrap mini"><table><thead><tr><th class="l">日期</th><th>外資</th><th>投信</th><th>自營商</th><th>合計</th></tr></thead><tbody>
        ${js.map(j => `<tr><td class="l">${md(instDates[j])}</td><td>${lotsCell(st.fi[j])}</td><td>${lotsCell(st.it[j])}</td><td>${lotsCell(st.dl[j])}</td><td>${lotsCell(instNet(st, 'all', j))}</td></tr>`).join('')}
        </tbody></table></div>`;
    }
    $('#drawer').innerHTML = `
      <div class="dr-head">
        <h2>${st.code} ${esc(st.name)}</h2>
        <span class="flat">${st.indName}</span>
        <span class="px ${cls(st.dayChg)}">${fmtP(st.close)} <small>${fmtPct(st.dayChg)}</small></span>
        <span class="links">${links(st.code)}</span>
        <button class="btn small close" id="drClose">關閉 ✕</button>
      </div>
      <div>${signalTags(st, { note: bi >= 0 && !st.below ? '已站回月線' : null })}</div>
      ${chartSVG(st, mark)}
      <div class="chart-legend">
        <span><i style="background:var(--ma5)"></i>MA5</span>
        <span><i style="background:var(--ma10)"></i>MA10</span>
        <span><i style="background:var(--ma20);height:4px"></i>月線 MA20</span>
        <span><i style="background:var(--ma60)"></i>季線 MA60</span>
        <span><i style="background:var(--dif)"></i>DIF</span>
        <span><i style="background:var(--dea)"></i>DEA</span>
        <span>K 棒：紅漲綠跌（已還原除權息）</span>
      </div>
      <div class="stats">${stats.map(([a, b]) => `<div class="stat"><div class="lbl">${a}</div><div class="val">${b}</div></div>`).join('')}</div>
      ${chainLines(st)}
      ${divTable}
      ${instTable}
      ${notes ? `<h3>名人觀點</h3><ul class="notes">${notes}</ul>` : ''}`;
    $('#drawer').classList.add('show');
    $('#backdrop').classList.add('show');
    $('#drClose').onclick = closeDrawer;
  }

  function chainLines(st) {
    if (!st.groups.length) return '';
    const by = new Map();
    for (const g of st.groups) {
      if (!by.has(g.chain)) by.set(g.chain, new Set());
      by.get(g.chain).add(g.label);
    }
    const line = ([c, ls]) => `<div class="sub-line"><b>${esc(chainName(c))}</b>${[...ls].map(l => `<span class="sub-tag">${esc(l)}</span>`).join('')}</div>`;
    const core = [...by].filter(([c]) => CORE_CHAINS.includes(c));
    const theme = [...by].filter(([c]) => !CORE_CHAINS.includes(c));
    return `<div class="dr-subs"><h3>產業鏈定位</h3>${core.map(line).join('')}
      ${theme.length ? `<details><summary>相關題材（${theme.length} 條產業鏈：${theme.map(([c]) => esc(chainName(c))).join('、')}）</summary>${theme.map(line).join('')}</details>` : ''}</div>`;
  }

  function closeDrawer() {
    $('#drawer').classList.remove('show');
    $('#backdrop').classList.remove('show');
  }

  // ------------------------------------------------------------------ ETF view
  const EDATA = window.ETF_DATA && window.ETF_DATA.etfs ? window.ETF_DATA : null;
  const ETF_TYPES = { dom: '國內股票', hi: '高股息', intl: '海外股票', bond: '債券', lev: '槓桿・反向', other: '原物料・REITs・其他' };
  const ETF_TYPE_TAG = { dom: 'neutral', hi: 'dip', intl: 'inst', bond: 'bear', lev: 'bull', other: 'muted' };
  const FREQ_NAME = { 12: '月配', 6: '雙月配', 4: '季配', 2: '半年配', 1: '年配', 0: '不配息' };
  const ETF_SORTS = ['yield', 'fwd', 'next', 'aum', 'holders', 'vol', 'chg'];
  const ETF_TOPS = [30, 50, 100, 999];
  const FOREIGN_NAME = /美國|美股|美債|北美|美元|日本|日經|東證|中國|大陸|滬|深証|深證|上証|上證|恒生|香港|港股|韓國|印度|越南|歐洲|德國|英國|澳洲|東協|東南亞|亞太|亞洲|亞半|全球|國際|世界|新興|那斯達克|NASDAQ|納斯達克|標普|S&P|費城|道瓊|FANG|A50/i;
  const FOREIGN_IDX = /[A-Za-z]{3,}|美國|全球|日本|中國|亞洲|歐洲|印度|越南|國際|世界|香港|韓國/;
  const DOMESTIC_IDX = /臺灣|台灣|櫃買|臺指|Taiwan|TWSE|TPEx/i;
  const pad2 = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const TODAY = ymd(new Date());
  const toDate = s => new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  const addDays = (s, n) => { const d = toDate(s); d.setDate(d.getDate() + n); return ymd(d); };
  function addMonths(s, n) {
    const d = toDate(s), day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + n);
    d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
    return ymd(d);
  }
  const dayDiff = (a, b) => Math.round((toDate(b) - toDate(a)) / 864e5);
  function median(a) {
    if (!a.length) return null;
    const s = a.slice().sort((x, y) => x - y), m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  const dateIdx = Object.fromEntries(dates.map((d, i) => [d, i]));

  // ------------------------------------------------------------------ last buy day, stock ex-rights / ex-dividend
  const DIV = window.DIV_DATA && window.DIV_DATA.events ? window.DIV_DATA : null;
  const HOLI = new Set((DIV && DIV.holidays) || []);
  const isTradingDay = s => { const w = toDate(s).getDay(); return w !== 0 && w !== 6 && !HOLI.has(s); };
  // T+2 settlement: buying on the trading day before the ex-date still gets the payout.
  function lastBuyDay(ex) {
    let s = addDays(ex, -1);
    for (let i = 0; i < 20 && !isTradingDay(s); i++) s = addDays(s, -1);
    return s;
  }
  function buyCell(ex, est) {
    const b = lastBuyDay(ex), n = dayDiff(TODAY, b);
    const when = n < 0 ? '已來不及' : n === 0 ? '今天收盤前' : `還有 ${n} 天`;
    return `<b class="${n === 0 ? 'buy-today' : n < 0 ? 'flat' : 'up'}">${md(b)}（${'日一二三四五六'[toDate(b).getDay()]}）</b>${est ? ' <span class="flat">預估</span>' : ''}<span class="sub-name">${when}</span>`;
  }
  const DIV_TYPE = { 息: '除息', 權: '除權', 權息: '除權息' };
  const divCash = x => x.cash ?? (x.type === '息' ? x.val : null);
  const divTypeTag = x => `<span class="tag ${x.type.includes('權') ? 'inst' : 'dip'}">${DIV_TYPE[x.type] || x.type}</span>`;
  function stockPart(x) {
    const parts = [];
    if (x.sr) parts.push(`配股 每千股 ${Math.round(x.sr * 1000)} 股`);
    if (x.ir) parts.push(`現增 每千股 ${Math.round(x.ir * 1000)} 股${x.ip ? `・認購 ${fmtAmt(x.ip)} 元` : ''}`);
    return parts.length ? parts.join('<br>') : '<span class="flat">–</span>';
  }
  function lastStockCell(st) {
    const x = st.sLast;
    if (!x) return '<span class="flat">–</span>';
    const v = divCash(x) ?? x.val;
    const d = x.ex.slice(0, 4) === TODAY.slice(0, 4) ? md(x.ex) : x.ex.slice(2).replace(/-/g, '/');
    return `${d} ${DIV_TYPE[x.type] || x.type}${v != null ? `・${fmtAmt(v)} 元` : ''}<span class="sub-name">${fillText(st.sFill)}</span>`;
  }

  const divByStock = {};
  if (DIV) {
    for (const [c, ex, type, cash, sr, ir, ip, pre, val, ann] of DIV.events) {
      (divByStock[c] = divByStock[c] || []).push({ ex, type, cash, sr, ir, ip, pre, val, ann: !!ann, est: false });
    }
  }
  function stockDivStats(st) {
    const ds = (divByStock[st.code] || []).sort((a, b) => (a.ex < b.ex ? -1 : a.ex > b.ex ? 1 : 0));
    st.sdivs = ds;
    const past = ds.filter(x => x.ex <= TODAY);
    st.sLast = past.length ? past[past.length - 1] : null;
    st.sFill = st.sLast ? fillOf(st, st.sLast.ex, st.sLast.pre || undefined) : null;
    const ttm = past.filter(x => dayDiff(x.ex, TODAY) < 365).map(divCash).filter(v => v != null);
    st.sTtm = ttm.length ? ttm.reduce((a, b) => a + b, 0) : null;
    st.sYield = st.sTtm ? st.sTtm / st.close : null;
    // only cash dividends recur on a schedule; rights issues and stock dividends are one-offs
    const recent = past.filter(x => x.type.includes('息') && dayDiff(x.ex, TODAY) <= 400);
    const gaps = [];
    for (let i = 1; i < recent.length; i++) gaps.push(dayDiff(recent[i - 1].ex, recent[i].ex));
    const g = median(gaps.filter(x => x > 5));
    st.sFreq = g == null ? (recent.length ? 1 : 0) : g <= 45 ? 12 : g <= 135 ? 4 : g <= 240 ? 2 : 1;
    st.sNext = ds.find(x => x.ex > TODAY) || null;
    const anchor = recent[recent.length - 1];
    if (!st.sNext && anchor && st.sFreq) {
      let ex = anchor.ex;
      for (let k = 0; k < 24 && ex <= TODAY; k++) ex = addMonths(ex, 12 / st.sFreq);
      for (let k = 0; k < 7 && !isTradingDay(ex); k++) ex = addDays(ex, 1);
      if (ex > TODAY && dayDiff(TODAY, ex) <= 400) {
        st.sNext = { ex, type: '息', cash: divCash(anchor), sr: null, ir: null, ip: null, est: true, ann: false };
      }
    }
  }
  for (const st of stocks) stockDivStats(st);

  // Official asset / reward types first; domestic vs. overseas is judged from the ETF name and its index.
  function etfType(e) {
    if (e.rw === 'L' || e.rw === 'I') return 'lev';
    if (e.cat === 'bond') return 'bond';
    if (e.cat && e.cat !== 'stock') return 'other';
    if (e.tags.some(t => t.includes('高股息') || t.includes('高息')) || /息/.test(e.n)) return 'hi';
    const raw = e.idx || '', tip = raw.startsWith('臺灣指數公司'), idx = raw.replace(/臺灣指數公司/g, '');
    // TIP (Taiwan Index Plus) indices often carry English words, so only Chinese overseas keywords count for them
    const idxForeign = idx && !DOMESTIC_IDX.test(idx) && (tip ? FOREIGN_NAME.test(idx) : FOREIGN_IDX.test(idx));
    if (FOREIGN_NAME.test(e.n) || (!/台灣|臺灣/.test(e.n) && idxForeign)) return 'intl';
    return 'dom';
  }

  // Close on the trading day before `ex` (inside the price window), else null.
  function closeBefore(st, ex) {
    const i = dateIdx[ex];
    if (i == null) return null;
    let p = i - 1;
    while (p >= 0 && st.raw[p] == null) p--;
    return p >= 0 ? st.raw[p] : null;
  }
  // Has the price come back to the pre-ex-date close? (raw closes, not adjusted)
  function fillOf(st, ex, pre = closeBefore(st, ex)) {
    const i = dateIdx[ex];
    if (pre == null || i == null) return null;
    let t = i;
    while (t <= LAST && !(st.raw[t] != null && st.raw[t] >= pre)) t++;
    return { pre, done: t <= LAST, days: (t <= LAST ? t : LAST) - i, gap: st.close / pre - 1 };
  }

  function etfDividendStats(st) {
    const ds = st.divs, e = st.etf;
    const listedDays = e.list ? dayDiff(e.list, TODAY) : 9999;
    const recent = ds.filter(x => dayDiff(x.ex, TODAY) <= 400);
    const gaps = [];
    for (let i = 1; i < recent.length; i++) gaps.push(dayDiff(recent[i - 1].ex, recent[i].ex));
    const g = median(gaps.filter(x => x > 5));
    if (g != null) st.freq = g <= 45 ? 12 : g <= 75 ? 6 : g <= 135 ? 4 : g <= 240 ? 2 : 1;
    else if (recent.length === 1) st.freq = listedDays > 400 ? 1 : null;
    else st.freq = listedDays > 400 ? 0 : null;
    const past = ds.filter(x => x.ex <= TODAY && x.amt != null);
    const ttm = past.filter(x => dayDiff(x.ex, TODAY) < 365);
    st.ttmN = ttm.length;
    st.ttm = ttm.length ? ttm.reduce((s, x) => s + x.amt, 0) : st.freq === 0 ? 0 : null;
    st.yield = st.ttm ? st.ttm / st.close : st.ttm === 0 ? 0 : null;
    st.last = past.length ? past[past.length - 1] : null;
    st.fwd = st.last && st.freq ? st.last.amt * st.freq / st.close : null;
    st.fill = st.last ? fillOf(st, st.last.ex) : null;
    st.payLag = Math.round(median(ds.filter(x => x.pay).map(x => dayDiff(x.ex, x.pay)).filter(x => x > 0 && x < 90)) ?? 21);
    for (const x of ds) { x.est = false; x.payEst = !x.pay; if (!x.pay) x.pay = addDays(x.ex, st.payLag); }
    // not yet announced: project from the usual interval, amount = last known payout
    st.projected = [];
    const anchor = ds.length ? ds[ds.length - 1] : null;
    if (st.freq && anchor && st.last) {
      let ex = anchor.ex;
      for (let k = 0; k < 24; k++) {
        ex = addMonths(ex, 12 / st.freq);
        if (dayDiff(TODAY, ex) > 120) break;
        if (ex <= TODAY) continue;
        st.projected.push({ ex, pay: addDays(ex, st.payLag), amt: anchor.amt ?? st.last.amt, est: true, payEst: true });
      }
    }
    const future = ds.filter(x => x.ex > TODAY);
    st.next = future[0] || st.projected[0] || null;
    st.nextDays = st.next ? dayDiff(TODAY, st.next.ex) : null;
    const lo = addDays(TODAY, -365);
    st.monthsEx = new Set(ds.filter(x => x.ex > lo).map(x => +x.ex.slice(5, 7)));
    st.monthsPay = new Set(ds.filter(x => x.ex > lo).map(x => +x.pay.slice(5, 7)));
    st.chg20 = st.fc[LAST - 20] ? st.close / st.fc[LAST - 20] - 1 : null;
  }

  const etfs = [];
  if (EDATA) {
    const map = EDATA.dates.map(d => dateIdx[d] ?? -1);
    const align = a => {
      const out = new Array(T).fill(null);
      if (a) a.forEach((v, j) => { if (map[j] >= 0) out[map[j]] = v; });
      return out;
    };
    const divBy = {};
    for (const [c, ex, rec, pay, amt] of EDATA.divs || []) (divBy[c] = divBy[c] || []).push({ ex, rec: rec || null, pay: pay || null, amt });
    for (const e of EDATA.etfs) {
      if (!e.cl) continue;
      const st = prep({ c: e.c, n: e.n, i: 'ETF', o: align(e.o), h: align(e.h), l: align(e.l), cl: align(e.cl), v: align(e.v), d: align(e.d) });
      if (st.close == null) continue;
      st.etf = e;
      st.type = etfType(e);
      st.divs = (divBy[e.c] || []).sort((a, b) => (a.ex < b.ex ? -1 : a.ex > b.ex ? 1 : 0));
      etfDividendStats(st);
      etfs.push(st);
    }
  }
  const etfByCode = Object.fromEntries(etfs.map(s => [s.code, s]));
  const anyCode = code => byCode[code] || etfByCode[code];

  const etfState = {
    view: 'stock',
    types: new Set(Object.keys(ETF_TYPES)),
    freq: 'all',
    sort: 'yield',
    months: new Set(),
    monthBy: 'ex',
    topN: 50,
    minVol: 100,
    query: '',
    active: false,
    soon: false,
    celebOnly: false,
    calShow: 'ex',
    calMonth: TODAY.slice(0, 7),
    calDay: null,
    sortKey: null,
    sortDir: 1
  };
  const ETF_SAVE_KEY = 'stock-radar-etf-v1';
  const ETF_SAVE_SKIP = new Set(['query', 'calMonth', 'calDay', 'sortKey', 'sortDir']);
  function saveEtfState() {
    try {
      const o = {};
      for (const [k, v] of Object.entries(etfState)) if (!ETF_SAVE_SKIP.has(k)) o[k] = v instanceof Set ? [...v] : v;
      localStorage.setItem(ETF_SAVE_KEY, JSON.stringify(o));
    } catch (e) { /* settings just are not kept */ }
  }
  (function loadEtfState() {
    let o = null;
    try { o = JSON.parse(localStorage.getItem(ETF_SAVE_KEY) || 'null'); } catch (e) { o = null; }
    if (o && typeof o === 'object') {
      for (const [k, v] of Object.entries(o)) {
        if (!(k in etfState) || ETF_SAVE_SKIP.has(k)) continue;
        const cur = etfState[k];
        if (cur instanceof Set) { if (Array.isArray(v)) etfState[k] = new Set(v); }
        else if (typeof cur === typeof v) etfState[k] = v;
      }
    }
    etfState.types = new Set([...etfState.types].filter(t => ETF_TYPES[t]));
    if (!etfState.types.size) etfState.types = new Set(Object.keys(ETF_TYPES));
    etfState.months = new Set([...etfState.months].filter(m => m >= 1 && m <= 12));
    if (!ETF_SORTS.includes(etfState.sort)) etfState.sort = 'yield';
    if (!ETF_TOPS.includes(etfState.topN)) etfState.topN = 50;
    if (!['stock', 'etf', 'trend', 'trendB'].includes(etfState.view)) etfState.view = 'stock';
  })();

  function etfUniverse() {
    const q = etfState.query.trim().toLowerCase();
    return etfs.filter(st => {
      if (!etfState.types.has(st.type)) return false;
      if (etfState.freq !== 'all' && st.freq !== +etfState.freq) return false;
      if ((st.vol20 || 0) < etfState.minVol) return false;
      if (etfState.active && !st.etf.act) return false;
      if (etfState.celebOnly && !st.mentions.length) return false;
      if (q && ![st.code, st.name, st.etf.iss || '', st.etf.idx || '', ETF_TYPES[st.type]].some(x => x.toLowerCase().includes(q))) return false;
      return true;
    });
  }

  function etfRows(uni) {
    const ms = [...etfState.months];
    const all = uni.filter(st => {
      const set = etfState.monthBy === 'pay' ? st.monthsPay : st.monthsEx;
      if (ms.length && !ms.some(m => set.has(m))) return false;
      if (etfState.soon && !(st.nextDays != null && st.nextDays <= 30)) return false;
      return true;
    });
    const by = {
      yield: (a, b) => (b.yield ?? -1) - (a.yield ?? -1),
      fwd: (a, b) => (b.fwd ?? -1) - (a.fwd ?? -1),
      next: (a, b) => (a.nextDays ?? 9999) - (b.nextDays ?? 9999) || (b.fwd ?? -1) - (a.fwd ?? -1),
      aum: (a, b) => (b.etf.aum ?? 0) - (a.etf.aum ?? 0),
      holders: (a, b) => (b.etf.holders ?? 0) - (a.etf.holders ?? 0),
      vol: (a, b) => (b.vol20 ?? 0) - (a.vol20 ?? 0),
      chg: (a, b) => (b.chg20 ?? -9) - (a.chg20 ?? -9)
    }[etfState.sort];
    all.sort(by);
    return { all, total: all.length, rows: all.slice(0, etfState.topN).map((st, i) => ({ st, rank: i + 1 })) };
  }

  const freqText = st => (st.freq == null ? (st.divs.length ? '未滿一年' : '尚未配息') : FREQ_NAME[st.freq]);
  function monthText(set) {
    const a = [...set].sort((x, y) => x - y);
    return a.length === 12 ? '每月' : a.length ? a.join('・') + ' 月' : '–';
  }
  const mstrip = set => `<span class="mstrip" title="${monthText(set)}">${Array.from({ length: 12 }, (_, i) => `<i class="${set.has(i + 1) ? 'on' : ''}"></i>`).join('')}</span>`;
  const fmtAmt = v => (v == null ? '–' : (+v).toFixed(v >= 1 ? 2 : 3).replace(/\.?0+$/, ''));
  const fmtYield = v => (v == null ? '–' : (v * 100).toFixed(2) + '%');
  const typeTag = st => `<span class="tag ${ETF_TYPE_TAG[st.type]}">${ETF_TYPES[st.type]}</span>${st.etf.act ? '<span class="tag muted">主動式</span>' : ''}`;
  const etfMonths = st => (etfState.monthBy === 'pay' ? st.monthsPay : st.monthsEx);
  const etfLinks = code =>
    `<a href="https://tw.stock.yahoo.com/quote/${code}.TW/dividend" target="_blank" rel="noopener" title="Yahoo股市 配息">Y</a>` +
    `<a href="https://www.twse.com.tw/zh/ETFortune/etfInfo/${code}" target="_blank" rel="noopener" title="證交所 ETF e添富">e</a>` +
    `<a href="https://goodinfo.tw/tw/StockDividendPolicy.asp?STOCK_ID=${code}" target="_blank" rel="noopener" title="Goodinfo 股利政策">G</a>`;
  function fillText(f) {
    if (!f) return '<span class="flat">–</span>';
    return f.done ? `<span class="up">已填息${f.days ? `（${f.days} 天）` : '（當天）'}</span>` : `<span class="down">未填息 ${fmtPct(f.gap, 1)}</span>`;
  }
  function lastCell(st) {
    if (!st.last) return '<span class="flat">–</span>';
    return `${md(st.last.ex)}・${fmtAmt(st.last.amt)} 元<span class="sub-name">${fillText(st.fill)}</span>`;
  }
  function nextCell(st) {
    const n = st.next;
    if (!n) return '<span class="flat">–</span>';
    const amt = n.amt != null ? `${n.est ? '約 ' : ''}${fmtAmt(n.amt)} 元` : '金額待公告';
    return `<span class="${n.est ? 'flat' : 'up'}">${md(n.ex)}${n.est ? ' 預估' : ''}</span><span class="sub-name">${amt}・${st.nextDays} 天後</span>`;
  }
  const payCell = st => (st.next ? `<span class="${st.next.payEst ? 'flat' : ''}">${md(st.next.pay)}${st.next.payEst ? ' 預估' : ''}</span>` : '<span class="flat">–</span>');

  function etfCols() {
    return [
      RANK,
      { k: 'name', t: 'ETF', l: true, v: r => r.st.code, h: r => `<span class="code">${r.st.code}</span><span class="name">${esc(r.st.name)}</span>` },
      { k: 'type', t: '類型', l: true, v: r => r.st.type, h: r => typeTag(r.st) },
      { k: 'iss', t: '投信', l: true, v: r => r.st.etf.iss, h: r => `<span class="flat">${esc(r.st.etf.iss || '–')}</span>` },
      BK.close, BK.day,
      { k: 'chg', t: '近一月(含息)', v: r => r.st.chg20, h: r => pctCell(r.st.chg20) },
      { k: 'freq', t: '配息頻率', l: true, v: r => r.st.freq ?? -1, h: r => freqText(r.st) },
      { k: 'months', t: etfState.monthBy === 'pay' ? '發放月份' : '除息月份', l: true,
        v: r => Math.min(99, ...etfMonths(r.st)), h: r => `${mstrip(etfMonths(r.st))} <small class="flat">${monthText(etfMonths(r.st))}</small>` },
      { k: 'ttm', t: '近12月配息', v: r => r.st.ttm, h: r => (r.st.ttm == null ? '–' : `${fmtAmt(r.st.ttm)} <small class="flat">(${r.st.ttmN} 次)</small>`) },
      { k: 'yield', t: '近12月殖利率', v: r => r.st.yield, h: r => `<b class="${r.st.yield ? 'up' : 'flat'}">${fmtYield(r.st.yield)}</b>` },
      { k: 'fwd', t: '年化殖利率', v: r => r.st.fwd, h: r => fmtYield(r.st.fwd) },
      { k: 'last', t: '最近除息・填息', v: r => (r.st.last ? r.st.last.ex : null), h: r => lastCell(r.st) },
      { k: 'next', t: '下次除息', v: r => r.st.nextDays, h: r => nextCell(r.st) },
      { k: 'buy', t: '最慢買進日', v: r => (r.st.next ? lastBuyDay(r.st.next.ex) : null),
        h: r => (r.st.next ? buyCell(r.st.next.ex, r.st.next.est) : '<span class="flat">–</span>') },
      { k: 'pay', t: '下次發放', v: r => (r.st.next ? r.st.next.pay : null), h: r => payCell(r.st) },
      { k: 'aum', t: '規模(億)', v: r => r.st.etf.aum, h: r => fmtInt(r.st.etf.aum) },
      { k: 'holders', t: '受益人數', v: r => r.st.etf.holders, h: r => fmtInt(r.st.etf.holders) },
      BK.bias, BK.vol, BK.celeb,
      { k: 'lnk', t: '連結', l: true, v: () => 0, h: r => `<span class="links">${etfLinks(r.st.code)}</span>` }
    ];
  }

  let etfCurrentRows = [];
  function renderEtfTable(res) {
    const cols = etfCols();
    const key = etfState.sortKey || 'rank';
    const col = cols.find(c => c.k === key) || cols[0];
    const dir = etfState.sortKey ? etfState.sortDir : 1;
    const rows = res.rows.slice().sort((a, b) => {
      const va = col.v(a), vb = col.v(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return (va > vb ? 1 : va < vb ? -1 : 0) * dir;
    });
    etfCurrentRows = rows;
    const sortName = $(`#segEtfSort button[data-v="${etfState.sort}"]`).textContent;
    const conds = [];
    if (etfState.months.size) conds.push(`${[...etfState.months].sort((a, b) => a - b).join('・')} 月${etfState.monthBy === 'pay' ? '發放' : '除息'}`);
    if (etfState.freq !== 'all') conds.push(FREQ_NAME[etfState.freq]);
    if (etfState.soon) conds.push('30 天內除息');
    $('#etfTableTitle').textContent = `ETF 排行${conds.length ? '【' + conds.join('＋') + '】' : ''}：符合 ${res.total} 檔，` +
      (res.total > rows.length ? `依${sortName}取前 ${rows.length} 名` : `全部列出（依${sortName}排序）`);
    if (!rows.length) {
      $('#etfTableWrap').innerHTML = '<div class="empty">沒有符合條件的 ETF，試著放寬類型、月份或均量門檻。</div>';
      return;
    }
    const head = cols.map(c => {
      const on = c.k === key;
      return `<th class="${c.l ? 'l' : ''} ${on ? 'sorted' : ''}" data-k="${c.k}">${c.t}${on ? (dir > 0 ? ' ▲' : ' ▼') : ''}</th>`;
    }).join('');
    const body = rows.map(r => `<tr data-code="${r.st.code}">${cols.map(c => `<td class="${c.l ? 'l' : ''}">${c.h(r)}</td>`).join('')}</tr>`).join('');
    $('#etfTableWrap').innerHTML = `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  }

  function renderEtfKpis(uni, res) {
    const soon = (n, official) => uni.filter(st => st.nextDays != null && st.nextDays <= n && !(official && st.next.est))
      .sort((a, b) => a.nextDays - b.nextDays);
    const s7 = soon(7, true), s30 = soon(30, false), s30o = s30.filter(st => !st.next.est);
    const s7buy = s7.filter(st => lastBuyDay(st.next.ex) >= TODAY);
    const ym = TODAY.slice(0, 7);
    const payThis = uni.filter(st => st.divs.some(x => x.pay.slice(0, 7) === ym && !x.payEst));
    const ys = res.all.map(st => st.yield).filter(x => x != null && x > 0);
    const med = median(ys);
    const k = [
      { lbl: '觀察母體（上市 ETF）', val: uni.length, sub: `共 ${etfs.length} 檔・均量 ≥ ${etfState.minVol.toLocaleString()} 張・已選 ${etfState.types.size} 類` },
      { lbl: '7 天內除息（已公告）', val: s7.length,
        sub: !s7.length ? '這週沒有' : s7buy.length ? `還來得及買 ${s7buy.length} 檔，最近一檔最慢 ${md(lastBuyDay(s7buy[0].next.ex))} 買` : '最慢買進日都已過' },
      { lbl: '30 天內除息', val: s30.length, sub: `已公告 ${s30o.length} 檔・預估 ${s30.length - s30o.length} 檔` },
      { lbl: `本月（${+ym.slice(5)} 月）發放`, val: payThis.length, sub: '依已公告的收益分配發放日' },
      { lbl: '排行結果殖利率中位數', val: med == null ? '–' : fmtYield(med), sub: `近 12 月有配息 ${ys.length} / ${res.total} 檔`, c: med ? 'up' : '' }
    ];
    $('#etfKpis').innerHTML = k.map(x => `<div class="kpi"><div class="lbl">${x.lbl}</div><div class="val ${x.c || ''}">${x.val}</div><div class="sub">${x.sub}</div></div>`).join('');
  }

  function calEvents(uni, ym) {
    const show = etfState.calShow, out = [];
    for (const st of uni) {
      for (const x of st.divs.concat(st.projected)) {
        const yld = x.amt == null ? null : x.amt / (closeBefore(st, x.ex) || st.close);
        if (show === 'buy') {
          const b = lastBuyDay(x.ex);
          if (b.slice(0, 7) === ym) out.push({ st, x, kind: 'buy', date: b, est: x.est, yld });
          continue;
        }
        if (show !== 'pay' && x.ex.slice(0, 7) === ym) out.push({ st, x, kind: 'ex', date: x.ex, est: x.est, yld });
        if (show !== 'ex' && x.pay.slice(0, 7) === ym) out.push({ st, x, kind: 'pay', date: x.pay, est: x.payEst, yld });
      }
    }
    return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || (a.kind === b.kind ? 0 : a.kind === 'ex' ? -1 : 1) || (b.yld ?? 0) - (a.yld ?? 0));
  }

  function renderCalendar(uni) {
    const ym = etfState.calMonth, y = +ym.slice(0, 4), m = +ym.slice(5, 7);
    const evs = calEvents(uni, ym);
    const nDays = new Date(y, m, 0).getDate(), lead = new Date(y, m - 1, 1).getDay();
    const byDay = {};
    for (const e of evs) (byDay[e.date] = byDay[e.date] || []).push(e);
    const nEx = evs.filter(e => e.kind === 'ex').length, nPay = evs.filter(e => e.kind === 'pay').length;
    const KIND = { ex: '除息', pay: '發放', buy: '最慢買進' };
    $('#calTitle').textContent = `${y} 年 ${m} 月配息行事曆：` + (etfState.calShow === 'buy' ? `最慢買進 ${evs.length} 檔次` :
      [etfState.calShow !== 'pay' ? `除息 ${nEx} 檔次` : '', etfState.calShow !== 'ex' ? `發放 ${nPay} 檔次` : ''].filter(Boolean).join('・'));
    let cells = ['日', '一', '二', '三', '四', '五', '六'].map((w, i) => `<div class="wd ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${w}</div>`).join('');
    for (let i = 0; i < lead; i++) cells += '<div class="day out"></div>';
    for (let d = 1; d <= nDays; d++) {
      const ds = `${ym}-${pad2(d)}`, list = byDay[ds] || [], wd = (lead + d - 1) % 7;
      const ex = list.filter(e => e.kind === 'ex').length, pay = list.filter(e => e.kind === 'pay').length;
      const buy = list.filter(e => e.kind === 'buy').length;
      const chips = list.slice(0, 4).map(e =>
        `<span class="ev ${e.kind}${e.est ? ' est' : ''}" title="${esc(`${e.st.code} ${e.st.name}：${KIND[e.kind]}${e.est ? '（預估）' : ''} ${fmtAmt(e.x.amt)} 元・除息 ${md(e.x.ex)}`)}">${e.st.code}</span>`).join('');
      const cls2 = [ds === TODAY ? 'today' : '', etfState.calDay === ds ? 'sel' : '', list.length ? 'has' : '', wd === 0 ? 'sun' : wd === 6 ? 'sat' : ''].join(' ');
      cells += `<div class="day ${cls2}" data-day="${ds}">
        <div class="dn"><span>${d}</span><span class="cnt">${buy ? `<b class="cb">買${buy}</b>` : ''}${ex ? `<b class="cx">除${ex}</b>` : ''}${pay ? `<b class="cp">發${pay}</b>` : ''}</span></div>
        <div class="evs">${chips}${list.length > 4 ? `<span class="ev more">+${list.length - 4}</span>` : ''}</div>
      </div>`;
    }
    $('#calGrid').innerHTML = `<div class="cal">${cells}</div>`;

    const day = etfState.calDay && etfState.calDay.slice(0, 7) === ym ? etfState.calDay : null;
    const rows = day ? byDay[day] || [] : evs;
    const head = day ? `${md(day)} 共 ${rows.length} 筆 <a href="#" class="mini-link" id="calAll">看整月</a>` : `本月共 ${rows.length} 筆（點行事曆日期只看當天）`;
    if (!rows.length) {
      $('#calList').innerHTML = `<div class="hint cal-head">${head}</div><div class="empty">這段期間沒有符合篩選條件的配息。</div>`;
      return;
    }
    const body = rows.map(e => `
      <tr data-code="${e.st.code}">
        <td class="l">${md(e.date)}</td>
        <td class="l"><span class="ev ${e.kind}${e.est ? ' est' : ''}">${KIND[e.kind]}</span></td>
        <td class="l"><span class="code">${e.st.code}</span><span class="name">${esc(e.st.name)}</span></td>
        <td class="l">${typeTag(e.st)}</td>
        <td>${e.x.amt == null ? '<span class="flat">待公告</span>' : `${e.x.est ? '約 ' : ''}${fmtAmt(e.x.amt)} 元`}</td>
        <td>${fmtYield(e.yld)}</td>
        <td>${freqText(e.st)}</td>
        <td>${fmtYield(e.yld != null && e.st.freq ? e.yld * e.st.freq : null)}</td>
        <td>${buyCell(e.x.ex, e.x.est)}</td>
        <td>${md(e.x.ex)}${e.x.est ? ' 預估' : ''}</td>
        <td>${md(e.x.pay)}${e.x.payEst ? ' 預估' : ''}</td>
        <td class="l">${e.x.est ? '<span class="flat">依規律預估</span>' : e.x.ex <= TODAY ? '<span class="flat">已除息</span>' : e.x.amt == null ? '<span class="up">已公告日期</span>' : '<span class="up">已公告</span>'}</td>
      </tr>`).join('');
    $('#calList').innerHTML = `<div class="hint cal-head">${head}</div>
      <div class="table-wrap cal-table"><table><thead><tr>
        <th class="l">日期</th><th class="l">事件</th><th class="l">ETF</th><th class="l">類型</th><th>配息金額</th><th>單次殖利率</th>
        <th>頻率</th><th>年化</th><th>最慢買進日</th><th>除息日</th><th>發放日</th><th class="l">狀態</th>
      </tr></thead><tbody>${body}</tbody></table></div>`;
  }

  function openEtfDrawer(code) {
    const st = etfByCode[code];
    if (!st) return;
    const e = st.etf;
    const li = st.last ? dateIdx[st.last.ex] : null;
    const mark = li != null ? { idx: li, up: false, label: '除息' } : null;
    const nx = st.next;
    const stats = [
      ['類型', typeTag(st)], ['配息頻率', freqText(st)],
      ['近 12 月配息', st.ttm == null ? '–' : `${fmtAmt(st.ttm)} 元（${st.ttmN} 次）`], ['近 12 月殖利率', `<span class="up">${fmtYield(st.yield)}</span>`],
      ['年化殖利率', fmtYield(st.fwd)], ['最近除息填息', fillText(st.fill)],
      ['下次除息', nx ? `${nx.ex}${nx.est ? '（預估）' : ''}` : '–'], ['最慢買進日', nx ? buyCell(nx.ex, nx.est) : '–'],
      ['下次發放', nx ? `${nx.pay}${nx.payEst ? '（預估）' : ''}` : '–'], ['下次配息金額', nx ? (nx.amt == null ? '待公告' : `${nx.est ? '約 ' : ''}${fmtAmt(nx.amt)} 元`) : '–'],
      ['規模', fmtInt(e.aum) + ' 億元'], ['受益人數', fmtInt(e.holders) + ' 人'],
      ['上市日', e.list || '–'], ['投信', esc(e.iss || '–')],
      ['月線乖離', `<span class="${cls(st.bias)}">${fmtPct(st.bias)}</span>`], ['RSI(14)', st.rsiNow == null ? '–' : st.rsiNow.toFixed(1)],
      ['20 日均量', fmtInt(st.vol20) + ' 張'], ['近一月漲跌（含息）', `<span class="${cls(st.chg20)}">${fmtPct(st.chg20)}</span>`]
    ];
    const hist = st.divs.concat(st.projected).slice().reverse().map(x => {
      const pre = closeBefore(st, x.ex);
      const f = x.ex <= TODAY && !x.est ? fillOf(st, x.ex) : null;
      const status = x.est ? '<span class="flat">依規律預估</span>' : x.ex > TODAY ? '<span class="up">已公告</span>' : fillText(f);
      return `<tr><td class="l">${md(lastBuyDay(x.ex))}</td><td class="l">${x.ex}</td><td class="l">${x.pay}${x.payEst ? ' 預估' : ''}</td>
        <td>${x.amt == null ? '待公告' : (x.est ? '約 ' : '') + fmtAmt(x.amt) + ' 元'}</td>
        <td>${x.amt == null ? '–' : fmtYield(x.amt / (pre || st.close)) + (pre ? '' : ' <small class="flat">(以現價)</small>')}</td>
        <td class="l">${status}</td></tr>`;
    }).join('');
    const notes = st.mentions.map(m => `<li><span class="badge ${m.w}">${PEOPLE[m.w] ? PEOPLE[m.w].badge : ''}</span>${esc((PEOPLE[m.w] || {}).name || '')}：${esc(m.t)}</li>`).join('');
    $('#drawer').innerHTML = `
      <div class="dr-head">
        <h2>${st.code} ${esc(st.name)}</h2>
        <span class="flat">ETF・${esc(e.iss || '')}</span>
        <span class="px ${cls(st.dayChg)}">${fmtP(st.close)} <small>${fmtPct(st.dayChg)}</small></span>
        <span class="links">${etfLinks(st.code)}</span>
        <button class="btn small close" id="drClose">關閉 ✕</button>
      </div>
      ${e.idx ? `<div class="hint">追蹤指數：${esc(e.idx)}</div>` : ''}
      <div>${signalTags(st)}</div>
      ${chartSVG(st, mark)}
      <div class="chart-legend">
        <span><i style="background:var(--ma5)"></i>MA5</span>
        <span><i style="background:var(--ma10)"></i>MA10</span>
        <span><i style="background:var(--ma20);height:4px"></i>月線 MA20</span>
        <span><i style="background:var(--ma60)"></i>季線 MA60</span>
        <span>K 棒：紅漲綠跌（已還原配息）；▼ 最近一次除息日</span>
      </div>
      <div class="stats">${stats.map(([a, b]) => `<div class="stat"><div class="lbl">${a}</div><div class="val">${b}</div></div>`).join('')}</div>
      <h3>配息紀錄（近兩年，含已公告與預估）</h3>
      ${hist ? `<div class="table-wrap mini"><table><thead><tr><th class="l">最慢買進</th><th class="l">除息日</th><th class="l">發放日</th><th>配息金額</th><th>單次殖利率</th><th class="l">填息／狀態</th></tr></thead><tbody>${hist}</tbody></table></div>` : '<p class="hint">近兩年沒有配息紀錄。</p>'}
      ${notes ? `<h3>名人觀點</h3><ul class="notes">${notes}</ul>` : ''}`;
    $('#drawer').classList.add('show');
    $('#backdrop').classList.add('show');
    $('#drClose').onclick = closeDrawer;
  }

  function exportEtfCsv() {
    const cols = etfCols().filter(c => c.k !== 'lnk');
    const strip = h => String(h).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const lines = [cols.map(c => c.t).join(',')];
    for (const r of etfCurrentRows) {
      lines.push(cols.map(c => `"${(c.k === 'name' ? `${r.st.code} ${r.st.name}` : strip(c.h(r))).replace(/"/g, '""')}"`).join(','));
    }
    const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `etf_${etfState.sort}_${TODAY}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function syncEtfControls() {
    const uni = etfUniverse();
    $('#etfTypeChips').innerHTML = Object.entries(ETF_TYPES).map(([t, n]) =>
      `<button class="chip ${etfState.types.has(t) ? 'on' : ''}" data-type="${t}">${n} <small>${etfs.filter(s => s.type === t).length}</small></button>`).join('');
    const mset = st => (etfState.monthBy === 'pay' ? st.monthsPay : st.monthsEx);
    $('#etfMonthChips').innerHTML = Array.from({ length: 12 }, (_, i) => i + 1).map(m =>
      `<button class="chip ${etfState.months.has(m) ? 'on' : ''}" data-month="${m}">${m} 月 <small>${uni.filter(st => mset(st).has(m)).length}</small></button>`).join('');
    $('#etfMonthClear').classList.toggle('hidden', !etfState.months.size);
    $$('#segEtfFreq button').forEach(b => b.classList.toggle('on', b.dataset.v === String(etfState.freq)));
    $$('#segEtfSort button').forEach(b => b.classList.toggle('on', b.dataset.v === etfState.sort));
    $$('#segEtfMonthBy button').forEach(b => b.classList.toggle('on', b.dataset.v === etfState.monthBy));
    $$('#segCalShow button').forEach(b => b.classList.toggle('on', b.dataset.v === etfState.calShow));
    $('#etfTop').value = String(etfState.topN);
    $('#etfMinVol').value = String(etfState.minVol);
    $('#optEtfActive').checked = etfState.active;
    $('#optEtfSoon').checked = etfState.soon;
    $('#optEtfCeleb').checked = etfState.celebOnly;
  }

  function updateEtf() {
    if (!etfs.length) { $('#etfNodata').classList.remove('hidden'); return; }
    syncEtfControls();
    const uni = etfUniverse();
    const res = etfRows(uni);
    renderEtfKpis(uni, res);
    renderCalendar(uni);
    renderEtfTable(res);
    saveEtfState();
  }

  function setView(v) {
    etfState.view = ['etf', 'trend', 'trendB'].includes(v) ? v : 'stock';
    const trendOn = etfState.view === 'trend' || etfState.view === 'trendB';
    $('#stockView').classList.toggle('hidden', etfState.view !== 'stock');
    $('#etfView').classList.toggle('hidden', etfState.view !== 'etf');
    $('#trendView').classList.toggle('hidden', !trendOn);
    $$('#viewTabs button').forEach(b => b.classList.toggle('on', b.dataset.view === etfState.view));
    if (etfState.view === 'etf') updateEtf();
    else { if (trendOn) showTrend(); saveEtfState(); }
  }

  // ------------------------------------------------------------------ single-stock trend (password page)
  // Light lock only: the site is public, so this keeps casual visitors out but is not real security.
  const TREND_HASH = '5d7c2b2e';
  const TREND_KEY = 'stock-radar-trend-unlock';
  const TREND_RECENT = 'stock-radar-trend-recent';
  function fnv(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16);
  }
  const trendUnlocked = () => { try { return localStorage.getItem(TREND_KEY) === TREND_HASH && !!localStorage.getItem('stock-radar-sync-id'); } catch (e) { return false; } };
  const anyList = () => stocks.concat(etfs);
  let trendCode = null;

  // TypeA (view 'trend') asks for the password; TypeB (view 'trendB') is the same page without it.
  function showTrend() {
    const typeB = etfState.view === 'trendB';
    const ok = typeB || trendUnlocked();
    $('.trend-lockbar').classList.toggle('hidden', typeB);
    $('#trendLock').classList.toggle('hidden', ok);
    $('#trendMain').classList.toggle('hidden', !ok);
    if (!ok) { setTimeout(() => $('#trendPass').focus(), 0); return; }
    if (!$('#trendList').children.length) {
      $('#trendList').innerHTML = anyList().map(s => `<option value="${s.code} ${esc(s.name)}"></option>`).join('');
    }
    renderTrendPicks();
    renderMy();
    if (trendCode && anyCode(trendCode)) renderTrend(anyCode(trendCode));
    if (isTypeA()) syncPull();
  }

  function recentCodes() {
    try { const a = JSON.parse(localStorage.getItem(TREND_RECENT) || '[]'); return Array.isArray(a) ? a.filter(c => anyCode(c)) : []; } catch (e) { return []; }
  }
  function pushRecent(code) {
    const a = [code, ...recentCodes().filter(c => c !== code)].slice(0, 8);
    try { localStorage.setItem(TREND_RECENT, JSON.stringify(a)); } catch (e) { /* not kept */ }
  }

  // "My holdings" for TypeA: a local copy plus a cloud copy on textdb.dev, so every device that enters
  // the same password reads and edits the same list. The cloud slot is derived from the password and is
  // never written in this file; anyone who knows the password can read it.
  const MY_KEY = 'stock-radar-my-stocks';
  const SYNC_KEY = 'stock-radar-sync-id';
  const DIRTY_KEY = 'stock-radar-sync-dirty';
  const syncUrl = id => `https://textdb.dev/api/data/${id}`;
  const makeSyncId = pw => 'cria-my-' + ['a', 'b', 'c', 'd'].map(s => fnv(`${s}:cria-holdings:${pw}`).padStart(8, '0')).join('');
  const syncId = () => { try { return localStorage.getItem(SYNC_KEY) || ''; } catch (e) { return ''; } };
  const cleanList = a => (Array.isArray(a) ? a.filter(x => x && typeof x.code === 'string') : []);
  function loadMy() {
    try { return cleanList(JSON.parse(localStorage.getItem(MY_KEY) || '[]')); } catch (e) { return []; }
  }
  function saveLocal(list) { try { localStorage.setItem(MY_KEY, JSON.stringify(list)); } catch (e) { /* not kept */ } }
  function setDirty(on) { try { if (on) localStorage.setItem(DIRTY_KEY, '1'); else localStorage.removeItem(DIRTY_KEY); } catch (e) { /* ignore */ } }
  const isDirty = () => { try { return localStorage.getItem(DIRTY_KEY) === '1'; } catch (e) { return false; } };
  const inMy = code => loadMy().some(x => x.code === code);
  const isTypeA = () => etfState.view === 'trend';
  const hhmm = () => { const d = new Date(); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
  let syncMsg = { text: '', bad: false };
  function setSync(text, bad) {
    syncMsg = { text, bad: !!bad };
    const el = $('#mySync');
    if (el) { el.textContent = text; el.classList.toggle('bad', !!bad); }
  }

  // null = cloud slot never written yet
  async function pullRemote() {
    const r = await fetch(syncUrl(syncId()), { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const t = (await r.text()).trim();
    if (!t) return null;
    const j = JSON.parse(t);
    return j && Array.isArray(j.items) ? cleanList(j.items) : null;
  }
  async function pushRemote(list) {
    const body = JSON.stringify({ v: 1, updated: new Date().toISOString(), items: list });
    const r = await fetch(syncUrl(syncId()), { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body });
    if (!r.ok) throw new Error('HTTP ' + r.status);
  }
  function refreshMyViews() {
    renderMy();
    if (isTypeA() && trendCode && anyCode(trendCode)) renderTrend(anyCode(trendCode));
  }

  async function syncPull() {
    if (!syncId()) { setSync('這台裝置尚未開啟雲端同步', true); return; }
    setSync('雲端同步中…');
    try {
      const local = loadMy();
      if (isDirty() && local.length) {
        await pushRemote(local);
        setDirty(false);
      } else {
        const rem = await pullRemote();
        let firstSync = false;
        try { firstSync = localStorage.getItem('stock-radar-sync-done') !== syncId(); } catch (e) { /* ignore */ }
        if (rem === null) { if (local.length) await pushRemote(local); }
        else if (firstSync && local.some(x => !rem.some(y => y.code === x.code))) {
          // a device's first sync keeps the stocks it already had locally
          const merged = rem.concat(local.filter(x => !rem.some(y => y.code === x.code)));
          await pushRemote(merged);
          saveLocal(merged);
        } else saveLocal(rem);
        try { localStorage.setItem('stock-radar-sync-done', syncId()); } catch (e) { /* ignore */ }
      }
      setSync(`已與雲端同步（${hhmm()}）`);
    } catch (e) {
      setSync('連不上雲端，先顯示這台裝置上次的清單', true);
    }
    refreshMyViews();
  }

  // Apply an edit on top of the latest cloud copy, so two phones editing at different times do not overwrite each other.
  async function mutateMy(fn) {
    let list = loadMy();
    if (syncId() && !isDirty()) {
      try { const rem = await pullRemote(); if (rem !== null) list = rem; } catch (e) { /* use local */ }
    }
    fn(list);
    saveLocal(list);
    refreshMyViews();
    if (!syncId()) return;
    setSync('儲存到雲端…');
    try { await pushRemote(list); setDirty(false); setSync(`已存到雲端（${hhmm()}）`); }
    catch (e) { setDirty(true); setSync('雲端暫時連不上，已先存在這台裝置，下次打開會自動補存', true); }
  }

  function renderMy() {
    $('#myPanel').classList.toggle('hidden', !isTypeA());
    if (!isTypeA()) return;
    const list = loadMy();
    if (!list.length) {
      $('#myList').innerHTML = '<div class="empty">還沒有加入股票。先在上方輸入代號按「分析」，再按「加入我的持股」。</div>';
      return;
    }
    let sumCost = 0, sumNow = 0;
    const rows = list.map(x => {
      const st = anyCode(x.code);
      if (!st) {
        return `<tr><td class="l">${esc(x.code)}</td><td class="l" colspan="8"><span class="flat">目前資料裡找不到這檔（可能已下市或代號有誤）</span></td>
          <td class="l"><button class="btn small" type="button" data-my-del="${esc(x.code)}">移除</button></td></tr>`;
      }
      const tr = classifyTrend(st);
      const cost = +x.cost > 0 ? +x.cost : null, lots = +x.lots > 0 ? +x.lots : null;
      const pl = cost ? st.close / cost - 1 : null;
      const amt = cost && lots ? (st.close - cost) * lots * 1000 : null;
      if (cost && lots) { sumCost += cost * lots * 1000; sumNow += st.close * lots * 1000; }
      return `<tr>
        <td class="l"><a href="#" data-pick="${st.code}"><span class="code">${st.code}</span><span class="name">${esc(st.name)}</span></a></td>
        <td>${fmtP(st.close)}</td><td>${pctCell(st.dayChg)}</td>
        <td class="l"><span class="tv-chip ${tr.tone}">${tr.name}</span></td>
        <td class="l">${celebBadges(st) || '<span class="flat">–</span>'}</td>
        <td><input class="my-in" type="number" step="0.01" min="0" inputmode="decimal" data-my-cost="${st.code}" value="${cost ?? ''}" placeholder="買進價"></td>
        <td><input class="my-in short" type="number" step="1" min="0" inputmode="numeric" data-my-lots="${st.code}" value="${lots ?? ''}" placeholder="張"></td>
        <td>${pl == null ? '<span class="flat">–</span>' : pctCell(pl)}</td>
        <td>${amt == null ? '<span class="flat">–</span>' : `<span class="${cls(amt)}">${(amt > 0 ? '+' : '') + Math.round(amt).toLocaleString('zh-TW')}</span>`}</td>
        <td class="l nowrap"><button class="btn small" type="button" data-pick="${st.code}">看趨勢</button>
          <button class="btn small" type="button" data-my-del="${st.code}">移除</button></td>
      </tr>`;
    }).join('');
    const tot = sumCost ? sumNow - sumCost : null;
    $('#myList').innerHTML = `<div class="table-wrap mini my-table"><table><thead><tr>
      <th class="l">股票</th><th>收盤</th><th>日漲跌</th><th class="l">型態</th><th class="l">名人</th><th>買進價</th><th>張數</th><th>損益%</th><th>損益(元)</th><th class="l"></th>
      </tr></thead><tbody>${rows}</tbody></table></div>
      ${tot == null ? '' : `<p class="my-total">有填買進價與張數的合計：成本 ${Math.round(sumCost).toLocaleString('zh-TW')} 元，市值 ${Math.round(sumNow).toLocaleString('zh-TW')} 元，
        損益 <span class="${cls(tot)}">${(tot > 0 ? '+' : '') + Math.round(tot).toLocaleString('zh-TW')} 元（${fmtPct(tot / sumCost)}）</span>（未含手續費與稅）</p>`}`;
  }

  function myButton(code) {
    if (!isTypeA()) return '';
    return inMy(code)
      ? `<button class="btn small my-added" type="button" data-my-del="${code}">✓ 已在我的持股（點此移除）</button>`
      : `<button class="btn small my-add" type="button" data-my-add="${code}">＋ 加入我的持股</button>`;
  }

  function renderTrendPicks() {
    const chip = code => { const s = anyCode(code); return s ? `<button class="chip" type="button" data-pick="${code}">${code} ${esc(s.name)}</button>` : ''; };
    const rec = recentCodes();
    const hot = Object.entries(CELEB.mentions || {})
      .map(([c, arr]) => [c, new Set(arr.map(m => m.w)).size])
      .filter(([c]) => anyCode(c)).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([c]) => c);
    $('#trendPicks').innerHTML =
      (rec.length ? `<div class="pick-row"><span class="pick-lbl">最近查過</span><div class="chips">${rec.map(chip).join('')}</div></div>` : '') +
      `<div class="pick-row"><span class="pick-lbl">名人最常提到</span><div class="chips">${hot.map(chip).join('')}</div></div>`;
  }

  function findTrendStock(q) {
    q = q.trim();
    if (!q) return { list: [] };
    const head = q.split(/\s+/)[0].toUpperCase();
    if (anyCode(head)) return { st: anyCode(head) };
    const low = q.toLowerCase();
    const list = anyList().filter(s => s.code.toLowerCase().includes(low) || s.name.toLowerCase().includes(low));
    return list.length === 1 ? { st: list[0] } : { list: list.slice(0, 12) };
  }

  function crossDown(a, within) {
    for (let t = LAST; t > LAST - within && t >= 1; t--) {
      if (a[t] != null && a[t - 1] != null && a[t - 1] >= 0 && a[t] < 0) return t;
    }
    return -1;
  }
  function sellStreak(st, who) {
    let n = 0;
    for (let j = instLast; j >= 0; j--) { const x = instNet(st, who, j); if (x == null || x >= 0) break; n++; }
    return n;
  }

  // Chart-pattern label from moving averages, the 60-day range and recent crosses.
  function classifyTrend(st) {
    const L = LAST, c = st.close;
    const m10 = st.ma10[L], m20 = st.ma20[L], m60 = st.ma60[L];
    const s60 = m60 != null && st.ma60[L - 10] != null ? m60 - st.ma60[L - 10] : null;
    const win = n => st.fc.slice(Math.max(0, T - n)).filter(x => x != null);
    const w60 = win(60), w20 = win(20);
    const hi60 = Math.max(...w60), lo60 = Math.min(...w60);
    const pos = hi60 > lo60 ? (c - lo60) / (hi60 - lo60) : 0.5;
    const rng20 = Math.min(...w20) ? Math.max(...w20) / Math.min(...w20) - 1 : 0;
    const up20 = findMaCross(st, 20, 5, 1) >= 0, dn20 = findMaCross(st, 20, 5, -1) >= 0;
    const macdUp = findCross(st.osc, 5) >= 0 && st.osc[L] > 0, macdDn = crossDown(st.osc, 5) >= 0 && st.osc[L] < 0;
    const facts = [];
    const near = (a, b) => (b ? fmtPct(a / b - 1, 1) : '–');
    facts.push(`均線排列：${st.bullAlign ? '多頭（5 日 > 10 日 > 月線）' : st.bearAlign ? '空頭（5 日 < 10 日 < 月線）' : '糾結（方向不一致）'}`);
    if (m60 != null) facts.push(`收盤 ${fmtP(c)} 在季線 ${fmtP(m60)} ${c >= m60 ? '之上' : '之下'}（${near(c, m60)}），季線近 10 日${s60 > 0 ? '上揚' : s60 < 0 ? '下彎' : '走平'}`);
    if (m20 != null) facts.push(`月線 ${fmtP(m20)}，乖離 ${near(c, m20)}，月線${st.slopeDown ? '下彎' : '上揚或走平'}`);
    facts.push(`近 60 日區間位置 ${(pos * 100).toFixed(0)}%（0% = 區間最低 ${fmtP(lo60)}，100% = 最高 ${fmtP(hi60)}）`);
    if (up20) facts.push('近 5 日站上月線');
    if (dn20) facts.push('近 5 日跌破月線');
    if (macdUp) facts.push('近 5 日 MACD 柱狀體由負翻正');
    if (macdDn) facts.push('近 5 日 MACD 柱狀體由正翻負');
    let t;
    if (m60 == null) t = { name: '資料不足', tone: 'neutral', desc: '上市未滿 60 個交易日，先只看短期均線與 MACD。' };
    else if (st.bullAlign && c > m60 && s60 > 0) t = { name: '強勢多頭', tone: 'bull', desc: '短中長期均線多頭排列、季線上揚，股價沿均線走高；拉回 10 日線或月線不破仍偏多。' };
    else if (c > m60 && s60 > 0 && m10 != null && (c < m10 || c < m20)) t = { name: '多頭回檔', tone: 'bull', desc: '季線仍上揚，短線拉回到 10 日線／月線附近；守住季線屬多頭裡的修正，跌破季線則要小心轉弱。' };
    else if (up20 && macdUp && c <= m60 * 1.05) t = { name: '轉強初期', tone: 'bull', desc: '剛站上月線且 MACD 翻正，位置仍在季線附近；觀察能否帶量站穩季線。' };
    else if (dn20 && macdDn && c > m60) t = { name: '轉弱初期', tone: 'bear', desc: '剛跌破月線且 MACD 翻負，但仍在季線之上；季線是下一道支撐。' };
    else if (st.bearAlign && c < m60 && s60 < 0) t = { name: '弱勢空頭', tone: 'bear', desc: '均線空頭排列、季線下彎，股價在所有均線之下；等止跌訊號（站回月線、MACD 翻正）再考慮。' };
    else if (c < m60 && s60 < 0 && m20 != null && c > m20) t = { name: '空頭反彈', tone: 'neutral', desc: '季線仍下彎，股價反彈到月線之上；要能站回季線才算扭轉，否則容易遇壓回落。' };
    else if (rng20 < 0.08 && Math.abs(c / m60 - 1) < 0.05) t = pos < 0.4
      ? { name: '低檔盤整（築底）', tone: 'neutral', desc: '近 20 日波動不到 8%、貼近季線且在區間低檔，可能在打底；等帶量突破區間再跟。' }
      : pos > 0.7 ? { name: '高檔整理', tone: 'neutral', desc: '近 20 日波動小、位在區間高檔；整理後可能續攻，跌破月線則留意轉弱。' }
        : { name: '區間盤整', tone: 'neutral', desc: '近 20 日波動不到 8%、貼近季線，方向未明；等突破或跌破區間。' };
    else t = c > m60 ? { name: '多頭格局・震盪', tone: 'bull', desc: '股價在季線之上但均線糾結，屬多頭格局中的震盪。' }
      : { name: '空頭格局・震盪', tone: 'bear', desc: '股價在季線之下但均線糾結，屬空頭格局中的震盪。' };
    return { ...t, facts, pos };
  }

  function presetMatch(st, pr) {
    if ((st.vol20 || 0) < (pr.minVol || 0)) return false;
    if (pr.mode === 'break') {
      const i = findMaCross(st, 20, (pr.weeks || 2) * 5, -1);
      if (i < 0 || (pr.stillBelow && !st.below) || (pr.slopeDown && !st.slopeDown) || (pr.dipOnly && !st.dip)) return false;
      return !pr.volBreak || volRatioAt(st, i) >= 1.5;
    }
    if (pr.mode === 'inst') return instLast >= 0 && !!st.fi && instStreak(st, pr.instWho).n >= pr.instDays && (!pr.instBelow || st.below);
    if (pr.mode === 'macd') {
      const line = pr.macdType === 'osc' ? 'osc' : 'dif';
      return findCross(st[line], pr.macdWithin) >= 0 && (!pr.macdStill || st[line][LAST] > 0) && (!pr.macdLow || st.dif[LAST] < 0);
    }
    if (pr.mode === 'up') return findMaCross(st, pr.upMa, pr.upDays, 1) >= 0 && (!pr.stillAbove || isAbove(st, pr.upMa));
    return false;
  }

  function renderTrend(st) {
    trendCode = st.code;
    const isEtf = !!st.etf;
    const tr = classifyTrend(st);
    const pos = n => (maOf(st, n)[LAST] == null ? '–' : isAbove(st, n) ? '<span class="up">線上</span>' : '<span class="down">線下</span>');
    const chg = n => (st.fc[LAST - n] ? st.close / st.fc[LAST - n] - 1 : null);
    const inst = !isEtf && instLast >= 0 && st.fi ? ['fi', 'it', 'dl'].map(w => {
      const b = instStreak(st, w).n, s = sellStreak(st, w);
      return `${WHO[w]} ${b ? `<span class="up">連買 ${b} 天</span>` : s ? `<span class="down">連賣 ${s} 天</span>` : '<span class="flat">無連續</span>'}`;
    }).join('<br>') : '<span class="flat">ETF 不提供法人連買資料</span>';
    const nx = isEtf ? st.next : st.sNext;
    const stats = [
      ['收盤／日漲跌', `${fmtP(st.close)} <span class="${cls(st.dayChg)}">${fmtPct(st.dayChg)}</span>`],
      ['近 20 日／60 日漲跌', `<span class="${cls(chg(20))}">${fmtPct(chg(20))}</span> ／ <span class="${cls(chg(60))}">${fmtPct(chg(60))}</span>`],
      ['5／10／20／60 日線', `${pos(5)} / ${pos(10)} / ${pos(20)} / ${pos(60)}`],
      ['RSI(14)', st.rsiNow == null ? '–' : `${st.rsiNow.toFixed(1)}${st.rsiNow < 30 ? '（超賣）' : st.rsiNow > 70 ? '（過熱）' : ''}`],
      ['K / D', st.kNow == null ? '–' : `${st.kNow.toFixed(0)} / ${st.dNow.toFixed(0)}${st.kNow > st.dNow ? '（K 在 D 上）' : '（K 在 D 下）'}`],
      ['MACD 柱狀體', `<span class="${cls(st.osc[LAST])}">${fmtM(st.osc[LAST])}</span>（DIF ${st.dif[LAST] >= 0 ? '0 軸上' : '0 軸下'}）`],
      ['20 日均量', fmtInt(st.vol20) + ' 張'],
      ['法人', inst],
      ['下次除權息', nx ? `${nx.ex}${nx.est ? '（預估）' : ''}` : '近一年無'],
      ['最慢買進日', nx ? buyCell(nx.ex, nx.est) : '–']
    ];
    const ment = st.mentions;
    const nameKey = st.name.replace(/[-*].*$/, '');
    const posts = [];
    for (const p of CELEB.people || []) {
      for (const x of p.posts) {
        if ((x.title + x.point).includes(nameKey) || (x.title + x.point).includes(st.code)) posts.push({ p, x });
      }
    }
    const fits = (CELEB.people || []).filter(p => p.preset && presetMatch(st, p.preset));
    const who = [...new Set(ment.map(m => m.w))];
    const celebHtml = `
      ${who.length ? `<ul class="notes">${who.map(w => `<li><span class="badge ${w}">${PEOPLE[w] ? PEOPLE[w].badge : ''}</span><b>${esc((PEOPLE[w] || {}).name || '')}</b>：${ment.filter(m => m.w === w).map(m => esc(m.t)).join('；')}</li>`).join('')}</ul>`
        : '<p class="hint">近期五位名人都沒有點名這檔。</p>'}
      ${posts.length ? `<div class="hint">提到這檔的近期發表</div><ul class="posts">${posts.slice(0, 8).map(({ p, x }) =>
        `<li><span class="badge ${p.id}">${p.badge}</span><span class="d">${x.date}</span><a href="${x.url}" target="_blank" rel="noopener">${esc(x.title)}</a><span class="p">${esc(x.point)}</span></li>`).join('')}</ul>` : ''}
      <div class="hint">目前符合哪位名人的選股視角</div>
      <div>${fits.length ? fits.map(p => `<span class="tag bull">${esc(p.name)}・${esc(p.presetLabel.replace(/^套用「|」視角$/g, ''))}</span>`).join('') : '<span class="flat">目前不符合任何一位的套用視角條件</span>'}</div>`;
    const sum = [`型態「${tr.name}」`];
    if (!isEtf && instLast >= 0 && st.fi) {
      const f = instStreak(st, 'fi').n, i = instStreak(st, 'it').n, fs = sellStreak(st, 'fi'), is = sellStreak(st, 'it');
      sum.push(`外資${f ? `連買 ${f} 天` : fs ? `連賣 ${fs} 天` : '無連續'}、投信${i ? `連買 ${i} 天` : is ? `連賣 ${is} 天` : '無連續'}`);
    }
    sum.push(who.length ? `${who.length} 位名人提到（${who.map(w => (PEOPLE[w] || {}).name).join('、')}）` : '名人沒有提到');
    if (fits.length) sum.push(`符合 ${fits.map(p => p.name).join('、')} 的選股視角`);
    const mark = isEtf ? (st.last && dateIdx[st.last.ex] != null ? { idx: dateIdx[st.last.ex], up: false, label: '除息' } : null) : null;
    $('#trendResult').innerHTML = `
      <section class="panel trend-card">
        <div class="dr-head">
          <h2>${st.code} ${esc(st.name)}</h2>
          <span class="flat">${isEtf ? 'ETF・' + esc(st.etf.iss || '') : st.indName}${st.sub ? '・' + esc(st.sub.label) : ''}</span>
          <span class="px ${cls(st.dayChg)}">${fmtP(st.close)} <small>${fmtPct(st.dayChg)}</small></span>
          <span class="links">${isEtf ? etfLinks(st.code) : links(st.code)}</span>
          ${myButton(st.code)}
        </div>
        <div class="trend-verdict ${tr.tone}">
          <div class="tv-name">${tr.name}</div>
          <div class="tv-desc">${tr.desc}</div>
        </div>
        <p class="trend-sum">${sum.join('；')}。</p>
        <div class="trend-grid">
          <div>
            <h3>型態判斷依據</h3>
            <ul class="trend-facts">${tr.facts.map(f => `<li>${f}</li>`).join('')}</ul>
            <div>${signalTags(st)}</div>
          </div>
          <div>
            <h3>股市名人怎麼說</h3>
            ${celebHtml}
          </div>
        </div>
        <div class="stats">${stats.map(([a, b]) => `<div class="stat"><div class="lbl">${a}</div><div class="val">${b}</div></div>`).join('')}</div>
        ${chartSVG(st, mark)}
        <div class="chart-legend">
          <span><i style="background:var(--ma5)"></i>MA5</span>
          <span><i style="background:var(--ma10)"></i>MA10</span>
          <span><i style="background:var(--ma20);height:4px"></i>月線 MA20</span>
          <span><i style="background:var(--ma60)"></i>季線 MA60</span>
          <span>K 棒紅漲綠跌（已還原除權息）</span>
        </div>
        <p class="hint">型態是依均線、近 60 日區間與 MACD 自動判斷的參考，不構成投資建議。</p>
      </section>`;
  }

  function bindTrend() {
    $('#trendLockForm').addEventListener('submit', e => {
      e.preventDefault();
      const v = $('#trendPass').value.trim();
      if (fnv('cria-trend:' + v) === TREND_HASH) {
        try { localStorage.setItem(TREND_KEY, TREND_HASH); localStorage.setItem(SYNC_KEY, makeSyncId(v)); } catch (err) { /* only this visit */ }
        $('#trendPass').value = '';
        $('#trendLockMsg').textContent = '';
        if (!trendUnlocked()) { $('#trendLock').classList.add('hidden'); $('#trendMain').classList.remove('hidden'); renderTrendPicks(); renderMy(); return; }
        showTrend();
      } else {
        $('#trendLockMsg').textContent = '密碼不正確，請再試一次。';
        $('#trendPass').select();
      }
    });
    $('#myList').addEventListener('change', e => {
      const t = e.target, code = t.dataset.myCost || t.dataset.myLots;
      if (!code) return;
      const v = t.value === '' ? null : +t.value, isCost = !!t.dataset.myCost;
      mutateMy(list => {
        const x = list.find(y => y.code === code);
        if (!x) return;
        if (isCost) x.cost = v > 0 ? v : null; else x.lots = v > 0 ? v : null;
      });
    });
    $('#myExport').addEventListener('click', e => {
      e.preventDefault();
      const list = loadMy();
      if (!list.length) { alert('我的持股目前是空的，沒有東西可以備份。'); return; }
      const code = 'CRIA1:' + btoa(unescape(encodeURIComponent(JSON.stringify(list))));
      if (navigator.clipboard) navigator.clipboard.writeText(code).catch(() => {});
      prompt('備份碼已複製（若沒有自動複製，請全選下面這段）。到另一台裝置的 TypeA「從備份還原」貼上即可：', code);
    });
    $('#myImport').addEventListener('click', e => {
      e.preventDefault();
      const s = (prompt('貼上備份碼：') || '').trim();
      if (!s) return;
      let got;
      try { got = JSON.parse(decodeURIComponent(escape(atob(s.replace(/^CRIA1:/, ''))))); } catch (err) { got = null; }
      if (!Array.isArray(got)) { alert('備份碼看不懂，請確認是完整複製的那一段。'); return; }
      let added = 0, total = 0;
      mutateMy(list => {
        for (const y of got) {
          if (!y || typeof y.code !== 'string') continue;
          const x = list.find(z => z.code === y.code);
          if (x) { if (y.cost) x.cost = y.cost; if (y.lots) x.lots = y.lots; } else { list.push({ code: y.code, added: y.added || TODAY, cost: y.cost || null, lots: y.lots || null }); added++; }
        }
        total = list.length;
      }).then(() => alert(`還原完成：新增 ${added} 檔，現在共 ${total} 檔。`));
    });
    $('#trendLogout').addEventListener('click', e => {
      e.preventDefault();
      try { localStorage.removeItem(TREND_KEY); localStorage.removeItem(SYNC_KEY); } catch (err) { /* nothing kept */ }
      $('#trendResult').innerHTML = '';
      trendCode = null;
      showTrend();
    });
    $('#trendForm').addEventListener('submit', e => {
      e.preventDefault();
      const r = findTrendStock($('#trendQ').value);
      if (r.st) { pushRecent(r.st.code); renderTrendPicks(); renderTrend(r.st); return; }
      $('#trendResult').innerHTML = `<section class="panel"><div class="empty">${r.list.length
        ? `找到 ${r.list.length} 檔，請點選：<div class="chips trend-cands">${r.list.map(s => `<button class="chip" type="button" data-pick="${s.code}">${s.code} ${esc(s.name)}</button>`).join('')}</div>`
        : '找不到這檔，請確認代號或名稱（只有上市股票與上市 ETF）。'}</div></section>`;
    });
    $('#trendView').addEventListener('click', e => {
      const add = e.target.closest('[data-my-add]');
      if (add) {
        const code = add.dataset.myAdd;
        mutateMy(list => { if (!list.some(x => x.code === code)) list.unshift({ code, added: TODAY }); });
        return;
      }
      const del = e.target.closest('[data-my-del]');
      if (del) {
        const code = del.dataset.myDel, st = anyCode(code);
        if (!confirm(`確定把 ${code}${st ? ' ' + st.name : ''} 從我的持股移除？`)) return;
        mutateMy(list => { const i = list.findIndex(x => x.code === code); if (i >= 0) list.splice(i, 1); });
        return;
      }
      if (e.target.closest('#mySyncNow')) { e.preventDefault(); syncPull(); return; }
      const b = e.target.closest('[data-pick]');
      if (!b) return;
      e.preventDefault();
      const st = anyCode(b.dataset.pick);
      if (!st) return;
      $('#trendQ').value = `${st.code} ${st.name}`;
      pushRecent(st.code);
      renderTrendPicks();
      renderTrend(st);
      $('#trendResult').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function bindEtf() {
    $('#viewTabs').addEventListener('click', e => {
      const b = e.target.closest('[data-view]');
      if (b) setView(b.dataset.view);
    });
    const seg = (sel, fn) => $$(sel + ' button').forEach(b => b.addEventListener('click', e => { e.preventDefault(); fn(b.dataset.v); updateEtf(); }));
    seg('#segEtfFreq', v => (etfState.freq = v === 'all' ? 'all' : v));
    seg('#segEtfSort', v => { etfState.sort = v; etfState.sortKey = null; });
    seg('#segEtfMonthBy', v => (etfState.monthBy = v));
    seg('#segCalShow', v => (etfState.calShow = v));
    $('#etfTypeChips').addEventListener('click', e => {
      const b = e.target.closest('[data-type]');
      if (!b) return;
      const t = b.dataset.type, all = etfState.types.size === Object.keys(ETF_TYPES).length;
      if (all) etfState.types = new Set([t]);
      else if (etfState.types.has(t)) etfState.types.delete(t);
      else etfState.types.add(t);
      if (!etfState.types.size) etfState.types = new Set(Object.keys(ETF_TYPES));
      updateEtf();
    });
    $('#etfTypeAll').addEventListener('click', e => { e.preventDefault(); etfState.types = new Set(Object.keys(ETF_TYPES)); updateEtf(); });
    $('#etfMonthChips').addEventListener('click', e => {
      const b = e.target.closest('[data-month]');
      if (!b) return;
      const m = +b.dataset.month;
      if (etfState.months.has(m)) etfState.months.delete(m); else etfState.months.add(m);
      updateEtf();
    });
    $('#etfMonthClear').addEventListener('click', e => { e.preventDefault(); etfState.months.clear(); updateEtf(); });
    $('#etfTop').addEventListener('change', e => { etfState.topN = +e.target.value; updateEtf(); });
    $('#etfMinVol').addEventListener('change', e => { etfState.minVol = +e.target.value; updateEtf(); });
    $('#etfQ').addEventListener('input', e => { etfState.query = e.target.value; updateEtf(); });
    const chk = (id, key) => $(id).addEventListener('change', e => { etfState[key] = e.target.checked; updateEtf(); });
    chk('#optEtfActive', 'active');
    chk('#optEtfSoon', 'soon');
    chk('#optEtfCeleb', 'celebOnly');
    $('#btnEtfCsv').addEventListener('click', exportEtfCsv);
    const moveMonth = n => { etfState.calMonth = addMonths(etfState.calMonth + '-01', n).slice(0, 7); etfState.calDay = null; updateEtf(); };
    $('#calPrev').addEventListener('click', () => moveMonth(-1));
    $('#calNext').addEventListener('click', () => moveMonth(1));
    $('#calNow').addEventListener('click', () => { etfState.calMonth = TODAY.slice(0, 7); etfState.calDay = null; updateEtf(); });
    $('#calGrid').addEventListener('click', e => {
      const d = e.target.closest('.day[data-day]');
      if (!d) return;
      etfState.calDay = etfState.calDay === d.dataset.day ? null : d.dataset.day;
      updateEtf();
    });
    $('#calList').addEventListener('click', e => {
      if (e.target.closest('#calAll')) { e.preventDefault(); etfState.calDay = null; updateEtf(); return; }
      const tr = e.target.closest('tr[data-code]');
      if (tr) openEtfDrawer(tr.dataset.code);
    });
    $('#etfTableWrap').addEventListener('click', e => {
      const th = e.target.closest('th');
      if (th) {
        const k = th.dataset.k;
        if (etfState.sortKey === k) etfState.sortDir *= -1; else { etfState.sortKey = k; etfState.sortDir = 1; }
        updateEtf();
        return;
      }
      if (e.target.closest('a')) return;
      const tr = e.target.closest('tr[data-code]');
      if (tr) openEtfDrawer(tr.dataset.code);
    });
  }

  // ------------------------------------------------------------------ CSV
  function exportCsv() {
    const cols = colsFor(state.mode);
    const strip = h => String(h).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const usable = cols.filter(c => c.k !== 'lnk');
    const lines = [usable.map(c => c.t).join(',')];
    for (const r of currentRows) {
      lines.push(usable.map(c => {
        const v = c.k === 'name' ? `${r.st.code} ${r.st.name}` : strip(c.h(r));
        return `"${v.replace(/"/g, '""')}"`;
      }).join(','));
    }
    const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `stocks_${state.mode}_${dates[LAST]}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ------------------------------------------------------------------ controls
  function renderGroupChecks() {
    $('#grpChecks').innerHTML = Object.entries(GROUPS).map(([g, n]) => {
      const cnt = stocks.filter(s => s.grp === g).length;
      return `<label class="chk grp"><input type="checkbox" data-grp="${g}" ${state.groups.has(g) ? 'checked' : ''}> ${n} <small>${cnt}</small></label>`;
    }).join('');
  }

  function renderIndustryChips() {
    $('#indChips').innerHTML = visibleCodes().map(id => {
      const cnt = stocks.filter(s => s.ind === id).length;
      return `<button class="chip ${state.industries.has(id) ? 'on' : ''}" data-ind="${id}">${IND[id] || id} <small>${cnt}</small></button>`;
    }).join('');
  }

  function renderSubChips() {
    const box = $('#subChips');
    const show = !!SUB && state.groups.has('elec');
    $('#subRow').classList.toggle('hidden', !show);
    if (!show) return;
    const allInd = state.industries.size === visibleCodes().length;
    $('#subClear').classList.toggle('hidden', !state.subs.size);
    if (allInd && !state.subs.size) {
      box.innerHTML = '<span class="hint">先點選上方一個產業（例如「半導體業」），這裡會依產業價值鏈再細分，例如 IC設計 → 電源管理IC、晶圓製造、IC封裝測試、PCB 載板、被動元件…</span>';
      return;
    }
    const chains = new Map();
    for (const st of baseUniverse(false, true)) {
      for (const k of st.subKeys) {
        const chain = k.slice(0, k.indexOf('|'));
        if (!chains.has(chain)) chains.set(chain, { chain, items: new Map(), codes: new Set() });
        const c = chains.get(chain);
        c.codes.add(st.code);
        c.items.set(k, (c.items.get(k) || 0) + 1);
      }
    }
    for (const k of state.subs) {
      const chain = k.slice(0, k.indexOf('|'));
      if (!chains.has(chain)) chains.set(chain, { chain, items: new Map(), codes: new Set() });
      if (!chains.get(chain).items.has(k)) chains.get(chain).items.set(k, 0);
    }
    const pref = [...new Set([...state.industries].flatMap(id => CHAIN_PREF[id] || []))];
    const rank = c => (pref.includes(c.chain) ? pref.indexOf(c.chain) : 99);
    const list = [...chains.values()].sort((a, b) => rank(a) - rank(b) || b.codes.size - a.codes.size);
    const limit = 3;
    const shown = state.subMore ? list : list.filter((c, i) => i < limit || [...c.items.keys()].some(k => state.subs.has(k)));
    const rest = list.length - shown.length;
    box.innerHTML = shown.map(c => {
      const generic = k => (k.slice(k.indexOf('|') + 1).startsWith('其他') ? 1 : 0);
      const chips = [...c.items.entries()].sort((a, b) => generic(a[0]) - generic(b[0]) || b[1] - a[1]).map(([k, n]) =>
        `<button class="chip sub ${state.subs.has(k) ? 'on' : ''}" data-sub="${esc(k)}">${esc(k.slice(k.indexOf('|') + 1))} <small>${n}</small></button>`).join('');
      return `<div class="sub-chain"><span class="sub-chain-name">${esc(chainName(c.chain))}<small>${c.codes.size}</small></span><div class="chips">${chips}</div></div>`;
    }).join('') +
      (rest > 0 ? `<a href="#" class="mini-link" id="subMore">顯示其他 ${rest} 條產業鏈 ▾</a>`
        : state.subMore && list.length > limit ? '<a href="#" class="mini-link" id="subMore">收合 ▴</a>' : '') +
      (list.length ? '' : '<span class="hint">目前條件下沒有可細分的股票</span>');
  }

  function syncControls() {
    $$('.tab').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === state.mode);
      b.textContent = `${b.dataset.label} Top ${state.topN}`;
    });
    $('#ctlBreak').classList.toggle('hidden', state.mode !== 'break');
    $('#ctlUp').classList.toggle('hidden', state.mode !== 'up');
    $('#ctlDrop').classList.toggle('hidden', state.mode !== 'drop');
    $('#ctlInst').classList.toggle('hidden', state.mode !== 'inst');
    $('#ctlMacd').classList.toggle('hidden', state.mode !== 'macd');
    $('#ctlCombo').classList.toggle('hidden', state.mode !== 'combo');
    $('#ctlDiv').classList.toggle('hidden', state.mode !== 'div');
    $$('#segDivWithin button').forEach(b => b.classList.toggle('on', +b.dataset.v === state.divWithin));
    $$('#segDivType button').forEach(b => b.classList.toggle('on', b.dataset.v === state.divType));
    $$('#segDivSort button').forEach(b => b.classList.toggle('on', b.dataset.v === state.divSort));
    $('#optDivAnn').checked = state.divAnnOnly;
    $('#optDivCanBuy').checked = state.divCanBuy;
    for (const id of NUM_CTLS.concat(['cbDropBase'])) $('#' + id).value = String(state[id]);
    for (const id of Object.values(COMBO_KEY)) $('#' + id).checked = state[id];
    $$('#segBreakMa button').forEach(b => b.classList.toggle('on', +b.dataset.v === state.breakMa));
    $$('#segBreakDays button').forEach(b => b.classList.toggle('on', +b.dataset.v === state.breakDays));
    $$('#segUpMa button').forEach(b => b.classList.toggle('on', +b.dataset.v === state.upMa));
    $$('#segUpDays button').forEach(b => b.classList.toggle('on', +b.dataset.v === state.upDays));
    $('#optAbove').checked = state.stillAbove;
    $('#optUpSlope').checked = state.upSlope;
    $('#optUpVol').checked = state.upVol;
    $('#optBull').checked = state.bullOnly;
    $('#lblBelow').textContent = `目前仍在${MA_NAME[state.breakMa]}下`;
    $('#lblSlope').textContent = `${MA_NAME[state.breakMa]}下彎`;
    $('#lblAbove').textContent = `目前仍在${MA_NAME[state.upMa]}上`;
    $('#lblUpSlope').textContent = `${MA_NAME[state.upMa]}上揚`;
    $$('#segComboMatch button').forEach(b => b.classList.toggle('on', b.dataset.v === state.comboMatch));
    $$('#segWho button').forEach(b => b.classList.toggle('on', b.dataset.v === state.instWho));
    $$('#segDays button').forEach(b => b.classList.toggle('on', +b.dataset.v === state.instDays));
    $$('#segMacdType button').forEach(b => b.classList.toggle('on', b.dataset.v === state.macdType));
    $$('#segMacdWithin button').forEach(b => b.classList.toggle('on', +b.dataset.v === state.macdWithin));
    $$('#segMacdSort button').forEach(b => b.classList.toggle('on', b.dataset.v === state.macdSort));
    $('#optInstBelow').checked = state.instBelow;
    $('#optMacdStill').checked = state.macdStill;
    $('#optMacdLow').checked = state.macdLow;
    $$('#segBase button').forEach(b => b.classList.toggle('on', b.dataset.v === state.dropBase));
    $$('#segMetric button').forEach(b => b.classList.toggle('on', b.dataset.v === state.dropMetric));
    $('#optBelow').checked = state.stillBelow;
    $('#optSlope').checked = state.slopeDown;
    $('#optVol').checked = state.volBreak;
    $('#optDip').checked = state.dipOnly;
    $('#optCeleb').checked = state.celebOnly;
    $('#optHit').checked = state.onlyHit;
    $('#minVol').value = String(state.minVol);
    $('#thr').value = state.threshold;
    $('#thrVal').textContent = state.threshold + '%';
    renderGroupChecks();
    renderIndustryChips();
    renderSubChips();
  }

  function update() {
    syncControls();
    const res = computeRows();
    renderKpis(res);
    renderBreadth(res);
    renderTable(res);
    saveState();
  }

  const allIndustries = () => new Set(visibleCodes());

  function bind() {
    $$('.tab').forEach(b => b.addEventListener('click', () => {
      state.mode = b.dataset.mode; state.sortKey = null; update();
    }));
    const seg = (sel, fn) => $$(sel + ' button').forEach(b => b.addEventListener('click', () => { fn(b.dataset.v); update(); }));
    seg('#segBreakMa', v => (state.breakMa = +v));
    seg('#segBreakDays', v => (state.breakDays = +v));
    seg('#segUpMa', v => (state.upMa = +v));
    seg('#segUpDays', v => (state.upDays = +v));
    seg('#segBase', v => (state.dropBase = v));
    seg('#segMetric', v => (state.dropMetric = v));
    seg('#segWho', v => (state.instWho = v));
    seg('#segDays', v => (state.instDays = +v));
    seg('#segMacdType', v => (state.macdType = v));
    seg('#segMacdWithin', v => (state.macdWithin = +v));
    seg('#segMacdSort', v => { state.macdSort = v; state.sortKey = null; });
    seg('#segDivWithin', v => (state.divWithin = +v));
    seg('#segDivType', v => (state.divType = v));
    seg('#segDivSort', v => { state.divSort = v; state.sortKey = null; });
    const chk = (id, key) => $(id).addEventListener('change', e => { state[key] = e.target.checked; update(); });
    chk('#optInstBelow', 'instBelow');
    chk('#optMacdStill', 'macdStill');
    chk('#optMacdLow', 'macdLow');
    chk('#optAbove', 'stillAbove');
    chk('#optUpSlope', 'upSlope');
    chk('#optUpVol', 'upVol');
    chk('#optBull', 'bullOnly');
    chk('#optDivAnn', 'divAnnOnly');
    chk('#optDivCanBuy', 'divCanBuy');
    for (const id of Object.values(COMBO_KEY)) chk('#' + id, id);
    for (const id of NUM_CTLS) {
      $('#' + id).addEventListener('change', e => { state[id] = +e.target.value; update(); });
    }
    $('#grpChecks').addEventListener('change', e => {
      const g = e.target.dataset.grp;
      if (!g) return;
      if (e.target.checked) state.groups.add(g);
      else if (state.groups.size > 1) state.groups.delete(g);
      state.industries = allIndustries();
      state.subs.clear();
      state.subMore = false;
      update();
    });
    $('#cbDropBase').addEventListener('change', e => { state.cbDropBase = e.target.value; update(); });
    seg('#segComboMatch', v => (state.comboMatch = v));
    chk('#optBelow', 'stillBelow');
    chk('#optSlope', 'slopeDown');
    chk('#optVol', 'volBreak');
    chk('#optDip', 'dipOnly');
    chk('#optCeleb', 'celebOnly');
    chk('#optHit', 'onlyHit');
    $('#minVol').addEventListener('change', e => { state.minVol = +e.target.value; update(); });
    $('#thr').addEventListener('input', e => { state.threshold = +e.target.value; update(); });
    $('#btnCsv').addEventListener('click', exportCsv);
    $('#indAll').addEventListener('click', e => { e.preventDefault(); state.industries = allIndustries(); state.subs.clear(); update(); });
    $('#indChips').addEventListener('click', e => {
      const b = e.target.closest('.chip');
      if (!b) return;
      const id = b.dataset.ind;
      if (state.industries.size === visibleCodes().length) state.industries = new Set([id]);
      else if (state.industries.has(id)) state.industries.delete(id);
      else state.industries.add(id);
      if (!state.industries.size) state.industries = allIndustries();
      state.subs.clear();
      state.subMore = false;
      update();
    });
    $('#subClear').addEventListener('click', e => { e.preventDefault(); state.subs.clear(); update(); });
    $('#subChips').addEventListener('click', e => {
      if (e.target.closest('#subMore')) { e.preventDefault(); state.subMore = !state.subMore; renderSubChips(); return; }
      const b = e.target.closest('.chip.sub');
      if (!b) return;
      const k = b.dataset.sub;
      if (state.subs.has(k)) state.subs.delete(k); else state.subs.add(k);
      update();
    });
    $('#breadth').addEventListener('click', e => {
      const r = e.target.closest('.brow');
      if (!r) return;
      const id = r.dataset.ind;
      const solo = state.industries.size === 1 && state.industries.has(id);
      state.industries = solo ? allIndustries() : new Set([id]);
      state.subs.clear();
      update();
    });
    $('#tableWrap').addEventListener('click', e => {
      const th = e.target.closest('th');
      if (th) {
        const k = th.dataset.k;
        if (state.sortKey === k) state.sortDir *= -1; else { state.sortKey = k; state.sortDir = 1; }
        update();
        return;
      }
      if (e.target.closest('a')) return;
      const tr = e.target.closest('tr[data-code]');
      if (tr) openDrawer(tr.dataset.code);
    });
    $('#celebs').addEventListener('click', e => {
      const card = e.target.closest('[data-person]');
      if (card) {
        state.openCeleb = state.openCeleb === card.dataset.person ? null : card.dataset.person;
        renderCelebs();
        if (state.openCeleb) $('#celebDetail').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }
      const w = e.target.closest('.w');
      if (w) { openDrawer(w.dataset.code); return; }
      const p = e.target.closest('[data-preset]');
      if (p && PEOPLE[p.dataset.preset]) {
        const { weeks, ...preset } = PEOPLE[p.dataset.preset].preset;
        Object.assign(state, preset);
        if (weeks) { state.breakDays = weeks * 5; state.breakMa = 20; }
        state.industries = allIndustries();
        state.subs.clear();
        state.sortKey = null;
        setView('stock');
        update();
        document.querySelector('#stockView .controls').scrollIntoView({ behavior: 'smooth' });
      }
    });
    $('#backdrop').addEventListener('click', closeDrawer);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });
  }

  renderMarket();
  renderCelebs();
  bind();
  bindEtf();
  bindTrend();
  update();
  setView(etfState.view);
})();
