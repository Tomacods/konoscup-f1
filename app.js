// KonosCup · F1 25 — tracker de campeonato
// Datos en Firestore (konoscup/v1). Lectura pública, escritura solo para admins logueados.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

/* ============================================================
   1. CONFIGURACIÓN
   ============================================================ */

const firebaseConfig = {
  apiKey: "AIzaSyDA7EzLZo7n_Gke-AzjNu3zJRPCx__n8Hc",
  authDomain: "konoscup-f1.firebaseapp.com",
  projectId: "konoscup-f1",
  storageBucket: "konoscup-f1.firebasestorage.app",
  messagingSenderId: "474297070575",
  appId: "1:474297070575:web:885ef9a3178f713efbfc1a"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const DOC_REF = doc(db, "konoscup", "v1");

/* ============================================================
   2. DATOS BASE
   ============================================================ */

const TEAMS = [
  { name: "McLaren",      color: "#FF8000" },
  { name: "Ferrari",      color: "#E8002D" },
  { name: "Red Bull",     color: "#3671C6" },
  { name: "Mercedes",     color: "#27F4D2" },
  { name: "Aston Martin", color: "#229971" },
  { name: "Alpine",       color: "#0093CC" },
  { name: "Haas",         color: "#B6BABD" },
  { name: "Racing Bulls", color: "#6692FF" },
  { name: "Williams",     color: "#64C4FF" },
  { name: "Kick Sauber",  color: "#52E252" }
];

// Calendario oficial 2025: 24 fechas, sprint en China, Miami, Bélgica, Austin, Brasil y Qatar.
const RACES = [
  { name: "Australia",        code: "MEL",  flag: "🇦🇺", sprint: false },
  { name: "China",            code: "SHA",  flag: "🇨🇳", sprint: true  },
  { name: "Japón",            code: "SUZ",  flag: "🇯🇵", sprint: false },
  { name: "Baréin",           code: "SAK",  flag: "🇧🇭", sprint: false },
  { name: "Arabia Saudita",   code: "JED",  flag: "🇸🇦", sprint: false },
  { name: "Miami",            code: "MIA",  flag: "🇺🇸", sprint: true  },
  { name: "Emilia-Romaña",    code: "IMO",  flag: "🇮🇹", sprint: false },
  { name: "Mónaco",           code: "MON",  flag: "🇲🇨", sprint: false },
  { name: "España",           code: "BCN",  flag: "🇪🇸", sprint: false },
  { name: "Canadá",           code: "MTL",  flag: "🇨🇦", sprint: false },
  { name: "Austria",          code: "SPI",  flag: "🇦🇹", sprint: false },
  { name: "Gran Bretaña",     code: "SIL",  flag: "🇬🇧", sprint: false },
  { name: "Bélgica",          code: "SPA",  flag: "🇧🇪", sprint: true  },
  { name: "Hungría",          code: "BUD",  flag: "🇭🇺", sprint: false },
  { name: "Países Bajos",     code: "ZAN",  flag: "🇳🇱", sprint: false },
  { name: "Italia",           code: "MNZ",  flag: "🇮🇹", sprint: false },
  { name: "Azerbaiyán",       code: "BAK",  flag: "🇦🇿", sprint: false },
  { name: "Singapur",         code: "SIN",  flag: "🇸🇬", sprint: false },
  { name: "Estados Unidos",   code: "COTA", flag: "🇺🇸", sprint: true  },
  { name: "México",           code: "MEX",  flag: "🇲🇽", sprint: false },
  { name: "Brasil",           code: "INT",  flag: "🇧🇷", sprint: true  },
  { name: "Las Vegas",        code: "LVG",  flag: "🇺🇸", sprint: false },
  { name: "Qatar",            code: "LUS",  flag: "🇶🇦", sprint: true  },
  { name: "Abu Dabi",         code: "YAS",  flag: "🇦🇪", sprint: false }
];

const DEFAULT_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];   // sin punto por vuelta rápida (regla 2025)
const DEFAULT_SPRINT_POINTS = [8, 7, 6, 5, 4, 3, 2, 1];
const MAX_POS = 20;

