/* ── Config ── */
const CLUB = "Dinamo Zagreb";
const CLUB_KEYWORDS = ["dinamo zagreb", "dinamo"];

/* ── State ── */
let allData   = [];
let activeAge = 0;
let activeTab = "rezultati";
let cooldownTimer = null;

/* ── Init ── */
document.addEventListener("DOMContentLoaded", loadData);

/* ── Data ── */
async function loadData() {
  showLoading(true);
  hideError();
  try {
    const res = await fetch("/api/data");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    allData = await res.json();
    buildPills();
    render();
    updateMeta();
  } catch (e) {
    showError("Greška pri učitavanju: " + e.message);
  } finally {
    showLoading(false);
  }
}

async function manualRefresh() {
  const btn = document.getElementById("btn-refresh");
  btn.disabled = true;
  document.body.classList.add("refreshing");
  hideError();
  try {
    const res = await fetch("/api/refresh", { method: "POST" });
    if (res.status === 429) {
      const body = await res.json();
      const secs = body.detail?.retry_after ?? 300;
      startCooldownDisplay(secs);
      return;
    }
    if (res.status === 409) return; // već u tijeku
    await pollUntilUpdated(90);
    await loadData();
    startCooldownDisplay(300); // 5 min nakon uspješnog refresha
  } catch (e) {
    showError("Osvježavanje nije uspjelo: " + e.message);
  } finally {
    btn.disabled = false;
    document.body.classList.remove("refreshing");
  }
}

function startCooldownDisplay(seconds) {
  const el = document.getElementById("refresh-cooldown");
  const btn = document.getElementById("btn-refresh");
  if (cooldownTimer) clearInterval(cooldownTimer);
  let remaining = seconds;

  function update() {
    if (remaining <= 0) {
      clearInterval(cooldownTimer);
      cooldownTimer = null;
      el.classList.add("hidden");
      btn.disabled = false;
      return;
    }
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    el.textContent = `${m}:${s.toString().padStart(2, "0")}`;
    el.classList.remove("hidden");
    btn.disabled = true;
    remaining--;
  }

  update();
  cooldownTimer = setInterval(update, 1000);
}

async function pollUntilUpdated(maxSeconds) {
  const snapshot = allData.map(d => d.last_updated);
  const deadline = Date.now() + maxSeconds * 1000;
  while (Date.now() < deadline) {
    await sleep(3000);
    try {
      const r = await fetch("/api/data");
      const fresh = await r.json();
      if (fresh.some((d, i) => d.last_updated !== snapshot[i])) return;
    } catch (_) {}
  }
}

/* ── Pills ── */
function buildPills() {
  const nav = document.getElementById("pills");
  nav.innerHTML = "";
  allData.forEach((comp, i) => {
    const btn = document.createElement("button");
    btn.className = "pill" + (i === activeAge ? " active" : "");
    btn.textContent = comp.category;
    btn.addEventListener("click", () => switchAge(i));
    nav.appendChild(btn);
  });
}

function switchAge(i) {
  activeAge = i;
  document.querySelectorAll(".pill").forEach((b, idx) =>
    b.classList.toggle("active", idx === i)
  );
  render();
  updateMeta();
}

/* ── Tabs ── */
function switchMainTab(tab) {
  activeTab = tab;
  document.querySelectorAll(".tab-btn").forEach(b =>
    b.classList.toggle("active", b.dataset.tab === tab)
  );
  renderContent();
}

/* ── Render ── */
function render() {
  const comp = allData[activeAge];
  if (!comp) return;
  renderQuickStats(comp);
  renderContent();
}

function renderContent() {
  const comp = allData[activeAge];
  if (!comp) return;
  const el = document.getElementById("content");
  el.classList.remove("hidden");
  el.innerHTML = "";

  if (activeTab === "rezultati") el.appendChild(buildRezultati(comp));
  if (activeTab === "tablica")   el.appendChild(buildTablica(comp));
  if (activeTab === "raspored")  el.appendChild(buildRaspored(comp));
}

/* ── Quick Stats ── */
function renderQuickStats(comp) {
  const qs = document.getElementById("quick-stats");
  const myRow = comp.standings.find(s => isDinamo(s.team));

  if (!myRow) { qs.style.display = "none"; return; }
  qs.style.display = "block";

  document.getElementById("stat-pos").textContent    = "#" + (myRow.rank ?? "—");
  document.getElementById("stat-pts").textContent    = (myRow.points ?? "—") + " bod.";
  document.getElementById("stat-won").textContent   = myRow.won   ?? 0;
  document.getElementById("stat-drawn").textContent = myRow.drawn ?? 0;
  document.getElementById("stat-lost").textContent  = myRow.lost  ?? 0;

  // Forma: last 5 played Dinamo matches
  const played = comp.matches
    .filter(m => m.status === "played" && (isDinamo(m.home_team) || isDinamo(m.away_team)))
    .slice(-5);

  const formaEl = document.getElementById("forma");
  formaEl.innerHTML = "";
  played.forEach(m => {
    const res = matchResult(m);
    const sq  = document.createElement("div");
    sq.className = "forma-sq forma-sq--" + res.cls;
    sq.textContent = res.label;
    formaEl.appendChild(sq);
  });

  // Header subtitle
  document.getElementById("header-subtitle").textContent =
    "Zagreb · " + comp.name;
}

