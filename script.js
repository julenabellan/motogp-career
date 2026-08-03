// ============================================================
// SCRIPT.JS — Lógica del simulador de carrera MotoGP
// ============================================================

const STORAGE_KEY = "motogpCareerState";
const RETIRE_MIN_AGE = 33;
const MAX_AGE = 38;

// Pelotón de cada categoría: nivel medio y variabilidad de los rivales.
// Cuanto más alta la categoría, más alto (y más apretado) es el nivel medio
// del pelotón — por eso el mismo OVR rinde mucho menos en una categoría
// superior y hace falta subir de verdad para seguir ganando.
const FIELD = {
  Moto3:      { mean: 58, sd: 13 },
  Moto2:      { mean: 68, sd: 13 },
  MotoGP:     { mean: 82, sd: 11 },
  Supersport: { mean: 64, sd: 12 },
  WorldSBK:   { mean: 76, sd: 11 },
};
const GRID_RIVALS = 23; // resto de la parrilla (24 pilotos en total en el campeonato)

// Ruido "casi normal" (suma de 3 uniformes) para resultados de carrera.
function noise(sd) { return sd * ((Math.random() + Math.random() + Math.random() - 1.5) / 1.5); }

let draft = { apellido: "", numero: null, mano: "Izquierda", nacionalidad: null };
let state = null; // estado de partida en curso

// ---------------- Utilidades ----------------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function showScreen(id) {
  $$(".screen").forEach((s) => s.classList.remove("active"));
  $(`#${id}`).classList.add("active");
}

function rand(min, max) { return Math.random() * (max - min) + min; }
function randInt(min, max) { return Math.floor(rand(min, max + 1)); }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }

// ---------------- Confirmación dentro del juego ----------------
// Sustituye a window.confirm(): un modal propio, con el mismo estilo que
// el resto de la app, en vez del cuadro de diálogo nativo del navegador.
function showConfirm(message, onConfirm) {
  const overlay = $("#confirm-modal");
  $("#confirm-modal-text").textContent = message;
  overlay.classList.add("active");

  const accept = $("#confirm-modal-accept");
  const cancel = $("#confirm-modal-cancel");

  const cleanup = () => {
    overlay.classList.remove("active");
    accept.removeEventListener("click", onAccept);
    cancel.removeEventListener("click", onCancel);
  };
  const onAccept = () => { cleanup(); onConfirm(); };
  const onCancel = () => { cleanup(); };

  accept.addEventListener("click", onAccept);
  cancel.addEventListener("click", onCancel);
}

// Color del recuadro OVR: por RANGOS FIJOS, no por degradado. El color
// cambia de golpe en cuanto el OVR entra en el siguiente tramo.
//   40-69 naranja · 70-79 azul · 80-89 amarillo/dorado · 90-99 morado
const OVR_COLOR_RANGES = [
  { min: 90, color: "var(--purple)" },
  { min: 80, color: "var(--yellow)" },
  { min: 70, color: "var(--blue)" },
  { min: 0,  color: "var(--orange)" },
];
function ovrColor(ovr) {
  return OVR_COLOR_RANGES.find((r) => ovr >= r.min).color;
}


// ============================================================
// PANTALLA 1: IDENTIDAD
// ============================================================
$("#bike-surname").textContent = "APELLIDO";

$("#input-apellido").addEventListener("input", (e) => {
  const v = e.target.value.toUpperCase();
  $("#bike-surname").textContent = v || "APELLIDO";
});
$("#input-numero").addEventListener("input", (e) => {
  let v = e.target.value.replace(/\D/g, "");
  if (v) v = clamp(parseInt(v), 1, 99);
  $("#bike-number").textContent = v ? String(v).padStart(2, "0") : "00";
});

$("#mano-toggle").addEventListener("click", (e) => {
  const btn = e.target.closest(".toggle-btn");
  if (!btn) return;
  $$("#mano-toggle .toggle-btn").forEach((b) => b.classList.remove("selected"));
  btn.classList.add("selected");
  draft.mano = btn.dataset.value;
});

$("#btn-to-nacionalidad").addEventListener("click", () => {
  let apellido = $("#input-apellido").value.trim().toUpperCase();
  let numero = parseInt($("#input-numero").value);
  // Si se deja en blanco, se asignan valores por defecto en vez de
  // bloquear con un alert — útil para probar rápido sin rellenar todo.
  if (!apellido) apellido = "PILOTO";
  if (!numero || numero < 1 || numero > 99) numero = randInt(1, 99);
  draft.apellido = apellido;
  draft.numero = numero;
  $("#bike-surname").textContent = apellido;
  $("#bike-number").textContent = String(numero).padStart(2, "0");
  buildCountryGrid();
  showScreen("screen-nacionalidad");
});

// ============================================================
// PANTALLA 2: NACIONALIDAD
// ============================================================
function buildCountryGrid(filter = "") {
  const grid = $("#country-grid");
  grid.innerHTML = "";
  const f = filter.trim().toLowerCase();
  COUNTRIES
    .filter((c) => c.name.toLowerCase().includes(f))
    .forEach((c) => {
      const el = document.createElement("div");
      el.className = "country-item";
      if (draft.nacionalidad && draft.nacionalidad.code === c.code) el.classList.add("selected");
      el.innerHTML = `${flagImg(c.code)}<span class="country-name">${c.name}</span>`;
      el.addEventListener("click", () => {
        draft.nacionalidad = c;
        $("#btn-to-debut").disabled = false;
        buildCountryGrid($("#input-search-country").value);
      });
      grid.appendChild(el);
    });
}

$("#input-search-country").addEventListener("input", (e) => buildCountryGrid(e.target.value));
$("#btn-back-identidad").addEventListener("click", () => showScreen("screen-identidad"));

$("#btn-to-debut").addEventListener("click", () => {
  buildDebutOffers();
  showScreen("screen-debut");
});