const DEFAULT_DRIVERS = [
  { id: "d1", name: "Tomacods",   team: "McLaren",  adj: 0 },
  { id: "d2", name: "Cesarmi13",  team: "Ferrari",  adj: 0 },
  { id: "d3", name: "Facuzera",   team: "Alpine",   adj: 0 },
  { id: "d4", name: "SoloLuko",   team: "Red Bull", adj: 0 },
  { id: "d5", name: "lucasbenax", team: "McLaren",  adj: 0 },
  { id: "d6", name: "chinaty11",  team: "Red Bull", adj: 0 },
  { id: "d7", name: "Boy-Jager",  team: "Ferrari",  adj: 0 }
];

/* ============================================================
   3. ESTADO
   ============================================================ */

let state = null;
let isAdmin = false;
let openRaceIndex = null;

function emptyState() {
  return {
    drivers: DEFAULT_DRIVERS.map(d => ({ ...d })),
    results: {},
    sprints: {},
    poles: {},
    fastest: {},
    points: [...DEFAULT_POINTS],
    sprintPoints: [...DEFAULT_SPRINT_POINTS],
    updatedAt: null
  };
}

// Acepta documentos viejos (que sólo tenían drivers/results/points) sin romperse.
function normalize(raw) {
  const base = emptyState();
  if (!raw || typeof raw !== "object") return base;

  const drivers = Array.isArray(raw.drivers) && raw.drivers.length
    ? raw.drivers.map((d, i) => ({
        id: String(d.id || `d${i + 1}`),
        name: String(d.name || `Piloto ${i + 1}`),
        team: String(d.team || TEAMS[0].name),
        adj: Number(d.adj) || 0
      }))
    : base.drivers;

  const cleanPosMap = (src) => {
    const out = {};
    if (!src || typeof src !== "object") return out;
    for (const [driverId, races] of Object.entries(src)) {
      if (!races || typeof races !== "object") continue;
      const inner = {};
      for (const [idx, pos] of Object.entries(races)) {
        const n = Number(pos);
        if (Number.isInteger(n) && n >= 1 && n <= MAX_POS) inner[String(idx)] = n;
      }
      if (Object.keys(inner).length) out[driverId] = inner;
    }
    return out;
  };

  const cleanHonors = (src) => {
    const out = {};
    if (!src || typeof src !== "object") return out;
    for (const [idx, driverId] of Object.entries(src)) {
      if (driverId && drivers.some(d => d.id === driverId)) out[String(idx)] = driverId;
    }
    return out;
  };

  const cleanScale = (src, fallback) =>
    Array.isArray(src) && src.length === fallback.length && src.every(n => typeof n === "number")
      ? [...src]
      : [...fallback];

  return {
    drivers,
    results: cleanPosMap(raw.results),
    sprints: cleanPosMap(raw.sprints),
    poles: cleanHonors(raw.poles),
    fastest: cleanHonors(raw.fastest),
    points: cleanScale(raw.points, DEFAULT_POINTS),
    sprintPoints: cleanScale(raw.sprintPoints, DEFAULT_SPRINT_POINTS),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : null
  };
}

/* ============================================================
   4. CÁLCULO DEL CAMPEONATO
   ============================================================ */

const teamColor = (name) => TEAMS.find(t => t.name === name)?.color || "#8B93AD";
const posOf     = (map, id, i) => (map[id] && map[id][String(i)]) || null;
const racePts   = (pos) => (pos >= 1 && pos <= state.points.length ? state.points[pos - 1] : 0);
const sprintPts = (pos) => (pos >= 1 && pos <= state.sprintPoints.length ? state.sprintPoints[pos - 1] : 0);

function pointsForRound(driverId, i) {
  const gp = posOf(state.results, driverId, i);
  const sp = posOf(state.sprints, driverId, i);
  return (gp ? racePts(gp) : 0) + (sp ? sprintPts(sp) : 0);
}

function getStandings() {
  const rows = state.drivers.map(d => {
    const perRound = RACES.map((_, i) => pointsForRound(d.id, i));
    const finishes = {};
    let raced = 0, poles = 0, fastest = 0, podiums = 0;

    RACES.forEach((_, i) => {
      const gp = posOf(state.results, d.id, i);
      if (gp) {
        raced++;
        finishes[gp] = (finishes[gp] || 0) + 1;
        if (gp <= 3) podiums++;
      }
      if (state.poles[String(i)] === d.id) poles++;
      if (state.fastest[String(i)] === d.id) fastest++;
    });

    const base = perRound.reduce((a, b) => a + b, 0);
    const adj = Number(d.adj) || 0;
    return {
      ...d, adj, perRound, finishes, raced, poles, fastest, podiums,
      wins: finishes[1] || 0,
      base,
      total: base + adj
    };
  });

  // Desempate: puntos, después countback (más 1os, más 2os, …), después nombre.
  rows.sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    for (let p = 1; p <= MAX_POS; p++) {
      const ca = a.finishes[p] || 0, cb = b.finishes[p] || 0;
      if (cb !== ca) return cb - ca;
    }
    return a.name.localeCompare(b.name);
  });
  return rows;
}