/* ── Rezultati tab ── */
function buildRezultati(comp) {
  const frag = document.createDocumentFragment();

  const played = comp.matches
    .filter(m => m.status === "played" && (isDinamo(m.home_team) || isDinamo(m.away_team)))
    .slice()
    .sort((a, b) => parseDateStr(b.date) - parseDateStr(a.date));

  if (!played.length) {
    const div = document.createElement("div");
    div.className = "empty";
    div.textContent = "Nema odigranih utakmica.";
    frag.appendChild(div);
    return frag;
  }

  let lastRound = null;
  played.forEach(m => {
    if (m.round && m.round !== lastRound) {
      const lbl = document.createElement("div");
      lbl.className = "section-label";
      lbl.textContent = m.round;
      frag.appendChild(lbl);
      lastRound = m.round;
    }
    frag.appendChild(matchCard(m));
  });

  return frag;
}

function matchCard(m) {
  const isDom   = isDinamo(m.home_team);
  const isGost  = isDinamo(m.away_team);
  const dinamo  = isDom || isGost;
  const res     = dinamo ? matchResult(m) : null;

  const card = document.createElement("div");
  card.className = "match-card" + (dinamo ? " match-card--dinamo" : "");

  // Meta row
  const meta = document.createElement("div");
  meta.className = "match-meta";

  const round = document.createElement("div");
  round.className = "match-round";
  round.textContent = fmtDate(m.date);
  meta.appendChild(round);

  const badges = document.createElement("div");
  badges.className = "match-badges";
  if (dinamo) {
    badges.appendChild(mkBadge(isDom ? "Domaćin" : "Gost", isDom ? "home" : "away"));
    if (res) badges.appendChild(mkBadge(res.label, res.cls === "win" ? "win" : res.cls === "draw" ? "draw" : "loss"));
  }
  meta.appendChild(badges);
  card.appendChild(meta);

  // Score body
  const body = document.createElement("div");
  body.className = "match-body";

  const home = document.createElement("div");
  home.className = "match-team match-team--home" + (isDom ? " match-team--dinamo" : "");
  home.textContent = m.home_team || "—";

  const score = document.createElement("div");
  score.className = "match-score";
  score.textContent = m.home_score != null
    ? `${m.home_score}:${m.away_score}`
    : "—:—";

  const away = document.createElement("div");
  away.className = "match-team match-team--away" + (isGost ? " match-team--dinamo" : "");
  away.textContent = m.away_team || "—";

  body.appendChild(home);
  body.appendChild(score);
  body.appendChild(away);
  card.appendChild(body);

  return card;
}

