/* Node 測試：核心運算邏輯 */
const C = require('./core.js');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log('  ✓ ' + name); pass++; }
  catch (e) { console.log('  ✗ ' + name + '\n      ' + e.message); fail++; }
}
function eq(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error((msg || '') + ' 期望 ' + JSON.stringify(b) + '，得到 ' + JSON.stringify(a));
}
function ok(v, msg) { if (!v) throw new Error(msg || '應為 true'); }

let seq = 0;
function E(date, cat, amount, extra) {
  return Object.assign({
    id: 'e' + (++seq), type: 'expense', date, cat, sub: '未分類',
    pay: C.CASH, acct: '現鈔', currency: 'MOP', amount, rate: 1, tripId: null
  }, extra || {});
}
function T(date, amount, extra) {   // 轉帳
  return Object.assign({
    id: 't' + (++seq), type: 'transfer', date,
    fromPay: C.CASH, fromAcct: '中銀澳門', toPay: C.CARD, toAcct: '大豐銀行',
    currency: 'MOP', amount, rate: 1
  }, extra || {});
}

console.log('\n── 日期工具 ──');
t('ymOf / dayOf', () => { eq(C.ymOf('2026-08-26'), '2026-08'); eq(C.dayOf('2026-08-05'), 5); });
t('shiftYM 跨年往回', () => { eq(C.shiftYM('2026-01', -1), '2025-12'); eq(C.shiftYM('2026-01', -3), '2025-10'); });
t('shiftYM 跨年往前', () => eq(C.shiftYM('2025-11', 3), '2026-02'));
t('prevMonths 取前三月', () => eq(C.prevMonths('2026-03', 3), ['2026-02', '2026-01', '2025-12']));
t('daysInMonth 含閏年', () => { eq(C.daysInMonth('2026-02'), 28); eq(C.daysInMonth('2024-02'), 29); eq(C.daysInMonth('2026-08'), 31); });
t('todayISO 補零', () => eq(C.todayISO(new Date(2026, 0, 5)), '2026-01-05'));

console.log('\n── 金額與幣別 ──');
t('MOP 不套匯率', () => eq(C.toMOP({ currency: 'MOP', amount: 123.45, rate: 999 }), 123.45));
t('日圓折算並保留原幣', () => {
  const e = { currency: 'JPY', amount: 4800, rate: 0.055 };
  eq(C.toMOP(e), 264);
  eq(e.amount, 4800, '原幣金額不可被覆蓋');
});
t('折算四捨五入到分', () => eq(C.toMOP({ currency: 'HKD', amount: 100, rate: 1.0309 }), 103.09));
t('缺匯率時折算為 0（由驗證層擋下）', () => eq(C.toMOP({ currency: 'JPY', amount: 100 }), 0));

console.log('\n── 篩選與旅行隔離 ──');
const trips = [{ id: 't1', name: '大阪', start: '2026-08-16', end: '2026-08-23' }];
const base = [
  E('2026-08-02', '餐飲', 100), E('2026-08-05', '交通', 50),
  E('2026-08-18', '餐飲', 900, { tripId: 't1' }),
  E('2026-08-20', '娛樂社交', 600, { tripId: 't1' })
];
t('預設排除旅行消費', () => eq(C.sumMOP(C.filterEntries(base, { ym: '2026-08', type: 'expense' })), 150));
t('切換全部含旅行', () => eq(C.sumMOP(C.filterEntries(base, { ym: '2026-08', type: 'expense', tripMode: 'all' })), 1650));
t('只看某趟旅行', () => eq(C.sumMOP(C.filterEntries(base, { ym: '2026-08', type: 'expense', tripMode: 'only', tripId: 't1' })), 1500));
t('throughDay 截斷', () => eq(C.sumMOP(C.filterEntries(base, { ym: '2026-08', type: 'expense', throughDay: 3 })), 100));
t('tripForDate 命中與落空', () => { eq(C.tripForDate(trips, '2026-08-18'), 't1'); eq(C.tripForDate(trips, '2026-08-24'), null); });
t('行程邊界日含首尾', () => { eq(C.tripForDate(trips, '2026-08-16'), 't1'); eq(C.tripForDate(trips, '2026-08-23'), 't1'); });