function getConstructors(standings) {
  const byTeam = new Map();
  for (const r of standings) {
    if (!byTeam.has(r.team)) byTeam.set(r.team, { team: r.team, drivers: [], total: 0, wins: 0 });
    const t = byTeam.get(r.team);
    t.drivers.push(r);
    t.total += r.total;
    t.wins += r.wins;
  }
  const rows = [...byTeam.values()].map(t => ({
    ...t,
    count: t.drivers.length,
    average: t.drivers.length ? Math.round((t.total / t.drivers.length) * 10) / 10 : 0
  }));
  rows.sort((a, b) => b.total - a.total || b.wins - a.wins || a.team.localeCompare(b.team));
  return rows;
}

const roundHasData = (i) =>
  state.drivers.some(d => posOf(state.results, d.id, i) || posOf(state.sprints, d.id, i));

const doneRounds = () => RACES.filter((_, i) => roundHasData(i)).length;

/* ============================================================
   5. RENDER
   ============================================================ */

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function render() {
  if (!state) return;
  const standings = getStandings();
  const done = doneRounds();

  $("#subtitle").textContent = `${done} de ${RACES.length} fechas corridas`;
  $("#updatedAt").textContent = state.updatedAt
    ? `Última carga: ${new Date(state.updatedAt).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}`
    : "Sin resultados cargados todavía";

  renderDrivers(standings);
  renderConstructors(getConstructors(standings));
  renderCalendar(standings);
  renderMatrix(standings);
}

function renderDrivers(rows) {
  if (!rows.length) { $("#driversTable").innerHTML = `<div class="empty">No hay pilotos cargados.</div>`; return; }
  const leader = rows[0].total;

  $("#driversTable").innerHTML = `
    <table>
      <thead>
        <tr>
          <th class="col-pos">#</th>
          <th>Piloto</th>
          <th class="hide-sm">Carreras</th>
          <th class="hide-sm">Récord</th>
          <th style="text-align:right">Puntos</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((r, i) => `
          <tr class="${i === 0 ? "leader" : ""}">
            <td class="col-pos">${i + 1}</td>
            <td>
              <div class="entrant">
                <span class="team-bar" style="background:${teamColor(r.team)}"></span>
                <div>
                  <div class="entrant-name">${esc(r.name)}</div>
                  <div class="entrant-team">${esc(r.team)}</div>
                </div>
              </div>
            </td>
            <td class="hide-sm num">${r.raced}</td>
            <td class="hide-sm">
              ${r.wins ? `<span class="chip gold">🏆 ${r.wins}</span>` : ""}
              ${r.podiums ? `<span class="chip">P3+ ${r.podiums}</span>` : ""}
              ${r.poles ? `<span class="chip">POLE ${r.poles}</span>` : ""}
              ${r.fastest ? `<span class="chip">VR ${r.fastest}</span>` : ""}
              ${r.adj ? `<span class="chip">AJ ${r.adj > 0 ? "+" : ""}${r.adj}</span>` : ""}
              ${!r.wins && !r.podiums && !r.poles && !r.fastest && !r.adj ? `<span class="gap">—</span>` : ""}
            </td>
            <td class="col-pts">
              ${r.total}
              ${i > 0 ? `<div class="gap">-${leader - r.total}</div>` : ""}
            </td>
          </tr>`).join("")}
      </tbody>
    </table>`;
}