// ============================================================
// PANTALLA 3: DEBUT — primeras 3 ofertas de Moto3
// ============================================================
function buildDebutOffers() {
  const wrap = $("#debut-offers");
  wrap.innerHTML = "";
  const pool = [...TEAMS.Moto3].sort(() => Math.random() - 0.5).slice(0, 3);
  pool.forEach((team) => {
    const card = document.createElement("div");
    card.className = "offer-card";
    card.innerHTML = offerCardHTML(team, "Moto3");
    card.addEventListener("click", () => startCareer(team));
    wrap.appendChild(card);
  });
}

function offerCardHTML(team, champ) {
  const logo = teamLogo(team.name, champ);
  const logoHTML = logo
    ? `<img class="offer-logo" src="${logo}" alt="" loading="lazy" onerror="this.remove()">`
    : "";
  return `
    <div class="offer-top">
      ${logoHTML}
      <span class="offer-team-name">${team.name}</span>
      <span class="offer-champ-badge">${champ}</span>
    </div>
  `;
}

$("#btn-back-nacionalidad").addEventListener("click", () => showScreen("screen-nacionalidad"));

// ============================================================
// PERFIL OCULTO DEL PILOTO
// Al empezar una carrera se genera un perfil que el jugador NUNCA ve.
// Define el techo real del piloto, su ritmo de aprendizaje, su
// regularidad, su capacidad de adaptación y a qué edad rendirá mejor.
// Todo el desarrollo posterior sale de combinar este perfil con los
// resultados en pista y una dosis de azar — no hay una fórmula fija
// que garantice que una buena temporada suba mucho el OVR.
// ============================================================

// Distribución de "tipos" de piloto al nacer. El jugador no sabe nunca
// en qué grupo ha caído: solo lo va intuyendo (o no) según pasan los años.
//  60% normal · 25% muy bueno · 10% con mucho talento ·
//   4% futuro campeón · 1% fenómeno generacional.
const RIDER_TIERS = [
  { key: "normal",        weight: 0.60, potential: [74, 86], learningRate: [0.55, 0.85], breakout: [0.02, 0.05] },
  { key: "muyBueno",      weight: 0.25, potential: [85, 90], learningRate: [0.75, 1.00], breakout: [0.04, 0.08] },
  { key: "talento",       weight: 0.10, potential: [89, 93], learningRate: [0.90, 1.15], breakout: [0.06, 0.11] },
  { key: "futuroCampeon", weight: 0.04, potential: [92, 96], learningRate: [1.05, 1.30], breakout: [0.08, 0.14] },
  { key: "fenomeno",      weight: 0.01, potential: [95, 99], learningRate: [1.20, 1.50], breakout: [0.10, 0.18] },
];

function pickTier() {
  const r = Math.random();
  let acc = 0;
  for (const t of RIDER_TIERS) {
    acc += t.weight;
    if (r <= acc) return t;
  }
  return RIDER_TIERS[0];
}

// Curva de desarrollo: además del techo y el ritmo de aprendizaje, cada
// piloto tiene una forma distinta de recorrer el camino hasta su potencial.
// Unos prometen mucho pronto y se estancan; otros tardan en arrancar y
// acaban explotando más tarde. La mayoría progresa de forma más lineal.
const DEV_CURVES = [
  { key: "precoz",   weight: 0.28 }, // fuerte al principio, se enfría después
  { key: "estandar", weight: 0.44 },
  { key: "tardio",   weight: 0.28 }, // flojo al principio, mejora con los años
];

function pickCurve() {
  const r = Math.random();
  let acc = 0;
  for (const c of DEV_CURVES) {
    acc += c.weight;
    if (r <= acc) return c.key;
  }
  return "estandar";
}

// Multiplicador del ritmo de progresión según la curva y la edad actual.
function curveMultiplier(curve, age) {
  if (curve === "precoz") return age < 22 ? 1.35 : age < 26 ? 1.0 : 0.5;
  if (curve === "tardio") return age < 22 ? 0.55 : age < 26 ? 0.85 : 1.3;
  return 1.0;
}

function generateHiddenProfile() {
  const tier = pickTier();
  return {
    tier: tier.key,                                                  // nunca se muestra al jugador
    potential: randInt(tier.potential[0], tier.potential[1]),         // techo real (oculto)
    learningRate: rand(tier.learningRate[0], tier.learningRate[1]),   // ritmo de aprendizaje
    consistency: rand(0.2, 1.0),                                      // regularidad (1 = muy regular)
    adaptability: rand(0.6, 1.3),                                     // capacidad de adaptación
    // Edad de mejor nivel: lo normal es rendir mejor hasta rondar los 30;
    // solo raramente el pico llega mucho antes o mucho después.
    peakAge: Math.random() < 0.75 ? randInt(28, 31) : randInt(24, 34),
    breakoutChance: rand(tier.breakout[0], tier.breakout[1]),         // prob. de temporada de gran evolución
    curve: pickCurve(),                                               // forma de la progresión a lo largo de la carrera
  };
}

// Pequeños sucesos internos de la temporada que hacen que ninguna carrera
// se sienta igual a otra. Alteran ligeramente el crecimiento anual.
const POSITIVE_EVENTS = [
  { text: "Excelente adaptación a la moto",               bonus: () => rand(2.2, 4.2) },
  { text: "Nuevo ingeniero muy competente",                bonus: () => rand(1.4, 3.0) },
  { text: "Evolución técnica del equipo",                  bonus: () => rand(1.0, 2.4) },
  { text: "Descubrimiento de un nuevo estilo de pilotaje", bonus: () => rand(1.8, 3.6) },
  { text: "Gran confianza durante la temporada",           bonus: () => rand(1.4, 2.8) },
  { text: "Mejor preparación física",                      bonus: () => rand(1.0, 2.0) },
];
const NEGATIVE_EVENTS = [
  { text: "Problemas de adaptación", bonus: () => rand(-3.2, -1.2) },
  { text: "Problemas de confianza",  bonus: () => rand(-2.6, -0.8) },
];

