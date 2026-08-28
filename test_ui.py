"""Playwright 端對端測試：消費統計 PWA"""
import datetime, json, pathlib, sys
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).parent
TODAY = datetime.date.today()
DAY = TODAY.day
URL = "http://localhost:8899/index.html"

results = []
def check(name, cond, extra=""):
    results.append((name, bool(cond), extra))
    print(("  ✓ " if cond else "  ✗ ") + name + (("\n      " + extra) if (not cond and extra) else ""))

def seed(page, entries, trips=None, templates=None, cardDue=None):
    page.evaluate("""([e,t,tp,cd]) => {
        localStorage.setItem('expanal_v1', JSON.stringify({
            schema:3, entries:e, trips:t||[], templates:tp||[], cardDue:cd||{}, subs:{}, freq:{},
            rates:{}, lastCurrency:'MOP', lastExport:null, sinceExport:0
        }));
    }""", [entries, trips or [], templates or [], cardDue or {}])
    page.reload()

def E(id, date, cat, amount, **kw):
    d = dict(id=id, type='expense', date=date, cat=cat, sub='未分類', pay='現金', acct='現鈔',
             currency='MOP', amount=amount, rate=1, tripId=None, createdAt='2026-01-01T00:00:00Z')
    d.update(kw); return d

def TR(id, date, amount, **kw):
    d = dict(id=id, type='transfer', date=date, fromPay='現金', fromAcct='中銀澳門',
             toPay='信用卡', toAcct='大豐銀行', currency='MOP', amount=amount, rate=1,
             createdAt='2026-01-01T00:00:00Z')
    d.update(kw); return d

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 390, "height": 844})
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))

    print("\n── 載入與骨架 ──")
    page.goto(URL)
    page.wait_for_selector("header h1")
    check("標題正確", page.inner_text("header h1") == "消費統計")
    check("四個分頁按鈕", page.locator("#nav button").count() == 4)
    check("空月份顯示邀請語", "本月還沒有紀錄" in page.inner_text("#v-stats"))
    check("預設在統計頁", page.locator("#v-stats").is_visible())

    print("\n── 記一筆：兩下完成 ──")
    page.click("#nav button[data-v='add']")
    page.fill("#fAmount", "68")
    page.click("button.catbtn:has-text('餐飲')")     # 第一下：大類（子類與帳戶自動預選）
    check("選大類後子類與帳戶自動預選", page.locator(".chip[aria-pressed='true']").count() >= 3)
    check("儲存鍵已啟用", not page.locator("#fSave").is_disabled())
    page.click("#fSave")                              # 第二下：記錄
    page.wait_for_selector(".toast")
    check("記錄後回到統計頁", page.locator("#v-stats").is_visible())
    check("金額出現在地層", "68.00" in page.inner_text(".strata"))
    check("MOP 不出現匯率欄", page.locator("#fRate").count() == 0)

    print("\n── 頻率記憶 ──")
    for amt in ["30", "45"]:
        page.click("#nav button[data-v='add']")
        page.fill("#fAmount", amt)
        page.click("button.catbtn:has-text('交通')")
        page.click("#fSave")
        page.wait_for_selector(".toast")
    page.click("#nav button[data-v='add']")
    check("最常用大類排到最前", page.locator("button.catbtn").first.inner_text() == "交通")

    print("\n── 外幣與匯率 ──")
    page.fill("#fAmount", "4800")
    page.select_option("#fCurrency", "JPY")
    check("非 MOP 才出現匯率欄", page.locator("#fRate").count() == 1)
    check("未填匯率時不可儲存", page.locator("#fSave").is_disabled())
    page.fill("#fRate", "0.055")
    page.click("button.catbtn:has-text('餐飲')")
    page.click("#fSave")
    page.wait_for_selector(".toast")
    page.click("#nav button[data-v='log']")
    log = page.inner_text("#v-log")
    check("紀錄保留原幣金額", "JPY 4800" in log)
    check("紀錄顯示折算後 MOP", "264.00" in log)
    page.click("#nav button[data-v='add']")
    check("下次記帳記住上次匯率", page.locator("#fRate").input_value() == "0.055")

    print("\n── 收入與結餘 ──")
    seed(page, [E('a', '2026-08-05', '餐飲', 1000),
                dict(id='i1', type='income', date='2026-08-01', cat='薪金', sub='月薪',
                     pay='銀行轉帳', currency='MOP', amount=50000, rate=1, tripId=None,
                     createdAt='2026-01-01T00:00:00Z')])
    page.evaluate("window.__app.setYM('2026-08')")
    st = page.inner_text("#v-stats")
    check("顯示已記錄收入", "50,000.00" in st)
    check("消費結餘正確", "49,000.00" in st)
    check("儲蓄率正確", "98.0%" in st)
    check("收入不進支出佔比", "薪金" not in page.inner_text(".strata"))
    check("措辭使用「已記錄」", "已記錄收入" in st and "已花費" not in st)

    print("\n── 旅行隔離 ──")
    seed(page,
         [E('a', '2026-08-05', '餐飲', 100), E('b', '2026-08-18', '餐飲', 900, tripId='t1')],
         [dict(id='t1', name='大阪', start='2026-08-16', end='2026-08-23')])
    page.evaluate("window.__app.setYM('2026-08')")
    check("日常檢視排除旅行", "100.00" in page.inner_text(".strata") and "900.00" not in page.inner_text(".strata"))
    page.click("#tripSeg button[data-mode='only']")
    check("只看旅行切換正確", "900.00" in page.inner_text(".strata"))
    page.click("#tripSeg button[data-mode='all']")
    check("全部檢視合計 1000", "1,000.00" in page.inner_text("#v-stats"))
    page.click("#tripSeg button[data-mode='exclude']")

    print("\n── 對照樣本與異常提示 ──")
    seed(page, [E('c%d' % i, m + '-05', '餐飲', 3000) for i, m in
                enumerate(['2026-05', '2026-06', '2026-07'])] +
               [E('now', '2026-08-05', '餐飲', 3200)])
    page.evaluate("window.__app.setYM('2026-08')")
    check("n=3 不再顯示累積中", "累積中" not in page.inner_text("#v-stats"))
    check("+6.7% 不觸發提示", "沒有類別觸發提示" in page.inner_text("#v-stats"))
    check("顯示同期均值", "3,000.00" in page.inner_text("#v-stats"))

    seed(page, [E('c%d' % i, m + '-05', '餐飲', 3000) for i, m in
                enumerate(['2026-05', '2026-06', '2026-07'])] +
               [E('now', '2026-08-05', '餐飲', 5000)])
    page.evaluate("window.__app.setYM('2026-08')")
    check("+67% 觸發異常提示", "高出 67%" in page.inner_text("#v-stats"))
    check("異常類別有紅色標記", page.locator(".band.flag").count() == 1)

    seed(page, [E('c%d' % i, m + '-05', '個人健康', 300) for i, m in
                enumerate(['2026-05', '2026-06', '2026-07'])] +
               [E('now', '2026-08-05', '個人健康', 900)])
    page.evaluate("window.__app.setYM('2026-08')")
    check("月均低於 2000 的類別靜音", page.locator(".band.flag").count() == 0)

    seed(page, [E('x', '2026-08-05', '餐飲', 1000)])
    page.evaluate("window.__app.setYM('2026-08')")
    check("樣本不足顯示累積中", "累積中 · 對照樣本 0/3" in page.inner_text("#v-stats"))
    check("樣本不足時不亮燈", page.locator(".band.flag").count() == 0)

    print("\n── 地板靜音的誠實揭露 ──")
    seed(page, [E('f%d' % i, m + '-05', '娛樂社交', 500) for i, m in
                enumerate(['2026-05', '2026-06', '2026-07'])] +
               [E('g%d' % i, m + '-06', '居住', 12000) for i, m in
                enumerate(['2026-05', '2026-06', '2026-07'])] +
               [E('n1', '2026-08-05', '娛樂社交', 1400), E('n2', '2026-08-06', '居住', 12000)])
    page.evaluate("window.__app.setYM('2026-08')")
    st2 = page.inner_text("#v-stats")
    check("靜音類別不亮紅燈", page.locator(".band.flag").count() == 0)
    check("但主動揭露被靜音的超標", "依你設定的門檻靜音" in st2)
    check("揭露內容含類別與幅度", "娛樂社交 ＋180%" in st2)
    check("不再宣稱沒有類別超出", "沒有類別超出" not in st2)

    print("\n── 其他佔比警戒 ──")
    seed(page, [E('o1', '2026-08-05', '其他', 300), E('o2', '2026-08-06', '餐飲', 700)])
    page.evaluate("window.__app.setYM('2026-08')")
    check("其他超 10% 觸發檢討提示", "分類體系需要檢討" in page.inner_text("#v-stats"))

    print("\n── 月中同期比對 ──")
    # 前三月的月底大額落在同期之外，只有月初小額該進基準
    late = min(28, DAY + 1) if DAY < 28 else 28
    seed(page, [E('p%d' % i, '%s-%02d' % (m, late), '餐飲', 8000) for i, m in
                enumerate(['2026-05', '2026-06', '2026-07'])] +
               [E('q%d' % i, m + '-03', '餐飲', 500) for i, m in
                enumerate(['2026-05', '2026-06', '2026-07'])] +
               [E('now', '2026-08-03', '餐飲', 520)])
    page.evaluate("window.__app.setYM('2026-08')")
    detail = page.inner_text("#v-stats")
    check("同期均值只取月初 500", "近三月同期均值 500.00" in detail)
    check("整月的 8,500 不進同期基準", "8,500.00" not in detail)
    check("月中只算到今天", ("至 %d 日" % DAY) in detail)

    print("\n── 補登與修改 ──")
    seed(page, [E('z', '2026-08-05', '餐飲', 100)])
    page.evaluate("window.__app.setYM('2026-08')")
    page.click("#nav button[data-v='add']")
    check("日期欄可編輯（支援補登）", page.locator("#fDate").is_editable())
    check("沒有時分欄位", page.locator("input[type='time']").count() == 0)
    check("沒有拍照鍵", "拍照" not in page.inner_text("#v-add"))
    page.click("#nav button[data-v='log']")
    page.click("#v-log .row")
    page.wait_for_selector(".modal")
    check("可改行程歸屬", "行程歸屬" in page.inner_text(".modal"))
    page.click(".modal button:has-text('修改這筆')")
    check("修改帶入原金額", page.locator("#fAmount").input_value() == "100")
    page.fill("#fAmount", "150")
    page.click("#fSave")
    page.wait_for_selector(".toast")
    check("修改後金額更新", "150.00" in page.inner_text("#v-log"))

    print("\n── 範本一鍵帶入 ──")
    seed(page, [], [], [dict(id='tp1', name='房貸', amount=12000, cat='居住',
                             sub='房貸租金', pay='現金', acct='中銀澳門', currency='MOP')])
    page.click("#nav button[data-v='add']")
    page.click(".chip:has-text('房貸')")
    check("範本填好金額", page.locator("#fAmount").input_value() == "12000")
    check("按鍵改為需確認", page.inner_text("#fSave") == "確認記錄")
    before = page.evaluate("JSON.parse(localStorage.getItem('expanal_v1')).entries.length")
    check("帶入後尚未寫入", before == 0)
    page.click("#fSave")
    page.wait_for_selector(".toast")
    after = page.evaluate("JSON.parse(localStorage.getItem('expanal_v1')).entries.length")
    check("確認後才寫入", after == 1)

    print("\n── 行程自動歸屬 ──")
    seed(page, [E('t1e', '2026-09-18', '餐飲', 300)])
    page.click("#nav button[data-v='set']")
    page.click("button:has-text('新增行程')")
    page.fill("#trName", "東京")
    page.fill("#trStart", "2026-09-16")
    page.fill("#trEnd", "2026-09-23")
    page.click("button:has-text('建立行程')")
    page.wait_for_selector(".toast")
    tid = page.evaluate("JSON.parse(localStorage.getItem('expanal_v1')).entries[0].tripId")
    check("既有消費自動歸入新行程", tid is not None)
    page.click("#nav button[data-v='add']")
    page.fill("#fDate", "2026-09-18")
    check("行程期間內顯示自動歸屬提示", "自動歸入" in page.inner_text("#v-add"))

    print("\n── 資料匯出計數器 ──")
    seed(page, [E('d%d' % i, '2026-08-0%d' % (i + 1), '餐飲', 100) for i in range(3)])
    page.click("#nav button[data-v='set']")
    check("未匯出時顯示累積筆數", "尚未匯出過，目前累積 3 筆" in page.inner_text("#v-set"))
    check("提醒資料只存本機", "只存在這台裝置" in page.inner_text("#v-set"))
    with page.expect_download() as dl:
        page.click("button:has-text('匯出 JSON 備份')")
    d = dl.value
    data = json.loads(pathlib.Path(d.path()).read_text())
    check("匯出檔含全部紀錄", len(data["entries"]) == 3)
    check("匯出後計數器歸零", "距上次匯出 0 天，期間新增 0 筆" in page.inner_text("#v-set"))
    with page.expect_download() as dl2:
        page.click("button:has-text('匯出 CSV')")
    csv = pathlib.Path(dl2.value.path()).read_bytes().decode("utf-8-sig")
    check("CSV 有標題列", "澳門幣金額" in csv.split("\r\n")[0])
    check("CSV 為 CRLF 換行且有三列資料", len(csv.strip().split("\r\n")) == 4)

    print("\n── 帳戶模型 ──")
    seed(page, [])
    page.click("#nav button[data-v='add']")
    page.fill("#fAmount", "68")
    page.click("button.catbtn:has-text('餐飲')")
    va = page.inner_text("#v-add")
    check("出現付款帳戶兩層", "付款帳戶" in va)
    check("預設選現金層", page.locator(".chip[aria-pressed='true']:has-text('現金')").count() == 1)
    check("現金層列出現鈔與 MPay", "現鈔" in va and "MPay" in va)
    page.click(".chip:has-text('信用卡')")
    check("切到信用卡層列出發卡行", "大豐銀行" in page.inner_text("#v-add"))
    page.click(".chip:has-text('大豐銀行')")
    page.click("#fSave")
    page.wait_for_selector(".toast")
    saved = page.evaluate("JSON.parse(localStorage.getItem('expanal_v1')).entries[0]")
    check("帳戶層寫入紀錄", saved["pay"] == "信用卡")
    check("帳戶名寫入紀錄", saved["acct"] == "大豐銀行")
    page.click("#nav button[data-v='log']")
    check("紀錄列顯示層與帳戶", "信用卡 · 大豐銀行" in page.inner_text("#v-log"))

    print("\n── 轉帳與還卡 ──")
    seed(page, [])
    page.click("#nav button[data-v='add']")
    page.click(".chip:has-text('轉帳')")
    vt = page.inner_text("#v-add")
    check("轉帳表單有轉出與轉入", "轉出帳戶" in vt and "轉入帳戶" in vt)
    check("轉帳沒有大類欄位", "大類" not in vt)
    check("預設是現金轉信用卡", "這是還卡數" in vt)
    page.fill("#fAmount", "1200")
    page.click("#fSave")
    page.wait_for_selector(".toast")
    tr = page.evaluate("JSON.parse(localStorage.getItem('expanal_v1')).entries[0]")
    check("轉帳型別正確", tr["type"] == "transfer")
    check("轉帳記錄流向", tr["fromPay"] == "現金" and tr["toPay"] == "信用卡")
    check("轉帳不進支出構成", "1,200.00" not in page.inner_text(".strata") if page.locator(".strata").count() else True)

    print("\n── 雙基準結餘 ──")
    seed(page, [
        E('m1', '2026-08-02', '餐飲', 500),
        E('m2', '2026-08-03', '餐飲', 900, pay='信用卡', acct='大豐銀行'),
        TR('m3', '2026-08-10', 1200),
        dict(id='m4', type='income', date='2026-08-01', cat='薪金', sub='月薪', pay='現金',
             acct='中銀澳門', currency='MOP', amount=60000, rate=1, tripId=None,
             createdAt='2026-01-01T00:00:00Z')])
    page.evaluate("window.__app.setYM('2026-08')")
    st3 = page.inner_text("#v-stats")
    check("消費結餘 58,600", "58,600.00" in st3)
    check("現金結餘 58,300", "58,300.00" in st3)
    check("顯示現金層支出", "現金層支出" in st3)
    check("顯示本月還卡", "本月還卡" in st3)
    check("還卡逐卡列出", "信用卡 · 大豐銀行" in st3)
    check("支出構成只含 1,400", "1,400.00" in st3)
    check("說明還款是資金搬運", "資金搬運" in st3)

    print("\n── 信用卡未還 ──")
    check("顯示未還區塊", "信用卡未還" in st3)
    check("未還＝900−1200＝−300", "−300.00" in st3)
    check("揭露沒有期初餘額", "不是真實欠款總額" in st3)

    seed(page, [E('n1', '2026-08-03', '餐飲', 900, pay='信用卡', acct='大豐銀行')])
    page.evaluate("window.__app.setYM('2026-08')")
    check("沒還卡時提示用轉帳", "不要記成支出" in page.inner_text("#v-stats"))

    print("\n── 帳戶別支出 ──")
    seed(page, [E('a1', '2026-08-02', '餐飲', 500),
                E('a2', '2026-08-03', '交通', 900, pay='信用卡', acct='中銀澳門')])
    page.evaluate("window.__app.setYM('2026-08')")
    check("帳戶別彙總出現", "帳戶別支出" in page.inner_text("#v-stats"))
    check("列出現金與信用卡帳戶", "現金 · 現鈔" in page.inner_text("#v-stats"))

    print("\n── 帳戶管理 ──")
    seed(page, [E('b1', '2026-08-02', '餐飲', 500)], cardDue={'大豐銀行': 7})
    page.click("#nav button[data-v='set']")
    vs = page.inner_text("#v-set")
    check("設定頁分兩層列帳戶", "帳戶 · 現金" in vs and "帳戶 · 信用卡" in vs)
    check("顯示到期日", "每月 7 日到期" in vs)
    check("顯示各帳戶筆數", "1 筆" in vs)
    check("說明沒有餘額的原因", "起用以來的變動" in vs)

    print("\n── 舊資料自動遷移 ──")
    page.evaluate("""() => {
        localStorage.setItem('expanal_v1', JSON.stringify({
            schema:2,
            entries:[{id:'o1',type:'expense',date:'2026-08-01',cat:'餐飲',sub:'午餐',
                      pay:'手機支付',currency:'MOP',amount:120,rate:1,tripId:null},
                     {id:'o2',type:'expense',date:'2026-08-02',cat:'交通',sub:'的士',
                      pay:'信用卡',cardId:'c1',currency:'MOP',amount:80,rate:1,tripId:null}],
            cards:[{id:'c1',name:'大豐銀行',dueDay:7}],
            trips:[],templates:[],subs:{},freq:{},rates:{},lastCurrency:'MOP',
            lastExport:null,sinceExport:0
        }));
    }""")
    page.reload()
    page.evaluate("window.__app.setYM('2026-08')")
    mig = page.evaluate("JSON.parse(localStorage.getItem('expanal_v1'))")
    check("遷移後 schema 升到 3", mig["schema"] == 3)
    check("手機支付轉成 MPay", mig["entries"][0]["acct"] == "MPay")
    check("舊卡片對回帳戶名", mig["entries"][1]["acct"] == "大豐銀行")
    check("遷移後金額不變", "200.00" in page.inner_text("#v-stats"))

    print("\n── 規則說明 ──")
    page.click("#nav button[data-v='set']")
    txt = page.inner_text("#v-set")
    check("說明寫明家庭支出邊界", "無家可歸" in txt)
    check("說明寫明 2000 門檻", "2000 MOP" in txt)
    check("說明為何寫已記錄", "不代表你花掉的" in txt)
    check("說明信用卡雙軌", "就雙重計算" in txt)

    print("\n── 月份切換 ──")
    page.click("#nav button[data-v='stats']")
    check("不可切到未來月份", page.locator("#moNext").is_disabled())
    page.click("#moPrev")
    check("可回上個月", page.inner_text("#moLbl") == "2026-07")

    print("\n── 韌性 ──")
    check("全程無 console error", len(errors) == 0, "; ".join(errors[:3]))
    browser.close()

ok = sum(1 for _, c, _ in results if c)
bad = len(results) - ok
print("\n" + "─" * 40)
print(f"通過 {ok} 項，失敗 {bad} 項")
sys.exit(1 if bad else 0)
