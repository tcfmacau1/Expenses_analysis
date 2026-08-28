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

console.log('\n' + '─'.repeat(40));
console.log(`通過 ${pass} 項，失敗 ${fail} 項`);
process.exit(fail ? 1 : 0);