function startCareer(team) {
  const initialOvr = randInt(52, 62);
  const hiddenProfile = generateHiddenProfile();
  state = {
    rider: {
      apellido: draft.apellido,
      numero: draft.numero,
      mano: draft.mano,
      nacionalidad: draft.nacionalidad,
    },
    age: 16,
    ovr: initialOvr,
    potential: hiddenProfile.potential,
    hiddenProfile,
    team: { name: team.name, strength: team.strength },
    championship: "Moto3",
    seasonsInChamp: 0,
    promotionReadyAt: pickPromotionThreshold(),
    history: [],
    seasonNumber: 1,
  };
  saveState();
  showScreen("screen-dashboard");
  simulateSeason(false); // la primera temporada se disputa nada más fichar
}

// ============================================================
// PANTALLA 4: DASHBOARD
// ============================================================
function renderDashboard() {
  const r = state.rider;
  $("#rider-ovr").textContent = state.ovr;
  $("#ovr-box").style.background = ovrColor(state.ovr);
  $("#rider-flag").innerHTML = flagImg(r.nacionalidad.code, "flag-img flag-img-lg");
  $("#rider-name").textContent = r.apellido;
  $("#rider-team").textContent = state.team.name;
  $("#rider-country").textContent = r.nacionalidad.name;
  $("#rider-champ-tag").textContent = state.championship;
  $("#rider-age").textContent = state.age;

  // Recuento de carrera: victorias, podios y títulos conseguidos hasta la
  // última temporada disputada (sustituye al antiguo "Valor" en €).
  const career = state.history.reduce((acc, s) => {
    acc.wins += s.cg; acc.podiums += s.pod;
    if (s.pos === 1) acc.titles += 1;
    return acc;
  }, { wins: 0, podiums: 0, titles: 0 });
  $("#rider-wins").textContent = career.wins;
  $("#rider-podiums").textContent = career.podiums;
  $("#rider-titles").textContent = career.titles;

  renderHistory();
  renderMarket();
  renderChampionBanner();
}

function renderChampionBanner() {
  const banner = $("#champion-banner");
  if (state.justWonChampionship) {
    const { champ, age } = state.justWonChampionship;
    $("#champion-banner-text").textContent = `🏆 ¡Campeón del Mundo de ${champ} a los ${age} años!`;
    banner.classList.add("active");
  } else {
    banner.classList.remove("active");
  }
}

$("#btn-close-banner").addEventListener("click", () => {
  state.justWonChampionship = null;
  saveState();
  renderChampionBanner();
});

// Flechita de comparación de una estadística con la temporada anterior.
// higherIsBetter=false para estadísticas donde menos es mejor (posición).
function trendArrow(curr, prev, higherIsBetter = true) {
  if (prev === undefined || prev === null) return "";
  if (curr === prev) return `<span class="trend trend-same">–</span>`;
  const improved = higherIsBetter ? curr > prev : curr < prev;
  return `<span class="trend ${improved ? "trend-up" : "trend-down"}">${improved ? "▲" : "▼"}</span>`;
}

function renderHistory() {
  const body = $("#history-body");
  body.innerHTML = "";

  // Fila de la temporada actual (aún sin disputar)
  const rows = [...state.history, {
    age: state.age, team: state.team.name, ovr: state.ovr,
    championship: state.championship, disputed: false,
  }];

  rows.forEach((s, idx) => {
    const row = document.createElement("div");
    row.className = "history-row";
    if (!s.disputed) row.classList.add("current");
    else if (s.championship === "MotoGP") row.classList.add("highlight");
    else if (s.championship === "Moto2") row.classList.add("blueish");

    if (!s.disputed) {
      row.innerHTML = `<span><span class="ovr-badge" style="background:${teamColor(s.team, s.championship)}">${s.age}</span></span><span class="not-played">Sin disputar — ${s.team}</span>`;
    } else {
      const posClass = s.pos === 1 ? "pos-badge pos-gold" : s.pos === 2 ? "pos-badge pos-silver" : s.pos === 3 ? "pos-badge pos-bronze" : "";
      const eventDot = s.event ? ` <span class="event-dot" title="${s.event}">✦</span>` : "";
      const titleMark = s.pos === 1 ? ` <span class="title-mark" title="Campeón del Mundo">🏆</span>` : "";

      // Comparación con la temporada anterior (CG/POD/POS), si existe.
      const prev = idx > 0 ? rows[idx - 1] : null;
      const cgTrend = prev ? trendArrow(s.cg, prev.cg, true) : "";
      const podTrend = prev ? trendArrow(s.pod, prev.pod, true) : "";
      const posTrend = prev ? trendArrow(s.pos, prev.pos, false) : "";

      row.innerHTML = `
        <span><span class="ovr-badge" style="background:${teamColor(s.team, s.championship)}">${s.age}</span></span>
        <span class="col-team">${s.team}${titleMark}${eventDot}</span>
        <span><span class="ovr-badge" style="background:${ovrColor(s.ovr)}">${s.ovr}</span></span>
        <span class="stat-cell">${STAT_ICONS.cg}${s.cg}${cgTrend}</span>
        <span class="stat-cell">${STAT_ICONS.pod}${s.pod}${podTrend}</span>
        <span class="stat-cell">${STAT_ICONS.pol}${s.pol}</span>
        <span class="stat-cell">${STAT_ICONS.dnf}${s.dnf}</span>
        <span><span class="${posClass}">${s.pos}</span>${posTrend}</span>
      `;
    }
    body.appendChild(row);
  });

  // scroll al final (temporada actual)
  const table = $("#history-table");
  table.scrollTop = table.scrollHeight;
}

