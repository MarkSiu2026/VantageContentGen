import { useState, useRef, useEffect } from "react";

/* ─── BRAND TOKENS ───────────────────────────────────────────────── */
const B = {
  orange:  "#E35728",
  teal:    "#004E5A",
  cream:   "#F5EDE0",
  dark:    "#111111",
  appBg:   "#080E19",
  panel:   "#0F1A28",
  card:    "#152032",
  border:  "rgba(255,255,255,0.07)",
  muted:   "#6B7280",
};

const DISCLAIMER =
  "Trading CFDs involves the risk of losing substantially more than the initial investment, and CFD investors do not own or have any rights to underlying assets. General advice only and does not constitute any investment advice. Please see our TMD, PDS and FSG on our website before trading. Vantage Global Prime Pty Ltd AFSL 428901.";

const SOURCE_DEFS = [
  { name:"Reuters",       rss:"https://feeds.reuters.com/reuters/businessNews",         hasRss:true  },
  { name:"FXStreet",      rss:"https://www.fxstreet.com/rss/news",                     hasRss:true  },
  { name:"DailyFX",       rss:"https://www.dailyfx.com/feeds/all",                     hasRss:true  },
  { name:"Investing.com", rss:"https://www.investing.com/rss/news.rss",                hasRss:true  },
  { name:"MarketWatch",   rss:"https://feeds.content.dowjones.io/public/rss/mw_realtimeheadlines", hasRss:true },
  { name:"Bloomberg",     rss:"",                                                       hasRss:false },
  { name:"Ausbiz",        rss:"",                                                       hasRss:false },
  { name:"InvestingLive", rss:"",                                                       hasRss:false },
];
const SOURCES = SOURCE_DEFS.map(s => s.name);

/* ─── KEYWORD SCORING ENGINE ────────────────────────────────── */
const KW_IMPORTANCE = {
  10: ["emergency","collapse","crash","crisis","default","bankrupt","war","invasion","nuclear","sanctions"],
  9:  ["fed","federal reserve","rate decision","rate cut","rate hike","ecb","rba","boe","boj","cpi","inflation","gdp","nonfarm","payrolls","fomc","tariff","recession"],
  8:  ["interest rate","central bank","unemployment","trade war","opec","oil price","earnings","ipo","merger","acquisition","geopolit"],
  7:  ["dollar","euro","yuan","yen","pound","gold","crude","bitcoin","equities","stocks","bonds","yield","treasury"],
  6:  ["market","economy","economic","forecast","outlook","growth","deficit","surplus","exports","imports","manufacturing","pmi"],
  5:  ["analyst","report","quarter","guidance","revenue","profit","loss","data","release","update"],
};
const KW_CATEGORY = {
  "Forex":         ["forex","fx","dollar","euro","yen","pound","yuan","currency","usd","eur","gbp","jpy","aud","cad","chf","nzd","exchange rate","dxy"],
  "Equities":      ["stock","equity","equities","shares","nasdaq","s&p","dow jones","asx","nikkei","ftse","dax","earnings","ipo","dividend"],
  "Commodities":   ["oil","gold","silver","copper","wheat","corn","gas","crude","brent","wti","commodity","opec","iron ore"],
  "Central Banks": ["fed","federal reserve","ecb","rba","boe","boj","pboc","rate","fomc","monetary policy","central bank","interest rate","quantitative"],
  "Geopolitics":   ["war","conflict","sanction","tariff","trade war","nato","china","russia","ukraine","middle east","taiwan","geopolit","election","trump","xi","biden"],
  "Economic Data": ["gdp","cpi","inflation","unemployment","payroll","pmi","retail sales","trade balance","current account","consumer","manufacturing","jobs report"],
};
const KW_ACCENT = [
  ["federal reserve","Federal Reserve"],["fed rate","Fed Rate"],["us cpi","US CPI"],["us gdp","US GDP"],
  ["nonfarm payrolls","Nonfarm Payrolls"],["trade war","Trade War"],["rate cut","Rate Cut"],
  ["rate hike","Rate Hike"],["oil prices","Oil Prices"],["gold prices","Gold Prices"],
];

function scoreImportance(text) {
  const t = text.toLowerCase();
  for (const [score, words] of Object.entries(KW_IMPORTANCE).sort((a,b)=>b[0]-a[0])) {
    if (words.some(w => t.includes(w))) return Number(score);
  }
  return 4;
}

function detectCategory(text) {
  const t = text.toLowerCase();
  let best = "Economic Data", bestCount = 0;
  for (const [cat, words] of Object.entries(KW_CATEGORY)) {
    const count = words.filter(w => t.includes(w)).length;
    if (count > bestCount) { bestCount = count; best = cat; }
  }
  return best;
}

function extractAccentWords(headline) {
  const h = headline.toLowerCase();
  for (const [kw, display] of KW_ACCENT) {
    if (h.includes(kw)) return display;
  }
  // Fallback: first 1-2 significant capitalized words
  const words = headline.split(" ").filter(w => w.length > 3 && /^[A-Z]/.test(w));
  return words.slice(0,2).join(" ") || headline.split(" ")[0];
}

function parseRssXml(xmlText, sourceName) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "text/xml");
  const items = [...doc.querySelectorAll("item")];
  return items.slice(0, 8).map((item, i) => {
    const headline = item.querySelector("title")?.textContent?.trim() || "";
    const summary  = item.querySelector("description")?.textContent?.replace(/<[^>]+>/g,"").trim().slice(0,200) || "";
    const pubDate  = item.querySelector("pubDate")?.textContent || "";
    const link     = item.querySelector("link")?.textContent || "";
    const importance = scoreImportance(headline + " " + summary);
    const category   = detectCategory(headline + " " + summary);
    const accentWords = extractAccentWords(headline);
    // Format eventDate from pubDate
    let eventDate = "";
    try {
      const d = new Date(pubDate);
      if (!isNaN(d)) eventDate = d.toLocaleDateString("en-AU",{day:"numeric",month:"short",weekday:"short"});
    } catch(_){}
    return { id:`${sourceName}-${i}`, headline, summary, source:sourceName, category, importance, accentWords, eventDate, link };
  }).filter(h => h.headline.length > 10);
}

const CAT_COLORS = {
  "Forex":          "#3B82F6",
  "Equities":       "#10B981",
  "Commodities":    "#F59E0B",
  "Central Banks":  "#004E5A",
  "Geopolitics":    "#EF4444",
  "Economic Data":  "#8B5CF6",
  "Crypto":         "#EC4899",
};

function getWeekLabel() {
  const d   = new Date();
  const mon = new Date(d);
  const day = mon.getDay();
  mon.setDate(mon.getDate() - day + (day === 0 ? -6 : 1));
  return `WEEK AHEAD | WEEK OF ${mon.toLocaleDateString("en-AU",{day:"numeric",month:"short",year:"numeric"}).toUpperCase()}`;
}

