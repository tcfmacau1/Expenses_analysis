(function(){
'use strict';
if(!window.Core){
  window.__showError && window.__showError('找不到核心程式（Core）。','請確認 index.html 是完整的內嵌版本。');
  return;
}
var C = window.Core;
var KEY = 'expanal_v1';

/* ── 狀態 ─────────────────────────────────────────────── */
function BLANK(){
  var a = {}; a[C.CASH] = C.DEFAULT_ACCOUNTS[C.CASH].slice(); a[C.CARD] = C.DEFAULT_ACCOUNTS[C.CARD].slice();
  return { schema:3, entries:[], trips:[], templates:[], accounts:a, cardDue:{},
           subs:{}, freq:{}, rates:{}, lastCurrency:'MOP', lastExport:null, sinceExport:0 };
}
var S = BLANK();
var memoryOnly = false;

function load(){
  try{
    var raw = localStorage.getItem(KEY);
    if(raw){
      var o = JSON.parse(raw);
      var fresh = BLANK();
      for(var k in o) fresh[k] = o[k];
      if(!fresh.accounts || !fresh.accounts[C.CASH]) fresh.accounts = BLANK().accounts;
      if(!fresh.cardDue) fresh.cardDue = {};
      S = C.migrate(fresh);
      save();
    }
  }catch(e){ memoryOnly = true; }
}
function save(){
  if(memoryOnly) return;
  try{ localStorage.setItem(KEY, JSON.stringify(S)); }
  catch(e){ memoryOnly = true; toast('無法寫入本機儲存，本次改動只存在記憶體'); }
}
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }

var view='add', ym=C.ymOf(C.todayISO()), tripMode='exclude', onlyTripId=null;
var openCat=null, openAll=false;   // 地層展開的大類與是否顯示全部子類

/* ── 小工具 ───────────────────────────────────────────── */
function el(t,c,txt){ var e=document.createElement(t); if(c)e.className=c; if(txt!=null)e.textContent=txt; return e; }
function money(n){
  var s = Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (n<0?'−':'')+s;
}
function pct(p){ return (p*100).toFixed(1)+'%'; }
function toast(msg){
  var t = el('div','toast',msg); document.body.appendChild(t);
  setTimeout(function(){ t.remove(); }, 2200);
}
function lbl(t){ return el('label','fl',t); }
function hint(t){ var d=el('div','tiny muted'); d.style.marginBottom='8px'; d.textContent=t; return d; }
function callout(kind, text){
  var d = el('div','callout'+(kind==='info'?' info':'')); d.textContent = text; return d;
}
var NS='http://www.w3.org/2000/svg';
function svgEl(t, attrs){
  var e=document.createElementNS(NS,t);
  for(var k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}
function svgText(x,y,txt,attrs){
  var t=svgEl('text', Object.assign({x:x,y:y}, attrs||{}));
  t.textContent=txt; return t;
}

/* 收支共用日期範圍、有效月份及繪圖邏輯。 */
function trendChart(ser, type){
  var income=type==='income', label=income?'收入':'支出';
  var color=income?'var(--sky-deep)':'var(--s3)';
  var td=ser.throughDay, partial=td && td<C.daysInMonth(ym);
  var card=el('div','card');
  card.appendChild(el('p','eyebrow',label+'趨勢 · 近六個月'+(partial?'（各月 1–'+td+' 日）':'')));

  var W=600, H=210, padL=8, padR=8, padT=14, padB=26;
  var plotH = H-padT-padB, plotW = W-padL-padR;
  var svg = svgEl('svg', {viewBox:'0 0 '+W+' '+H,
                          preserveAspectRatio:'xMidYMid meet', role:'img'});
  svg.style.width='100%'; svg.style.height='auto'; svg.style.display='block';
  svg.setAttribute('aria-label','近六個月'+label+'趨勢');
  var max = Math.max(1,...ser.rows.map(function(r){return r[type];}));
  var slot = plotW/ser.rows.length;
  var bw = Math.min(26, slot*0.30);

  var average=income?ser.avgIncome:ser.avgExpense;
  if(average>0){
    var ay = padT + plotH - (average/max)*plotH;
    svg.appendChild(svgEl('line',{x1:padL,y1:ay,x2:W-padR,y2:ay,
      stroke:'var(--sky-deep)','stroke-width':1,'stroke-dasharray':'4 4','opacity':.5}));
  }

  ser.rows.forEach(function(r,i){
    var cx = padL + slot*i + slot/2;
    if(!r.has){
      svg.appendChild(svgText(cx, padT+plotH-6, '無資料',
        {'text-anchor':'middle','font-size':9,fill:'var(--mute)'}));
    } else {
      var height=r[type]/max*plotH;
      svg.appendChild(svgEl('rect',{x:cx-bw/2, y:padT+plotH-height, width:bw, height:height,
        fill:color, rx:2}));
      svg.appendChild(svgText(cx, padT+plotH-height-4, money(r[type]),
        {'text-anchor':'middle','font-size':9.5,fill:'var(--ink)','font-family':'var(--f-num)'}));
    }
    svg.appendChild(svgText(cx, H-9, r.ym.slice(5)+' 月',
      {'text-anchor':'middle','font-size':10,
       fill: r.isCurrent? 'var(--sky-deep)':'var(--mute)',
       'font-weight': r.isCurrent? 700:400}));
  });
  svg.appendChild(svgEl('line',{x1:padL,y1:padT+plotH,x2:W-padR,y2:padT+plotH,
    stroke:'var(--hair)','stroke-width':1}));

  var box = el('div',''); box.style.paddingTop='10px'; box.appendChild(svg);
  card.appendChild(box);

  var lg = el('div','legend');
  var l1=el('span','');
  l1.appendChild(swatch(color));
  l1.appendChild(el('span','',label+'均 '+money(average)));
  lg.appendChild(l1);
  lg.appendChild(el('span','', tripMode==='exclude'?'不含旅行':(tripMode==='only'?'只看旅行':'含旅行')));
  card.appendChild(lg);
  if(partial){
    card.appendChild(el('div','tiny muted','本月只到 '+td+' 日，往月也只取 1–'+td+' 日，兩邊才比得下去。'));
  }
  return card;
}
function swatch(color){
  var s2=el('span',''); s2.style.cssText='display:inline-block;width:9px;height:9px;border-radius:2px;'+
    'background:'+color+';margin-right:4px;vertical-align:middle';
  return s2;
}

/* 偏差圖：以近三月同期均值為零線，向右超支、向左低於基準 */
function deviationChart(){
  var dv = C.deviationRows(S.entries, ym, throughDay(), tripMode);
  if(!dv.ready) return null;

  var card = el('div','card');
  card.appendChild(el('p','eyebrow','與近三月同期的偏差'));

  var rowH=26, W=600, padL=76, padR=64, top=16;
  var H = top + dv.rows.length*rowH + 8;
  var mid = padL + (W-padL-padR)/2;
  var half = (W-padL-padR)/2;
  var scale = Math.max(dv.maxAbs, 0.3);        // 至少 ±30%，避免小偏差被放大成滿格

  var svg = svgEl('svg',{viewBox:'0 0 '+W+' '+H,
                         preserveAspectRatio:'xMidYMid meet', role:'img'});
  svg.style.width='100%'; svg.style.height='auto'; svg.style.display='block';
  svg.setAttribute('aria-label','各大類與近三月同期均值的偏差');
  svg.appendChild(svgText(mid, 10, '基準', {'text-anchor':'middle','font-size':9,fill:'var(--mute)'}));
  svg.appendChild(svgText(mid-half, 10, '低於基準', {'text-anchor':'start','font-size':9,fill:'var(--green)'}));
  svg.appendChild(svgText(mid+half, 10, '高於基準', {'text-anchor':'end','font-size':9,fill:'var(--red)'}));

  dv.rows.forEach(function(r,i){
    var y = top + i*rowH;
    var w = Math.min(Math.abs(r.deltaPct)/scale, 1) * half;
    var up = r.deltaPct >= 0;
    var color = r.flag ? 'var(--red)' : (up ? 'var(--s4)' : 'var(--green)');
    svg.appendChild(svgEl('rect',{
      x: up ? mid : mid-w, y: y+4, width: Math.max(w,1.5), height: rowH-13,
      fill: color, rx:2, opacity: r.muted? .45 : 1
    }));
    svg.appendChild(svgText(padL-6, y+rowH/2+1, r.cat,
      {'text-anchor':'end','font-size':11,fill:'var(--ink)','dominant-baseline':'middle'}));
    svg.appendChild(svgText(W-padR+6, y+rowH/2+1,
      (up?'+':'−')+Math.abs(r.deltaPct*100).toFixed(0)+'%',
      {'text-anchor':'start','font-size':10.5,'font-family':'var(--f-num)',
       fill: r.flag?'var(--red)':'var(--mute)','dominant-baseline':'middle',
       'font-weight': r.flag?700:400}));
  });
  svg.appendChild(svgEl('line',{x1:mid,y1:top,x2:mid,y2:H-6,stroke:'var(--ink)','stroke-width':1.2}));

  var box = el('div',''); box.style.paddingTop='10px'; box.appendChild(svg);
  card.appendChild(box);
  var muted = dv.rows.filter(function(r){ return r.muted; }).length;
  if(muted){
    card.appendChild(el('div','tiny muted','淡色那幾條月均未達 '+C.ANOMALY_FLOOR+
      ' MOP，不會觸發提示，但偏差照樣畫給你看。'));
  }
  return card;
}

function subPanel(cat){
  var b = C.subBreakdown(S.entries, ym, cat, throughDay(), tripMode, onlyTripId, 3);
  var wrap = el('div','subpanel');
  var sh = el('div','sh');
  sh.appendChild(el('span','', cat+' 子類明細　共 '+b.count+' 筆'));
  sh.appendChild(el('span','', money(b.total)));
  wrap.appendChild(sh);

  if(!b.all.length){
    wrap.appendChild(el('div','tiny muted','這個月這一類沒有紀錄。'));
    return wrap;
  }
  var list = openAll ? b.all : b.top;
  list.forEach(function(r){
    var row = el('div','subrow');
    var nm = el('span','sn', r.sub);
    nm.appendChild(el('i','', r.count+' 筆'));
    row.appendChild(nm);
    var v = el('span','sv');
    v.appendChild(el('span','p', pct(r.share)));
    v.appendChild(el('span','a', money(r.amount)));
    row.appendChild(v);
    wrap.appendChild(row);
  });
  if(!openAll && b.rest.items>0){
    var rr = el('div','subrow rest');
    rr.appendChild(el('span','sn', '其餘 '+b.rest.items+' 項'));
    var v2 = el('span','sv');
    v2.appendChild(el('span','p', pct(b.rest.share)));
    v2.appendChild(el('span','a', money(b.rest.amount)));
    rr.appendChild(v2);
    wrap.appendChild(rr);
  }
  if(b.all.length>3){
    var more = el('button','submore', openAll ? '只看前三項' : ('展開全部 '+b.all.length+' 項'));
    more.onclick=function(ev){ ev.stopPropagation(); openAll=!openAll; renderStats(); };
    wrap.appendChild(more);
  }
  return wrap;
}

function cell(k,v,cls){
  var c = el('div','cell');
  c.appendChild(el('div','k',k));
  var vv = el('div','v '+(cls||'')); vv.textContent=v;
  c.appendChild(vv); return c;
}
function subsOf(cat, type){
  var list = (type==='income'?C.INCOME_CATS:C.CATS).filter(function(c){return c.name===cat;})[0];
  var base = list ? list.subs.slice() : [];
  (S.subs[cat]||[]).forEach(function(s){ if(base.indexOf(s)<0) base.push(s); });
  return base;
}
function tripName(id){
  var t = S.trips.filter(function(x){return x.id===id;})[0];
  return t ? t.name : '旅行';
}
function isCurrentMonth(){ return ym === C.ymOf(C.todayISO()); }
function throughDay(){ return isCurrentMonth() ? C.dayOf(C.todayISO()) : C.daysInMonth(ym); }
function accts(layer){ return C.accountsOf(S, layer); }

/* ── 統計 ─────────────────────────────────────────────── */
var SHADES=['--s1','--s2','--s3','--s4','--s5','--s6','--s7','--s8'];

function incomeCard(cutoff){
  var report=C.incomeReport(S.entries, ym, cutoff, tripMode, onlyTripId);
  var card=el('section','card income-report');
  card.appendChild(el('p','eyebrow','收入構成 · 近三個月偏差'));
  card.appendChild(el('p','tiny muted',(cutoff?'各月 1 至 '+cutoff+' 日':'各月全月')+' · 澳門元'));
  [report.total].concat(report.rows).forEach(function(r, index){
    var row=el('div','row');
    var label=el('div','l');
    label.appendChild(el('span','t',r.name));
    if(r.avg!==null){
      var delta=(r.delta>0?'+':'')+money(r.delta);
      var percent=r.deltaPct===null?'基準為零':(r.deltaPct>0?'+':'')+pct(r.deltaPct);
      label.appendChild(el('span','sub','三月均值 '+money(r.avg)+' · 差額 '+delta+'（'+percent+'）'));
    }
    row.appendChild(label);
    var value=el('div','v',money(r.amount));
    if(index) value.appendChild(el('span','sub','佔 '+pct(r.share)));
    row.appendChild(value);
    card.appendChild(row);
  });
  if(!report.total.amount) card.appendChild(el('div','tiny muted','所選期間未有已記錄收入。'));
  if(report.samples<C.BASELINE_MONTHS) card.appendChild(el('div','note tiny muted',
    '累積中 · 前三個月有收入紀錄的月份 '+report.samples+'/3。滿三個月後顯示偏差。'));
  return card;
}

function renderStats(){
  var host = document.getElementById('v-stats');
  host.textContent='';

  var rep = C.monthReport(S.entries, ym, throughDay(), tripMode, onlyTripId);
  var bal = C.balance(S.entries, ym);
  var cash = C.cashBalance(S.entries, ym);

  /* 消費基準 */
  var bc = el('div','card');
  bc.appendChild(el('p','eyebrow','消費基準 · 這個月我消耗了多少'));
  var g = el('div','bal');
  g.appendChild(cell('已記錄收入', money(bal.income), 'pos'));
  g.appendChild(cell('已記錄支出', money(bal.expense), ''));
  var net = cell('消費結餘', money(bal.net), bal.net>=0?'pos':'neg'); net.className='cell net';
  g.appendChild(net);
  g.appendChild(cell('儲蓄率', bal.savingRate===null?'—':(bal.savingRate*100).toFixed(1)+'%',
                     bal.savingRate===null?'':(bal.savingRate>=0?'pos':'neg')));
  bc.appendChild(g);
  var nt = el('div','note tiny muted');
  nt.textContent='消費記在刷卡當下，含旅行支出。全部數字都是「已記錄」金額，完整度取決於你記了多少。';
  bc.appendChild(nt);
  host.appendChild(bc);

  /* 現金基準 */
  var cc = el('div','card');
  cc.appendChild(el('p','eyebrow','現金基準 · 這個月戶口少了多少'));
  var g2 = el('div','bal');
  g2.appendChild(cell('現金層支出', money(cash.cashExpense), ''));
  g2.appendChild(cell('本月還卡', money(cash.repay), ''));
  var net2 = cell('現金結餘', money(cash.net), cash.net>=0?'pos':'neg'); net2.className='cell net';
  g2.appendChild(net2);
  g2.appendChild(cell('現金儲蓄率', cash.savingRate===null?'—':(cash.savingRate*100).toFixed(1)+'%',
                      cash.savingRate===null?'':(cash.savingRate>=0?'pos':'neg')));
  cc.appendChild(g2);

  if(cash.repayRows.length){
    var bl2 = el('div','note');
    var th2 = el('div','thead'); th2.style.paddingTop='0';
    th2.appendChild(el('span','','本月還卡紀錄　／　轉帳至'));
    th2.appendChild(el('span','','金額'));
    bl2.appendChild(th2);
    cash.repayRows.forEach(function(r){
      var rw = el('div','row'); rw.style.cursor='default';
      var l = el('span','l');
      l.appendChild(el('span','t', C.CARD+' · '+r.acct));
      var d = S.cardDue[r.acct];
      l.appendChild(el('span','sub', d? ('每月 '+d+' 日到期') : '未設到期日'));
      rw.appendChild(l);
      rw.appendChild(el('span','v', money(r.amount)));
      bl2.appendChild(rw);
    });
    cc.appendChild(bl2);
  } else {
    cc.appendChild(el('div','note tiny muted','本月沒有還卡紀錄。還卡請用「記一筆 → 轉帳」，不要記成支出。'));
  }

  var charged = C.cardCharged(S.entries, ym);
  if(charged>0){
    var fn = el('div','tiny muted'); fn.style.marginTop='8px';
    fn.textContent='本月刷卡 '+money(charged)+'，已計入消費構成；何時變成現金流出，看你何時還。';
    cc.appendChild(fn);
  }
  cc.appendChild(callout('info','還款是「現金層 → 信用卡層」的資金搬運，不是消費，所以不影響上方的支出構成。'));
  host.appendChild(cc);

  var cutoff=isCurrentMonth() ? throughDay() : null;
  var series=C.monthlySeries(S.entries, ym, 6, tripMode, cutoff, onlyTripId);
  if(series.monthsWithData>=2){
    host.appendChild(trendChart(series,'expense'));
    host.appendChild(trendChart(series,'income'));
  }

  host.appendChild(incomeCard(cutoff));

  /* 地層剖面 */
  var sc = el('div','card');
  var eb = el('p','eyebrow');
  eb.textContent = tripMode==='only' ? '旅行支出構成' : (tripMode==='all'?'全部支出構成':'日常支出構成');
  sc.appendChild(eb);

  if(!rep.rows.length){
    var em = el('div','empty');
    em.appendChild(el('div','big','本月還沒有紀錄'));
    em.appendChild(el('div','tiny','按下方「＋ 記一筆」開始。第一筆通常是今天的午餐。'));
    sc.appendChild(em);
  } else {
    var strata = el('div','strata');
    var maxShare = rep.rows[0].share || 1;
    rep.rows.forEach(function(r,i){
      var band = el('div','band');
      band.style.background = 'var('+SHADES[Math.min(i,SHADES.length-1)]+')';
      if(i>=4) band.className='band pale';
      band.style.height = (30 + Math.round((r.share/maxShare)*44))+'px';
      if(r.flag) band.className += ' flag';
      if(openCat===r.cat) band.className += ' open';
      band.dataset.cat = r.cat;
      band.onclick = function(){
        if(openCat===r.cat){ openCat=null; }
        else { openCat=r.cat; openAll=false; }
        renderStats();
      };
      band.appendChild(el('span','bn', r.cat));
      var right = el('span','br');
      right.appendChild(el('span','dlt',
        (r.n >= C.BASELINE_MONTHS && r.deltaPct!==null)
          ? ((r.deltaPct>=0?'+':'−')+Math.abs(r.deltaPct*100).toFixed(0)+'%') : '—'));
      right.appendChild(el('span','pct', pct(r.share)));
      right.appendChild(el('span','amt', money(r.amount)));
      band.appendChild(right);
      band.title = r.cat+'：本月 '+money(r.amount)+
        (r.n? '　近三月同期均值 '+money(r.avgSame)+'（n='+r.n+'）' : '　尚無對照');
      strata.appendChild(band);
      if(openCat===r.cat) strata.appendChild(subPanel(r.cat));
    });
    sc.appendChild(strata);
    var lg = el('div','legend');
    lg.appendChild(el('span','','已記錄合計 '+money(rep.total)+'　共 '+rep.count+' 筆'));
    lg.appendChild(el('span','','至 '+throughDay()+' 日'));
    sc.appendChild(lg);

    var n = rep.rows.reduce(function(m,r){ return Math.max(m, r.n); }, 0);
    if(tripMode!=='exclude'){
      sc.appendChild(callout('info','切到「日常」檢視才會顯示與近三月的對照。旅行消費不參與基線計算。'));
    } else if(n < C.BASELINE_MONTHS){
      sc.appendChild(callout('info','累積中 · 對照樣本 '+n+'/'+C.BASELINE_MONTHS+
        '。滿三個月才會出現對照與異常提示；在此之前的數字只是本月自己的構成。'));
    } else {
      var flags = rep.rows.filter(function(r){ return r.flag; });
      var muted = rep.rows.filter(function(r){
        return r.reason==='below-floor' && r.deltaPct!==null && r.deltaPct > (C.ANOMALY_RATIO-1);
      });
      if(flags.length){
        flags.forEach(function(r){
          sc.appendChild(callout('warn', r.cat+' 已記錄 '+money(r.amount)+
            '，較近三月同期均值 '+money(r.avgSame)+' 高出 '+(r.deltaPct*100).toFixed(0)+'%。'));
        });
      } else {
        sc.appendChild(callout('info','沒有類別觸發提示。'));
      }
      if(muted.length){
        sc.appendChild(callout('info',
          muted.map(function(r){ return r.cat+' ＋'+(r.deltaPct*100).toFixed(0)+'%'; }).join('、')+
          ' 也高出同期均值 30%，但月均未達 '+C.ANOMALY_FLOOR+' MOP，依你設定的門檻靜音。'));
      }
    }
    if(rep.otherOverWarn){
      sc.appendChild(callout('warn','「其他」佔比超過 10%，代表分類體系需要檢討——到設定新增合適的子類。'));
    }
  }
  host.appendChild(sc);

  /* 偏差圖 */
  if(tripMode==='exclude'){
    var dvc = deviationChart();
    if(dvc) host.appendChild(dvc);
  }

  /* 對照明細 */
  if(tripMode==='exclude' && rep.rows.length){
    var dc = el('div','card');
    dc.appendChild(el('p','eyebrow','與近三月同期對照'));
    var th = el('div','thead');
    th.appendChild(el('span','','類別　／　近三月同期均值'));
    th.appendChild(el('span','','本月已記錄'));
    dc.appendChild(th);
    rep.rows.forEach(function(r){
      var row = el('div','row'); row.style.cursor='default';
      var l = el('span','l');
      l.appendChild(el('span','t', r.cat));
      l.appendChild(el('span','sub', r.n ? ('近三月同期均值 '+money(r.avgSame)+'　n='+r.n) : '尚無對照樣本'));
      row.appendChild(l);
      var v = el('span','v', money(r.amount));
      if(r.flag) v.style.color='var(--alert)';
      row.appendChild(v);
      dc.appendChild(row);
    });
    host.appendChild(dc);
  }

  /* 帳戶別 */
  var accRows = C.byAccount(S.entries, ym);
  if(accRows.length){
    var ac = el('div','card');
    ac.appendChild(el('p','eyebrow','帳戶別支出 · 本月變動'));
    var th4 = el('div','thead');
    th4.appendChild(el('span','','帳戶層　·　帳戶'));
    th4.appendChild(el('span','','支出'));
    ac.appendChild(th4);
    accRows.forEach(function(r){
      var row = el('div','row'); row.style.cursor='default';
      var l = el('span','l'); l.appendChild(el('span','t', r.label));
      row.appendChild(l);
      row.appendChild(el('span','v', money(r.amount)));
      ac.appendChild(row);
    });
    host.appendChild(ac);
  }
}

/* ── 記一筆 ───────────────────────────────────────────── */
var draft = null;
function newDraft(type){
  return { type:type||'expense', amount:'', cat:null, sub:null,
           pay:null, acct:null, fromPay:null, fromAcct:null, toPay:null, toAcct:null,
           date:C.todayISO(), currency:S.lastCurrency||'MOP', rate:'',
           merchant:'', note:'', showMore:false, fromTemplate:null, editId:null };
}
function canSave(){
  if(!(Number(draft.amount)>0)) return false;
  if(draft.currency!=='MOP' && !(Number(draft.rate)>0)) return false;
  if(draft.type==='transfer'){
    if(!draft.fromPay || !draft.fromAcct || !draft.toPay || !draft.toAcct) return false;
    if(draft.fromPay===draft.toPay && draft.fromAcct===draft.toAcct) return false;
    return true;
  }
  return !!(draft.cat && draft.sub && draft.pay && draft.acct);
}
function syncSave(){
  var b=document.getElementById('fSave'); if(b) b.disabled = !canSave();
}

function acctPicker(card, labelText, layerKey, acctKey){
  card.appendChild(lbl(labelText));
  var lay = el('div','chips');
  C.LAYERS.forEach(function(L){
    var b=el('button','chip',L);
    b.setAttribute('aria-pressed', draft[layerKey]===L?'true':'false');
    b.onclick=function(){
      draft[layerKey]=L;
      draft[acctKey]=C.topOf(accts(L), (S.freq['acct_'+L]||{}));
      renderAdd();
    };
    lay.appendChild(b);
  });
  card.appendChild(lay);
  if(draft[layerKey]){
    var wrap = el('div','chips'); wrap.style.marginTop='6px';
    C.sortByFreq(accts(draft[layerKey]), S.freq['acct_'+draft[layerKey]]||{}).forEach(function(a){
      var b=el('button','chip',a);
      b.setAttribute('aria-pressed', draft[acctKey]===a?'true':'false');
      b.onclick=function(){ draft[acctKey]=a; renderAdd(); };
      wrap.appendChild(b);
    });
    card.appendChild(wrap);
  }
}

function renderAdd(){
  var host = document.getElementById('v-add');
  host.textContent='';
  if(!draft) draft = newDraft();
  var card = el('div','card');

  /* 型別 */
  var seg = el('div','chips'); seg.style.paddingTop='13px';
  [['expense','支出'],['income','收入'],['transfer','轉帳']].forEach(function(p){
    var b = el('button','chip',p[1]);
    b.setAttribute('aria-pressed', draft.type===p[0]?'true':'false');
    b.onclick=function(){
      var a=draft.amount, d=draft.date;
      draft=newDraft(p[0]); draft.amount=a; draft.date=d;
      if(p[0]==='transfer'){ draft.fromPay=C.CASH; draft.toPay=C.CARD;
        draft.fromAcct=C.topOf(accts(C.CASH), S.freq['acct_'+C.CASH]||{});
        draft.toAcct=C.topOf(accts(C.CARD), S.freq['acct_'+C.CARD]||{}); }
      renderAdd();
    };
    seg.appendChild(b);
  });
  card.appendChild(seg);

  /* 範本 */
  if(draft.type==='expense' && S.templates.length){
    card.appendChild(lbl('固定支出範本'));
    var tc = el('div','chips');
    S.templates.forEach(function(t){
      var b = el('button','chip', t.name);
      b.setAttribute('aria-pressed', draft.fromTemplate===t.id?'true':'false');
      b.onclick=function(){
        draft.amount=String(t.amount); draft.cat=t.cat; draft.sub=t.sub;
        draft.pay=t.pay; draft.acct=t.acct; draft.currency=t.currency||'MOP';
        draft.fromTemplate=t.id;
        renderAdd(); toast('已帶入「'+t.name+'」，按確認才會記錄');
      };
      tc.appendChild(b);
    });
    card.appendChild(tc);
  }

  /* 金額 */
  card.appendChild(lbl('金額'));
  var ar = el('div','amount-row');
  var amt = el('input'); amt.type='text'; amt.inputMode='decimal'; amt.id='fAmount';
  amt.placeholder='0.00'; amt.value=draft.amount;
  amt.oninput=function(){ draft.amount=amt.value; syncSave(); };
  ar.appendChild(amt);
  var cur = el('select'); cur.id='fCurrency';
  C.CURRENCIES.forEach(function(c){
    var o=el('option','',c); o.value=c; if(c===draft.currency)o.selected=true; cur.appendChild(o);
  });
  cur.onchange=function(){
    draft.currency=cur.value;
    draft.rate = cur.value==='MOP' ? ''
      : String(S.rates[cur.value] || C.DEFAULT_RATES[cur.value] || '');
    renderAdd();
  };
  ar.appendChild(cur);
  card.appendChild(ar);

  if(draft.currency!=='MOP'){
    card.appendChild(lbl('匯率　1 '+draft.currency+' = ? MOP'));
    var rt = el('input'); rt.type='text'; rt.inputMode='decimal'; rt.id='fRate';
    rt.value = draft.rate || (S.rates[draft.currency] || C.DEFAULT_RATES[draft.currency] || '');
    draft.rate = rt.value;
    rt.oninput=function(){ draft.rate=rt.value; syncSave(); };
    card.appendChild(rt);
    var prev = Number(draft.rate||0)*Number(draft.amount||0);
    if(prev>0){
      var p=el('div','tiny muted'); p.style.marginTop='5px';
      p.textContent='折合 MOP '+money(C.round2(prev));
      card.appendChild(p);
    }
  }

  if(draft.type==='transfer'){
    acctPicker(card, '轉出帳戶', 'fromPay', 'fromAcct');
    acctPicker(card, '轉入帳戶', 'toPay', 'toAcct');
    if(draft.fromPay===C.CASH && draft.toPay===C.CARD){
      var ok2=el('div','tiny muted'); ok2.style.marginTop='6px';
      ok2.textContent='這是還卡數：現金流出、卡數減少，支出構成不受影響。';
      card.appendChild(ok2);
    }
    if(draft.fromPay===draft.toPay && draft.fromAcct===draft.toAcct && draft.fromAcct){
      card.appendChild(callout('warn','轉出與轉入不能是同一個帳戶。'));
    }
  } else {
    /* 大類 */
    card.appendChild(lbl(draft.type==='income'?'收入類別':'大類'));
    var catsAll = (draft.type==='income'?C.INCOME_CATS:C.CATS).map(function(c){return c.name;});
    var freqKey = draft.type==='income'?'icat':'cat';
    var grid = el('div','grid2');
    C.sortByFreq(catsAll, S.freq[freqKey]||{}).forEach(function(name){
      var b = el('button','catbtn', name);
      b.setAttribute('aria-pressed', draft.cat===name?'true':'false');
      b.onclick=function(){
        draft.cat=name;
        draft.sub = C.topOf(subsOf(name, draft.type), (S.freq['sub_'+name]||{}));
        if(!draft.pay){
          draft.pay = C.topOf(C.LAYERS, S.freq.pay||{});
          draft.acct = C.topOf(accts(draft.pay), S.freq['acct_'+draft.pay]||{});
        }
        renderAdd();
      };
      grid.appendChild(b);
    });
    card.appendChild(grid);

    if(draft.cat){
      card.appendChild(lbl('子類'));
      var sc2 = el('div','chips');
      C.sortByFreq(subsOf(draft.cat, draft.type), S.freq['sub_'+draft.cat]||{}).forEach(function(s){
        var b=el('button','chip',s);
        b.setAttribute('aria-pressed', draft.sub===s?'true':'false');
        b.onclick=function(){ draft.sub=s; renderAdd(); };
        sc2.appendChild(b);
      });
      var addb = el('button','chip add','＋ 新增子類');
      addb.onclick=function(){
        var v = prompt('在「'+draft.cat+'」下新增子類');
        if(v && v.trim()){
          S.subs[draft.cat] = S.subs[draft.cat]||[];
          if(S.subs[draft.cat].indexOf(v.trim())<0) S.subs[draft.cat].push(v.trim());
          draft.sub = v.trim(); save(); renderAdd();
        }
      };
      sc2.appendChild(addb);
      card.appendChild(sc2);
    }
    acctPicker(card, draft.type==='income'?'入帳帳戶':'付款帳戶', 'pay', 'acct');
  }

  /* 日期 */
  card.appendChild(lbl('日期'));
  var dt = el('input'); dt.type='date'; dt.id='fDate'; dt.value=draft.date;
  dt.onchange=function(){ draft.date=dt.value; renderAdd(); };
  card.appendChild(dt);
  var tid = C.tripForDate(S.trips, draft.date);
  if(tid && draft.type==='expense'){
    var tb = el('div','tiny'); tb.style.marginTop='6px';
    tb.appendChild(el('span','muted','這天在行程期間內，會自動歸入'));
    tb.appendChild(el('span','tripbadge', tripName(tid)));
    card.appendChild(tb);
  }

  /* 更多 */
  if(!draft.showMore){
    var mb = el('button','more','＋ 店家與備註');
    mb.onclick=function(){ draft.showMore=true; renderAdd(); };
    card.appendChild(mb);
  } else {
    card.appendChild(lbl('店家／地點'));
    var mk = el('input'); mk.id='fMerchant'; mk.value=draft.merchant;
    mk.oninput=function(){ draft.merchant=mk.value; };
    card.appendChild(mk);
    card.appendChild(lbl('備註'));
    var nt2 = el('input'); nt2.id='fNote'; nt2.value=draft.note;
    nt2.oninput=function(){ draft.note=nt2.value; };
    card.appendChild(nt2);
  }

  var ok = el('button','btn', draft.editId?'儲存修改':(draft.fromTemplate?'確認記錄':'記錄'));
  ok.id='fSave'; ok.disabled=!canSave(); ok.onclick=commit;
  card.appendChild(ok);
  if(draft.editId){
    var cancel = el('button','btn ghost sm','取消修改');
    cancel.onclick=function(){ draft=null; go('log'); };
    card.appendChild(cancel);
  }
  host.appendChild(card);
}

function commit(){
  var base = {
    id: draft.editId || uid(),
    type: draft.type,
    date: draft.date,
    currency: draft.currency,
    amount: C.round2(Number(draft.amount)),
    rate: draft.currency==='MOP' ? 1 : Number(draft.rate),
    merchant: draft.merchant||'', note: draft.note||'',
    createdAt: new Date().toISOString()
  };
  var e;
  if(draft.type==='transfer'){
    e = Object.assign(base, {
      fromPay: draft.fromPay, fromAcct: draft.fromAcct,
      toPay: draft.toPay, toAcct: draft.toAcct, tripId: null
    });
  } else {
    e = Object.assign(base, {
      cat: draft.cat, sub: draft.sub, pay: draft.pay, acct: draft.acct,
      tripId: draft.type==='expense' ? C.tripForDate(S.trips, draft.date) : null
    });
  }
  if(draft.editId){
    var keep = S.entries.filter(function(x){return x.id===draft.editId;})[0];
    if(keep && keep.tripOverride){ e.tripId = keep.tripId; e.tripOverride = true; }
    S.entries = S.entries.map(function(x){ return x.id===draft.editId ? e : x; });
  } else {
    S.entries.push(e);
    if(draft.type==='transfer'){
      C.bumpFreq(S.freq, ['acct_'+e.fromPay, e.fromAcct]);
      C.bumpFreq(S.freq, ['acct_'+e.toPay, e.toAcct]);
    } else {
      C.bumpFreq(S.freq, [draft.type==='income'?'icat':'cat', e.cat]);
      C.bumpFreq(S.freq, ['sub_'+e.cat, e.sub]);
      C.bumpFreq(S.freq, ['pay', e.pay]);
      C.bumpFreq(S.freq, ['acct_'+e.pay, e.acct]);
    }
    S.sinceExport = (S.sinceExport||0)+1;
  }
  if(e.currency!=='MOP'){ S.rates[e.currency]=e.rate; S.lastCurrency=e.currency; }
  else S.lastCurrency='MOP';
  save();
  var wasEdit = !!draft.editId;
  draft=null;
  ym = C.ymOf(e.date);
  toast(wasEdit?'已儲存修改':'已記錄 '+money(C.toMOP(e))+' MOP');
  go(wasEdit?'log':'stats');
}

/* ── 紀錄 ─────────────────────────────────────────────── */
var logFilters = {};
var logFiltersOpen = false;

function renderLog(){
  var host=document.getElementById('v-log'); host.textContent='';
  var panel=el('details','card log-filters');
  panel.open=logFiltersOpen;
  panel.ontoggle=function(){ if(panel.isConnected) logFiltersOpen=panel.open; };
  panel.appendChild(el('summary','','搜尋及篩選'));
  var grid=el('div','log-fields');
  panel.appendChild(grid);
  host.appendChild(panel);
  var results=el('div');
  host.appendChild(results);

  function addField(key, title, control){
    var label=lbl(title);
    control.id='log-'+key;
    label.htmlFor=control.id;
    var field=el('div');
    field.appendChild(label); field.appendChild(control); grid.appendChild(field);
    control.value=logFilters[key] || '';
    control.addEventListener(control.tagName==='SELECT'?'change':'input', function(){
      logFilters[key]=control.value;
      update();
    });
  }
  function option(select, value, title){ select.add(new Option(title,value)); }
  var scope=el('select');
  option(scope,'','所選月份（'+ym+'）'); option(scope,'all','全部月份');
  addField('scope','搜尋範圍',scope);
  var keyword=el('input'); keyword.type='search'; keyword.placeholder='輸入部分商戶名稱';
  addField('keyword','搜尋商戶',keyword);
  var merchant=el('select');
  option(merchant,'','全部商戶');
  var names=new Set(S.entries.map(function(e){return e.merchant;}).filter(Boolean));
  if(logFilters.merchant) names.add(logFilters.merchant);
  Array.from(names).sort(function(a,b){return a.localeCompare(b,'zh-Hant');})
    .forEach(function(name){option(merchant,name,name);});
  addField('merchant','指定商戶',merchant);
  var category=el('select');
  option(category,'','全部大類');
  C.CATS.forEach(function(c){ option(category,'expense/'+c.name,'支出 · '+c.name); });
  C.INCOME_CATS.forEach(function(c){ option(category,'income/'+c.name,'收入 · '+c.name); });
  option(category,'transfer','轉帳');
  addField('category','大類',category);
  var amount=el('input'); amount.type='number'; amount.min='0'; amount.step='any';
  amount.inputMode='decimal'; amount.placeholder='不限';
  addField('amount','單筆金額超過（MOP）',amount);
  var from=el('input'); from.type='date'; addField('from','開始日期',from);
  var to=el('input'); to.type='date'; addField('to','結束日期',to);
  var clear=el('button','btn ghost sm','清除篩選');
  clear.onclick=function(){
    logFilters={};
    grid.querySelectorAll('input,select').forEach(function(c){c.value='';});
    update();
  };
  panel.appendChild(clear);
  function update(){
    var error='';
    if(from.value && to.value && from.value>to.value) error='開始日期須早於或等於結束日期。';
    if(!amount.validity.valid) error='請輸入零或以上的金額。';
    results.textContent='';
    if(error){ results.appendChild(el('p','note',error)); return; }
    var query=keyword.value.trim().toLowerCase();
    var list=S.entries.filter(function(e){
      return (scope.value==='all' || C.ymOf(e.date)===ym)
        && (!query || (e.merchant||'').toLowerCase().includes(query))
        && (!category.value || category.value===(e.type==='transfer'?'transfer':e.type+'/'+e.cat))
        && (!merchant.value || e.merchant===merchant.value)
        && (!from.value || e.date>=from.value) && (!to.value || e.date<=to.value)
        && (!amount.value || C.toMOP(e)>Number(amount.value));
    }).sort(function(a,b){ return a.date<b.date?1:(a.date>b.date?-1:((a.createdAt||'')<(b.createdAt||'')?1:-1)); });
    var filtered=!!(query || category.value || merchant.value || from.value || to.value || amount.value);
    panel.querySelector('summary').textContent='搜尋及篩選'+(filtered || scope.value?' · 已套用':'');
    renderLogResults(results,list,scope.value==='all'?'全部月份':ym.replace('-',' 年 ')+' 月',filtered);
  }
  update();
}

function renderLogResults(host,list,period,filtered){
  var card=el('div','card');
  var totExp = C.sumMOP(list.filter(function(e){return e.type==='expense';}));
  card.appendChild(el('p','eyebrow', period+'　'+list.length+' 筆　支出合計 '+money(totExp)));

  if(!list.length){
    var em=el('div','empty');
    em.appendChild(el('div','big',filtered?'沒有符合條件的紀錄':period+'沒有紀錄'));
    em.appendChild(el('div','tiny',filtered?'可調整搜尋條件，或將搜尋範圍改為全部月份。':'切到「＋ 記一筆」新增紀錄。'));
    card.appendChild(em);
  } else {
    var byDay={};
    list.forEach(function(e){ (byDay[e.date]=byDay[e.date]||[]).push(e); });
    Object.keys(byDay).sort().reverse().forEach(function(d){
      var g=el('div','daygroup');
      var hd=el('div','dayhd');
      hd.appendChild(el('span','d', d));
      var parts=[];
      var de=byDay[d].filter(function(e){return e.type==='expense';});
      var di=byDay[d].filter(function(e){return e.type==='income';});
      var dt2=byDay[d].filter(function(e){return e.type==='transfer';});
      if(de.length) parts.push('支出 '+money(C.sumMOP(de)));
      if(di.length) parts.push('收入 '+money(C.sumMOP(di)));
      if(dt2.length) parts.push('轉帳 '+money(C.sumMOP(dt2)));
      hd.appendChild(el('span','s num', parts.join('　')));
      g.appendChild(hd);
      byDay[d].forEach(function(e){
        var r=el('button','row');
        var l=el('span','l');
        var t=el('span','t');
        t.textContent = e.type==='transfer' ? '轉帳' : (e.cat+' · '+e.sub);
        if(e.tripId) t.appendChild(el('span','tripbadge', tripName(e.tripId)));
        l.appendChild(t);
        var sub=el('span','sub');
        sub.textContent = C.acctLabel(e)
          + (e.currency!=='MOP'? '　'+e.currency+' '+e.amount : '')
          + (e.merchant? '　'+e.merchant : '') + (e.note? '　'+e.note : '');
        l.appendChild(sub);
        r.appendChild(l);
        var v=el('span','v'+(e.type==='income'?' inc':''));
        v.textContent=(e.type==='income'?'+':(e.type==='transfer'?'⇄':''))+money(C.toMOP(e));
        if(e.type==='transfer') v.style.color='var(--mute)';
        r.appendChild(v);
        r.onclick=function(){ openEntry(e); };
        g.appendChild(r);
      });
      card.appendChild(g);
    });
  }
  host.appendChild(card);
}

function openEntry(e){
  var m=el('div','modal'); var sh=el('div','sheet');
  sh.appendChild(el('h3','', e.type==='transfer' ? '轉帳紀錄' : (e.cat+' · '+e.sub)));
  var info=el('div','tiny muted');
  info.textContent = e.date+'　'+C.acctLabel(e)+'　'+
    (e.type==='income'?'收入':(e.type==='transfer'?'轉帳':'支出'))+
    '　'+e.currency+' '+e.amount+(e.currency!=='MOP'? '（匯率 '+e.rate+'）':'')+
    '　= MOP '+money(C.toMOP(e));
  sh.appendChild(info);

  if(e.type==='expense'){
    var tw=el('div'); tw.style.marginTop='14px';
    tw.appendChild(lbl('行程歸屬'));
    var chips=el('div','chips');
    [{id:null,name:'非旅行（算進日常）'}].concat(S.trips.map(function(t){return {id:t.id,name:t.name};}))
      .forEach(function(o){
        var b=el('button','chip',o.name);
        b.setAttribute('aria-pressed', (e.tripId||null)===o.id?'true':'false');
        b.onclick=function(){
          e.tripId=o.id; e.tripOverride=true; save(); m.remove(); renderLog(); renderStats();
          toast('已改為「'+o.name+'」');
        };
        chips.appendChild(b);
      });
    tw.appendChild(chips);
    sh.appendChild(tw);
  }

  var edit=el('button','btn','修改這筆');
  edit.onclick=function(){
    draft=newDraft(e.type);
    draft.editId=e.id; draft.amount=String(e.amount); draft.date=e.date;
    draft.currency=e.currency; draft.rate=e.currency==='MOP'?'':String(e.rate);
    draft.merchant=e.merchant||''; draft.note=e.note||'';
    draft.showMore=!!(e.merchant||e.note);
    if(e.type==='transfer'){
      draft.fromPay=e.fromPay; draft.fromAcct=e.fromAcct;
      draft.toPay=e.toPay; draft.toAcct=e.toAcct;
    } else {
      draft.cat=e.cat; draft.sub=e.sub; draft.pay=e.pay; draft.acct=e.acct;
    }
    m.remove(); go('add');
  };
  sh.appendChild(edit);
  var del=el('button','btn danger','刪除這筆');
  del.onclick=function(){
    if(confirm('刪除這筆紀錄？此動作無法復原。')){
      S.entries=S.entries.filter(function(x){return x.id!==e.id;});
      save(); m.remove(); renderLog(); renderStats(); toast('已刪除');
    }
  };
  sh.appendChild(del);
  var close=el('button','btn ghost','關閉');
  close.onclick=function(){ m.remove(); };
  sh.appendChild(close);
  m.appendChild(sh);
  m.onclick=function(ev){ if(ev.target===m) m.remove(); };
  document.body.appendChild(m);
}

/* ── 設定 ─────────────────────────────────────────────── */
function renderSet(){
  var host=document.getElementById('v-set'); host.textContent='';

  /* 資料 */
  var dc=el('div','card');
  dc.appendChild(el('p','eyebrow','資料'));
  var days = S.lastExport ? Math.floor((Date.now()-new Date(S.lastExport).getTime())/86400000) : null;
  var st=el('div','tiny');
  var line1 = el('div','');
  line1.textContent = S.lastExport
    ? ('距上次匯出 '+days+' 天，期間新增 '+(S.sinceExport||0)+' 筆')
    : ('尚未匯出過，目前累積 '+S.entries.length+' 筆');
  if(days!==null && days>30) line1.style.color='var(--alert)';
  st.appendChild(line1);
  var line2 = el('div','muted'); line2.style.marginTop='4px';
  line2.textContent='資料只存在這台裝置。清除瀏覽器資料或換手機都會歸零，備份靠你自己按下面的按鈕。';
  st.appendChild(line2);
  dc.appendChild(st);
  var b1=el('button','btn sm','匯出 JSON 備份'); b1.onclick=exportJSON; dc.appendChild(b1);
  var b2=el('button','btn ghost sm','匯出 CSV（Excel）'); b2.onclick=exportCSV; dc.appendChild(b2);
  var b3=el('button','btn ghost sm','匯入 JSON 還原（取代全部）');
  b3.onclick=function(){ document.getElementById('importFile').click(); };
  dc.appendChild(b3);
  var fi=el('input'); fi.type='file'; fi.id='importFile'; fi.accept='.json,application/json';
  fi.className='hidden'; fi.onchange=importJSON; dc.appendChild(fi);
  var b4=el('button','btn ghost sm','匯入 CSV（附加紀錄）'); b4.id='btnImportCSV';
  b4.onclick=function(){ document.getElementById('importCSVFile').click(); };
  dc.appendChild(b4);
  var fc=el('input'); fc.type='file'; fc.id='importCSVFile'; fc.accept='.csv,text/csv';
  fc.className='hidden'; fc.onchange=importCSV; dc.appendChild(fc);
  dc.appendChild(hint('CSV 是附加，不會蓋掉現有紀錄；完全一樣的行會自動略過。JSON 才是取代全部的還原。'));
  host.appendChild(dc);

  /* 帳戶 */
  C.LAYERS.forEach(function(L){
    var c=el('div','card');
    c.appendChild(el('p','eyebrow','帳戶 · '+L));
    if(L===C.CARD) c.appendChild(hint('還卡請用「記一筆 → 轉帳」，不要記成支出。到期日只作提醒。'));
    accts(L).forEach(function(a){
      var r=el('div','row'); r.style.cursor='default';
      var l=el('span','l');
      l.appendChild(el('span','t', a));
      var used = S.entries.filter(function(e){
        return (e.pay===L && e.acct===a) || (e.fromPay===L && e.fromAcct===a) || (e.toPay===L && e.toAcct===a);
      }).length;
      l.appendChild(el('span','sub', (L===C.CARD && S.cardDue[a]) ? ('每月 '+S.cardDue[a]+' 日到期　'+used+' 筆') : (used+' 筆')));
      r.appendChild(l);
      if(L===C.CARD){
        var due=el('button','chip', S.cardDue[a]? '改到期日':'設到期日');
        due.onclick=function(){
          var v=prompt('「'+a+'」每月幾號到期？（1–28，留空為清除）', S.cardDue[a]||'');
          if(v===null) return;
          if(v.trim()===''){ delete S.cardDue[a]; save(); renderSet(); return; }
          var d=parseInt(v,10);
          if(!(d>=1&&d<=28)){ toast('到期日要在 1 到 28 之間'); return; }
          S.cardDue[a]=d; save(); renderSet();
        };
        r.appendChild(due);
      }
      var x=el('button','chip','刪'); x.style.marginLeft='6px';
      x.onclick=function(){
        if(used>0){ toast('這個帳戶還有 '+used+' 筆紀錄，不能刪'); return; }
        S.accounts[L]=accts(L).filter(function(y){return y!==a;});
        save(); renderSet();
      };
      r.appendChild(x);
      c.appendChild(r);
    });
    var addA=el('button','btn ghost sm','新增'+L+'帳戶');
    addA.onclick=function(){
      var v=prompt('新增「'+L+'」帳戶名稱');
      if(!v || !v.trim()) return;
      if(accts(L).indexOf(v.trim())>=0){ toast('已經有這個帳戶'); return; }
      S.accounts[L]=accts(L).concat([v.trim()]); save(); renderSet(); toast('已新增');
    };
    c.appendChild(addA);
    host.appendChild(c);
  });

  /* 範本 */
  var tc=el('div','card');
  tc.appendChild(el('p','eyebrow','固定支出範本'));
  tc.appendChild(hint('點一下帶入全部欄位，你仍要按「確認記錄」才會寫入。'));
  if(S.templates.length){
    S.templates.forEach(function(t){
      var r=el('div','row'); r.style.cursor='default';
      var l=el('span','l');
      l.appendChild(el('span','t', t.name));
      l.appendChild(el('span','sub', t.cat+' · '+t.sub+'　'+(t.pay||'')+' · '+(t.acct||'')));
      r.appendChild(l);
      r.appendChild(el('span','v', money(t.amount)));
      var x=el('button','chip','刪'); x.style.marginLeft='6px';
      x.onclick=function(){ S.templates=S.templates.filter(function(y){return y.id!==t.id;}); save(); renderSet(); };
      r.appendChild(x);
      tc.appendChild(r);
    });
  } else {
    tc.appendChild(hint('還沒有範本。房貸、保險、電話費這類每月重複的，建一個就不用再打字。'));
  }
  var addT=el('button','btn ghost sm','新增範本'); addT.onclick=openTemplateForm; tc.appendChild(addT);
  host.appendChild(tc);

  /* 行程 */
  var trc=el('div','card');
  trc.appendChild(el('p','eyebrow','行程'));
  trc.appendChild(hint('行程期間內新增的支出會自動歸入該行程，統計預設不含它們。'));
  if(S.trips.length){
    S.trips.forEach(function(t){
      var r=el('div','row'); r.style.cursor='default';
      var l=el('span','l');
      l.appendChild(el('span','t', t.name));
      l.appendChild(el('span','sub', t.start+' → '+t.end));
      r.appendChild(l);
      var x=el('button','chip','刪');
      x.onclick=function(){
        if(confirm('刪除行程「'+t.name+'」？期間內的消費會回到日常統計。')){
          S.trips=S.trips.filter(function(y){return y.id!==t.id;});
          S.entries.forEach(function(e){ if(e.tripId===t.id) e.tripId=null; });
          save(); renderSet(); renderStats();
        }
      };
      r.appendChild(x);
      trc.appendChild(r);
    });
  } else {
    trc.appendChild(hint('還沒有行程。'));
  }
  var addTr=el('button','btn ghost sm','新增行程'); addTr.onclick=openTripForm; trc.appendChild(addTr);
  host.appendChild(trc);

  /* 規則 */
  var rc=el('div','card');
  rc.appendChild(el('p','eyebrow','這個 app 的規則'));
  [
    ['家庭支出的邊界','先看有沒有別的大類能裝：買菜→日常採買，全家吃飯→餐飲。只有無家可歸的（學費、補習、家用現金）才進家庭支出。'],
    ['對照怎麼算','拿本月 1 到今天，比前三個月同樣的 1 到今天。不比整月，避免月中被騙。'],
    ['什麼時候會提示','某大類超出近三月同期均值 30%，且該類近三月全月均值達 '+C.ANOMALY_FLOOR+' MOP。小額類別永久靜音，這是你選的。'],
    ['為什麼寫「已記錄」','沒有跟帳單對帳，所有數字只代表你記到的，不代表你花掉的。'],
    ['信用卡怎麼算','刷卡當下記消費（那是構成），還卡記成轉帳（那是現金流）。還卡不是消費，記成支出就雙重計算。'],
    ['為什麼沒有帳戶餘額','沒有設期初餘額，所以只看得到「起用以來的變動」，看不到真實餘額。這是你選的取捨。'],
    ['CSV 匯入的規矩','以欄位名稱對應，欄位順序可以亂。金額一律用原幣×匯率重算，不採用「澳門幣金額」那一欄。大類認不得就報錯，不會偷偷丟進「其他」。']
  ].forEach(function(p){
    var d=el('div',''); d.style.marginBottom='10px';
    var t=el('div',''); t.style.fontWeight='700'; t.style.fontSize='13px'; t.style.color='var(--amber)';
    t.textContent=p[0];
    var b=el('div','tiny muted'); b.textContent=p[1];
    d.appendChild(t); d.appendChild(b); rc.appendChild(d);
  });
  var vb=el('div',''); vb.style.marginBottom='10px';
  var vt=el('div',''); vt.style.fontWeight='700'; vt.style.fontSize='13px'; vt.style.color='var(--sky-deep)';
  vt.textContent='版本';
  var vv=el('div','tiny muted');
  vv.innerHTML='';
  vv.appendChild(el('span','num', BUILD));
  vv.appendChild(el('span','', '　手機與電腦看到的版本號一樣，才是同一份。'));
  vb.appendChild(vt); vb.appendChild(vv);
  rc.appendChild(vb);
  var refresh=el('button','btn ghost sm','檢查更新');
  refresh.id='btnForceRefresh';
  refresh.onclick=function(){checkUpdate(true);};
  rc.appendChild(el('p','tiny muted',navigator.serviceWorker && navigator.serviceWorker.controller?
    '已可離線使用':'首次使用請保持連線，讓程式完成離線準備。'));
  rc.appendChild(refresh);

  var wipe=el('button','btn danger sm','清除全部資料');
  wipe.onclick=function(){
    if(confirm('清除全部資料？建議先匯出備份。此動作無法復原。')){
      if(confirm('再確認一次：所有紀錄、範本、行程都會消失。')){
        S=BLANK(); save(); renderAll(); toast('已清除');
      }
    }
  };
  rc.appendChild(wipe);
  host.appendChild(rc);
}

function openTemplateForm(){
  var m=el('div','modal'); var sh=el('div','sheet');
  sh.appendChild(el('h3','','新增固定支出範本'));
  sh.appendChild(lbl('名稱'));
  var nm=el('input'); nm.id='tName'; nm.placeholder='例如：房貸'; sh.appendChild(nm);
  sh.appendChild(lbl('金額（MOP）'));
  var am=el('input'); am.id='tAmount'; am.inputMode='decimal'; sh.appendChild(am);
  sh.appendChild(lbl('大類'));
  var cs=el('select'); cs.id='tCat';
  C.CATS.forEach(function(c){ var o=el('option','',c.name); o.value=c.name; cs.appendChild(o); });
  sh.appendChild(cs);
  sh.appendChild(lbl('子類'));
  var ss=el('select'); ss.id='tSub'; sh.appendChild(ss);
  function fillSubs(){
    ss.textContent='';
    subsOf(cs.value,'expense').forEach(function(s){ var o=el('option','',s); o.value=s; ss.appendChild(o); });
  }
  cs.onchange=fillSubs; fillSubs();
  sh.appendChild(lbl('帳戶層'));
  var ls=el('select'); ls.id='tPay';
  C.LAYERS.forEach(function(L){ var o=el('option','',L); o.value=L; ls.appendChild(o); });
  sh.appendChild(ls);
  sh.appendChild(lbl('帳戶'));
  var as=el('select'); as.id='tAcct'; sh.appendChild(as);
  function fillAccts(){
    as.textContent='';
    accts(ls.value).forEach(function(a){ var o=el('option','',a); o.value=a; as.appendChild(o); });
  }
  ls.onchange=fillAccts; fillAccts();
  var ok=el('button','btn','建立範本');
  ok.onclick=function(){
    if(!nm.value.trim() || !(Number(am.value)>0)){ toast('名稱與金額都要填'); return; }
    S.templates.push({id:uid(),name:nm.value.trim(),amount:C.round2(Number(am.value)),
      cat:cs.value,sub:ss.value,pay:ls.value,acct:as.value,currency:'MOP'});
    save(); m.remove(); renderSet(); toast('已建立範本');
  };
  sh.appendChild(ok);
  var c=el('button','btn ghost','取消'); c.onclick=function(){m.remove();}; sh.appendChild(c);
  m.appendChild(sh); m.onclick=function(e){ if(e.target===m)m.remove(); };
  document.body.appendChild(m);
}

function openTripForm(){
  var m=el('div','modal'); var sh=el('div','sheet');
  sh.appendChild(el('h3','','新增行程'));
  sh.appendChild(lbl('行程名稱'));
  var nm=el('input'); nm.id='trName'; nm.placeholder='例如：大阪'; sh.appendChild(nm);
  sh.appendChild(lbl('出發日'));
  var s1=el('input'); s1.type='date'; s1.id='trStart'; s1.value=C.todayISO(); sh.appendChild(s1);
  sh.appendChild(lbl('回程日'));
  var s2=el('input'); s2.type='date'; s2.id='trEnd'; s2.value=C.todayISO(); sh.appendChild(s2);
  var ok=el('button','btn','建立行程');
  ok.onclick=function(){
    if(!nm.value.trim()){ toast('要有名稱'); return; }
    if(s2.value < s1.value){ toast('回程日不能早於出發日'); return; }
    var t={id:uid(),name:nm.value.trim(),start:s1.value,end:s2.value};
    S.trips.push(t);
    var n=0;
    S.entries.forEach(function(e){
      if(e.type==='expense' && !e.tripOverride && !e.tripId && e.date>=t.start && e.date<=t.end){ e.tripId=t.id; n++; }
    });
    save(); m.remove(); renderSet(); renderStats();
    toast(n? ('已建立，'+n+' 筆既有消費歸入此行程') : '已建立行程');
  };
  sh.appendChild(ok);
  var c=el('button','btn ghost','取消'); c.onclick=function(){m.remove();}; sh.appendChild(c);
  m.appendChild(sh); m.onclick=function(e){ if(e.target===m)m.remove(); };
  document.body.appendChild(m);
}

/* ── 匯出入 ───────────────────────────────────────────── */
function download(name, text, mime){
  var blob=new Blob([text],{type:mime||'application/json;charset=utf-8'});
  var url=URL.createObjectURL(blob);
  var a=el('a'); a.href=url; a.download=name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function(){ URL.revokeObjectURL(url); }, 1500);
}
function stamp(){ return C.todayISO().replace(/-/g,''); }
function exportJSON(){
  download('expenses_'+stamp()+'.json', JSON.stringify(S,null,2));
  S.lastExport=new Date().toISOString(); S.sinceExport=0; save(); renderSet();
  toast('已匯出 JSON');
}
function exportCSV(){
  download('expenses_'+stamp()+'.csv', C.toCSV(S.entries, S.trips), 'text/csv;charset=utf-8');
  toast('已匯出 CSV');
}
function importCSV(ev){
  var f=ev.target.files && ev.target.files[0];
  ev.target.value='';
  if(!f) return;
  var r=new FileReader();
  r.onload=function(){
    var plan;
    try{ plan = C.planCSVImport(String(r.result), S); }
    catch(err){ toast('CSV 解析失敗'); return; }
    openCSVReport(plan);
  };
  r.readAsText(f, 'utf-8');
}

function openCSVReport(plan){
  var m=el('div','modal'); var sh=el('div','sheet');
  sh.appendChild(el('h3','','CSV 匯入預覽'));

  var g=el('div','bal');
  g.appendChild(cell('可匯入', String(plan.entries.length)+' 筆', plan.entries.length?'pos':''));
  g.appendChild(cell('重複略過', String(plan.dupes)+' 筆', ''));
  g.appendChild(cell('有問題', String(plan.errors.length)+' 筆', plan.errors.length?'neg':''));
  g.appendChild(cell('檔案總計', String(plan.total)+' 筆', ''));
  sh.appendChild(g);

  if(plan.errors.length){
    var ec=el('div',''); ec.style.marginTop='12px';
    ec.appendChild(el('div','tiny muted','有問題的行會被跳過，其餘照常匯入：'));
    plan.errors.slice(0,8).forEach(function(x){
      var r2=el('div','row'); r2.style.cursor='default';
      var l=el('span','l');
      l.appendChild(el('span','t','第 '+x.line+' 行'));
      l.appendChild(el('span','sub', x.msg));
      r2.appendChild(l);
      ec.appendChild(r2);
    });
    if(plan.errors.length>8){
      ec.appendChild(el('div','tiny muted','⋯還有 '+(plan.errors.length-8)+' 行有問題'));
    }
    sh.appendChild(ec);
  }

  var ORDER_TXT = {
    ymd:'年／月／日', dmy:'日／月／年', mdy:'月／日／年',
    none:'年／月／日', ambiguous:'無法判斷', conflict:'檔案內互相矛盾'
  };
  if(plan.dateOrder && plan.dateOrder!=='none'){
    var dc2 = el('div', (plan.dateOrder==='dmy'||plan.dateOrder==='mdy') ? 'callout info' : 'callout');
    dc2.style.margin='12px 0 0';
    if(plan.dateOrder==='dmy' || plan.dateOrder==='mdy'){
      dc2.textContent = '日期偵測為 '+ORDER_TXT[plan.dateOrder]+
        '（依整個檔案判斷，不是逐列猜）。若這不對，請在 Excel 把日期欄改成 2026-08-01 再存一次。';
    } else if(plan.dateOrder==='ambiguous'){
      dc2.textContent = '日期分不出日月：整個檔的日與月都在 12 以內，無法判斷順序。'+
        '請在 Excel 把日期欄格式改成 yyyy-mm-dd 再存一次 CSV。';
    } else {
      dc2.textContent = '日期順序矛盾：同一個檔裡既有日／月／年也有月／日／年。'+
        '請在 Excel 統一成 yyyy-mm-dd 再存一次。';
    }
    sh.appendChild(dc2);
  }

  var news=[];
  Object.keys(plan.newAccounts).forEach(function(L){
    news.push('新增'+L+'帳戶：'+plan.newAccounts[L].join('、'));
  });
  Object.keys(plan.newSubs).forEach(function(c){
    news.push('新增「'+c+'」子類：'+plan.newSubs[c].join('、'));
  });
  if(plan.newTrips.length){
    news.push('新建行程：'+plan.newTrips.map(function(t){
      return t.name+'（'+t.start+' → '+t.end+'）'; }).join('、'));
  }
  if(news.length){
    var nc=el('div','callout info'); nc.style.margin='12px 0 0';
    nc.textContent = news.join('；')+'。大類不會被新增——認不得的大類一律當錯誤。';
    sh.appendChild(nc);
  }

  var ok=el('button','btn','匯入這 '+plan.entries.length+' 筆');
  ok.id='csvConfirm';
  ok.disabled = plan.entries.length===0;
  ok.onclick=function(){
    C.applyCSVPlan(S, plan);
    S.sinceExport = (S.sinceExport||0) + plan.entries.length;
    save(); m.remove(); renderAll();
    toast('已匯入 '+plan.entries.length+' 筆');
  };
  sh.appendChild(ok);
  var c=el('button','btn ghost','取消'); c.onclick=function(){ m.remove(); }; sh.appendChild(c);
  m.appendChild(sh); m.onclick=function(e){ if(e.target===m) m.remove(); };
  document.body.appendChild(m);
}

function importJSON(ev){
  var f=ev.target.files && ev.target.files[0];
  if(!f) return;
  var r=new FileReader();
  r.onload=function(){
    var obj;
    try{ obj=JSON.parse(r.result); }
    catch(e){ toast('檔案不是有效的 JSON'); return; }
    var errs=C.validateImport(obj);
    if(errs.length){ alert('匯入失敗：\n'+errs.slice(0,8).join('\n')); return; }
    if(!confirm('匯入會取代目前全部資料（'+S.entries.length+' 筆 → '+obj.entries.length+' 筆）。繼續？')) return;
    var fresh = BLANK();
    for(var k in obj) fresh[k]=obj[k];
    if(!fresh.accounts || !fresh.accounts[C.CASH]) fresh.accounts = BLANK().accounts;
    if(!fresh.cardDue) fresh.cardDue = {};
    S = C.migrate(fresh);
    save(); renderAll(); toast('已匯入 '+S.entries.length+' 筆');
  };
  r.readAsText(f);
  ev.target.value='';
}

/* ── 導覽 ─────────────────────────────────────────────── */
function go(v){
  view=v;
  ['stats','add','log','set'].forEach(function(k){
    document.getElementById('v-'+k).classList.toggle('hidden', k!==v);
  });
  Array.prototype.forEach.call(document.querySelectorAll('#nav button'), function(b){
    b.setAttribute('aria-pressed', b.dataset.v===v?'true':'false');
  });
  document.querySelector('header .seg').classList.toggle('hidden', v!=='stats');
  document.querySelector('header .mo').classList.toggle('hidden', v==='add' || v==='set');
  window.scrollTo(0,0);
  renderAll();
}
function stampCN(){
  var d = C.todayISO();
  return '截至 '+d.slice(0,4)+' 年 '+parseInt(d.slice(5,7),10)+' 月 '+parseInt(d.slice(8,10),10)+' 日　單位：澳門幣';
}
function renderAll(){
  document.getElementById('asof').textContent = stampCN();
  document.getElementById('moLbl').textContent = ym;
  document.getElementById('moNext').disabled = (ym >= C.ymOf(C.todayISO()));
  if(view==='stats') renderStats();
  else if(view==='add') renderAdd();
  else if(view==='log') renderLog();
  else renderSet();
}

document.getElementById('moPrev').onclick=function(){ ym=C.shiftYM(ym,-1); openCat=null; renderAll(); };
document.getElementById('moNext').onclick=function(){ ym=C.shiftYM(ym,1); openCat=null; renderAll(); };
Array.prototype.forEach.call(document.querySelectorAll('#nav button'), function(b){
  b.onclick=function(){ if(b.dataset.v==='add' && view!=='add') draft=null; go(b.dataset.v); };
});
Array.prototype.forEach.call(document.querySelectorAll('#tripSeg button'), function(b){
  b.onclick=function(){
    tripMode=b.dataset.mode; onlyTripId=null; openCat=null;
    Array.prototype.forEach.call(document.querySelectorAll('#tripSeg button'), function(x){
      x.setAttribute('aria-pressed', x===b?'true':'false');
    });
    renderStats();
  };
});

load();
go('add');

/* ── 版本與更新 ───────────────────────────────────────── */
var BUILD = window.__BUILD || 'dev';
var swReg=null, installingUpdate=false, offeredWorker=null;

function offerUpdate(worker){
  if(!worker || !navigator.serviceWorker.controller || offeredWorker===worker) return;
  offeredWorker=worker;
  var box=document.getElementById('updateNotice');
  if(box) box.remove();
  box=el('aside','card update-notice');
  box.id='updateNotice'; box.setAttribute('aria-label','版本更新');
  box.appendChild(el('strong','','有新版本可用'));
  var now=el('button','btn sm','立即更新');
  now.onclick=function(){
    if(worker.state==='redundant'){ box.remove(); checkUpdate(true); return; }
    installingUpdate=true;
    worker.postMessage({type:'SKIP_WAITING'});
  };
  var later=el('button','btn ghost sm','稍後');
  later.onclick=function(){box.remove();};
  box.appendChild(now); box.appendChild(later); document.body.appendChild(box);
}
function checkUpdate(manual){
  if(!navigator.onLine){ if(manual) toast('離線中，連線後可檢查更新'); return; }
  if(!swReg){ if(manual) toast('尚未完成離線準備，請稍後再試'); return; }
  if(manual) offeredWorker=null;
  swReg.update().then(function(){
    if(swReg.waiting) offerUpdate(swReg.waiting);
    else if(manual) toast(swReg.installing?'正在下載版本':'已是最新版本');
  }).catch(function(){if(manual) toast('暫時無法檢查更新');});
}
if('serviceWorker' in navigator){
  navigator.serviceWorker.addEventListener('controllerchange',function(){
    if(installingUpdate){ installingUpdate=false; location.reload(); }
  });
  window.addEventListener('load',function(){
    navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).then(function(reg){
      swReg=reg;
      function watch(){
        var worker=reg.installing;
        if(worker) worker.addEventListener('statechange',function(){
          if(worker.state==='installed') offerUpdate(worker);
        });
      }
      reg.addEventListener('updatefound',watch);
      watch(); offerUpdate(reg.waiting);
      window.addEventListener('online',function(){checkUpdate(false);});
      document.addEventListener('visibilitychange',function(){if(!document.hidden) checkUpdate(false);});
      checkUpdate(false);
    }).catch(function(){});
  });
}
window.__app = { S:S, go:go, setYM:function(v){ ym=v; renderAll(); } };
})();