function renderMarket() {
  const wrap = $("#market-offers");
  wrap.innerHTML = "";

  const offers = generateMarketOffers();

  offers.forEach((o) => {
    const card = document.createElement("div");
    card.className = "offer-card" + (o.isCurrent ? " current" : "");
    card.innerHTML = offerCardHTML(o.team, o.championship);
    // Elegir un equipo ficha para la próxima temporada Y la simula al momento.
    card.addEventListener("click", () => {
      const categoryChanged = o.championship !== state.championship || o.team.name !== state.team.name;
      state.team = { name: o.team.name, strength: o.team.strength };
      state.championship = o.championship;
      simulateSeason(categoryChanged);
    });
    wrap.appendChild(card);
  });

  if (state.age >= RETIRE_MIN_AGE) {
    const retireCard = document.createElement("div");
    retireCard.className = "offer-card retire-option";
    retireCard.innerHTML = `
      <div class="offer-top">
        <span class="offer-team-name">Retirarme</span>
        <span class="offer-champ-badge">Fin de carrera</span>
      </div>
    `;
    retireCard.addEventListener("click", () => {
      showConfirm("¿Seguro que quieres retirarte y terminar tu carrera aquí?", () => retireCareer());
    });
    wrap.appendChild(retireCard);
  }
}

// Una temporada se considera "buena" si has demostrado nivel para subir de
// categoría: podios, alguna victoria, o una media de puntos sólida.
function lastSeasonWasGood() {
  const last = state.history[state.history.length - 1];
  if (!last) return false;
  return last.pod >= 3 || last.cg >= 1 || last.pos <= 8;
}

// Cuántas temporadas "toca" quedarse en una categoría antes de que el
// ascenso esté disponible, aunque el rendimiento sea bueno desde el primer
// año. No es una regla fija: la mayoría de pilotos tarda 2-3 temporadas
// (lo habitual en la parrilla real), pero hay una pequeña posibilidad de
// un ascenso relámpago (1) o de asentarse más tiempo de lo normal (4).
function pickPromotionThreshold() {
  const r = Math.random();
  if (r < 0.10) return 1; // ascenso meteórico, poco frecuente
  if (r < 0.55) return 2; // lo más habitual
  if (r < 0.90) return 3; // también muy habitual
  return 4;                // se asienta más de lo normal
}

// Dos temporadas seguidas hundido en la tabla (18º o peor) en la misma
// categoría, habiendo tenido ya tiempo de asentarse (2+ temporadas ahí):
// motivo real para que el mercado te ofrezca bajar de categoría.
function seasonsStuckBadly() {
  const h = state.history;
  if (h.length < 2 || (state.seasonsInChamp || 0) < 2) return false;
  const a = h[h.length - 1], b = h[h.length - 2];
  return a.championship === state.championship && b.championship === state.championship &&
         a.pos >= 18 && b.pos >= 18;
}

// Elige un equipo de un campeonato dentro de un rango de nivel (strength),
// para ofrecer un salto lateral acorde: un equipo "mediano" para un piloto
// de Moto2 a mitad de tabla, uno más top para un buen piloto de MotoGP, o
// uno modesto en Supersport para un piloto de Moto3 que no destaca.
function pickTeamByStrength(championship, minStrength, maxStrength) {
  const all = TEAMS[championship] || [];
  const pool = all.filter((t) => t.strength >= minStrength && t.strength <= maxStrength);
  const list = pool.length ? pool : all;
  return list[randInt(0, list.length - 1)];
}

function generateMarketOffers() {
  const offers = [];
  const currentTeamData = findTeamData(state.team.name, state.championship) ||
    { name: state.team.name, strength: state.team.strength, color: teamColor(state.team.name, state.championship) };

  // Oferta de renovación: SIEMPRE disponible.
  offers.push({ team: currentTeamData, championship: state.championship, isCurrent: true });

  const lastGood = lastSeasonWasGood();
  const lastSeason = state.history[state.history.length - 1];

  // El ascenso de categoría exige, de normal, haber cumplido ya el tiempo
  // "esperado" en la categoría actual (2-3 temporadas lo más habitual, ver
  // pickPromotionThreshold) además de una temporada buena. Una temporada
  // realmente excepcional (título o un aluvión de podios) puede saltarse
  // ese tiempo mínimo, pero solo a veces — así hay sitio tanto para
  // ascensos rápidos como para carreras que se alargan más en la categoría.
  const tenure = state.seasonsInChamp || 1;
  const tenureOk = tenure >= (state.promotionReadyAt || 2);
  const exceptional = lastSeason && (lastSeason.pos === 1 || lastSeason.pod >= 10);

  let targetChamp = null;
  if (lastGood && (tenureOk || (exceptional && Math.random() < 0.25))) {
    if (state.championship === "Moto3") targetChamp = "Moto2";
    else if (state.championship === "Moto2") targetChamp = "MotoGP";
    else if (state.championship === "Supersport") targetChamp = "WorldSBK";
  }

  // Salida lateral a WorldSBK: dos vías distintas.
  //  - Veterano de MotoGP (32+) que ya no está ganando: puede refugiarse en
  //    un equipo de Superbikes acorde a su nivel, en vez de languidecer en
  //    la categoría reina.
  //  - Piloto de Moto2 que se queda a mitad de tabla (4º o peor, sin
  //    ascenso a MotoGP): puede dar el salto a un equipo mediano de
  //    Superbikes como vía alternativa, en vez de estancarse en Moto2.
  let wsbkPick = null;
  if (state.championship === "MotoGP" && state.age >= 32 && !lastGood) {
    const [lo, hi] = state.ovr >= 85 ? [76, 82] : [69, 77];
    wsbkPick = { team: pickTeamByStrength("WorldSBK", lo, hi), championship: "WorldSBK" };
  } else if (state.championship === "Moto2" && lastSeason && lastSeason.pos >= 4) {
    wsbkPick = { team: pickTeamByStrength("WorldSBK", 69, 76), championship: "WorldSBK" }; // equipo mediano
  }

  // Salida lateral a Supersport: piloto de Moto3 que no destaca (temporada
  // no "buena") puede dar el salto a la escalera de Superbikes en vez de
  // seguir estancado en el Mundial de motos. Es la puerta de entrada a esa
  // escalera, de la que luego se puede ascender a WorldSBK.
  let sspPick = null;
  if (state.championship === "Moto3" && !lastGood) {
    sspPick = { team: pickTeamByStrength("Supersport", 68, 73), championship: "Supersport" };
  }

  // Descenso de categoría: si llevas dos temporadas seguidas hundido en la
  // tabla dentro de MotoGP o Moto2 (con tiempo ya de sobra para asentarte),
  // el mercado puede ofrecerte volver a la categoría inferior para
  // reconstruir tu carrera, en vez de seguir languideciendo arriba.
  let demotionPick = null;
  if (seasonsStuckBadly() && Math.random() < 0.5) {
    if (state.championship === "MotoGP") {
      demotionPick = { team: pickTeamByStrength("Moto2", 74, 80), championship: "Moto2" };
    } else if (state.championship === "Moto2") {
      demotionPick = { team: pickTeamByStrength("Moto3", 54, 58), championship: "Moto3" };
    }
  }

  const sameLevelCandidates = TEAMS[state.championship]
    .filter((t) => t.name !== state.team.name)
    .map((t) => ({ team: t, championship: state.championship }))
    .sort(() => Math.random() - 0.5);

  const picks = [];
  if (targetChamp) {
    const promoCandidates = TEAMS[targetChamp]
      .map((t) => ({ team: t, championship: targetChamp }))
      .sort(() => Math.random() - 0.5);
    if (promoCandidates.length) picks.push(promoCandidates[0]);
  }
  if (wsbkPick) picks.push(wsbkPick);
  if (sspPick) picks.push(sspPick);
  if (demotionPick) picks.push(demotionPick);

  // Con el retiro ya disponible, solo se añade 1 oferta extra (2 en total
  // junto con la renovación) para que el retiro sea la tercera opción,
  // no una tarjeta añadida aparte. Si ya hay ofertas especiales (ascenso
  // y/o salto lateral) no se recortan: el jugador siempre ve todas las
  // vías reales que se ha ganado, aunque sean más de las "normales".
  const extraPicksNeeded = state.age >= RETIRE_MIN_AGE ? 1 : 2;
  while (picks.length < extraPicksNeeded && sameLevelCandidates.length) {
    picks.push(sameLevelCandidates.shift());
  }

  picks.forEach((c) => {
    offers.push({ team: c.team, championship: c.championship, isCurrent: false });
  });

  return offers;
}