console.log('\n── 佔比 ──');
t('sumByCat 合併同類', () => eq(C.sumByCat([E('2026-08-01', '餐飲', 10), E('2026-08-02', '餐飲', 15)]), { 餐飲: 25 }));
t('shares 相加為 1', () => {
  const s = C.shares({ 餐飲: 300, 交通: 100 });
  eq(s.total, 400); eq(s.shares['餐飲'], 0.75); eq(s.shares['交通'], 0.25);
});
t('空資料不除以零', () => eq(C.shares({}).total, 0));

console.log('\n── 對照基準：同期天數 ──');
// 5、6、7 月各有資料；8 月比對到第 10 日
const hist = [];
['2026-05', '2026-06', '2026-07'].forEach(m => {
  hist.push(E(m + '-05', '餐飲', 1000));   // 落在同期內
  hist.push(E(m + '-25', '餐飲', 4000));   // 落在同期外
});
hist.push(E('2026-08-05', '餐飲', 1200));
t('同期均值只算 1–10 日', () => {
  const b = C.baselineFor(hist, '餐飲', '2026-08', 10, 'exclude');
  eq(b.n, 3); eq(b.avgSame, 1000); eq(b.avgFull, 5000);
});
t('沒有資料的月份不計入 n', () => {
  const few = [E('2026-07-05', '餐飲', 1000), E('2026-08-05', '餐飲', 1200)];
  eq(C.baselineFor(few, '餐飲', '2026-08', 10, 'exclude').n, 1);
});
t('基準與當期同樣排除旅行', () => {
  const mixed = hist.concat([E('2026-06-06', '餐飲', 9999, { tripId: 't1' })]);
  eq(C.baselineFor(mixed, '餐飲', '2026-08', 10, 'exclude').avgSame, 1000);
});
t('2 月同期天數上限為當月最後一日', () => {
  const feb = [E('2026-02-28', '餐飲', 500), E('2026-03-30', '餐飲', 500)];
  const b = C.baselineFor(feb, '餐飲', '2026-03', 31, 'exclude');
  eq(b.avgSame, 500, '2 月只有 28 天不應報錯');
});

console.log('\n── 異常提示門檻 ──');
function bl(n, avgSame, avgFull) { return { n, avgSame, avgFull }; }
t('n<3 一律不亮燈', () => {
  eq(C.anomaly(9999, bl(2, 100, 9000)).flag, false);
  eq(C.anomaly(9999, bl(0, null, null)).flag, false);
});
t('+29% 不觸發，+31% 觸發', () => {
  eq(C.anomaly(1290, bl(3, 1000, 5000)).flag, false);
  eq(C.anomaly(1310, bl(3, 1000, 5000)).flag, true);
});
t('剛好 +30% 不觸發（嚴格大於）', () => eq(C.anomaly(1300, bl(3, 1000, 5000)).flag, false));
t('地板 1999 靜音、2000 可觸發', () => {
  eq(C.anomaly(500, bl(3, 100, 1999)).flag, false);
  eq(C.anomaly(500, bl(3, 100, 2000)).flag, true);
});
t('地板靜音時仍回報 deltaPct', () => {
  const a = C.anomaly(500, bl(3, 100, 1000));
  eq(a.flag, false); eq(a.reason, 'below-floor'); ok(a.deltaPct === 4);
});
t('基準為 0 不產生 Infinity', () => {
  const a = C.anomaly(500, bl(3, 0, 5000));
  eq(a.flag, false); eq(a.deltaPct, null);
});

console.log('\n── 收入、結餘與儲蓄率 ──');
const withIncome = base.concat([
  { id: 'i1', type: 'income', date: '2026-08-01', cat: '薪金', sub: '月薪', pay: '銀行轉帳', currency: 'MOP', amount: 50000, rate: 1, tripId: null }
]);
t('結餘計入旅行支出', () => {
  const b = C.balance(withIncome, '2026-08');
  eq(b.income, 50000); eq(b.expense, 1650); eq(b.net, 48350);
});
t('儲蓄率計算', () => ok(Math.abs(C.balance(withIncome, '2026-08').savingRate - 0.967) < 0.001));
t('無收入時儲蓄率為 null', () => eq(C.balance(base, '2026-08').savingRate, null));
t('收入不進支出佔比', () => {
  const r = C.monthReport(withIncome, '2026-08', 31, 'exclude');
  eq(r.rows.some(x => x.cat === '薪金'), false);
  eq(r.total, 150);
});