function renderConstructors(rows) {
  if (!rows.length) { $("#teamsTable").innerHTML = `<div class="empty">Sin equipos.</div>`; return; }

  $("#teamsTable").innerHTML = `
    <table>
      <thead>
        <tr>
          <th class="col-pos">#</th>
          <th>Equipo</th>
          <th class="hide-sm">Pilotos</th>
          <th class="hide-sm" style="text-align:right">Promedio</th>
          <th style="text-align:right">Puntos</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((t, i) => `
          <tr class="${i === 0 ? "leader" : ""}">
            <td class="col-pos">${i + 1}</td>
            <td>
              <div class="entrant">
                <span class="team-bar" style="background:${teamColor(t.team)}"></span>
                <div>
                  <div class="entrant-name">${esc(t.team)}</div>
                  <div class="entrant-team">${t.drivers.map(d => esc(d.name)).join(" · ")}</div>
                </div>
              </div>
            </td>
            <td class="hide-sm num">${t.count}</td>
            <td class="hide-sm num">${t.average}</td>
            <td class="col-pts">${t.total}</td>
          </tr>`).join("")}
      </tbody>
    </table>`;
}

function renderCalendar(standings) {
  const nameOf = (id) => state.drivers.find(d => d.id === id)?.name || "—";

  $("#calendarHint").textContent = isAdmin
    ? "Tocá una fecha para cargar los resultados"
    : "Tocá una fecha para ver los resultados";

  $("#raceGrid").innerHTML = RACES.map((race, i) => {
    const has = roundHasData(i);
    let winner = null;
    if (has) {
      const w = standings.find(d => posOf(state.results, d.id, i) === 1);
      winner = w ? w.name : null;
    }
    return `
      <button class="race-card ${has ? "done" : ""}" data-race="${i}">
        <div class="race-top">
          <span class="race-round">R${String(i + 1).padStart(2, "0")}</span>
          ${race.sprint ? `<span class="sprint-tag">SPRINT</span>` : ""}
        </div>
        <div class="race-name">${race.flag} ${esc(race.name)}</div>
        ${has
          ? `<div class="race-winner">${winner ? `🏆 <b>${esc(winner)}</b>` : "Cargada"}</div>`
          : `<div class="pending">Sin correr</div>`}
      </button>`;
  }).join("");

  $("#raceGrid").querySelectorAll("[data-race]").forEach(btn => {
    btn.addEventListener("click", () => openRaceModal(Number(btn.dataset.race)));
  });
}

function renderMatrix(rows) {
  if (!rows.length) { $("#matrixTable").innerHTML = `<div class="empty">Sin datos.</div>`; return; }

  $("#matrixTable").innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Piloto</th>
          ${RACES.map((r, i) => `<th style="text-align:right" title="${esc(r.name)}">${r.code}${r.sprint ? "*" : ""}</th>`).join("")}
          <th style="text-align:right">Total</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td><div class="entrant">
              <span class="team-bar" style="background:${teamColor(r.team)}"></span>
              <span class="entrant-name">${esc(r.name)}</span>
            </div></td>
            ${r.perRound.map((p, i) => `<td class="num ${p ? "" : "zero"}">${roundHasData(i) ? p : "·"}</td>`).join("")}
            <td class="num total">${r.total}</td>
          </tr>`).join("")}
      </tbody>
    </table>
    <p class="foot-note" style="padding:0 .75rem .75rem">* fecha con sprint. Los puntos de la fecha incluyen carrera + sprint. El ajuste manual está sumado en el total.</p>`;
}

/* ============================================================
   6. MODAL DE FECHA
   ============================================================ */

function posOptions(selected) {
  let out = `<option value="">—</option>`;
  for (let p = 1; p <= MAX_POS; p++) {
    out += `<option value="${p}" ${selected === p ? "selected" : ""}>P${p}</option>`;
  }
  return out;
}

function driverOptions(selected) {
  return `<option value="">—</option>` + state.drivers
    .map(d => `<option value="${d.id}" ${selected === d.id ? "selected" : ""}>${esc(d.name)}</option>`)
    .join("");
}