function findTeamData(name, championship) {
  if (championship && TEAMS[championship]) {
    const found = TEAMS[championship].find((t) => t.name === name);
    if (found) return found;
  }
  for (const champ in TEAMS) {
    const found = TEAMS[champ].find((t) => t.name === name);
    if (found) return found;
  }
  return null;
}

// ---------------- Reset ----------------
$("#btn-reset").addEventListener("click", () => {
  showConfirm("¿Empezar una nueva carrera? Se perderá el progreso actual.", resetGame);
});

// ============================================================
// SIMULACIÓN DE TEMPORADA
// ============================================================
const RACES_PER_SEASON = 20;

// ------------------------------------------------------------
// Pelotón rival persistente: en vez de reinventar a los 23 rivales cada
// temporada desde cero, el pelotón evoluciona poco a poco (deriva suave +
// ligera regresión a la media). Así el campeonato tiene continuidad de un
// año a otro y no es normal pasar de 2º a 4º de una temporada a la
// siguiente sin motivo — aunque sigue pudiendo pasar de vez en cuando.
// ------------------------------------------------------------
function getRivalField(champ) {
  if (!state.rivalFields) state.rivalFields = {};
  const field = FIELD[champ] || FIELD.Moto3;
  if (!state.rivalFields[champ]) {
    state.rivalFields[champ] = Array.from({ length: GRID_RIVALS }, () => field.mean + noise(field.sd));
  } else {
    state.rivalFields[champ] = state.rivalFields[champ].map((r) => {
      const drift = rand(-3, 3);
      const revert = (field.mean - r) * 0.06;
      return clamp(r + drift + revert, field.mean - field.sd * 2, field.mean + field.sd * 2);
    });
  }
  return state.rivalFields[champ];
}

// Peso del piloto frente al de la moto/equipo en el rendimiento en pista.
// En Moto3/Moto2 el talento del piloto lo es casi todo; en MotoGP la moto
// pesa más, pero el piloto sigue siendo el factor principal.
const CATEGORY_WEIGHTS = {
  Moto3:      { rider: 0.83, team: 0.17 },
  Moto2:      { rider: 0.82, team: 0.18 },
  MotoGP:     { rider: 0.65, team: 0.35 },
  Supersport: { rider: 0.79, team: 0.21 },
  WorldSBK:   { rider: 0.72, team: 0.28 },
};