console.log('\n── 使用頻率記憶 ──');
t('bumpFreq 累加巢狀路徑', () => {
  const f = {};
  C.bumpFreq(f, ['cat', '餐飲']); C.bumpFreq(f, ['cat', '餐飲']); C.bumpFreq(f, ['cat', '交通']);
  eq(f.cat, { 餐飲: 2, 交通: 1 });
});
t('sortByFreq 依次數排序', () => eq(C.sortByFreq(['a', 'b', 'c'], { b: 5, c: 2 }), ['b', 'c', 'a']));
t('平手時保持原始順序', () => eq(C.sortByFreq(['a', 'b', 'c'], {}), ['a', 'b', 'c']));
t('topOf 取最常用', () => eq(C.topOf(['早餐', '午餐'], { 午餐: 9 }), '午餐'));

console.log('\n── CSV ──');
t('逗號與引號正確轉義', () => {
  eq(C.csvCell('a,b'), '"a,b"');
  eq(C.csvCell('他說"好"'), '"他說""好"""');
  eq(C.csvCell('換\n行'), '"換\n行"');
});
t('CSV 含 BOM 與標題列', () => {
  const csv = C.toCSV([E('2026-08-01', '餐飲', 100)], []);
  ok(csv.startsWith('\ufeff'), '應含 BOM 供 Excel 辨識');
  ok(csv.split('\r\n')[0].includes('澳門幣金額'));
  ok(csv.split('\r\n')[0].includes('轉出帳戶'));
});
t('CSV 轉帳列有流向兩端', () => {
  const csv = C.toCSV([T('2026-08-10', 1200)], []);
  const row = csv.split('\r\n')[1];
  ok(row.includes('轉帳') && row.includes('中銀澳門') && row.includes('大豐銀行'));
});
t('CSV 帶出行程名稱', () => {
  const csv = C.toCSV([E('2026-08-18', '餐飲', 900, { tripId: 't1' })], trips);
  ok(csv.includes('大阪'));
});
t('CSV 逐筆保留原幣與匯率', () => {
  const csv = C.toCSV([E('2026-08-18', '餐飲', 4800, { currency: 'JPY', rate: 0.055 })], []);
  ok(csv.includes('4800') && csv.includes('0.055') && csv.includes('264'));
});

console.log('\n── 匯入驗證 ──');
t('正確檔案零錯誤', () => eq(C.validateImport({ entries: [E('2026-08-01', '餐飲', 10)] }), []));
t('攔截壞日期', () => ok(C.validateImport({ entries: [E('2026/08/01', '餐飲', 10)] }).length > 0));
t('攔截零或負金額', () => {
  ok(C.validateImport({ entries: [E('2026-08-01', '餐飲', 0)] }).length > 0);
  ok(C.validateImport({ entries: [E('2026-08-01', '餐飲', -5)] }).length > 0);
});
t('攔截外幣缺匯率', () => ok(C.validateImport({ entries: [E('2026-08-01', '餐飲', 10, { currency: 'JPY', rate: 0 })] }).length > 0));
t('攔截非物件輸入', () => ok(C.validateImport('壞資料').length > 0));
t('接受轉帳型別', () => eq(C.validateImport({ entries: [T('2026-08-01', 100)] }), []));
t('攔截轉出轉入同一帳戶', () => ok(C.validateImport({
  entries: [T('2026-08-01', 100, { toPay: C.CASH, toAcct: '中銀澳門' })] }).length > 0));

console.log('\n── 月報組裝 ──');
t('rows 依金額由大到小', () => {
  const r = C.monthReport([E('2026-08-01', '餐飲', 100), E('2026-08-01', '交通', 900)], '2026-08', 31, 'exclude');
  eq(r.rows[0].cat, '交通');
});
t('零金額且無基準的類別不出現', () => {
  const r = C.monthReport([E('2026-08-01', '餐飲', 100)], '2026-08', 31, 'exclude');
  eq(r.rows.length, 1);
});
t('其他佔比超 10% 會標記', () => {
  const r = C.monthReport([E('2026-08-01', '其他', 200), E('2026-08-01', '餐飲', 800)], '2026-08', 31, 'exclude');
  eq(r.otherOverWarn, true);
});
t('其他佔比未超 10% 不標記', () => {
  const r = C.monthReport([E('2026-08-01', '其他', 50), E('2026-08-01', '餐飲', 950)], '2026-08', 31, 'exclude');
  eq(r.otherOverWarn, false);
});
t('空月份不崩潰', () => {
  const r = C.monthReport([], '2026-08', 31, 'exclude');
  eq(r.total, 0); eq(r.rows.length, 0);
});
t('第一個月所有類別 n=0', () => {
  const r = C.monthReport([E('2026-08-01', '餐飲', 100)], '2026-08', 31, 'exclude');
  eq(r.rows[0].n, 0); eq(r.rows[0].flag, false);
});