function openRaceModal(i) {
  openRaceIndex = i;
  const race = RACES[i];
  $("#raceModalTitle").innerHTML =
    `${race.flag} ${esc(race.name)} <span class="race-round">· R${i + 1}${race.sprint ? " · Sprint" : ""}</span>`;

  const body = $("#raceModalBody");

  if (!isAdmin) {
    const finished = state.drivers
      .map(d => ({ d, gp: posOf(state.results, d.id, i), sp: posOf(state.sprints, d.id, i) }))
      .filter(x => x.gp || x.sp)
      .sort((a, b) => (a.gp || 99) - (b.gp || 99));

    body.innerHTML = finished.length ? `
      <div class="editor-row editor-head ${race.sprint ? "has-sprint" : ""}">
        <span>Piloto</span><span>Carrera</span>${race.sprint ? "<span>Sprint</span>" : ""}<span>Puntos</span>
      </div>
      ${finished.map(({ d, gp, sp }) => `
        <div class="editor-row ${race.sprint ? "has-sprint" : ""}">
          <div class="entrant">
            <span class="team-bar" style="background:${teamColor(d.team)}"></span>
            <span class="entrant-name">${esc(d.name)}</span>
          </div>
          <div class="num">${gp ? "P" + gp : "—"}</div>
          ${race.sprint ? `<div class="num">${sp ? "P" + sp : "—"}</div>` : ""}
          <div class="num">${pointsForRound(d.id, i)}</div>
        </div>`).join("")}
      <p class="muted">
        Pole: <b>${esc(state.drivers.find(d => d.id === state.poles[String(i)])?.name || "—")}</b> ·
        Vuelta rápida: <b>${esc(state.drivers.find(d => d.id === state.fastest[String(i)])?.name || "—")}</b>
      </p>`
      : `<div class="empty">Esta fecha todavía no se corrió.</div>`;

    $("#saveRaceBtn").hidden = true;
    $("#clearRaceBtn").hidden = true;
  } else {
    body.innerHTML = `
      <div class="editor-row editor-head ${race.sprint ? "has-sprint" : ""}">
        <span>Piloto</span><span>Carrera</span>${race.sprint ? "<span>Sprint</span>" : ""}<span>Puntos</span>
      </div>
      ${state.drivers.map(d => `
        <div class="editor-row ${race.sprint ? "has-sprint" : ""}" data-driver="${d.id}">
          <div class="entrant">
            <span class="team-bar" style="background:${teamColor(d.team)}"></span>
            <span class="entrant-name">${esc(d.name)}</span>
          </div>
          <select data-kind="gp">${posOptions(posOf(state.results, d.id, i))}</select>
          ${race.sprint ? `<select data-kind="sp">${posOptions(posOf(state.sprints, d.id, i))}</select>` : ""}
          <div class="num" data-preview>${pointsForRound(d.id, i)}</div>
        </div>`).join("")}
      <div class="honor-row">
        <label class="field"><span>Pole position</span>
          <select id="poleSelect">${driverOptions(state.poles[String(i)])}</select></label>
        <label class="field"><span>Vuelta rápida</span>
          <select id="flSelect">${driverOptions(state.fastest[String(i)])}</select></label>
      </div>
      <p class="muted">Los puntos salen de la posición real en el juego: ${state.points.join("-")} para la carrera${race.sprint ? `, ${state.sprintPoints.join("-")} para el sprint` : ""}. Pole y vuelta rápida quedan sólo como estadística.</p>`;

    $("#saveRaceBtn").hidden = false;
    $("#clearRaceBtn").hidden = false;
    body.querySelectorAll("select[data-kind]").forEach(sel => sel.addEventListener("change", updateRacePreview));
    updateRacePreview();
  }

  $("#raceModal").hidden = false;
}

function updateRacePreview() {
  const race = RACES[openRaceIndex];
  $("#raceModalBody").querySelectorAll("[data-driver]").forEach(row => {
    const gp = Number(row.querySelector('[data-kind="gp"]').value) || 0;
    const spSel = row.querySelector('[data-kind="sp"]');
    const sp = spSel ? Number(spSel.value) || 0 : 0;
    row.querySelector("[data-preview]").textContent =
      (gp ? racePts(gp) : 0) + (race.sprint && sp ? sprintPts(sp) : 0);
  });
}

function collectRaceEdits() {
  const i = String(openRaceIndex);
  const next = structuredClone(state);

  $("#raceModalBody").querySelectorAll("[data-driver]").forEach(row => {
    const id = row.dataset.driver;
    const gp = Number(row.querySelector('[data-kind="gp"]').value) || 0;
    const spSel = row.querySelector('[data-kind="sp"]');
    const sp = spSel ? Number(spSel.value) || 0 : 0;

    setPos(next.results, id, i, gp);
    setPos(next.sprints, id, i, sp);
  });

  const pole = $("#poleSelect").value;
  const fl = $("#flSelect").value;
  if (pole) next.poles[i] = pole; else delete next.poles[i];
  if (fl) next.fastest[i] = fl; else delete next.fastest[i];

  return next;
}