// ------------------------------------------------------------
// Crecimiento anual de OVR — combina perfil oculto, edad, resultados
// deportivos, adaptación a un cambio de equipo/categoría y azar.
// Nada de esto es una fórmula fija: dos pilotos con los mismos resultados
// pueden acabar la temporada con crecimientos muy distintos.
// ------------------------------------------------------------
function computeSeasonGrowth(pts, champPosition, categoryChanged) {
  const p = state.hiddenProfile;
  const maxPossiblePts = RACES_PER_SEASON * 25;
  const perfRatio = pts / maxPossiblePts;

  // 1. Margen de mejora respecto al potencial oculto — el factor con más
  // peso. Un piloto lejos de su techo puede pegar un buen salto aunque
  // no gane nada; uno que ya casi lo ha tocado apenas se mueve.
  const room = clamp((state.potential - state.ovr) / 22, 0, 1.5);
  // AJUSTE DE DIFICULTAD (pizca, segunda pasada): multiplicador base un
  // poco más alto todavía (antes 1.42) — conseguir cosas buenas debe notarse
  // más en el OVR, sin dejar de depender del perfil oculto y la curva.
  const base = room * p.learningRate * curveMultiplier(p.curve, state.age) * 1.55;

  // 2. Edad — influye bastante menos que antes, pero a partir de los 30
  // años el declive es la norma general (con un pelín de variación
  // personal según el pico de forma oculto de cada piloto).
  const ageDist = state.age - p.peakAge;
  const personalAgeFactor = ageDist <= 0
    ? clamp(1 - Math.abs(ageDist) / 12, 0, 1) * 0.45
    : -clamp(ageDist / 8, 0, 1) * 0.5;
  const post30Penalty = state.age >= 30 ? -clamp((state.age - 29) * 0.4, 0, 3.5) : 0;
  const ageFactor = personalAgeFactor + post30Penalty;

  // 3. Resultados deportivos — pesan, pero no deciden por sí solos.
  let perfFactor = (perfRatio - 0.22) * 3;
  if (champPosition <= 3) perfFactor += (4 - champPosition) * 0.3;
  else if (champPosition >= 20) perfFactor -= 0.4;
  perfFactor = clamp(perfFactor, -1.2, 2);

  // 4. Azar — más amplio en pilotos irregulares (baja "consistency").
  const luckSpread = lerp(0.5, 2.4, 1 - p.consistency);
  const luck = noise(luckSpread);

  // 5. Adaptación a un cambio de equipo o categoría.
  const adaptBonus = categoryChanged
    ? (p.adaptability - 1) * 1.6 + rand(-0.5, 0.5)
    : 0;

  let growth = base + ageFactor + perfFactor + luck + adaptBonus;

  // 6. Evento de desarrollo — poco frecuente, cambia la historia de la
  // temporada (para bien o para mal).
  let eventText = null, eventKind = null;

  // 6a. Shock de cambio de categoría: probabilidad baja pero real de que el
  // salto (Moto3→Moto2, Moto2→MotoGP, Moto2→WorldSBK, etc.) marque la
  // temporada mucho más de lo normal. A veces encajas de inmediato y das
  // un salto grande; otras te pierdes por completo y retrocedes bastante.
  // Cuando esto ocurre, sustituye a los eventos de desarrollo normales de
  // esa temporada (la transición ya es, de por sí, la historia del año).
  if (categoryChanged && Math.random() < 0.15) {
    const positive = Math.random() < 0.5;
    growth += positive ? rand(3.5, 7) : rand(-7, -3.5);
    eventText = positive
      ? "Encaja de inmediato en la nueva categoría, muy por encima de lo esperado"
      : "Se pierde por completo con el cambio de categoría";
    eventKind = positive ? "positive" : "negative";
  } else if (Math.random() < p.breakoutChance) {
    const ev = POSITIVE_EVENTS[randInt(0, POSITIVE_EVENTS.length - 1)];
    growth += ev.bonus();
    eventText = ev.text; eventKind = "positive";
  } else if (Math.random() < 0.06) {
    const ev = NEGATIVE_EVENTS[randInt(0, NEGATIVE_EVENTS.length - 1)];
    growth += ev.bonus();
    eventText = ev.text; eventKind = "negative";
  }

  growth = clamp(growth, -6, 6);
  let rounded = Math.round(growth);

  // Los saltos de +4 o más solo pueden darse tras un evento positivo
  // excepcional; si no, el máximo normal es +3.
  if (rounded >= 4 && eventKind !== "positive") rounded = 3;
  // Y el +3, en sí, sigue siendo la excepción, no la norma (pizca: ahora
  // solo se recorta a +2 el 22% de las veces, antes 32%).
  if (rounded === 3 && eventKind !== "positive" && Math.random() < 0.22) rounded = 2;

  // 7. Plus por dar el salto a una categoría exigente: al entrar por
  // primera vez en MotoGP o en WorldSBK (Superbikes) se suma un +2 de OVR
  // FIJO, además de toda la subida "normal" ya calculada arriba, para que
  // el piloto llegue mejor preparado a plantar cara desde el primer año.
  if (categoryChanged && (state.championship === "MotoGP" || state.championship === "WorldSBK")) {
    rounded += 2;
  }

  return { growth: rounded, eventText };
}