console.log('\n── 雙層帳戶 ──');
t('現金層預設含現鈔與各行', () => {
  const list = C.accountsOf(null, C.CASH);
  ok(list.indexOf('現鈔') === 0); ok(list.indexOf('MPay') > 0); ok(list.indexOf('大豐銀行') > 0);
});
t('信用卡層五家發卡行', () => eq(C.accountsOf(null, C.CARD).length, 5));
t('自訂帳戶清單覆蓋預設', () => {
  const st = { accounts: {} }; st.accounts[C.CASH] = ['只有一個'];
  eq(C.accountsOf(st, C.CASH), ['只有一個']);
});
t('帳戶標籤含層與帳戶', () => eq(C.acctLabel(E('2026-08-01', '餐飲', 10)), '現金 · 現鈔'));
t('轉帳標籤顯示流向', () => eq(C.acctLabel(T('2026-08-01', 100)), '現金 · 中銀澳門 → 信用卡 · 大豐銀行'));

console.log('\n── 轉帳不污染統計 ──');
const mixed = [
  E('2026-08-02', '餐飲', 500),
  E('2026-08-03', '餐飲', 900, { pay: C.CARD, acct: '大豐銀行' }),
  T('2026-08-10', 1200),
  { id: 'i1', type: 'income', date: '2026-08-01', cat: '薪金', sub: '月薪',
    pay: C.CASH, acct: '中銀澳門', currency: 'MOP', amount: 60000, rate: 1, tripId: null }
];
t('轉帳不算進支出', () => eq(C.balance(mixed, '2026-08').expense, 1400));
t('轉帳不算進收入', () => eq(C.balance(mixed, '2026-08').income, 60000));
t('轉帳不出現在支出構成', () => {
  const r = C.monthReport(mixed, '2026-08', 31, 'all');
  eq(r.total, 1400);
  eq(r.rows.some(x => x.cat === undefined), false);
});
t('未指定型別的篩選會排除轉帳', () => eq(C.filterEntries(mixed, { ym: '2026-08' }).length, 3));

console.log('\n── 消費基準 vs 現金基準 ──');
t('消費結餘含刷卡', () => eq(C.balance(mixed, '2026-08').net, 58600));
t('現金結餘＝收入−現金支出−還卡', () => {
  const cb = C.cashBalance(mixed, '2026-08');
  eq(cb.cashExpense, 500); eq(cb.repay, 1200); eq(cb.net, 58300);
});
t('刷卡不計入現金流出', () => eq(C.cashBalance(mixed, '2026-08').cashExpense, 500));
t('還卡逐卡拆分', () => {
  const rows = C.cashBalance(mixed, '2026-08').repayRows;
  eq(rows.length, 1); eq(rows[0].acct, '大豐銀行'); eq(rows[0].amount, 1200);
});
t('信用卡層的收入不算現金入帳', () => {
  const odd = mixed.concat([{ id: 'i2', type: 'income', date: '2026-08-05', cat: '其他收入',
    sub: '退款', pay: C.CARD, acct: '大豐銀行', currency: 'MOP', amount: 300, rate: 1, tripId: null }]);
  eq(C.cashBalance(odd, '2026-08').income, 60000);
});
t('卡層轉卡層不算還款', () => {
  const c2c = [T('2026-08-10', 500, { fromPay: C.CARD, fromAcct: '中銀澳門' })];
  eq(C.cashBalance(c2c, '2026-08').repay, 0);
});
t('本月刷卡金額', () => eq(C.cardCharged(mixed, '2026-08'), 900));

console.log('\n── 信用卡未還變動 ──');
const cardHist = [
  E('2026-07-05', '餐飲', 1000, { pay: C.CARD, acct: '大豐銀行' }),
  E('2026-07-08', '交通', 300, { pay: C.CARD, acct: '中銀澳門' }),
  T('2026-08-07', 1000, { toAcct: '大豐銀行' }),
  E('2026-08-09', '餐飲', 400, { pay: C.CARD, acct: '大豐銀行' })
];
t('未還＝已刷−已還', () => {
  const o = C.cardOutstanding(cardHist);
  eq(o.rows.filter(r => r.acct === '大豐銀行')[0].outstanding, 400);
  eq(o.rows.filter(r => r.acct === '中銀澳門')[0].outstanding, 300);
  eq(o.total, 700);
});
t('可截至指定月份', () => eq(C.cardOutstanding(cardHist, '2026-07').total, 1300));
t('還過頭會是負數', () => {
  const over = [E('2026-08-01', '餐飲', 100, { pay: C.CARD, acct: '大豐銀行' }), T('2026-08-05', 500, { toAcct: '大豐銀行' })];
  eq(C.cardOutstanding(over).total, -400);
});
t('現金支出不進未還', () => eq(C.cardOutstanding([E('2026-08-01', '餐飲', 999)]).total, 0));

