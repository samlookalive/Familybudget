import React, { useState, useRef, useContext, createContext, useCallback, useEffect } from "react";

// ══════════════════════════════════════════════════════════════
// Supabase 클라이언트
// ══════════════════════════════════════════════════════════════
const SUPABASE_URL     = "https://cbdgfzbshurlbnpcmqbk.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZGdmemJzaHVybGJucGNtcWJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5NTQwODUsImV4cCI6MjA5NjUzMDA4NX0.dOMQKUCP43oaAtS4akGOibgwdGTwkeBFe5CGmjROgLo";

// Supabase REST API 헬퍼
const sb = {
  url: SUPABASE_URL,
  key: SUPABASE_ANON_KEY,
  headers: (extra={}) => ({
    "Content-Type": "application/json",
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    ...extra,
  }),
  authHeaders: (token, extra={}) => ({
    "Content-Type": "application/json",
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": `Bearer ${token}`,
    ...extra,
  }),

  async from(table) { return `${SUPABASE_URL}/rest/v1/${table}`; },

  async select(table, query="", token=null) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
      headers: token ? sb.authHeaders(token) : sb.headers(),
    });
    return res.json();
  },

  async insert(table, data, token) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: sb.authHeaders(token, { "Prefer": "return=representation" }),
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async update(table, data, match, token) {
    const q = Object.entries(match).map(([k,v])=>`${k}=eq.${v}`).join("&");
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${q}`, {
      method: "PATCH",
      headers: sb.authHeaders(token, { "Prefer": "return=representation" }),
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async delete(table, match, token) {
    const q = Object.entries(match).map(([k,v])=>`${k}=eq.${v}`).join("&");
    await fetch(`${SUPABASE_URL}/rest/v1/${table}?${q}`, {
      method: "DELETE",
      headers: sb.authHeaders(token),
    });
  },

  async upsert(table, data, onConflict, token) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
      method: "POST",
      headers: sb.authHeaders(token, { "Prefer": "return=representation,resolution=merge-duplicates" }),
      body: JSON.stringify(data),
    });
    return res.json();
  },

  // Auth
  async signUp(email, password) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: "POST",
      headers: sb.headers(),
      body: JSON.stringify({ email, password }),
    });
    return res.json();
  },

  async signIn(email, password) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: sb.headers(),
      body: JSON.stringify({ email, password }),
    });
    return res.json();
  },

  async signOut(token) {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: "POST",
      headers: sb.authHeaders(token),
    });
  },

  async getUser(token) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: sb.authHeaders(token),
    });
    return res.json();
  },

  // RPC 호출
  async rpc(fn, params, token) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: token ? sb.authHeaders(token) : sb.headers(),
      body: JSON.stringify(params),
    });
    return res.json();
  },
};

// ══════════════════════════════════════════════════════════════
// 전역 상태 Context
// ══════════════════════════════════════════════════════════════
const AppContext = createContext(null);
const useApp = () => useContext(AppContext);

// ── 카테고리 메타 ─────────────────────────────────────────────
const CATEGORIES = {
  "cat-fixed":    { name:"고정비",     icon:"📌", color:"#6C8EBF" },
  "cat-variable": { name:"변동비",     icon:"🔄", color:"#E8834A" },
  식비:            { name:"식비",       icon:"🍚", color:"#E8834A" },
  교통:            { name:"교통",       icon:"🚌", color:"#E8834A" },
  쇼핑:            { name:"쇼핑",       icon:"🛍️",color:"#E8834A" },
  "의료/건강":     { name:"의료/건강",  icon:"💊", color:"#E8834A" },
  "생활/마트":     { name:"생활/마트",  icon:"🏪", color:"#E8834A" },
  "문화/여가":     { name:"문화/여가",  icon:"🎬", color:"#E8834A" },
  여행:            { name:"여행",       icon:"✈️", color:"#E8834A" },
  월세:            { name:"월세/관리비",icon:"🏠", color:"#6C8EBF" },
  보험:            { name:"보험",       icon:"🛡️", color:"#6C8EBF" },
  구독:            { name:"구독서비스", icon:"📱", color:"#6C8EBF" },
  월급:            { name:"월급",       icon:"💴", color:"#4CAF82" },
};

const CAT_ICON_MAP = {
  식비:"🍚", 교통:"🚌", 쇼핑:"🛍️", "의료/건강":"💊", "생활/마트":"🏪",
  "문화/여가":"🎬", 여행:"✈️", "월세/관리비":"🏠", 구독서비스:"📱", 월급:"💴", 기타:"📦",
};

// ── 초기 더미 거래 내역 ───────────────────────────────────────
const INIT_TRANSACTIONS = [
  { id:"t1", type:"expense", amount:100000, memo:"여름휴가여행", date:"2026-06-01", category:"여행",     is_group:true,  child_count:3, children:[
    { id:"t1a", amount:50000, memo:"숙박비", date:"2026-06-01", category:"여행",  type:"expense" },
    { id:"t1b", amount:30000, memo:"식비",   date:"2026-06-02", category:"식비",  type:"expense" },
    { id:"t1c", amount:20000, memo:"교통비", date:"2026-06-02", category:"교통",  type:"expense" },
  ]},
  { id:"t2", type:"expense", amount:35000,   memo:"이마트 장보기",  date:"2026-06-03", category:"생활/마트", is_group:false },
  { id:"t3", type:"expense", amount:6500,    memo:"스타벅스",       date:"2026-06-03", category:"식비",      is_group:false },
  { id:"t4", type:"income",  amount:3000000, memo:"6월 월급",        date:"2026-06-01", category:"월급",      is_group:false },
  { id:"t5", type:"expense", amount:650000,  memo:"월세",            date:"2026-06-01", category:"월세",      is_group:false },
  { id:"t6", type:"expense", amount:28000,   memo:"버스/지하철",     date:"2026-06-04", category:"교통",      is_group:false },
  { id:"t7", type:"expense", amount:85000,   memo:"넷플릭스+유튜브", date:"2026-06-01", category:"구독",      is_group:false },
  { id:"t8", type:"expense", amount:42000,   memo:"약국",            date:"2026-06-02", category:"의료/건강", is_group:false },
];

const INIT_RECURRING = [
  { id:"r1", name:"넷플릭스",         amount:17000,  amount_type:"fixed",    day_of_month:12, category:"구독",     icon:"📺", is_active:true,  status:"registered"   },
  { id:"r2", name:"유튜브 프리미엄",  amount:14900,  amount_type:"fixed",    day_of_month:15, category:"구독",     icon:"▶️", is_active:true,  status:"registered"   },
  { id:"r3", name:"핸드폰 요금 (남)", amount:55000,  amount_type:"fixed",    day_of_month:17, category:"구독",     icon:"📱", is_active:true,  status:"pending_date" },
  { id:"r4", name:"핸드폰 요금 (아)", amount:49000,  amount_type:"fixed",    day_of_month:17, category:"구독",     icon:"📱", is_active:true,  status:"pending_date" },
  { id:"r5", name:"관리비",           amount:null,   amount_type:"variable", day_of_month:25, category:"월세",     icon:"🏠", is_active:true,  status:"need_input",  last_amount:87000 },
  { id:"r6", name:"전기세",           amount:null,   amount_type:"variable", day_of_month:20, category:"월세",     icon:"⚡", is_active:true,  status:"need_input",  last_amount:42000 },
  { id:"r7", name:"월세",             amount:650000, amount_type:"fixed",    day_of_month:1,  category:"월세",     icon:"🏠", is_active:true,  status:"registered"   },
  { id:"r8", name:"헬스장",           amount:60000,  amount_type:"fixed",    day_of_month:1,  category:"의료/건강",icon:"💪", is_active:false, status:"inactive"     },
];

// 과거 6개월 트렌드 (1~5월은 고정, 6월은 실시간 계산)
const TREND_HISTORY = {
  months:  ["1월","2월","3월","4월","5월"],
  income:  [3000000,3000000,3200000,3000000,3000000],
  expense: [980000,1200000,1500000,1100000,1050000],
};

// ── 카테고리 조회 헬퍼 (키 불일치 방어) ──────────────────────
// transactions의 category 값은 "식비","교통","월세","구독","생활/마트" 등 다양
// CATEGORIES 키와 name 양쪽으로 찾아서 반환
function getCat(category) {
  if (!category) return { name:category, icon:"📦", color:C.accent };
  // 1) 직접 키 매칭
  if (CATEGORIES[category]) return CATEGORIES[category];
  // 2) name 필드 매칭
  const byName = Object.values(CATEGORIES).find(c=>c.name===category);
  if (byName) return byName;
  // 3) CAT_ICON_MAP 매칭
  const icon = CAT_ICON_MAP[category];
  if (icon) return { name:category, icon, color:"#E8834A" };
  return { name:category, icon:"📦", color:"#9CA3AF" };
}

// ── 유틸 ──────────────────────────────────────────────────────
const fmt     = (n) => (n||0).toLocaleString("ko-KR");
const fmtDate = (d) => { try { const [,m,day]=d.split("-"); return `${m}/${day}`; } catch { return d; } };
const uid     = () => "tx_" + Math.random().toString(36).slice(2,10);
const today   = () => new Date().toISOString().split("T")[0];

// ── 색상 팔레트 ───────────────────────────────────────────────
const C = {
  bg:"#F5F6FA", surface:"#FFFFFF", surfaceHigh:"#F0F1F5", border:"#E2E4EC",
  accent:"#5B7FFF", accentSoft:"rgba(91,127,255,0.10)",
  income:"#2DA870", expense:"#E05C2A",
  text:"#1A1D27", textMuted:"#9196A8", textSub:"#5C6070",
  fixed:"#4B78C0", variable:"#E05C2A",
};

// ── 공통 컴포넌트 ─────────────────────────────────────────────
const Tag = ({ children, color }) => (
  <span style={{ fontSize:11, padding:"2px 8px", borderRadius:20, background:color+"22", color, fontWeight:600 }}>{children}</span>
);
const AmountText = ({ amount, type, size=16 }) => (
  <span style={{ fontSize:size, fontWeight:700, color:type==="income"?C.income:C.expense, fontFamily:"'DM Mono',monospace" }}>
    {type==="income"?"+":"-"}{fmt(amount)}원
  </span>
);

// ══════════════════════════════════════════════════════════════
// 전역 통계 계산 함수
// ══════════════════════════════════════════════════════════════
function calcSummary(transactions) {
  const flat = transactions.flatMap(t => t.is_group ? t.children : [t]);
  const income  = flat.filter(t=>t.type==="income" ).reduce((s,t)=>s+t.amount,0);
  const expense = flat.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0);
  return { income, expense, balance: income - expense };
}

function calcCategoryStats(transactions) {
  const flat = transactions.flatMap(t => t.is_group ? t.children : [t]);
  const map = {};
  flat.filter(t=>t.type==="expense").forEach(t => {
    const cat  = CATEGORIES[t.category] || { name:t.category, icon:"📦" };
    const key  = cat.name;
    if (!map[key]) map[key] = { category:key, icon:cat.icon, amount:0 };
    map[key].amount += t.amount;
  });
  const total = Object.values(map).reduce((s,c)=>s+c.amount,0)||1;
  return Object.values(map)
    .map(c=>({ ...c, ratio:Math.round((c.amount/total)*100) }))
    .sort((a,b)=>b.amount-a.amount);
}

function calcFixedVariable(transactions, recurring) {
  const fixedCats  = ["월세","보험","구독","월세/관리비","구독서비스"];
  const flat = transactions.flatMap(t => t.is_group ? t.children : [t]);
  const expenseItems = flat.filter(t=>t.type==="expense");
  const fixed    = expenseItems.filter(t=>fixedCats.some(fc=>t.category.includes(fc)||fc.includes(t.category))).reduce((s,t)=>s+t.amount,0);
  const variable = expenseItems.reduce((s,t)=>s+t.amount,0) - fixed;
  return { fixed: Math.max(fixed,0), variable: Math.max(variable,0) };
}

function calcTrend(transactions) {
  const flat = transactions.flatMap(t=>t.is_group?t.children:[t]);
  const income  = flat.filter(t=>t.type==="income" ).reduce((s,t)=>s+t.amount,0);
  const expense = flat.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0);
  return {
    months:  [...TREND_HISTORY.months, "6월"],
    income:  [...TREND_HISTORY.income,  income],
    expense: [...TREND_HISTORY.expense, expense],
  };
}

// ══════════════════════════════════════════════════════════════
// 홈 화면
// ══════════════════════════════════════════════════════════════
function HomeScreen() {
  const { transactions, recurring, budgets } = useApp();
  const summary  = calcSummary(transactions);
  const catStats = calcCategoryStats(transactions);
  const { fixed, variable } = calcFixedVariable(transactions, recurring);
  const pct = summary.income > 0 ? Math.round((summary.expense/summary.income)*100) : 0;

  // 고정비/변동비 드릴다운
  const [drillDown,    setDrillDown]    = useState(null); // null | "fixed" | "variable"
  // 카테고리 드릴다운
  const [catDrillDown, setCatDrillDown] = useState(null); // null | "식비" | "교통" 등

  const FIXED_CATS  = ["월세","보험","구독","월세/관리비","구독서비스","통신비","교육"];
  const flat = transactions.flatMap(t=>t.is_group?t.children:[t]).filter(t=>t.type==="expense");
  const fixedItems    = flat.filter(t=>FIXED_CATS.some(fc=>t.category===fc||t.category.includes(fc)||fc.includes(t.category)));
  const variableItems = flat.filter(t=>!FIXED_CATS.some(fc=>t.category===fc||t.category.includes(fc)||fc.includes(t.category)));

  const drillItems  = drillDown==="fixed" ? fixedItems : variableItems;
  const drillLabel  = drillDown==="fixed" ? "고정비" : "변동비";
  const drillColor  = drillDown==="fixed" ? C.fixed : C.variable;
  const drillTotal  = drillDown==="fixed" ? fixed : variable;

  return (
    <div style={{ padding:"0 0 80px" }}>

      {/* 드릴다운 바텀시트 */}
      {drillDown && (
        <div style={{ position:"fixed", inset:0, zIndex:300, display:"flex", flexDirection:"column", justifyContent:"flex-end" }}
          onClick={()=>setDrillDown(null)}>
          <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.35)" }} />
          <div onClick={e=>e.stopPropagation()}
            style={{ background:C.surface, borderRadius:"20px 20px 0 0", maxHeight:"75vh", display:"flex", flexDirection:"column",
              border:`1px solid ${C.border}`, position:"relative" }}>
            {/* 핸들 */}
            <div style={{ display:"flex", justifyContent:"center", padding:"12px 0 0" }}>
              <div style={{ width:36, height:4, borderRadius:2, background:C.border }} />
            </div>
            {/* 헤더 */}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 20px 14px" }}>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontSize:20 }}>{drillDown==="fixed"?"📌":"🔄"}</span>
                <div>
                  <p style={{ color:C.text, fontSize:16, fontWeight:700, margin:0 }}>{drillLabel} 상세</p>
                  <p style={{ color:C.textMuted, fontSize:11, margin:0 }}>{drillItems.length}건</p>
                </div>
              </div>
              <div style={{ textAlign:"right" }}>
                <p style={{ color:drillColor, fontSize:18, fontWeight:800, margin:0, fontFamily:"'DM Mono',monospace" }}>
                  -{fmt(drillTotal)}원
                </p>
              </div>
            </div>
            {/* 구분선 */}
            <div style={{ height:1, background:C.border, margin:"0 20px" }} />
            {/* 목록 */}
            <div style={{ overflowY:"auto", flex:1 }}>
              {drillItems.length===0
                ? <p style={{ color:C.textMuted, fontSize:14, textAlign:"center", padding:"32px 0" }}>항목이 없어요</p>
                : drillItems.map((tx,i)=>{
                    const cat = getCat(tx.category);
                    return (
                      <div key={tx.id||i} style={{ display:"flex", alignItems:"center", padding:"13px 20px",
                        borderBottom:`1px solid ${C.border}` }}>
                        <div style={{ width:36, height:36, borderRadius:10, background:(cat.color||C.accent)+"18",
                          display:"flex", alignItems:"center", justifyContent:"center", fontSize:17, marginRight:12, flexShrink:0 }}>
                          {cat.icon}
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <p style={{ color:C.text, fontSize:14, fontWeight:500, margin:"0 0 2px",
                            overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{tx.memo}</p>
                          <p style={{ color:C.textMuted, fontSize:11, margin:0 }}>{fmtDate(tx.date)} · {cat.name}</p>
                        </div>
                        <span style={{ color:C.expense, fontSize:14, fontWeight:700,
                          fontFamily:"'DM Mono',monospace", flexShrink:0, marginLeft:8 }}>
                          -{fmt(tx.amount)}원
                        </span>
                      </div>
                    );
                  })
              }
              {/* 합계 행 */}
              {drillItems.length > 0 && (
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
                  padding:"14px 20px", background:C.surfaceHigh }}>
                  <span style={{ color:C.textMuted, fontSize:13 }}>합계</span>
                  <span style={{ color:drillColor, fontSize:15, fontWeight:800,
                    fontFamily:"'DM Mono',monospace" }}>-{fmt(drillTotal)}원</span>
                </div>
              )}
              <div style={{ height:32 }} />
            </div>
          </div>
        </div>
      )}

      <div style={{ padding:"28px 20px 0", marginBottom:24 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
          <div>
            <p style={{ color:C.textMuted, fontSize:12, margin:0, letterSpacing:1, textTransform:"uppercase" }}>2026년 6월</p>
            <h2 style={{ color:C.text, fontSize:22, margin:"4px 0 0", fontWeight:700 }}>우리집 가계부</h2>
          </div>
          <div style={{ width:38, height:38, borderRadius:12, background:C.accentSoft, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>👨‍👩‍👧</div>
        </div>
      </div>

      {/* 메인 카드 — 지출금액 + 수입 대비 지출 % */}
      <div style={{ margin:"0 16px 16px", background:"linear-gradient(135deg,#EEF2FF,#E8EDFF)", borderRadius:20, padding:"24px", border:`1px solid ${C.border}` }}>
        <p style={{ color:C.textMuted, fontSize:11, margin:"0 0 6px", letterSpacing:1, textTransform:"uppercase" }}>이번 달 지출</p>

        {/* 지출 금액 크게 */}
        <p style={{ color:C.expense, fontSize:36, fontWeight:800, margin:"0 0 4px", fontFamily:"'DM Mono',monospace", letterSpacing:-1, lineHeight:1 }}>
          -{fmt(summary.expense)}<span style={{ fontSize:17, fontWeight:400, color:C.textMuted, marginLeft:4 }}>원</span>
        </p>

        {/* 수입 대비 지출 % */}
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:20 }}>
          <span style={{ color: pct>=100?C.expense:pct>=80?"#E67E22":C.income, fontSize:22, fontWeight:800, fontFamily:"'DM Mono',monospace" }}>
            {pct}%
          </span>
          <span style={{ color:C.textMuted, fontSize:12 }}>수입 대비</span>
          {pct>=100 && <span style={{ background:C.expense, color:"#fff", fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:10 }}>초과</span>}
          {pct>=80 && pct<100 && <span style={{ background:"#E67E22", color:"#fff", fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:10 }}>주의</span>}
        </div>

        {/* 수입 / 잔액 */}
        <div style={{ display:"flex", gap:24 }}>
          <div>
            <p style={{ color:C.textMuted, fontSize:11, margin:"0 0 3px" }}>수입</p>
            <p style={{ color:C.income, fontSize:15, fontWeight:700, margin:0, fontFamily:"'DM Mono',monospace" }}>+{fmt(summary.income)}</p>
          </div>
          <div style={{ width:1, background:C.border }} />
          <div>
            <p style={{ color:C.textMuted, fontSize:11, margin:"0 0 3px" }}>잔액</p>
            <p style={{ color:"#1A1D27", fontSize:15, fontWeight:700, margin:0, fontFamily:"'DM Mono',monospace" }}>{summary.balance>=0?"+":""}{fmt(summary.balance)}</p>
          </div>
        </div>
      </div>

      {/* 예산 진행바 (설정된 경우만) */}
      {budgets.totalEnabled && budgets.total > 0 && (() => {
        const budgetPct  = Math.round((summary.expense / budgets.total) * 100);
        const isWarn     = budgetPct >= 80 && budgetPct < 100;
        const isOver     = budgetPct >= 100;
        const barColor   = isOver ? C.expense : isWarn ? "#E67E22" : C.accent;
        return (
          <div style={{ margin:"0 16px 16px", background:C.surface, borderRadius:16, padding:"16px 18px", border:`1px solid ${isOver?C.expense:isWarn?"#E67E22":C.border}` }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                <span style={{ fontSize:15 }}>💰</span>
                <span style={{ color:C.text, fontSize:13, fontWeight:600 }}>이달 예산</span>
                {isOver && <span style={{ background:C.expense, color:"#fff", fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:10 }}>초과</span>}
                {isWarn && <span style={{ background:"#E67E22", color:"#fff", fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:10 }}>주의</span>}
              </div>
              <span style={{ color:barColor, fontSize:12, fontWeight:700 }}>{budgetPct}%</span>
            </div>
            <div style={{ height:8, background:C.border, borderRadius:8, overflow:"hidden", marginBottom:8 }}>
              <div style={{ width:`${Math.min(budgetPct,100)}%`, height:"100%", borderRadius:8, background:barColor, transition:"width 0.5s" }} />
            </div>
            <div style={{ display:"flex", justifyContent:"space-between" }}>
              <span style={{ color:C.textMuted, fontSize:11 }}>사용 {fmt(summary.expense)}원</span>
              <span style={{ color:C.textMuted, fontSize:11 }}>한도 {fmt(budgets.total)}원</span>
            </div>
          </div>
        );
      })()}

      {/* 고정비 / 변동비 — 클릭하면 드릴다운 */}
      <div style={{ margin:"0 16px 16px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
        {[
          { label:"고정비", amount:fixed,    color:C.fixed,    icon:"📌", key:"fixed",    count:fixedItems.length },
          { label:"변동비", amount:variable, color:C.variable, icon:"🔄", key:"variable", count:variableItems.length },
        ].map(item=>(
          <div key={item.label} onClick={()=>setDrillDown(item.key)}
            style={{ background:C.surface, borderRadius:16, padding:"16px", border:`1px solid ${C.border}`,
              cursor:"pointer", transition:"all 0.15s",
              boxShadow: drillDown===item.key ? `0 0 0 2px ${item.color}` : "none" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                <span style={{ fontSize:16 }}>{item.icon}</span>
                <span style={{ color:C.textMuted, fontSize:12 }}>{item.label}</span>
              </div>
              <span style={{ color:C.textMuted, fontSize:11 }}>›</span>
            </div>
            <p style={{ color:item.color, fontSize:18, fontWeight:700, margin:0, fontFamily:"'DM Mono',monospace" }}>{fmt(item.amount)}</p>
            <p style={{ color:C.textMuted, fontSize:11, margin:"2px 0 0" }}>원 · {item.count}건</p>
          </div>
        ))}
      </div>

      {/* 카테고리별 지출 */}
      {(() => {
        const now = new Date();
        const monthLabel = `${now.getMonth()+1}월`;
        return (
          <div style={{ margin:"0 16px", background:C.surface, borderRadius:16, padding:"18px", border:`1px solid ${C.border}` }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
              <p style={{ color:C.text, fontSize:14, fontWeight:600, margin:0 }}>카테고리별 지출</p>
              <span style={{ color:C.textMuted, fontSize:12 }}>{monthLabel}</span>
            </div>
            {catStats.length===0
              ? <p style={{ color:C.textMuted, fontSize:13, textAlign:"center", margin:"16px 0" }}>아직 지출 내역이 없어요</p>
              : catStats.slice(0,5).map(s=>{
                const cat = getCat(s.category);
                return (
                  <div key={s.category} onClick={()=>setCatDrillDown(s.category)}
                    style={{ marginBottom:12, cursor:"pointer" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:5 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <div style={{ width:28, height:28, borderRadius:8, background:(cat.color||C.accent)+"22", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, flexShrink:0 }}>
                          {cat.icon}
                        </div>
                        <span style={{ color:C.textSub, fontSize:13 }}>{s.category}</span>
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                        <span style={{ color:C.text, fontSize:13, fontWeight:600, fontFamily:"'DM Mono',monospace" }}>{fmt(s.amount)}원</span>
                        <span style={{ color:C.textMuted, fontSize:12 }}>›</span>
                      </div>
                    </div>
                    <div style={{ height:5, background:C.border, borderRadius:4, overflow:"hidden" }}>
                      <div style={{ width:`${s.ratio}%`, height:"100%", borderRadius:4, background:cat.color||C.accent, opacity:0.7, transition:"width 0.4s" }} />
                    </div>
                  </div>
                );
              })
            }
          </div>
        );
      })()}

      {/* 카테고리 드릴다운 바텀시트 */}
      {catDrillDown && (() => {
        const now = new Date();
        const monthLabel = `${now.getMonth()+1}월`;
        const cat = getCat(catDrillDown);
        const catItems = transactions
          .flatMap(t => t.is_group ? t.children : [t])
          .filter(t => t.type==="expense" && t.category===catDrillDown);
        const total = catItems.reduce((s,t)=>s+t.amount, 0);
        return (
          <div style={{ position:"fixed", inset:0, zIndex:300, display:"flex", flexDirection:"column", justifyContent:"flex-end" }}
            onClick={()=>setCatDrillDown(null)}>
            <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.35)" }} />
            <div onClick={e=>e.stopPropagation()}
              style={{ background:C.surface, borderRadius:"20px 20px 0 0", maxHeight:"75vh", display:"flex", flexDirection:"column", border:`1px solid ${C.border}`, position:"relative" }}>
              {/* 핸들 */}
              <div style={{ display:"flex", justifyContent:"center", padding:"12px 0 0" }}>
                <div style={{ width:36, height:4, borderRadius:2, background:C.border }} />
              </div>
              {/* 헤더 */}
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 20px 14px" }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ width:38, height:38, borderRadius:11, background:(cat.color||C.accent)+"22", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 }}>
                    {cat.icon}
                  </div>
                  <div>
                    <p style={{ color:C.text, fontSize:16, fontWeight:700, margin:0 }}>{catDrillDown}</p>
                    <p style={{ color:C.textMuted, fontSize:11, margin:0 }}>{monthLabel} · {catItems.length}건</p>
                  </div>
                </div>
                <p style={{ color:C.expense, fontSize:18, fontWeight:800, margin:0, fontFamily:"'DM Mono',monospace" }}>
                  -{fmt(total)}원
                </p>
              </div>
              <div style={{ height:1, background:C.border, margin:"0 20px" }} />
              {/* 목록 */}
              <div style={{ overflowY:"auto", flex:1 }}>
                {catItems.length===0
                  ? <p style={{ color:C.textMuted, fontSize:14, textAlign:"center", padding:"32px 0" }}>항목이 없어요</p>
                  : catItems.map((tx,i)=>(
                    <div key={tx.id||i} style={{ display:"flex", alignItems:"center", padding:"13px 20px", borderBottom:`1px solid ${C.border}` }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <p style={{ color:C.text, fontSize:14, fontWeight:500, margin:"0 0 2px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{tx.memo}</p>
                        <p style={{ color:C.textMuted, fontSize:11, margin:0 }}>{fmtDate(tx.date)}</p>
                      </div>
                      <span style={{ color:C.expense, fontSize:14, fontWeight:700, fontFamily:"'DM Mono',monospace", flexShrink:0, marginLeft:8 }}>
                        -{fmt(tx.amount)}원
                      </span>
                    </div>
                  ))
                }
                {catItems.length > 0 && (
                  <div style={{ display:"flex", justifyContent:"space-between", padding:"14px 20px", background:C.surfaceHigh }}>
                    <span style={{ color:C.textMuted, fontSize:13 }}>합계</span>
                    <span style={{ color:cat.color||C.expense, fontSize:15, fontWeight:800, fontFamily:"'DM Mono',monospace" }}>-{fmt(total)}원</span>
                  </div>
                )}
                <div style={{ height:32 }} />
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// 거래 내역 화면
// ══════════════════════════════════════════════════════════════
function TransactionsScreen() {
  const { transactions, setTransactions } = useApp();
  const [expandedId,   setExpandedId]   = useState(null);
  const [editingId,    setEditingId]    = useState(null);
  const [editForm,     setEditForm]     = useState({});
  const [typeFilter,   setTypeFilter]   = useState("전체");
  const [showSearch,   setShowSearch]   = useState(false);
  const [searchText,   setSearchText]   = useState("");
  const [minAmount,    setMinAmount]    = useState("");
  const [maxAmount,    setMaxAmount]    = useState("");
  const [catFilter,    setCatFilter]    = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);

  const summary = calcSummary(transactions);
  const CAT_OPTIONS = [...new Set(transactions.flatMap(t=>t.is_group?[t.category,...t.children.map(c=>c.category)]:[t.category]))];
  const activeFilterCount = [searchText,minAmount,maxAmount,catFilter].filter(Boolean).length;

  const startEdit = (tx) => { setEditingId(tx.id); setEditForm({ amount:tx.amount, memo:tx.memo, date:tx.date, category:tx.category }); };

  const saveEdit = (id, isChild, parentId) => {
    setTransactions(prev=>prev.map(tx=>{
      if (isChild && tx.id===parentId) {
        const kids = tx.children.map(c=>c.id===id?{...c,...editForm,amount:Number(editForm.amount)}:c);
        return {...tx, amount:kids.reduce((s,c)=>s+c.amount,0), children:kids};
      }
      if (tx.id===id) return {...tx,...editForm,amount:Number(editForm.amount)};
      return tx;
    }));
    setEditingId(null);
  };

  const requestDelete = (id, isChild, parentId, memo) => setDeleteTarget({ id, isChild, parentId, memo });

  const execDelete = () => {
    const { id, isChild, parentId } = deleteTarget;
    setTransactions(prev=>{
      if (isChild) return prev.map(tx=>{
        if (tx.id!==parentId) return tx;
        const kids = tx.children.filter(c=>c.id!==id);
        return kids.length===0 ? null : {...tx, amount:kids.reduce((s,c)=>s+c.amount,0), child_count:kids.length, children:kids};
      }).filter(Boolean);
      return prev.filter(tx=>tx.id!==id);
    });
    setEditingId(null); setDeleteTarget(null);
  };

  const filtered = transactions.filter(tx=>{
    if (typeFilter==="지출" && tx.type!=="expense") return false;
    if (typeFilter==="수입" && tx.type!=="income")  return false;
    const catName = CATEGORIES[tx.category]?.name||"";
    if (searchText && !tx.memo.includes(searchText) && !catName.includes(searchText)) return false;
    if (minAmount && tx.amount < Number(minAmount)) return false;
    if (maxAmount && tx.amount > Number(maxAmount)) return false;
    if (catFilter && tx.category!==catFilter) return false;
    return true;
  });

  const EditRow = ({ tx, isChild=false, parentId=null }) => (
    <div style={{ background:C.accentSoft, borderRadius:12, padding:"12px", border:`1px solid ${C.accent}44` }}>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:8 }}>
        <div>
          <p style={{ color:C.textMuted, fontSize:11, margin:"0 0 4px" }}>금액</p>
          <input type="number" value={editForm.amount} onChange={e=>setEditForm(f=>({...f,amount:e.target.value}))}
            style={{ width:"100%", background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:"8px 10px", color:C.text, fontSize:14, fontFamily:"'DM Mono',monospace", boxSizing:"border-box" }} />
        </div>
        <div>
          <p style={{ color:C.textMuted, fontSize:11, margin:"0 0 4px" }}>날짜</p>
          <input type="date" value={editForm.date} onChange={e=>setEditForm(f=>({...f,date:e.target.value}))}
            style={{ width:"100%", background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:"8px 10px", color:C.text, fontSize:14, boxSizing:"border-box" }} />
        </div>
      </div>
      <div style={{ marginBottom:10 }}>
        <p style={{ color:C.textMuted, fontSize:11, margin:"0 0 4px" }}>사용처</p>
        <input type="text" value={editForm.memo} onChange={e=>setEditForm(f=>({...f,memo:e.target.value}))}
          style={{ width:"100%", background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:"8px 10px", color:C.text, fontSize:14, boxSizing:"border-box" }} />
      </div>
      <div style={{ display:"flex", gap:8, justifyContent:"space-between" }}>
        <button onClick={()=>requestDelete(tx.id,isChild,parentId,tx.memo)}
          style={{ padding:"7px 12px", borderRadius:8, border:`1px solid ${C.expense}44`, background:"transparent", color:C.expense, fontSize:11, cursor:"pointer" }}>삭제</button>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={()=>setEditingId(null)} style={{ padding:"7px 14px", borderRadius:8, border:`1px solid ${C.border}`, background:"transparent", color:C.textMuted, fontSize:13, cursor:"pointer" }}>취소</button>
          <button onClick={()=>saveEdit(tx.id,isChild,parentId)} style={{ padding:"7px 14px", borderRadius:8, border:"none", background:C.accent, color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer" }}>저장</button>
        </div>
      </div>
    </div>
  );

  const TxRow = ({ tx, isChild=false, parentId=null }) => {
    const cat      = getCat(tx.category);
    const isEditing = editingId===tx.id;
    const isOpen    = expandedId===tx.id;
    return (
      <>
        <div onClick={()=>{ if(isEditing) setEditingId(null); }}
          style={{ display:"flex", alignItems:"center", padding:isChild?"10px 12px 10px 28px":"14px 16px",
            borderBottom:isEditing?"none":`1px solid ${C.border}`,
            background:isEditing?C.accentSoft:isChild?C.surfaceHigh:"transparent",
            cursor:isEditing?"pointer":"default", transition:"background 0.15s" }}>
          <div style={{ width:36, height:36, borderRadius:10, background:(cat.color||C.accent)+"22", display:"flex", alignItems:"center", justifyContent:"center", fontSize:isChild?14:18, marginRight:12, flexShrink:0 }}>
            {cat.icon||"💳"}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              <p style={{ color:C.text, fontSize:isChild?13:14, fontWeight:500, margin:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{tx.memo}</p>
              {tx.is_group && <Tag color={C.accent}>묶음 {tx.child_count}건</Tag>}
            </div>
            <p style={{ color:C.textMuted, fontSize:11, margin:"2px 0 0" }}>{fmtDate(tx.date)} · {cat.name||tx.category}</p>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
            <AmountText amount={tx.amount} type={tx.type||"expense"} size={isChild?13:15} />
            {!tx.is_group && (
              <button onClick={e=>{e.stopPropagation(); isEditing?setEditingId(null):startEdit(tx);}}
                style={{ padding:"5px 12px", borderRadius:7, border:`1px solid ${isEditing?C.accent:C.border}`, background:isEditing?C.accentSoft:"transparent", color:isEditing?C.accent:C.textMuted, fontSize:11, cursor:"pointer" }}>
                {isEditing?"닫기":"수정"}
              </button>
            )}
            {tx.is_group && (
              <button onClick={e=>{e.stopPropagation(); setExpandedId(isOpen?null:tx.id);}}
                style={{ padding:"5px 12px", borderRadius:7, border:`1px solid ${isOpen?C.accent:C.border}`, background:isOpen?C.accentSoft:"transparent", color:isOpen?C.accent:C.textMuted, fontSize:11, fontWeight:600, cursor:"pointer", display:"flex", alignItems:"center", gap:2 }}>
                <span style={{ display:"inline-block", transition:"transform 0.2s", transform:isOpen?"rotate(90deg)":"rotate(0deg)", fontSize:14 }}>›</span>
                <span style={{ fontSize:10 }}>{isOpen?"접기":"열기"}</span>
              </button>
            )}
          </div>
        </div>
        {isEditing && <div style={{ padding:"0 16px 12px", background:C.accentSoft, borderBottom:`1px solid ${C.border}` }}><EditRow tx={tx} isChild={isChild} parentId={parentId} /></div>}
      </>
    );
  };

  return (
    <div style={{ paddingBottom:80 }}>
      {/* 삭제 확인 모달 */}
      {deleteTarget && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", zIndex:300, display:"flex", alignItems:"center", justifyContent:"center", padding:"0 24px" }}>
          <div style={{ background:C.surface, borderRadius:20, padding:"24px", width:"100%", maxWidth:380, border:`1px solid ${C.border}` }}>
            <div style={{ textAlign:"center", marginBottom:20 }}>
              <div style={{ fontSize:40, marginBottom:12 }}>🗑️</div>
              <p style={{ color:C.text, fontSize:16, fontWeight:700, margin:"0 0 8px" }}>정말 삭제할까요?</p>
              <p style={{ color:C.textMuted, fontSize:13, margin:0 }}>
                <span style={{ color:C.text, fontWeight:600 }}>"{deleteTarget.memo}"</span> 항목이<br/>영구적으로 삭제됩니다
              </p>
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={()=>setDeleteTarget(null)} style={{ flex:1, padding:"13px", borderRadius:12, border:`1px solid ${C.border}`, background:"transparent", color:C.textMuted, fontSize:14, cursor:"pointer", fontWeight:600 }}>취소</button>
              <button onClick={execDelete} style={{ flex:1, padding:"13px", borderRadius:12, border:"none", background:C.expense, color:"#fff", fontSize:14, cursor:"pointer", fontWeight:700 }}>삭제</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ padding:"28px 20px 12px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
          <div>
            <p style={{ color:C.textMuted, fontSize:11, margin:0, letterSpacing:1, textTransform:"uppercase" }}>2026년 6월</p>
            <h2 style={{ color:C.text, fontSize:20, margin:"4px 0 0", fontWeight:700 }}>거래 내역</h2>
          </div>
          <button onClick={()=>setShowSearch(s=>!s)}
            style={{ padding:"8px 14px", borderRadius:10, border:`1px solid ${showSearch||activeFilterCount>0?C.accent:C.border}`, background:showSearch||activeFilterCount>0?C.accentSoft:"transparent", color:showSearch||activeFilterCount>0?C.accent:C.textMuted, fontSize:12, fontWeight:600, cursor:"pointer", display:"flex", alignItems:"center", gap:5 }}>
            🔍{activeFilterCount>0&&<span style={{ background:C.accent, color:"#fff", borderRadius:"50%", width:16, height:16, fontSize:10, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700 }}>{activeFilterCount}</span>}
          </button>
        </div>
        <div style={{ display:"flex", gap:6 }}>
          {["전체","지출","수입"].map(f=>(
            <button key={f} onClick={()=>setTypeFilter(f)}
              style={{ padding:"6px 14px", borderRadius:20, border:`1px solid ${typeFilter===f?C.accent:C.border}`, background:typeFilter===f?C.accentSoft:"transparent", color:typeFilter===f?C.accent:C.textMuted, fontSize:12, cursor:"pointer" }}>{f}</button>
          ))}
        </div>
      </div>

      {/* 검색 패널 */}
      {showSearch && (
        <div style={{ margin:"0 16px 14px", background:C.surface, borderRadius:14, padding:"16px", border:`1px solid ${C.accent}44` }}>
          <p style={{ color:C.accent, fontSize:11, fontWeight:600, margin:"0 0 12px" }}>🔍 검색 & 필터</p>
          <div style={{ marginBottom:10 }}>
            <p style={{ color:C.textMuted, fontSize:11, margin:"0 0 5px" }}>메모 / 카테고리 검색</p>
            <input type="text" value={searchText} onChange={e=>setSearchText(e.target.value)} placeholder="예) 마트, 스타벅스, 식비..."
              style={{ width:"100%", background:C.surfaceHigh, border:`1px solid ${C.border}`, borderRadius:8, padding:"9px 12px", color:C.text, fontSize:13, boxSizing:"border-box" }} />
          </div>
          <div style={{ marginBottom:10 }}>
            <p style={{ color:C.textMuted, fontSize:11, margin:"0 0 6px" }}>카테고리</p>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
              <button onClick={()=>setCatFilter("")}
                style={{ padding:"4px 10px", borderRadius:20, border:`1px solid ${catFilter===""?C.accent:C.border}`, background:catFilter===""?C.accentSoft:"transparent", color:catFilter===""?C.accent:C.textMuted, fontSize:11, cursor:"pointer" }}>전체</button>
              {CAT_OPTIONS.map(c=>{ const info=CATEGORIES[c]||{}; return (
                <button key={c} onClick={()=>setCatFilter(catFilter===c?"":c)}
                  style={{ padding:"4px 10px", borderRadius:20, border:`1px solid ${catFilter===c?C.accent:C.border}`, background:catFilter===c?C.accentSoft:"transparent", color:catFilter===c?C.accent:C.textMuted, fontSize:11, cursor:"pointer" }}>
                  {info.icon} {info.name||c}
                </button>
              );})}
            </div>
          </div>
          <div style={{ marginBottom:12 }}>
            <p style={{ color:C.textMuted, fontSize:11, margin:"0 0 6px" }}>금액 범위</p>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <input type="number" value={minAmount} onChange={e=>setMinAmount(e.target.value)} placeholder="최솟값"
                style={{ flex:1, background:C.surfaceHigh, border:`1px solid ${C.border}`, borderRadius:8, padding:"8px 10px", color:C.text, fontSize:13, boxSizing:"border-box", fontFamily:"'DM Mono',monospace" }} />
              <span style={{ color:C.textMuted, fontSize:12 }}>~</span>
              <input type="number" value={maxAmount} onChange={e=>setMaxAmount(e.target.value)} placeholder="최댓값"
                style={{ flex:1, background:C.surfaceHigh, border:`1px solid ${C.border}`, borderRadius:8, padding:"8px 10px", color:C.text, fontSize:13, boxSizing:"border-box", fontFamily:"'DM Mono',monospace" }} />
              <span style={{ color:C.textMuted, fontSize:12, whiteSpace:"nowrap" }}>원</span>
            </div>
          </div>
          <button onClick={()=>{ setSearchText(""); setMinAmount(""); setMaxAmount(""); setCatFilter(""); }}
            style={{ width:"100%", padding:"8px", borderRadius:8, border:`1px solid ${C.border}`, background:"transparent", color:C.textMuted, fontSize:12, cursor:"pointer" }}>필터 초기화</button>
        </div>
      )}

      {/* 월 요약 */}
      <div style={{ margin:"0 16px 16px", background:C.surface, borderRadius:12, padding:"12px 16px", border:`1px solid ${C.border}`, display:"flex", justifyContent:"space-around" }}>
        {[{label:"수입",val:summary.income,color:C.income,sign:"+"},{label:"지출",val:summary.expense,color:C.expense,sign:"-"},{label:"잔액",val:summary.balance,color:C.text,sign:""}].map(s=>(
          <div key={s.label} style={{ textAlign:"center" }}>
            <p style={{ color:C.textMuted, fontSize:11, margin:"0 0 3px" }}>{s.label}</p>
            <p style={{ color:s.color, fontSize:14, fontWeight:700, margin:0, fontFamily:"'DM Mono',monospace" }}>{s.sign}{fmt(s.val)}</p>
          </div>
        ))}
      </div>

      {activeFilterCount>0 && <div style={{ margin:"0 16px 8px" }}><span style={{ color:C.textMuted, fontSize:12 }}>{filtered.length}건 검색됨</span></div>}

      {/* 내역 목록 */}
      <div style={{ background:C.surface, borderRadius:16, margin:"0 16px", border:`1px solid ${C.border}`, overflow:"hidden" }}>
        {filtered.length===0
          ? <div style={{ padding:"40px 20px", textAlign:"center" }}><p style={{ color:C.textMuted, fontSize:32, margin:"0 0 10px" }}>🔍</p><p style={{ color:C.textMuted, fontSize:14, margin:0 }}>검색 결과가 없어요</p></div>
          : filtered.map(tx=>(
            <div key={tx.id}>
              <TxRow tx={tx} />
              {tx.is_group && expandedId===tx.id && (
                <div style={{ background:C.surfaceHigh }}>
                  {tx.children.map(child=>(
                    <div key={child.id}>
                      <TxRow tx={child} isChild parentId={tx.id} />
                      {editingId===child.id && <div style={{ padding:"0 16px 12px", background:C.accentSoft }}><EditRow tx={child} isChild parentId={tx.id} /></div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        }
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// 자연어 입력 화면
// ══════════════════════════════════════════════════════════════
const IMAGE_SYSTEM_PROMPT = `당신은 카드/결제 내역 이미지에서 거래 정보를 추출하는 전문가입니다.
이미지에서 모든 결제 내역을 찾아 반드시 JSON 배열 형태로만 응답하세요.
다른 텍스트, 설명, 마크다운 없이 순수 JSON 배열만 출력하세요.
응답 형식: [{"date":"YYYY-MM-DD","amount":숫자,"memo":"가맹점명","type":"expense","category":"카테고리","confidence":0.0~1.0}]
카테고리 목록: 식비, 교통, 쇼핑, 의료/건강, 생활/마트, 문화/여가, 여행, 월세/관리비, 구독서비스, 월급, 기타
날짜 없으면 오늘(${today()}) 사용. 금액은 원화 숫자만. 인식 불가하면 빈 배열 [] 반환`;

const GROUP_TEXT_PROMPT = `당신은 가계부 묶음 지출 파싱 전문가입니다.
사용자 입력에서 묶음 이름과 세부 항목들을 추출해 JSON으로만 응답하세요.
마크다운, 설명 없이 순수 JSON만 출력하세요.

응답 형식:
{"group_name":"묶음명","category":"카테고리","date":"YYYY-MM-DD","children":[{"memo":"항목명","amount":숫자,"category":"카테고리"}]}

카테고리: 식비, 교통, 쇼핑, 의료/건강, 생활/마트, 문화/여가, 여행, 월세/관리비, 구독서비스, 기타
날짜 없으면 오늘(${today()}) 사용. 금액은 원화 숫자만.`;

const GROUP_IMAGE_PROMPT = `당신은 카드/결제 내역 이미지에서 묶음 지출 정보를 추출하는 전문가입니다.
이미지의 모든 결제 내역을 하나의 묶음으로 묶어 JSON으로만 응답하세요.
마크다운, 설명 없이 순수 JSON만 출력하세요.

응답 형식:
{"group_name":"묶음명","category":"카테고리","date":"YYYY-MM-DD","children":[{"memo":"항목명","amount":숫자,"category":"카테고리"}]}

카테고리: 식비, 교통, 쇼핑, 의료/건강, 생활/마트, 문화/여가, 여행, 월세/관리비, 구독서비스, 기타
날짜 없으면 오늘(${today()}) 사용. 금액은 원화 숫자만.`;

function InputScreen() {
  const { addTransactions, setActiveTab } = useApp();

  // ── 탭 ─────────────────────────────────────────────────────
  const [inputTab, setInputTab] = useState("single"); // single | group

  // ── 단건 상태 ────────────────────────────────────────────────
  const [input,        setInput]        = useState("");
  const [parsed,       setParsed]       = useState(null);
  const [parsedList,   setParsedList]   = useState([]);
  const [step,         setStep]         = useState("input");
  const [isLoading,    setIsLoading]    = useState(false);
  const [loadingMsg,   setLoadingMsg]   = useState("");
  const [imgPreview,   setImgPreview]   = useState(null);
  const [imgBase64,    setImgBase64]    = useState(null);
  const [imgError,     setImgError]     = useState("");
  const [checkedIdx,   setCheckedIdx]   = useState([]);
  const [editingImgIdx,setEditingImgIdx]= useState(null);

  // ── 묶음 상태 ────────────────────────────────────────────────
  const [groupStep,      setGroupStep]      = useState("input"); // input | confirm | done
  const [groupInput,     setGroupInput]     = useState("");
  const [groupParsed,    setGroupParsed]    = useState(null); // {group_name, category, date, children:[]}
  const [groupImgPreview,setGroupImgPreview]= useState(null);
  const [groupImgBase64, setGroupImgBase64] = useState(null);
  const [groupImgError,  setGroupImgError]  = useState("");
  const [groupLoading,   setGroupLoading]   = useState(false);
  const [groupLoadMsg,   setGroupLoadMsg]   = useState("");
  // 직접 입력 모드
  const [groupManual,    setGroupManual]    = useState(false);
  const [manualName,     setManualName]     = useState("");
  const [manualCat,      setManualCat]      = useState("여행");
  const [manualDate,     setManualDate]     = useState(today());
  const [manualChildren, setManualChildren] = useState([{id:"mc1",memo:"",amount:"",category:"식비"}]);

  // ── STT ─────────────────────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false);
  const [sttError,    setSttError]    = useState("");
  const [recSeconds,  setRecSeconds]  = useState(0);
  const recognitionRef = useRef(null);
  const timerRef       = useRef(null);
  const fileRef        = useRef(null);
  const groupFileRef   = useRef(null);

  const QUICK = ["오늘 마트에서 35000원 썼어","어제 버스 1400원","스타벅스 6500원","6월 월급 300만원 들어왔어"];
  const GROUP_QUICK = ["제주여행 숙박 15만 렌트카 8만 식비 3만","결혼식 축의금 10만 교통비 2만 식사 5만","회사 회식 식대 45000 택시 12000"];

  // ── 단건 파싱 (mock) ─────────────────────────────────────────
  const mockParse = (text) => {
    const patterns = [
      {regex:/마트|이마트/,category:"생활/마트"},{regex:/버스|지하철|택시/,category:"교통"},
      {regex:/스타벅스|카페|커피/,category:"식비"},{regex:/월급|급여/,category:"월급",income:true},
      {regex:/약|병원|의료/,category:"의료/건강"},
    ];
    const amtM=text.match(/(\d[\d,]*)(만원|원|만)/);
    let amount=0;
    if(amtM){const r=amtM[1].replace(/,/g,"");amount=amtM[2].includes("만")?Number(r)*10000:Number(r);}
    const m=patterns.find(p=>p.regex.test(text));
    const isIncome=m?.income||/수입|들어왔|입금/.test(text);
    const cat=m?.category||"기타";
    return {type:isIncome?"income":"expense",amount:amount||10000,category:cat,
      icon:CAT_ICON_MAP[cat]||"📦",memo:text.match(/[가-힣a-zA-Z]+/)?.[0]||text.slice(0,6),date:today(),confidence:0.94};
  };

  const handleTextParse = () => {
    if(!input.trim()) return;
    setIsLoading(true); setLoadingMsg("AI가 분석 중...");
    setTimeout(()=>{setParsed(mockParse(input));setStep("confirm");setIsLoading(false);setLoadingMsg("");},700);
  };

  // ── STT ─────────────────────────────────────────────────────
  const startRecording = (setter) => {
    setSttError("");
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR){setSttError("이 브라우저는 음성 인식을 지원하지 않아요 (Chrome 권장)");return;}
    const rec=new SR();rec.lang="ko-KR";rec.continuous=true;rec.interimResults=true;
    let finalText="";
    rec.onresult=(e)=>{
      let interim="";
      for(let i=e.resultIndex;i<e.results.length;i++){const t=e.results[i][0].transcript;if(e.results[i].isFinal)finalText+=t;else interim=t;}
      setter(finalText+interim);
    };
    rec.onerror=(e)=>{setSttError(e.error==="not-allowed"?"마이크 권한을 허용해주세요":`오류: ${e.error}`);stopRecording();};
    rec.onend=()=>stopRecording();
    rec.start();recognitionRef.current=rec;
    setIsRecording(true);setRecSeconds(0);
    timerRef.current=setInterval(()=>setRecSeconds(s=>s+1),1000);
  };
  const stopRecording=()=>{recognitionRef.current?.stop();recognitionRef.current=null;clearInterval(timerRef.current);setIsRecording(false);};
  const fmtSec=(s)=>`${Math.floor(s/60).toString().padStart(2,"0")}:${(s%60).toString().padStart(2,"0")}`;

  // ── 이미지 (단건) ────────────────────────────────────────────
  const handleFileChange=(e)=>{
    const file=e.target.files?.[0];if(!file)return;
    if(!file.type.startsWith("image/")){setImgError("이미지 파일만 업로드할 수 있어요");return;}
    if(file.size>5*1024*1024){setImgError("5MB 이하 이미지만 가능해요");return;}
    setImgError("");
    const reader=new FileReader();
    reader.onload=(ev)=>{setImgPreview(ev.target.result);setImgBase64(ev.target.result.split(",")[1]);};
    reader.readAsDataURL(file);
  };

  const handleImageParse=async()=>{
    if(!imgBase64)return;
    setIsLoading(true);setLoadingMsg("이미지 분석 중...");
    try{
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,system:IMAGE_SYSTEM_PROMPT,
          messages:[{role:"user",content:[{type:"image",source:{type:"base64",media_type:"image/jpeg",data:imgBase64}},{type:"text",text:"이 이미지에서 모든 카드/결제 내역을 추출해주세요."}]}]})});
      const data=await res.json();
      const list=JSON.parse(data.content?.map(b=>b.text||"").join("").trim().replace(/```json|```/g,"").trim());
      if(!Array.isArray(list)||list.length===0){setImgError("결제 내역을 찾지 못했어요.");setIsLoading(false);setLoadingMsg("");return;}
      const enriched=list.map(item=>({...item,icon:CAT_ICON_MAP[item.category]||"📦"}));
      setParsedList(enriched);setCheckedIdx(enriched.map((_,i)=>i));setStep("img_confirm");
    }catch{setImgError("분석 중 오류가 발생했어요.");}
    setIsLoading(false);setLoadingMsg("");
  };

  // ── 이미지 (묶음) ────────────────────────────────────────────
  const handleGroupFileChange=(e)=>{
    const file=e.target.files?.[0];if(!file)return;
    if(!file.type.startsWith("image/")){setGroupImgError("이미지 파일만 업로드할 수 있어요");return;}
    setGroupImgError("");
    const reader=new FileReader();
    reader.onload=(ev)=>{setGroupImgPreview(ev.target.result);setGroupImgBase64(ev.target.result.split(",")[1]);};
    reader.readAsDataURL(file);
  };

  const handleGroupImageParse=async()=>{
    if(!groupImgBase64)return;
    setGroupLoading(true);setGroupLoadMsg("이미지에서 묶음 항목 분석 중...");
    try{
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,system:GROUP_IMAGE_PROMPT,
          messages:[{role:"user",content:[{type:"image",source:{type:"base64",media_type:"image/jpeg",data:groupImgBase64}},{type:"text",text:"이 이미지의 내역들을 하나의 묶음으로 추출해주세요."}]}]})});
      const data=await res.json();
      const parsed=JSON.parse(data.content?.map(b=>b.text||"").join("").trim().replace(/```json|```/g,"").trim());
      if(!parsed?.children?.length){setGroupImgError("항목을 찾지 못했어요.");setGroupLoading(false);setGroupLoadMsg("");return;}
      setGroupParsed(parsed);setGroupStep("confirm");
    }catch{setGroupImgError("분석 중 오류가 발생했어요.");}
    setGroupLoading(false);setGroupLoadMsg("");
  };

  // ── 묶음 자연어 로컬 파서 ────────────────────────────────────
  const parseGroupText = (text) => {
    // 카테고리 키워드 매핑
    const catMap = [
      { regex:/숙박|호텔|펜션|모텔|리조트/,   cat:"여행" },
      { regex:/렌트카|렌터카|택시|버스|기차|항공|비행|ktx/, cat:"교통" },
      { regex:/식비|밥|식사|음식|점심|저녁|아침|카페|커피/, cat:"식비" },
      { regex:/쇼핑|구매|마트|편의점|백화점/,   cat:"쇼핑" },
      { regex:/입장|티켓|관광|여가|영화|공연/,  cat:"문화/여가" },
      { regex:/기념품|선물/,                    cat:"쇼핑" },
      { regex:/주유|기름/,                      cat:"교통" },
      { regex:/약|병원|의료/,                   cat:"의료/건강" },
    ];
    const getCatFromMemo = (memo) => {
      const m = catMap.find(p => p.regex.test(memo));
      return m ? m.cat : "기타";
    };

    // 금액 추출: 숫자+단위 패턴
    const extractAmount = (str) => {
      const m = str.match(/(\d[\d,]*)(\s*)(만원|만|원)/);
      if (!m) return null;
      const n = Number(m[1].replace(/,/g, ""));
      return m[3].includes("만") ? n * 10000 : n;
    };

    // "제주여행 숙박 15만 렌트카 8만 식비 3만" 같은 패턴 파싱
    // 전략: 첫 토큰을 묶음명 후보로 보고, 이후 [메모 금액]+ 패턴 반복 매칭
    const tokens = text.trim().split(/\s+/);
    const children = [];
    let groupName = "";
    let i = 0;

    // 첫 토큰이 금액이 아니면 묶음명
    if (i < tokens.length && !extractAmount(tokens[i])) {
      groupName = tokens[i];
      i++;
    }

    // [메모 금액]+ 반복 파싱
    while (i < tokens.length) {
      const memoToken = tokens[i];
      // 다음 토큰이 금액이면 쌍으로 묶기
      if (i + 1 < tokens.length) {
        const amt = extractAmount(tokens[i + 1]);
        if (amt !== null) {
          const cat = getCatFromMemo(memoToken);
          children.push({ memo: memoToken, amount: amt, category: cat });
          i += 2;
          continue;
        }
      }
      // 현재 토큰 자체에 금액이 포함된 경우: "숙박15만"
      const combined = extractAmount(memoToken);
      if (combined !== null && i > 0) {
        const prevMemo = tokens[i - 1];
        children[children.length - 1] = {
          ...children[children.length - 1],
          amount: combined,
        };
        i++;
        continue;
      }
      // 금액 없는 토큰은 묶음명 후보 (groupName 미설정 시)
      if (!groupName) groupName = memoToken;
      i++;
    }

    // 묶음명 자동 결정
    if (!groupName) groupName = text.split(/\s+/)[0] || "묶음";

    // 메인 카테고리: 첫 항목 또는 묶음명 기준
    const mainCat = catMap.find(p => p.regex.test(groupName))?.cat ||
                    (children[0]?.category) || "기타";

    return {
      group_name: groupName,
      category:   mainCat,
      date:       today(),
      children:   children.length > 0 ? children : [{ memo:"", amount:0, category:"기타" }],
    };
  };

  // ── 묶음 자연어 파싱 (Claude API → 실패 시 로컬 파서) ────────
  const handleGroupTextParse=async()=>{
    if(!groupInput.trim())return;
    setGroupLoading(true);setGroupLoadMsg("묶음 항목 분석 중...");
    try{
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:800,system:GROUP_TEXT_PROMPT,
          messages:[{role:"user",content:groupInput}]})});
      const data=await res.json();
      const parsed=JSON.parse(data.content?.map(b=>b.text||"").join("").trim().replace(/```json|```/g,"").trim());
      if(!parsed?.children?.length) throw new Error("empty");
      setGroupParsed(parsed);setGroupStep("confirm");
    }catch{
      // API 실패 시 로컬 파서로 폴백
      const fallback = parseGroupText(groupInput);
      setGroupParsed(fallback);
      setGroupStep("confirm");
    }
    setGroupLoading(false);setGroupLoadMsg("");
  };

  // ── 직접입력 묶음 저장 ───────────────────────────────────────
  const saveManualGroup=()=>{
    if(!manualName.trim())return;
    const validKids=manualChildren.filter(c=>c.memo&&c.amount).map(c=>({id:uid(),memo:c.memo,amount:Number(c.amount),category:c.category,date:manualDate,type:"expense"}));
    if(!validKids.length)return;
    const total=validKids.reduce((s,c)=>s+c.amount,0);
    addTransactions([{id:uid(),type:"expense",amount:total,memo:manualName,date:manualDate,category:manualCat,is_group:true,child_count:validKids.length,children:validKids}]);
    resetGroup();setActiveTab("transactions");
  };

  // ── AI 파싱 묶음 저장 ────────────────────────────────────────
  const saveGroupParsed=()=>{
    if(!groupParsed)return;
    const kids=groupParsed.children.map(c=>({id:uid(),...c,date:groupParsed.date||today(),type:"expense"}));
    const total=kids.reduce((s,c)=>s+c.amount,0);
    addTransactions([{id:uid(),type:"expense",amount:total,memo:groupParsed.group_name,date:groupParsed.date||today(),category:groupParsed.category||"기타",is_group:true,child_count:kids.length,children:kids}]);
    setGroupStep("done");setTimeout(()=>{resetGroup();setActiveTab("transactions");},1200);
  };

  const resetAll=()=>{
    setStep("input");setInput("");setParsed(null);setParsedList([]);
    setImgPreview(null);setImgBase64(null);setImgError("");setCheckedIdx([]);setEditingImgIdx(null);
    if(fileRef.current)fileRef.current.value="";
  };
  const resetGroup=()=>{
    setGroupStep("input");setGroupInput("");setGroupParsed(null);
    setGroupImgPreview(null);setGroupImgBase64(null);setGroupImgError("");
    setGroupManual(false);setManualName("");setManualCat("여행");setManualDate(today());
    setManualChildren([{id:"mc1",memo:"",amount:"",category:"식비"}]);
    if(groupFileRef.current)groupFileRef.current.value="";
  };

  const toggleCheck=(i)=>setCheckedIdx(p=>p.includes(i)?p.filter(x=>x!==i):[...p,i]);
  const handleSaveSingle=()=>{
    if(!parsed)return;
    addTransactions([{id:uid(),...parsed,is_group:false}]);
    setStep("done");setTimeout(()=>{resetAll();setActiveTab("transactions");},1200);
  };
  const handleSaveMulti=()=>{
    addTransactions(checkedIdx.map(i=>({id:uid(),...parsedList[i],is_group:false})));
    setStep("done");setTimeout(()=>{resetAll();setActiveTab("transactions");},1200);
  };

  // ── 렌더 ────────────────────────────────────────────────────
  return (
    <div style={{padding:"0 0 80px"}}>
      {/* 헤더 + 탭 전환 */}
      <div style={{padding:"28px 20px 0",marginBottom:16}}>
        <p style={{color:C.textMuted,fontSize:11,margin:"0 0 4px",letterSpacing:1,textTransform:"uppercase"}}>AI 입력</p>
        <h2 style={{color:C.text,fontSize:20,margin:"0 0 16px",fontWeight:700}}>무엇을 기록할까요?</h2>
        {/* 일반 / 묶음 탭 */}
        <div style={{display:"flex",background:C.surfaceHigh,borderRadius:12,padding:4,gap:4}}>
          {[{v:"single",label:"일반 항목",icon:"📝"},{v:"group",label:"묶음 항목",icon:"📦"}].map(t=>(
            <button key={t.v} onClick={()=>{setInputTab(t.v);resetAll();resetGroup();}}
              style={{flex:1,padding:"10px",borderRadius:9,border:"none",background:inputTab===t.v?C.accent:"transparent",
                color:inputTab===t.v?"#fff":C.textMuted,fontSize:13,fontWeight:inputTab===t.v?700:400,cursor:"pointer",transition:"all 0.2s",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ════════════════════ 일반 입력 탭 ════════════════════ */}
      {inputTab==="single" && (
        <div style={{padding:"0 16px"}}>

          {step==="done" && (
            <div style={{textAlign:"center",padding:"60px 0"}}>
              <div style={{fontSize:56,marginBottom:16}}>✅</div>
              <p style={{color:C.income,fontSize:18,fontWeight:700,margin:"0 0 8px"}}>저장 완료!</p>
              <p style={{color:C.textMuted,fontSize:13,margin:0}}>내역 탭으로 이동합니다...</p>
            </div>
          )}

          {step==="confirm" && parsed && (
            <div>
              <div style={{background:C.surface,borderRadius:16,padding:"20px",border:`1px solid ${C.border}`,marginBottom:16}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}>
                  <p style={{color:C.textMuted,fontSize:12,margin:0}}>AI가 이렇게 이해했어요 · 수정 가능해요</p>
                  <div style={{display:"flex",alignItems:"center",gap:4}}>
                    <div style={{width:6,height:6,borderRadius:"50%",background:C.income}}/>
                    <span style={{color:C.income,fontSize:11}}>신뢰도 {Math.round(parsed.confidence*100)}%</span>
                  </div>
                </div>
                <div style={{background:C.surfaceHigh,borderRadius:10,padding:"10px 14px",marginBottom:16}}>
                  <p style={{color:C.textMuted,fontSize:11,margin:"0 0 3px"}}>입력 내용</p>
                  <p style={{color:C.textSub,fontSize:13,margin:0}}>"{input}"</p>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${C.border}`}}>
                  <span style={{color:C.textMuted,fontSize:13}}>유형</span>
                  <div style={{display:"flex",gap:6}}>
                    {["expense","income"].map(t=>(
                      <button key={t} onClick={()=>setParsed(p=>({...p,type:t}))}
                        style={{padding:"4px 12px",borderRadius:20,border:`1px solid ${parsed.type===t?(t==="income"?C.income:C.expense):C.border}`,background:parsed.type===t?(t==="income"?C.income+"22":C.expense+"22"):"transparent",color:parsed.type===t?(t==="income"?C.income:C.expense):C.textMuted,fontSize:12,fontWeight:600,cursor:"pointer"}}>
                        {t==="income"?"💰 수입":"💸 지출"}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${C.border}`,gap:12}}>
                  <span style={{color:C.textMuted,fontSize:13,flexShrink:0}}>금액</span>
                  <div style={{display:"flex",alignItems:"center",gap:4}}>
                    <input type="number" value={parsed.amount} onChange={e=>setParsed(p=>({...p,amount:Number(e.target.value)}))}
                      style={{width:110,background:C.surfaceHigh,border:`1px solid ${C.border}`,borderRadius:8,padding:"5px 10px",color:parsed.type==="income"?C.income:C.expense,fontSize:14,fontWeight:700,textAlign:"right",fontFamily:"'DM Mono',monospace"}}/>
                    <span style={{color:C.textMuted,fontSize:13}}>원</span>
                  </div>
                </div>
                <div style={{padding:"10px 0",borderBottom:`1px solid ${C.border}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                    <span style={{color:C.textMuted,fontSize:13}}>카테고리</span>
                    <span style={{color:C.text,fontSize:13,fontWeight:600}}>{parsed.icon} {parsed.category}</span>
                  </div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                    {Object.entries(CAT_ICON_MAP).map(([cat,icon])=>(
                      <button key={cat} onClick={()=>setParsed(p=>({...p,category:cat,icon}))}
                        style={{padding:"4px 10px",borderRadius:16,border:`1px solid ${parsed.category===cat?C.accent:C.border}`,background:parsed.category===cat?C.accentSoft:"transparent",color:parsed.category===cat?C.accent:C.textMuted,fontSize:11,cursor:"pointer"}}>
                        {icon} {cat}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${C.border}`,gap:12}}>
                  <span style={{color:C.textMuted,fontSize:13,flexShrink:0}}>사용처</span>
                  <input type="text" value={parsed.memo} onChange={e=>setParsed(p=>({...p,memo:e.target.value}))}
                    style={{flex:1,background:C.surfaceHigh,border:`1px solid ${C.border}`,borderRadius:8,padding:"5px 10px",color:C.text,fontSize:13,textAlign:"right"}}/>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",gap:12}}>
                  <span style={{color:C.textMuted,fontSize:13,flexShrink:0}}>날짜</span>
                  <input type="date" value={parsed.date} onChange={e=>setParsed(p=>({...p,date:e.target.value}))}
                    style={{background:C.surfaceHigh,border:`1px solid ${C.border}`,borderRadius:8,padding:"5px 10px",color:C.text,fontSize:13}}/>
                </div>
              </div>
              <div style={{display:"flex",gap:10}}>
                <button onClick={resetAll} style={{flex:1,padding:"14px",borderRadius:12,border:`1px solid ${C.border}`,background:"transparent",color:C.textMuted,fontSize:15,cursor:"pointer"}}>다시 입력</button>
                <button onClick={handleSaveSingle} style={{flex:2,padding:"14px",borderRadius:12,border:"none",background:C.accent,color:"#fff",fontSize:15,fontWeight:700,cursor:"pointer"}}>저장하기</button>
              </div>
            </div>
          )}

          {step==="img_confirm" && (
            <div>
              <div style={{display:"flex",alignItems:"center",gap:12,background:C.surface,borderRadius:14,padding:"12px 14px",border:`1px solid ${C.border}`,marginBottom:16}}>
                <img src={imgPreview} alt="" style={{width:52,height:52,borderRadius:8,objectFit:"cover",border:`1px solid ${C.border}`}}/>
                <div>
                  <p style={{color:C.text,fontSize:13,fontWeight:600,margin:"0 0 3px"}}>이미지 분석 완료</p>
                  <p style={{color:C.income,fontSize:12,margin:0}}>{parsedList.length}건 · 탭하면 수정 가능해요</p>
                </div>
              </div>
              <div style={{background:C.surface,borderRadius:16,border:`1px solid ${C.border}`,overflow:"hidden",marginBottom:14}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"11px 16px",borderBottom:`1px solid ${C.border}`,background:C.surfaceHigh}}>
                  <span style={{color:C.textMuted,fontSize:12}}>저장할 항목 선택</span>
                  <button onClick={()=>setCheckedIdx(checkedIdx.length===parsedList.length?[]:[...parsedList.map((_,i)=>i)])}
                    style={{color:C.accent,fontSize:12,fontWeight:600,background:"transparent",border:"none",cursor:"pointer"}}>
                    {checkedIdx.length===parsedList.length?"전체 해제":"전체 선택"}
                  </button>
                </div>
                {parsedList.map((item,i)=>{ const isEO=editingImgIdx===i; return (
                  <div key={i} style={{borderBottom:`1px solid ${C.border}`}}>
                    <div style={{display:"flex",alignItems:"center",padding:"13px 16px",background:isEO?C.accentSoft:"transparent"}}>
                      <div onClick={e=>{e.stopPropagation();toggleCheck(i);}} style={{width:20,height:20,borderRadius:6,border:`2px solid ${checkedIdx.includes(i)?C.accent:C.border}`,background:checkedIdx.includes(i)?C.accent:"transparent",display:"flex",alignItems:"center",justifyContent:"center",marginRight:12,flexShrink:0,cursor:"pointer"}}>
                        {checkedIdx.includes(i)&&<span style={{color:"#fff",fontSize:12,fontWeight:700}}>✓</span>}
                      </div>
                      <div onClick={()=>setEditingImgIdx(isEO?null:i)} style={{flex:1,display:"flex",alignItems:"center",gap:10,cursor:"pointer"}}>
                        <div style={{width:34,height:34,borderRadius:9,background:(CATEGORIES[item.category]?.color||C.accent)+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>{item.icon}</div>
                        <div style={{flex:1,minWidth:0}}>
                          <p style={{color:C.text,fontSize:13,fontWeight:500,margin:"0 0 2px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.memo}</p>
                          <p style={{color:C.textMuted,fontSize:10,margin:0}}>{item.date} · {item.category}</p>
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                          <span style={{color:item.type==="income"?C.income:C.expense,fontSize:13,fontWeight:700,fontFamily:"'DM Mono',monospace"}}>{item.type==="income"?"+":"-"}{fmt(item.amount)}원</span>
                          <span style={{color:isEO?C.accent:C.textMuted,fontSize:11,border:`1px solid ${isEO?C.accent:C.border}`,borderRadius:6,padding:"2px 7px",background:isEO?C.accentSoft:"transparent"}}>{isEO?"닫기":"수정"}</span>
                        </div>
                      </div>
                    </div>
                    {isEO&&(
                      <div style={{padding:"14px 16px",background:"#13172280",borderTop:`1px solid ${C.border}`}}>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                          <div><p style={{color:C.textMuted,fontSize:11,margin:"0 0 4px"}}>금액</p>
                            <input type="number" value={item.amount} onChange={e=>setParsedList(l=>l.map((x,j)=>j===i?{...x,amount:Number(e.target.value)}:x))}
                              style={{width:"100%",background:C.surfaceHigh,border:`1px solid ${C.border}`,borderRadius:8,padding:"7px 10px",color:C.expense,fontSize:13,fontWeight:700,boxSizing:"border-box",fontFamily:"'DM Mono',monospace"}}/></div>
                          <div><p style={{color:C.textMuted,fontSize:11,margin:"0 0 4px"}}>날짜</p>
                            <input type="date" value={item.date} onChange={e=>setParsedList(l=>l.map((x,j)=>j===i?{...x,date:e.target.value}:x))}
                              style={{width:"100%",background:C.surfaceHigh,border:`1px solid ${C.border}`,borderRadius:8,padding:"7px 8px",color:C.text,fontSize:12,boxSizing:"border-box"}}/></div>
                        </div>
                        <div style={{marginBottom:8}}><p style={{color:C.textMuted,fontSize:11,margin:"0 0 4px"}}>사용처</p>
                          <input type="text" value={item.memo} onChange={e=>setParsedList(l=>l.map((x,j)=>j===i?{...x,memo:e.target.value}:x))}
                            style={{width:"100%",background:C.surfaceHigh,border:`1px solid ${C.border}`,borderRadius:8,padding:"7px 10px",color:C.text,fontSize:13,boxSizing:"border-box"}}/></div>
                        <div><p style={{color:C.textMuted,fontSize:11,margin:"0 0 5px"}}>카테고리</p>
                          <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                            {Object.entries(CAT_ICON_MAP).map(([cat,icon])=>(
                              <button key={cat} onClick={()=>setParsedList(l=>l.map((x,j)=>j===i?{...x,category:cat,icon}:x))}
                                style={{padding:"3px 9px",borderRadius:14,border:`1px solid ${item.category===cat?C.accent:C.border}`,background:item.category===cat?C.accentSoft:"transparent",color:item.category===cat?C.accent:C.textMuted,fontSize:10,cursor:"pointer"}}>
                                {icon} {cat}
                              </button>
                            ))}</div></div>
                      </div>
                    )}
                  </div>
                );})}
              </div>
              {checkedIdx.length>0&&(
                <div style={{background:C.accentSoft,borderRadius:10,padding:"10px 14px",marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{color:C.accent,fontSize:13,fontWeight:600}}>{checkedIdx.length}건 선택됨</span>
                  <span style={{color:C.expense,fontSize:13,fontWeight:700,fontFamily:"'DM Mono',monospace"}}>-{fmt(checkedIdx.reduce((s,i)=>s+(parsedList[i].type==="expense"?parsedList[i].amount:0),0))}원</span>
                </div>
              )}
              <div style={{display:"flex",gap:10}}>
                <button onClick={resetAll} style={{flex:1,padding:"14px",borderRadius:12,border:`1px solid ${C.border}`,background:"transparent",color:C.textMuted,fontSize:15,cursor:"pointer"}}>취소</button>
                <button onClick={handleSaveMulti} disabled={checkedIdx.length===0}
                  style={{flex:2,padding:"14px",borderRadius:12,border:"none",background:checkedIdx.length>0?C.accent:C.border,color:"#fff",fontSize:15,fontWeight:700,cursor:checkedIdx.length>0?"pointer":"default"}}>
                  {checkedIdx.length}건 저장하기
                </button>
              </div>
            </div>
          )}

          {step==="input" && (
            <div>
              <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} style={{display:"none"}}/>
              {/* 텍스트 + STT */}
              <div style={{background:C.surface,borderRadius:16,border:`1px solid ${isRecording?C.expense:C.border}`,marginBottom:14,transition:"border-color 0.2s"}}>
                {isRecording&&(
                  <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 14px 0"}}>
                    <div style={{width:8,height:8,borderRadius:"50%",background:C.expense,animation:"pulse 1s ease-in-out infinite"}}/>
                    <span style={{color:C.expense,fontSize:12,fontWeight:600}}>녹음 중</span>
                    <span style={{color:C.textMuted,fontSize:12,fontFamily:"'DM Mono',monospace"}}>{fmtSec(recSeconds)}</span>
                  </div>
                )}
                <div style={{display:"flex",alignItems:"flex-end",gap:4,padding:"4px"}}>
                  <textarea value={input} onChange={e=>setInput(e.target.value)}
                    onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();handleTextParse();}}}
                    placeholder={isRecording?"🎙 음성을 인식하고 있어요...":"예) 오늘 마트에서 35000원 썼어\n어제 버스 1400원 냈어"} rows={3}
                    style={{flex:1,background:"transparent",border:"none",outline:"none",color:C.text,fontSize:15,resize:"none",padding:"10px 10px 10px 14px",fontFamily:"inherit",lineHeight:1.6}}/>
                  <button onClick={isRecording?stopRecording:()=>startRecording(setInput)}
                    style={{width:42,height:42,borderRadius:12,border:`1px solid ${isRecording?"#FF4444":C.border}`,marginBottom:8,background:isRecording?"#FF4444":"transparent",color:isRecording?"#fff":C.textMuted,fontSize:18,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    {isRecording?"⏹":"🎙"}
                  </button>
                  <button onClick={handleTextParse} disabled={!input.trim()||isLoading}
                    style={{margin:"0 8px 8px 0",width:42,height:42,borderRadius:12,border:"none",background:input.trim()?C.accent:C.border,color:"#fff",fontSize:18,cursor:input.trim()?"pointer":"default",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    {isLoading?<div style={{width:16,height:16,border:"2px solid rgba(255,255,255,0.3)",borderTopColor:"#fff",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>:"↑"}
                  </button>
                </div>
              </div>
              {sttError&&<div style={{background:"#FF444411",border:"1px solid #FF444433",borderRadius:10,padding:"8px 12px",marginBottom:12}}><span style={{color:"#FF6666",fontSize:12}}>⚠️ {sttError}</span></div>}

              {imgPreview?(
                <div style={{background:C.surface,borderRadius:16,border:`1px solid ${C.border}`,overflow:"hidden",marginBottom:14}}>
                  <div style={{position:"relative"}}>
                    <img src={imgPreview} alt="" style={{width:"100%",maxHeight:200,objectFit:"contain",background:C.surfaceHigh,display:"block"}}/>
                    <button onClick={()=>{setImgPreview(null);setImgBase64(null);setImgError("");if(fileRef.current)fileRef.current.value="";}}
                      style={{position:"absolute",top:8,right:8,width:28,height:28,borderRadius:"50%",background:"rgba(0,0,0,0.6)",border:"none",color:"#fff",fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
                  </div>
                  <div style={{padding:"12px 14px"}}>
                    <p style={{color:C.textMuted,fontSize:11,margin:"0 0 10px"}}>카드 사용내역, 문자 캡처, 영수증 사진을 분석합니다</p>
                    <button onClick={handleImageParse} disabled={isLoading}
                      style={{width:"100%",padding:"13px",borderRadius:10,border:"none",background:isLoading?C.border:C.accent,color:"#fff",fontSize:14,fontWeight:700,cursor:isLoading?"default":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                      {isLoading?<><div style={{width:16,height:16,border:"2px solid rgba(255,255,255,0.3)",borderTopColor:"#fff",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>{loadingMsg}</>:"🔍 이미지 분석하기"}
                    </button>
                  </div>
                </div>
              ):(
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
                  <button onClick={()=>{if(fileRef.current){fileRef.current.setAttribute("capture","camera");fileRef.current.click();}}}
                    style={{padding:"14px 10px",borderRadius:14,border:`1px dashed ${C.border}`,background:C.surface,color:C.textSub,fontSize:13,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
                    <span style={{fontSize:24}}>📷</span><span style={{fontWeight:600}}>카메라 촬영</span><span style={{fontSize:10,color:C.textMuted}}>영수증 · 문자 화면</span>
                  </button>
                  <button onClick={()=>{if(fileRef.current){fileRef.current.removeAttribute("capture");fileRef.current.click();}}}
                    style={{padding:"14px 10px",borderRadius:14,border:`1px dashed ${C.border}`,background:C.surface,color:C.textSub,fontSize:13,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
                    <span style={{fontSize:24}}>🖼️</span><span style={{fontWeight:600}}>앨범에서 선택</span><span style={{fontSize:10,color:C.textMuted}}>캡처 이미지 · 스크린샷</span>
                  </button>
                </div>
              )}
              {imgError&&<p style={{color:C.expense,fontSize:12,margin:"0 0 12px",textAlign:"center"}}>{imgError}</p>}
              <p style={{color:C.textMuted,fontSize:12,margin:"0 0 8px"}}>빠른 예시</p>
              <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                {QUICK.map(ex=><button key={ex} onClick={()=>setInput(ex)} style={{padding:"8px 14px",borderRadius:20,border:`1px solid ${C.border}`,background:C.surface,color:C.textSub,fontSize:12,cursor:"pointer"}}>{ex}</button>)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════ 묶음 입력 탭 ════════════════════ */}
      {inputTab==="group" && (
        <div style={{padding:"0 16px"}}>

          {groupStep==="done"&&(
            <div style={{textAlign:"center",padding:"60px 0"}}>
              <div style={{fontSize:56,marginBottom:16}}>✅</div>
              <p style={{color:C.income,fontSize:18,fontWeight:700,margin:"0 0 8px"}}>묶음 저장 완료!</p>
              <p style={{color:C.textMuted,fontSize:13,margin:0}}>내역 탭으로 이동합니다...</p>
            </div>
          )}

          {/* AI 파싱 결과 확인 */}
          {groupStep==="confirm"&&groupParsed&&(
            <div>
              <div style={{background:C.surface,borderRadius:16,padding:"18px",border:`1px solid ${C.border}`,marginBottom:14}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                  <p style={{color:C.textMuted,fontSize:12,margin:0}}>묶음으로 파싱됐어요 · 수정 가능해요</p>
                </div>
                {/* 묶음명 */}
                <div style={{marginBottom:10}}>
                  <p style={{color:C.textMuted,fontSize:11,margin:"0 0 4px"}}>묶음 이름</p>
                  <input value={groupParsed.group_name} onChange={e=>setGroupParsed(p=>({...p,group_name:e.target.value}))}
                    style={{width:"100%",background:C.surfaceHigh,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 12px",color:C.text,fontSize:14,fontWeight:600,boxSizing:"border-box"}}/>
                </div>
                {/* 날짜 */}
                <div style={{marginBottom:14}}>
                  <p style={{color:C.textMuted,fontSize:11,margin:"0 0 4px"}}>날짜</p>
                  <input type="date" value={groupParsed.date||today()} onChange={e=>setGroupParsed(p=>({...p,date:e.target.value}))}
                    style={{background:C.surfaceHigh,border:`1px solid ${C.border}`,borderRadius:8,padding:"7px 10px",color:C.text,fontSize:13}}/>
                </div>
                {/* 하위 항목 */}
                <p style={{color:C.textMuted,fontSize:11,margin:"0 0 8px",fontWeight:600}}>세부 항목</p>
                {groupParsed.children.map((child,i)=>(
                  <div key={i} style={{background:C.surfaceHigh,borderRadius:10,padding:"10px 12px",marginBottom:8}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                      <span style={{fontSize:16}}>{CAT_ICON_MAP[child.category]||"📦"}</span>
                      <input value={child.memo} onChange={e=>setGroupParsed(p=>({...p,children:p.children.map((c,j)=>j===i?{...c,memo:e.target.value}:c)}))}
                        style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:7,padding:"6px 10px",color:C.text,fontSize:13,boxSizing:"border-box"}}/>
                      <button onClick={()=>setGroupParsed(p=>({...p,children:p.children.filter((_,j)=>j!==i)}))}
                        style={{padding:"6px 10px",borderRadius:7,border:`1px solid ${C.border}`,background:"transparent",color:C.textMuted,fontSize:12,cursor:"pointer"}}>✕</button>
                    </div>
                    <div style={{display:"flex",gap:8}}>
                      <div style={{flex:1}}>
                        <input type="number" value={child.amount} onChange={e=>setGroupParsed(p=>({...p,children:p.children.map((c,j)=>j===i?{...c,amount:Number(e.target.value)}:c)}))}
                          style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:7,padding:"6px 10px",color:C.expense,fontSize:13,fontWeight:700,fontFamily:"'DM Mono',monospace",boxSizing:"border-box"}}/>
                      </div>
                      <select value={child.category} onChange={e=>setGroupParsed(p=>({...p,children:p.children.map((c,j)=>j===i?{...c,category:e.target.value}:c)}))}
                        style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:7,padding:"6px 8px",color:C.text,fontSize:12,boxSizing:"border-box"}}>
                        {Object.entries(CAT_ICON_MAP).map(([cat,icon])=><option key={cat} value={cat}>{icon} {cat}</option>)}
                      </select>
                    </div>
                  </div>
                ))}
                <button onClick={()=>setGroupParsed(p=>({...p,children:[...p.children,{memo:"",amount:0,category:"기타"}]}))}
                  style={{width:"100%",padding:"8px",borderRadius:8,border:`1px dashed ${C.border}`,background:"transparent",color:C.textMuted,fontSize:12,cursor:"pointer",marginTop:4}}>
                  + 항목 추가
                </button>
                {/* 합계 */}
                <div style={{display:"flex",justifyContent:"flex-end",marginTop:12,paddingTop:12,borderTop:`1px solid ${C.border}`}}>
                  <span style={{color:C.textMuted,fontSize:13}}>합계 </span>
                  <span style={{color:C.expense,fontSize:16,fontWeight:700,fontFamily:"'DM Mono',monospace",marginLeft:8}}>
                    -{fmt(groupParsed.children.reduce((s,c)=>s+(Number(c.amount)||0),0))}원
                  </span>
                </div>
              </div>
              <div style={{display:"flex",gap:10}}>
                <button onClick={resetGroup} style={{flex:1,padding:"14px",borderRadius:12,border:`1px solid ${C.border}`,background:"transparent",color:C.textMuted,fontSize:15,cursor:"pointer"}}>다시 입력</button>
                <button onClick={saveGroupParsed} style={{flex:2,padding:"14px",borderRadius:12,border:"none",background:C.accent,color:"#fff",fontSize:15,fontWeight:700,cursor:"pointer"}}>묶음 저장</button>
              </div>
            </div>
          )}

          {groupStep==="input"&&(
            <div>
              <input ref={groupFileRef} type="file" accept="image/*" onChange={handleGroupFileChange} style={{display:"none"}}/>

              {!groupManual?(
                <>
                  {/* 자연어 입력 */}
                  <div style={{background:C.surface,borderRadius:16,border:`1px solid ${isRecording?C.expense:C.border}`,marginBottom:14,transition:"border-color 0.2s"}}>
                    {isRecording&&(
                      <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 14px 0"}}>
                        <div style={{width:8,height:8,borderRadius:"50%",background:C.expense,animation:"pulse 1s ease-in-out infinite"}}/>
                        <span style={{color:C.expense,fontSize:12,fontWeight:600}}>녹음 중</span>
                        <span style={{color:C.textMuted,fontSize:12,fontFamily:"'DM Mono',monospace"}}>{fmtSec(recSeconds)}</span>
                      </div>
                    )}
                    <div style={{display:"flex",alignItems:"flex-end",gap:4,padding:"4px"}}>
                      <textarea value={groupInput} onChange={e=>setGroupInput(e.target.value)}
                        onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();handleGroupTextParse();}}}
                        placeholder={"예) 제주여행 숙박 15만 렌트카 8만 식비 3만\n결혼식 축의금 10만 교통비 2만"} rows={3}
                        style={{flex:1,background:"transparent",border:"none",outline:"none",color:C.text,fontSize:15,resize:"none",padding:"10px 10px 10px 14px",fontFamily:"inherit",lineHeight:1.6}}/>
                      <button onClick={isRecording?stopRecording:()=>startRecording(setGroupInput)}
                        style={{width:42,height:42,borderRadius:12,border:`1px solid ${isRecording?"#FF4444":C.border}`,marginBottom:8,background:isRecording?"#FF4444":"transparent",color:isRecording?"#fff":C.textMuted,fontSize:18,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                        {isRecording?"⏹":"🎙"}
                      </button>
                      <button onClick={handleGroupTextParse} disabled={!groupInput.trim()||groupLoading}
                        style={{margin:"0 8px 8px 0",width:42,height:42,borderRadius:12,border:"none",background:groupInput.trim()?C.accent:C.border,color:"#fff",fontSize:18,cursor:groupInput.trim()?"pointer":"default",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                        {groupLoading?<div style={{width:16,height:16,border:"2px solid rgba(255,255,255,0.3)",borderTopColor:"#fff",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>:"↑"}
                      </button>
                    </div>
                  </div>

                  {/* 빠른 예시 */}
                  <p style={{color:C.textMuted,fontSize:12,margin:"0 0 8px"}}>예시</p>
                  <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:14}}>
                    {GROUP_QUICK.map(ex=>(
                      <button key={ex} onClick={()=>setGroupInput(ex)}
                        style={{padding:"9px 14px",borderRadius:12,border:`1px solid ${C.border}`,background:C.surface,color:C.textSub,fontSize:12,cursor:"pointer",textAlign:"left"}}>
                        {ex}
                      </button>
                    ))}
                  </div>

                  <div style={{background:C.surface,borderRadius:14,padding:"14px",border:`1px solid ${C.border}`,marginBottom:14}}>
                    <p style={{color:C.text,fontSize:12,fontWeight:600,margin:"0 0 6px"}}>📸 이미지로 묶음 입력</p>
                    <p style={{color:C.textMuted,fontSize:11,margin:"0 0 10px",lineHeight:1.6}}>여행 영수증이나 카드 내역 이미지를 올리면 자동으로 묶음으로 만들어 드려요</p>

                    {groupImgPreview?(
                      <div style={{borderRadius:10,overflow:"hidden",marginBottom:10,position:"relative"}}>
                        <img src={groupImgPreview} alt="" style={{width:"100%",maxHeight:160,objectFit:"contain",background:C.surfaceHigh,display:"block"}}/>
                        <button onClick={()=>{setGroupImgPreview(null);setGroupImgBase64(null);if(groupFileRef.current)groupFileRef.current.value="";}}
                          style={{position:"absolute",top:6,right:6,width:26,height:26,borderRadius:"50%",background:"rgba(0,0,0,0.6)",border:"none",color:"#fff",fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
                      </div>
                    ):null}

                    {groupImgPreview?(
                      <button onClick={handleGroupImageParse} disabled={groupLoading}
                        style={{width:"100%",padding:"11px",borderRadius:10,border:"none",background:groupLoading?C.border:C.accent,color:"#fff",fontSize:13,fontWeight:700,cursor:groupLoading?"default":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                        {groupLoading?<><div style={{width:14,height:14,border:"2px solid rgba(255,255,255,0.3)",borderTopColor:"#fff",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>{groupLoadMsg}</>:"🔍 묶음으로 분석하기"}
                      </button>
                    ):(
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                        <button onClick={()=>{if(groupFileRef.current){groupFileRef.current.setAttribute("capture","camera");groupFileRef.current.click();}}}
                          style={{padding:"10px",borderRadius:10,border:`1px dashed ${C.border}`,background:"transparent",color:C.textSub,fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                          📷 카메라
                        </button>
                        <button onClick={()=>{if(groupFileRef.current){groupFileRef.current.removeAttribute("capture");groupFileRef.current.click();}}}
                          style={{padding:"10px",borderRadius:10,border:`1px dashed ${C.border}`,background:"transparent",color:C.textSub,fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                          🖼️ 앨범
                        </button>
                      </div>
                    )}
                    {groupImgError&&<p style={{color:C.expense,fontSize:12,margin:"8px 0 0",textAlign:"center"}}>{groupImgError}</p>}
                  </div>

                  <button onClick={()=>setGroupManual(true)}
                    style={{width:"100%",padding:"12px",borderRadius:12,border:`1px solid ${C.border}`,background:"transparent",color:C.textMuted,fontSize:13,cursor:"pointer"}}>
                    ✏️ 직접 입력하기
                  </button>
                </>
              ):(
                /* 직접 입력 */
                <div>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
                    <p style={{color:C.text,fontSize:14,fontWeight:600,margin:0}}>직접 묶음 입력</p>
                    <button onClick={()=>setGroupManual(false)} style={{color:C.accent,fontSize:12,background:"transparent",border:"none",cursor:"pointer"}}>← AI 입력으로</button>
                  </div>
                  <div style={{marginBottom:10}}>
                    <p style={{color:C.textMuted,fontSize:11,margin:"0 0 5px"}}>묶음 이름</p>
                    <input value={manualName} onChange={e=>setManualName(e.target.value)} placeholder="예) 여름휴가여행"
                      style={{width:"100%",background:C.surfaceHigh,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 14px",color:C.text,fontSize:14,boxSizing:"border-box"}}/>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
                    <div>
                      <p style={{color:C.textMuted,fontSize:11,margin:"0 0 5px"}}>카테고리</p>
                      <select value={manualCat} onChange={e=>setManualCat(e.target.value)}
                        style={{width:"100%",background:C.surfaceHigh,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 12px",color:C.text,fontSize:13,boxSizing:"border-box"}}>
                        {Object.entries(CAT_ICON_MAP).map(([cat,icon])=><option key={cat} value={cat}>{icon} {cat}</option>)}
                      </select>
                    </div>
                    <div>
                      <p style={{color:C.textMuted,fontSize:11,margin:"0 0 5px"}}>날짜</p>
                      <input type="date" value={manualDate} onChange={e=>setManualDate(e.target.value)}
                        style={{width:"100%",background:C.surfaceHigh,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px",color:C.text,fontSize:13,boxSizing:"border-box"}}/>
                    </div>
                  </div>
                  <p style={{color:C.textMuted,fontSize:11,margin:"0 0 8px",fontWeight:600}}>세부 항목</p>
                  {manualChildren.map((child,i)=>(
                    <div key={`child-${i}`} style={{background:C.surfaceHigh,borderRadius:12,padding:"12px",marginBottom:8}}>
                      <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:6,marginBottom:6,alignItems:"center"}}>
                        <input
                          value={child.memo}
                          onChange={e=>{
                            const val = e.target.value;
                            setManualChildren(p=>p.map((c,j)=>j===i?{...c,memo:val}:c));
                          }}
                          placeholder={`항목 ${i+1} 이름 (예: 숙박비)`}
                          style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 10px",color:C.text,fontSize:13,boxSizing:"border-box",width:"100%"}}
                        />
                        {manualChildren.length>1&&(
                          <button
                            onClick={()=>setManualChildren(p=>p.filter((_,j)=>j!==i))}
                            style={{padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:"transparent",color:C.textMuted,fontSize:12,cursor:"pointer",flexShrink:0}}>
                            ✕
                          </button>
                        )}
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                        <input
                          type="number"
                          value={child.amount}
                          onChange={e=>{
                            const val = e.target.value;
                            setManualChildren(p=>p.map((c,j)=>j===i?{...c,amount:val}:c));
                          }}
                          placeholder="금액"
                          style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 10px",color:C.expense,fontSize:13,fontWeight:600,boxSizing:"border-box",fontFamily:"'DM Mono',monospace",width:"100%"}}
                        />
                        <select
                          value={child.category}
                          onChange={e=>{
                            const val = e.target.value;
                            setManualChildren(p=>p.map((c,j)=>j===i?{...c,category:val}:c));
                          }}
                          style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 10px",color:C.text,fontSize:12,boxSizing:"border-box",width:"100%"}}>
                          {Object.entries(CAT_ICON_MAP).map(([cat,icon])=><option key={cat} value={cat}>{icon} {cat}</option>)}
                        </select>
                      </div>
                    </div>
                  ))}
                  {manualChildren.some(c=>c.amount)&&(
                    <div style={{display:"flex",justifyContent:"flex-end",marginBottom:6}}>
                      <span style={{color:C.expense,fontSize:14,fontWeight:700,fontFamily:"'DM Mono',monospace"}}>-{fmt(manualChildren.reduce((s,c)=>s+(Number(c.amount)||0),0))}원</span>
                    </div>
                  )}
                  <button onClick={()=>setManualChildren(p=>[...p,{id:"mc"+Date.now(),memo:"",amount:"",category:"식비"}])}
                    style={{width:"100%",padding:"10px",borderRadius:10,border:`1px dashed ${C.border}`,background:"transparent",color:C.textMuted,fontSize:13,cursor:"pointer",marginBottom:16}}>
                    + 항목 추가
                  </button>
                  <div style={{display:"flex",gap:10}}>
                    <button onClick={()=>setGroupManual(false)} style={{flex:1,padding:"14px",borderRadius:12,border:`1px solid ${C.border}`,background:"transparent",color:C.textMuted,fontSize:15,cursor:"pointer"}}>취소</button>
                    <button onClick={saveManualGroup} disabled={!manualName.trim()}
                      style={{flex:2,padding:"14px",borderRadius:12,border:"none",background:manualName.trim()?C.accent:C.border,color:"#fff",fontSize:15,fontWeight:700,cursor:manualName.trim()?"pointer":"default"}}>
                      묶음 저장
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes spin{to{transform:rotate(360deg);}} @keyframes pulse{0%,100%{opacity:1;}50%{opacity:0.3;}}`}</style>
    </div>
  );
}
// ══════════════════════════════════════════════════════════════
// 통계 화면
// ══════════════════════════════════════════════════════════════
function StatsScreen() {
  const { transactions, budgets } = useApp();
  const [trendMode,    setTrendMode]    = useState("total");
  const [chartFilter,  setChartFilter]  = useState("both"); // both | income | expense
  const [selectedCats, setSelectedCats] = useState(["식비","월세/관리비","교통"]);
  const [hoveredBar,   setHoveredBar]   = useState(null);
  const [hoveredCat,   setHoveredCat]   = useState(null);

  const summary    = calcSummary(transactions);
  const catStats   = calcCategoryStats(transactions);
  const { fixed, variable } = calcFixedVariable(transactions, []);
  const trendData  = calcTrend(transactions);

  const CAT_TREND_COLORS = { 식비:"#E8834A", "월세/관리비":"#6C8EBF", 교통:"#7C9EFF", 구독서비스:"#A78BFA", 여행:"#34D399", "의료/건강":"#F87171", 쇼핑:"#FBBF24", "생활/마트":"#60A5FA", "문화/여가":"#C084FC" };
  const catTrendData = catStats.map(c=>({ name:c.category, icon:c.icon, color:CAT_TREND_COLORS[c.category]||C.accent, amounts:[...TREND_HISTORY.expense.map(()=>0), c.amount] }));
  const BAR_H = 140;
  const toggleCat = (n) => setSelectedCats(p=>p.includes(n)?p.filter(c=>c!==n):[...p,n]);

  return (
    <div style={{ paddingBottom:80 }}>
      <div style={{ padding:"28px 20px 16px" }}>
        <p style={{ color:C.textMuted, fontSize:11, margin:0, letterSpacing:1, textTransform:"uppercase" }}>2026년 6월</p>
        <h2 style={{ color:C.text, fontSize:20, margin:"4px 0 0", fontWeight:700 }}>통계</h2>
      </div>

      {/* 요약 */}
      <div style={{ margin:"0 16px 16px", display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
        {[{label:"수입",value:summary.income,color:C.income},{label:"지출",value:summary.expense,color:C.expense},{label:"저축",value:summary.balance,color:C.accent}].map(s=>(
          <div key={s.label} style={{ background:C.surface, borderRadius:14, padding:"14px 12px", border:`1px solid ${C.border}`, textAlign:"center" }}>
            <p style={{ color:C.textMuted, fontSize:11, margin:"0 0 5px" }}>{s.label}</p>
            <p style={{ color:s.color, fontSize:12, fontWeight:700, margin:0, fontFamily:"'DM Mono',monospace" }}>{s.value>=10000?`${Math.round(s.value/10000)}만`:fmt(s.value)}</p>
          </div>
        ))}
      </div>

      {/* 월별 추이 */}
      <div style={{ margin:"0 16px 16px", background:C.surface, borderRadius:16, padding:"16px 18px", border:`1px solid ${C.border}` }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <p style={{ color:C.text, fontSize:13, fontWeight:600, margin:0 }}>월별 추이</p>
          <div style={{ display:"flex", background:C.surfaceHigh, borderRadius:8, padding:3, gap:2 }}>
            {[{v:"total",label:"전체"},{v:"category",label:"카테고리"}].map(o=>(
              <button key={o.v} onClick={()=>{ setTrendMode(o.v); setHoveredBar(null); setHoveredCat(null); }}
                style={{ padding:"5px 12px", borderRadius:6, border:"none", background:trendMode===o.v?C.accent:"transparent", color:trendMode===o.v?"#fff":C.textMuted, fontSize:11, fontWeight:600, cursor:"pointer" }}>
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {trendMode==="total" ? (
          <div>
            {/* 수입/지출 선택 버튼 — 차트보다 위에 고정 */}
            <div style={{ display:"flex", gap:6, marginBottom:12, position:"relative", zIndex:5 }}>
              {[{v:"both",label:"전체"},{v:"income",label:"수입",color:C.income},{v:"expense",label:"지출",color:C.expense}].map(o=>(
                <button key={o.v} onClick={()=>{ setChartFilter(o.v); setHoveredBar(null); }}
                  style={{ padding:"5px 14px", borderRadius:20, border:`1px solid ${chartFilter===o.v?(o.color||C.accent):C.border}`, background:chartFilter===o.v?(o.color||C.accent)+"22":"transparent", color:chartFilter===o.v?(o.color||C.accent):C.textMuted, fontSize:11, fontWeight:600, cursor:"pointer", transition:"all 0.15s" }}>
                  {o.label}
                </button>
              ))}
            </div>

            {/* 양방향 차트 — 수입↑ 0기준선 지출↓ */}
            {(()=>{
              const HALF = 90; // 위/아래 각 절반 높이(px)
              const incMax = Math.max(...trendData.income, 1);
              const expMax = Math.max(...trendData.expense, 1);

              // 깔끔한 눈금 계산
              const niceMax = (val) => {
                const step = val / 3;
                const mag  = Math.pow(10, Math.floor(Math.log10(step)));
                const nice = Math.ceil(step / mag) * mag;
                return nice * 3;
              };
              const incNice = niceMax(incMax);
              const expNice = niceMax(expMax);

              const toIncH  = (v) => Math.max(Math.round((v / incNice) * HALF * 0.92), v > 0 ? 3 : 0);
              const toExpH  = (v) => Math.max(Math.round((v / expNice) * HALF * 0.92), v > 0 ? 3 : 0);

              const visInc = chartFilter !== "expense";
              const visExp = chartFilter !== "income";

              // Y축 눈금 레이블
              const incTicks = [incNice, Math.round(incNice/2), 0].map(v =>
                v >= 1000000 ? `${(v/1000000).toFixed(1)}백만` : v >= 10000 ? `${Math.round(v/10000)}만` : v > 0 ? `${Math.round(v/1000)}k` : "0"
              );
              const expTicks = [Math.round(expNice/2), expNice].map(v =>
                v >= 10000 ? `${Math.round(v/10000)}만` : `${Math.round(v/1000)}k`
              );

              return (
                <div style={{ display:"flex", gap:4, overflow:"hidden" }}>
                  {/* Y축 */}
                  <div style={{ display:"flex", flexDirection:"column", width:36, flexShrink:0 }}>
                    {/* 수입 Y축 (위) */}
                    {visInc && (
                      <div style={{ height:HALF, display:"flex", flexDirection:"column", justifyContent:"space-between", paddingBottom:0 }}>
                        {incTicks.map((v,i)=>(
                          <span key={i} style={{ color:C.income, fontSize:8, textAlign:"right", lineHeight:1 }}>{v}</span>
                        ))}
                      </div>
                    )}
                    {/* 기준선 공간 */}
                    <div style={{ height:20 }} />
                    {/* 지출 Y축 (아래) */}
                    {visExp && (
                      <div style={{ height:HALF, display:"flex", flexDirection:"column", justifyContent:"space-between", paddingTop:0 }}>
                        {expTicks.map((v,i)=>(
                          <span key={i} style={{ color:C.expense, fontSize:8, textAlign:"right", lineHeight:1 }}>{v}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 차트 영역 */}
                  <div style={{ flex:1, minWidth:0, position:"relative" }}>
                    {/* 수입 영역 (위) */}
                    {visInc && (
                      <div style={{ height:HALF, display:"flex", alignItems:"flex-end", gap:3, position:"relative" }}>
                        {/* 가이드라인 */}
                        {[0,0.5,1].map(r=>(
                          <div key={r} style={{ position:"absolute", bottom:`${r*100}%`, left:0, right:0, height:1, background:C.border, opacity:0.5, pointerEvents:"none" }} />
                        ))}
                        {trendData.months.map((m,i)=>{
                          const h   = toIncH(trendData.income[i]);
                          const act = hoveredBar?.i===i && hoveredBar?.t==="inc";
                          const cur = i===trendData.months.length-1;
                          return (
                            <div key={m} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"flex-end", height:"100%", position:"relative" }}>
                              {act && (
                                <div style={{ position:"absolute", bottom:h+4, left:"50%", transform:"translateX(-50%)", background:C.income, color:"#fff", fontSize:8, fontWeight:700, padding:"2px 5px", borderRadius:4, whiteSpace:"nowrap", zIndex:10, fontFamily:"'DM Mono',monospace" }}>
                                  +{Math.round(trendData.income[i]/10000)}만
                                </div>
                              )}
                              <div onClick={()=>setHoveredBar(act?null:{i,t:"inc"})}
                                style={{ width:"100%", height:h, background:C.income, borderRadius:"4px 4px 0 0", opacity:act?1:cur?0.9:0.6, cursor:"pointer", transition:"opacity 0.15s" }} />
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* 0 기준선 + 월 레이블 */}
                    <div style={{ height:20, display:"flex", alignItems:"center", position:"relative" }}>
                      <div style={{ position:"absolute", left:0, right:0, top:"50%", height:2, background:C.border }} />
                      <div style={{ display:"flex", width:"100%", zIndex:1 }}>
                        {trendData.months.map((m,i)=>{
                          const cur = i===trendData.months.length-1;
                          return (
                            <div key={m} style={{ flex:1, textAlign:"center" }}>
                              <span style={{ color:cur?C.accent:C.textMuted, fontSize:9, fontWeight:cur?700:400, background:C.surface, padding:"0 2px" }}>{m}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* 지출 영역 (아래) */}
                    {visExp && (
                      <div style={{ height:HALF, display:"flex", alignItems:"flex-start", gap:3, position:"relative" }}>
                        {[0,0.5,1].map(r=>(
                          <div key={r} style={{ position:"absolute", top:`${r*100}%`, left:0, right:0, height:1, background:C.border, opacity:0.5, pointerEvents:"none" }} />
                        ))}
                        {trendData.months.map((m,i)=>{
                          const h   = toExpH(trendData.expense[i]);
                          const act = hoveredBar?.i===i && hoveredBar?.t==="exp";
                          const cur = i===trendData.months.length-1;
                          return (
                            <div key={m} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"flex-start", height:"100%", position:"relative" }}>
                              <div onClick={()=>setHoveredBar(act?null:{i,t:"exp"})}
                                style={{ width:"100%", height:h, background:C.expense, borderRadius:"0 0 4px 4px", opacity:act?1:cur?0.9:0.75, cursor:"pointer", transition:"opacity 0.15s" }} />
                              {act && (
                                <div style={{ position:"absolute", top:h+4, left:"50%", transform:"translateX(-50%)", background:C.expense, color:"#fff", fontSize:8, fontWeight:700, padding:"2px 5px", borderRadius:4, whiteSpace:"nowrap", zIndex:10, fontFamily:"'DM Mono',monospace" }}>
                                  -{Math.round(trendData.expense[i]/10000)}만
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* 범례 */}
            <div style={{ display:"flex", gap:14, justifyContent:"center", marginTop:10 }}>
              {[{color:C.income,label:"↑ 수입",v:"income"},{color:C.expense,label:"↓ 지출",v:"expense"}]
                .filter(l=>chartFilter==="both"||chartFilter===l.v)
                .map(l=>(
                <div key={l.label} style={{ display:"flex", alignItems:"center", gap:5 }}>
                  <div style={{ width:10, height:10, borderRadius:2, background:l.color }} />
                  <span style={{ color:C.textMuted, fontSize:11 }}>{l.label}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:14 }}>
              {catTrendData.map(c=>(
                <button key={c.name} onClick={()=>{ toggleCat(c.name); setHoveredCat(null); }}
                  style={{ padding:"4px 10px", borderRadius:20, border:`1px solid ${selectedCats.includes(c.name)?c.color:C.border}`, background:selectedCats.includes(c.name)?c.color+"22":"transparent", color:selectedCats.includes(c.name)?c.color:C.textMuted, fontSize:11, cursor:"pointer" }}>
                  {c.icon} {c.name}
                </button>
              ))}
            </div>
            {catTrendData.filter(c=>selectedCats.includes(c.name)).map(c=>{
              const catMax = Math.max(...c.amounts,1);
              return (
                <div key={c.name} style={{ marginBottom:16 }}>
                  <span style={{ color:c.color, fontSize:11, fontWeight:600 }}>{c.icon} {c.name}</span>
                  <div style={{ display:"flex", gap:4, marginTop:6 }}>
                    <div style={{ display:"flex", flexDirection:"column", justifyContent:"space-between", height:58, width:30, flexShrink:0, paddingBottom:14 }}>
                      {[catMax,Math.round(catMax/2),0].map((v,j)=>(
                        <span key={j} style={{ color:C.textMuted, fontSize:8, textAlign:"right" }}>{v>=10000?`${Math.round(v/10000)}만`:v>0?`${Math.round(v/1000)}k`:"0"}</span>
                      ))}
                    </div>
                    <div style={{ flex:1, display:"flex", alignItems:"flex-end", gap:3, height:58 }}>
                      {c.amounts.map((a,i)=>{
                        const bH = Math.max(Math.round((a/catMax)*44),a>0?4:0);
                        const isAct = hoveredCat?.cat===c.name && hoveredCat?.i===i;
                        const isCurr = i===c.amounts.length-1;
                        return (
                          <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:2, position:"relative" }}>
                            {isAct && a>0 && <div style={{ position:"absolute", bottom:bH+16, left:"50%", transform:"translateX(-50%)", background:c.color, color:"#fff", fontSize:8, fontWeight:700, padding:"2px 4px", borderRadius:4, whiteSpace:"nowrap", zIndex:20, fontFamily:"'DM Mono',monospace", pointerEvents:"none" }}>{a>=10000?`${Math.round(a/10000)}만`:`${Math.round(a/1000)}k`}</div>}
                            <div onClick={()=>setHoveredCat(isAct?null:{cat:c.name,i,amount:a})}
                              style={{ width:"100%", height:bH, background:c.color, borderRadius:"3px 3px 0 0", opacity:isAct?1:isCurr?0.9:0.4, cursor:"pointer" }} />
                            <span style={{ color:isCurr?C.accent:C.textMuted, fontSize:9, fontWeight:isCurr?700:400 }}>{trendData.months[i]}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 카테고리별 지출 */}
      <div style={{ margin:"0 16px 16px", background:C.surface, borderRadius:16, padding:"16px 18px", border:`1px solid ${C.border}` }}>
        <p style={{ color:C.text, fontSize:13, fontWeight:600, margin:"0 0 14px" }}>카테고리별 지출</p>
        {catStats.length===0
          ? <p style={{ color:C.textMuted, fontSize:13, textAlign:"center", margin:"16px 0" }}>아직 지출 내역이 없어요</p>
          : catStats.map(s=>{
            const cat = getCat(s.category);
            const catBudget = budgets.categories[s.category];
            const bPct   = catBudget ? Math.round((s.amount/catBudget)*100) : null;
            const bOver  = bPct !== null && bPct >= 100;
            const bWarn  = bPct !== null && bPct >= 80 && !bOver;
            const barCol = bOver ? C.expense : bWarn ? "#E67E22" : cat.color||C.accent;
            return (
              <div key={s.category} style={{ marginBottom:13 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:5 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                    <div style={{ width:26, height:26, borderRadius:7, background:(cat.color||C.accent)+"22", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13 }}>
                      {cat.icon}
                    </div>
                    <span style={{ color:C.textSub, fontSize:12 }}>{s.category}</span>
                    {bOver && <span style={{ background:C.expense, color:"#fff", fontSize:9, fontWeight:700, padding:"1px 6px", borderRadius:8 }}>초과</span>}
                    {bWarn && <span style={{ background:"#E67E22", color:"#fff", fontSize:9, fontWeight:700, padding:"1px 6px", borderRadius:8 }}>주의</span>}
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <span style={{ color:C.text, fontSize:12, fontWeight:600, fontFamily:"'DM Mono',monospace" }}>{fmt(s.amount)}원</span>
                    {catBudget > 0 && <span style={{ color:C.textMuted, fontSize:10, marginLeft:4 }}>/ {fmt(catBudget)}원</span>}
                  </div>
                </div>
                <div style={{ height:5, background:C.border, borderRadius:4, overflow:"hidden" }}>
                  <div style={{ width:`${catBudget ? Math.min(bPct,100) : s.ratio}%`, height:"100%", borderRadius:4, background:barCol, opacity:0.8, transition:"width 0.4s" }} />
                </div>
                {catBudget > 0 && (
                  <div style={{ display:"flex", justifyContent:"flex-end", marginTop:3 }}>
                    <span style={{ color:bOver?C.expense:bWarn?"#E67E22":C.textMuted, fontSize:10 }}>{bPct}% 사용</span>
                  </div>
                )}
              </div>
            );
          })
        }
      </div>

      {/* 고정비 vs 변동비 */}
      <div style={{ margin:"0 16px 16px", background:C.surface, borderRadius:16, padding:"16px 18px", border:`1px solid ${C.border}` }}>
        <p style={{ color:C.text, fontSize:13, fontWeight:600, margin:"0 0 12px" }}>고정비 vs 변동비</p>
        {[{label:"고정비",amount:fixed,color:C.fixed},{label:"변동비",amount:variable,color:C.variable}].map(b=>{
          const total = fixed+variable||1;
          const ratio = Math.round((b.amount/total)*100);
          return (
            <div key={b.label} style={{ marginBottom:10 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                <span style={{ color:C.textSub, fontSize:12 }}>{b.label}</span>
                <span style={{ color:b.color, fontSize:12, fontWeight:700, fontFamily:"'DM Mono',monospace" }}>{fmt(b.amount)}원 <span style={{ color:C.textMuted, fontWeight:400 }}>({ratio}%)</span></span>
              </div>
              <div style={{ height:7, background:C.border, borderRadius:4, overflow:"hidden" }}>
                <div style={{ width:`${ratio}%`, height:"100%", borderRadius:4, background:b.color }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// 정기 지출 화면
// ══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════
// 설정 화면 (카테고리 관리 + 정기 지출)
// ══════════════════════════════════════════════════════════════
const INIT_CATEGORIES = {
  expense: [
    { id:"cg1", name:"고정비", icon:"📌", color:"#4B78C0", isParent:true, children:[
      { id:"c1", name:"월세/관리비", icon:"🏠", color:"#4B78C0" },
      { id:"c2", name:"보험",        icon:"🛡️", color:"#4B78C0" },
      { id:"c3", name:"구독서비스",  icon:"📱", color:"#4B78C0" },
      { id:"c4", name:"통신비",      icon:"📡", color:"#4B78C0" },
      { id:"c5", name:"교육",        icon:"📚", color:"#4B78C0" },
    ]},
    { id:"cg2", name:"변동비", icon:"🔄", color:"#E05C2A", isParent:true, children:[
      { id:"c6",  name:"식비",      icon:"🍚", color:"#E05C2A" },
      { id:"c7",  name:"교통",      icon:"🚌", color:"#E05C2A" },
      { id:"c8",  name:"쇼핑",      icon:"🛍️", color:"#E05C2A" },
      { id:"c9",  name:"의료/건강", icon:"💊", color:"#E05C2A" },
      { id:"c10", name:"생활/마트", icon:"🏪", color:"#E05C2A" },
      { id:"c11", name:"문화/여가", icon:"🎬", color:"#E05C2A" },
      { id:"c12", name:"여행",      icon:"✈️", color:"#E05C2A" },
      { id:"c13", name:"기타",      icon:"📦", color:"#9CA3AF" },
    ]},
  ],
  income: [
    { id:"cg3", name:"수입", icon:"💰", color:"#2DA870", isParent:true, children:[
      { id:"c14", name:"월급",    icon:"💴", color:"#2DA870" },
      { id:"c15", name:"부수입",  icon:"📈", color:"#2DA870" },
      { id:"c16", name:"용돈",    icon:"🎁", color:"#2DA870" },
      { id:"c17", name:"기타수입",icon:"💡", color:"#2DA870" },
    ]},
  ],
};

const ICON_OPTIONS = ["🍚","🚌","🛍️","💊","🏪","🎬","✈️","🏠","📱","💴","📈","🎁","💡","📦","☕","🐶","💪","🎮","📚","🚗","⚡","🛡️","📡","🎵","🏋️","🍕","🏖️","💐","🎂","🔑"];
const COLOR_OPTIONS = ["#4B78C0","#E05C2A","#2DA870","#9B59B6","#E67E22","#E74C3C","#1ABC9C","#F39C12","#3498DB","#9CA3AF"];

// ── 가족 정보 카드 (설정 화면용) ─────────────────────────────
function SettingsScreen() {
  const { recurring, setRecurring, addTransactions, transactions, setTransactions, budgets, setBudgets } = useApp();
  const [settingTab, setSettingTab] = useState("categories");
  const [categories, setCategories] = useState(INIT_CATEGORIES);

  // 카테고리 관리 state
  const [catType,       setCatType]       = useState("expense");
  const [editingCat,    setEditingCat]    = useState(null);
  const [editForm,      setEditForm]      = useState({ name:"", icon:"📦", color:"#9CA3AF" });
  const [addingTo,      setAddingTo]      = useState(null);
  const [newCatForm,    setNewCatForm]    = useState({ name:"", icon:"📦", color:"#9CA3AF" });
  // 삭제 관련 — 이전할 카테고리 선택
  const [deleteConfirm, setDeleteConfirm] = useState(null); // {groupId, catId, name, oldName}
  const [migrateTo,     setMigrateTo]     = useState("기타"); // 이전 대상 카테고리명

  // 수정 저장 — 이름 변경 시 기존 거래도 자동 반영
  const saveCatEdit = () => {
    const oldName = deleteConfirm?.oldName; // 혹시 모를 충돌 방지
    // 현재 편집 중인 카테고리의 원래 이름 찾기
    let origName = "";
    categories[catType].forEach(g => {
      if (g.id === editingCat?.groupId) {
        const found = g.children.find(c => c.id === editingCat?.catId);
        if (found) origName = found.name;
      }
    });

    // 1) categories state 업데이트
    setCategories(prev => {
      const groups = prev[catType].map(g => {
        if (g.id !== editingCat.groupId) return g;
        return { ...g, children: g.children.map(c =>
          c.id === editingCat.catId ? { ...c, ...editForm } : c
        )};
      });
      return { ...prev, [catType]: groups };
    });

    // 2) 이름이 바뀐 경우 → 기존 거래 category 자동 반영
    if (origName && origName !== editForm.name) {
      setTransactions(prev => prev.map(tx => {
        if (tx.is_group) {
          return {
            ...tx,
            category: tx.category === origName ? editForm.name : tx.category,
            children: tx.children.map(c => c.category === origName ? { ...c, category: editForm.name } : c),
          };
        }
        return tx.category === origName ? { ...tx, category: editForm.name } : tx;
      }));
    }

    setEditingCat(null);
  };

  // 삭제 — 이전 카테고리 선택 후 일괄 변경
  const execDelete = () => {
    const { groupId, catId, oldName } = deleteConfirm;

    // 1) 기존 거래 일괄 이전
    setTransactions(prev => prev.map(tx => {
      if (tx.is_group) {
        return {
          ...tx,
          category: tx.category === oldName ? migrateTo : tx.category,
          children: tx.children.map(c => c.category === oldName ? { ...c, category: migrateTo } : c),
        };
      }
      return tx.category === oldName ? { ...tx, category: migrateTo } : tx;
    }));

    // 2) 카테고리 목록에서 제거
    setCategories(prev => {
      const groups = prev[catType].map(g => {
        if (g.id !== groupId) return g;
        return { ...g, children: g.children.filter(c => c.id !== catId) };
      });
      return { ...prev, [catType]: groups };
    });

    // 해당 카테고리 사용 거래 수 계산 (알림용)
    const affectedCount = transactions.flatMap(t => t.is_group ? t.children : [t])
      .filter(t => t.category === oldName).length;

    setDeleteConfirm(null);
    setEditingCat(null);
    setMigrateTo("기타");
  };

  // 카테고리 추가
  const addCat = (groupId) => {
    if (!newCatForm.name.trim()) return;
    setCategories(prev => {
      const groups = prev[catType].map(g => {
        if (g.id !== groupId) return g;
        return { ...g, children: [...g.children, { id:"c"+Date.now(), ...newCatForm }] };
      });
      return { ...prev, [catType]: groups };
    });
    setAddingTo(null);
    setNewCatForm({ name:"", icon:"📦", color:"#9CA3AF" });
  };

  // 이전 가능한 카테고리 목록 (삭제 대상 제외)
  const getMigrateOptions = () => {
    const allCats = categories[catType].flatMap(g => g.children);
    return allCats.filter(c => c.id !== deleteConfirm?.catId).map(c => c.name);
  };

  // 삭제 대상 카테고리 사용 거래 수
  const getAffectedCount = (catName) =>
    transactions.flatMap(t => t.is_group ? t.children : [t]).filter(t => t.category === catName).length;

  // ── 정기지출 관련 (RecurringScreen에서 이동) ──────────────────
  const now2 = new Date();
  const monthLabel = `${now2.getFullYear()}년 ${now2.getMonth()+1}월`;
  const [showAdd,      setShowAdd]      = useState(false);
  const [confirmItem,  setConfirmItem]  = useState(null);
  const [confirmAmt,   setConfirmAmt]   = useState("");
  const [expandedId,   setExpandedId]   = useState(null);
  const [recEditForm,  setRecEditForm]  = useState({});
  const ICONS_REC = ["📺","▶️","📱","🏠","⚡","💪","🛡️","🚗","📚","🎮","☕","🐶"];
  const pendingItems  = recurring.filter(i=>i.is_active && i.status==="need_input");
  const activeItems   = recurring.filter(i=>i.is_active && i.status!=="need_input");
  const inactiveItems = recurring.filter(i=>!i.is_active);
  const totalFixed    = recurring.filter(i=>i.is_active && i.amount_type==="fixed").reduce((s,i)=>s+(i.amount||0),0);
  const startRecEdit  = (item) => {
    if (expandedId===item.id) { setExpandedId(null); return; }
    setExpandedId(item.id);
    setRecEditForm({ name:item.name, amount:item.amount||item.last_amount||"", day_of_month:item.day_of_month, amount_type:item.amount_type, icon:item.icon });
  };
  const saveRecEdit = (id) => {
    setRecurring(prev=>prev.map(i=>i.id!==id?i:{ ...i, name:recEditForm.name, day_of_month:Number(recEditForm.day_of_month), amount_type:recEditForm.amount_type, icon:recEditForm.icon,
      amount:recEditForm.amount_type==="fixed"?Number(recEditForm.amount):null, last_amount:recEditForm.amount_type==="variable"?Number(recEditForm.amount):i.last_amount }));
    setExpandedId(null);
  };
  const toggleActive = (id) => setRecurring(prev=>prev.map(i=>i.id!==id?i:{...i,is_active:!i.is_active,status:i.is_active?"inactive":i.amount_type==="variable"?"need_input":"pending_date"}));
  const submitConfirm = () => {
    const amount = Number(confirmAmt);
    addTransactions([{ id:uid(), type:"expense", amount, memo:confirmItem.name, date:today(), category:confirmItem.category, is_group:false, from_recurring:true }]);
    setRecurring(prev=>prev.map(i=>i.id===confirmItem.id?{...i,status:"registered",last_amount:amount}:i));
    setConfirmItem(null); setConfirmAmt("");
  };
  const [newRec, setNewRec] = useState({ name:"", amount:"", amount_type:"fixed", day_of_month:"1", icon:"📱" });
  const addRec = () => {
    if (!newRec.name) return;
    setRecurring(prev=>[...prev,{ id:"r"+Date.now(), ...newRec, amount:newRec.amount_type==="fixed"?Number(newRec.amount):null,
      day_of_month:Number(newRec.day_of_month), is_active:true, auto_register:newRec.amount_type==="fixed",
      status:newRec.amount_type==="variable"?"need_input":"pending_date", last_amount:newRec.amount_type==="variable"?Number(newRec.amount):undefined }]);
    setShowAdd(false); setNewRec({ name:"", amount:"", amount_type:"fixed", day_of_month:"1", icon:"📱" });
  };
  const StatusBadge = ({ status }) => {
    const map = { registered:{label:"등록완료",color:C.income}, pending_date:{label:"자동예정",color:C.accent}, need_input:{label:"금액확인필요",color:C.expense}, inactive:{label:"비활성",color:C.textMuted} };
    const s = map[status]||map.inactive;
    return <Tag color={s.color}>{s.label}</Tag>;
  };
  const RecRow = ({ item }) => {
    const isExp = expandedId===item.id;
    return (
      <div style={{ borderBottom:`1px solid ${C.border}` }}>
        <div onClick={()=>startRecEdit(item)} style={{ padding:"14px 16px", display:"flex", alignItems:"center", gap:12, opacity:item.is_active?1:0.5, cursor:"pointer", background:isExp?C.accentSoft:"transparent" }}>
          <div style={{ width:38, height:38, borderRadius:10, background:C.surfaceHigh, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>{item.icon}</div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3 }}>
              <span style={{ color:C.text, fontSize:14, fontWeight:500 }}>{item.name}</span>
              <StatusBadge status={item.status} />
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <span style={{ color:C.textMuted, fontSize:11 }}>매달 {item.day_of_month}일</span>
              {item.amount_type==="variable" && <span style={{ color:C.textMuted, fontSize:11 }}>· 지난달 {fmt(item.last_amount||0)}원</span>}
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            {item.amount_type==="fixed" ? <span style={{ color:C.expense, fontSize:14, fontWeight:700, fontFamily:"'DM Mono',monospace" }}>-{fmt(item.amount)}원</span> : <span style={{ color:C.textMuted, fontSize:13 }}>변동</span>}
            <span style={{ color:C.textMuted, fontSize:16, transition:"transform 0.2s", display:"inline-block", transform:isExp?"rotate(90deg)":"rotate(0deg)" }}>›</span>
          </div>
        </div>
        {isExp && (
          <div style={{ background:C.surfaceHigh, padding:"14px 16px 16px", borderTop:`1px solid ${C.border}` }}>
            <p style={{ color:C.accent, fontSize:11, fontWeight:600, margin:"0 0 12px" }}>✏️ {monthLabel} 반영 기준으로 수정</p>
            <div style={{ marginBottom:10 }}>
              <p style={{ color:C.textMuted, fontSize:11, margin:"0 0 6px" }}>아이콘</p>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                {ICONS_REC.map(ic=><button key={ic} onClick={()=>setRecEditForm(f=>({...f,icon:ic}))} style={{ width:34, height:34, borderRadius:8, border:`1px solid ${recEditForm.icon===ic?C.accent:C.border}`, background:recEditForm.icon===ic?C.accentSoft:C.surface, fontSize:16, cursor:"pointer" }}>{ic}</button>)}
              </div>
            </div>
            <div style={{ marginBottom:10 }}>
              <p style={{ color:C.textMuted, fontSize:11, margin:"0 0 5px" }}>항목명</p>
              <input value={recEditForm.name} onChange={e=>setRecEditForm(f=>({...f,name:e.target.value}))} style={{ width:"100%", background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:"9px 12px", color:C.text, fontSize:14, boxSizing:"border-box" }} />
            </div>
            <div style={{ marginBottom:10 }}>
              <p style={{ color:C.textMuted, fontSize:11, margin:"0 0 5px" }}>금액 유형</p>
              <div style={{ display:"flex", gap:6 }}>
                {[{v:"fixed",label:"고정"},{v:"variable",label:"변동"}].map(o=>(
                  <button key={o.v} onClick={()=>setRecEditForm(f=>({...f,amount_type:o.v}))} style={{ flex:1, padding:"8px", borderRadius:8, border:`1px solid ${recEditForm.amount_type===o.v?C.accent:C.border}`, background:recEditForm.amount_type===o.v?C.accentSoft:"transparent", color:recEditForm.amount_type===o.v?C.accent:C.textMuted, fontSize:12, cursor:"pointer" }}>{o.label}</button>
                ))}
              </div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:8, marginBottom:14 }}>
              <div>
                <p style={{ color:C.textMuted, fontSize:11, margin:"0 0 5px" }}>{recEditForm.amount_type==="fixed"?"금액":"지난달 금액"}</p>
                <input type="number" value={recEditForm.amount} onChange={e=>setRecEditForm(f=>({...f,amount:e.target.value}))} placeholder="0" style={{ width:"100%", background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:"9px 12px", color:C.text, fontSize:14, boxSizing:"border-box", fontFamily:"'DM Mono',monospace" }} />
              </div>
              <div>
                <p style={{ color:C.textMuted, fontSize:11, margin:"0 0 5px" }}>결제일</p>
                <div style={{ display:"flex", alignItems:"center", background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:"9px 12px" }}>
                  <input type="number" min="1" max="31" value={recEditForm.day_of_month} onChange={e=>setRecEditForm(f=>({...f,day_of_month:e.target.value}))} style={{ width:"100%", background:"transparent", border:"none", outline:"none", color:C.text, fontSize:14, fontFamily:"'DM Mono',monospace" }} />
                  <span style={{ color:C.textMuted, fontSize:12 }}>일</span>
                </div>
              </div>
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={e=>{e.stopPropagation();toggleActive(item.id);setExpandedId(null);}} style={{ padding:"9px 14px", borderRadius:9, border:`1px solid ${C.border}`, background:"transparent", color:C.textMuted, fontSize:12, cursor:"pointer" }}>{item.is_active?"비활성화":"활성화"}</button>
              <button onClick={e=>{e.stopPropagation();setExpandedId(null);}} style={{ flex:1, padding:"9px", borderRadius:9, border:`1px solid ${C.border}`, background:"transparent", color:C.textMuted, fontSize:13, cursor:"pointer" }}>취소</button>
              <button onClick={e=>{e.stopPropagation();saveRecEdit(item.id);}} style={{ flex:2, padding:"9px", borderRadius:9, border:"none", background:C.accent, color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer" }}>저장</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ paddingBottom:80 }}>
      {/* 헤더 */}
      <div style={{ padding:"28px 20px 0" }}>
        <p style={{ color:C.textMuted, fontSize:11, margin:0, letterSpacing:1, textTransform:"uppercase" }}>관리</p>
        <h2 style={{ color:C.text, fontSize:20, margin:"4px 0 16px", fontWeight:700 }}>설정</h2>

        {/* 설정 내 탭 */}
        <div style={{ display:"flex", background:C.surfaceHigh, borderRadius:12, padding:4, gap:4, marginTop:16 }}>
          {[{v:"categories",label:"카테고리",icon:"🏷️"},{v:"recurring",label:"정기지출",icon:"🔄"},{v:"budget",label:"예산",icon:"💰"},{v:"family",label:"가족/버전",icon:"👨‍👩‍👧"}].map(t=>(
            <button key={t.v} onClick={()=>setSettingTab(t.v)}
              style={{ flex:1, padding:"10px 6px", borderRadius:9, border:"none", background:settingTab===t.v?C.accent:"transparent",
                color:settingTab===t.v?"#fff":C.textMuted, fontSize:9, fontWeight:settingTab===t.v?700:400, cursor:"pointer", transition:"all 0.2s", display:"flex", alignItems:"center", justifyContent:"center", gap:3 }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 카테고리 관리 ── */}
      {settingTab==="categories" && (
        <div style={{ padding:"16px 16px 0" }}>
          {/* 지출/수입 타입 전환 */}
          <div style={{ display:"flex", gap:8, marginBottom:16 }}>
            {[{v:"expense",label:"💸 지출"},{v:"income",label:"💰 수입"}].map(t=>(
              <button key={t.v} onClick={()=>{ setCatType(t.v); setEditingCat(null); setAddingTo(null); }}
                style={{ padding:"7px 18px", borderRadius:20, border:`1px solid ${catType===t.v?C.accent:C.border}`, background:catType===t.v?C.accentSoft:"transparent", color:catType===t.v?C.accent:C.textMuted, fontSize:13, fontWeight:600, cursor:"pointer" }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* 카테고리 그룹 목록 */}
          {categories[catType].map(group=>(
            <div key={group.id} style={{ marginBottom:16 }}>
              {/* 그룹 헤더 */}
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8, padding:"0 4px" }}>
                <span style={{ fontSize:16 }}>{group.icon}</span>
                <span style={{ color:group.color, fontSize:13, fontWeight:700 }}>{group.name}</span>
                <span style={{ color:C.textMuted, fontSize:11 }}>{group.children.length}개</span>
              </div>

              {/* 카테고리 칩 목록 */}
              <div style={{ background:C.surface, borderRadius:14, border:`1px solid ${C.border}`, overflow:"hidden" }}>
                {group.children.map((cat,ci)=>{
                  const isEditing = editingCat?.catId===cat.id;
                  return (
                    <div key={cat.id}>
                      {/* 카테고리 행 */}
                      <div onClick={()=>{ if(isEditing){setEditingCat(null);}else{setEditingCat({groupId:group.id,catId:cat.id});setEditForm({name:cat.name,icon:cat.icon,color:cat.color});setAddingTo(null);}}}
                        style={{ display:"flex", alignItems:"center", padding:"13px 16px", borderBottom:`1px solid ${C.border}`, cursor:"pointer", background:isEditing?C.accentSoft:"transparent" }}>
                        {/* 아이콘 배지 */}
                        <div style={{ width:34, height:34, borderRadius:9, background:cat.color+"22", display:"flex", alignItems:"center", justifyContent:"center", fontSize:17, marginRight:12, flexShrink:0 }}>
                          {cat.icon}
                        </div>
                        <span style={{ flex:1, color:C.text, fontSize:14, fontWeight:500 }}>{cat.name}</span>
                        <span style={{ color:isEditing?C.accent:C.textMuted, fontSize:11, border:`1px solid ${isEditing?C.accent:C.border}`, borderRadius:6, padding:"2px 8px", background:isEditing?C.accentSoft:"transparent" }}>
                          {isEditing?"닫기":"수정"}
                        </span>
                      </div>

                      {/* 인라인 수정 패널 */}
                      {isEditing && (
                        <div style={{ background:C.surfaceHigh, padding:"14px 16px 16px", borderBottom:`1px solid ${C.border}` }}>
                          {/* 아이콘 선택 */}
                          <p style={{ color:C.textMuted, fontSize:11, margin:"0 0 6px" }}>아이콘</p>
                          <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginBottom:12 }}>
                            {ICON_OPTIONS.map(ic=>(
                              <button key={ic} onClick={()=>setEditForm(f=>({...f,icon:ic}))}
                                style={{ width:34, height:34, borderRadius:8, border:`1px solid ${editForm.icon===ic?C.accent:C.border}`, background:editForm.icon===ic?C.accentSoft:C.surface, fontSize:16, cursor:"pointer" }}>{ic}</button>
                            ))}
                          </div>
                          {/* 이름 */}
                          <p style={{ color:C.textMuted, fontSize:11, margin:"0 0 5px" }}>이름</p>
                          <input value={editForm.name} onChange={e=>setEditForm(f=>({...f,name:e.target.value}))}
                            style={{ width:"100%", background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:"9px 12px", color:C.text, fontSize:14, boxSizing:"border-box", marginBottom:12 }} />
                          {/* 색상 */}
                          <p style={{ color:C.textMuted, fontSize:11, margin:"0 0 6px" }}>색상</p>
                          <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:14 }}>
                            {COLOR_OPTIONS.map(col=>(
                              <button key={col} onClick={()=>setEditForm(f=>({...f,color:col}))}
                                style={{ width:28, height:28, borderRadius:"50%", background:col, border:`3px solid ${editForm.color===col?"#1A1D27":"transparent"}`, cursor:"pointer" }} />
                            ))}
                          </div>
                          {/* 버튼 */}
                          <div style={{ display:"flex", gap:8 }}>
                            <button onClick={()=>{ setDeleteConfirm({groupId:group.id,catId:cat.id,name:cat.name,oldName:cat.name}); setMigrateTo("기타"); }}
                              style={{ padding:"8px 12px", borderRadius:8, border:`1px solid ${C.expense}44`, background:"transparent", color:C.expense, fontSize:11, cursor:"pointer" }}>삭제</button>
                            <button onClick={()=>setEditingCat(null)} style={{ flex:1, padding:"8px", borderRadius:8, border:`1px solid ${C.border}`, background:"transparent", color:C.textMuted, fontSize:13, cursor:"pointer" }}>취소</button>
                            <button onClick={saveCatEdit} style={{ flex:2, padding:"8px", borderRadius:8, border:"none", background:C.accent, color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer" }}>저장</button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* 새 카테고리 추가 인라인 */}
                {addingTo===group.id ? (
                  <div style={{ padding:"14px 16px" }}>
                    <p style={{ color:C.accent, fontSize:11, fontWeight:600, margin:"0 0 10px" }}>+ 새 카테고리</p>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginBottom:10 }}>
                      {ICON_OPTIONS.map(ic=>(
                        <button key={ic} onClick={()=>setNewCatForm(f=>({...f,icon:ic}))}
                          style={{ width:32, height:32, borderRadius:7, border:`1px solid ${newCatForm.icon===ic?C.accent:C.border}`, background:newCatForm.icon===ic?C.accentSoft:C.surface, fontSize:15, cursor:"pointer" }}>{ic}</button>
                      ))}
                    </div>
                    <input value={newCatForm.name} onChange={e=>setNewCatForm(f=>({...f,name:e.target.value}))} placeholder="카테고리 이름"
                      style={{ width:"100%", background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:"9px 12px", color:C.text, fontSize:14, boxSizing:"border-box", marginBottom:10 }} />
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:12 }}>
                      {COLOR_OPTIONS.map(col=>(
                        <button key={col} onClick={()=>setNewCatForm(f=>({...f,color:col}))}
                          style={{ width:26, height:26, borderRadius:"50%", background:col, border:`3px solid ${newCatForm.color===col?"#1A1D27":"transparent"}`, cursor:"pointer" }} />
                      ))}
                    </div>
                    <div style={{ display:"flex", gap:8 }}>
                      <button onClick={()=>setAddingTo(null)} style={{ flex:1, padding:"8px", borderRadius:8, border:`1px solid ${C.border}`, background:"transparent", color:C.textMuted, fontSize:13, cursor:"pointer" }}>취소</button>
                      <button onClick={()=>addCat(group.id)} disabled={!newCatForm.name.trim()}
                        style={{ flex:2, padding:"8px", borderRadius:8, border:"none", background:newCatForm.name.trim()?C.accent:C.border, color:"#fff", fontSize:13, fontWeight:700, cursor:newCatForm.name.trim()?"pointer":"default" }}>추가</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={()=>{ setAddingTo(group.id); setEditingCat(null); setNewCatForm({ name:"", icon:"📦", color:group.color }); }}
                    style={{ width:"100%", padding:"12px", border:"none", background:"transparent", color:C.accent, fontSize:13, fontWeight:600, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
                    ＋ {group.name}에 카테고리 추가
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── 정기 지출 ── */}
      {settingTab==="recurring" && (
        <div style={{ padding:"16px 16px 0" }}>
          {/* 요약 카드 */}
          <div style={{ background:"linear-gradient(135deg,#EEF2FF,#E8EDFF)", borderRadius:16, padding:"18px", border:`1px solid ${C.border}`, marginBottom:16 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
              <div>
                <p style={{ color:C.textMuted, fontSize:11, margin:"0 0 4px", letterSpacing:1, textTransform:"uppercase" }}>이달 고정 합계</p>
                <p style={{ color:C.accent, fontSize:11, margin:"0 0 8px" }}>{monthLabel} 기준</p>
                <p style={{ color:C.expense, fontSize:26, fontWeight:800, margin:0, fontFamily:"'DM Mono',monospace" }}>-{fmt(totalFixed)}<span style={{ fontSize:14, fontWeight:400, color:C.textMuted, marginLeft:4 }}>원</span></p>
              </div>
              <button onClick={()=>setShowAdd(true)} style={{ padding:"8px 14px", borderRadius:10, border:"none", background:C.accentSoft, color:C.accent, fontSize:13, fontWeight:600, cursor:"pointer" }}>+ 추가</button>
            </div>
          </div>

          {/* 확인 필요 */}
          {pendingItems.length>0 && (
            <div style={{ background:C.expense+"11", borderRadius:14, padding:"14px 16px", border:`1px solid ${C.expense}33`, marginBottom:16 }}>
              <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:10 }}>
                <span style={{ fontSize:15 }}>⚠️</span>
                <span style={{ color:C.expense, fontSize:13, fontWeight:600 }}>{monthLabel} 금액 확인 필요</span>
              </div>
              {pendingItems.map(item=>(
                <div key={item.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderTop:`1px solid ${C.expense}22` }}>
                  <div><span style={{ color:C.text, fontSize:13 }}>{item.icon} {item.name}</span><span style={{ color:C.textMuted, fontSize:11, marginLeft:8 }}>지난달 {fmt(item.last_amount||0)}원</span></div>
                  <button onClick={()=>{ setConfirmItem(item); setConfirmAmt(String(item.last_amount||"")); }} style={{ padding:"6px 14px", borderRadius:8, border:"none", background:C.expense, color:"#fff", fontSize:12, fontWeight:600, cursor:"pointer" }}>금액 입력</button>
                </div>
              ))}
            </div>
          )}

          {/* 활성 */}
          <p style={{ color:C.textMuted, fontSize:11, margin:"0 0 8px", textTransform:"uppercase", letterSpacing:0.8 }}>활성 항목 · 클릭하여 수정</p>
          <div style={{ background:C.surface, borderRadius:16, border:`1px solid ${C.border}`, overflow:"hidden", marginBottom:16 }}>
            {activeItems.map(item=><RecRow key={item.id} item={item} />)}
          </div>

          {inactiveItems.length>0 && (
            <>
              <p style={{ color:C.textMuted, fontSize:11, margin:"0 0 8px", textTransform:"uppercase", letterSpacing:0.8 }}>비활성 항목</p>
              <div style={{ background:C.surface, borderRadius:16, border:`1px solid ${C.border}`, overflow:"hidden" }}>
                {inactiveItems.map(item=><RecRow key={item.id} item={item} />)}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── 예산 설정 ── */}
      {settingTab==="budget" && (
        <div style={{ padding:"16px 16px 0" }}>
          {/* 안내 */}
          <div style={{ background:C.accentSoft, borderRadius:12, padding:"12px 14px", marginBottom:16, display:"flex", gap:10, alignItems:"flex-start" }}>
            <span style={{ fontSize:18 }}>💡</span>
            <p style={{ color:C.accent, fontSize:12, margin:0, lineHeight:1.6 }}>
              예산을 설정하면 홈 화면과 통계에서 달성률을 확인할 수 있어요. 전체 예산과 카테고리별 예산을 각각 설정할 수 있습니다.
            </p>
          </div>

          {/* 전체 예산 */}
          <p style={{ color:C.textMuted, fontSize:11, margin:"0 0 8px", textTransform:"uppercase", letterSpacing:0.8, fontWeight:600 }}>전체 예산</p>
          <div style={{ background:C.surface, borderRadius:14, border:`1px solid ${C.border}`, padding:"16px", marginBottom:20 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontSize:18 }}>🏦</span>
                <div>
                  <p style={{ color:C.text, fontSize:14, fontWeight:600, margin:0 }}>이달 총 지출 한도</p>
                  <p style={{ color:C.textMuted, fontSize:11, margin:0 }}>초과 시 홈에서 경고 표시</p>
                </div>
              </div>
              <label style={{ position:"relative", display:"inline-block", width:44, height:24, flexShrink:0 }}>
                <input type="checkbox" checked={budgets.totalEnabled}
                  onChange={e=>setBudgets(b=>({...b,totalEnabled:e.target.checked}))}
                  style={{ opacity:0, width:0, height:0 }} />
                <span style={{ position:"absolute", cursor:"pointer", inset:0, background:budgets.totalEnabled?C.accent:C.border, borderRadius:24, transition:"0.2s" }}>
                  <span style={{ position:"absolute", content:"", height:18, width:18, left: budgets.totalEnabled?22:3, bottom:3, background:"#fff", borderRadius:"50%", transition:"0.2s" }} />
                </span>
              </label>
            </div>
            {budgets.totalEnabled && (
              <div style={{ display:"flex", alignItems:"center", background:C.surfaceHigh, borderRadius:10, border:`1px solid ${C.border}`, overflow:"hidden" }}>
                <input type="number" value={budgets.total||""}
                  onChange={e=>setBudgets(b=>({...b,total:Number(e.target.value)}))}
                  placeholder="예) 1500000"
                  style={{ flex:1, background:"transparent", border:"none", outline:"none", color:C.text, fontSize:17, padding:"13px 16px", fontFamily:"'DM Mono',monospace" }} />
                <span style={{ color:C.textMuted, fontSize:13, paddingRight:16 }}>원</span>
              </div>
            )}
          </div>

          {/* 카테고리별 예산 */}
          <p style={{ color:C.textMuted, fontSize:11, margin:"0 0 8px", textTransform:"uppercase", letterSpacing:0.8, fontWeight:600 }}>카테고리별 예산</p>
          <div style={{ background:C.surface, borderRadius:14, border:`1px solid ${C.border}`, overflow:"hidden", marginBottom:20 }}>
            {[...INIT_CATEGORIES.expense, ...INIT_CATEGORIES.income].flatMap(g=>g.children).map((cat,i,arr)=>{
              const val = budgets.categories[cat.name]||"";
              return (
                <div key={cat.id} style={{ display:"flex", alignItems:"center", padding:"13px 16px", borderBottom: i<arr.length-1?`1px solid ${C.border}`:"none", gap:12 }}>
                  <div style={{ width:34, height:34, borderRadius:9, background:cat.color+"22", display:"flex", alignItems:"center", justifyContent:"center", fontSize:17, flexShrink:0 }}>
                    {cat.icon}
                  </div>
                  <span style={{ flex:1, color:C.text, fontSize:13, fontWeight:500 }}>{cat.name}</span>
                  <div style={{ display:"flex", alignItems:"center", background:val?C.accentSoft:C.surfaceHigh, borderRadius:8, border:`1px solid ${val?C.accent:C.border}`, overflow:"hidden", width:120 }}>
                    <input type="number" value={val}
                      onChange={e=>setBudgets(b=>({...b,categories:{...b.categories,[cat.name]:Number(e.target.value)||""}}))}
                      placeholder="미설정"
                      style={{ width:"100%", background:"transparent", border:"none", outline:"none", color:C.text, fontSize:12, padding:"8px 10px", fontFamily:"'DM Mono',monospace", textAlign:"right" }} />
                    <span style={{ color:C.textMuted, fontSize:11, paddingRight:8, flexShrink:0 }}>원</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {settingTab==="family" && (
        <div style={{ padding:"16px 16px 0" }}>
          <FamilyInfoCard />
          <div style={{ background:C.surface, borderRadius:16, border:"1px solid "+C.border, padding:"16px", marginTop:8 }}>
            <p style={{ color:C.textMuted, fontSize:11, margin:"0 0 12px", fontWeight:600, textTransform:"uppercase", letterSpacing:0.8 }}>앱 정보</p>
            {[{label:"앱 버전",value:"v1.1.1",accent:true},{label:"서비스",value:"우리집 가계부"},{label:"문의",value:"가족 내 공유용"}].map((row,i,arr)=>(
              <div key={row.label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:i<arr.length-1?"1px solid "+C.border:"none" }}>
                <span style={{ color:C.text, fontSize:14 }}>{row.label}</span>
                <span style={{ color:row.accent?C.accent:C.textMuted, fontSize:14, fontWeight:row.accent?700:400 }}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 삭제 + 이전 모달 */}
      {deleteConfirm && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.4)", zIndex:300, display:"flex", alignItems:"flex-end", justifyContent:"center" }}>
          <div style={{ background:C.surface, borderRadius:"20px 20px 0 0", padding:"24px 20px 36px", width:"100%", maxWidth:430, border:`1px solid ${C.border}` }}>
            {/* 제목 */}
            <p style={{ color:C.text, fontSize:16, fontWeight:700, margin:"0 0 6px" }}>🗑️ 카테고리 삭제</p>
            <p style={{ color:C.textMuted, fontSize:13, margin:"0 0 16px" }}>
              <span style={{ color:C.expense, fontWeight:600 }}>"{deleteConfirm.name}"</span> 카테고리를 삭제합니다
            </p>

            {/* 영향받는 거래 수 */}
            {(() => {
              const count = getAffectedCount(deleteConfirm.oldName);
              return count > 0 ? (
                <div style={{ background:C.expense+"11", borderRadius:10, padding:"10px 14px", marginBottom:16, display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:16 }}>⚠️</span>
                  <p style={{ color:C.expense, fontSize:13, margin:0 }}>
                    이 카테고리를 사용 중인 거래 <span style={{ fontWeight:700 }}>{count}건</span>이 있어요
                  </p>
                </div>
              ) : (
                <div style={{ background:C.income+"11", borderRadius:10, padding:"10px 14px", marginBottom:16, display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:16 }}>✅</span>
                  <p style={{ color:C.income, fontSize:13, margin:0 }}>이 카테고리를 사용 중인 거래가 없어요</p>
                </div>
              );
            })()}

            {/* 이전 대상 선택 */}
            {getAffectedCount(deleteConfirm.oldName) > 0 && (
              <div style={{ marginBottom:16 }}>
                <p style={{ color:C.textMuted, fontSize:12, margin:"0 0 8px", fontWeight:600 }}>
                  기존 거래를 어디로 이전할까요?
                </p>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                  {getMigrateOptions().map(name => {
                    const allCats = categories[catType].flatMap(g=>g.children);
                    const cat = allCats.find(c=>c.name===name)||{icon:"📦",color:C.textMuted};
                    return (
                      <button key={name} onClick={()=>setMigrateTo(name)}
                        style={{ padding:"6px 12px", borderRadius:20, border:`1px solid ${migrateTo===name?cat.color||C.accent:C.border}`,
                          background:migrateTo===name?(cat.color||C.accent)+"22":"transparent",
                          color:migrateTo===name?cat.color||C.accent:C.textMuted,
                          fontSize:12, fontWeight:migrateTo===name?700:400, cursor:"pointer" }}>
                        {cat.icon} {name}
                      </button>
                    );
                  })}
                </div>
                {/* 선택된 이전 대상 요약 */}
                <div style={{ marginTop:10, padding:"8px 12px", background:C.surfaceHigh, borderRadius:8 }}>
                  <span style={{ color:C.textMuted, fontSize:12 }}>
                    거래 {getAffectedCount(deleteConfirm.oldName)}건 →{" "}
                    <span style={{ color:C.text, fontWeight:600 }}>"{migrateTo}"</span>
                    으로 이전됩니다
                  </span>
                </div>
              </div>
            )}

            {/* 버튼 */}
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={()=>{ setDeleteConfirm(null); setMigrateTo("기타"); }}
                style={{ flex:1, padding:"14px", borderRadius:12, border:`1px solid ${C.border}`, background:"transparent", color:C.textMuted, fontSize:14, cursor:"pointer", fontWeight:600 }}>
                취소
              </button>
              <button onClick={execDelete}
                style={{ flex:1, padding:"14px", borderRadius:12, border:"none", background:C.expense, color:"#fff", fontSize:14, cursor:"pointer", fontWeight:700 }}>
                삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 변동금액 확정 모달 */}
      {confirmItem && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.4)", zIndex:200, display:"flex", alignItems:"flex-end", justifyContent:"center" }}>
          <div style={{ background:C.surface, borderRadius:"20px 20px 0 0", padding:"24px 20px 40px", width:"100%", maxWidth:430, border:`1px solid ${C.border}` }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
              <span style={{ fontSize:24 }}>{confirmItem.icon}</span>
              <div>
                <p style={{ color:C.text, fontSize:16, fontWeight:700, margin:0 }}>{confirmItem.name}</p>
                <p style={{ color:C.accent, fontSize:12, margin:"2px 0 0" }}>{monthLabel} 금액을 입력해주세요</p>
              </div>
            </div>
            <div style={{ background:C.surfaceHigh, borderRadius:10, padding:"10px 14px", marginBottom:12 }}>
              <p style={{ color:C.textMuted, fontSize:11, margin:"0 0 2px" }}>지난달</p>
              <p style={{ color:C.textSub, fontSize:14, fontWeight:600, margin:0, fontFamily:"'DM Mono',monospace" }}>{fmt(confirmItem.last_amount||0)}원</p>
            </div>
            <div style={{ display:"flex", alignItems:"center", background:C.surfaceHigh, borderRadius:10, border:`1px solid ${C.border}`, overflow:"hidden", marginBottom:16 }}>
              <input type="number" value={confirmAmt} onChange={e=>setConfirmAmt(e.target.value)}
                style={{ flex:1, background:"transparent", border:"none", outline:"none", color:C.text, fontSize:18, padding:"14px 16px", fontFamily:"'DM Mono',monospace" }} />
              <span style={{ color:C.textMuted, fontSize:14, paddingRight:16 }}>원</span>
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={()=>setConfirmItem(null)} style={{ flex:1, padding:"14px", borderRadius:12, border:`1px solid ${C.border}`, background:"transparent", color:C.textMuted, fontSize:15, cursor:"pointer" }}>취소</button>
              <button onClick={submitConfirm} disabled={!confirmAmt} style={{ flex:2, padding:"14px", borderRadius:12, border:"none", background:confirmAmt?C.accent:C.border, color:"#fff", fontSize:15, fontWeight:700, cursor:confirmAmt?"pointer":"default" }}>등록하기</button>
            </div>
          </div>
        </div>
      )}

      {/* 정기항목 추가 모달 */}
      {showAdd && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.4)", zIndex:200, display:"flex", alignItems:"flex-end", justifyContent:"center" }}>
          <div style={{ background:C.surface, borderRadius:"20px 20px 0 0", padding:"24px 20px 40px", width:"100%", maxWidth:430, border:`1px solid ${C.border}` }}>
            <p style={{ color:C.text, fontSize:16, fontWeight:700, margin:"0 0 20px" }}>정기 지출 추가</p>
            {[{label:"이름",field:"name",type:"text",placeholder:"넷플릭스, 관리비 등"},{label:"매달 결제일",field:"day_of_month",type:"number",placeholder:"1~31"}].map(f=>(
              <div key={f.field} style={{ marginBottom:12 }}>
                <p style={{ color:C.textMuted, fontSize:11, margin:"0 0 5px" }}>{f.label}</p>
                <input type={f.type} value={newRec[f.field]} onChange={e=>setNewRec(n=>({...n,[f.field]:e.target.value}))} placeholder={f.placeholder}
                  style={{ width:"100%", background:C.surfaceHigh, border:`1px solid ${C.border}`, borderRadius:10, padding:"10px 14px", color:C.text, fontSize:14, boxSizing:"border-box" }} />
              </div>
            ))}
            <div style={{ marginBottom:12 }}>
              <p style={{ color:C.textMuted, fontSize:11, margin:"0 0 5px" }}>금액 유형</p>
              <div style={{ display:"flex", gap:8 }}>
                {[{v:"fixed",label:"고정"},{v:"variable",label:"변동"}].map(o=>(
                  <button key={o.v} onClick={()=>setNewRec(n=>({...n,amount_type:o.v}))} style={{ flex:1, padding:"10px", borderRadius:10, border:`1px solid ${newRec.amount_type===o.v?C.accent:C.border}`, background:newRec.amount_type===o.v?C.accentSoft:"transparent", color:newRec.amount_type===o.v?C.accent:C.textMuted, fontSize:12, cursor:"pointer" }}>{o.label}</button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom:20 }}>
              <p style={{ color:C.textMuted, fontSize:11, margin:"0 0 5px" }}>{newRec.amount_type==="fixed"?"금액":"지난달 금액 (참고)"}</p>
              <input type="number" value={newRec.amount} onChange={e=>setNewRec(n=>({...n,amount:e.target.value}))} placeholder="0"
                style={{ width:"100%", background:C.surfaceHigh, border:`1px solid ${C.border}`, borderRadius:10, padding:"10px 14px", color:C.text, fontSize:14, boxSizing:"border-box" }} />
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={()=>setShowAdd(false)} style={{ flex:1, padding:"14px", borderRadius:12, border:`1px solid ${C.border}`, background:"transparent", color:C.textMuted, fontSize:15, cursor:"pointer" }}>취소</button>
              <button onClick={addRec} style={{ flex:2, padding:"14px", borderRadius:12, border:"none", background:C.accent, color:"#fff", fontSize:15, fontWeight:700, cursor:"pointer" }}>추가하기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FamilyInfoCard() {
  const { token, profile, handleSignOut } = useApp();
  const [family,  setFamily]  = useState(null);
  const [copied,  setCopied]  = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.family_id || !token) { setLoading(false); return; }
    sb.select("families", `id=eq.${profile.family_id}`, token)
      .then(data => { if (data?.length) setFamily(data[0]); setLoading(false); })
      .catch(() => setLoading(false));
  }, [profile?.family_id, token]);

  const copyCode = () => {
    if (!family?.invite_code) return;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(family.invite_code);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ background:C.surface, borderRadius:16, border:`1px solid ${C.border}`, padding:"16px", marginBottom:16 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:38, height:38, borderRadius:12, background:C.accentSoft, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 }}>👨‍👩‍👧</div>
          <div>
            <p style={{ color:C.text, fontSize:14, fontWeight:700, margin:0 }}>{family?.name || "우리 가족"}</p>
            <p style={{ color:C.textMuted, fontSize:11, margin:0 }}>{profile?.name||""} · {profile?.role==="owner"?"가족장":"멤버"}</p>
          </div>
        </div>
        <button onClick={handleSignOut}
          style={{ padding:"6px 12px", borderRadius:8, border:`1px solid ${C.border}`, background:"transparent", color:C.textMuted, fontSize:12, cursor:"pointer" }}>
          로그아웃
        </button>
      </div>
      <div style={{ background:C.surfaceHigh, borderRadius:12, padding:"12px 14px" }}>
        <p style={{ color:C.textMuted, fontSize:11, margin:"0 0 8px", fontWeight:600 }}>🔑 가족 초대코드</p>
        {loading ? (
          <p style={{ color:C.textMuted, fontSize:13, margin:0 }}>불러오는 중...</p>
        ) : (
          <>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
              <span style={{ color:C.accent, fontSize:24, fontWeight:800, letterSpacing:6, fontFamily:"'DM Mono',monospace" }}>
                {family?.invite_code || "??????"}
              </span>
              <button onClick={copyCode}
                style={{ padding:"8px 16px", borderRadius:10, border:"none", background:copied?C.income:C.accent, color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", transition:"background 0.2s" }}>
                {copied?"✓ 복사됨":"복사"}
              </button>
            </div>
            <p style={{ color:C.textMuted, fontSize:11, margin:0, lineHeight:1.5 }}>
              이 코드를 가족에게 공유하면 같은 가계부를 함께 쓸 수 있어요
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// 탭 + 메인 앱
// ══════════════════════════════════════════════════════════════
const TABS = [
  { id:"home",         label:"홈",   icon:"🏡" },
  { id:"transactions", label:"내역", icon:"🧾" },
  { id:"input",        label:"입력", icon:"＋" },
  { id:"stats",        label:"통계", icon:"📈" },
  { id:"settings",     label:"설정", icon:"⚙️" },
];

// ── 로그인/회원가입 화면 ──────────────────────────────────────
function AuthScreen({ onAuth }) {
  const [mode,     setMode]     = useState("login");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [name,     setName]     = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const [verified, setVerified] = useState(false);

  const handle = async () => {
    setError(""); setLoading(true);
    try {
      if (mode === "login") {
        const res = await sb.signIn(email, password);
        if (res.error) {
          if (res.error.message?.includes("Invalid login") || res.error.message?.includes("invalid_credentials"))
            throw new Error("이메일 또는 비밀번호가 올바르지 않아요");
          if (res.error.message?.includes("Email not confirmed"))
            throw new Error("이메일 인증이 완료되지 않았어요. 받은 편지함을 확인해주세요");
          throw new Error(res.error.message || "로그인 실패");
        }
        localStorage.setItem("sb_token", res.access_token);
        onAuth(res.access_token, res.user);
      } else {
        const res = await sb.signUp(email, password);
        if (res.error) {
          if (res.error.message?.includes("already registered") || res.error.message?.includes("already been registered"))
            throw new Error("이미 가입된 이메일이에요. 로그인을 시도해보세요.");
          throw new Error(res.error.message || "회원가입 실패");
        }
        if (!res.access_token) { setVerified(true); setLoading(false); return; }
        localStorage.setItem("sb_token", res.access_token);
        onAuth(res.access_token, res.user);
      }
    } catch(e) { setError(e.message); }
    setLoading(false);
  };

  if (verified) return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"24px" }}>
      <div style={{ width:"100%", maxWidth:380, textAlign:"center" }}>
        <div style={{ fontSize:56, marginBottom:20 }}>📧</div>
        <h2 style={{ color:C.text, fontSize:22, fontWeight:800, margin:"0 0 12px" }}>이메일을 확인해주세요</h2>
        <p style={{ color:C.textMuted, fontSize:14, margin:"0 0 8px", lineHeight:1.6 }}>
          <span style={{ color:C.accent, fontWeight:600 }}>{email}</span> 으로<br/>인증 링크를 보냈어요
        </p>
        <p style={{ color:C.textMuted, fontSize:13, margin:"0 0 32px" }}>메일의 링크를 클릭하면 가입이 완료됩니다</p>
        <button onClick={()=>{ setVerified(false); setMode("login"); }}
          style={{ width:"100%", padding:"15px", borderRadius:12, border:"none", background:C.accent, color:"#fff", fontSize:16, fontWeight:700, cursor:"pointer" }}>
          로그인하러 가기
        </button>
        <p style={{ color:C.textMuted, fontSize:12, marginTop:16 }}>메일이 안 왔나요? 스팸함을 확인해보세요</p>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"24px" }}>
      <div style={{ width:"100%", maxWidth:380 }}>
        <div style={{ textAlign:"center", marginBottom:36 }}>
          <div style={{ fontSize:52, marginBottom:12 }}>🏡</div>
          <h1 style={{ color:C.text, fontSize:26, fontWeight:800, margin:"0 0 6px" }}>우리집 가계부</h1>
          <p style={{ color:C.textMuted, fontSize:14, margin:0 }}>부부가 함께 쓰는 스마트 가계부</p>
        </div>
        <div style={{ display:"flex", background:C.surfaceHigh, borderRadius:12, padding:4, gap:4, marginBottom:24 }}>
          {[{v:"login",label:"로그인"},{v:"signup",label:"회원가입"}].map(t=>(
            <button key={t.v} onClick={()=>{ setMode(t.v); setError(""); }}
              style={{ flex:1, padding:"10px", borderRadius:9, border:"none", background:mode===t.v?C.accent:"transparent", color:mode===t.v?"#fff":C.textMuted, fontSize:14, fontWeight:mode===t.v?700:400, cursor:"pointer" }}>
              {t.label}
            </button>
          ))}
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:12, marginBottom:16 }}>
          {mode==="signup" && (
            <div>
              <p style={{ color:C.textMuted, fontSize:12, margin:"0 0 5px" }}>이름</p>
              <input value={name} onChange={e=>setName(e.target.value)} placeholder="홍길동"
                style={{ width:"100%", background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, padding:"12px 14px", color:C.text, fontSize:15, boxSizing:"border-box" }} />
            </div>
          )}
          <div>
            <p style={{ color:C.textMuted, fontSize:12, margin:"0 0 5px" }}>이메일</p>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="example@email.com"
              style={{ width:"100%", background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, padding:"12px 14px", color:C.text, fontSize:15, boxSizing:"border-box" }} />
          </div>
          <div>
            <p style={{ color:C.textMuted, fontSize:12, margin:"0 0 5px" }}>비밀번호</p>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="6자 이상"
              onKeyDown={e=>{ if(e.key==="Enter") handle(); }}
              style={{ width:"100%", background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, padding:"12px 14px", color:C.text, fontSize:15, boxSizing:"border-box" }} />
          </div>
        </div>
        {error && <p style={{ color:C.expense, fontSize:13, marginBottom:12, textAlign:"center" }}>{error}</p>}
        <button onClick={handle} disabled={loading}
          style={{ width:"100%", padding:"15px", borderRadius:12, border:"none", background:loading?C.border:C.accent, color:"#fff", fontSize:16, fontWeight:700, cursor:loading?"default":"pointer" }}>
          {loading?"처리 중...":mode==="login"?"로그인":"회원가입"}
        </button>
      </div>
    </div>
  );
}

// ── 가족 설정 화면 ────────────────────────────────────────────
function FamilySetupScreen({ token, userId, onSetup }) {
  const [mode,       setMode]       = useState("choose");
  const [familyName, setFamilyName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error,      setError]      = useState("");
  const [loading,    setLoading]    = useState(false);

  const handleCreate = async () => {
    if (!familyName.trim()) return;
    setError(""); setLoading(true);
    try {
      const families = await sb.insert("families", { name: familyName }, token);
      let familyId = (Array.isArray(families) ? families[0] : families)?.id;
      if (!familyId) {
        const found = await sb.select("families", `name=eq.${encodeURIComponent(familyName)}&order=created_at.desc&limit=1`, token);
        familyId = (Array.isArray(found) ? found[0] : found)?.id;
      }
      if (!familyId) throw new Error("가족 생성에 실패했어요. 잠시 후 다시 시도해주세요");
      await sb.insert("profiles", { id: userId, family_id: familyId, name: familyName, role: "owner" }, token);
      await sb.rpc("seed_default_categories", { p_family_id: familyId }, token);
      onSetup(familyId);
    } catch(e) { setError(e.message); }
    setLoading(false);
  };

  const handleJoin = async () => {
    if (inviteCode.length !== 6) return;
    setError(""); setLoading(true);
    try {
      const families = await sb.select("families", `invite_code=eq.${inviteCode.toUpperCase()}`, token);
      if (!families?.length) throw new Error("초대코드가 올바르지 않아요");
      const family = families[0];
      await sb.insert("profiles", { id: userId, family_id: family.id, role: "member" }, token);
      onSetup(family.id);
    } catch(e) { setError(e.message); }
    setLoading(false);
  };

  return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"24px" }}>
      <div style={{ width:"100%", maxWidth:380 }}>
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{ fontSize:44, marginBottom:12 }}>👨‍👩‍👧</div>
          <h2 style={{ color:C.text, fontSize:22, fontWeight:800, margin:"0 0 6px" }}>가족을 설정해요</h2>
          <p style={{ color:C.textMuted, fontSize:14, margin:0 }}>새 가족을 만들거나 기존 가족에 참여하세요</p>
        </div>
        {mode==="choose" && (
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <button onClick={()=>setMode("create")}
              style={{ padding:"18px", borderRadius:14, border:`2px solid ${C.accent}`, background:C.accentSoft, color:C.accent, fontSize:15, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:10 }}>
              <span style={{ fontSize:22 }}>🏠</span> 새 가족 만들기
            </button>
            <button onClick={()=>setMode("join")}
              style={{ padding:"18px", borderRadius:14, border:`1px solid ${C.border}`, background:C.surface, color:C.text, fontSize:15, fontWeight:600, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:10 }}>
              <span style={{ fontSize:22 }}>🔑</span> 초대코드로 참여
            </button>
          </div>
        )}
        {mode==="create" && (
          <div>
            <button onClick={()=>setMode("choose")} style={{ color:C.accent, fontSize:13, background:"transparent", border:"none", cursor:"pointer", marginBottom:20 }}>← 뒤로</button>
            <p style={{ color:C.textMuted, fontSize:12, margin:"0 0 6px" }}>가족 이름</p>
            <input value={familyName} onChange={e=>setFamilyName(e.target.value)} placeholder="예) 김씨 가족"
              style={{ width:"100%", background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, padding:"12px 14px", color:C.text, fontSize:15, boxSizing:"border-box", marginBottom:16 }} />
            {error && <p style={{ color:C.expense, fontSize:13, marginBottom:12 }}>{error}</p>}
            <button onClick={handleCreate} disabled={loading}
              style={{ width:"100%", padding:"15px", borderRadius:12, border:"none", background:familyName.trim()?C.accent:C.border, color:"#fff", fontSize:16, fontWeight:700, cursor:"pointer" }}>
              {loading?"생성 중...":"가족 만들기"}
            </button>
          </div>
        )}
        {mode==="join" && (
          <div>
            <button onClick={()=>setMode("choose")} style={{ color:C.accent, fontSize:13, background:"transparent", border:"none", cursor:"pointer", marginBottom:20 }}>← 뒤로</button>
            <p style={{ color:C.textMuted, fontSize:12, margin:"0 0 6px" }}>초대코드 (6자리)</p>
            <input value={inviteCode} onChange={e=>setInviteCode(e.target.value.toUpperCase())} placeholder="AB12CD" maxLength={6}
              style={{ width:"100%", background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, padding:"12px 14px", color:C.text, fontSize:20, fontWeight:700, boxSizing:"border-box", marginBottom:16, textAlign:"center", letterSpacing:4, fontFamily:"'DM Mono',monospace" }} />
            {error && <p style={{ color:C.expense, fontSize:13, marginBottom:12 }}>{error}</p>}
            <button onClick={handleJoin} disabled={loading}
              style={{ width:"100%", padding:"15px", borderRadius:12, border:"none", background:inviteCode.length===6?C.accent:C.border, color:"#fff", fontSize:16, fontWeight:700, cursor:"pointer" }}>
              {loading?"확인 중...":"참여하기"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 메인 앱 ──────────────────────────────────────────────────
export default function App() {
  const [token,       setToken]       = useState(null);
  const [authUser,    setAuthUser]    = useState(null);
  const [profile,     setProfile]     = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab,   setActiveTab]   = useState("home");
  const [transactions, setTransactionsLocal] = useState(INIT_TRANSACTIONS);
  const [recurring,    setRecurringLocal]    = useState(INIT_RECURRING);
  const [budgets,      setBudgetsLocal]      = useState({
    totalEnabled: false, total: 1500000,
    categories: { 식비:100000, 교통:50000, 쇼핑:100000 },
  });
  const now = new Date();

  // ── DB 데이터 로드 ────────────────────────────────────────
  const _loadAll = async (fid, tok) => {
    try {
      const txData = await sb.select("transactions",
        `family_id=eq.${fid}&parent_id=is.null&order=date.desc,created_at.desc`, tok);
      const groups = (txData||[]).filter(t=>t.is_group);
      let cm = {};
      if (groups.length > 0) {
        const kids = await sb.select("transactions",
          `parent_id=in.(${groups.map(g=>g.id).join(",")})&order=date.asc`, tok);
        (kids||[]).forEach(c=>{ if(!cm[c.parent_id])cm[c.parent_id]=[]; cm[c.parent_id].push(c); });
      }
      const txFmt = (txData||[]).map(t=>t.is_group?{...t,children:cm[t.id]||[],child_count:(cm[t.id]||[]).length}:t);
      if (txFmt.length>0) setTransactionsLocal(txFmt);

      const recData = await sb.select("recurring_transactions",`family_id=eq.${fid}&order=day_of_month.asc`,tok);
      if (recData?.length) setRecurringLocal(recData);

      const ym = new Date().toISOString().slice(0,7);
      const bData = await sb.select("budgets",`family_id=eq.${fid}&year_month=eq.${ym}`,tok);
      if (bData?.length) {
        const b=bData[0];
        setBudgetsLocal({totalEnabled:b.total_enabled,total:b.total||1500000,categories:b.categories||{}});
      }
    } catch(e) { console.error("로드실패",e); }
  };

  // ── 앱 시작 시 1번만 실행 ─────────────────────────────────
  useEffect(() => {
    (async () => {
      const tok = localStorage.getItem("sb_token");
      console.log("🔑 저장된 토큰:", tok ? tok.slice(0,20)+"..." : "없음");
      if (!tok) { setAuthLoading(false); return; }
      try {
        const user = await sb.getUser(tok);
        console.log("👤 getUser 결과:", user?.id ? "성공 id="+user.id : "실패", user?.error);
        if (user.error || !user.id) {
          localStorage.removeItem("sb_token"); setAuthLoading(false); return;
        }
        setToken(tok);
        setAuthUser(user);
        const pList = await sb.select("profiles", `id=eq.${user.id}`, tok);
        console.log("👨‍👩‍👧 프로필 조회:", pList?.length ? "성공 family_id="+pList[0].family_id : "없음", pList);
        if (pList?.length) {
          setProfile(pList[0]);
          if (pList[0].family_id) {
            console.log("📦 데이터 로드 시작 family_id="+pList[0].family_id);
            await _loadAll(pList[0].family_id, tok);
          } else {
            console.log("⚠️ family_id 없음 — 가족 설정 필요");
          }
        } else {
          console.log("⚠️ 프로필 없음");
        }
      } catch(e) { console.error("❌ Auth 복원 실패:", e); }
      setAuthLoading(false);
    })();
  }, []);

  const addTransactions = useCallback(async (items) => {
    setTransactionsLocal(prev=>[...items,...prev].sort((a,b)=>b.date.localeCompare(a.date)));
    const tok = localStorage.getItem("sb_token");
    console.log("💾 저장 시작 — 토큰:", tok ? "있음" : "없음");
    if (!tok) return;
    try {
      const user = await sb.getUser(tok);
      console.log("💾 getUser:", user?.id ? "성공" : "실패", user?.error);
      if (!user?.id) return;
      const pList = await sb.select("profiles",`id=eq.${user.id}`,tok);
      console.log("💾 프로필:", pList?.[0]?.family_id ? "family_id="+pList[0].family_id : "없음", pList);
      const cp = pList?.[0];
      if (!cp?.family_id) { console.log("❌ family_id 없어서 저장 중단"); return; }
      for (const item of items) {
        const row = {
          family_id:cp.family_id, user_id:cp.id,
          type:item.type, amount:item.amount,
          memo:item.memo, date:item.date,
          category:item.category, is_group:item.is_group||false,
        };
        console.log("💾 insert 시도:", row);
        const ins = await sb.insert("transactions", row, tok);
        console.log("💾 insert 결과:", ins);
        const par = Array.isArray(ins)?ins[0]:ins;
        if (item.is_group && item.children?.length && par?.id) {
          await sb.insert("transactions",
            item.children.map(c=>({
              family_id:cp.family_id, user_id:cp.id, parent_id:par.id,
              type:c.type||"expense", amount:c.amount, memo:c.memo,
              date:c.date||item.date, category:c.category, is_group:false,
            })), tok);
        }
      }
      console.log("✅ DB 저장 완료");
    } catch(e) { console.error("❌ 저장실패:", e); }
  }, []);

  const setTransactions = useCallback((updater) => {
    setTransactionsLocal(prev=>typeof updater==="function"?updater(prev):updater);
  }, []);

  const setRecurring = useCallback((updater) => {
    setRecurringLocal(prev=>typeof updater==="function"?updater(prev):updater);
  }, []);

  const setBudgets = useCallback(async (nb) => {
    setBudgetsLocal(nb);
    const tok = localStorage.getItem("sb_token");
    if (!tok || !profile?.family_id) return;
    try {
      await sb.upsert("budgets",{
        family_id:profile.family_id, year_month:new Date().toISOString().slice(0,7),
        total:nb.total, total_enabled:nb.totalEnabled, categories:nb.categories,
      },"family_id,year_month",tok);
    } catch(e) { console.error(e); }
  }, [profile]);

  const handleSignOut = async () => {
    const tok = localStorage.getItem("sb_token");
    if (tok) await sb.signOut(tok);
    localStorage.removeItem("sb_token");
    setToken(null); setAuthUser(null); setProfile(null);
    setTransactionsLocal(INIT_TRANSACTIONS);
  };

  if (authLoading) return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:16 }}>
      <div style={{ fontSize:40 }}>🏡</div>
      <div style={{ width:32, height:32, border:`3px solid ${C.border}`, borderTopColor:C.accent, borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg);}}`}</style>
    </div>
  );

  if (!token || !authUser) return (
    <AuthScreen onAuth={(tok, user) => {
      localStorage.setItem("sb_token", tok);
      setToken(tok); setAuthUser(user);
    }} />
  );

  if (!profile?.family_id) return (
    <FamilySetupScreen
      token={token}
      userId={authUser.id}
      onSetup={async (familyId) => {
        const tok = localStorage.getItem("sb_token");
        const pList = await sb.select("profiles", `id=eq.${authUser.id}`, tok);
        if (pList?.length) setProfile(pList[0]);
        else setProfile(p=>({...p, family_id:familyId}));
        await _loadAll(familyId, tok);
      }}
    />
  );

  const ctx = {
    transactions, setTransactions, recurring, setRecurring,
    addTransactions, activeTab, setActiveTab,
    budgets, setBudgets, token, profile, authUser, handleSignOut,
  };

  return (
    <AppContext.Provider value={ctx}>
      <div style={{ maxWidth:430, margin:"0 auto", minHeight:"100vh", background:C.bg, fontFamily:"'Pretendard','Apple SD Gothic Neo',sans-serif", overflowX:"hidden" }}>
        <div style={{ minHeight:"calc(100vh - 70px)", overflowY:"auto" }}>
          {activeTab==="home"         && <HomeScreen />}
          {activeTab==="transactions" && <TransactionsScreen />}
          {activeTab==="input"        && <InputScreen />}
          {activeTab==="stats"        && <StatsScreen />}
          {activeTab==="settings"     && <SettingsScreen />}
        </div>
        <div style={{ position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:430, background:"rgba(245,246,250,0.95)", backdropFilter:"blur(16px)", borderTop:`1px solid ${C.border}`, zIndex:100 }}>
          {activeTab==="stats" && (
            <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:6, padding:"5px 0 2px", borderBottom:`1px solid ${C.border}` }}>
              <span style={{ fontSize:11, color:C.accent, fontWeight:600 }}>{now.getFullYear()}년 {now.getMonth()+1}월 기준</span>
              <span style={{ fontSize:10, color:C.textMuted }}>· 이달 통계</span>
            </div>
          )}
          <div style={{ display:"flex", alignItems:"center", height:56 }}>
            {TABS.map(tab=>(
              <button key={tab.id} onClick={()=>setActiveTab(tab.id)}
                style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:2, border:"none", background:"transparent", cursor:"pointer", padding:"6px 0" }}>
                {tab.id==="input"
                  ? <div style={{ width:40, height:40, borderRadius:13, background:activeTab==="input"?C.accent:C.accentSoft, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, color:"#fff", marginBottom:-4, transition:"background 0.2s" }}>＋</div>
                  : <>
                      <span style={{ fontSize:activeTab===tab.id?22:19, filter:activeTab===tab.id?"none":"grayscale(1) opacity(0.45)", transition:"all 0.2s", lineHeight:1 }}>{tab.icon}</span>
                      <span style={{ fontSize:9, color:activeTab===tab.id?C.accent:C.textMuted, fontWeight:activeTab===tab.id?700:400, transition:"color 0.2s" }}>{tab.label}</span>
                    </>
                }
              </button>
            ))}
          </div>
        </div>
      </div>
    </AppContext.Provider>
  );
}