function setPos(map, driverId, raceKey, pos) {
  if (pos >= 1 && pos <= MAX_POS) {
    if (!map[driverId]) map[driverId] = {};
    map[driverId][raceKey] = pos;
  } else if (map[driverId]) {
    delete map[driverId][raceKey];
    if (!Object.keys(map[driverId]).length) delete map[driverId];
  }
}

function clearRace() {
  const i = String(openRaceIndex);
  const next = structuredClone(state);
  for (const id of Object.keys(next.results)) setPos(next.results, id, i, 0);
  for (const id of Object.keys(next.sprints)) setPos(next.sprints, id, i, 0);
  delete next.poles[i];
  delete next.fastest[i];
  return next;
}

/* ============================================================
   7. MODAL DE PILOTOS
   ============================================================ */

function openDriversModal() {
  renderDriversModal(state.drivers.map(d => ({ ...d })));
  $("#driversModal").hidden = false;
}

function renderDriversModal(list) {
  $("#driversModalBody").innerHTML = `
    <div class="driver-edit-row editor-head">
      <span>Nombre</span><span>Auto</span><span>Ajuste</span><span></span>
    </div>
    ${list.map((d, idx) => `
      <div class="driver-edit-row" data-row="${idx}" data-id="${esc(d.id)}">
        <input type="text" data-f="name" value="${esc(d.name)}" placeholder="Nombre en Racenet">
        <select data-f="team">
          ${TEAMS.map(t => `<option value="${t.name}" ${t.name === d.team ? "selected" : ""}>${t.name}</option>`).join("")}
        </select>
        <input type="number" data-f="adj" value="${Number(d.adj) || 0}" step="1">
        <button class="icon-btn" data-remove="${idx}" title="Sacar piloto">🗑</button>
      </div>`).join("")}
    <p class="muted">El ajuste suma o resta puntos a mano (penalizaciones, bonus, lo que arreglen entre ustedes). Si sacás un piloto también se borran sus resultados.</p>`;

  $("#driversModalBody").querySelectorAll("[data-remove]").forEach(btn => {
    btn.addEventListener("click", () => {
      const current = readDriversModal();
      current.splice(Number(btn.dataset.remove), 1);
      renderDriversModal(current);
    });
  });
}

function readDriversModal() {
  return [...$("#driversModalBody").querySelectorAll("[data-row]")].map(row => ({
    id: row.dataset.id,
    name: row.querySelector('[data-f="name"]').value.trim() || "Sin nombre",
    team: row.querySelector('[data-f="team"]').value,
    adj: Number(row.querySelector('[data-f="adj"]').value) || 0
  }));
}

function collectDriverEdits() {
  const drivers = readDriversModal();
  const next = structuredClone(state);
  next.drivers = drivers;

  // Limpiar resultados de pilotos que ya no están.
  const ids = new Set(drivers.map(d => d.id));
  for (const map of [next.results, next.sprints]) {
    for (const id of Object.keys(map)) if (!ids.has(id)) delete map[id];
  }
  for (const map of [next.poles, next.fastest]) {
    for (const [k, v] of Object.entries(map)) if (!ids.has(v)) delete map[k];
  }
  return next;
}

/* ============================================================
   8. PERSISTENCIA
   ============================================================ */

async function save(next) {
  if (!isAdmin) { toast("Necesitás entrar en modo admin", true); return false; }
  const payload = {
    drivers: next.drivers,
    results: next.results,
    sprints: next.sprints,
    poles: next.poles,
    fastest: next.fastest,
    points: next.points,
    sprintPoints: next.sprintPoints,
    updatedAt: new Date().toISOString(),
    updatedBy: auth.currentUser?.email || "admin",
    savedAt: serverTimestamp()
  };
  try {
    await setDoc(DOC_REF, payload);
    toast("Guardado");
    return true;
  } catch (err) {
    console.error(err);
    toast("No se pudo guardar: " + err.message, true);
    return false;
  }
}

function setSync(text, kind) {
  const el = $("#syncBadge");
  el.textContent = text;
  el.dataset.state = kind;
}