console.log('\n── 舊資料遷移 ──');
t('現金→現鈔、手機支付→MPay', () => {
  const st = { schema: 2, entries: [
    { type: 'expense', date: '2026-08-01', cat: '餐飲', sub: 'x', pay: '現金', amount: 1, rate: 1, currency: 'MOP' },
    { type: 'expense', date: '2026-08-01', cat: '餐飲', sub: 'x', pay: '手機支付', amount: 1, rate: 1, currency: 'MOP' }
  ], templates: [], cards: [] };
  C.migrate(st);
  eq(st.entries[0].acct, '現鈔'); eq(st.entries[0].pay, C.CASH);
  eq(st.entries[1].acct, 'MPay'); eq(st.entries[1].pay, C.CASH);
  eq(st.schema, 3);
});
t('舊 cardId 對回卡片名稱', () => {
  const st = { schema: 2, cards: [{ id: 'c1', name: '大豐銀行' }], templates: [], entries: [
    { type: 'expense', date: '2026-08-01', cat: '餐飲', sub: 'x', pay: '信用卡', cardId: 'c1', amount: 1, rate: 1, currency: 'MOP' }
  ] };
  C.migrate(st);
  eq(st.entries[0].acct, '大豐銀行');
  eq(st.entries[0].cardId, undefined);
});
t('認不得的卡別歸未指定帳戶', () => {
  const st = { schema: 2, cards: [], templates: [], entries: [
    { type: 'expense', date: '2026-08-01', cat: '餐飲', sub: 'x', pay: '信用卡', cardId: 'zz', amount: 1, rate: 1, currency: 'MOP' }
  ] };
  C.migrate(st);
  eq(st.entries[0].acct, C.UNASSIGNED);
});
t('已遷移過不重複處理', () => {
  const st = { schema: 3, entries: [{ pay: C.CASH, acct: '現鈔' }] };
  eq(C.migrate(st).entries[0].acct, '現鈔');
});

console.log('\n── 帳戶別彙總 ──');
t('依帳戶加總本月支出', () => {
  const rows = C.byAccount(mixed, '2026-08');
  eq(rows.length, 2);
  eq(rows[0].label, '信用卡 · 大豐銀行');
  eq(rows[0].amount, 900);
});


console.log('\n── CSV 解析 ──');
t('去除 BOM 並切欄', () => {
  const rows = C.parseCSV('\ufeffa,b,c\r\n1,2,3');
  eq(rows.length, 2); eq(rows[1], ['1', '2', '3']);
});
t('引號內的逗號不切', () => eq(C.parseCSV('x\n"a,b",c')[1], ['a,b', 'c']));
t('雙引號跳脫', () => eq(C.parseCSV('x\n"他說""好""",c')[1], ['他說"好"', 'c']));
t('引號內的換行保留', () => {
  const rows = C.parseCSV('x\n"第一行\n第二行",c');
  eq(rows.length, 2); eq(rows[1][0], '第一行\n第二行');
});
t('空白行被丟掉', () => eq(C.parseCSV('a,b\n\n1,2\n\n').length, 2));
t('LF 與 CRLF 都吃', () => eq(C.parseCSV('a\n1').length, C.parseCSV('a\r\n1').length));

console.log('\n── 數字與日期正規化 ──');
t('千分位被剝掉', () => eq(C.normNum('12,345.67'), 12345.67));
t('空白與 MOP 前綴被剝掉', () => { eq(C.normNum(' 1 200 '), 1200); eq(C.normNum('MOP500'), 500); });
t('空字串不是零', () => ok(Number.isNaN(C.normNum(''))));
t('接受三種日期分隔', () => {
  eq(C.normDate('2026-08-01'), '2026-08-01');
  eq(C.normDate('2026/8/1'), '2026-08-01');
  eq(C.normDate('2026.8.1'), '2026-08-01');
});
t('看不懂的日期回 null，不猜', () => {
  eq(C.normDate('01/08/2026'), null);
  eq(C.normDate('8月1日'), null);
  eq(C.normDate('45870'), null);
});
t('月份日期超界回 null', () => { eq(C.normDate('2026-13-01'), null); eq(C.normDate('2026-08-32'), null); });

