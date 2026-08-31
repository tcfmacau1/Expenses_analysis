/* Expenses_Analysis — 核心運算邏輯（純函式，無 DOM）
   同時供瀏覽器（window.Core）與 Node 測試（module.exports）使用。 */
(function (root) {
  'use strict';

  // ── 分類（大類鎖死十個，子類可增補）────────────────────────────
  var CATS = [
    { name: '餐飲',     subs: ['早餐', '午餐', '晚餐', '咖啡飲品', '外賣', '聚餐請客'] },
    { name: '交通',     subs: ['的士', '巴士輕軌', '加油', '停車', '車貸', '跨境關口', '機票車票'] },
    { name: '日常採買', subs: ['超市', '街市', '日用品', '藥房'] },
    { name: '居住',     subs: ['房貸租金', '水電煤', '管理費', '家居維修'] },
    { name: '保險供款', subs: ['人壽', '醫療', '車險', '其他供款'] },
    { name: '訂閱通訊', subs: ['電話費', '網費', '串流影音', '雲端軟體'] },
    { name: '個人健康', subs: ['理髮', '衣物鞋履', '門診醫療', '運動健身'] },
    { name: '娛樂社交', subs: ['電影展覽', '興趣嗜好', '購物', '禮物人情', '旅遊訂金'] },
    { name: '家庭支出', subs: ['家用現金', '學費', '補習', '書簿文具', '興趣班', '其他家庭'] },
    { name: '其他',     subs: ['未分類', '雜項'] }
  ];

  // 收入獨立成型別，絕不混入十大類
  var INCOME_CATS = [
    { name: '薪金',     subs: ['月薪', '雙糧', '津貼'] },
    { name: '花紅',     subs: ['年終', '項目獎金'] },
    { name: '投資收入', subs: ['股息', '債息', '基金分派', '資本利得'] },
    { name: '利息收入', subs: ['存款利息', '定期利息'] },
    { name: '其他收入', subs: ['兼職', '退款', '報銷回款', '雜項'] }
  ];

  // ── 雙層帳戶（現金層／信用卡層）──────────────────────────────
  var CASH = '現金';
  var CARD = '信用卡';
  var LAYERS = [CASH, CARD];
  var DEFAULT_ACCOUNTS = {};
  DEFAULT_ACCOUNTS[CASH] = [
    '現鈔', '中銀澳門', '大豐銀行', '大西洋銀行', '工銀澳門', '國際銀行',
    'MPay', '支付寶', '微信支付', '中國銀行', '廣發銀行', '中銀香港'
  ];
  DEFAULT_ACCOUNTS[CARD] = ['中銀澳門', '國際銀行', '大豐銀行', '中銀香港', '工銀澳門'];
  var UNASSIGNED = '未指定帳戶';

  var CURRENCIES = ['MOP', 'HKD', 'CNY', 'JPY', 'USD', 'EUR', 'TWD', 'KRW', 'SGD', 'THB'];
  // 預填匯率，仍可逐筆手改（以實際輸入為準）
  var DEFAULT_RATES = {
    HKD: 1.03, CNY: 1.15, USD: 8.05, EUR: 8.8,
    JPY: 0.055, TWD: 0.25, KRW: 0.006, SGD: 6.0, THB: 0.23
  };

  var ANOMALY_RATIO = 1.30;
  var ANOMALY_FLOOR = 2000;
  var BASELINE_MONTHS = 3;
  var OTHER_WARN = 0.10;

  // ── 日期 ──────────────────────────────────────────────────────
  function ymOf(d) { return String(d).slice(0, 7); }
  function dayOf(d) { return parseInt(String(d).slice(8, 10), 10); }
  function shiftYM(ym, delta) {
    var y = parseInt(ym.slice(0, 4), 10);
    var m = parseInt(ym.slice(5, 7), 10) - 1 + delta;
    y += Math.floor(m / 12);
    m = ((m % 12) + 12) % 12;
    return y + '-' + String(m + 1).padStart(2, '0');
  }
  function prevMonths(ym, k) {
    var out = [];
    for (var i = 1; i <= k; i++) out.push(shiftYM(ym, -i));
    return out;
  }
  function daysInMonth(ym) {
    return new Date(parseInt(ym.slice(0, 4), 10), parseInt(ym.slice(5, 7), 10), 0).getDate();
  }
  function todayISO(now) {
    var d = now || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
           '-' + String(d.getDate()).padStart(2, '0');
  }

  // ── 金額 ──────────────────────────────────────────────────────
  function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
  function toMOP(entry) {
    var rate = (entry.currency === 'MOP') ? 1 : Number(entry.rate || 0);
    return round2(Number(entry.amount || 0) * rate);
  }

  // ── 帳戶 ──────────────────────────────────────────────────────
  function accountsOf(state, layer) {
    var custom = (state && state.accounts && state.accounts[layer]) || null;
    if (custom && custom.length) return custom.slice();
    return DEFAULT_ACCOUNTS[layer] ? DEFAULT_ACCOUNTS[layer].slice() : [];
  }
  function acctLabel(e) {
    if (e.type === 'transfer') {
      return (e.fromPay || '') + ' · ' + (e.fromAcct || UNASSIGNED) +
             ' → ' + (e.toPay || '') + ' · ' + (e.toAcct || UNASSIGNED);
    }
    return (e.pay || CASH) + ' · ' + (e.acct || UNASSIGNED);
  }
  function isCard(e) { return e.pay === CARD; }

  // ── 篩選 ──────────────────────────────────────────────────────
  // 轉帳（type='transfer'）永遠不進支出／收入統計，它是資金搬運。
  function filterEntries(entries, opts) {
    opts = opts || {};
    var mode = opts.tripMode || 'exclude';
    return entries.filter(function (e) {
      if (opts.ym && ymOf(e.date) !== opts.ym) return false;
      if (opts.type && e.type !== opts.type) return false;
      if (!opts.type && e.type === 'transfer') return false;
      if (opts.throughDay && dayOf(e.date) > opts.throughDay) return false;
      if (opts.layer && e.pay !== opts.layer) return false;
      if (opts.acct && e.acct !== opts.acct) return false;
      if (mode === 'exclude' && e.tripId) return false;
      if (mode === 'only') {
        if (!e.tripId) return false;
        if (opts.tripId && e.tripId !== opts.tripId) return false;
      }
      return true;
    });
  }
  function sumMOP(list) {
    return round2(list.reduce(function (s, e) { return s + toMOP(e); }, 0));
  }
  function sumByCat(list) {
    var out = {};
    list.forEach(function (e) { out[e.cat] = round2((out[e.cat] || 0) + toMOP(e)); });
    return out;
  }
  function shares(sums) {
    var total = 0, k;
    for (k in sums) total += sums[k];
    var out = {};
    for (k in sums) out[k] = total > 0 ? (sums[k] / total) : 0;
    return { total: round2(total), shares: out };
  }

  // ── 對照基準（同期天數；樣本不足不下結論）────────────────────
  function monthHasExpense(entries, ym, tripMode) {
    return filterEntries(entries, { ym: ym, type: 'expense', tripMode: tripMode }).length > 0;
  }
  function baselineFor(entries, cat, ym, throughDay, tripMode) {
    tripMode = tripMode || 'exclude';
    var months = prevMonths(ym, BASELINE_MONTHS);
    var same = [], full = [], n = 0;
    months.forEach(function (m) {
      if (!monthHasExpense(entries, m, tripMode)) return;
      n++;
      var cap = Math.min(throughDay, daysInMonth(m));
      same.push(sumMOP(filterEntries(entries, { ym: m, type: 'expense', tripMode: tripMode, throughDay: cap })
        .filter(function (e) { return e.cat === cat; })));
      full.push(sumMOP(filterEntries(entries, { ym: m, type: 'expense', tripMode: tripMode })
        .filter(function (e) { return e.cat === cat; })));
    });
    return {
      n: n,
      avgSame: n ? round2(same.reduce(add, 0) / n) : null,
      avgFull: n ? round2(full.reduce(add, 0) / n) : null
    };
  }
  function add(a, b) { return a + b; }

  function anomaly(current, base) {
    if (!base || base.n < BASELINE_MONTHS) {
      return { flag: false, deltaPct: null, reason: 'n<' + BASELINE_MONTHS };
    }
    var delta = base.avgSame > 0 ? (current - base.avgSame) / base.avgSame
                                 : (current > 0 ? null : 0);
    if (base.avgFull < ANOMALY_FLOOR) return { flag: false, deltaPct: delta, reason: 'below-floor' };
    if (delta === null) return { flag: false, deltaPct: null, reason: 'no-baseline' };
    var over = delta > (ANOMALY_RATIO - 1);
    return { flag: over, deltaPct: delta, reason: over ? 'over' : 'ok' };
  }

  // ── 消費基準結餘（刷卡當下即計） ──────────────────────────────
  function balance(entries, ym) {
    var inc = sumMOP(filterEntries(entries, { ym: ym, type: 'income', tripMode: 'all' }));
    var exp = sumMOP(filterEntries(entries, { ym: ym, type: 'expense', tripMode: 'all' }));
    var net = round2(inc - exp);
    return { income: inc, expense: exp, net: net, savingRate: inc > 0 ? net / inc : null };
  }

  // ── 現金基準結餘（實際流出）────────────────────────────────────
  // 現金真正流出 = 現金層支出 ＋ 本月實際還卡的轉帳金額。
  // 還款是「現金層 → 信用卡層」的轉帳，不是消費，所以支出構成完全不受影響。
  function repayments(entries, ym) {
    return filterEntries(entries, { ym: ym, type: 'transfer', tripMode: 'all' })
      .filter(function (e) { return e.fromPay === CASH && e.toPay === CARD; });
  }
  function cashBalance(entries, ym) {
    var inc = sumMOP(filterEntries(entries, { ym: ym, type: 'income', tripMode: 'all' })
      .filter(function (e) { return e.pay !== CARD; }));
    var cashExp = sumMOP(filterEntries(entries, { ym: ym, type: 'expense', tripMode: 'all' })
      .filter(function (e) { return e.pay !== CARD; }));
    var repay = repayments(entries, ym);
    var repayTotal = sumMOP(repay);
    var byAcct = {};
    repay.forEach(function (e) {
      var k = e.toAcct || UNASSIGNED;
      byAcct[k] = round2((byAcct[k] || 0) + toMOP(e));
    });
    var rows = Object.keys(byAcct).map(function (k) { return { acct: k, amount: byAcct[k] }; })
      .sort(function (a, b) { return b.amount - a.amount; });
    return {
      income: inc, cashExpense: cashExp, repay: repayTotal, repayRows: rows,
      net: round2(inc - cashExp - repayTotal),
      savingRate: inc > 0 ? round2(inc - cashExp - repayTotal) / inc : null
    };
  }

  // ── 信用卡未還變動（不設期初，只累計起用以來）────────────────
  function cardOutstanding(entries, upToYM) {
    var charged = {}, repaid = {};
    entries.forEach(function (e) {
      if (upToYM && ymOf(e.date) > upToYM) return;
      if (e.type === 'expense' && e.pay === CARD) {
        var k = e.acct || UNASSIGNED;
        charged[k] = round2((charged[k] || 0) + toMOP(e));
      } else if (e.type === 'transfer' && e.toPay === CARD) {
        var k2 = e.toAcct || UNASSIGNED;
        repaid[k2] = round2((repaid[k2] || 0) + toMOP(e));
      }
    });
    var names = {};
    Object.keys(charged).forEach(function (k) { names[k] = 1; });
    Object.keys(repaid).forEach(function (k) { names[k] = 1; });
    var rows = Object.keys(names).map(function (k) {
      return {
        acct: k, charged: charged[k] || 0, repaid: repaid[k] || 0,
        outstanding: round2((charged[k] || 0) - (repaid[k] || 0))
      };
    }).sort(function (a, b) { return b.outstanding - a.outstanding; });
    return { rows: rows, total: round2(rows.reduce(function (s, r) { return s + r.outstanding; }, 0)) };
  }

  // 本月刷卡金額
  function cardCharged(entries, ym) {
    return sumMOP(filterEntries(entries, { ym: ym, type: 'expense', tripMode: 'all' })
      .filter(function (e) { return e.pay === CARD; }));
  }


  // ── 子類明細（點大類展開）──────────────────────────────────────
  // 預設只給佔比最前三項，其餘併成一行——超過三項就不再是「一眼看懂」。
  function subBreakdown(entries, ym, cat, throughDay, tripMode, tripId, topN) {
    topN = topN || 3;
    var list = filterEntries(entries, {
      ym: ym, type: 'expense', tripMode: tripMode || 'exclude', tripId: tripId, throughDay: throughDay
    }).filter(function (e) { return e.cat === cat; });
    var sums = {}, counts = {};
    list.forEach(function (e) {
      var k = e.sub || '未分類';
      sums[k] = round2((sums[k] || 0) + toMOP(e));
      counts[k] = (counts[k] || 0) + 1;
    });
    var total = round2(list.reduce(function (s, e) { return s + toMOP(e); }, 0));
    var all = Object.keys(sums).map(function (k) {
      return { sub: k, amount: sums[k], count: counts[k], share: total > 0 ? sums[k] / total : 0 };
    }).sort(function (a, b) { return b.amount - a.amount; });
    var top = all.slice(0, topN);
    var rest = all.slice(topN);
    return {
      cat: cat, total: total, count: list.length, all: all, top: top,
      rest: {
        items: rest.length,
        amount: round2(rest.reduce(function (s, r) { return s + r.amount; }, 0)),
        share: total > 0 ? rest.reduce(function (s, r) { return s + r.amount; }, 0) / total : 0
      }
    };
  }


  // ── 月度趨勢 ──────────────────────────────────────────────────
  // 看的是當月的 1–N 日對比往月的 1–N 日；拿殘缺的本月去比完整的往月是騙自己。
  function monthlySeries(entries, ym, months, tripMode, throughDay) {
    months = months || 6;
    tripMode = tripMode || 'exclude';
    var rows = [];
    for (var i = months - 1; i >= 0; i--) {
      var m = shiftYM(ym, -i);
      var cap = throughDay ? Math.min(throughDay, daysInMonth(m)) : daysInMonth(m);
      var exp = sumMOP(filterEntries(entries, { ym: m, type: 'expense', tripMode: tripMode, throughDay: cap }));
      var inc = sumMOP(filterEntries(entries, { ym: m, type: 'income', tripMode: 'all', throughDay: cap }));
      var any = filterEntries(entries, { ym: m, tripMode: 'all', throughDay: cap }).length > 0;
      rows.push({ ym: m, expense: exp, income: inc, net: round2(inc - exp), has: any, isCurrent: m === ym });
    }
    var withData = rows.filter(function (r) { return r.has; });
    var max = 0;
    rows.forEach(function (r) { max = Math.max(max, r.expense, r.income); });
    var avgExp = withData.length
      ? round2(withData.reduce(function (s, r) { return s + r.expense; }, 0) / withData.length)
      : 0;
    return { rows: rows, max: max, avgExpense: avgExp, monthsWithData: withData.length, throughDay: throughDay || null };
  }

  // ── 偏差：本月同期 vs 近三月同期均值 ──────────────────────────
  // 只在樣本滿三個月時給值；不足就回 null，畫面別畫。
  function deviationRows(entries, ym, throughDay, tripMode) {
    var rep = monthReport(entries, ym, throughDay, tripMode || 'exclude');
    var rows = rep.rows.filter(function (r) {
      return r.n >= BASELINE_MONTHS && r.deltaPct !== null;
    }).map(function (r) {
      return {
        cat: r.cat, amount: r.amount, avgSame: r.avgSame,
        diff: round2(r.amount - r.avgSame), deltaPct: r.deltaPct,
        flag: r.flag, muted: r.reason === 'below-floor'
      };
    });
    rows.sort(function (a, b) { return Math.abs(b.deltaPct) - Math.abs(a.deltaPct); });
    var maxAbs = rows.reduce(function (m, r) { return Math.max(m, Math.abs(r.deltaPct)); }, 0);
    return { rows: rows, maxAbs: maxAbs, ready: rows.length > 0 };
  }

  // ── 行程 ──────────────────────────────────────────────────────
  function tripForDate(trips, date) {
    var hit = (trips || []).filter(function (t) { return date >= t.start && date <= t.end; });
    return hit.length ? hit[0].id : null;
  }

  // ── 使用頻率記憶 ──────────────────────────────────────────────
  function bumpFreq(freq, path) {
    var node = freq;
    for (var i = 0; i < path.length - 1; i++) {
      if (!node[path[i]] || typeof node[path[i]] !== 'object') node[path[i]] = {};
      node = node[path[i]];
    }
    var last = path[path.length - 1];
    node[last] = (node[last] || 0) + 1;
    return freq;
  }
  function sortByFreq(items, counts) {
    counts = counts || {};
    return items.slice().sort(function (a, b) {
      var d = (counts[b] || 0) - (counts[a] || 0);
      if (d !== 0) return d;
      return items.indexOf(a) - items.indexOf(b);
    });
  }
  function topOf(items, counts) {
    var s = sortByFreq(items, counts);
    return s.length ? s[0] : null;
  }

  // ── CSV ───────────────────────────────────────────────────────
  function csvCell(v) {
    var s = (v === null || v === undefined) ? '' : String(v);
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  function toCSV(entries, trips) {
    var tripName = {};
    (trips || []).forEach(function (t) { tripName[t.id] = t.name; });
    var head = ['日期', '型別', '大類', '子類', '帳戶層', '帳戶', '轉出層', '轉出帳戶',
                '幣別', '原幣金額', '匯率', '澳門幣金額', '行程', '店家', '備註'];
    var rows = entries.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; })
      .map(function (e) {
        var isT = e.type === 'transfer';
        var kind = e.type === 'income' ? '收入' : (isT ? '轉帳' : '支出');
        return [
          e.date, kind,
          isT ? '' : e.cat, isT ? '' : e.sub,
          isT ? e.toPay : e.pay, isT ? e.toAcct : e.acct,
          isT ? e.fromPay : '', isT ? e.fromAcct : '',
          e.currency, e.amount, e.currency === 'MOP' ? 1 : e.rate, toMOP(e),
          e.tripId ? (tripName[e.tripId] || e.tripId) : '',
          e.merchant || '', e.note || ''
        ].map(csvCell).join(',');
      });
    return '\ufeff' + [head.map(csvCell).join(',')].concat(rows).join('\r\n');
  }


  // ── CSV 匯入 ──────────────────────────────────────────────────
  // 進來的檔案不受控制：Excel 會改日期格式、加千分位、動欄位順序。
  // 因此一律以「欄位名稱」對應，而非欄位位置；金額一律由原幣×匯率重算，
  // 絕不採用匯出檔裡的「澳門幣金額」（那是顯示值，不是儲存值）。
  function parseCSV(text) {
    if (!text) return [];
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    var rows = [], row = [], cur = '', i = 0, inQ = false;
    while (i < text.length) {
      var c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') { cur += '"'; i += 2; continue; }
          inQ = false; i++; continue;
        }
        cur += c; i++; continue;
      }
      if (c === '"') { inQ = true; i++; continue; }
      if (c === ',') { row.push(cur); cur = ''; i++; continue; }
      if (c === '\r') { i++; continue; }
      if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; i++; continue; }
      cur += c; i++;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(function (r) {
      return r.some(function (x) { return String(x).trim() !== ''; });
    });
  }

  function normNum(v) {
    if (v === null || v === undefined) return NaN;
    var s = String(v).replace(/[,\s\u00A0]/g, '').replace(/^MOP/i, '');
    if (s === '') return NaN;
    return Number(s);
  }

  // 日期：年在前的一律接受；年在後（Excel 常見）要先看整個檔案定順序，不逐列猜。
  function iso(y, mo, d) {
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return String(y) + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }

  // Excel 序號（1900 曆制）。25569 = 1970-01-01
  function fromSerial(n) {
    var dt = new Date(Date.UTC(1970, 0, 1) + (n - 25569) * 86400000);
    if (isNaN(dt.getTime())) return null;
    return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }

  // 拆成 {kind, a, b, c}；kind: 'ymd' | 'tail' | 'serial' | null
  function splitDate(v) {
    var s = String(v == null ? '' : v).trim();
    if (!s) return null;
    var cn = s.match(/^(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?$/);
    if (cn) return { kind: 'ymd', a: +cn[1], b: +cn[2], c: +cn[3] };
    var y1 = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/);
    if (y1) return { kind: 'ymd', a: +y1[1], b: +y1[2], c: +y1[3] };
    var y2 = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/);
    if (y2) return { kind: 'tail', a: +y2[1], b: +y2[2], c: +y2[3] };
    if (/^\d{5}$/.test(s)) {
      var n = parseInt(s, 10);
      if (n >= 20000 && n <= 80000) return { kind: 'serial', a: n };
    }
    return null;
  }

  // 掃描全檔決定年在後的順序。任何一列的首欄 > 12 就釘死日／月／年，反之亦然。
  // 兩種證據都出現＝檔案本身矛盾；一種都沒有＝真的有歧義，兩者都不猜。
  function detectDateOrder(values) {
    var dmy = 0, mdy = 0, tail = 0;
    (values || []).forEach(function (v) {
      var p = splitDate(v);
      if (!p || p.kind !== 'tail') return;
      tail++;
      if (p.a > 12) dmy++;
      if (p.b > 12) mdy++;
    });
    if (!tail) return 'none';
    if (dmy && mdy) return 'conflict';
    if (dmy) return 'dmy';
    if (mdy) return 'mdy';
    return 'ambiguous';
  }

  function normDate(v, order) {
    var p = splitDate(v);
    if (!p) return null;
    if (p.kind === 'ymd') return iso(p.a, p.b, p.c);
    if (p.kind === 'serial') return fromSerial(p.a);
    if (order === 'dmy') return iso(p.c, p.b, p.a);
    if (order === 'mdy') return iso(p.c, p.a, p.b);
    return null;   // 歧義或矛盾：交給呼叫端報錯
  }

  var KIND_MAP = { '支出': 'expense', '收入': 'income', '轉帳': 'transfer',
                   'expense': 'expense', 'income': 'income', 'transfer': 'transfer' };

  function dedupKey(e) {
    return [e.type, e.date, e.amount, e.currency, e.cat || '', e.sub || '',
            e.pay || '', e.acct || '', e.fromPay || '', e.fromAcct || '',
            e.toPay || '', e.toAcct || ''].join('|');
  }

  // 回傳一份「計畫」而不直接改狀態，讓使用者先看報告再決定。
  function planCSVImport(text, state) {
    var out = { entries: [], errors: [], dupes: 0,
                newSubs: {}, newAccounts: {}, newTrips: [], total: 0 };
    var rows = parseCSV(text);
    if (!rows.length) { out.errors.push({ line: 0, msg: '檔案是空的' }); return out; }

    var head = rows[0].map(function (h) { return String(h).trim(); });
    var idx = {};
    head.forEach(function (h, i) { idx[h] = i; });
    ['日期', '型別', '原幣金額'].forEach(function (need) {
      if (!(need in idx)) out.errors.push({ line: 1, msg: '缺少必要欄位「' + need + '」' });
    });
    if (out.errors.length) return out;

    function cell(r, name) {
      var i = idx[name];
      return (i === undefined || r[i] === undefined) ? '' : String(r[i]).trim();
    }

    var catNames = CATS.map(function (c) { return c.name; });
    var incNames = INCOME_CATS.map(function (c) { return c.name; });
    var existing = {};
    ((state && state.entries) || []).forEach(function (e) { existing[dedupKey(e)] = 1; });
    var knownAcct = {};
    LAYERS.forEach(function (L) {
      knownAcct[L] = {};
      accountsOf(state, L).forEach(function (a) { knownAcct[L][a] = 1; });
    });
    var tripByName = {};
    ((state && state.trips) || []).forEach(function (t) { tripByName[t.name] = t.id; });
    var pendingTrips = {};

    var rawDates = [];
    for (var q = 1; q < rows.length; q++) rawDates.push(cell(rows[q], '日期'));
    var dateOrder = detectDateOrder(rawDates);
    out.dateOrder = dateOrder;

    for (var r = 1; r < rows.length; r++) {
      var line = r + 1;
      var row = rows[r];
      out.total++;

      var raw = cell(row, '日期');
      var date = normDate(raw, dateOrder);
      if (!date) {
        var why = '日期看不懂：' + raw;
        if (splitDate(raw) && splitDate(raw).kind === 'tail') {
          why = dateOrder === 'conflict'
            ? ('日期順序矛盾：' + raw + '（同一個檔裡既有日／月／年也有月／日／年）')
            : ('日期分不出日月：' + raw + '（整個檔都在 12 以內，無法判斷順序）');
        }
        out.errors.push({ line: line, msg: why });
        continue;
      }

      var type = KIND_MAP[cell(row, '型別')];
      if (!type) { out.errors.push({ line: line, msg: '型別要是 支出／收入／轉帳' }); continue; }

      var amount = normNum(cell(row, '原幣金額'));
      if (!(amount > 0)) { out.errors.push({ line: line, msg: '金額無效：' + cell(row, '原幣金額') }); continue; }
      amount = round2(amount);

      var currency = cell(row, '幣別') || 'MOP';
      if (CURRENCIES.indexOf(currency) < 0) {
        out.errors.push({ line: line, msg: '不支援的幣別：' + currency }); continue;
      }
      var rate = 1;
      if (currency !== 'MOP') {
        rate = normNum(cell(row, '匯率'));
        if (!(rate > 0)) {
          // 沒有匯率就用澳門幣金額回推，仍然不直接採用它當金額
          var mop = normNum(cell(row, '澳門幣金額'));
          rate = (mop > 0) ? round2(mop / amount) : NaN;
        }
        if (!(rate > 0)) { out.errors.push({ line: line, msg: '外幣缺少匯率' }); continue; }
      }

      var e = {
        id: 'csv' + line + '_' + Math.random().toString(36).slice(2, 7),
        type: type, date: date, amount: amount, currency: currency, rate: rate,
        merchant: cell(row, '店家'), note: cell(row, '備註'),
        createdAt: new Date().toISOString()
      };

      var layer = cell(row, '帳戶層') || CASH;
      if (LAYERS.indexOf(layer) < 0) { out.errors.push({ line: line, msg: '帳戶層要是 現金 或 信用卡' }); continue; }
      var acct = cell(row, '帳戶') || UNASSIGNED;

      if (type === 'transfer') {
        var fromLayer = cell(row, '轉出層') || CASH;
        if (LAYERS.indexOf(fromLayer) < 0) { out.errors.push({ line: line, msg: '轉出層要是 現金 或 信用卡' }); continue; }
        var fromAcct = cell(row, '轉出帳戶') || UNASSIGNED;
        if (fromLayer === layer && fromAcct === acct) {
          out.errors.push({ line: line, msg: '轉出與轉入是同一個帳戶' }); continue;
        }
        e.fromPay = fromLayer; e.fromAcct = fromAcct;
        e.toPay = layer; e.toAcct = acct;
        e.tripId = null;
        [[fromLayer, fromAcct], [layer, acct]].forEach(function (pair) {
          noteAccount(out, knownAcct, pair[0], pair[1]);
        });
      } else {
        var cat = cell(row, '大類');
        var pool = (type === 'income') ? incNames : catNames;
        if (pool.indexOf(cat) < 0) {
          out.errors.push({ line: line, msg: '不認得的' + (type === 'income' ? '收入類別' : '大類') + '：' + (cat || '(空白)') });
          continue;
        }
        var sub = cell(row, '子類') || '未分類';
        e.cat = cat; e.sub = sub; e.pay = layer; e.acct = acct;
        var known = (type === 'income' ? INCOME_CATS : CATS)
          .filter(function (c) { return c.name === cat; })[0].subs;
        var extra = ((state && state.subs && state.subs[cat]) || []);
        if (known.indexOf(sub) < 0 && extra.indexOf(sub) < 0) {
          out.newSubs[cat] = out.newSubs[cat] || [];
          if (out.newSubs[cat].indexOf(sub) < 0) out.newSubs[cat].push(sub);
        }
        noteAccount(out, knownAcct, layer, acct);

        var tname = cell(row, '行程');
        if (tname) {
          if (tripByName[tname]) {
            e.tripId = tripByName[tname];
          } else {
            if (!pendingTrips[tname]) pendingTrips[tname] = { name: tname, start: date, end: date };
            if (date < pendingTrips[tname].start) pendingTrips[tname].start = date;
            if (date > pendingTrips[tname].end) pendingTrips[tname].end = date;
            e.__tripName = tname;
          }
        } else {
          e.tripId = null;
        }
      }

      var k = dedupKey(e);
      if (existing[k]) { out.dupes++; continue; }
      existing[k] = 1;
      out.entries.push(e);
    }

    Object.keys(pendingTrips).forEach(function (n) { out.newTrips.push(pendingTrips[n]); });
    return out;
  }

  function noteAccount(out, knownAcct, layer, acct) {
    if (acct === UNASSIGNED) return;
    if (knownAcct[layer] && knownAcct[layer][acct]) return;
    out.newAccounts[layer] = out.newAccounts[layer] || [];
    if (out.newAccounts[layer].indexOf(acct) < 0) out.newAccounts[layer].push(acct);
    if (knownAcct[layer]) knownAcct[layer][acct] = 1;
  }

  // 把計畫套用到狀態上（附加，不取代）
  function applyCSVPlan(state, plan) {
    plan.newTrips.forEach(function (t) {
      var id = 'tcsv' + Math.random().toString(36).slice(2, 8);
      state.trips.push({ id: id, name: t.name, start: t.start, end: t.end });
      plan.entries.forEach(function (e) {
        if (e.__tripName === t.name) { e.tripId = id; }
      });
    });
    Object.keys(plan.newSubs).forEach(function (cat) {
      state.subs[cat] = state.subs[cat] || [];
      plan.newSubs[cat].forEach(function (s) {
        if (state.subs[cat].indexOf(s) < 0) state.subs[cat].push(s);
      });
    });
    Object.keys(plan.newAccounts).forEach(function (L) {
      var cur = accountsOf(state, L);
      plan.newAccounts[L].forEach(function (a) { if (cur.indexOf(a) < 0) cur.push(a); });
      state.accounts[L] = cur;
    });
    plan.entries.forEach(function (e) {
      delete e.__tripName;
      if (e.tripId === undefined) e.tripId = null;
      state.entries.push(e);
    });
    return state;
  }


  // ── 匯入驗證 ──────────────────────────────────────────────────
  function validateImport(obj) {
    var errs = [];
    if (!obj || typeof obj !== 'object') { errs.push('檔案不是有效的 JSON 物件'); return errs; }
    if (!Array.isArray(obj.entries)) errs.push('缺少 entries 陣列');
    else obj.entries.forEach(function (e, i) {
      if (!e.date || !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) errs.push('第 ' + (i + 1) + ' 筆日期格式錯誤');
      if (typeof e.amount !== 'number' || !(e.amount > 0)) errs.push('第 ' + (i + 1) + ' 筆金額無效');
      if (['income', 'expense', 'transfer'].indexOf(e.type) < 0) errs.push('第 ' + (i + 1) + ' 筆型別無效');
      if (e.currency && e.currency !== 'MOP' && !(Number(e.rate) > 0)) errs.push('第 ' + (i + 1) + ' 筆缺少匯率');
      if (e.type === 'transfer' && e.fromPay === e.toPay && e.fromAcct === e.toAcct) {
        errs.push('第 ' + (i + 1) + ' 筆轉出與轉入帳戶相同');
      }
    });
    if (obj.trips && !Array.isArray(obj.trips)) errs.push('trips 必須是陣列');
    return errs;
  }

  // ── 舊資料遷移（付款方式四選一 → 雙層帳戶）────────────────────
  var LEGACY_MAP = { '現金': '現鈔', '手機支付': 'MPay', '銀行轉帳': UNASSIGNED };
  function migrate(state) {
    if (!state) return state;
    if (state.schema >= 3) return state;
    var cardName = {};
    (state.cards || []).forEach(function (c) { cardName[c.id] = c.name; });
    (state.entries || []).forEach(function (e) {
      if (!e.acct) {
        if (e.pay === CARD) {
          e.acct = (e.cardId && cardName[e.cardId]) ? cardName[e.cardId] : UNASSIGNED;
        } else if (LEGACY_MAP[e.pay]) {
          e.acct = LEGACY_MAP[e.pay]; e.pay = CASH;
        } else {
          e.pay = CASH; e.acct = UNASSIGNED;
        }
      }
      delete e.cardId;
    });
    (state.templates || []).forEach(function (t) {
      if (t.acct) return;
      if (t.pay === CARD) { t.acct = UNASSIGNED; }
      else { t.acct = LEGACY_MAP[t.pay] || UNASSIGNED; t.pay = CASH; }
    });
    state.schema = 3;
    return state;
  }

  // ── 月報 ──────────────────────────────────────────────────────
  function monthReport(entries, ym, throughDay, tripMode, tripId) {
    tripMode = tripMode || 'exclude';
    var cur = filterEntries(entries, {
      ym: ym, type: 'expense', tripMode: tripMode, tripId: tripId, throughDay: throughDay
    });
    var sums = sumByCat(cur);
    var sh = shares(sums);
    var rows = CATS.map(function (c) {
      var amount = sums[c.name] || 0;
      var base = (tripMode === 'exclude')
        ? baselineFor(entries, c.name, ym, throughDay, tripMode)
        : { n: 0, avgSame: null, avgFull: null };
      var an = anomaly(amount, base);
      return {
        cat: c.name, amount: amount, share: sh.shares[c.name] || 0,
        n: base.n, avgSame: base.avgSame, avgFull: base.avgFull,
        deltaPct: an.deltaPct, flag: an.flag, reason: an.reason
      };
    }).filter(function (r) { return r.amount > 0 || r.avgSame > 0; });
    rows.sort(function (a, b) { return b.amount - a.amount; });
    var other = rows.filter(function (r) { return r.cat === '其他'; })[0];
    return {
      total: sh.total, rows: rows, count: cur.length,
      otherOverWarn: !!(other && other.share > OTHER_WARN)
    };
  }

  // 帳戶別支出彙總（不算餘額，只看本月變動）
  function byAccount(entries, ym) {
    var out = {};
    filterEntries(entries, { ym: ym, type: 'expense', tripMode: 'all' }).forEach(function (e) {
      var k = (e.pay || CASH) + ' · ' + (e.acct || UNASSIGNED);
      out[k] = round2((out[k] || 0) + toMOP(e));
    });
    return Object.keys(out).map(function (k) { return { label: k, amount: out[k] }; })
      .sort(function (a, b) { return b.amount - a.amount; });
  }

  var api = {
    CATS: CATS, INCOME_CATS: INCOME_CATS, CURRENCIES: CURRENCIES, DEFAULT_RATES: DEFAULT_RATES,
    CASH: CASH, CARD: CARD, LAYERS: LAYERS, DEFAULT_ACCOUNTS: DEFAULT_ACCOUNTS, UNASSIGNED: UNASSIGNED,
    ANOMALY_RATIO: ANOMALY_RATIO, ANOMALY_FLOOR: ANOMALY_FLOOR,
    BASELINE_MONTHS: BASELINE_MONTHS, OTHER_WARN: OTHER_WARN,
    ymOf: ymOf, dayOf: dayOf, shiftYM: shiftYM, prevMonths: prevMonths,
    daysInMonth: daysInMonth, todayISO: todayISO,
    toMOP: toMOP, round2: round2, accountsOf: accountsOf, acctLabel: acctLabel, isCard: isCard,
    filterEntries: filterEntries, sumMOP: sumMOP, sumByCat: sumByCat, shares: shares,
    baselineFor: baselineFor, anomaly: anomaly,
    balance: balance, cashBalance: cashBalance, repayments: repayments,
    cardOutstanding: cardOutstanding, cardCharged: cardCharged,
    tripForDate: tripForDate, bumpFreq: bumpFreq, sortByFreq: sortByFreq, topOf: topOf,
    csvCell: csvCell, toCSV: toCSV, validateImport: validateImport, migrate: migrate,
    parseCSV: parseCSV, normNum: normNum, normDate: normDate,
    normDate: normDate, splitDate: splitDate, detectDateOrder: detectDateOrder,
    planCSVImport: planCSVImport, applyCSVPlan: applyCSVPlan, dedupKey: dedupKey,
    monthReport: monthReport, byAccount: byAccount, subBreakdown: subBreakdown,
    monthlySeries: monthlySeries, deviationRows: deviationRows
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Core = api;
})(typeof window !== 'undefined' ? window : globalThis);