/* ─── INJECT FONTS ───────────────────────────────────────────────── */
function useFont() {
  useEffect(() => {
    // Load Outfit (Gilroy alternative) + Plus Jakarta Sans
    ["Outfit","Outfit"].forEach(family => {
      const id = "gf-" + family.replace(/\s/g,"-").toLowerCase();
      if (document.getElementById(id)) return;
      const l = document.createElement("link");
      l.id = id; l.rel = "stylesheet";
      l.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900&display=swap`;
      document.head.appendChild(l);
    });
  }, []);
}

/* ─── SLIDE RENDERERS ────────────────────────────────────────────── */

function CoverSlide({ data, s = 1 }) {
  return (
    <div style={{ width: 300*s, height: 375*s, background:"white", position:"relative", overflow:"hidden", fontFamily:"'Outfit','Plus Jakarta Sans','Segoe UI',sans-serif", flexShrink:0 }}>
      {/* BG abstract blobs */}
      <svg style={{ position:"absolute", top:-10*s, right:-10*s, opacity:0.12 }} width={200*s} height={200*s} viewBox="0 0 200 200">
        <ellipse cx="140" cy="70"  rx="100" ry="80"  fill="#999"/>
        <ellipse cx="160" cy="160" rx="80"  ry="60"  fill="#bbb"/>
      </svg>
      <svg style={{ position:"absolute", bottom:60*s, left:-15*s, opacity:0.08 }} width={120*s} height={120*s} viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="60" fill="#888"/>
      </svg>

      <div style={{ position:"absolute", inset:0, padding:`${22*s}px ${22*s}px ${18*s}px`, display:"flex", flexDirection:"column" }}>
        {/* Badge */}
        <div style={{ display:"inline-flex", alignSelf:"flex-start", background:B.orange, color:"white", padding:`${4*s}px ${11*s}px`, borderRadius:100*s, fontSize:7.5*s, fontWeight:700, letterSpacing:"0.04em", marginBottom:12*s }}>
          {data?.weekLabel || getWeekLabel()}
        </div>

        {/* Cover Title */}
        <div style={{ marginBottom:12*s, lineHeight:1.1 }}>
          <span style={{ fontSize:23*s, fontWeight:900, color:B.orange }}>{data?.coverAccentWords || "Markets Navigate"}</span>
          <br/>
          <span style={{ fontSize:23*s, fontWeight:900, color:B.dark }}>{data?.coverRestTitle || "Fed & Trade Signals"}</span>
        </div>

        {/* Hero image area */}
        <div style={{ flex:1, borderRadius:9*s, overflow:"hidden", position:"relative", background:"linear-gradient(135deg,#b8cdd8 0%,#8aa8be 40%,#5d8aab 100%)", marginBottom:10*s, minHeight:120*s }}>
          {/* Decorative market chart */}
          <svg style={{ position:"absolute", bottom:0, left:0, right:0 }} width="100%" height="60%" viewBox="0 0 300 100" preserveAspectRatio="none">
            <defs>
              <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="white" stopOpacity="0.25"/>
                <stop offset="100%" stopColor="white" stopOpacity="0"/>
              </linearGradient>
            </defs>
            <polyline points="0,90 40,70 80,75 120,45 160,55 200,25 250,35 300,10" stroke="white" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            <polygon points="0,90 40,70 80,75 120,45 160,55 200,25 250,35 300,10 300,100 0,100" fill="url(#cg)"/>
            <polyline points="0,100 40,88 80,90 120,75 160,80 200,62 250,68 300,50" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
          </svg>
          {/* Arrow btn */}
          <div style={{ position:"absolute", bottom:6*s, right:6*s, width:28*s, height:28*s, background:B.orange, borderRadius:7*s, display:"flex", alignItems:"center", justifyContent:"center", color:"white", fontSize:14*s, fontWeight:800 }}>→</div>
        </div>

        {/* Disclaimer */}
        <p style={{ margin:0, fontSize:4.2*s, color:"#888", lineHeight:1.5 }}>{DISCLAIMER}</p>
      </div></div>
  );
}

function ContentSlide({ slide, s = 1 }) {
  return (
    <div style={{ width:300*s, height:375*s, background:B.cream, position:"relative", overflow:"hidden", fontFamily:"'Outfit','Plus Jakarta Sans','Segoe UI',sans-serif", flexShrink:0 }}>
      <div style={{ position:"absolute", inset:0, padding:`${22*s}px ${22*s}px ${20*s}px`, display:"flex", flexDirection:"column" }}>
        {/* Title */}
        <div style={{ marginBottom:8*s, lineHeight:1.1 }}>
          <span style={{ fontSize:27*s, fontWeight:900, color:B.orange }}>{slide?.accentWords || "Markets"} </span>
          <span style={{ fontSize:27*s, fontWeight:900, color:B.dark  }}>{slide?.restOfTitle || "Update"}</span>
        </div>

        {/* Date */}
        {slide?.eventDate && (
          <p style={{ margin:`0 0 ${10*s}px`, fontSize:10.5*s, fontWeight:700, color:B.dark }}>{slide.eventDate}</p>
        )}

        {/* Body */}
        <p style={{ margin:0, fontSize:9.5*s, lineHeight:1.7, color:"#222", flex:1 }}>{slide?.body || ""}</p>

        {/* Arrow */}
        <div style={{ position:"absolute", bottom:12*s, right:14*s, width:28*s, height:28*s, background:B.orange, borderRadius:7*s, display:"flex", alignItems:"center", justifyContent:"center", color:"white", fontSize:14*s, fontWeight:800 }}>→</div>
      </div></div>
  );
}

/* ─── HEADLINE CARD ──────────────────────────────────────────────── */
function HeadlineCard({ h, selected, dragging, dragOver, onToggle, onDragStart, onDragOver, onDrop, onPreview }) {
  const cat   = h.category || "Other";
  const cc    = CAT_COLORS[cat] || B.orange;
  const score = h.importance || 5;
  const scoreCol = score >= 8 ? B.orange : score >= 5 ? B.teal : "#374151";

  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, h.id)}
      onDragOver={e => { e.preventDefault(); onDragOver(h.id); }}
      onDrop={e => { e.preventDefault(); onDrop(h.id); }}
      onClick={() => onToggle(h.id)}
      style={{
        background: dragOver ? "rgba(227,87,40,0.14)" : selected ? "rgba(227,87,40,0.07)" : "rgba(255,255,255,0.03)",
        border: `1px solid ${dragOver ? B.orange : selected ? `${B.orange}55` : B.border}`,
        borderRadius: 10,
        padding: "11px 13px",
        cursor: "grab",
        opacity: dragging ? 0.35 : 1,
        transition: "all 0.15s",
        userSelect: "none",
        marginBottom: 7,
      }}
    >
      <div style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
        {/* Score badge */}
        <div style={{ width:28, height:28, borderRadius:6, background:scoreCol, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:800, color:"white", flexShrink:0 }}>
          {score}
        </div>

        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:12, fontWeight:600, color:"white", lineHeight:1.45, marginBottom:5 }}>{h.headline}</div>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
            <span style={{ fontSize:10, color:B.muted }}>{h.source}</span>
            <span style={{ fontSize:9, fontWeight:700, color:cc, background:`${cc}1A`, padding:"2px 7px", borderRadius:4 }}>{cat}</span>
            {h.eventDate && <span style={{ fontSize:9, color:"#9CA3AF", fontStyle:"italic" }}>{h.eventDate}</span>}
          </div>
        </div>

        <div style={{ display:"flex", flexDirection:"column", gap:4, flexShrink:0, alignItems:"center" }}>
          <div style={{ fontSize:15, color: selected ? B.orange : "#374151", fontWeight:700 }}>
            {selected ? "✓" : "+"}
          </div>
          <button onClick={e=>{ e.stopPropagation(); onPreview&&onPreview(h); }}
            title="Preview full headline"
            style={{ background:"none", border:`1px solid ${B.border}`, borderRadius:4, color:B.muted, fontSize:9, cursor:"pointer", padding:"1px 5px", fontFamily:"inherit", lineHeight:1.4 }}>
            👁
          </button>
        </div>
      </div></div>
  );
}

/* ─── NEWS RECORD TABLE ──────────────────────────────────────────── */
function NewsRecord({ headlines }) {
  return (
    <div style={{ overflowX:"auto" }}>
      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
        <thead>
          <tr style={{ borderBottom:`1px solid ${B.border}` }}>
            {["#","Score","Headline","Source","Category","Event Date"].map(h => (
              <th key={h} style={{ padding:"8px 12px", textAlign:"left", color:B.muted, fontWeight:600, whiteSpace:"nowrap" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {headlines.map((h,i) => (
            <tr key={h.id} style={{ borderBottom:`1px solid ${B.border}`, transition:"background 0.1s" }}>
              <td style={{ padding:"9px 12px", color:B.muted }}>{i+1}</td>
              <td style={{ padding:"9px 12px" }}>
                <span style={{ background: h.importance>=8?B.orange:h.importance>=5?B.teal:"#374151", color:"white", borderRadius:5, padding:"2px 7px", fontSize:11, fontWeight:700 }}>
                  {h.importance}
                </span>
              </td>
              <td style={{ padding:"9px 12px", color:"white", maxWidth:320 }}>{h.headline}</td>
              <td style={{ padding:"9px 12px", color:B.muted, whiteSpace:"nowrap" }}>{h.source}</td>
              <td style={{ padding:"9px 12px" }}>
                <span style={{ fontSize:10, color:CAT_COLORS[h.category]||B.orange, background:`${(CAT_COLORS[h.category]||B.orange)}1A`, padding:"2px 8px", borderRadius:4, fontWeight:600, whiteSpace:"nowrap" }}>
                  {h.category}
                </span>
              </td>
              <td style={{ padding:"9px 12px", color:B.muted, whiteSpace:"nowrap" }}>{h.eventDate||"—"}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
  );
}

/* ─── EDITOR CONSTANTS ──────────────────────────────────────────────── */
const BRAND_COLORS = [
  "#E35728","#004E5A","#F5EDE0","#111111","#FFFFFF",
  "#6B7280","#D1D5DB","#FEF3C7","#DBEAFE","#ECFDF5",
];
const EDIT_SCALE = 1.82;
const SLIDE_W    = 300;
const SLIDE_H    = 375;

// Shared editor micro-styles (module-level so all editor components can use them)
const eBtn = {
  background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.1)",
  borderRadius:8, padding:"7px 14px", fontSize:12, fontWeight:600,
  color:"white", cursor:"pointer", fontFamily:"inherit",
};
const lBtn  = { background:"none", border:"none", color:"#6B7280", cursor:"pointer", fontSize:11, padding:"2px 4px", fontFamily:"inherit" };
const pLbl  = { display:"block", fontSize:10, fontWeight:700, color:"#6B7280", letterSpacing:"0.05em", textTransform:"uppercase", marginBottom:5 };
const nBtn  = { background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:5, width:28, height:28, fontSize:15, color:"white", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, fontFamily:"inherit" };
const propInput = { width:"100%", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:7, padding:"6px 9px", fontSize:11, color:"white", fontFamily:"inherit", boxSizing:"border-box" };

function scaleElStyle(style, s) {
  const o = { ...style };
  if (o.fontSize)      o.fontSize      = o.fontSize * s;
  if (typeof o.borderRadius === "number") o.borderRadius = o.borderRadius * s;
  if (o.paddingLeft)   o.paddingLeft   = o.paddingLeft * s;
  if (o.paddingRight)  o.paddingRight  = o.paddingRight * s;
  return o;
}

/* ─── CAROUSEL → EDITABLE SLIDES ───────────────────────────────────── */

/* ─── GOOGLE FONTS LIST ─────────────────────────────────────────────── */
const GOOGLE_FONTS = [
  "Outfit","Outfit","Inter","Montserrat","Poppins","Raleway",
  "Oswald","DM Sans","Nunito","Lato","Bebas Neue",
];
// Outfit is the closest freely available match to Gilroy (same geometric rounded forms, similar weight distribution)

function loadGoogleFont(family) {
  const id = "gf-" + family.replace(/\s/g,"-").toLowerCase();
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id   = id; link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900&display=swap`;
  document.head.appendChild(link);
}

/* ─── THEME PRESETS ─────────────────────────────────────────────────── */
const THEME_PRESETS = [
  { name:"Vantage",  emoji:"🟠", accentColor:"#E35728", textColor:"#111111", bgColor:"#F5EDE0", coverBgColor:"#FFFFFF", fontFamily:"Outfit" },
  { name:"Dark Pro", emoji:"⚫", accentColor:"#E35728", textColor:"#FFFFFF", bgColor:"#0F172A", coverBgColor:"#0F172A", fontFamily:"Inter" },
  { name:"Minimal",  emoji:"⚪", accentColor:"#111111", textColor:"#111111", bgColor:"#FFFFFF", coverBgColor:"#F8F8F8", fontFamily:"Outfit" },
  { name:"Teal",     emoji:"🩵", accentColor:"#004E5A", textColor:"#111111", bgColor:"#E8F4F6", coverBgColor:"#FFFFFF", fontFamily:"Montserrat" },
  { name:"Gold",     emoji:"🟡", accentColor:"#D97706", textColor:"#111111", bgColor:"#FFFBEB", coverBgColor:"#FFFFFF", fontFamily:"Poppins" },
  { name:"Navy",     emoji:"🔵", accentColor:"#2563EB", textColor:"#FFFFFF", bgColor:"#1E3A5F", coverBgColor:"#0F2040", fontFamily:"Raleway" },
  { name:"Mono",     emoji:"⬛", accentColor:"#4B5563", textColor:"#FFFFFF", bgColor:"#18181B", coverBgColor:"#27272A", fontFamily:"Oswald" },
  { name:"Blush",    emoji:"🌸", accentColor:"#DB2777", textColor:"#111111", bgColor:"#FDF2F8", coverBgColor:"#FFFFFF", fontFamily:"Nunito" },
];

function carouselToEditableSlides(carousel) {
  const slides = [];

  // ── Cover slide ───────────────────────────────────────────────
  // Layout: badge(y18) → accent title(y46) → rest title(y72)
  //         hero image(y108, h:162) → arrow(y254) → disclaimer(y295)
  // Font 20px * 1.15 lh = ~23px/line. 2 lines = 46px → rest starts at y:72 ✓
  slides.push({
    id:"cover", label:"Cover", background:"#FFFFFF", fontFamily:"Outfit",
    elements:[
      { id:"e-badge",      type:"badge",     x:22,  y:18,  width:200, height:22,
        content: carousel.weekLabel || getWeekLabel(),
        style:{ background:B.orange, borderRadius:100, color:"#fff", fontSize:7.5, fontWeight:700, letterSpacing:"0.04em", paddingLeft:11, paddingRight:11, display:"flex", alignItems:"center" },
        visible:true, locked:false },
      { id:"e-accent",     type:"text",      x:22,  y:48,  width:256, height:"auto",
        content: carousel.coverAccentWords || "Markets",
        style:{ fontSize:20, fontWeight:900, color:B.orange, lineHeight:1.15 },
        visible:true, locked:false },
      { id:"e-rest",       type:"text",      x:22,  y:74,  width:256, height:"auto",
        content: carousel.coverRestTitle || "Update",
        style:{ fontSize:20, fontWeight:900, color:B.dark, lineHeight:1.15 },
        visible:true, locked:false },
      { id:"e-hero",       type:"hero",      x:22,  y:108, width:256, height:162,
        content:"", style:{ borderRadius:9 }, visible:true, locked:false },
      { id:"e-arrow",      type:"arrow-btn", x:252, y:254, width:26,  height:26,
        content:"→",
        style:{ background:B.orange, borderRadius:7, color:"#fff", fontSize:14, fontWeight:800 },
        visible:true, locked:false },
      { id:"e-disclaimer", type:"text",      x:22,  y:295, width:256, height:"auto",
        content: DISCLAIMER,
        style:{ fontSize:4.2, color:"#888", lineHeight:1.5 },
        visible:true, locked:false },
    ],
  });

  // ── Content slides ────────────────────────────────────────────
  // Layout: accent(y22, font19) → rest(y56, font19) → [date(y96)] → body(y112/130)
  // 19px * 1.15 lh = ~22px/line. 2-line accent ends at y:66 → rest at y:72 safe gap ✓
  // Body 9px * 1.65 lh = ~15px/line. 6 lines = 90px. Starts y:130 → ends ~220. Arrow y:348 ✓
  (carousel.slides || []).forEach((slide, i) => {
    const hasDate = !!(slide.eventDate && slide.eventDate.trim());
    const bodyY   = hasDate ? 132 : 112;
    const els = [
      { id:"e-accent", type:"text", x:22, y:22,  width:256, height:"auto",
        content: slide.accentWords || "",
        style:{ fontSize:19, fontWeight:900, color:B.orange, lineHeight:1.15 },
        visible:true, locked:false },
      { id:"e-rest",   type:"text", x:22, y:58,  width:256, height:"auto",
        content: slide.restOfTitle || "",
        style:{ fontSize:19, fontWeight:900, color:B.dark, lineHeight:1.15 },
        visible:true, locked:false },
    ];
    if (hasDate) els.push(
      { id:"e-date", type:"text", x:22, y:96, width:256, height:"auto",
        content: slide.eventDate,
        style:{ fontSize:10, fontWeight:700, color:"#555555", lineHeight:1.2 },
        visible:true, locked:false }
    );
    els.push(
      { id:"e-body",  type:"text",      x:22,  y:bodyY, width:256, height:"auto",
        content: slide.body || "",
        style:{ fontSize:9, color:"#222222", lineHeight:1.65 },
        visible:true, locked:false },
      { id:"e-arrow", type:"arrow-btn", x:252, y:348,   width:26,  height:26,
        content:"→",
        style:{ background:B.orange, borderRadius:7, color:"#fff", fontSize:14, fontWeight:800 },
        visible:true, locked:false }
    );
    slides.push({ id:`slide-${i}`, label:`Slide ${i+1}`, background:B.cream, fontFamily:"Outfit", elements:els });
  });

  return slides;
}

/* ─── MINI SLIDE THUMBNAIL ──────────────────────────────────────────── */
function MiniSlide({ slide }) {
  const MS = 0.215;
  return (
    <div style={{ width:SLIDE_W*MS, height:SLIDE_H*MS, background:slide.background, position:"relative", overflow:"hidden", fontFamily:`'${slide.fontFamily||"Outfit"}',sans-serif` }}>
      {/* Geometric bg for earnings slides */}
      {slide.slideType === "earnings" && (
        <svg style={{ position:"absolute", top:0, right:0, opacity:0.09, pointerEvents:"none" }}
          width={SLIDE_W*MS*0.75} height={SLIDE_H*MS*0.7} viewBox="0 0 220 250">
          {[0,1,2,3,4,5].map(i=>(
            <ellipse key={i} cx={160+i*15} cy={i*30} rx={75} ry={105}
              fill="none" stroke="#555" strokeWidth={16} transform="rotate(-18 110 125)"/>
          ))}
        </svg>
      )}
      {slide.elements.filter(e=>e.visible).map(el=>{
        const ss = scaleElStyle(el.style, MS);
        if (el.type==="hero")
          return <div key={el.id} style={{ position:"absolute", left:el.x*MS, top:el.y*MS, width:el.width*MS, height:el.height*MS, background:"linear-gradient(135deg,#b8cdd8,#5d8aab)", borderRadius:(el.style.borderRadius||9)*MS }}/>;
        if (el.type==="arrow-btn")
          return <div key={el.id} style={{ position:"absolute", left:el.x*MS, top:el.y*MS, width:el.width*MS, height:el.height*MS, background:el.style.background||B.orange, borderRadius:(el.style.borderRadius||7)*MS }}/>;
        if (el.type==="rect")
          return <div key={el.id} style={{ position:"absolute", left:el.x*MS, top:el.y*MS, width:el.width*MS, height:(el.height==="auto"?40:el.height)*MS, background:el.style.background, borderRadius:(el.style.borderRadius||0)*MS }}/>;
        if (el.type==="badge")
          return <div key={el.id} style={{ position:"absolute", left:el.x*MS, top:el.y*MS, width:el.width*MS, height:(el.height||20)*MS, background:el.style.background||B.orange, borderRadius:100 }}/>;
        if (el.type==="earnings-list") {
          let items = [];
          try { items = JSON.parse(el.content||"[]"); } catch(_){}
          return (
            <div key={el.id} style={{ position:"absolute", left:el.x*MS, top:el.y*MS, width:(el.width||256)*MS }}>
              {items.map((item,i)=>(
                <div key={i}>
                  {i>0 && <div style={{ height:0.5, background:"#D1D5DB", margin:"1.5px 0" }}/>}
                  <div style={{ display:"flex", alignItems:"center", gap:1.5, padding:"1.5px 0" }}>
                    <div style={{ width:9, height:5, borderRadius:10, background:B.orange, flexShrink:0 }}/>
                    <div style={{ fontSize:2.6, fontWeight:700, color:"#111", overflow:"hidden", whiteSpace:"nowrap", flex:1, textOverflow:"ellipsis" }}>{item.company}</div>
                    <div style={{ fontSize:2.1, color:"#9CA3AF", flexShrink:0 }}>{item.timing}</div>
                  </div>
                </div>
              ))}
            </div>
          );
        }
        return (
          <div key={el.id} style={{ position:"absolute", left:el.x*MS, top:el.y*MS, width:(el.width==="auto"?200:el.width)*MS, ...ss, overflow:"hidden", whiteSpace:"nowrap", textOverflow:"ellipsis" }}>
            {el.content}
          </div>
        );
      })}
    </div>
  );
}

/* ─── EARNINGS LIST ELEMENT EDITOR ─────────────────────────────────────── */
function EarningsListEditor({ el, updateEl, deleteEl }) {
  let items = [];
  try { items = JSON.parse(el.content||"[]"); } catch(_){}

  function setItems(next) { updateEl(el.id,{content:JSON.stringify(next)}); }

  return (
    <div style={{ padding:15, overflowY:"auto" }}>
      <div style={{ fontSize:10, fontWeight:700, color:B.orange, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:14, paddingBottom:10, borderBottom:`1px solid ${B.border}` }}>
        💰 Earnings List
      </div>

      {items.map((item,i)=>(
        <div key={i} style={{ background:"rgba(255,255,255,0.04)", border:`1px solid ${B.border}`, borderRadius:9, padding:"10px 10px", marginBottom:8 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              <div style={{ width:6, height:6, borderRadius:"50%", background:B.orange }}/>
              <span style={{ fontSize:10, fontWeight:700, color:"white" }}>Row {i+1}</span>
            </div>
            <button onClick={()=>setItems(items.filter((_,j)=>j!==i))}
              style={{ background:"none", border:"none", color:"#EF4444", cursor:"pointer", fontSize:14, lineHeight:1, padding:"0 2px" }}>✕</button>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"60px 1fr 56px", gap:6 }}>
            <div>
              <div style={{ fontSize:9, color:B.muted, marginBottom:3, fontWeight:600 }}>TICKER</div>
              <input value={item.ticker||""} maxLength={5}
                onChange={e=>{ const n=[...items]; n[i]={...n[i],ticker:e.target.value.toUpperCase()}; setItems(n); }}
                style={{ width:"100%", background:"rgba(255,255,255,0.06)", border:`1px solid ${B.border}`, borderRadius:6, padding:"5px 6px", fontSize:11, color:B.orange, fontFamily:"inherit", boxSizing:"border-box", fontWeight:800, textTransform:"uppercase" }}/>
            </div>
            <div>
              <div style={{ fontSize:9, color:B.muted, marginBottom:3, fontWeight:600 }}>COMPANY</div>
              <input value={item.company||""}
                onChange={e=>{ const n=[...items]; n[i]={...n[i],company:e.target.value}; setItems(n); }}
                style={{ width:"100%", background:"rgba(255,255,255,0.06)", border:`1px solid ${B.border}`, borderRadius:6, padding:"5px 6px", fontSize:11, color:"white", fontFamily:"inherit", boxSizing:"border-box" }}/>
            </div>
            <div>
              <div style={{ fontSize:9, color:B.muted, marginBottom:3, fontWeight:600 }}>TIMING</div>
              <select value={item.timing||"PMO"}
                onChange={e=>{ const n=[...items]; n[i]={...n[i],timing:e.target.value}; setItems(n); }}
                style={{ width:"100%", background:"#0F1A28", border:`1px solid ${B.border}`, borderRadius:6, padding:"5px 4px", fontSize:11, color:"white", fontFamily:"inherit", boxSizing:"border-box" }}>
                <option value="PMO">PMO</option>
                <option value="AMC">AMC</option>
                <option value="E">E</option>
                <option value="TBC">TBC</option>
              </select>
            </div>
          </div>
        </div>
      ))}

      <button onClick={()=>setItems([...items,{ticker:"TICK",company:"Company Name",timing:"PMO"}])}
        style={{ width:"100%", background:"rgba(255,255,255,0.05)", border:`1px dashed ${B.border}`, borderRadius:8, padding:"9px 0", fontSize:12, fontWeight:600, color:"#9CA3AF", cursor:"pointer", fontFamily:"inherit", marginBottom:16 }}>
        ＋ Add Row
      </button>

      <div style={{ fontSize:10, fontWeight:700, color:B.muted, letterSpacing:"0.07em", textTransform:"uppercase", marginBottom:8 }}>Legend</div>
      <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:16 }}>
        {["PMO = Pre Market Open","AMC = After Market Close","E = Estimated"].map(t=>(
          <div key={t} style={{ fontSize:9, color:"#6B7280", background:"rgba(255,255,255,0.04)", border:`1px solid ${B.border}`, padding:"3px 7px", borderRadius:4 }}>{t}</div>
        ))}
      </div>

      <div style={{ marginBottom:12 }}>
        <div style={{ fontSize:10, fontWeight:700, color:B.muted, letterSpacing:"0.05em", textTransform:"uppercase", marginBottom:6 }}>Position</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
          {[["X","x"],["Y","y"]].map(([lbl,key])=>(
            <div key={key}>
              <div style={{ fontSize:9, color:B.muted, marginBottom:3 }}>{lbl}</div>
              <input type="number" value={Math.round(el[key])}
                onChange={e=>updateEl(el.id,{[key]:Number(e.target.value)})}
                style={{ width:"100%", background:"rgba(255,255,255,0.06)", border:`1px solid ${B.border}`, borderRadius:6, padding:"5px 8px", fontSize:11, color:"white", fontFamily:"inherit", boxSizing:"border-box" }}/>
            </div>
          ))}
        </div>
      </div>

      <button onClick={()=>deleteEl(el.id)}
        style={{ width:"100%", background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.28)", borderRadius:8, padding:"8px 0", fontSize:12, fontWeight:600, color:"#FCA5A5", cursor:"pointer", fontFamily:"inherit" }}>
        🗑 Delete Earnings List
      </button>
    </div>
  );
}

/* ─── ELEMENT PROPERTIES PANEL ──────────────────────────────────────── */
function ElementPropsPanel({ el, updateEl, updateElStyle, deleteEl }) {
  if (el.type === "earnings-list") return <EarningsListEditor el={el} updateEl={updateEl} deleteEl={deleteEl}/>;
  if (el.type === "svg-icon") return (
    <div style={{ padding:15 }}>
      <div style={{ fontSize:10, fontWeight:700, color:B.orange, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:14, paddingBottom:10, borderBottom:`1px solid ${B.border}` }}>
        🎨 Icon · {el.iconName}
      </div>
      <div style={{ marginBottom:14 }}>
        <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#6B7280", letterSpacing:"0.05em", textTransform:"uppercase", marginBottom:7 }}>Color</label>
        <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:6 }}>
          {["#E35728","#004E5A","#111111","#FFFFFF","#3B82F6","#10B981"].map(c=>(
            <div key={c} onClick={()=>updateElStyle(el.id,{color:c})}
              style={{ width:22,height:22,borderRadius:4,background:c,cursor:"pointer",outline:el.style?.color===c?"2px solid white":"none",outlineOffset:1,border:"1px solid rgba(255,255,255,0.1)" }}/>
          ))}
        </div>
        <input type="text" value={el.style?.color||B.orange} onChange={e=>updateElStyle(el.id,{color:e.target.value})}
          style={{ width:"100%", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:7, padding:"6px 9px", fontSize:11, color:"white", fontFamily:"inherit", boxSizing:"border-box" }}/>
      </div>
      <div style={{ marginBottom:14 }}>
        <div style={{ display:"flex",justifyContent:"space-between",marginBottom:6 }}><label style={{ fontSize:10, fontWeight:700, color:"#6B7280", letterSpacing:"0.05em", textTransform:"uppercase" }}>Opacity</label><span style={{ fontSize:10,color:"white" }}>{Math.round((el.style?.opacity??1)*100)}%</span></div>
        <input type="range" min={0.05} max={1} step={0.05} value={el.style?.opacity??1} onChange={e=>updateElStyle(el.id,{opacity:Number(e.target.value)})} style={{ width:"100%", accentColor:B.orange }}/>
      </div>
      <div style={{ marginBottom:12 }}>
        <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#6B7280", letterSpacing:"0.05em", textTransform:"uppercase", marginBottom:6 }}>Size</label>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
          {[["W","width"],["H","height"]].map(([l,k])=>(
            <div key={k}><div style={{ fontSize:9,color:"#6B7280",marginBottom:3 }}>{l}</div>
              <input type="number" value={Math.round(el[k]||30)} onChange={e=>updateEl(el.id,{[k]:Number(e.target.value)})}
                style={{ width:"100%", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:7, padding:"6px 9px", fontSize:11, color:"white", fontFamily:"inherit", boxSizing:"border-box" }}/></div>
          ))}
        </div>
      </div>
      <div style={{ marginBottom:14 }}>
        <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#6B7280", letterSpacing:"0.05em", textTransform:"uppercase", marginBottom:6 }}>Position</label>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
          {[["X","x"],["Y","y"]].map(([l,k])=>(
            <div key={k}><div style={{ fontSize:9,color:"#6B7280",marginBottom:3 }}>{l}</div>
              <input type="number" value={Math.round(el[k])} onChange={e=>updateEl(el.id,{[k]:Number(e.target.value)})}
                style={{ width:"100%", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:7, padding:"6px 9px", fontSize:11, color:"white", fontFamily:"inherit", boxSizing:"border-box" }}/></div>
          ))}
        </div>
      </div>
      <button onClick={()=>deleteEl(el.id)} style={{ width:"100%", background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.28)", borderRadius:8, padding:"8px 0", fontSize:12, fontWeight:600, color:"#FCA5A5", cursor:"pointer", fontFamily:"inherit" }}>🗑 Delete</button>
    </div>
  );
  if (el.type === "hero") return (
    <div style={{ padding:15 }}>
      <div style={{ fontSize:10, fontWeight:700, color:B.orange, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:14, paddingBottom:10, borderBottom:`1px solid ${B.border}` }}>
        🖼 Hero Image
      </div>
      <div style={{ fontSize:11, color:"#9CA3AF", lineHeight:1.7, marginBottom:16 }}>
        Resize and reposition the hero image placeholder. Swap it for your own visual in Figma after export.
      </div>
      {[["Width","width","px",40,280],["Height","height","px",40,320]].map(([lbl,key,unit,min,max])=>(
        <div key={key} style={{ marginBottom:14 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
            <label style={{ fontSize:10, fontWeight:700, color:"#6B7280", letterSpacing:"0.05em", textTransform:"uppercase" }}>{lbl}</label>
            <span style={{ fontSize:11, color:"white", fontWeight:600 }}>{Math.round(el[key]||0)}{unit}</span>
          </div>
          <input type="range" min={min} max={max}
            value={el[key]||0}
            onChange={e=>updateEl(el.id,{[key]:Number(e.target.value)})}
            style={{ width:"100%", accentColor:B.orange }}/>
          <input type="number" value={Math.round(el[key]||0)}
            onChange={e=>updateEl(el.id,{[key]:Number(e.target.value)})}
            style={{ width:"100%", marginTop:6, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:7, padding:"6px 9px", fontSize:11, color:"white", fontFamily:"inherit", boxSizing:"border-box" }}/>
        </div>
      ))}
      <div style={{ marginBottom:14 }}>
        <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#6B7280", letterSpacing:"0.05em", textTransform:"uppercase", marginBottom:6 }}>Border Radius</label>
        <input type="range" min={0} max={50}
          value={el.style?.borderRadius||9}
          onChange={e=>updateEl(el.id,{style:{...el.style,borderRadius:Number(e.target.value)}})}
          style={{ width:"100%", accentColor:B.orange }}/>
      </div>
      <div style={{ marginBottom:14 }}>
        <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#6B7280", letterSpacing:"0.05em", textTransform:"uppercase", marginBottom:8 }}>Position</label>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
          {[["X","x"],["Y","y"]].map(([lbl,key])=>(
            <div key={key}>
              <div style={{ fontSize:9, color:B.muted, marginBottom:3 }}>{lbl}</div>
              <input type="number" value={Math.round(el[key])}
                onChange={e=>updateEl(el.id,{[key]:Number(e.target.value)})}
                style={{ width:"100%", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:7, padding:"6px 9px", fontSize:11, color:"white", fontFamily:"inherit", boxSizing:"border-box" }}/>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
  const isText = el.type==="text" || el.type==="badge";
  const hasBg  = el.type==="rect" || el.type==="arrow-btn" || el.type==="badge";

  const ColorSwatch = ({ value, onChange }) => (
    <div>
      <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginBottom:6 }}>
        {BRAND_COLORS.map(c=>(
          <div key={c} onClick={()=>onChange(c)}
            style={{ width:22, height:22, borderRadius:5, background:c, cursor:"pointer", boxSizing:"border-box",
              outline: value===c ? `2px solid ${B.orange}` : "none", outlineOffset:1,
              border: c==="#FFFFFF"||c===B.cream ? "1px solid rgba(0,0,0,0.15)" : "none" }}/>
        ))}
      </div>
      <input type="text" value={value||""} onChange={e=>onChange(e.target.value)}
        placeholder="#hex" style={propInput}/>
    </div>
  );

  return (
    <div style={{ padding:15, overflowY:"auto" }}>
      {/* Header */}
      <div style={{ fontSize:10, fontWeight:700, color:B.orange, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:14, paddingBottom:10, borderBottom:`1px solid ${B.border}` }}>
        {el.type==="text"?"T Text":el.type==="badge"?"B Badge":el.type==="rect"?"▬ Shape":el.type==="arrow-btn"?"→ Button":el.type==="hero"?"🖼 Hero Image":el.type}
        {el.locked && <span style={{ marginLeft:6, fontSize:9, color:B.muted }}>🔒</span>}
      </div>

      {/* Content textarea */}
      {isText && (
        <div style={{ marginBottom:14 }}>
          <label style={pLbl}>Content</label>
          <textarea value={el.content} rows={3}
            onChange={e=>updateEl(el.id,{content:e.target.value})}
            style={{ ...propInput, resize:"vertical", lineHeight:1.55 }}/>
        </div>
      )}

      {/* Font controls */}
      {isText && (<>
        <div style={{ marginBottom:12 }}>
          <label style={pLbl}>Font Size</label>
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <button onClick={()=>updateElStyle(el.id,{fontSize:Math.max(4,(el.style.fontSize||12)-1)})} style={nBtn}>−</button>
            <input type="number" value={el.style.fontSize||12}
              onChange={e=>updateElStyle(el.id,{fontSize:Number(e.target.value)})}
              style={{ ...propInput, textAlign:"center" }}/>
            <button onClick={()=>updateElStyle(el.id,{fontSize:(el.style.fontSize||12)+1})} style={nBtn}>＋</button>
          </div>
        </div>

        <div style={{ marginBottom:12 }}>
          <label style={pLbl}>Weight</label>
          <div style={{ display:"flex", gap:4 }}>
            {[["Reg","400"],["Semi","600"],["Bold","700"],["Black","900"]].map(([lbl,wt])=>(
              <button key={wt} onClick={()=>updateElStyle(el.id,{fontWeight:Number(wt)})}
                style={{ flex:1, padding:"5px 0", fontSize:10, fontWeight:Number(wt), cursor:"pointer", fontFamily:"inherit", color:"white", borderRadius:5,
                  background:String(el.style.fontWeight)===wt?B.orange:"rgba(255,255,255,0.07)",
                  border:`1px solid ${String(el.style.fontWeight)===wt?B.orange:"rgba(255,255,255,0.1)"}` }}>
                {lbl}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom:12 }}>
          <div style={{ display:"flex", justifyContent:"space-between" }}>
            <label style={pLbl}>Line Height</label>
            <span style={{ fontSize:10, color:B.muted }}>{(el.style.lineHeight||1.4).toFixed(2)}</span>
          </div>
          <input type="range" min="1" max="2.5" step="0.05"
            value={el.style.lineHeight||1.4}
            onChange={e=>updateElStyle(el.id,{lineHeight:Number(e.target.value)})}
            style={{ width:"100%", accentColor:B.orange, marginTop:4 }}/>
        </div>

        <div style={{ marginBottom:14 }}>
          <label style={pLbl}>Text Color</label>
          <ColorSwatch value={el.style.color} onChange={c=>updateElStyle(el.id,{color:c})}/>
        </div>

        <div style={{ marginBottom:12 }}>
          <label style={pLbl}>Text Align</label>
          <div style={{ display:"flex", gap:4 }}>
            {[["L","left"],["C","center"],["R","right"]].map(([lbl,align])=>(
              <button key={align} onClick={()=>updateElStyle(el.id,{textAlign:align})}
                style={{ flex:1, padding:"6px 0", fontSize:12, cursor:"pointer", fontFamily:"inherit", color:"white", borderRadius:5,
                  background:el.style.textAlign===align?B.orange:"rgba(255,255,255,0.07)",
                  border:`1px solid ${el.style.textAlign===align?B.orange:"rgba(255,255,255,0.1)"}` }}>
                {lbl}
              </button>
            ))}
          </div>
        </div>
      </>)}

      {/* Background color */}
      {hasBg && (
        <div style={{ marginBottom:14 }}>
          <label style={pLbl}>Background</label>
          <ColorSwatch value={el.style.background} onChange={c=>updateElStyle(el.id,{background:c})}/>
        </div>
      )}

      {/* Border radius */}
      {(el.type==="rect"||el.type==="badge"||el.type==="arrow-btn") && (
        <div style={{ marginBottom:12 }}>
          <div style={{ display:"flex", justifyContent:"space-between" }}>
            <label style={pLbl}>Border Radius</label>
            <span style={{ fontSize:10, color:B.muted }}>{typeof el.style.borderRadius==="number"?el.style.borderRadius:8}px</span>
          </div>
          <input type="range" min="0" max="150"
            value={typeof el.style.borderRadius==="number"?el.style.borderRadius:8}
            onChange={e=>updateElStyle(el.id,{borderRadius:Number(e.target.value)})}
            style={{ width:"100%", accentColor:B.orange, marginTop:4 }}/>
        </div>
      )}

      {/* Width (text) */}
      {isText && (
        <div style={{ marginBottom:12 }}>
          <label style={pLbl}>Width (px)</label>
          <input type="number" value={el.width==="auto"?256:el.width}
            onChange={e=>updateEl(el.id,{width:Number(e.target.value)})}
            style={propInput}/>
        </div>
      )}

      {/* W & H (rect) */}
      {el.type==="rect" && (
        <div style={{ marginBottom:12 }}>
          <label style={pLbl}>Size</label>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
            {[["W","width"],["H","height"]].map(([lbl,key])=>(
              <div key={key}>
                <div style={{ fontSize:9, color:B.muted, marginBottom:3 }}>{lbl}</div>
                <input type="number" value={el[key]==="auto"?60:el[key]}
                  onChange={e=>updateEl(el.id,{[key]:Number(e.target.value)})}
                  style={propInput}/>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Opacity (rect) */}
      {el.type==="rect" && (
        <div style={{ marginBottom:12 }}>
          <div style={{ display:"flex", justifyContent:"space-between" }}>
            <label style={pLbl}>Opacity</label>
            <span style={{ fontSize:10, color:B.muted }}>{Math.round((el.style.opacity??1)*100)}%</span>
          </div>
          <input type="range" min="0" max="1" step="0.05"
            value={el.style.opacity??1}
            onChange={e=>updateElStyle(el.id,{opacity:Number(e.target.value)})}
            style={{ width:"100%", accentColor:B.orange, marginTop:4 }}/>
        </div>
      )}

      {/* Position */}
      <div style={{ marginBottom:14 }}>
        <label style={pLbl}>Position</label>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
          {[["X","x"],["Y","y"]].map(([lbl,key])=>(
            <div key={key}>
              <div style={{ fontSize:9, color:B.muted, marginBottom:3 }}>{lbl}</div>
              <input type="number" value={Math.round(el[key])}
                onChange={e=>updateEl(el.id,{[key]:Number(e.target.value)})}
                style={propInput}/>
            </div>
          ))}
        </div>
      </div>

      {/* Lock toggle */}
      <button onClick={()=>updateEl(el.id,{locked:!el.locked})}
        style={{ ...eBtn, width:"100%", justifyContent:"center", marginBottom:8, background:el.locked?`${B.orange}22`:"rgba(255,255,255,0.07)", border:`1px solid ${el.locked?B.orange:"rgba(255,255,255,0.1)"}` }}>
        {el.locked?"🔒 Locked — click to unlock":"🔓 Unlocked"}
      </button>

      {/* Delete */}
      {!el.locked && (
        <button onClick={()=>deleteEl(el.id)}
          style={{ ...eBtn, width:"100%", justifyContent:"center", background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.28)", color:"#FCA5A5" }}>
          🗑 Delete Element
        </button>
      )}</div>
  );
}

/* ─── SLIDE PROPERTIES PANEL ────────────────────────────────────────── */
function SlidePropsPanel({ slide, updateSlide, addText, addRect }) {
  return (
    <div style={{ padding:15 }}>
      <div style={{ fontSize:10, fontWeight:700, color:B.orange, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:14, paddingBottom:10, borderBottom:`1px solid ${B.border}` }}>
        ◻ Slide · {slide.label}
      </div>

      <div style={{ marginBottom:18 }}>
        <label style={pLbl}>Background Color</label>
        <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginBottom:6 }}>
          {[...BRAND_COLORS,"#F5EDE0"].map(c=>(
            <div key={c} onClick={()=>updateSlide({background:c})}
              style={{ width:22, height:22, borderRadius:5, background:c, cursor:"pointer", boxSizing:"border-box",
                outline: slide.background===c?`2px solid ${B.orange}`:"none", outlineOffset:1,
                border: c==="#FFFFFF"||c==="#F5EDE0"||c===B.cream?"1px solid rgba(0,0,0,0.12)":"none" }}/>
          ))}
        </div>
        <input type="text" value={slide.background}
          onChange={e=>updateSlide({background:e.target.value})}
          style={propInput}/>
      </div>

      <div style={{ height:1, background:B.border, margin:"4px 0 16px" }}/>
      <div style={{ fontSize:10, fontWeight:700, color:B.muted, letterSpacing:"0.07em", textTransform:"uppercase", marginBottom:10 }}>Add Element</div>

      <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
        <button onClick={addText} style={{ ...eBtn, justifyContent:"flex-start", gap:8 }}>
          <span style={{ fontSize:14 }}>T</span> Text Block
        </button>
        <button onClick={addRect} style={{ ...eBtn, justifyContent:"flex-start", gap:8 }}>
          <span style={{ fontSize:12 }}>▬</span> Shape / Rect
        </button>
      </div>

      <div style={{ marginTop:20, fontSize:11, color:B.muted, lineHeight:1.7 }}>
        Click any element on the canvas to select and edit it in this panel.
        <br/><br/>
        Double-click a text element to edit its content inline.
        <br/><br/>
        Use <strong style={{color:B.orange}}>📰 Overnight Headlines</strong> in the top bar to add a pre-built earnings calendar template.
        <br/><br/>
        Drag elements to reposition. Use the Layers panel to change z-order.
      </div></div>
  );
}

/* ─── SLIDE EDITOR ───────────────────────────────────────────────────── */

/* ─── THEME PANEL ───────────────────────────────────────────────────── */
function ThemePanel({ globalTheme, applyGlobalTheme, onClose }) {
  const [draft, setDraft] = useState({ ...globalTheme });

  function update(patch) { setDraft(d=>({ ...d, ...patch })); }

  function apply(t) {
    const theme = t || draft;
    if (t) setDraft({ ...t });
    loadGoogleFont(theme.fontFamily);
    applyGlobalTheme(theme);
  }

  const ColorField = ({ label, value, onChange }) => (
    <div style={{ marginBottom:14 }}>
      <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#6B7280", letterSpacing:"0.05em", textTransform:"uppercase", marginBottom:6 }}>{label}</label>
      <div style={{ display:"flex", gap:8, alignItems:"center" }}>
        <div style={{ width:34, height:34, borderRadius:8, background:value, border:"2px solid rgba(255,255,255,0.1)", flexShrink:0, position:"relative", overflow:"hidden", cursor:"pointer" }}>
          <input type="color" value={value} onChange={e=>onChange(e.target.value)}
            style={{ position:"absolute", inset:-4, width:"calc(100%+8px)", height:"calc(100%+8px)", opacity:0, cursor:"pointer" }}/>
        </div>
        <input type="text" value={value}
          onChange={e=>{ if(/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value)) onChange(e.target.value); }}
          style={{ flex:1, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:7, padding:"7px 10px", fontSize:12, color:"white", fontFamily:"inherit", letterSpacing:"0.05em" }}/>
      </div>
    </div>
  );

  return (
    <div style={{ padding:16, overflowY:"auto", height:"100%" }}>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16, paddingBottom:12, borderBottom:`1px solid ${B.border}` }}>
        <div style={{ fontSize:10, fontWeight:700, color:B.orange, letterSpacing:"0.08em", textTransform:"uppercase" }}>🎨 Theme & Templates</div>
        <button onClick={onClose} style={{ background:"none", border:"none", color:"#6B7280", cursor:"pointer", fontSize:16, padding:0 }}>✕</button>
      </div>

      {/* Presets */}
      <div style={{ fontSize:10, fontWeight:700, color:"#6B7280", letterSpacing:"0.07em", textTransform:"uppercase", marginBottom:10 }}>Templates</div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:7, marginBottom:20 }}>
        {THEME_PRESETS.map(preset=>{
          const isActive = draft.accentColor===preset.accentColor && draft.bgColor===preset.bgColor && draft.fontFamily===preset.fontFamily;
          return (
            <button key={preset.name} onClick={()=>apply(preset)}
              style={{ background: isActive?`${B.orange}18`:"rgba(255,255,255,0.04)",
                border:`1.5px solid ${isActive?B.orange:B.border}`,
                borderRadius:9, padding:"10px 10px", cursor:"pointer", fontFamily:"inherit", textAlign:"left",
                transition:"all 0.15s" }}>
              <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:5 }}>
                <div style={{ width:16, height:16, borderRadius:4, background:preset.accentColor, flexShrink:0 }}/>
                <div style={{ width:16, height:16, borderRadius:4, background:preset.bgColor, border:"1px solid rgba(255,255,255,0.1)", flexShrink:0 }}/>
                <span style={{ fontSize:11, fontWeight:700, color:"white" }}>{preset.name}</span>
              </div>
              <div style={{ fontSize:9.5, color:"#6B7280", fontFamily:`'${preset.fontFamily}',sans-serif` }}>{preset.fontFamily}</div>
            </button>
          );
        })}
      </div>

      <div style={{ height:1, background:B.border, margin:"4px 0 18px" }}/>

      {/* Custom controls */}
      <div style={{ fontSize:10, fontWeight:700, color:"#6B7280", letterSpacing:"0.07em", textTransform:"uppercase", marginBottom:14 }}>Custom</div>

      <ColorField label="Accent / Brand Color" value={draft.accentColor} onChange={v=>update({accentColor:v})}/>
      <ColorField label="Text Color" value={draft.textColor} onChange={v=>update({textColor:v})}/>
      <ColorField label="Content Slide Background" value={draft.bgColor} onChange={v=>update({bgColor:v})}/>
      <ColorField label="Cover Slide Background" value={draft.coverBgColor} onChange={v=>update({coverBgColor:v})}/>

      {/* Font family */}
      <div style={{ marginBottom:18 }}>
        <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#6B7280", letterSpacing:"0.05em", textTransform:"uppercase", marginBottom:8 }}>Font Family</label>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
          {GOOGLE_FONTS.map(f=>(
            <button key={f} onClick={()=>{ loadGoogleFont(f); update({fontFamily:f}); }}
              style={{ padding:"8px 10px", borderRadius:8, cursor:"pointer", fontFamily:`'${f}',sans-serif`, fontSize:12, fontWeight:600,
                background:draft.fontFamily===f?`${B.orange}18`:"rgba(255,255,255,0.04)",
                border:`1.5px solid ${draft.fontFamily===f?B.orange:B.border}`,
                color:draft.fontFamily===f?"white":"#9CA3AF", textAlign:"left",
                transition:"all 0.15s", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Preview swatch */}
      <div style={{ background:draft.bgColor, borderRadius:10, padding:"14px 16px", marginBottom:18, border:"1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ display:"inline-block", background:draft.accentColor, borderRadius:100, padding:"3px 10px", fontSize:9, fontWeight:700, color:"white", fontFamily:`'${draft.fontFamily}',sans-serif`, marginBottom:8 }}>
          PREVIEW BADGE
        </div>
        <div style={{ fontSize:18, fontWeight:900, color:draft.accentColor, fontFamily:`'${draft.fontFamily}',sans-serif`, lineHeight:1.1, marginBottom:4 }}>
          Accent Title
        </div>
        <div style={{ fontSize:14, fontWeight:700, color:draft.textColor, fontFamily:`'${draft.fontFamily}',sans-serif`, lineHeight:1.1 }}>
          Body Text
        </div>
      </div>

      {/* Apply button */}
      <button onClick={()=>apply(null)}
        style={{ width:"100%", background:B.orange, border:"none", borderRadius:10, padding:"13px 0", fontSize:14, fontWeight:800, color:"white", cursor:"pointer", fontFamily:"inherit" }}>
        ✦ Apply to All Slides
      </button>
      <p style={{ fontSize:10, color:"#4B5563", textAlign:"center", margin:"8px 0 0", lineHeight:1.6 }}>
        Updates all slide backgrounds, accent colours, text colours and fonts across the entire carousel.
      </p>
    </div>
  );
}


/* ─── SVG ICON ELEMENTS LIBRARY ──────────────────────────────────── */
const ICON_LIBRARY = [
  { name:"Trend Up",    id:"ic-tup",  svg:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>' },
  { name:"Trend Down",  id:"ic-tdn",  svg:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>' },
  { name:"Dollar",      id:"ic-usd",  svg:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>' },
  { name:"Bar Chart",   id:"ic-bar",  svg:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="18" y="3" width="4" height="18"/><rect x="10" y="8" width="4" height="13"/><rect x="2" y="13" width="4" height="8"/></svg>' },
  { name:"Globe",       id:"ic-glb",  svg:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>' },
  { name:"Alert",       id:"ic-alt",  svg:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' },
  { name:"Shield",      id:"ic-shd",  svg:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>' },
  { name:"Clock",       id:"ic-clk",  svg:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' },
  { name:"Calendar",    id:"ic-cal",  svg:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' },
  { name:"Flag",        id:"ic-flg",  svg:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>' },
  { name:"Star",        id:"ic-str",  svg:'<svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>' },
  { name:"Zap",         id:"ic-zap",  svg:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>' },
  { name:"Lock",        id:"ic-lck",  svg:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' },
  { name:"Award",       id:"ic-awd",  svg:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>' },
  { name:"Arrows",      id:"ic-arr",  svg:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>' },
  { name:"Check",       id:"ic-chk",  svg:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>' },
];

function ElementsLibraryPanel({ addIconEl }) {
  const [iconColor, setIconColor] = useState(B.orange);
  return (
    <div style={{ padding:14, overflowY:"auto" }}>
      <div style={{ fontSize:10, fontWeight:700, color:B.orange, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:12, paddingBottom:10, borderBottom:`1px solid ${B.border}` }}>
        🎨 Elements Library
      </div>
      <div style={{ marginBottom:14 }}>
        <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#6B7280", marginBottom:6, letterSpacing:"0.05em", textTransform:"uppercase" }}>Icon Color</label>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:6 }}>
          {["#E35728","#004E5A","#111111","#FFFFFF","#3B82F6","#10B981","#F59E0B","#EF4444"].map(c=>(
            <div key={c} onClick={()=>setIconColor(c)}
              style={{ width:22, height:22, borderRadius:4, background:c, cursor:"pointer",
                outline: iconColor===c?"2px solid #fff":"none", outlineOffset:1,
                border:"1px solid rgba(255,255,255,0.1)" }}/>
          ))}
        </div>
        <input type="text" value={iconColor} onChange={e=>setIconColor(e.target.value)}
          style={{ width:"100%", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:6, padding:"5px 8px", fontSize:11, color:"white", fontFamily:"inherit", boxSizing:"border-box" }}/>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:7 }}>
        {ICON_LIBRARY.map(icon=>(
          <button key={icon.id} onClick={()=>addIconEl(icon, iconColor)}
            title={icon.name}
            style={{ background:"rgba(255,255,255,0.04)", border:`1px solid ${B.border}`, borderRadius:9, padding:"10px 6px 7px", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:5, transition:"all 0.15s", fontFamily:"inherit" }}
            onMouseEnter={e=>e.currentTarget.style.borderColor=B.orange}
            onMouseLeave={e=>e.currentTarget.style.borderColor=B.border}>
            <div style={{ width:24, height:24, color:iconColor }}
              dangerouslySetInnerHTML={{ __html: icon.svg.replace("currentColor", iconColor) }}/>
            <div style={{ fontSize:8, color:"#6B7280", fontWeight:600, textAlign:"center" }}>{icon.name}</div>
          </button>
        ))}
      </div>
      <div style={{ marginTop:14, fontSize:10.5, color:"#4B5563", lineHeight:1.7 }}>
        Click any icon to insert it on the canvas. Select it to move, resize or recolor it via the Properties panel.
      </div>
    </div>
  );
}

function SlideEditor({ carousel, headlines = [], onBack, onRegenerate }) {
  const [slides,     setSlides]     = useState(()=>carouselToEditableSlides(carousel));
  const [activeIdx,  setActiveIdx]  = useState(0);
  const [selId,      setSelId]      = useState(null);
  const [multiSel,   setMultiSel]   = useState(new Set());
  const [editingId,  setEditingId]  = useState(null);
  const [drag,       setDrag]       = useState(null);
  const [marquee,    setMarquee]    = useState(null);  // {sx,sy,ex,ey} in slide-space px
  const [hoverId,    setHoverId]    = useState(null);
  const [showTheme,  setShowTheme]  = useState(false);
  const [stripDrag,   setStripDrag]  = useState(null);  // index being dragged in strip
  const [showIcons,   setShowIcons]   = useState(false);
  const [stripOver,   setStripOver]  = useState(null);  // index being hovered over
  const [globalTheme,setGlobalTheme]= useState({ accentColor:B.orange, textColor:"#111111", bgColor:B.cream, coverBgColor:"#FFFFFF", fontFamily:"Outfit" });
  const canvasRef = useRef(null);

  /* ── Apply global theme to all slides ── */
  function applyGlobalTheme(theme) {
    loadGoogleFont(theme.fontFamily);
    setGlobalTheme(theme);
    setSlides(prev => prev.map((sl, si) => {
      const isCover = sl.id === "cover";
      return {
        ...sl,
        background: isCover ? (theme.coverBgColor || "#FFFFFF") : (sl.slideType === "earnings" ? "#FFFFFF" : theme.bgColor),
        fontFamily: theme.fontFamily,
        elements: sl.elements.map(el => {
          const updated = { ...el, style: { ...el.style } };
          // Accent color: badges, arrow buttons
          if (el.type === "badge" || el.type === "arrow-btn") {
            updated.style = { ...updated.style, background: theme.accentColor };
          }
          // Text color: accent texts (was orange) → new accent; body texts → new textColor
          if (el.type === "text") {
            const wasAccent = el.style?.color === B.orange || el.style?.color === globalTheme.accentColor;
            updated.style = { ...updated.style, color: wasAccent ? theme.accentColor : theme.textColor };
            updated.style.fontFamily = theme.fontFamily;
          }
          return updated;
        }),
      };
    }));
  }

  const slide  = slides[activeIdx] || slides[0];
  const selEl  = selId ? slide.elements.find(e=>e.id===selId) : null;
  const S      = EDIT_SCALE;
  const CW     = SLIDE_W * S;
  const CH     = SLIDE_H * S;

  /* ── State helpers ── */
  function updateSlide(patch) {
    setSlides(p=>p.map((s,i)=>i===activeIdx?{...s,...patch}:s));
  }
  function updateEl(id,patch) {
    setSlides(p=>p.map((s,i)=>i!==activeIdx?s:{...s,elements:s.elements.map(e=>e.id!==id?e:{...e,...patch})}));
  }
  function updateElStyle(id,sp) {
    setSlides(p=>p.map((s,i)=>i!==activeIdx?s:{...s,elements:s.elements.map(e=>e.id!==id?e:{...e,style:{...e.style,...sp}})}));
  }
  function deleteEl(id) {
    setSlides(p=>p.map((s,i)=>i!==activeIdx?s:{...s,elements:s.elements.filter(e=>e.id!==id)}));
    setSelId(null);
  }
  function moveLayer(id,dir) {
    setSlides(p=>p.map((s,i)=>{
      if(i!==activeIdx) return s;
      const els=[...s.elements], idx=els.findIndex(e=>e.id===id);
      const ni=idx+dir;
      if(ni<0||ni>=els.length) return s;
      [els[idx],els[ni]]=[els[ni],els[idx]];
      return {...s,elements:els};
    }));
  }
  function addText() {
    const id=`txt-${Date.now()}`;
    setSlides(p=>p.map((s,i)=>i!==activeIdx?s:{...s,elements:[...s.elements,{id,type:"text",x:40,y:50,width:220,height:"auto",content:"New Text",style:{fontSize:14,fontWeight:600,color:B.dark,lineHeight:1.4},visible:true,locked:false}]}));
    setTimeout(()=>setSelId(id),0);
  }
  function addRect() {
    const id=`rect-${Date.now()}`;
    setSlides(p=>p.map((s,i)=>i!==activeIdx?s:{...s,elements:[...s.elements,{id,type:"rect",x:50,y:80,width:100,height:50,content:"",style:{background:B.orange,borderRadius:8,opacity:1},visible:true,locked:false}]}));
    setTimeout(()=>setSelId(id),0);
  }

  function addOvernightSlide() {
    const uid     = Date.now();
    const dateStr = new Date().toLocaleDateString("en-AU",{day:"numeric",month:"long",year:"numeric"});

    // Build headline rows from the fetched headlines (top 8 by importance)
    const topHeadlines = [...headlines]
      .sort((a,b)=>(b.importance||0)-(a.importance||0))
      .slice(0, 8);

    // Pack them into the earnings-list format: ticker=category abbrev, company=headline, timing=source
    const rows = topHeadlines.map(h => ({
      ticker:  (h.category||"MKT").slice(0,4).toUpperCase().replace(" ",""),
      company: h.headline.length > 52 ? h.headline.slice(0,50)+"…" : h.headline,
      timing:  (h.source||"").slice(0,8),
    }));

    // Fallback if no headlines available
    const fallbackRows = [
      {ticker:"FX",   company:"EUR/USD holds key support ahead of ECB decision",    timing:"FXStreet"},
      {ticker:"EQ",   company:"ASX 200 futures point to flat open amid tech selloff",timing:"Ausbiz"},
      {ticker:"CMDT", company:"Gold holds above $2,300 as USD softens overnight",    timing:"Reuters"},
      {ticker:"CB",   company:"Fed minutes signal caution on early rate cuts",       timing:"Reuters"},
    ];

    const finalRows = rows.length > 0 ? rows : fallbackRows;

    const newSlide = {
      id:`overnight-${uid}`, label:"Overnight", background:"#FFFFFF", slideType:"earnings", fontFamily:globalTheme.fontFamily,
      elements:[
        { id:"e-badge",  type:"badge",         x:22,  y:18,  width:175, height:22,
          content:"OVERNIGHT HEADLINES",
          style:{ background:B.orange, borderRadius:100, color:"#fff", fontSize:7.5, fontWeight:700, letterSpacing:"0.04em" },
          visible:true, locked:false },
        { id:"e-date",   type:"text",          x:22,  y:48,  width:256, height:"auto",
          content:dateStr,
          style:{ fontSize:26, fontWeight:900, color:"#111111", lineHeight:1.1 },
          visible:true, locked:false },
        { id:"e-list",   type:"earnings-list", x:22,  y:88,  width:256, height:"auto",
          content:JSON.stringify(finalRows),
          style:{ fontSize:9.5 }, visible:true, locked:false },
        { id:"e-legend", type:"text",          x:22,  y:348, width:232, height:"auto",
          content:"Source: " + [...new Set(finalRows.map(r=>r.timing))].join(" · "),
          style:{ fontSize:4.5, color:"#888888", lineHeight:1.5 },
          visible:true, locked:false },
        { id:"e-arrow",  type:"arrow-btn",     x:252, y:344, width:26,  height:26,
          content:"→",
          style:{ background:B.orange, borderRadius:7, color:"#fff", fontSize:14, fontWeight:800 },
          visible:true, locked:false },
      ],
    };
    setSlides(p=>[...p, newSlide]);
    setTimeout(()=>{ setActiveIdx(slides.length); setSelId(null); setEditingId(null); }, 0);
  }

  function deleteSlide(idx) {
    if (slides.length <= 1) { setError("Cannot delete the only slide."); return; }
    setSlides(p => p.filter((_,i) => i !== idx));
    setActiveIdx(prev => Math.min(prev, slides.length - 2));
    setSelId(null);
  }

  function reorderSlides(fromIdx, toIdx) {
    if (fromIdx === toIdx) return;
    setSlides(p => {
      const next = [...p];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
    setActiveIdx(toIdx);
  }

  function addIconEl(icon, color) {
    const id = `icon-${Date.now()}`;
    setSlides(p=>p.map((s,i)=>i!==activeIdx?s:{...s,elements:[...s.elements,{
      id, type:"svg-icon", x:60, y:80, width:40, height:40,
      content:icon.svg, iconName:icon.name,
      style:{ color:color||B.orange, opacity:1 },
      visible:true, locked:false,
    }]}));
    setSelId(id); setShowIcons(false);
  }

  /* ── Drag handlers ── */
  function handleElMouseDown(e,el) {
    if(el.locked||editingId===el.id) return;
    e.preventDefault(); e.stopPropagation();
    setSelId(el.id);
    setDrag({elId:el.id,sx:e.clientX,sy:e.clientY,ox:el.x,oy:el.y});
  }
  function handleCanvasMouseMove(e) {
    if(drag) {
      const dx=(e.clientX-drag.sx)/S, dy=(e.clientY-drag.sy)/S;
      updateEl(drag.elId,{x:Math.max(0,Math.min(SLIDE_W-10,drag.ox+dx)),y:Math.max(0,Math.min(SLIDE_H-10,drag.oy+dy))});
    } else if(marquee) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if(!rect) return;
      setMarquee(m=>({...m, ex:(e.clientX-rect.left)/S, ey:(e.clientY-rect.top)/S}));
    }
  }
  function handleCanvasMouseUp() {
    if(marquee) {
      // Select all elements whose bbox intersects the marquee rect
      const mx1=Math.min(marquee.sx,marquee.ex), mx2=Math.max(marquee.sx,marquee.ex);
      const my1=Math.min(marquee.sy,marquee.ey), my2=Math.max(marquee.sy,marquee.ey);
      const hit = slide.elements.filter(el=>{
        if(!el.visible) return false;
        const ex=el.x, ey=el.y, ew=(el.width==="auto"?120:Number(el.width)), eh=(el.height==="auto"?40:Number(el.height));
        return ex<mx2 && ex+ew>mx1 && ey<my2 && ey+eh>my1;
      });
      if(hit.length>0){ setMultiSel(new Set(hit.map(e=>e.id))); setSelId(hit[0].id); }
      setMarquee(null);
    }
    setDrag(null);
  }

  /* ── Render element on canvas ── */
  function renderEl(el) {
    if(!el.visible) return null;
    const isSel   = selId===el.id || multiSel.has(el.id);
    const isEdit  = editingId===el.id;
    const isHover = hoverId===el.id && !isSel;
    const ss      = scaleElStyle(el.style,S);

    const base = {
      position:"absolute",
      left:el.x*S, top:el.y*S,
      outline: isSel?"2px solid #3B82F6": isHover&&!el.locked?"1px solid rgba(59,130,246,0.45)":"1px solid transparent",
      outlineOffset:2,
      cursor: el.locked?"default": drag?.elId===el.id?"grabbing":"grab",
      userSelect: isEdit?"text":"none",
      zIndex: isSel?10:1,
      boxSizing:"border-box",
      transition: drag?"none":"outline 0.1s",
    };

    const handlers = {
      onMouseDown: e=>handleElMouseDown(e,el),
      onClick:     e=>{ e.stopPropagation(); setSelId(el.id); },
      onMouseEnter:()=>setHoverId(el.id),
      onMouseLeave:()=>setHoverId(null),
      onDoubleClick: e=>{ e.stopPropagation(); if(!el.locked){ setEditingId(el.id); } },
    };

    if(el.type==="text") return (
      <div key={el.id} {...handlers}
        style={{ ...base, ...ss, width:el.width*S, wordBreak:"break-word", minHeight:ss.fontSize*1.2 }}
        contentEditable={isEdit}
        suppressContentEditableWarning
        onBlur={e=>{ if(isEdit){ updateEl(el.id,{content:e.target.innerText}); setEditingId(null); } }}>
        {el.content}
      </div>
    );

    if(el.type==="badge") return (
      <div key={el.id} {...handlers}
        style={{ ...base, ...ss, width:el.width*S, height:el.height*S, display:"flex", alignItems:"center" }}
        contentEditable={isEdit}
        suppressContentEditableWarning
        onBlur={e=>{ if(isEdit){ updateEl(el.id,{content:e.target.innerText}); setEditingId(null); } }}>
        {el.content}
      </div>
    );

    if(el.type==="rect") return (
      <div key={el.id} {...handlers}
        style={{ ...base, ...ss, width:el.width*S, height:(el.height==="auto"?50:el.height)*S }}/>
    );

    if(el.type==="arrow-btn") return (
      <div key={el.id} {...handlers}
        style={{ ...base, ...ss, width:el.width*S, height:el.height*S, display:"flex", alignItems:"center", justifyContent:"center" }}>
        →
      </div>
    );

    if(el.type==="hero") return (
      <div key={el.id} {...handlers}
        style={{ ...base, width:el.width*S, height:el.height*S, background:"linear-gradient(135deg,#b8cdd8 0%,#8aa8be 40%,#5d8aab 100%)", borderRadius:(el.style.borderRadius||9)*S, overflow:"hidden" }}>
        <svg style={{ position:"absolute",bottom:0,left:0,width:"100%",height:"60%" }} viewBox="0 0 300 100" preserveAspectRatio="none">
          <defs><linearGradient id="hg2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="white" stopOpacity="0.25"/>
            <stop offset="100%" stopColor="white" stopOpacity="0"/>
          </linearGradient></defs>
          <polyline points="0,90 40,70 80,75 120,45 160,55 200,25 250,35 300,10" stroke="white" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          <polygon points="0,90 40,70 80,75 120,45 160,55 200,25 250,35 300,10 300,100 0,100" fill="url(#hg2)"/>
        </svg>
        <div style={{ position:"absolute",top:5,right:7,background:"rgba(0,0,0,0.35)",color:"white",fontSize:7.5*S,padding:"2px 6px",borderRadius:3 }}>🔒 Hero</div>
      </div>
    );

    if(el.type==="svg-icon") {
      const filled = (el.content||"").replace(/currentColor/g, el.style?.color||B.orange);
      return (
        <div key={el.id} {...handlers}
          style={{ ...base, left:el.x*S, top:el.y*S, width:el.width*S, height:el.height*S,
            color:el.style?.color||B.orange, opacity:el.style?.opacity??1 }}
          dangerouslySetInnerHTML={{ __html: filled }}/>
      );
    }

    if(el.type==="earnings-list") {
      let items = [];
      try { items = JSON.parse(el.content||"[]"); } catch(_){}
      return (
        <div key={el.id} {...handlers}
          style={{ ...base, left:el.x*S, top:el.y*S, width:(el.width||256)*S, cursor:el.locked?"default":"grab" }}>
          {items.map((item,i)=>(
            <div key={i}>
              {i>0 && <div style={{ height:1, background:"#E5E7EB", margin:`${3*S/EDIT_SCALE}px 0` }}/>}
              <div style={{ display:"flex", alignItems:"center", gap:8*S/EDIT_SCALE, padding:`${6*S/EDIT_SCALE}px 0` }}>
                <div style={{ minWidth:38*S/EDIT_SCALE, height:20*S/EDIT_SCALE, borderRadius:100, background:B.orange,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize:6.5*S/EDIT_SCALE, fontWeight:800, color:"white", letterSpacing:"0.02em",
                  flexShrink:0, paddingLeft:3, paddingRight:3 }}>
                  {item.ticker}
                </div>
                <div style={{ flex:1, fontSize:9.5*S/EDIT_SCALE, fontWeight:700, color:"#111",
                  overflow:"hidden", whiteSpace:"nowrap", textOverflow:"ellipsis" }}>
                  {item.company}
                </div>
                <div style={{ fontSize:8.5*S/EDIT_SCALE, fontWeight:500, color:"#9CA3AF", flexShrink:0 }}>
                  {item.timing}
                </div>
              </div>
            </div>
          ))}
        </div>
      );
    }

    return null;
  }


  /* ── Figma Plugin Export ── */
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportStatus,    setExportStatus]    = useState("idle"); // idle|generating|done|error
  const [exportError,     setExportError]     = useState("");

  async function loadJSZip() {
    if (window.JSZip) return window.JSZip;
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
      s.onload = () => res(window.JSZip);
      s.onerror = () => rej(new Error("Failed to load JSZip"));
      document.head.appendChild(s);
    });
  }

  async function handleFigmaExport() {
    setExportStatus("generating");
    setExportError("");
    try {
      const JSZip = await loadJSZip();
      const zip   = new JSZip();

      /* manifest.json */
      zip.file("manifest.json", JSON.stringify({
        name: "Vantage Markets Carousel",
        id:   "vantage-markets-carousel-" + Date.now(),
        api:  "1.0.0",
        main: "code.js",
        editorType: ["figma"],
      }, null, 2));

      /* code.js — plugin logic with slide data baked in */
      const slideData = slides.map(sl => ({
        label:      sl.label,
        background: sl.background,
        elements:   sl.elements.map(el => ({
          id:      el.id,
          type:    el.type,
          x:       el.x,
          y:       el.y,
          width:   el.width,
          height:  el.height,
          content: el.content || "",
          visible: el.visible,
          locked:  el.locked,
          style:   el.style,
        })),
      }));

      const pluginCode = `
// ─────────────────────────────────────────────────────────────
// Vantage Markets – Carousel Plugin
// Generated: ${new Date().toLocaleString("en-AU")}
// Frames: ${slides.length} slides  |  Format: 1080 × 1350 px
// ─────────────────────────────────────────────────────────────

const SLIDE_DATA = ${JSON.stringify(slideData, null, 2)};

const SX = 1080 / 300; // 3.6 — canvas→Instagram scale
const SY = 1350 / 375;

function hexToRgb(hex) {
  if (!hex || typeof hex !== "string") return {r:0,g:0,b:0};
  hex = hex.replace("#","").trim();
  if (hex.length === 3) hex = hex.split("").map(c=>c+c).join("");
  return {
    r: parseInt(hex.slice(0,2),16)/255,
    g: parseInt(hex.slice(2,4),16)/255,
    b: parseInt(hex.slice(4,6),16)/255,
  };
}

function weightToStyleVariants(w) {
  const n = Number(w);
  if (n <= 400) return ["Regular"];
  if (n === 500) return ["Medium"];
  if (n === 600) return ["SemiBold","Semi Bold","Semibold"];
  if (n === 700) return ["Bold"];
  if (n === 800) return ["ExtraBold","Extra Bold","Extrabold"];
  return ["Black","ExtraBold","Extra Bold","Bold"];
}

async function loadBestFont(weight) {
  const styles   = weightToStyleVariants(weight || 400);
  const families = ["Outfit","Inter","Roboto","Open Sans"];
  for (const family of families) {
    for (const style of styles) {
      try { await figma.loadFontAsync({family, style}); return {family, style}; } catch(_) {}
    }
  }
  await figma.loadFontAsync({family:"Inter", style:"Regular"});
  return {family:"Inter", style:"Regular"};
}

async function buildSlides() {
  const page    = figma.currentPage;
  const created = [];

  for (let si = 0; si < SLIDE_DATA.length; si++) {
    const slide = SLIDE_DATA[si];

    // ── Frame ──────────────────────────────────────
    const frame = figma.createFrame();
    page.appendChild(frame);
    frame.name         = slide.label || ("Slide " + (si + 1));
    frame.resize(1080, 1350);
    frame.x            = si * 1140;
    frame.y            = 0;
    frame.clipsContent = true;
    frame.fills        = [{type:"SOLID", color: hexToRgb(slide.background || "#FFFFFF")}];

    for (const el of (slide.elements || [])) {
      if (!el.visible) continue;

      const ex = el.x * SX;
      const ey = el.y * SY;
      const ew = (el.width  === "auto" || !el.width  ? 256 : Number(el.width))  * SX;
      const eh = (el.height === "auto" || !el.height ? 100 : Number(el.height)) * SY;

      // ── TEXT ────────────────────────────────────
      if (el.type === "text") {
        const font = await loadBestFont(el.style?.fontWeight);
        const node = figma.createText();
        frame.appendChild(node);
        node.name             = el.id || "Text";
        node.fontName         = font;
        node.fontSize         = Math.max(1, (el.style?.fontSize || 12) * SX);
        node.lineHeight       = {unit:"MULTIPLIER", value: Number(el.style?.lineHeight) || 1.4};
        node.textAlignHorizontal = (el.style?.textAlign || "left").toUpperCase();
        node.characters       = el.content || "";
        node.fills            = [{type:"SOLID", color: hexToRgb(el.style?.color || "#000000")}];
        node.textAutoResize   = "HEIGHT";
        node.resize(Math.max(1, ew), node.height);
        node.x = ex; node.y = ey;

      // ── BADGE ───────────────────────────────────
      } else if (el.type === "badge") {
        const badgeH  = 20 * SY;
        const pillBg  = figma.createRectangle();
        frame.appendChild(pillBg);
        pillBg.name         = "Badge BG";
        pillBg.x            = ex; pillBg.y = ey;
        pillBg.resize(Math.max(1, ew), Math.max(1, badgeH));
        pillBg.cornerRadius = 100;
        pillBg.fills        = [{type:"SOLID", color: hexToRgb(el.style?.background || "#E35728")}];

        const font    = await loadBestFont(el.style?.fontWeight || 700);
        const pillTxt = figma.createText();
        frame.appendChild(pillTxt);
        pillTxt.name            = "Badge Text";
        pillTxt.fontName        = font;
        pillTxt.fontSize        = Math.max(1, (el.style?.fontSize || 7.5) * SX);
        pillTxt.lineHeight      = {unit:"MULTIPLIER", value:1.2};
        pillTxt.characters      = el.content || "";
        pillTxt.fills           = [{type:"SOLID", color: hexToRgb(el.style?.color || "#FFFFFF")}];
        pillTxt.textAutoResize  = "WIDTH_AND_HEIGHT";
        pillTxt.x = ex + 11 * SX;
        pillTxt.y = ey + (badgeH - pillTxt.height) / 2;

        const g = figma.group([pillBg, pillTxt], frame);
        g.name = el.id || "Badge";

      // ── SHAPE / RECT ────────────────────────────
      } else if (el.type === "rect") {
        const rect = figma.createRectangle();
        frame.appendChild(rect);
        rect.name         = el.id || "Shape";
        rect.x = ex; rect.y = ey;
        rect.resize(Math.max(1, ew), Math.max(1, eh));
        rect.fills        = [{type:"SOLID", color: hexToRgb(el.style?.background || "#E35728"), opacity: el.style?.opacity ?? 1}];
        rect.cornerRadius = Math.max(0, (el.style?.borderRadius || 0) * SX);

      // ── ARROW BUTTON ────────────────────────────
      } else if (el.type === "arrow-btn") {
        const btnW  = Number(el.width)  * SX;
        const btnH  = Number(el.height) * SY;
        const bg    = figma.createRectangle();
        frame.appendChild(bg);
        bg.name         = "Arrow BG";
        bg.x = ex; bg.y = ey;
        bg.resize(Math.max(1, btnW), Math.max(1, btnH));
        bg.cornerRadius = (el.style?.borderRadius || 7) * SX;
        bg.fills        = [{type:"SOLID", color: hexToRgb(el.style?.background || "#E35728")}];
        try {
          const font  = await loadBestFont(800);
          const arrow = figma.createText();
          frame.appendChild(arrow);
          arrow.name           = "Arrow Icon";
          arrow.fontName       = font;
          arrow.characters     = "→";
          arrow.fontSize       = Math.max(1, (el.style?.fontSize || 14) * SX);
          arrow.fills          = [{type:"SOLID", color:{r:1,g:1,b:1}}];
          arrow.textAutoResize = "WIDTH_AND_HEIGHT";
          arrow.x = ex + btnW / 2 - arrow.width  / 2;
          arrow.y = ey + btnH / 2 - arrow.height / 2;
          const g = figma.group([bg, arrow], frame);
          g.name = el.id || "Arrow Button";
        } catch (_) { /* keep bg rect only */ }

      // ── HERO IMAGE PLACEHOLDER ──────────────────
      } else if (el.type === "hero") {
        const hero = figma.createRectangle();
        frame.appendChild(hero);
        hero.name         = "🖼 Hero Image — swap with your visual";
        hero.x = ex; hero.y = ey;
        hero.resize(Math.max(1, ew), Math.max(1, Number(el.height) * SY));
        hero.fills        = [{type:"SOLID", color:{r:0.72,g:0.80,b:0.85}}];
        hero.cornerRadius = (el.style?.borderRadius || 9) * SX;
      }
    }

    created.push(frame);
  }

  figma.currentPage.selection = created;
  figma.viewport.scrollAndZoomIntoView(created);
  figma.notify(
    "✅ " + created.length + " slides created at 1080×1350px! Swap hero placeholders with your visuals.",
    {timeout: 5000}
  );
  figma.closePlugin();
}

buildSlides().catch(err => {
  figma.notify("❌ " + (err?.message || String(err)), {error:true, timeout:8000});
  figma.closePlugin();
});
`.trim();

      zip.file("code.js", pluginCode);

      /* Download ZIP */
      const blob = await zip.generateAsync({type:"blob"});
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = "vantage-figma-plugin.zip";
      a.click();
      URL.revokeObjectURL(url);

      setExportStatus("done");
    } catch(err) {
      setExportError(err.message || "Unknown error");
      setExportStatus("error");
    }
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100vh", overflow:"hidden", background:B.appBg, fontFamily:"'Outfit','Plus Jakarta Sans','Segoe UI',sans-serif", color:"white" }}>

      {/* ── TOP BAR ── */}
      <div style={{ background:B.panel, borderBottom:`1px solid ${B.border}`, padding:"10px 18px", display:"flex", alignItems:"center", gap:12, flexShrink:0 }}>
        <button onClick={()=>{ setSelId(null); onBack(); }} style={{ ...eBtn, gap:6 }}>← Back</button>
        <div style={{ width:1, height:22, background:B.border }}/>

        {/* Slide strip — drag to reorder */}
        <div style={{ display:"flex", gap:8, flex:1, overflowX:"auto", padding:"2px 0" }}
          onDragOver={e=>e.preventDefault()}
          onDrop={e=>{ e.preventDefault(); if(stripDrag!==null&&stripOver!==null) reorderSlides(stripDrag,stripOver); setStripDrag(null); setStripOver(null); }}>
          {slides.map((s,i)=>(
            <div key={s.id}
              draggable
              onDragStart={e=>{ e.dataTransfer.effectAllowed="move"; setStripDrag(i); }}
              onDragOver={e=>{ e.preventDefault(); setStripOver(i); }}
              onDragEnd={()=>{ setStripDrag(null); setStripOver(null); }}
              style={{ position:"relative", flexShrink:0,
                opacity: stripDrag===i ? 0.3 : 1,
                transform: stripOver===i && stripDrag!==null && stripDrag!==i ? "translateX(4px) scale(1.03)" : "none",
                transition:"transform 0.12s, opacity 0.12s" }}>
              <div
                onClick={()=>{ setActiveIdx(i); setSelId(null); setEditingId(null); }}
                style={{ cursor:"grab", border:`2px solid ${activeIdx===i?B.orange:stripOver===i&&stripDrag!==null?"rgba(255,255,255,0.4)":B.border}`, borderRadius:7, overflow:"hidden", transition:"border-color 0.15s", boxShadow: activeIdx===i?"0 0 0 1px rgba(227,87,40,0.3)":"none" }}>
                <MiniSlide slide={s}/>
                <div style={{ fontSize:8, textAlign:"center", padding:"2px 0", background:B.card, color:activeIdx===i?B.orange:B.muted, fontWeight:600, display:"flex", alignItems:"center", justifyContent:"center", gap:4 }}>
                  <span style={{ opacity:0.4 }}>⠿</span>{s.label}
                </div>
              </div>
              {slides.length > 1 && (
                <button onClick={e=>{ e.stopPropagation(); deleteSlide(i); }} title="Delete slide"
                  style={{ position:"absolute", top:-5, right:-5, width:16, height:16, borderRadius:"50%", background:"#EF4444", border:"1.5px solid #0F1A28", color:"white", fontSize:9, fontWeight:800, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", lineHeight:1, zIndex:10, padding:0, fontFamily:"inherit" }}>
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>

        <div style={{ display:"flex", gap:8, flexShrink:0 }}>
          <button onClick={()=>{ setShowIcons(i=>!i); setShowTheme(false); }}
            style={{ ...eBtn, background:showIcons?"rgba(227,87,40,0.15)":"rgba(255,255,255,0.07)", border:`1px solid ${showIcons?B.orange:B.border}`, color:showIcons?B.orange:"white" }}>
            🏷 Elements
          </button>
          <button onClick={addText} style={eBtn}>＋ Text</button>
          <button onClick={addRect} style={eBtn}>＋ Shape</button>
          <div style={{ width:1, height:22, background:B.border }}/>
          <button onClick={addOvernightSlide}
            style={{ ...eBtn, background:"rgba(227,87,40,0.12)", border:`1px solid ${B.orange}44`, color:B.orange, fontWeight:700, display:"flex", alignItems:"center", gap:6 }}>
            📰 Overnight Headlines
          </button>
          <div style={{ width:1, height:22, background:B.border }}/>
          <button onClick={onRegenerate} style={eBtn}>↺ Regenerate</button>
          <button onClick={()=>setShowTheme(t=>!t)}
            style={{ ...eBtn, background: showTheme?B.teal:"rgba(255,255,255,0.07)", border:`1px solid ${showTheme?B.teal:B.border}`, display:"flex", alignItems:"center", gap:6 }}>
            🎨 Theme
          </button>
          <button onClick={()=>{ setShowExportModal(true); setExportStatus("idle"); setExportError(""); }}
            style={{ ...eBtn, background:B.orange, border:`1px solid ${B.orange}`, display:"flex", alignItems:"center", gap:7 }}>
            <span style={{fontSize:14}}>✦</span> Export to Figma
          </button>
        </div>
      </div>

      {/* ── EDITOR BODY ── */}
      <div style={{ flex:1, display:"flex", overflow:"hidden" }}>

        {/* LAYERS PANEL */}
        <div style={{ width:196, background:B.panel, borderRight:`1px solid ${B.border}`, display:"flex", flexDirection:"column", flexShrink:0 }}>
          <div style={{ padding:"11px 14px 8px", fontSize:10, fontWeight:700, color:B.muted, letterSpacing:"0.08em", textTransform:"uppercase", borderBottom:`1px solid ${B.border}` }}>
            Layers · {slide.label}
          </div>
          <div style={{ flex:1, overflowY:"auto", padding:8 }}>
            {[...slide.elements].reverse().map((el,_i,arr)=>{
              const realIdx = slide.elements.findIndex(e=>e.id===el.id);
              const isSel   = selId===el.id;
              const typeIcon = el.type==="text"?"T":el.type==="badge"?"B":el.type==="rect"?"▬":el.type==="hero"?"🖼":el.type==="arrow-btn"?"→":"•";
              const preview  = (el.content||"").slice(0,20)||(el.type);
              return (
                <div key={el.id} onClick={()=>setSelId(isSel?null:el.id)}
                  style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 8px", borderRadius:7, marginBottom:2, cursor:"pointer",
                    background:isSel?`${B.orange}18`:"transparent",
                    border:`1px solid ${isSel?`${B.orange}44`:"transparent"}` }}>
                  <span style={{ fontSize:12, color:isSel?B.orange:B.muted, width:14, flexShrink:0, textAlign:"center" }}>{typeIcon}</span>
                  <span style={{ fontSize:11, color:isSel?"white":"#9CA3AF", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                    {preview.length>20?preview.slice(0,20)+"…":preview}
                  </span>
                  <div style={{ display:"flex", gap:1, flexShrink:0 }}>
                    <button title="Move forward" onClick={e=>{e.stopPropagation();moveLayer(el.id,1);}} style={lBtn}>↑</button>
                    <button title="Move back"    onClick={e=>{e.stopPropagation();moveLayer(el.id,-1);}} style={lBtn}>↓</button>
                    <button title={el.visible?"Hide":"Show"} onClick={e=>{e.stopPropagation();updateEl(el.id,{visible:!el.visible});}}
                      style={{ ...lBtn, color:el.visible?B.orange:B.muted }}>
                      {el.visible?"👁":"◌"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ padding:"8px 10px", borderTop:`1px solid ${B.border}`, display:"flex", gap:6 }}>
            <button onClick={addText} style={{ ...eBtn, flex:1, fontSize:11, padding:"7px 0", justifyContent:"center" }}>＋ Text</button>
            <button onClick={addRect} style={{ ...eBtn, flex:1, fontSize:11, padding:"7px 0", justifyContent:"center" }}>＋ Shape</button>
          </div>
        </div>

        {/* ── CANVAS ── */}
        <div style={{ flex:1, background:"#07101F", overflow:"auto", display:"flex", alignItems:"center", justifyContent:"center", padding:40 }}>

          {/* Canvas wrapper — catches mouse events */}
          <div
            ref={canvasRef}
            style={{ width:CW, height:CH, background:slide.background, position:"relative", flexShrink:0,
              boxShadow:"0 28px 90px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.06)", overflow:"hidden",
              cursor:drag?"grabbing":"default", fontFamily:`'${slide.fontFamily||"Outfit"}',sans-serif` }}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={handleCanvasMouseUp}
            onClick={()=>{ setSelId(null); setMultiSel(new Set()); if(editingId) setEditingId(null); }}
            onMouseDown={e=>{ if(e.target===canvasRef.current){ const rect=canvasRef.current.getBoundingClientRect(); const sx=(e.clientX-rect.left)/S, sy=(e.clientY-rect.top)/S; setMarquee({sx,sy,ex:sx,ey:sy}); } }}
          >
            {/* Geometric background for earnings slides */}
            {slide.slideType === "earnings" && (
              <svg style={{ position:"absolute", top:0, right:0, opacity:0.08, pointerEvents:"none", zIndex:0 }}
                width={CW*0.73} height={CH*0.67} viewBox="0 0 220 250">
                {[0,1,2,3,4,5].map(i=>(
                  <ellipse key={i} cx={160+i*15} cy={i*30} rx={75} ry={105}
                    fill="none" stroke="#555" strokeWidth={16} transform="rotate(-18 110 125)"/>
                ))}
              </svg>
            )}
            {slide.elements.map(el=>renderEl(el))}

            {/* Rubber-band marquee */}
            {marquee && (() => {
              const mx=Math.min(marquee.sx,marquee.ex)*S, my=Math.min(marquee.sy,marquee.ey)*S;
              const mw=Math.abs(marquee.ex-marquee.sx)*S, mh=Math.abs(marquee.ey-marquee.sy)*S;
              return <div style={{ position:"absolute", left:mx, top:my, width:mw, height:mh, border:"1.5px dashed #3B82F6", background:"rgba(59,130,246,0.07)", pointerEvents:"none", zIndex:50 }}/>;
            })()}

            {/* Selection indicator label */}
            {selEl && (
              <div style={{ position:"absolute", bottom:0, left:0, right:0, background:"rgba(59,130,246,0.12)", borderTop:"1px solid rgba(59,130,246,0.3)", padding:"3px 8px", fontSize:9, color:"rgba(147,197,253,0.9)", pointerEvents:"none", zIndex:20 }}>
                ✦ {selEl.id} · x:{Math.round(selEl.x)} y:{Math.round(selEl.y)} · {selEl.type}
              </div>
            )}
          </div>
        </div>

        {/* PROPERTIES PANEL */}
        <div style={{ width:showTheme?300:240, background:B.panel, borderLeft:`1px solid ${B.border}`, overflowY:"auto", flexShrink:0, transition:"width 0.2s", display:"flex", flexDirection:"column" }}>
          {showIcons
            ? <ElementsLibraryPanel addIconEl={addIconEl}/>
            : showTheme
            ? <ThemePanel globalTheme={globalTheme} applyGlobalTheme={applyGlobalTheme} onClose={()=>setShowTheme(false)}/>
            : selEl
              ? <ElementPropsPanel el={selEl} updateEl={updateEl} updateElStyle={updateElStyle} deleteEl={deleteEl}/>
              : <SlidePropsPanel   slide={slide} updateSlide={updateSlide} addText={addText} addRect={addRect}/>
          }
        </div>

      </div>

      {/* ── FIGMA EXPORT MODAL ── */}
      {showExportModal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(5,10,18,0.88)", zIndex:999, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Outfit','Plus Jakarta Sans','Segoe UI',sans-serif" }}
          onClick={()=>{ if(exportStatus!=="generating") setShowExportModal(false); }}>
          <div onClick={e=>e.stopPropagation()}
            style={{ background:"#0F1A28", border:"1px solid rgba(255,255,255,0.09)", borderRadius:18, padding:"32px 36px", width:520, maxWidth:"92vw", boxShadow:"0 40px 120px rgba(0,0,0,0.7)" }}>

            {/* Header */}
            <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:24 }}>
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:"#E35728", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:6 }}>Figma Plugin Export</div>
                <h3 style={{ margin:0, fontSize:22, fontWeight:900, letterSpacing:"-0.4px" }}>Export to Figma</h3>
                <p style={{ margin:"6px 0 0", fontSize:13, color:"#6B7280", lineHeight:1.6 }}>
                  Creates a local Figma plugin with all {slides.length} slides baked in.<br/>
                  Installs in 30 seconds — fully editable text, shapes & groups.
                </p>
              </div>
              {exportStatus!=="generating" && (
                <button onClick={()=>setShowExportModal(false)} style={{ background:"none", border:"none", color:"#6B7280", fontSize:20, cursor:"pointer", padding:0, lineHeight:1, marginTop:2 }}>✕</button>
              )}
            </div>

            {/* Steps */}
            {exportStatus !== "done" && (
              <div style={{ marginBottom:24 }}>
                {[
                  ["1","Download Plugin","Click below — downloads vantage-figma-plugin.zip"],
                  ["2","Load in Figma","Figma → Menu → Plugins → Development → Import plugin from manifest\nNavigate inside the unzipped folder and select manifest.json"],
                  ["3","Run Plugin","In Figma: Right-click canvas → Plugins → Development → Vantage Markets Carousel\nAll slides appear at 1080×1350px, fully editable"],
                ].map(([num,title,desc])=>(
                  <div key={num} style={{ display:"flex", gap:14, marginBottom:14 }}>
                    <div style={{ width:26, height:26, borderRadius:"50%", background:num==="1"?"#E35728":"rgba(255,255,255,0.07)", border:`1px solid ${num==="1"?"#E35728":"rgba(255,255,255,0.12)"}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:800, flexShrink:0, color:"white" }}>{num}</div>
                    <div>
                      <div style={{ fontSize:13, fontWeight:700, color:"white", marginBottom:3 }}>{title}</div>
                      <div style={{ fontSize:11.5, color:"#9CA3AF", lineHeight:1.65, whiteSpace:"pre-line" }}>{desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* What you get box */}
            {exportStatus !== "done" && (
              <div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:10, padding:"12px 16px", marginBottom:24 }}>
                <div style={{ fontSize:10, fontWeight:700, color:"#6B7280", letterSpacing:"0.07em", textTransform:"uppercase", marginBottom:10 }}>What you get in Figma</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:7 }}>
                  {[
                    ["TEXT nodes","Editable font, size, colour, weight"],
                    ["1080×1350px","Native Instagram format"],
                    ["Named layers","Accent, Body, Badge, Hero…"],
                    ["Groups","Badge + Arrow buttons grouped"],
                    ["Shapes","Editable fills, radius, opacity"],
                    ["Hero placeholder","Ready to swap your visual in"],
                  ].map(([k,v])=>(
                    <div key={k} style={{ display:"flex", gap:7, alignItems:"flex-start" }}>
                      <span style={{ color:"#E35728", fontSize:12, marginTop:1 }}>✓</span>
                      <div>
                        <div style={{ fontSize:11, fontWeight:700, color:"white" }}>{k}</div>
                        <div style={{ fontSize:10, color:"#6B7280" }}>{v}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Done state */}
            {exportStatus === "done" && (
              <div style={{ textAlign:"center", padding:"20px 0 28px" }}>
                <div style={{ fontSize:44, marginBottom:14 }}>✅</div>
                <div style={{ fontSize:18, fontWeight:800, marginBottom:8 }}>Plugin downloaded!</div>
                <div style={{ fontSize:13, color:"#9CA3AF", lineHeight:1.75, marginBottom:24 }}>
                  <strong style={{color:"white"}}>vantage-figma-plugin.zip</strong> is in your Downloads.<br/>
                  Unzip it, then in Figma:<br/>
                  <span style={{color:"#E35728"}}>Plugins → Development → Import plugin from manifest</span><br/>
                  and select the <code style={{background:"rgba(255,255,255,0.08)",padding:"1px 5px",borderRadius:4,fontSize:12}}>manifest.json</code> inside the folder.
                </div>
                <button onClick={()=>setShowExportModal(false)}
                  style={{ background:"#E35728", border:"none", borderRadius:10, padding:"12px 32px", fontSize:14, fontWeight:700, color:"white", cursor:"pointer", fontFamily:"inherit" }}>
                  Done
                </button>
              </div>
            )}

            {/* Error state */}
            {exportStatus === "error" && (
              <div style={{ background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.25)", borderRadius:8, padding:"10px 14px", marginBottom:20, fontSize:12, color:"#FCA5A5" }}>
                ⚠ {exportError}
              </div>
            )}

            {/* Action button */}
            {exportStatus !== "done" && (
              <button
                onClick={handleFigmaExport}
                disabled={exportStatus==="generating"}
                style={{ width:"100%", background: exportStatus==="generating"?"#1F2937":"#E35728", border:"none", borderRadius:12, padding:"14px 0", fontSize:15, fontWeight:800, color:"white", cursor:exportStatus==="generating"?"not-allowed":"pointer", fontFamily:"inherit", display:"flex", alignItems:"center", justifyContent:"center", gap:10, transition:"background 0.15s" }}>
                {exportStatus==="generating"
                  ? <><span style={{ width:16,height:16,borderRadius:"50%",border:"2px solid rgba(255,255,255,0.2)",borderTop:"2px solid white",animation:"vm-spin 0.7s linear infinite",display:"inline-block" }}/> Generating plugin…</>
                  : <><span style={{fontSize:18}}>✦</span> Download Figma Plugin</>
                }
              </button>
            )}

          </div>
        </div>
      )}

    </div>
  );
}


/* ─── MAIN APP ───────────────────────────────────────────────────── */

/* ─── DEV TOOLS MOCK DATA ────────────────────────────────────────── */
const MOCK_HEADLINES = [
  { id:"1", headline:"Federal Reserve holds rates steady, signals two cuts in 2025", source:"Reuters",       category:"Central Banks",  importance:10, accentWords:"Federal Reserve", summary:"The Fed kept the federal funds rate at 5.25-5.50% while projecting two 25bp cuts later in 2025, citing persistent inflation concerns.",                   eventDate:"15 May, Thursday" },
  { id:"2", headline:"US CPI rises 0.4% in April, core inflation at 3.6% year-on-year", source:"Bloomberg",    category:"Economic Data",  importance:9,  accentWords:"US CPI",         summary:"April headline CPI came in above consensus at 0.4% MoM and 3.8% YoY. Core CPI held at 3.6%, keeping pressure on the Fed.",                             eventDate:"14 May, Wednesday" },
  { id:"3", headline:"China GDP growth beats forecasts at 5.3%, yuan strengthens", source:"FXStreet",      category:"Geopolitics",    importance:8,  accentWords:"China GDP",       summary:"Q1 GDP beat the 5.0% consensus forecast, boosted by exports and infrastructure spending. The yuan hit a 3-month high on the news.",                    eventDate:"13 May, Tuesday" },
  { id:"4", headline:"ASX 200 surges 1.8% as miners rally on iron ore price spike",     source:"Ausbiz",        category:"Equities",       importance:8,  accentWords:"ASX 200",         summary:"Australian equities outperformed global peers as iron ore jumped above $115/t. BHP and Rio Tinto led gains of 3.2% and 2.9% respectively.",              eventDate:"15 May, Thursday" },
  { id:"5", headline:"EUR/USD breaks above 1.0850 on weak US dollar and ECB optimism", source:"DailyFX",       category:"Forex",          importance:7,  accentWords:"EUR/USD",         summary:"The pair gained 0.6% as markets priced in ECB rate cuts and US dollar weakened on softer-than-expected retail sales data.",                             eventDate:"" },
  { id:"6", headline:"Gold hits $2,380 as geopolitical tensions and rate cut bets rise",source:"Investing.com", category:"Commodities",    importance:7,  accentWords:"Gold",            summary:"Spot gold advanced to a two-week high driven by safe-haven demand amid Middle East tensions and growing bets on Fed easing.",                           eventDate:"" },
  { id:"7", headline:"RBA holds cash rate at 4.35%, Governor signals patience on cuts", source:"Ausbiz",        category:"Central Banks",  importance:8,  accentWords:"RBA",             summary:"The Reserve Bank of Australia kept rates unchanged for the fourth consecutive meeting, with Governor Bullock warning inflation remains too high to cut.", eventDate:"7 May, Tuesday" },
  { id:"8", headline:"OPEC+ agrees to extend 3.66mbd output cuts through Q3 2025",     source:"Reuters",        category:"Commodities",    importance:7,  accentWords:"OPEC+",           summary:"The cartel extended voluntary cuts to support oil prices above $80/barrel amid weak demand from China and rising US shale output.",                     eventDate:"" },
  { id:"9", headline:"Nvidia Q1 earnings smash estimates, revenue up 262% year-on-year",source:"Bloomberg",     category:"Equities",       importance:9,  accentWords:"Nvidia",          summary:"NVDA reported $26B in quarterly revenue, driven by data centre GPU demand. Shares rose 9% after-hours as guidance for Q2 exceeded consensus.",          eventDate:"22 May, Wednesday" },
  { id:"10",headline:"USD/JPY near 155 as BoJ intervention fears grow",                 source:"FXStreet",       category:"Forex",          importance:6,  accentWords:"USD/JPY",         summary:"The pair held near multi-decade highs as Japanese officials ramped up verbal intervention warnings. The BoJ is expected to review its yield curve control.",eventDate:"" },
];

const MOCK_CAROUSEL = {
  weekLabel: "WEEK AHEAD | WEEK OF 19 MAY 2025",
  coverAccentWords: "Markets Brace",
  coverRestTitle: "for Fed & CPI Signals",
  slides: [
    { accentWords:"Federal Reserve", restOfTitle:"Holds, Eyes Two Cuts", eventDate:"15 May, Thursday",   body:"The Fed kept rates at 5.25-5.50% while projecting two 25bp cuts in 2025. Chair Powell emphasised data-dependency, citing sticky services inflation at 4.2% YoY. Markets are now pricing a 68% probability of a September cut, up from 52% before the meeting." },
    { accentWords:"US CPI",          restOfTitle:"Hotter Than Expected",  eventDate:"14 May, Wednesday", body:"April headline CPI printed 0.4% MoM and 3.8% YoY — above the 3.4% consensus. Core CPI held firm at 3.6%, with shelter and energy the primary drivers. The miss complicates the Fed's path and pushed 2-year Treasury yields 12bp higher on the day." },
    { accentWords:"Nvidia",          restOfTitle:"Earnings Blowout",       eventDate:"22 May, Wednesday", body:"NVDA delivered $26B in Q1 revenue, up 262% YoY, driven entirely by surging data centre GPU demand from hyperscalers. Q2 guidance of $28B ± 2% crushed the $26.8B consensus. Shares added 9% in after-hours, lifting the Philadelphia Semiconductor Index 2.4%." },
    { accentWords:"RBA",             restOfTitle:"Patience on Rate Cuts",  eventDate:"7 May, Tuesday",   body:"The Reserve Bank held the cash rate at 4.35% for the fourth consecutive meeting. Governor Bullock stressed underlying inflation at 4.0% remains above the 2-3% target band, and the Board is not yet confident enough to ease. Markets pushed back first cut expectations to December 2025." },
  ],
};

export default function VantageAutomation() {
  useFont();

  const [phase,       setPhase]       = useState("fetch");   // fetch | dashboard | preview
  const [showDev,     setShowDev]     = useState(false);
  // (slideEditor internal state — not needed here)
  const [subTab,      setSubTab]      = useState("select");  // select | record
  const [headlines,   setHeadlines]   = useState([]);
  const [selected,    setSelected]    = useState([]);        // ordered array of ids
  const [carousel,    setCarousel]    = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [loadMsg,     setLoadMsg]     = useState("");
  const [streamText,  setStreamText]  = useState("");
  const [fetchLog,    setFetchLog]    = useState([]);
  const [previewHl,   setPreviewHl]   = useState(null);  // headline being previewed
  const [currentSlide,setCurrentSlide]= useState(0);
  const [dragId,      setDragId]      = useState(null);
  const [dragOver,    setDragOver]    = useState(null);
  const [dragZone,    setDragZone]    = useState(null);       // "pool" | "selected"
  const [error,       setError]       = useState("");
  const [selectedSources, setSelectedSources] = useState(new Set(SOURCES));

  /* ── Helpers ── */
  // Robust JSON array extractor — handles markdown fences, leading text, partial wrapping
  function extractJsonArray(raw) {
    if (!raw) return null;
    // Strip markdown fences
    let s = raw.replace(/```json\s*/gi,"").replace(/```\s*/g,"").trim();
    // Try direct parse first (model returned pure JSON)
    try { const p = JSON.parse(s); if (Array.isArray(p)) return p; } catch(_){}
    // Grab the outermost [...] block
    const start = s.indexOf("[");
    const end   = s.lastIndexOf("]");
    if (start === -1 || end === -1) return null;
    try { const p = JSON.parse(s.slice(start, end+1)); if (Array.isArray(p)) return p; } catch(_){}
    return null;
  }

  // Robust JSON object extractor
  function extractJsonObject(raw) {
    if (!raw) return null;
    let s = raw.replace(/```json\s*/gi,"").replace(/```\s*/g,"").trim();
    try { const p = JSON.parse(s); if (p && typeof p==="object" && !Array.isArray(p)) return p; } catch(_){}
    const start = s.indexOf("{");
    const end   = s.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    try { return JSON.parse(s.slice(start, end+1)); } catch(_){ return null; }
  }

  // Agentic loop: handles web_search tool_use turns automatically
  async function callWithAgentLoop(body, maxTurns = 8) {
    let messages = [...body.messages];
    let lastData  = null;

    for (let turn = 0; turn < maxTurns; turn++) {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, messages }),
      });
      lastData = await resp.json();
      if (lastData.error) {
        const e = lastData.error;
        if (e.type === "exceeded_limit" || e.type === "rate_limit_error") {
          const resetsAt = e.resetsAt
            ? new Date(e.resetsAt * 1000).toLocaleTimeString("en-AU",{hour:"2-digit",minute:"2-digit"})
            : "soon";
          throw new Error(`API rate limit reached. Your 5-hour usage window resets at ${resetsAt}. Please try again then.`);
        }
        throw new Error(e.message || JSON.stringify(e));
      }

      const { stop_reason, content = [] } = lastData;

      // If the model is done, return collected text
      if (stop_reason === "end_turn") {
        return content.filter(b => b.type === "text").map(b => b.text).join("\n");
      }

      // If tool_use: push assistant turn + synthetic tool_results and continue
      if (stop_reason === "tool_use") {
        const toolUseBlocks = content.filter(b => b.type === "tool_use");
        if (toolUseBlocks.length === 0) break; // safety

        // Append assistant's response to history
        messages = [...messages, { role: "assistant", content }];

        // Build tool_result blocks (content can be empty — server already ran the search)
        const toolResults = toolUseBlocks.map(b => ({
          type:       "tool_result",
          tool_use_id: b.id,
          content:    "",
        }));
        messages = [...messages, { role: "user", content: toolResults }];
        setLoadMsg(`Searching web… (turn ${turn + 2})`);
        continue;
      }

      // Any other stop_reason — grab whatever text we have
      break;
    }

    // Fallback: collect any text from lastData
    return (lastData?.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
  }

  /* ── API: Fetch News ── */
  async function fetchNews() {
    setLoading(true); setError(""); setStreamText("");
    setFetchLog([]);

    const rssSources   = SOURCE_DEFS.filter(s => s.hasRss  && selectedSources.has(s.name));
    const noRssSources = SOURCE_DEFS.filter(s => !s.hasRss && selectedSources.has(s.name));
    const all = [];

    // Multiple CORS proxies — tried in order until one works
    const PROXIES = [
      url => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
      url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
      url => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
    ];

    async function fetchWithProxyFallback(rssUrl, sourceName) {
      const errors = [];
      for (const makeProxy of PROXIES) {
        try {
          const proxyUrl = makeProxy(rssUrl);
          const resp = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) });
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const text = await resp.text();
          // allorigins wraps in JSON; others return raw XML
          let xml = text;
          try { const j = JSON.parse(text); if (j.contents) xml = j.contents; } catch(_){}
          if (!xml.includes("<item") && !xml.includes("<entry")) throw new Error("No RSS items in response");
          const items = parseRssXml(xml, sourceName);
          if (items.length === 0) throw new Error("Parsed 0 items");
          return { ok:true, items, proxy: proxyUrl.split("?")[0] };
        } catch(e) {
          errors.push(e.message);
        }
      }
      return { ok:false, items:[], errors };
    }

    // ── RSS sources ───────────────────────────────────────────────────
    const logUpdates = [];
    const rssFetches = rssSources.map(async (srcDef) => {
      setLoadMsg(`Fetching ${srcDef.name}…`);
      const result = await fetchWithProxyFallback(srcDef.rss, srcDef.name);
      const logEntry = result.ok
        ? { name:srcDef.name, status:"ok",    count:result.items.length, detail:`${result.items.length} headlines via ${result.proxy.replace("https://","")}` }
        : { name:srcDef.name, status:"error", count:0,                   detail:result.errors?.join(" | ") || "All proxies failed" };
      logUpdates.push(logEntry);
      setFetchLog(l => [...l, logEntry]);
      if (result.ok) all.push(...result.items);
    });
    await Promise.all(rssFetches);

    // ── No-RSS: AI web-search ─────────────────────────────────────────
    if (noRssSources.length > 0) {
      setLoadMsg(`AI scanning ${noRssSources.map(s=>s.name).join(", ")}…`);
      try {
        const today = new Date().toLocaleDateString("en-AU",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
        const text = await callWithAgentLoop({
          model:      "claude-sonnet-4-20250514",
          max_tokens: 1500,
          tools:      [{ type:"web_search_20250305", name:"web_search" }],
          system:     `Financial news aggregator. Search ONLY: ${noRssSources.map(s=>s.name).join(", ")}. Return ONLY raw JSON array:
[{"headline":"...","source":"...","category":"Forex|Equities|Commodities|Central Banks|Geopolitics|Economic Data","importance":8,"summary":"...","eventDate":"","accentWords":"..."}]`,
          messages:   [{ role:"user", content:`Get latest headlines from ${noRssSources.map(s=>s.name).join(", ")} (${today}). 4-6 per source. Output ONLY the JSON array.` }],
        });
        const parsed = extractJsonArray(text);
        if (parsed?.length) {
          all.push(...parsed.map((h,i)=>({...h, id:`ai-${i}`})));
          noRssSources.forEach(s => setFetchLog(l=>[...l,{name:s.name,status:"ok",count:parsed.filter(h=>h.source===s.name).length||"?",detail:"AI web search"}]));
        } else {
          noRssSources.forEach(s => setFetchLog(l=>[...l,{name:s.name,status:"warn",count:0,detail:"AI returned no parseable data"}]));
        }
      } catch(e) {
        noRssSources.forEach(s => setFetchLog(l=>[...l,{name:s.name,status:"error",count:0,detail:e.message}]));
      }
    }

    setLoading(false); setLoadMsg("");

    if (all.length === 0) {
      // Show detailed error with log
      setError("No headlines fetched — see source log below for details.");
      return;
    }

    // Deduplicate + sort
    const seen = new Set();
    const deduped = all.filter(h => {
      const key = h.headline.toLowerCase().replace(/[^a-z0-9]/g,"").slice(0,40);
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });

    setHeadlines(
      deduped.map((h,i) => ({...h, id:String(i+1)}))
             .sort((a,b) => (b.importance||0)-(a.importance||0))
    );
    setPhase("dashboard");
  }

  /* ── API: Generate Carousel ── */
  // Simple direct call — no web search needed, carousel only processes already-fetched headlines
  async function generateCarousel() {
    if (selected.length < 2) { setError("Select at least 2 headlines."); return; }
    setLoading(true); setError(""); setStreamText("");
    setLoadMsg("Writing carousel copy…");
    try {
      const selData   = selected.map(id => headlines.find(h => h.id === id)).filter(Boolean);
      const weekLabel = getWeekLabel();
      const today     = new Date().toLocaleDateString("en-AU",{year:"numeric",month:"long",day:"numeric"});

      // Compact headline data — only what the model needs, cuts tokens ~60%
      const compact = selData.map(h => ({
        hl:   h.headline,
        src:  h.source,
        cat:  h.category,
        sum:  h.summary || "",
        acc:  h.accentWords || "",
        date: h.eventDate || "",
      }));

      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model:      "claude-sonnet-4-20250514",
          max_tokens: 1200,
          stream:     true,
          system:     "You write carousel JSON for Vantage Markets Australia. Respond with ONLY a raw JSON object, no markdown, no backticks, no explanation. Be concise — 2-3 sentences per body max.",
          messages: [{
            role:    "user",
            content: `WEEK AHEAD carousel. Week: ${weekLabel}. Headlines: ${JSON.stringify(compact)}. Return ONLY this JSON shape: {"weekLabel":"${weekLabel}","coverAccentWords":"2-4 word theme","coverRestTitle":"rest of title","slides":[{"accentWords":"1-3 words","restOfTitle":"rest","eventDate":"DD Mon, Day or empty","body":"2-3 punchy analytical sentences with data points for retail traders"}]}`
          }],
        }),
      });

      // Handle rate limit before streaming
      if (!resp.ok) {
        const errData = await resp.json().catch(()=>({}));
        const e = errData.error || errData;
        if (e.type === "exceeded_limit" || e.type === "rate_limit_error") {
          const resetsAt = e.resetsAt
            ? new Date(e.resetsAt * 1000).toLocaleTimeString("en-AU",{hour:"2-digit",minute:"2-digit"})
            : "soon";
          throw new Error(`API rate limit reached. Resets at ${resetsAt}.`);
        }
        throw new Error(e.message || `HTTP ${resp.status}`);
      }

      // Stream the response — update UI as tokens arrive
      const reader  = resp.body.getReader();
      const decoder = new TextDecoder();
      let   buffer  = "";
      let   full    = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop(); // keep incomplete line

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") break;
          try {
            const evt = JSON.parse(payload);
            if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
              full += evt.delta.text;
              setStreamText(full);            // live preview in loading overlay
            }
            if (evt.type === "message_start" && evt.message?.error) {
              const e = evt.message.error;
              throw new Error(e.message || JSON.stringify(e));
            }
          } catch(parseErr) {
            if (parseErr.message && !parseErr.message.startsWith("Unexpected")) throw parseErr;
          }
        }
      }

      const parsed = extractJsonObject(full);
      if (!parsed || !parsed.slides) {
        const preview = full?.slice(0, 300) || "(empty)";
        throw new Error(`Unexpected format. Preview: ${preview}`);
      }

      setCarousel(parsed);
      setCurrentSlide(0);
      setStreamText("");
      setPhase("preview");
    } catch(e) {
      setError(e.message);
    }
    setLoading(false); setLoadMsg(""); setStreamText("");
  }

    /* ── Drag & Drop ── */
  function onDragStart(e, id, zone) {
    setDragId(id); setDragZone(zone);
    e.dataTransfer.effectAllowed = "move";
  }
  function onDragOver(id) { setDragOver(id); }
  function onDropOnCard(targetId) {
    if (!dragId || dragId === targetId) { clearDrag(); return; }
    const inSel = selected.includes(dragId);
    const targetInSel = selected.includes(targetId);

    if (!inSel && targetInSel) {
      // pool → into selected at targetId position
      if (selected.length < 7) {
        const ns = [...selected];
        ns.splice(ns.indexOf(targetId), 0, dragId);
        setSelected(ns);
      }
    } else if (inSel && targetInSel) {
      // reorder within selected
      const ns = [...selected];
      ns.splice(ns.indexOf(dragId),1);
      ns.splice(ns.indexOf(targetId),0,dragId);
      setSelected(ns);
    } else if (inSel && !targetInSel) {
      // selected → back to pool
      setSelected(s=>s.filter(x=>x!==dragId));
    }
    clearDrag();
  }
  function onDropOnZone(zone) {
    if (!dragId) return;
    if (zone==="selected" && !selected.includes(dragId) && selected.length<7) setSelected(s=>[...s,dragId]);
    if (zone==="pool" && selected.includes(dragId)) setSelected(s=>s.filter(x=>x!==dragId));
    clearDrag();
  }
  function clearDrag() { setDragId(null); setDragOver(null); setDragZone(null); }

  function toggleSelect(id) {
    if (selected.includes(id)) setSelected(s=>s.filter(x=>x!==id));
    else if (selected.length<7) setSelected(s=>[...s,id]);
    else setError("Maximum 7 slides reached. Remove one first.");
  }

  const pool = headlines.filter(h=>!selected.includes(h.id));
  const selHeadlines = selected.map(id=>headlines.find(h=>h.id===id)).filter(Boolean);
  const totalSlides = carousel ? 1+carousel.slides.length : 0;

  /* ── Shared Styles ── */
  const btn = (bg=B.orange, fg="white", extra={}) => ({
    background:bg, color:fg, border:"none", borderRadius:9,
    padding:"11px 22px", fontSize:13, fontWeight:700,
    cursor:"pointer", fontFamily:"inherit", ...extra
  });
  const panelStyle = { background:B.panel, border:`1px solid ${B.border}`, borderRadius:14, padding:20 };

  return (
    <div style={{ minHeight:"100vh", background:B.appBg, fontFamily:"'Outfit','Plus Jakarta Sans','Segoe UI',sans-serif", color:"white" }}>

      {/* ── HEADER ── */}
      <div style={{ background:"rgba(255,255,255,0.025)", borderBottom:`1px solid ${B.border}`, padding:"14px 24px", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:38, height:38, borderRadius:9, background:B.orange, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, fontWeight:900, color:"white", letterSpacing:"-1px" }}>V</div>
          <div>
            <div style={{ fontSize:15, fontWeight:800, letterSpacing:"-0.3px" }}>Vantage Markets</div>
            <div style={{ fontSize:10.5, color:B.muted, fontWeight:500 }}>Social Media Automation · AU</div>
          </div>
        </div>

        {/* Step pills — all clickable, navigate freely */}
        <div style={{ display:"flex", alignItems:"center", gap:4 }}>
          {[["fetch","1","Fetch News"],["dashboard","2","Build Carousel"],["preview","3","Preview"]].map(([p,num,label],i,arr)=>{
            const STEPS = ["fetch","dashboard","preview"];
            const cur   = STEPS.indexOf(phase);
            const isActive   = phase === p;
            const isComplete = cur > i;
            const canNav = true; // always allow — user can freely jump
            const navTo = () => {
              if (p==="dashboard" && headlines.length===0) setHeadlines(MOCK_HEADLINES);
              if (p==="preview"   && !carousel)            setCarousel(MOCK_CAROUSEL);
              setPhase(p);
              if (p==="dashboard") setSubTab("select");
            };
            return (
              <div key={p} style={{ display:"flex", alignItems:"center", gap:4 }}>
                <button onClick={navTo}
                  style={{ display:"flex", alignItems:"center", gap:6, background:"none", border:"none", cursor:"pointer", fontFamily:"inherit", padding:"4px 6px", borderRadius:8,
                    opacity: isActive ? 1 : isComplete ? 0.8 : 0.4,
                    transition:"opacity 0.15s",
                  }}>
                  <div style={{
                    width:24, height:24, borderRadius:"50%",
                    background: isComplete ? B.orange : isActive ? B.orange : "transparent",
                    border:`2px solid ${isComplete||isActive ? B.orange : B.border}`,
                    display:"flex", alignItems:"center", justifyContent:"center",
                    fontSize:11, fontWeight:800, color:"white", flexShrink:0,
                  }}>
                    {isComplete ? "✓" : num}
                  </div>
                  <span style={{ fontSize:12, fontWeight:600, color:"white" }}>{label}</span>
                </button>
                {i<arr.length-1 && <div style={{ width:20, height:1, background:B.border, margin:"0 2px" }}/>}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── LOADING OVERLAY ── */}
      {loading && (
        <div style={{ position:"fixed", inset:0, background:"rgba(8,14,25,0.95)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", zIndex:200, gap:16, padding:24 }}>
          <style>{`@keyframes vm-spin{to{transform:rotate(360deg)}} @keyframes vm-pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>

          {streamText ? (
            /* ── Streaming progress view ── */
            <div style={{ width:"100%", maxWidth:560, display:"flex", flexDirection:"column", alignItems:"center", gap:14 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ width:10, height:10, borderRadius:"50%", background:B.orange, animation:"vm-pulse 1s ease-in-out infinite" }}/>
                <div style={{ fontSize:14, fontWeight:700, color:"white" }}>Writing carousel copy</div>
              </div>

              {/* Live JSON stream preview */}
              <div style={{ width:"100%", background:"rgba(255,255,255,0.04)", border:`1px solid ${B.border}`, borderRadius:12, padding:"14px 16px", maxHeight:220, overflow:"hidden", position:"relative" }}>
                <div style={{ fontSize:10, fontWeight:700, color:B.orange, letterSpacing:"0.07em", textTransform:"uppercase", marginBottom:8 }}>Live Output</div>
                <pre style={{ margin:0, fontSize:10.5, color:"#86efac", fontFamily:"'Fira Code','Fira Mono',monospace", lineHeight:1.65, whiteSpace:"pre-wrap", wordBreak:"break-all" }}>
                  {streamText.slice(-600)}
                </pre>
                {/* fade bottom */}
                <div style={{ position:"absolute", bottom:0, left:0, right:0, height:48, background:"linear-gradient(transparent,rgba(15,26,40,0.98))", borderRadius:"0 0 12px 12px", pointerEvents:"none" }}/>
              </div>

              {/* Token counter */}
              <div style={{ fontSize:11, color:B.muted }}>
                {streamText.length} characters · {Math.round(streamText.length/4)} tokens
              </div>
            </div>
          ) : (
            /* ── Standard spinner view (fetch news phase) ── */
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:16 }}>
              <div style={{ width:50, height:50, borderRadius:"50%", border:`3px solid rgba(227,87,40,0.15)`, borderTop:`3px solid ${B.orange}`, animation:"vm-spin 0.75s linear infinite" }}/>
              <div style={{ fontSize:15, color:"#D1D5DB", fontWeight:500 }}>{loadMsg}</div>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap", justifyContent:"center", maxWidth:520 }}>
                {[...selectedSources].map(s=>{
                  const def = SOURCE_DEFS.find(d=>d.name===s);
                  const isRss = def?.hasRss;
                  return (
                    <div key={s} style={{ display:"flex", alignItems:"center", gap:5, fontSize:10, color:"white",
                      background: isRss ? "rgba(16,185,129,0.12)" : `${B.orange}15`,
                      border:`1px solid ${isRss?"rgba(16,185,129,0.4)":B.orange+"33"}`,
                      padding:"3px 10px", borderRadius:4, fontWeight:600 }}>
                      <span style={{ fontSize:8, color: isRss?"#34d399":B.orange }}>{isRss?"RSS":"AI"}</span>
                      {s}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── ERROR TOAST ── */}
      {error && (
        <div style={{ background:"rgba(239,68,68,0.12)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:10, padding:"10px 16px", margin:"16px 24px 0", display:"flex", justifyContent:"space-between", alignItems:"center", fontSize:13 }}>
          <span style={{ color:"#FCA5A5" }}>⚠ {error}</span>
          <button onClick={()=>setError("")} style={{ background:"none", border:"none", color:"#9CA3AF", cursor:"pointer", fontSize:16 }}>✕</button>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════ */}
      {/* PHASE 1 — FETCH                                             */}
      {/* ════════════════════════════════════════════════════════════ */}
      {phase === "fetch" && (
        <div style={{ maxWidth:680, margin:"70px auto", padding:"0 24px", textAlign:"center" }}>
          <div style={{ display:"inline-block", background:`${B.orange}18`, border:`1px solid ${B.orange}44`, color:B.orange, padding:"4px 14px", borderRadius:100, fontSize:11, fontWeight:700, letterSpacing:"0.07em", textTransform:"uppercase", marginBottom:20 }}>
            Step 1 · News Intelligence
          </div>
          <h1 style={{ fontSize:40, fontWeight:900, lineHeight:1.15, margin:"0 0 18px", letterSpacing:"-1px" }}>
            Scan Today's<br/><span style={{ color:B.orange }}>Market Headlines</span>
          </h1>
          <p style={{ fontSize:15, color:"#9CA3AF", lineHeight:1.75, maxWidth:520, margin:"0 auto 44px" }}>
            The AI agent browses your verified financial news sources, extracts the most market-moving stories, and scores them by importance — ready for your carousel.
          </p>

          {/* Source selector */}
          <div style={{ background:"rgba(255,255,255,0.03)", border:`1px solid ${B.border}`, borderRadius:14, padding:"20px 24px", marginBottom:36, textAlign:"left" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
              <div>
                <div style={{ fontSize:13, fontWeight:700, color:"white", marginBottom:2 }}>News Sources</div>
                <div style={{ fontSize:11, color:B.muted }}>{selectedSources.size} of {SOURCES.length} selected</div>
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={()=>setSelectedSources(new Set(SOURCES))} style={{ background:"none", border:`1px solid ${B.border}`, borderRadius:7, padding:"5px 12px", fontSize:11, fontWeight:600, color:"#9CA3AF", cursor:"pointer", fontFamily:"inherit" }}>All</button>
                <button onClick={()=>setSelectedSources(new Set())} style={{ background:"none", border:`1px solid ${B.border}`, borderRadius:7, padding:"5px 12px", fontSize:11, fontWeight:600, color:"#9CA3AF", cursor:"pointer", fontFamily:"inherit" }}>None</button>
              </div>
            </div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
              {SOURCES.map(source => {
                const active = selectedSources.has(source);
                return (
                  <button
                    key={source}
                    onClick={() => {
                      const next = new Set(selectedSources);
                      active ? next.delete(source) : next.add(source);
                      setSelectedSources(next);
                    }}
                    style={{
                      display:"flex", alignItems:"center", gap:7,
                      background: active ? `${B.orange}18` : "rgba(255,255,255,0.04)",
                      border: `1.5px solid ${active ? B.orange : B.border}`,
                      borderRadius:100, padding:"7px 15px",
                      fontSize:12, fontWeight:600,
                      color: active ? "white" : "#6B7280",
                      cursor:"pointer", fontFamily:"inherit",
                      transition:"all 0.15s",
                    }}
                  >
                    <span style={{
                      width:14, height:14, borderRadius:3,
                      background: active ? B.orange : "transparent",
                      border: `1.5px solid ${active ? B.orange : "#374151"}`,
                      display:"flex", alignItems:"center", justifyContent:"center",
                      fontSize:9, color:"white", flexShrink:0, transition:"all 0.15s",
                    }}>{active ? "✓" : ""}</span>
                    {source}
                    {SOURCE_DEFS.find(d=>d.name===source)?.hasRss
                      ? <span style={{ fontSize:8, fontWeight:700, color:"#34d399", background:"rgba(16,185,129,0.15)", padding:"1px 5px", borderRadius:3, marginLeft:2 }}>RSS</span>
                      : <span style={{ fontSize:8, fontWeight:700, color:B.orange, background:`${B.orange}18`, padding:"1px 5px", borderRadius:3, marginLeft:2 }}>AI</span>
                    }
                  </button>
                );
              })}
            </div>
            {selectedSources.size === 0 && (
              <div style={{ marginTop:12, fontSize:12, color:B.orange }}>⚠ Select at least one source to continue.</div>
            )}
          </div>

          {/* Pipeline preview */}
          <div style={{ display:"flex", gap:0, justifyContent:"center", marginBottom:44, flexWrap:"wrap" }}>
            {[["🔍","Scan Sources"],["📰","Extract Headlines"],["🧠","Score & Rank"],["✨","Build Carousel"]].map(([icon,label],i,arr)=>(
              <div key={label} style={{ display:"flex", alignItems:"center" }}>
                <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6, padding:"0 12px" }}>
                  <div style={{ fontSize:20 }}>{icon}</div>
                  <div style={{ fontSize:10, color:B.muted, fontWeight:500 }}>{label}</div>
                </div>
                {i<arr.length-1 && <div style={{ width:24, height:1, background:B.border }}/>}
              </div>
            ))}
          </div>

          <button
            onClick={fetchNews}
            disabled={selectedSources.size === 0}
            style={{ ...btn(selectedSources.size>0?B.orange:"#1F2937","white",{ fontSize:16, padding:"15px 44px", borderRadius:12, letterSpacing:"0.01em", opacity:selectedSources.size>0?1:0.45 }) }}
          >
            🔍 Scan {selectedSources.size} Source{selectedSources.size!==1?"s":""}
          </button>

          {/* Fetch log — shown after a scan attempt */}
          {fetchLog.length > 0 && (
            <div style={{ marginTop:32, width:"100%", maxWidth:540, textAlign:"left" }}>
              <div style={{ fontSize:11, fontWeight:700, color:B.muted, letterSpacing:"0.07em", textTransform:"uppercase", marginBottom:10 }}>
                Source Log
              </div>
              <div style={{ background:"rgba(255,255,255,0.03)", border:`1px solid ${B.border}`, borderRadius:12, overflow:"hidden" }}>
                {fetchLog.map((entry, i) => {
                  const col  = entry.status==="ok" ? "#34d399" : entry.status==="warn" ? "#FBBF24" : "#F87171";
                  const icon = entry.status==="ok" ? "✓" : entry.status==="warn" ? "⚠" : "✗";
                  return (
                    <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:12, padding:"10px 14px", borderBottom: i<fetchLog.length-1?`1px solid ${B.border}`:"none" }}>
                      <span style={{ color:col, fontWeight:800, fontSize:13, flexShrink:0, marginTop:1 }}>{icon}</span>
                      <div style={{ flex:1 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:2 }}>
                          <span style={{ fontSize:12, fontWeight:700, color:"white" }}>{entry.name}</span>
                          {entry.count > 0 && <span style={{ fontSize:10, color:col, background:`${col}18`, padding:"1px 7px", borderRadius:4, fontWeight:600 }}>{entry.count} headlines</span>}
                        </div>
                        <div style={{ fontSize:10.5, color:"#6B7280", lineHeight:1.5 }}>{entry.detail}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {fetchLog.every(e=>e.status==="error") && (
                <div style={{ marginTop:12, padding:"12px 14px", background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.2)", borderRadius:10, fontSize:12, color:"#FCA5A5", lineHeight:1.75 }}>
                  All RSS proxies failed. This usually means the sandbox network blocks external requests.
                  Try selecting <strong style={{color:"white"}}>Bloomberg, Ausbiz or InvestingLive</strong> (AI mode) which routes through Anthropic's servers instead.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════ */}
      {/* PHASE 2 — DASHBOARD                                         */}
      {/* ════════════════════════════════════════════════════════════ */}
      {phase === "dashboard" && (
        <div style={{ maxWidth:1200, margin:"0 auto", padding:"24px" }}>

          {/* Header row */}
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20, flexWrap:"wrap", gap:14 }}>
            <div>
              <div style={{ fontSize:11, color:B.orange, fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:6 }}>Step 2 · Headline Dashboard</div>
              <h2 style={{ fontSize:26, fontWeight:900, margin:"0 0 4px", letterSpacing:"-0.5px" }}>Select Headlines for Your Carousel</h2>
              <p style={{ fontSize:13, color:B.muted, margin:0 }}>Click or drag headlines into the carousel zone · Max 7 slides · Drag to reorder</p>
            </div>
            <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
              {/* Sub-tabs */}
              <div style={{ display:"flex", background:"rgba(255,255,255,0.04)", borderRadius:8, padding:3 }}>
                {[["select","📋 Select"],["record","📄 News Record"]].map(([t,l])=>(
                  <button key={t} onClick={()=>setSubTab(t)} style={{ ...btn(subTab===t?"rgba(255,255,255,0.1)":"transparent","white",{ borderRadius:6, padding:"7px 14px", fontSize:12, fontWeight:600, border:`1px solid ${subTab===t?B.border:"transparent"}` }) }}>{l}</button>
                ))}
              </div>
              <button
                onClick={generateCarousel}
                disabled={selected.length<2}
                style={{ ...btn(selected.length>=2?B.orange:"#1F2937","white",{ opacity:selected.length>=2?1:0.5 }) }}
              >
                ✨ Generate Carousel ({selected.length}/7)
              </button>
            </div>
          </div>

          {/* News Record sub-tab */}
          {subTab === "record" && (
            <div style={panelStyle}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                <div style={{ fontSize:14, fontWeight:700 }}>All Fetched Headlines ({headlines.length})</div>
                <button onClick={()=>{
                  const csv = ["#,Score,Headline,Source,Category,Event Date",
                    ...headlines.map((h,i)=>`${i+1},${h.importance},"${h.headline}",${h.source},${h.category},"${h.eventDate||""}"`)
                  ].join("\n");
                  const a = document.createElement("a");
                  a.href = "data:text/csv;charset=utf-8,"+encodeURIComponent(csv);
                  a.download = `vantage-headlines-${new Date().toISOString().slice(0,10)}.csv`;
                  a.click();
                }} style={btn("rgba(255,255,255,0.07)","white",{ fontSize:12, padding:"7px 14px" })}>
                  ↓ Export CSV
                </button>
              </div>
              <NewsRecord headlines={headlines}/>
            </div>
          )}

          {/* Select sub-tab */}
          {subTab === "select" && (
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:18 }}>

              {/* Pool */}
              <div
                onDragOver={e=>e.preventDefault()}
                onDrop={e=>{ e.preventDefault(); onDropOnZone("pool"); }}
              >
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:B.muted, textTransform:"uppercase", letterSpacing:"0.06em" }}>
                    Available Headlines ({pool.length})
                  </div>
                  <div style={{ display:"flex", gap:6 }}>
                    {Object.keys(CAT_COLORS).slice(0,4).map(c=>(
                      <div key={c} style={{ width:8, height:8, borderRadius:"50%", background:CAT_COLORS[c] }} title={c}/>
                    ))}
                  </div>
                </div>
                <div style={{ ...panelStyle, padding:14, minHeight:200 }}>
                  {pool.map(h=>(
                    <HeadlineCard
                      key={h.id} h={h} selected={false}
                      dragging={dragId===h.id} dragOver={dragOver===h.id}
                      onToggle={id=>{ toggleSelect(id); }}
                      onDragStart={(e,id)=>onDragStart(e,id,"pool")}
                      onDragOver={onDragOver}
                      onDrop={onDropOnCard}
                    />
                  ))}
                  {pool.length===0 && <div style={{ textAlign:"center", color:B.muted, padding:"40px 0", fontSize:13 }}>All headlines added to carousel</div>}
                </div>
              </div>

              {/* Selected / Carousel order */}
              <div
                onDragOver={e=>e.preventDefault()}
                onDrop={e=>{ e.preventDefault(); onDropOnZone("selected"); }}
              >
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:B.orange, textTransform:"uppercase", letterSpacing:"0.06em" }}>
                    Carousel Slides ({selected.length}/7)
                  </div>
                  {selected.length>0 && (
                    <button onClick={()=>setSelected([])} style={{ ...btn("transparent",B.muted,{ fontSize:11, padding:"4px 10px" }) }}>Clear all</button>
                  )}
                </div>
                <div style={{
                  ...panelStyle, padding:14, minHeight:200,
                  border: selected.length===0 ? `1px dashed ${B.orange}44` : `1px solid ${B.border}`,
                }}>
                  {selected.length===0 && (
                    <div style={{ textAlign:"center", color:B.muted, padding:"50px 0" }}>
                      <div style={{ fontSize:28, marginBottom:10 }}>←</div>
                      <div style={{ fontSize:13 }}>Drag headlines here<br/>or click + to add</div>
                    </div>
                  )}
                  {selHeadlines.map((h,idx)=>(
                    <div key={h.id} style={{ display:"flex", alignItems:"flex-start", gap:8 }}>
                      <div style={{ color:B.orange, fontSize:11, fontWeight:800, paddingTop:15, minWidth:16, textAlign:"center" }}>{idx+1}</div>
                      <div style={{ flex:1 }}>
                        <HeadlineCard
                          h={h} selected={true}
                          dragging={dragId===h.id} dragOver={dragOver===h.id}
                          onToggle={toggleSelect}
                          onDragStart={(e,id)=>onDragStart(e,id,"selected")}
                          onDragOver={onDragOver}
                          onDrop={onDropOnCard}
                        />
                      </div>
                    </div>
                  ))}
                  {selected.length>0 && selected.length<7 && (
                    <div style={{ textAlign:"center", color:B.border, fontSize:11, padding:"8px 0", borderTop:`1px dashed ${B.border}`, marginTop:6 }}>
                      {7-selected.length} more slot{7-selected.length!==1?"s":""} available
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      {/* ════════════════════════════════════════════════════════════ */}
      {/* PHASE 3 — EDITOR                                             */}
      {/* ════════════════════════════════════════════════════════════ */}
      {phase === "preview" && carousel && (
        <SlideEditor
          carousel={carousel}
          headlines={headlines}
          onBack={() => { setPhase("dashboard"); setSubTab("select"); }}
          onRegenerate={() => { setPhase("dashboard"); setSubTab("select"); generateCarousel(); }}
        />
      )}


      {/* ── HEADLINE PREVIEW MODAL ── */}
      {previewHl && (
        <div style={{ position:"fixed", inset:0, background:"rgba(5,10,18,0.88)", zIndex:600, display:"flex", alignItems:"center", justifyContent:"center", padding:24, fontFamily:"'Outfit','Plus Jakarta Sans',sans-serif" }}
          onClick={()=>setPreviewHl(null)}>
          <div onClick={e=>e.stopPropagation()}
            style={{ background:"#0F1A28", border:`1px solid ${B.border}`, borderRadius:16, padding:"26px 28px", maxWidth:520, width:"100%", boxShadow:"0 32px 80px rgba(0,0,0,0.7)" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
              <div style={{ flex:1 }}>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:10 }}>
                  <span style={{ fontSize:10, fontWeight:700, color:CAT_COLORS[previewHl.category]||B.orange, background:`${(CAT_COLORS[previewHl.category]||B.orange)}18`, padding:"3px 9px", borderRadius:4 }}>{previewHl.category}</span>
                  <span style={{ fontSize:10, fontWeight:700, color:B.muted, background:"rgba(255,255,255,0.05)", padding:"3px 9px", borderRadius:4 }}>📰 {previewHl.source}</span>
                  {previewHl.eventDate && <span style={{ fontSize:10, color:"#9CA3AF", background:"rgba(255,255,255,0.04)", padding:"3px 9px", borderRadius:4 }}>📅 {previewHl.eventDate}</span>}
                  <span style={{ fontSize:10, fontWeight:800, color: previewHl.importance>=8?B.orange:previewHl.importance>=5?B.teal:"#6B7280", background:"rgba(255,255,255,0.05)", padding:"3px 9px", borderRadius:4 }}>
                    Score: {previewHl.importance}/10
                  </span>
                </div>
                <h3 style={{ fontSize:17, fontWeight:800, lineHeight:1.35, margin:0, color:"white" }}>{previewHl.headline}</h3>
              </div>
              <button onClick={()=>setPreviewHl(null)} style={{ background:"none", border:"none", color:"#6B7280", fontSize:20, cursor:"pointer", marginLeft:12, flexShrink:0, lineHeight:1 }}>✕</button>
            </div>
            {previewHl.summary && (
              <p style={{ fontSize:13, color:"#D1D5DB", lineHeight:1.75, margin:"0 0 18px" }}>{previewHl.summary}</p>
            )}
            <div style={{ background:"rgba(255,255,255,0.04)", border:`1px solid ${B.border}`, borderRadius:10, padding:"10px 14px", marginBottom:18 }}>
              <div style={{ fontSize:10, fontWeight:700, color:B.muted, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:6 }}>Accent Words (for slide)</div>
              <div style={{ fontSize:13, color:B.orange, fontWeight:700 }}>{previewHl.accentWords || "—"}</div>
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={()=>{ if(!selected.includes(previewHl.id)) setSelected(s=>[...s,previewHl.id]); setPreviewHl(null); }}
                style={{ flex:1, background: selected.includes(previewHl.id)?B.teal:B.orange, border:"none", borderRadius:9, padding:"11px 0", fontSize:13, fontWeight:700, color:"white", cursor:"pointer", fontFamily:"inherit" }}>
                {selected.includes(previewHl.id) ? "✓ Already Selected" : "＋ Add to Carousel"}
              </button>
              <button onClick={()=>setPreviewHl(null)}
                style={{ background:"rgba(255,255,255,0.06)", border:`1px solid ${B.border}`, borderRadius:9, padding:"11px 20px", fontSize:13, fontWeight:600, color:"white", cursor:"pointer", fontFamily:"inherit" }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DEV TOOLS ── */}
      {/* Floating trigger button */}
      <button
        onClick={()=>setShowDev(d=>!d)}
        title="Dev Tools — jump to any section"
        style={{ position:"fixed", bottom:20, right:20, zIndex:500,
          width:42, height:42, borderRadius:"50%",
          background: showDev ? B.teal : "rgba(15,26,40,0.95)",
          border:`1.5px solid ${showDev ? B.teal : B.border}`,
          color:"white", fontSize:18, cursor:"pointer",
          display:"flex", alignItems:"center", justifyContent:"center",
          boxShadow:"0 4px 24px rgba(0,0,0,0.5)",
          transition:"all 0.2s", fontFamily:"inherit" }}>
        {showDev ? "✕" : "⚙"}
      </button>

      {/* Dev drawer */}
      {showDev && (
        <div style={{ position:"fixed", bottom:72, right:20, zIndex:499,
          width:290, background:"#0F1A28",
          border:`1px solid ${B.border}`, borderRadius:14,
          boxShadow:"0 20px 60px rgba(0,0,0,0.7)",
          fontFamily:"'Outfit','Plus Jakarta Sans','Segoe UI',sans-serif",
          overflow:"hidden" }}>

          {/* Header */}
          <div style={{ padding:"12px 16px 10px", background:"rgba(255,255,255,0.04)", borderBottom:`1px solid ${B.border}` }}>
            <div style={{ fontSize:10, fontWeight:700, color:B.orange, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:2 }}>⚙ Dev Tools</div>
            <div style={{ fontSize:11, color:"#6B7280" }}>Jump to any section with mock data</div>
          </div>

          <div style={{ padding:14, display:"flex", flexDirection:"column", gap:6 }}>

            {/* ── Section jumps ── */}
            <div style={{ fontSize:10, fontWeight:700, color:"#6B7280", letterSpacing:"0.06em", textTransform:"uppercase", marginBottom:2 }}>Jump To</div>

            {/* Step 1 – Fetch */}
            <button onClick={()=>{ setPhase("fetch"); setShowDev(false); }}
              style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px", borderRadius:9, cursor:"pointer", fontFamily:"inherit", textAlign:"left", width:"100%",
                background: phase==="fetch" ? `${B.orange}18` : "rgba(255,255,255,0.04)",
                border: `1px solid ${phase==="fetch" ? B.orange+"55" : B.border}` }}>
              <div style={{ width:26, height:26, borderRadius:"50%", background: phase==="fetch"?B.orange:"rgba(255,255,255,0.07)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:800, flexShrink:0 }}>1</div>
              <div>
                <div style={{ fontSize:12, fontWeight:700, color:"white" }}>Fetch News</div>
                <div style={{ fontSize:10, color:"#6B7280" }}>Source selector + scan</div>
              </div>
              {phase==="fetch" && <div style={{ marginLeft:"auto", fontSize:9, color:B.orange, fontWeight:700 }}>ACTIVE</div>}
            </button>

            {/* Step 2 – Dashboard (loads mock headlines) */}
            <button onClick={()=>{
                if (headlines.length === 0) setHeadlines(MOCK_HEADLINES);
                setPhase("dashboard"); setSubTab("select"); setShowDev(false);
              }}
              style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px", borderRadius:9, cursor:"pointer", fontFamily:"inherit", textAlign:"left", width:"100%",
                background: phase==="dashboard" ? `${B.orange}18` : "rgba(255,255,255,0.04)",
                border: `1px solid ${phase==="dashboard" ? B.orange+"55" : B.border}` }}>
              <div style={{ width:26, height:26, borderRadius:"50%", background: phase==="dashboard"?B.orange:"rgba(255,255,255,0.07)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:800, flexShrink:0 }}>2</div>
              <div>
                <div style={{ fontSize:12, fontWeight:700, color:"white" }}>Headline Dashboard</div>
                <div style={{ fontSize:10, color:"#6B7280" }}>{headlines.length > 0 ? `${headlines.length} headlines loaded` : "Injects 10 mock headlines"}</div>
              </div>
              {phase==="dashboard" && <div style={{ marginLeft:"auto", fontSize:9, color:B.orange, fontWeight:700 }}>ACTIVE</div>}
            </button>

            {/* Step 3 – Editor (loads mock carousel) */}
            <button onClick={()=>{
                if (headlines.length === 0) setHeadlines(MOCK_HEADLINES);
                if (!carousel) setCarousel(MOCK_CAROUSEL);
                setPhase("preview"); setShowDev(false);
              }}
              style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px", borderRadius:9, cursor:"pointer", fontFamily:"inherit", textAlign:"left", width:"100%",
                background: phase==="preview" ? `${B.orange}18` : "rgba(255,255,255,0.04)",
                border: `1px solid ${phase==="preview" ? B.orange+"55" : B.border}` }}>
              <div style={{ width:26, height:26, borderRadius:"50%", background: phase==="preview"?B.orange:"rgba(255,255,255,0.07)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:800, flexShrink:0 }}>3</div>
              <div>
                <div style={{ fontSize:12, fontWeight:700, color:"white" }}>Slide Editor</div>
                <div style={{ fontSize:10, color:"#6B7280" }}>{carousel ? "Current carousel loaded" : "Injects mock carousel"}</div>
              </div>
              {phase==="preview" && <div style={{ marginLeft:"auto", fontSize:9, color:B.orange, fontWeight:700 }}>ACTIVE</div>}
            </button>

            <div style={{ height:1, background:B.border, margin:"4px 0" }}/>

            {/* ── Quick actions ── */}
            <div style={{ fontSize:10, fontWeight:700, color:"#6B7280", letterSpacing:"0.06em", textTransform:"uppercase", marginBottom:2 }}>Quick Actions</div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
              <button onClick={()=>{
                  setHeadlines(MOCK_HEADLINES);
                  setError(""); setShowDev(false);
                  if (phase!=="dashboard") { setPhase("dashboard"); setSubTab("select"); }
                }}
                style={{ padding:"8px 10px", borderRadius:8, fontSize:11, fontWeight:600, cursor:"pointer", fontFamily:"inherit", color:"white", background:"rgba(255,255,255,0.06)", border:`1px solid ${B.border}`, textAlign:"center" }}>
                💉 Load Mock Headlines
              </button>

              <button onClick={()=>{
                  setCarousel(MOCK_CAROUSEL);
                  setError(""); setShowDev(false);
                  if (phase!=="preview") setPhase("preview");
                }}
                style={{ padding:"8px 10px", borderRadius:8, fontSize:11, fontWeight:600, cursor:"pointer", fontFamily:"inherit", color:"white", background:"rgba(255,255,255,0.06)", border:`1px solid ${B.border}`, textAlign:"center" }}>
                🎠 Load Mock Carousel
              </button>

              <button onClick={()=>{
                  setSelected(MOCK_HEADLINES.slice(0,4).map(h=>h.id));
                  setShowDev(false);
                  if (headlines.length===0) setHeadlines(MOCK_HEADLINES);
                  if (phase!=="dashboard") { setPhase("dashboard"); setSubTab("select"); }
                }}
                style={{ padding:"8px 10px", borderRadius:8, fontSize:11, fontWeight:600, cursor:"pointer", fontFamily:"inherit", color:"white", background:"rgba(255,255,255,0.06)", border:`1px solid ${B.border}`, textAlign:"center" }}>
                ✅ Pre-select 4 Slides
              </button>

              <button onClick={()=>{
                  setPhase("fetch"); setHeadlines([]); setSelected([]);
                  setCarousel(null); setError(""); setFetchLog([]);
                  setShowDev(false);
                }}
                style={{ padding:"8px 10px", borderRadius:8, fontSize:11, fontWeight:600, cursor:"pointer", fontFamily:"inherit", color:"#FCA5A5", background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.2)", textAlign:"center" }}>
                🔄 Full Reset
              </button>
            </div>

            {/* ── State summary ── */}
            <div style={{ marginTop:4, padding:"10px 12px", background:"rgba(255,255,255,0.03)", border:`1px solid ${B.border}`, borderRadius:8 }}>
              <div style={{ fontSize:10, fontWeight:700, color:"#6B7280", marginBottom:7, letterSpacing:"0.05em", textTransform:"uppercase" }}>State</div>
              {[
                ["Phase",     phase],
                ["Headlines", headlines.length + " loaded"],
                ["Selected",  selected.length + " / 7"],
                ["Carousel",  carousel ? `${carousel.slides?.length || 0} slides` : "none"],
              ].map(([k,v])=>(
                <div key={k} style={{ display:"flex", justifyContent:"space-between", fontSize:11, marginBottom:4 }}>
                  <span style={{ color:"#6B7280" }}>{k}</span>
                  <span style={{ color:"white", fontWeight:600 }}>{v}</span>
                </div>
              ))}
            </div>

          </div>
        </div>
      )}

      {/* Bottom padding */}
      <div style={{ height:60 }}/>
    </div>
  );
}