console.log('\n── CSV 匯入計畫 ──');
const blank = { entries: [], trips: [], subs: {}, accounts: null };
function csvOf(list, trips) { return C.toCSV(list, trips || []); }

t('匯出再匯入筆數一致', () => {
  const src = [E('2026-08-01', '餐飲', 120, { sub: '午餐' }), T('2026-08-07', 1200)];
  const plan = C.planCSVImport(csvOf(src), blank);
  eq(plan.errors.length, 0); eq(plan.entries.length, 2);
});
t('轉帳的流向兩端都還原', () => {
  const plan = C.planCSVImport(csvOf([T('2026-08-07', 1200)]), blank);
  const e = plan.entries[0];
  eq(e.type, 'transfer'); eq(e.fromAcct, '中銀澳門'); eq(e.toAcct, '大豐銀行');
});
t('外幣以原幣×匯率重算，不採用澳門幣金額欄', () => {
  const csv = '日期,型別,大類,子類,帳戶層,帳戶,幣別,原幣金額,匯率,澳門幣金額\n' +
              '2026-08-01,支出,餐飲,午餐,現金,現鈔,JPY,4800,0.055,99999';
  const plan = C.planCSVImport(csv, blank);
  eq(plan.entries[0].rate, 0.055);
  eq(C.toMOP(plan.entries[0]), 264);
});
t('外幣缺匯率時由澳門幣金額回推', () => {
  const csv = '日期,型別,大類,子類,幣別,原幣金額,澳門幣金額\n' +
              '2026-08-01,支出,餐飲,午餐,HKD,100,103';
  eq(C.planCSVImport(csv, blank).entries[0].rate, 1.03);
});
t('外幣完全沒有匯率線索就報錯', () => {
  const csv = '日期,型別,大類,子類,幣別,原幣金額\n2026-08-01,支出,餐飲,午餐,HKD,100';
  const plan = C.planCSVImport(csv, blank);
  eq(plan.entries.length, 0); ok(plan.errors[0].msg.indexOf('匯率') >= 0);
});
t('欄位順序打亂也能匯入', () => {
  const csv = '原幣金額,型別,子類,大類,日期\n120,支出,午餐,餐飲,2026-08-01';
  eq(C.planCSVImport(csv, blank).entries.length, 1);
});
t('缺少必要欄位直接擋下', () => {
  const plan = C.planCSVImport('大類,子類\n餐飲,午餐', blank);
  eq(plan.entries.length, 0); ok(plan.errors.length >= 1);
});
t('空檔案有明確訊息', () => eq(C.planCSVImport('', blank).errors[0].msg, '檔案是空的'));

console.log('\n── CSV 匯入的把關 ──');
t('不認得的大類報錯，不丟進其他', () => {
  const csv = '日期,型別,大類,子類,原幣金額\n2026-08-01,支出,亂寫的類,x,100';
  const plan = C.planCSVImport(csv, blank);
  eq(plan.entries.length, 0);
  ok(plan.errors[0].msg.indexOf('不認得') >= 0);
});
t('壞掉的行不影響其他行', () => {
  const csv = '日期,型別,大類,子類,原幣金額\n' +
              '2026-08-01,支出,餐飲,午餐,100\n' +
              'xxx,支出,餐飲,午餐,100\n' +
              '2026-08-03,支出,交通,的士,50';
  const plan = C.planCSVImport(csv, blank);
  eq(plan.entries.length, 2); eq(plan.errors.length, 1); eq(plan.errors[0].line, 3);
});
t('負數與零金額被擋', () => {
  const csv = '日期,型別,大類,子類,原幣金額\n2026-08-01,支出,餐飲,午餐,0\n2026-08-02,支出,餐飲,午餐,-5';
  eq(C.planCSVImport(csv, blank).errors.length, 2);
});
t('轉出與轉入同帳戶被擋', () => {
  const csv = '日期,型別,帳戶層,帳戶,轉出層,轉出帳戶,原幣金額\n' +
              '2026-08-01,轉帳,現金,現鈔,現金,現鈔,100';
  ok(C.planCSVImport(csv, blank).errors.length === 1);
});
t('與現有紀錄重複的行自動略過', () => {
  const src = [E('2026-08-01', '餐飲', 120, { sub: '午餐' })];
  const plan = C.planCSVImport(csvOf(src), { entries: src, trips: [], subs: {} });
  eq(plan.entries.length, 0); eq(plan.dupes, 1);
});
t('檔案內部重複也只留一筆', () => {
  const csv = '日期,型別,大類,子類,原幣金額\n2026-08-01,支出,餐飲,午餐,100\n2026-08-01,支出,餐飲,午餐,100';
  const plan = C.planCSVImport(csv, blank);
  eq(plan.entries.length, 1); eq(plan.dupes, 1);
});
t('金額不同就不是重複', () => {
  const csv = '日期,型別,大類,子類,原幣金額\n2026-08-01,支出,餐飲,午餐,100\n2026-08-01,支出,餐飲,午餐,101';
  eq(C.planCSVImport(csv, blank).entries.length, 2);
});