let toastTimer = null;
function toast(msg, isError = false) {
  const el = $("#toast");
  el.textContent = msg;
  el.className = "toast" + (isError ? " error" : "");
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, isError ? 6000 : 2500);
}

/* ============================================================
   9. EVENTOS
   ============================================================ */

// Tabs
$("#tabs").addEventListener("click", (e) => {
  const tab = e.target.closest(".tab");
  if (!tab) return;
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("is-active", t === tab));
  document.querySelectorAll(".view").forEach(v =>
    v.classList.toggle("is-active", v.id === `view-${tab.dataset.tab}`));
});

// Cerrar modales
document.querySelectorAll(".modal-backdrop").forEach(back => {
  back.addEventListener("click", (e) => {
    if (e.target === back || e.target.closest("[data-close]")) back.hidden = true;
  });
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") document.querySelectorAll(".modal-backdrop").forEach(m => m.hidden = true);
});

// Admin: entrar / salir
$("#adminBtn").addEventListener("click", async () => {
  if (isAdmin) {
    await signOut(auth);
    toast("Saliste del modo admin");
  } else {
    $("#loginError").hidden = true;
    $("#loginModal").hidden = false;
    $("#loginEmail").focus();
  }
});

$("#loginSubmit").addEventListener("click", doLogin);
$("#loginPass").addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });

async function doLogin() {
  const email = $("#loginEmail").value.trim();
  const pass = $("#loginPass").value;
  const err = $("#loginError");
  err.hidden = true;

  if (!email || !pass) { err.textContent = "Completá email y contraseña."; err.hidden = false; return; }

  $("#loginSubmit").disabled = true;
  try {
    await signInWithEmailAndPassword(auth, email, pass);
    $("#loginModal").hidden = true;
    $("#loginPass").value = "";
    toast("Modo admin activado");
  } catch (e2) {
    const map = {
      "auth/invalid-credential": "Email o contraseña incorrectos.",
      "auth/invalid-email": "Ese email no tiene formato válido.",
      "auth/user-not-found": "No existe esa cuenta.",
      "auth/wrong-password": "Contraseña incorrecta.",
      "auth/too-many-requests": "Demasiados intentos. Esperá un rato.",
      "auth/operation-not-allowed": "Falta habilitar el login por email en la consola de Firebase."
    };
    err.textContent = map[e2.code] || e2.message;
    err.hidden = false;
  } finally {
    $("#loginSubmit").disabled = false;
  }
}

// Guardar fecha
$("#saveRaceBtn").addEventListener("click", async () => {
  const next = collectRaceEdits();
  if (await save(next)) $("#raceModal").hidden = true;
});

$("#clearRaceBtn").addEventListener("click", async () => {
  const next = clearRace();
  if (await save(next)) $("#raceModal").hidden = true;
});

// Pilotos
$("#editDriversBtn").addEventListener("click", openDriversModal);

$("#addDriverBtn").addEventListener("click", () => {
  const current = readDriversModal();
  current.push({ id: "d" + Date.now().toString(36), name: "", team: TEAMS[0].name, adj: 0 });
  renderDriversModal(current);
});

$("#saveDriversBtn").addEventListener("click", async () => {
  const next = collectDriverEdits();
  if (!next.drivers.length) { toast("Dejá al menos un piloto", true); return; }
  if (await save(next)) $("#driversModal").hidden = true;
});

/* ============================================================
   10. ARRANQUE
   ============================================================ */

onAuthStateChanged(auth, (user) => {
  isAdmin = !!user;
  $("#adminBtn").textContent = isAdmin ? "Salir de admin" : "Modo admin";
  document.querySelectorAll(".admin-only").forEach(el => { el.hidden = !isAdmin; });
  if (state) render();
});

async function init() {
  try {
    const snap = await getDoc(DOC_REF);
    state = normalize(snap.exists() ? snap.data() : null);
    setSync(snap.exists() ? "En vivo" : "Sin datos", "ok");
    render();
  } catch (err) {
    console.error(err);
    state = emptyState();
    setSync("Sin conexión", "error");
    render();
    toast("No se pudo leer Firestore: " + err.message, true);
    return;
  }

  onSnapshot(DOC_REF, (snap) => {
    if (!snap.exists()) return;
    state = normalize(snap.data());
    setSync("En vivo", "ok");
    render();
  }, (err) => {
    console.error(err);
    setSync("Sin conexión", "error");
  });
}

init();