/* ── Tablica tab ── */
function buildTablica(comp) {
  if (!comp.standings.length) {
    const d = document.createElement("div");
    d.className = "empty";
    d.textContent = "Nema podataka o tablici.";
    return d;
  }

  const wrap = document.createElement("div");
  wrap.className = "standings-card";

  const table = document.createElement("table");
  table.className = "standings-table";
  table.innerHTML = `
    <thead>
      <tr>
        <th>#</th>
        <th class="left">Klub</th>
        <th title="Utakmice">U</th>
        <th title="Pobjede">P</th>
        <th title="Neriješeno">N</th>
        <th title="Izgubili">I</th>
        <th>Bod</th>
      </tr>
    </thead>`;

  const tbody = document.createElement("tbody");
  comp.standings.forEach((row, idx) => {
    const dinamo = isDinamo(row.team);
    const tr = document.createElement("tr");
    if (dinamo) tr.classList.add("dinamo-row");

    const rank = row.rank ?? idx + 1;
    const isTop = rank <= 2;

    tr.innerHTML = `
      <td><span class="rank-num ${isTop ? "rank-num--top" : ""}">${rank}</span></td>
      <td class="left">${esc(row.team ?? "—")}</td>
      <td>${row.played ?? "—"}</td>
      <td>${row.won ?? "—"}</td>
      <td>${row.drawn ?? "—"}</td>
      <td>${row.lost ?? "—"}</td>
      <td class="pts">${row.points ?? "—"}</td>`;

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

/* ── Raspored tab ── */
function buildRaspored(comp) {
  const frag = document.createDocumentFragment();

  const upcoming = comp.matches
    .filter(m => m.status === "upcoming" && (isDinamo(m.home_team) || isDinamo(m.away_team)))
    .slice()
    .sort((a, b) => parseDateStr(a.date) - parseDateStr(b.date));

  if (!upcoming.length) {
    const d = document.createElement("div");
    d.className = "empty";
    d.textContent = "Nema nadolazećih utakmica.";
    frag.appendChild(d);
    return frag;
  }

  let isFirst = true;
  upcoming.forEach(m => {
    frag.appendChild(scheduleCard(m, isFirst));
    isFirst = false;
  });

  return frag;
}

function scheduleCard(m, isNext) {
  const isDom  = isDinamo(m.home_team);
  const isGost = isDinamo(m.away_team);
  const dinamo = isDom || isGost;

  const card = document.createElement("div");
  card.className = "schedule-card"
    + (isNext ? " schedule-card--next" : dinamo ? " schedule-card--dinamo" : "");

  if (isNext) {
    const lbl = document.createElement("div");
    lbl.className = "schedule-next-label";
    lbl.textContent = "Sljedeća utakmica";
    card.appendChild(lbl);
  }

  // Meta
  const meta = document.createElement("div");
  meta.className = "schedule-meta";

  const dt = document.createElement("div");
  dt.className = "schedule-datetime";
  dt.innerHTML = `<span>${fmtDate(m.date)}</span>`;
  meta.appendChild(dt);

  const badges = document.createElement("div");
  badges.className = "match-badges";
  if (dinamo) badges.appendChild(mkBadge(isDom ? "Domaćin" : "Gost", isDom ? "home" : "away"));
  meta.appendChild(badges);
  card.appendChild(meta);

  // Body
  const body = document.createElement("div");
  body.className = "schedule-body";

  const home = document.createElement("div");
  home.className = "schedule-team schedule-team--home" + (isDom ? " schedule-team--dinamo" : "");
  home.textContent = m.home_team || "—";

  const vs = document.createElement("div");
  vs.className = "schedule-vs";
  vs.textContent = "vs";

  const away = document.createElement("div");
  away.className = "schedule-team schedule-team--away" + (isGost ? " schedule-team--dinamo" : "");
  away.textContent = m.away_team || "—";

  body.appendChild(home);
  body.appendChild(vs);
  body.appendChild(away);
  card.appendChild(body);

  if (m.venue) {
    const venue = document.createElement("div");
    venue.className = "schedule-venue";
    venue.textContent = m.venue;
    card.appendChild(venue);
  }

  return card;
}

/* ── Helpers ── */
function parseDateStr(d) {
  if (!d) return 0;
  // ISO format: "2026-03-14"
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) return new Date(d).getTime();
  // Croatian format: "31.1.26." or "18.04."
  const parts = d.replace(/\.$/, "").split(".");
  if (parts.length < 2) return 0;
  const day   = parseInt(parts[0], 10) || 1;
  const month = parseInt(parts[1], 10) || 1;
  const yr    = parts[2] !== undefined ? parseInt(parts[2], 10) : new Date().getFullYear() % 100;
  const year  = yr < 50 ? 2000 + yr : 1900 + yr;
  return new Date(year, month - 1, day).getTime();
}

function fmtDate(d) {
  if (!d) return "—";
  // ISO format: convert to "14. 3. 2026."
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) {
    const dt = new Date(d);
    return `${dt.getDate()}. ${dt.getMonth() + 1}. ${dt.getFullYear()}.`;
  }
  return d;
}

function isDinamo(name) {
  if (!name) return false;
  const n = name.toLowerCase();
  return CLUB_KEYWORDS.some(k => n.includes(k));
}

function matchResult(m) {
  const isDom = isDinamo(m.home_team);
  const myScore  = isDom ? m.home_score : m.away_score;
  const oppScore = isDom ? m.away_score : m.home_score;
  if (myScore == null) return { label: "—", cls: "loss" };
  if (myScore > oppScore)  return { label: "P", cls: "win" };
  if (myScore === oppScore) return { label: "N", cls: "draw" };
  return { label: "I", cls: "loss" };
}

function mkBadge(text, type) {
  const b = document.createElement("span");
  b.className = `badge badge--${type}`;
  b.textContent = text;
  return b;
}

function updateMeta() {
  const comp = allData[activeAge];
  const el = document.getElementById("last-updated");
  if (comp?.last_updated) {
    const d = new Date(comp.last_updated);
    el.textContent = d.toLocaleTimeString("hr-HR");
  } else {
    el.textContent = "Još nije osvježeno";
  }
}

function showLoading(show) {
  document.getElementById("loading").classList.toggle("hidden", !show);
}
function showError(msg) {
  const el = document.getElementById("error");
  el.textContent = msg;
  el.classList.remove("hidden");
}
function hideError() {
  document.getElementById("error").classList.add("hidden");
}
function esc(str) {
  return String(str)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ── Auto-refresh svake 5 min ── */
setInterval(loadData, 5 * 60 * 1000);