console.log('\n── CSV 匯入的新增項 ──');
t('沒見過的子類會被登記', () => {
  const csv = '日期,型別,大類,子類,原幣金額\n2026-08-01,支出,餐飲,宵夜,100';
  eq(C.planCSVImport(csv, blank).newSubs['餐飲'], ['宵夜']);
});
t('已存在的子類不重複登記', () => {
  const csv = '日期,型別,大類,子類,原幣金額\n2026-08-01,支出,餐飲,午餐,100';
  eq(Object.keys(C.planCSVImport(csv, blank).newSubs).length, 0);
});
t('沒見過的帳戶會被登記', () => {
  const csv = '日期,型別,大類,子類,帳戶層,帳戶,原幣金額\n2026-08-01,支出,餐飲,午餐,現金,澳娛錢包,100';
  eq(C.planCSVImport(csv, blank).newAccounts['現金'], ['澳娛錢包']);
});
t('未指定帳戶不算新增', () => {
  const csv = '日期,型別,大類,子類,帳戶層,帳戶,原幣金額\n2026-08-01,支出,餐飲,午餐,現金,,100';
  eq(Object.keys(C.planCSVImport(csv, blank).newAccounts).length, 0);
});
t('行程名對得上就沿用既有 id', () => {
  const st = { entries: [], trips: [{ id: 't1', name: '大阪', start: '2026-08-16', end: '2026-08-23' }], subs: {} };
  const csv = '日期,型別,大類,子類,原幣金額,行程\n2026-08-18,支出,餐飲,午餐,100,大阪';
  const plan = C.planCSVImport(csv, st);
  eq(plan.entries[0].tripId, 't1'); eq(plan.newTrips.length, 0);
});
t('新行程的起訖日由資料推出來', () => {
  const csv = '日期,型別,大類,子類,原幣金額,行程\n' +
              '2026-09-18,支出,餐飲,午餐,100,東京\n2026-09-21,支出,餐飲,晚餐,200,東京';
  const plan = C.planCSVImport(csv, blank);
  eq(plan.newTrips.length, 1);
  eq(plan.newTrips[0].start, '2026-09-18'); eq(plan.newTrips[0].end, '2026-09-21');
});

console.log('\n── 套用匯入計畫 ──');
t('套用後紀錄被附加而非取代', () => {
  const st = { entries: [E('2026-07-01', '餐飲', 50)], trips: [], subs: {}, accounts: {} };
  const csv = '日期,型別,大類,子類,原幣金額\n2026-08-01,支出,交通,的士,60';
  C.applyCSVPlan(st, C.planCSVImport(csv, st));
  eq(st.entries.length, 2);
});
t('套用後新行程有 id 且已掛上', () => {
  const st = { entries: [], trips: [], subs: {}, accounts: {} };
  const csv = '日期,型別,大類,子類,原幣金額,行程\n2026-09-18,支出,餐飲,午餐,100,東京';
  C.applyCSVPlan(st, C.planCSVImport(csv, st));
  eq(st.trips.length, 1);
  eq(st.entries[0].tripId, st.trips[0].id);
  eq(st.entries[0].__tripName, undefined);
});
t('套用後新子類與新帳戶進入設定', () => {
  const st = { entries: [], trips: [], subs: {}, accounts: {} };
  const csv = '日期,型別,大類,子類,帳戶層,帳戶,原幣金額\n2026-08-01,支出,餐飲,宵夜,現金,澳娛錢包,100';
  C.applyCSVPlan(st, C.planCSVImport(csv, st));
  eq(st.subs['餐飲'], ['宵夜']);
  ok(C.accountsOf(st, C.CASH).indexOf('澳娛錢包') >= 0);
});
t('完整往返：匯出→匯入→統計一致', () => {
  const src = [
    E('2026-08-01', '餐飲', 120, { sub: '午餐' }),
    E('2026-08-02', '交通', 80, { sub: '的士', pay: C.CARD, acct: '大豐銀行' }),
    T('2026-08-07', 500)
  ];
  const st = { entries: [], trips: [], subs: {}, accounts: {} };
  C.applyCSVPlan(st, C.planCSVImport(csvOf(src), st));
  eq(C.balance(st.entries, '2026-08').expense, C.balance(src, '2026-08').expense);
  eq(C.cashBalance(st.entries, '2026-08').repay, 500);
  eq(C.cardOutstanding(st.entries).total, -420);
});