function simulateSeason(categoryChanged = false) {
  // ---------- Seguimiento de permanencia en la categoría actual ----------
  // Se usa para exigir un número mínimo de temporadas antes de poder subir
  // de categoría (ver generateMarketOffers) — así el ascenso deja de
  // depender solo de tener una temporada buena y se vuelve más gradual.
  if (categoryChanged) {
    state.seasonsInChamp = 1;
    state.promotionReadyAt = pickPromotionThreshold();
  } else {
    state.seasonsInChamp = (state.seasonsInChamp || 0) + 1;
  }

  const w = CATEGORY_WEIGHTS[state.championship] || CATEGORY_WEIGHTS.Moto3;
  const playerRating = state.ovr * w.rider + state.team.strength * w.team;

  // Nivel base de cada rival para toda la temporada (su sitio dentro del
  // pelotón), heredado (con una ligera deriva) de la temporada anterior.
  const rivalBase = getRivalField(state.championship);
  const rivalPoints = new Array(GRID_RIVALS).fill(0);

  // ¿Es el piloto, de verdad, uno de los 3 mejores del pelotón esta
  // temporada (por nivel base, sin contar el azar del día de carrera)?
  // Si no lo es, ganar una carrera debe ser la excepción: lo normal es
  // que esos "días buenos" se queden en un podio, no en una victoria.
  const isTopTier = rivalBase.filter((r) => r > playerRating).length < 3;

  let ce = 0, dnf = 0, cg = 0, pod = 0, pol = 0, pts = 0;

  for (let i = 0; i < RACES_PER_SEASON; i++) {
    ce++;

    // Clasificación (pole): quién sale más rápido ese fin de semana.
    const qPlayer = playerRating + noise(9);
    const qRivals = rivalBase.map((r) => r + noise(9));
    if (qRivals.every((r) => r < qPlayer)) pol++;

    // Posible abandono del piloto.
    const playerDNF = Math.random() < 0.07;
    if (playerDNF) dnf++;

    // AJUSTE DE DIFICULTAD: en Moto2 y Moto3, de vez en cuando el piloto
    // tiene un día especialmente inspirado (poco probable, pero no
    // imposible), que le permite plantar cara aunque su moto/equipo sea
    // peor que el de los rivales. No afecta a la clasificación, solo a la
    // carrera en sí — un extra de forma del día, no de velocidad pura.
    const inspiredDay = (state.championship === "Moto2" || state.championship === "Moto3") && Math.random() < 0.08
      ? rand(5, 11)
      : 0;

    // Resultado de carrera: cada uno con su variación de forma del día.
    const rPlayer = playerRating + noise(11) + inspiredDay;
    const rRivals = rivalBase.map((r) => r + noise(10));

    const finishers = rRivals.map((perf, idx) => ({ idx, perf }));
    if (!playerDNF) finishers.push({ idx: -1, perf: rPlayer });
    finishers.sort((a, b) => b.perf - a.perf);

    // Si hoy tocaba ganar pero el piloto no es realmente de los 3 mejores
    // de la temporada, la mayoría de esas veces se queda en un podio (2º)
    // en vez de una victoria — ganar de verdad sigue siendo cosa de los
    // pilotos top, aunque de vez en cuando pase la sorpresa. En Moto2 y
    // Moto3 esa sorpresa es algo más frecuente (ajuste de dificultad).
    if (finishers[0].idx === -1 && !isTopTier) {
      const demoteChance = (state.championship === "Moto2" || state.championship === "Moto3") ? 0.4 : 0.55;
      if (Math.random() < demoteChance) {
        const winner = finishers.shift();
        finishers.splice(1, 0, winner);
      }
    }

    finishers.forEach((f, rank) => {
      const pos = rank + 1;
      const gained = pos <= POINTS_TABLE.length ? POINTS_TABLE[pos - 1] : 0;
      if (f.idx === -1) {
        if (pos === 1) cg++;
        if (pos <= 3) pod++;
        pts += gained;
      } else {
        rivalPoints[f.idx] += gained;
      }
    });
  }

  // Clasificación final del campeonato (1 a 24).
  const standings = [{ idx: -1, pts }, ...rivalPoints.map((p, idx) => ({ idx, pts: p }))];
  standings.sort((a, b) => b.pts - a.pts);
  const champPosition = standings.findIndex((s) => s.idx === -1) + 1;
  const isChampion = champPosition === 1;

  // ---------- Crecimiento de OVR ----------
  // Combina perfil oculto, edad, resultados deportivos, adaptación y
  // eventos aleatorios — nunca una fórmula fija. Ver computeSeasonGrowth().
  const { growth, eventText } = computeSeasonGrowth(pts, champPosition, categoryChanged);

  // Guardar en historial (incluye el evento de la temporada, si lo hubo)
  state.history.push({
    age: state.age, team: state.team.name, ovr: state.ovr,
    championship: state.championship,
    ce, dnf, cg, pod, pol, pos: champPosition, disputed: true,
    event: eventText,
  });

  const newOvr = Math.round(clamp(state.ovr + growth, 40, state.potential));
  const seasonAge = state.age; // edad de la temporada recién disputada
  const seasonChamp = state.championship;
  state.ovr = newOvr;
  state.age += 1;
  state.seasonNumber += 1;
  state.justWonChampionship = isChampion ? { champ: seasonChamp, age: seasonAge } : null;

  saveState();

  if (state.age > MAX_AGE) {
    retireCareer();
  } else {
    renderDashboard();
  }
}

// ============================================================
// RETIRADA
// ============================================================
function retireCareer() {
  const h = state.history;
  const totals = h.reduce((acc, s) => {
    acc.cg += s.cg; acc.pod += s.pod; acc.pol += s.pol;
    if (s.pos === 1) acc.titles += 1;
    return acc;
  }, { cg: 0, pod: 0, pol: 0, titles: 0 });

  const peakOvr = h.length ? Math.max(...h.map((s) => s.ovr), state.ovr) : state.ovr;
  const bestPos = h.length ? Math.min(...h.map((s) => s.pos)) : null;
  const lastAge = h.length ? h[h.length - 1].age : state.age;
  const lastChamp = h.length ? h[h.length - 1].championship : state.championship;

  $("#retiro-subtitle").textContent =
    `${state.rider.apellido} se retira a los ${lastAge} años, tras ${h.length} temporada${h.length === 1 ? "" : "s"} como profesional, compitiendo en ${lastChamp}.`;

  $("#retire-stats").innerHTML = `
    <div class="retire-stat"><span class="label">🏆 Carreras ganadas</span><span class="value">${totals.cg}</span></div>
    <div class="retire-stat"><span class="label">🥈 Podios</span><span class="value">${totals.pod}</span></div>
    <div class="retire-stat"><span class="label">⚡ Poles</span><span class="value">${totals.pol}</span></div>
    <div class="retire-stat"><span class="label">👑 Títulos de campeón</span><span class="value">${totals.titles}</span></div>
    <div class="retire-stat"><span class="label">📊 Mejor posición</span><span class="value">${bestPos ?? "—"}º</span></div>
    <div class="retire-stat"><span class="label">📈 OVR máximo</span><span class="value">${peakOvr}</span></div>
    <div class="retire-stat"><span class="label">🏁 Temporadas</span><span class="value">${h.length}</span></div>
  `;

  localStorage.removeItem(STORAGE_KEY);
  showScreen("screen-retiro");
}

