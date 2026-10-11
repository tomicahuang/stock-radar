(function () {
  'use strict';

  const DATA = window.STOCK_DATA;
  const CELEB = window.CELEB || { people: [], mentions: {} };
  const IND = {
    '24': '半導體業', '25': '電腦及週邊設備業', '26': '光電業', '27': '通信網路業',
    '28': '電子零組件業', '29': '電子通路業', '30': '資訊服務業', '31': '其他電子業'
  };
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
    weeks: 2,
    stillBelow: true,
    slopeDown: false,
    volBreak: false,
    dipOnly: false,
    minVol: 200,
    industries: new Set(Object.keys(IND)),
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
    instTop: false,
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
    cbBreakWeeks: 4,
    comboMatch: 'score',
    cbTop: 30,
    openCeleb: null,
    sortKey: null,
    sortDir: 1
  };
  const WHO = { fi: '外資', it: '投信', dl: '自營商', all: '三大法人合計', both: '外資＋投信同買' };
  const COMBO_KEY = { macd: 'cbMacd', fi: 'cbFi', drop: 'cbDrop', brk: 'cbBreak' };

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
  const stocks = DATA.stocks.map(s => {
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
      code: s.c, name: s.n, ind: s.i, indName: IND[s.i] || s.i,
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
  });
  const byCode = Object.fromEntries(stocks.map(s => [s.code, s]));
  let instLast = -1;
  for (let j = instDates.length - 1; j >= 0 && instLast < 0; j--) {
    if (stocks.some(s => s.fi && s.fi[j] != null)) instLast = j;
  }
  for (const st of stocks) {
    const j = instLast;
    st.bothBuy = j >= 0 && st.fi && st.it && st.fi[j] > 0 && st.it[j] > 0;
  }

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

  function findBreak(st, weeks) {
    const from = Math.max(1, T - weeks * 5);
    for (let t = LAST; t >= from; t--) {
      if (st.raw[t] == null) continue;
      const a = st.fc[t - 1], b = st.ma20[t - 1], x = st.fc[t], y = st.ma20[t];
      if (a == null || b == null || x == null || y == null) continue;
      if (a >= b && x < y) return t;
    }
    return -1;
  }

  function breakVolRatio(st, t) {
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
    if (extra && extra.reclaimed) t.push('<span class="tag neutral">已站回月線</span>');
    if (st.bearAlign) t.push('<span class="tag bear">空頭排列</span>');
    if (st.slopeDown) t.push('<span class="tag bear">月線下彎</span>');
    if (extra && extra.volBreak) t.push('<span class="tag bear">量增跌破</span>');
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
    if (state.mode === 'break') {
      const L = state.weeks * 5;
      const rows = [];
      for (const st of uni) {
        const bi = findBreak(st, state.weeks);
        if (bi < 0) continue;
        if (state.stillBelow && !st.below) continue;
        if (state.slopeDown && !st.slopeDown) continue;
        const vr = breakVolRatio(st, bi);
        const volBreak = vr != null && vr >= 1.5;
        if (state.volBreak && !volBreak) continue;
        if (state.dipOnly && !st.dip) continue;
        const baseIdx = Math.max(0, LAST - L);
        rows.push({
          st, breakIdx: bi, breakDate: dates[bi], daysAgo: LAST - bi, volRatio: vr, volBreak,
          reclaimed: !st.below,
          periodChg: st.fc[baseIdx] ? st.close / st.fc[baseIdx] - 1 : null
        });
      }
      return { uni, rows };
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
      if (state.instTop) rows = rows.slice(0, 50);
      rows.forEach((r, i) => (r.rank = i + 1));
      return { uni, rows, total };
    }
    if (state.mode === 'combo') {
      const keys = ['macd', 'fi', 'drop', 'brk'].filter(k => state[COMBO_KEY[k]]);
      const b = dropBaseIndex(state.cbDropBase);
      const counts = { macd: 0, fi: 0, drop: 0, brk: 0, all: 0 };
      let rows = uni.map(st => {
        const turn = findCross(st.osc, state.cbMacdWithin);
        const fiN = instLast >= 0 ? instStreak(st, 'fi').n : 0;
        const chg = st.fc[b] ? st.close / st.fc[b] - 1 : null;
        const bi = findBreak(st, state.cbBreakWeeks);
        const ok = {
          macd: turn >= 0 && st.osc[LAST] > 0,
          fi: fiN >= state.cbFiDays,
          drop: chg != null && chg <= -state.cbDropThr / 100,
          brk: bi >= 0 && st.below
        };
        for (const k of Object.keys(ok)) if (ok[k]) counts[k]++;
        const score = keys.filter(k => ok[k]).length;
        if (keys.length && score === keys.length) counts.all++;
        return { st, ok, score, need: keys.length, turn, fiN, chg, breakIdx: bi };
      });
      rows = rows.filter(r => r.need > 0 && (state.comboMatch === 'all' ? r.score === r.need : r.score > 0));
      rows.sort((a, b2) => b2.score - a.score || (a.chg ?? 0) - (b2.chg ?? 0));
      const total = rows.length;
      rows = rows.slice(0, state.cbTop);
      rows.forEach((r, i) => (r.rank = i + 1));
      return { uni, rows, total, counts, keys, baseDate: dates[b] };
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
      rows = rows.slice(0, 50);
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
      return { st, change, drawdown, metric, hit: metric != null && metric <= -state.threshold / 100, breakIdx: findBreak(st, 4) };
    }).filter(r => r.metric != null);
    rows.sort((a, b2) => a.metric - b2.metric);
    let top = rows.slice(0, 50);
    if (state.onlyHit) top = top.filter(r => r.hit);
    top.forEach((r, i) => (r.rank = i + 1));
    return { uni, rows: top, allHits: rows.filter(r => r.hit).length, baseDate: dates[b] };
  }

  // ------------------------------------------------------------------ table
  const COLS_BREAK = [
    { k: 'name', t: '股票', l: true, v: r => r.st.code, h: r => `<span class="code">${r.st.code}</span><span class="name">${esc(r.st.name)}</span>` },
    { k: 'ind', t: '產業', l: true, v: r => r.st.indName + (r.st.sub ? r.st.sub.label : ''), h: r => indCell(r.st) },
    { k: 'close', t: '收盤', v: r => r.st.close, h: r => fmtP(r.st.close) },
    { k: 'day', t: '日漲跌', v: r => r.st.dayChg, h: r => `<span class="${cls(r.st.dayChg)}">${fmtPct(r.st.dayChg)}</span>` },
    { k: 'ma20', t: '月線', v: r => r.st.ma20[LAST], h: r => fmtP(r.st.ma20[LAST]) },
    { k: 'bias', t: '月線乖離', v: r => r.st.bias, h: r => `<span class="${cls(r.st.bias)}">${fmtPct(r.st.bias)}</span>` },
    { k: 'bd', t: '跌破日', v: r => r.breakIdx, h: r => md(r.breakDate) },
    { k: 'ago', t: '距今(日)', v: r => r.daysAgo, h: r => r.daysAgo },
    { k: 'pc', t: '期間漲跌', v: r => r.periodChg, h: r => `<span class="${cls(r.periodChg)}">${fmtPct(r.periodChg)}</span>` },
    { k: 'vr', t: '破線量比', v: r => r.volRatio, h: r => (r.volRatio == null ? '–' : r.volRatio.toFixed(2) + 'x') },
    { k: 'rsi', t: 'RSI14', v: r => r.st.rsiNow, h: r => (r.st.rsiNow == null ? '–' : r.st.rsiNow.toFixed(1)) },
    { k: 'kd', t: 'K / D', v: r => r.st.kNow, h: r => (r.st.kNow == null ? '–' : `${r.st.kNow.toFixed(0)} / ${r.st.dNow.toFixed(0)}`) },
    { k: 'vol', t: '20日均量', v: r => r.st.vol20, h: r => fmtInt(r.st.vol20) },
    { k: 'sig', t: '技術訊號', l: true, v: r => (r.st.dip ? 1 : 0), h: r => signalTags(r.st, r) },
    { k: 'celeb', t: '名人', l: true, v: r => r.st.mentions.length, h: r => celebBadges(r.st) },
    { k: 'lnk', t: '連結', l: true, v: () => 0, h: r => `<span class="links">${links(r.st.code)}</span>` }
  ];

  const COLS_DROP = [
    { k: 'rank', t: '#', v: r => r.rank, h: r => `<span class="rank">${r.rank}</span>` },
    COLS_BREAK[0], COLS_BREAK[1], COLS_BREAK[2], COLS_BREAK[3],
    { k: 'chg', t: '區間跌幅', v: r => r.change, h: r => `<span class="${cls(r.change)}">${fmtPct(r.change)}</span>` },
    { k: 'dd', t: '高點回撤', v: r => r.drawdown, h: r => `<span class="${cls(r.drawdown)}">${fmtPct(r.drawdown)}</span>` },
    COLS_BREAK[4], COLS_BREAK[5],
    { k: 'bd', t: '4週內跌破月線', v: r => r.breakIdx, h: r => (r.breakIdx >= 0 ? md(dates[r.breakIdx]) : '<span class="flat">–</span>') },
    COLS_BREAK[10], COLS_BREAK[11], COLS_BREAK[12],
    { k: 'sig', t: '技術訊號', l: true, v: r => (r.st.dip ? 1 : 0), h: r => signalTags(r.st, { reclaimed: false }) },
    COLS_BREAK[14], COLS_BREAK[15]
  ];

  const BK = Object.fromEntries(COLS_BREAK.map(c => [c.k, c]));
  const fmtLots = v => (v == null ? '–' : (v > 0 ? '+' : '') + Math.round(v).toLocaleString('zh-TW'));
  const fmtM = v => (v == null ? '–' : Math.abs(v) >= 100 ? v.toFixed(1) : v.toFixed(2));
  const lotsCell = v => `<span class="${cls(v)}">${fmtLots(v)}</span>`;
  const RANK = COLS_DROP[0];
  const SIG = { k: 'sig', t: '技術訊號', l: true, v: r => (r.st.dip ? 1 : 0), h: r => signalTags(r.st, { reclaimed: false }) };

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
  const COLS_COMBO = [
    RANK, BK.name, BK.ind, BK.close, BK.day,
    { k: 'score', t: '符合條件', v: r => r.score, h: r => `<b class="${r.score === r.need ? 'up' : ''}">${r.score} / ${r.need}</b>` },
    { k: 'cm', t: 'MACD 翻正', v: r => (r.ok.macd ? -r.turn : null), h: r => hitCell(r.ok.macd, r.turn >= 0 ? md(dates[r.turn]) : '–') },
    { k: 'cf', t: '外資連買', v: r => r.fiN, h: r => hitCell(r.ok.fi, r.fiN + ' 天') },
    { k: 'cd', t: '月跌幅', v: r => r.chg, h: r => hitCell(r.ok.drop, fmtPct(r.chg)) },
    { k: 'cb', t: '跌破月線', v: r => (r.ok.brk ? -r.breakIdx : null), h: r => hitCell(r.ok.brk, r.breakIdx >= 0 ? md(dates[r.breakIdx]) + (r.st.below ? '' : '（已站回）') : '–') },
    BK.bias, BK.rsi, BK.vol, SIG, BK.celeb, BK.lnk
  ];

  const colsFor = mode => ({ break: COLS_BREAK, drop: COLS_DROP, inst: COLS_INST, macd: COLS_MACD, combo: COLS_COMBO }[mode]);

  function comboLabels() {
    return {
      macd: `MACD 翻正（${state.cbMacdWithin === 1 ? '今日' : state.cbMacdWithin + ' 日內'}）`,
      fi: `外資連買 ≥ ${state.cbFiDays} 天`,
      drop: `${state.cbDropBase === 'month' ? '本月' : '近 20 日'}跌幅 ≥ ${state.cbDropThr}%`,
      brk: `${state.cbBreakWeeks} 週內跌破月線`
    };
  }

  function renderComboStats(res) {
    const L = comboLabels();
    const items = ['macd', 'fi', 'drop', 'brk'].map(k => {
      const on = res.keys.includes(k);
      return `<span class="cstat ${on ? '' : 'off'}">${L[k]} <b>${res.counts[k]}</b> 檔</span>`;
    });
    items.push(`<span class="cstat all">勾選條件全部符合 <b>${res.keys.length ? res.counts.all : 0}</b> 檔</span>`);
    $('#comboStats').innerHTML = items.join('');
  }

  function tableTitle(res, n) {
    if (state.mode === 'break') return `跌破月線（${state.weeks} 週內）：${n} 檔`;
    if (state.mode === 'drop') {
      const lbl = state.dropBase === 'month' ? `本月（基準 ${md(res.baseDate)} 收盤）` : `近 20 交易日（基準 ${md(res.baseDate)}）`;
      const m = state.dropMetric === 'change' ? '區間跌幅' : '高點回撤';
      return `${lbl}${m}排行：前 ${n} 名，達 ${state.threshold}% 門檻 ${res.allHits} 檔`;
    }
    if (state.mode === 'inst') {
      if (instLast < 0) return '法人連續買超：尚無法人資料';
      const shown = n < res.total ? `，顯示前 ${n} 名` : '';
      return `${WHO[state.instWho]}連續買超 ≥ ${state.instDays} 天：${res.total} 檔${shown}（法人資料至 ${md(instDates[instLast])}）`;
    }
    if (state.mode === 'combo') {
      if (!res.keys.length) return '多條件組合：請至少勾選一個條件';
      const L = comboLabels();
      const conds = res.keys.map(k => L[k]).join(' ＋ ');
      const how = state.comboMatch === 'all' ? '全部符合' : '至少符合一項';
      return `多條件組合【${conds}】${how}：${res.total} 檔，依符合數取前 ${n} 名`;
    }
    const def = state.macdType === 'osc' ? '柱狀體翻紅' : 'DIF 突破 0 軸';
    const within = state.macdWithin === 1 ? '今日' : `${state.macdWithin} 日內`;
    const sort = { strength: '柱狀體強度', recent: '最新翻正', volume: '成交量' }[state.macdSort];
    return `MACD ${def}（${within}）：符合 ${res.total} 檔，依${sort}取前 ${n} 名`;
  }

  function renderTable(res) {
    const cols = colsFor(state.mode);
    let rows = res.rows.slice();
    const key = state.sortKey || (state.mode === 'break' ? 'bias' : 'rank');
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
      break: `${state.weeks} 週內跌破月線`,
      drop: '排行檔數',
      inst: `${WHO[state.instWho]}連買 ≥ ${state.instDays} 天`,
      macd: `${state.macdWithin === 1 ? '今日' : state.macdWithin + ' 日內'} MACD 翻正`,
      combo: state.comboMatch === 'all' ? '勾選條件全部符合' : '至少符合一項條件'
    }[state.mode];
    const hitN = res.total != null ? res.total : res.rows.length;
    const k = [
      { lbl: '觀察母體（上市電子）', val: uni.length, sub: `均量 ≥ ${state.minVol.toLocaleString()} 張・已選 ${state.industries.size} 個產業${state.subs.size ? `・${state.subs.size} 個細產業` : ''}` },
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
    const groups = Object.keys(IND).map(id => {
      const g = uni.filter(s => s.ind === id);
      const below = g.filter(s => s.below).length;
      const hits = g.filter(s => rowCodes.has(s.code)).length;
      return { id, name: IND[id], n: g.length, below, pct: g.length ? below / g.length : 0, hits };
    }).sort((a, b) => b.pct - a.pct);
    const overall = uni.length ? uni.filter(s => s.below).length / uni.length : 0;
    const solo = state.industries.size === 1 ? [...state.industries][0] : null;
    $('#breadth').innerHTML = groups.map(g => `
      <div class="brow ${solo === g.id ? 'sel' : ''}" data-ind="${g.id}" title="點選只看${g.name}；再點一次恢復全部">
        <div class="nm">${g.name}</div>
        <div class="bar"><i style="width:${(g.pct * 100).toFixed(1)}%"></i><b style="left:0;width:${(overall * 100).toFixed(1)}%"></b></div>
        <div class="num"><strong>${(g.pct * 100).toFixed(0)}%</strong>（${g.below}/${g.n}）・入選 ${g.hits}</div>
      </div>`).join('') +
      `<p class="hint">綠條 = 該產業收盤在月線下的比例；金線 = 全體電子股平均 ${(overall * 100).toFixed(1)}%。</p>`;
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
        <div class="sub">${basis == null ? '' : `<span class="${cls(basis)}">${basis >= 0 ? '正' : '逆'}價差 ${Math.abs(basis).toFixed(0)} 點</span>`}${night ? '・' + night : ''}</div>
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
      .filter(([code, arr]) => arr.some(m => m.w === p.id) && byCode[code])
      .map(([code]) => byCode[code])
      .sort((a, b) => (a.bias ?? 0) - (b.bias ?? 0));
  }

  function renderCelebs() {
    const people = CELEB.people || [];
    $('#celebList').innerHTML = people.map(p => {
      const latest = (p.posts.find(x => /^\d{4}-\d{2}-\d{2}$/.test(x.date)) || {}).date;
      const open = state.openCeleb === p.id;
      return `
        <button class="pcard ${p.id} ${open ? 'open' : ''}" data-person="${p.id}" aria-expanded="${open}">
          <div class="avatar">${p.badge}</div>
          <div class="pc-main">
            <div class="pc-name">${p.name} <span class="alias">${p.alias}</span></div>
            <div class="pc-style">${esc(p.style)}</div>
            <div class="pc-meta">${p.posts.length} 則發表・最新 ${latest ? md(latest) : '–'}・提及上市電子股 ${watchList(p).length} 檔</div>
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
  function chartSVG(st, breakIdx) {
    const n = Math.min(65, T), s0 = T - n;
    const W = 820, padL = 10, padR = 62, top = 14, priceH = 260, volTop = 290, volH = 70;
    const mTop = volTop + volH + 22, mH = 80, H = mTop + mH + 26;
    const cw = (W - padL - padR) / n;
    let hi = -Infinity, lo = Infinity, vmax = 0;
    for (let i = s0; i < T; i++) {
      for (const x of [st.h[i], st.l[i], st.ma20[i], st.ma60[i], st.ma5[i]]) {
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
    g += line(st.ma60, 'var(--ma60)', 1.2) + line(st.ma5, 'var(--ma5)', 1.2) + line(st.ma20, 'var(--ma20)', 2.2);
    if (breakIdx >= s0) {
      const x = X(breakIdx), y = Y(st.h[breakIdx]) - 8;
      g += `<path d="M${x - 6},${y - 10} L${x + 6},${y - 10} L${x},${y} Z" style="fill:var(--mark)"/>`;
      g += `<text x="${x}" y="${y - 14}" style="fill:var(--mark)" font-size="11" text-anchor="middle">跌破月線</text>`;
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
    if (!st) return;
    const bi = findBreak(st, 4);
    const notes = st.mentions.map(m => `<li><span class="badge ${m.w}">${PEOPLE[m.w] ? PEOPLE[m.w].badge : ''}</span>${esc((PEOPLE[m.w] || {}).name || '')}：${esc(m.t)}</li>`).join('');
    const stats = [
      ['月線 (MA20)', fmtP(st.ma20[LAST])], ['月線乖離', `<span class="${cls(st.bias)}">${fmtPct(st.bias)}</span>`],
      ['MA5 / MA10', `${fmtP(st.ma5[LAST])} / ${fmtP(st.ma10[LAST])}`], ['季線 (MA60)', fmtP(st.ma60[LAST])],
      ['RSI(14)', st.rsiNow == null ? '–' : st.rsiNow.toFixed(1)], ['K / D', st.kNow == null ? '–' : `${st.kNow.toFixed(1)} / ${st.dNow.toFixed(1)}`],
      ['20 日均量', fmtInt(st.vol20) + ' 張'], ['4 週內跌破月線', bi >= 0 ? `${dates[bi]}（${LAST - bi} 日前）` : '無'],
      ['MACD DIF / DEA', `${fmtM(st.dif[LAST])} / ${fmtM(st.dea[LAST])}`], ['OSC 柱', `<span class="${cls(st.osc[LAST])}">${fmtM(st.osc[LAST])}</span>`],
      ['外資連買', instLast >= 0 ? instStreak(st, 'fi').n + ' 天' : '–'], ['投信連買', instLast >= 0 ? instStreak(st, 'it').n + ' 天' : '–']
    ];
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
      <div>${signalTags(st, { reclaimed: bi >= 0 && !st.below })}</div>
      ${chartSVG(st, bi)}
      <div class="chart-legend">
        <span><i style="background:var(--ma5)"></i>MA5</span>
        <span><i style="background:var(--ma20);height:4px"></i>月線 MA20</span>
        <span><i style="background:var(--ma60)"></i>季線 MA60</span>
        <span><i style="background:var(--dif)"></i>DIF</span>
        <span><i style="background:var(--dea)"></i>DEA</span>
        <span>K 棒：紅漲綠跌（已還原除權息）</span>
      </div>
      <div class="stats">${stats.map(([a, b]) => `<div class="stat"><div class="lbl">${a}</div><div class="val">${b}</div></div>`).join('')}</div>
      ${chainLines(st)}
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
    a.download = `electronics_${state.mode}_${dates[LAST]}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ------------------------------------------------------------------ controls
  function renderIndustryChips() {
    $('#indChips').innerHTML = Object.entries(IND).map(([id, n]) => {
      const cnt = stocks.filter(s => s.ind === id).length;
      return `<button class="chip ${state.industries.has(id) ? 'on' : ''}" data-ind="${id}">${n} <small>${cnt}</small></button>`;
    }).join('');
  }

  function renderSubChips() {
    const box = $('#subChips');
    if (!SUB) { $('#subRow').classList.add('hidden'); return; }
    const allInd = state.industries.size === Object.keys(IND).length;
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
    $$('.tab').forEach(b => b.classList.toggle('active', b.dataset.mode === state.mode));
    $('#ctlBreak').classList.toggle('hidden', state.mode !== 'break');
    $('#ctlDrop').classList.toggle('hidden', state.mode !== 'drop');
    $('#ctlInst').classList.toggle('hidden', state.mode !== 'inst');
    $('#ctlMacd').classList.toggle('hidden', state.mode !== 'macd');
    $('#ctlCombo').classList.toggle('hidden', state.mode !== 'combo');
    for (const id of ['cbMacd', 'cbFi', 'cbDrop', 'cbBreak']) $('#' + id).checked = state[id];
    for (const id of ['cbMacdWithin', 'cbFiDays', 'cbDropBase', 'cbDropThr', 'cbBreakWeeks', 'cbTop']) $('#' + id).value = String(state[id]);
    $$('#segComboMatch button').forEach(b => b.classList.toggle('on', b.dataset.v === state.comboMatch));
    $$('#segWho button').forEach(b => b.classList.toggle('on', b.dataset.v === state.instWho));
    $$('#segDays button').forEach(b => b.classList.toggle('on', +b.dataset.v === state.instDays));
    $$('#segMacdType button').forEach(b => b.classList.toggle('on', b.dataset.v === state.macdType));
    $$('#segMacdWithin button').forEach(b => b.classList.toggle('on', +b.dataset.v === state.macdWithin));
    $$('#segMacdSort button').forEach(b => b.classList.toggle('on', b.dataset.v === state.macdSort));
    $('#optInstBelow').checked = state.instBelow;
    $('#optInstTop').checked = state.instTop;
    $('#optMacdStill').checked = state.macdStill;
    $('#optMacdLow').checked = state.macdLow;
    $$('#segWeeks button').forEach(b => b.classList.toggle('on', +b.dataset.v === state.weeks));
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
    renderIndustryChips();
    renderSubChips();
  }

  function update() {
    syncControls();
    const res = computeRows();
    renderKpis(res);
    renderBreadth(res);
    renderTable(res);
  }

  function bind() {
    $$('.tab').forEach(b => b.addEventListener('click', () => {
      state.mode = b.dataset.mode; state.sortKey = null; update();
    }));
    const seg = (sel, fn) => $$(sel + ' button').forEach(b => b.addEventListener('click', () => { fn(b.dataset.v); update(); }));
    seg('#segWeeks', v => (state.weeks = +v));
    seg('#segBase', v => (state.dropBase = v));
    seg('#segMetric', v => (state.dropMetric = v));
    seg('#segWho', v => (state.instWho = v));
    seg('#segDays', v => (state.instDays = +v));
    seg('#segMacdType', v => (state.macdType = v));
    seg('#segMacdWithin', v => (state.macdWithin = +v));
    seg('#segMacdSort', v => { state.macdSort = v; state.sortKey = null; });
    const chk = (id, key) => $(id).addEventListener('change', e => { state[key] = e.target.checked; update(); });
    chk('#optInstBelow', 'instBelow');
    chk('#optInstTop', 'instTop');
    chk('#optMacdStill', 'macdStill');
    chk('#optMacdLow', 'macdLow');
    for (const id of ['cbMacd', 'cbFi', 'cbDrop', 'cbBreak']) chk('#' + id, id);
    for (const id of ['cbMacdWithin', 'cbFiDays', 'cbDropThr', 'cbBreakWeeks', 'cbTop']) {
      $('#' + id).addEventListener('change', e => { state[id] = +e.target.value; update(); });
    }
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
    $('#q').addEventListener('input', e => { state.query = e.target.value; update(); });
    $('#btnCsv').addEventListener('click', exportCsv);
    $('#indAll').addEventListener('click', e => { e.preventDefault(); state.industries = new Set(Object.keys(IND)); state.subs.clear(); update(); });
    $('#indChips').addEventListener('click', e => {
      const b = e.target.closest('.chip');
      if (!b) return;
      const id = b.dataset.ind;
      if (state.industries.size === Object.keys(IND).length) state.industries = new Set([id]);
      else if (state.industries.has(id)) state.industries.delete(id);
      else state.industries.add(id);
      if (!state.industries.size) state.industries = new Set(Object.keys(IND));
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
      state.industries = solo ? new Set(Object.keys(IND)) : new Set([id]);
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
        Object.assign(state, PEOPLE[p.dataset.preset].preset);
        state.industries = new Set(Object.keys(IND));
        state.subs.clear();
        state.sortKey = null;
        update();
        document.querySelector('.controls').scrollIntoView({ behavior: 'smooth' });
      }
    });
    $('#backdrop').addEventListener('click', closeDrawer);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });
  }

  renderMarket();
  renderCelebs();
  bind();
  update();
})();