console.log('\n── 子類明細 ──');
const subSet = [
  E('2026-08-01', '餐飲', 300, { sub: '午餐' }), E('2026-08-02', '餐飲', 200, { sub: '午餐' }),
  E('2026-08-03', '餐飲', 400, { sub: '晚餐' }), E('2026-08-04', '餐飲', 80, { sub: '早餐' }),
  E('2026-08-05', '餐飲', 60, { sub: '咖啡飲品' }), E('2026-08-06', '餐飲', 40, { sub: '外賣' }),
  E('2026-08-07', '交通', 999, { sub: '的士' })
];
t('只算指定大類', () => {
  const b = C.subBreakdown(subSet, '2026-08', '餐飲', 31, 'all');
  eq(b.total, 1080); eq(b.count, 6);
});
t('依金額排序取前三', () => {
  const b = C.subBreakdown(subSet, '2026-08', '餐飲', 31, 'all');
  eq(b.top.map(r => r.sub), ['午餐', '晚餐', '早餐']);
  eq(b.top[0].amount, 500);
});
t('同子類會合併並計筆數', () => {
  const b = C.subBreakdown(subSet, '2026-08', '餐飲', 31, 'all');
  eq(b.top[0].count, 2);
});
t('佔比以該大類為分母', () => {
  const b = C.subBreakdown(subSet, '2026-08', '餐飲', 31, 'all');
  ok(Math.abs(b.top[0].share - 500 / 1080) < 1e-9);
});
t('其餘項併成一行', () => {
  const b = C.subBreakdown(subSet, '2026-08', '餐飲', 31, 'all');
  eq(b.rest.items, 2); eq(b.rest.amount, 100);
});
t('前三加其餘等於總額', () => {
  const b = C.subBreakdown(subSet, '2026-08', '餐飲', 31, 'all');
  const sum = b.top.reduce((s, r) => s + r.amount, 0) + b.rest.amount;
  eq(C.round2(sum), b.total);
});
t('不足三項時其餘為零', () => {
  const b = C.subBreakdown(subSet, '2026-08', '交通', 31, 'all');
  eq(b.top.length, 1); eq(b.rest.items, 0); eq(b.rest.amount, 0);
});
t('沒有紀錄時不除以零', () => {
  const b = C.subBreakdown(subSet, '2026-08', '居住', 31, 'all');
  eq(b.total, 0); eq(b.all.length, 0); eq(b.rest.share, 0);
});
t('沿用當前的旅行檢視', () => {
  const withTrip = subSet.concat([E('2026-08-10', '餐飲', 5000, { sub: '聚餐請客', tripId: 't1' })]);
  eq(C.subBreakdown(withTrip, '2026-08', '餐飲', 31, 'exclude').total, 1080);
  eq(C.subBreakdown(withTrip, '2026-08', '餐飲', 31, 'all').total, 6080);
});
t('沿用同期天數截斷', () => {
  eq(C.subBreakdown(subSet, '2026-08', '餐飲', 2, 'all').total, 500);
});
t('轉帳不進子類明細', () => {
  const withT = subSet.concat([T('2026-08-09', 900)]);
  eq(C.subBreakdown(withT, '2026-08', '餐飲', 31, 'all').count, 6);
});
t('可調整取前幾項', () => {
  const b = C.subBreakdown(subSet, '2026-08', '餐飲', 31, 'all', null, 5);
  eq(b.top.length, 5); eq(b.rest.items, 0);   // 餐飲共 5 個子類，取 5 就沒有其餘
});

console.log('\n' + '─'.repeat(40));
console.log(`通過 ${pass} 項，失敗 ${fail} 項`);
process.exit(fail ? 1 : 0);