// ============================================================
// TARJETA EXPORTABLE ("trading card") AL RETIRARSE
// Dibuja un resumen de la carrera en un <canvas> y lo ofrece como imagen
// PNG descargable (y como vista previa en la propia pantalla). Se genera
// bajo demanda, al pulsar el botón, usando los mismos totales que ya se
// calculan para la pantalla de retirada.
// ============================================================
function drawTradingCard(ctx, canvas, info, flagImgEl) {
  const W = canvas.width, H = canvas.height;
  const r = state.rider;
  const accent = teamColor(info.lastTeam, info.lastChamp);

  // Fondo
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#181818");
  grad.addColorStop(1, "#0D0D0D");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Borde con el color del último equipo
  ctx.strokeStyle = accent;
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, W - 10, H - 10);

  ctx.textAlign = "center";

  // Bandera (si se pudo cargar sin problemas de CORS)
  if (flagImgEl) {
    const fw = 96, fh = 68;
    ctx.drawImage(flagImgEl, W / 2 - fw / 2, 44, fw, fh);
  }

  // Etiqueta superior
  ctx.fillStyle = "#8A8A8E";
  ctx.font = "700 20px Inter, sans-serif";
  ctx.fillText("CARRERA FINALIZADA", W / 2, 150);

  // Apellido
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "900 56px Inter, sans-serif";
  ctx.fillText(r.apellido || "PILOTO", W / 2, 220);

  // Dorsal
  ctx.fillStyle = "#F4C400";
  ctx.font = "900 84px Inter, sans-serif";
  ctx.fillText("#" + (r.numero ?? "00"), W / 2, 320);

  // País
  ctx.fillStyle = "#8A8A8E";
  ctx.font = "600 20px Inter, sans-serif";
  ctx.fillText(r.nacionalidad ? r.nacionalidad.name : "", W / 2, 356);

  // Cuadrícula de estadísticas
  const stats = [
    ["TÍTULOS", info.totals.titles],
    ["VICTORIAS", info.totals.cg],
    ["PODIOS", info.totals.pod],
    ["POLES", info.totals.pol],
    ["OVR MÁXIMO", info.peakOvr],
    ["MEJOR POSICIÓN", info.bestPos ? info.bestPos + "º" : "—"],
    ["TEMPORADAS", state.history.length],
    ["ÚLTIMA CATEGORÍA", info.lastChamp],
  ];

  const startY = 440, rowH = 92;
  stats.forEach(([label, value], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = col === 0 ? W * 0.27 : W * 0.73;
    const y = startY + row * rowH;
    ctx.fillStyle = "#5A5A5E";
    ctx.font = "700 13px Inter, sans-serif";
    ctx.fillText(label, x, y);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "900 30px Inter, sans-serif";
    ctx.fillText(String(value), x, y + 36);
  });

  // Pie
  ctx.fillStyle = "#5A5A5E";
  ctx.font = "600 14px Inter, sans-serif";
  ctx.fillText(`Se retiró a los ${info.lastAge} años`, W / 2, H - 40);
}

function generateAndDownloadTradingCard() {
  if (!state) return;
  const h = state.history;
  const totals = h.reduce((acc, s) => {
    acc.cg += s.cg; acc.pod += s.pod; acc.pol += s.pol;
    if (s.pos === 1) acc.titles += 1;
    return acc;
  }, { cg: 0, pod: 0, pol: 0, titles: 0 });

  const info = {
    totals,
    peakOvr: h.length ? Math.max(...h.map((s) => s.ovr), state.ovr) : state.ovr,
    bestPos: h.length ? Math.min(...h.map((s) => s.pos)) : null,
    lastAge: h.length ? h[h.length - 1].age : state.age,
    lastChamp: h.length ? h[h.length - 1].championship : state.championship,
    lastTeam: h.length ? h[h.length - 1].team : state.team.name,
  };

  const canvas = $("#trading-card-canvas");
  const ctx = canvas.getContext("2d");
  const r = state.rider;
  const btn = $("#btn-download-card");
  btn.disabled = true;

  const finish = (dataUrl) => {
    const preview = $("#trading-card-preview");
    preview.src = dataUrl;
    preview.style.display = "block";
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${(r.apellido || "piloto").toLowerCase()}-motogp-card.png`;
    a.click();
    btn.disabled = false;
  };

  const renderWithFlag = (flagEl) => {
    drawTradingCard(ctx, canvas, info, flagEl);
    try {
      finish(canvas.toDataURL("image/png"));
    } catch (err) {
      // El navegador puede "contaminar" el canvas si la bandera no permite
      // CORS: en ese caso se redibuja igual, pero sin la imagen de bandera.
      drawTradingCard(ctx, canvas, info, null);
      finish(canvas.toDataURL("image/png"));
    }
  };

  if (r.nacionalidad) {
    const flag = new Image();
    flag.crossOrigin = "anonymous";
    flag.onload = () => renderWithFlag(flag);
    flag.onerror = () => renderWithFlag(null);
    flag.src = `https://flagcdn.com/w160/${r.nacionalidad.code.toLowerCase()}.png`;
  } else {
    renderWithFlag(null);
  }
}

$("#btn-download-card").addEventListener("click", generateAndDownloadTradingCard);

// Reinicio completo: limpia el estado en memoria, el localStorage y TODOS
// los campos visuales de las pantallas 1 y 2 (antes se quedaban el toggle
// de "mano" y el buscador de país con el valor de la partida anterior,
// aunque el "draft" interno sí estuviera reiniciado).
function resetGame() {
  localStorage.removeItem(STORAGE_KEY);
  state = null;
  draft = { apellido: "", numero: null, mano: "Izquierda", nacionalidad: null };

  $("#input-apellido").value = "";
  $("#input-numero").value = "";
  $("#bike-surname").textContent = "APELLIDO";
  $("#bike-number").textContent = "00";

  $$("#mano-toggle .toggle-btn").forEach((b) => b.classList.remove("selected"));
  $(`#mano-toggle .toggle-btn[data-value="Izquierda"]`).classList.add("selected");

  $("#input-search-country").value = "";
  buildCountryGrid();
  $("#btn-to-debut").disabled = true;

  const preview = $("#trading-card-preview");
  preview.style.display = "none";
  preview.removeAttribute("src");

  showScreen("screen-identidad");
}

$("#btn-play-again").addEventListener("click", resetGame);

// ============================================================
// PERSISTENCIA
// ============================================================
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return false;
  try {
    state = JSON.parse(raw);
    return true;
  } catch { return false; }
}

// ============================================================
// INICIO
// ============================================================
if (loadState()) {
  renderDashboard();
  showScreen("screen-dashboard");
} else {
  showScreen("screen-identidad");
}
