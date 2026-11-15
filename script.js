// ============================================================
// SCRIPT.JS — Lógica del simulador de carrera MotoGP
// ============================================================

const STORAGE_KEY = "motogpCareerState";
const RETIRE_MIN_AGE = 33;
const MAX_AGE = 38;
// Los campeonatos nacionales (ESBK/BSB/CIV) exigen menos físico y permiten
// alargar la carrera deportiva más allá del límite habitual — hasta 3
// temporadas extra si el piloto sigue compitiendo ahí al llegar al tope.
const MAX_AGE_NATIONAL = 41;

// Pelotón de cada categoría: nivel medio y variabilidad de los rivales.
// Cuanto más alta la categoría, más alto (y más apretado) es el nivel medio
// del pelotón — por eso el mismo OVR rinde mucho menos en una categoría
// superior y hace falta subir de verdad para seguir ganando.
const FIELD = {
  // Fase de formación (16-17 años, antes de Moto3/SportBike): pelotón más
  // flojo y todavía muy irregular — es la primera parrilla profesional.
  // AJUSTE (pizca): nivel medio un pelín más bajo de lo inicial, para que
  // llegar preparado a los 18 años sea un poco más asequible, sin que se
  // note apenas.
  // AJUSTE (4ª pasada): subida general de nivel — un punto a todos menos
  // WorldSBK, MotoGP y los nacionales (ESBK/BSB/CIV), y dos puntos extra a
  // SportBike, Supersport y Yamaha R3 Cup.
  MotoJunior:      { mean: 44, sd: 14 },
  RedBullRookies:  { mean: 46, sd: 14 },
  YamahaR3Cup:     { mean: 40, sd: 14 },
  Moto3:      { mean: 59, sd: 13 },
  // AJUSTE (nuevo): Moto2 normal vuelve a bajar 1 punto (70→69).
  Moto2:      { mean: 69, sd: 13 },
  MotoGP:     { mean: 81, sd: 11 },
  // Europeo de Moto2 (FIM Moto2 European Championship): vía alternativa a
  // la subida directa Moto3→Moto2, con un nivel intermedio entre ambas.
  Moto2Euro:  { mean: 60, sd: 13 },
  SportBike:  { mean: 56, sd: 13 },
  Supersport: { mean: 66, sd: 12 },
  WorldSBK:   { mean: 75, sd: 11 },
  // Campeonatos nacionales de Superbike: nivel de pelotón por debajo de
  // WorldSBK, vía alternativa para pilotos que no llegan (o no se
  // mantienen) en los campeonatos superiores.
  ESBK:       { mean: 60, sd: 12 },
  BSB:        { mean: 63, sd: 12 },
  CIV:        { mean: 59, sd: 12 },
  // Stock 600: vía alternativa de nivel intermedio — por debajo del
  // Europeo de Moto2, aproximadamente a la altura de SportBike (algo por
  // debajo, ya que recibe tanto a pilotos de la fase júnior que aún no
  // han despegado como a pilotos de SportBike que no destacan).
  Stock600:   { mean: 50, sd: 13 },
};
const GRID_RIVALS = 23; // resto de la parrilla (24 pilotos en total en el campeonato)

// Campeonatos de la fase de formación (16-17 años, antes de Moto3 y
// SportBike). Se usa tanto para el mercado de fichajes como para el
// empujón de OVR al graduarse (ver computeSeasonGrowth).
const JUNIOR_CHAMPS = ["MotoJunior", "RedBullRookies", "YamahaR3Cup"];

// Ruido "casi normal" (suma de 3 uniformes) para resultados de carrera.
function noise(sd) { return sd * ((Math.random() + Math.random() + Math.random() - 1.5) / 1.5); }

let draft = { apellido: "", numero: null, nacionalidad: null, numeroFont: "inter", numeroColor: "#F4C400" };

// Fuentes disponibles para el dorsal (clave → familia CSS real).
const NUMBER_FONTS = {
  inter:    "'Inter', sans-serif",
  oswald:   "'Oswald', sans-serif",
  orbitron: "'Orbitron', sans-serif",
  bebas:    "'Bebas Neue', sans-serif",
};
let state = null; // estado de partida en curso

// ---------------- Utilidades ----------------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// Anima un número subiendo (o bajando) desde el valor que ya se ve en
// pantalla hasta el valor nuevo, en 1-2 segundos — se usa para victorias,
// podios y títulos en la tarjeta del piloto.
function animateCountUp(el, to, duration = 1200) {
  const from = parseInt(el.textContent, 10) || 0;
  if (from === to) { el.textContent = to; return; }
  const start = performance.now();
  function step(now) {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 2); // ease-out
    el.textContent = Math.round(from + (to - from) * eased);
    if (t < 1) requestAnimationFrame(step);
    else el.textContent = to;
  }
  requestAnimationFrame(step);
}

function showScreen(id) {
  $$(".screen").forEach((s) => s.classList.remove("active"));
  $(`#${id}`).classList.add("active");
}

function rand(min, max) { return Math.random() * (max - min) + min; }
function randInt(min, max) { return Math.floor(rand(min, max + 1)); }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }

// Convierte un color hex ("#RRGGBB" o "#RGB") a "rgba(r, g, b, alpha)" —
// se usa para pintar el degradado de color de equipo en las tarjetas de la
// pantalla de retirada, con baja opacidad.
function hexToRgba(hex, alpha) {
  const h = (hex || "#3B82F6").replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(full.slice(0, 2), 16) || 0;
  const g = parseInt(full.slice(2, 4), 16) || 0;
  const b = parseInt(full.slice(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

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
  const n = $("#bike-number"); n.classList.remove("pop"); void n.offsetWidth; n.classList.add("pop");
});

// Selector de número: -, +, y aleatorio (1-99)
function setNumeroInput(v) {
  $("#input-numero").value = clamp(v, 1, 99);
  $("#input-numero").dispatchEvent(new Event("input"));
}
$("#num-minus").addEventListener("click", () => {
  const cur = parseInt($("#input-numero").value) || 1;
  setNumeroInput(cur <= 1 ? 99 : cur - 1);
});
$("#num-plus").addEventListener("click", () => {
  const cur = parseInt($("#input-numero").value) || 0;
  setNumeroInput(cur >= 99 ? 1 : cur + 1);
});
$("#num-random").addEventListener("click", () => setNumeroInput(randInt(1, 99)));

$("#number-font-group").addEventListener("click", (e) => {
  const btn = e.target.closest(".number-font-btn");
  if (!btn) return;
  $$("#number-font-group .number-font-btn").forEach((b) => b.classList.remove("selected"));
  btn.classList.add("selected");
  draft.numeroFont = btn.dataset.font;
  $("#bike-number").style.fontFamily = NUMBER_FONTS[draft.numeroFont];
});

$("#number-color-group").addEventListener("click", (e) => {
  const btn = e.target.closest(".number-color-swatch");
  if (!btn) return;
  $$("#number-color-group .number-color-swatch").forEach((b) => b.classList.remove("selected"));
  btn.classList.add("selected");
  draft.numeroColor = btn.dataset.color;
  $("#bike-number").style.color = draft.numeroColor;
  $("#number-plate").style.setProperty("--plate-accent", draft.numeroColor);
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
        $("#random-country-result").innerHTML = "";
        buildCountryGrid($("#input-search-country").value);
      });
      grid.appendChild(el);
    });
}

$("#input-search-country").addEventListener("input", (e) => buildCountryGrid(e.target.value));

// País aleatorio: elige uno al azar, lo marca como seleccionado y avisa de
// cuál ha tocado (con su bandera).
$("#btn-random-country").addEventListener("click", () => {
  const c = COUNTRIES[randInt(0, COUNTRIES.length - 1)];
  draft.nacionalidad = c;
  $("#btn-to-debut").disabled = false;
  $("#input-search-country").value = "";
  buildCountryGrid();
  $("#random-country-result").innerHTML = `Te ha tocado: ${flagImg(c.code, "flag-img flag-img-lg")} <span>${c.name}</span>`;
  const sel = $("#country-grid .country-item.selected");
  if (sel) sel.scrollIntoView({ block: "center", behavior: "smooth" });
});
$("#btn-back-identidad").addEventListener("click", () => showScreen("screen-identidad"));

$("#btn-to-debut").addEventListener("click", () => {
  buildDebutOffers();
  showScreen("screen-debut");
});

// ============================================================
// PANTALLA 3: DEBUT — primeras 3 ofertas, de la FASE DE FORMACIÓN júnior
// (nunca directamente de Moto3 ni SportBike). Cada una de las 3 ofertas se
// sortea POR SEPARADO entre los tres campeonatos júnior (no las 3 de
// golpe), para que en la pantalla salgan mezcladas. A la larga, sobre
// muchas partidas, ronda el 73% vía Moto3 (FIM JuniorGP + Red Bull
// Rookies Cup) / 27% vía SportBike (Yamaha R3 Cup) — la misma proporción
// que antes tenían Moto3/SportBike directamente, ahora aplicada al primer
// escalón de la escalera.
// ============================================================
const JUNIOR_DEBUT_CHAMPS = [
  { key: "MotoJunior",     weight: 0.47 }, // rumbo Moto3
  { key: "RedBullRookies", weight: 0.26 }, // rumbo Moto3
  { key: "YamahaR3Cup",    weight: 0.27 }, // rumbo SportBike
];

function buildDebutOffers() {
  $("#debut-subtitle").textContent =
    "Tienes 16 años. Estos son los campeonatos júnior que quieren ficharte. Elige tu primer equipo.";

  const wrap = $("#debut-offers");
  wrap.innerHTML = "";

  // Red Bull Rookies Cup y Yamaha R3 Cup son monomarca (un único equipo);
  // FIM JuniorGP tiene varios.
  const pools = {
    MotoJunior: [...TEAMS.MotoJunior].sort(() => Math.random() - 0.5),
    RedBullRookies: [...TEAMS.RedBullRookies],
    YamahaR3Cup: [...TEAMS.YamahaR3Cup],
  };

  for (let i = 0; i < 3; i++) {
    // Solo se sortea entre los campeonatos cuya pool todavía tenga algún
    // equipo libre — así los dos monomarca no pueden ofrecerse dos veces.
    const available = JUNIOR_DEBUT_CHAMPS.filter((c) => pools[c.key].length);
    if (!available.length) break;
    const totalWeight = available.reduce((sum, c) => sum + c.weight, 0);
    let r = Math.random() * totalWeight;
    let champ = available[available.length - 1].key;
    for (const c of available) {
      if (r < c.weight) { champ = c.key; break; }
      r -= c.weight;
    }

    const team = pools[champ].shift();
    if (!team) continue; // red de seguridad

    const card = document.createElement("div");
    card.className = "offer-card";
    card.innerHTML = offerCardHTML(team, champ);
    card.addEventListener("click", () => startCareer(team, champ));
    wrap.appendChild(card);
  }
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
      <span class="offer-champ-badge">${champLabel(champ)}</span>
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
  { key: "normal",        weight: 0.66, potential: [74, 86], learningRate: [0.55, 0.85], breakout: [0.02, 0.05] },
  { key: "muyBueno",      weight: 0.23, potential: [85, 90], learningRate: [0.75, 1.00], breakout: [0.04, 0.08] },
  { key: "talento",       weight: 0.07, potential: [89, 93], learningRate: [0.90, 1.15], breakout: [0.06, 0.11] },
  { key: "futuroCampeon", weight: 0.03, potential: [92, 96], learningRate: [1.05, 1.30], breakout: [0.08, 0.14] },
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
  if (curve === "tardio") return age < 22 ? 0.65 : age < 26 ? 0.85 : 1.3;
  return 1.0;
}

// TRAYECTORIA de la carrera (oculta): además del techo y el ritmo, cada
// piloto sigue un guion distinto. Así no todas las carreras acaban en un
// 80 y pico: hay lentas, estancadas, promesas que se rompen, remontadas...
const CAREER_ARCS = [
  { key: "normal",      weight: 0.46 },
  { key: "lento",       weight: 0.13 }, // progresa despacio, techo más bajo
  { key: "estancado",   weight: 0.10 }, // sube y se queda clavado hacia los 20-24
  { key: "promesaRota", weight: 0.08 }, // arranca fuerte y se rompe
  { key: "remontada",   weight: 0.15 }, // flojo al principio, da la vuelta
  { key: "estrella",    weight: 0.08 }, // sube más rápido y más alto
];
function pickArc() {
  let r = Math.random();
  for (const a of CAREER_ARCS) { r -= a.weight; if (r <= 0) return a.key; }
  return "normal";
}

function generateHiddenProfile() {
  const tier = pickTier();
  const arc = pickArc();
  const prof = _generateHiddenProfileBase(tier);
  prof.arc = arc;
  if (arc === "lento")        { prof.learningRate *= 0.78; prof.potential = Math.max(68, prof.potential - randInt(2, 6)); }
  else if (arc === "estrella"){ prof.learningRate *= 1.18; prof.potential = Math.min(98, prof.potential + randInt(1, 4)); }
  else if (arc === "promesaRota") { prof.learningRate *= 1.25; prof.arcAge = randInt(20, 23); }
  else if (arc === "estancado")   { prof.arcAge = randInt(20, 24); }
  else if (arc === "remontada")   { prof.learningRate *= 0.65; prof.arcAge = randInt(22, 26); prof.potential = Math.max(prof.potential, 80); }
  prof.arcDone = false;
  return prof;
}

function _generateHiddenProfileBase(tier) {
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

function startCareer(team, champ = "MotoJunior") {
  // AJUSTE FASE DE FORMACIÓN: el piloto arranca con un OVR bastante más
  // bajo que antes (antes se debutaba ya en Moto3/SportBike con 58-68).
  // La fase júnior está pensada para que, en torno a los 18 años (2
  // temporadas), el ritmo de crecimiento normal (ver computeSeasonGrowth,
  // con el impulso extra de "room" al estar tan lejos del potencial y el
  // bonus de 16-18 años) lo devuelva a un nivel similar al que antes tenía
  // al debutar directamente en Moto3 — es una fase de desarrollo, no un
  // retraso de la progresión. AJUSTE (2ª pasada): mínimo subido a 44 para
  // que la media de partida a los 16 años sea un poco más alta.
  const initialOvr = randInt(44, 52);
  const hiddenProfile = generateHiddenProfile();
  state = {
    rider: {
      apellido: draft.apellido,
      numero: draft.numero,
      nacionalidad: draft.nacionalidad,
      numeroFont: draft.numeroFont,
      numeroColor: draft.numeroColor,
    },
    age: 16,
    ovr: initialOvr,
    potential: hiddenProfile.potential,
    hiddenProfile,
    team: { name: team.name, strength: team.strength },
    championship: champ,
    seasonsInChamp: 0,
    promotionReadyAt: pickPromotionThreshold(champ),
    juniorGradTarget: null,
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
function renderDashboard(justSimulated = false) {
  const r = state.rider;
  animateCountUp($("#rider-ovr"), state.ovr);
  $("#ovr-box").style.background = ovrColor(state.ovr);
  $("#rider-flag").innerHTML = flagImg(r.nacionalidad.code, "flag-img flag-img-lg");
  $("#rider-name").textContent = r.apellido;
  $("#rider-team").textContent = state.team.name;
  $("#rider-country").textContent = r.nacionalidad.name;
  $("#rider-champ-tag").textContent = champLabel(state.championship);
  $("#rider-age").textContent = state.age;

  // Dorsal, con la fuente y el color personalizados elegidos al crear el
  // piloto (con reserva a los valores clásicos para carreras guardadas
  // antes de tener esta opción).
  const numberEl = $("#rider-number");
  numberEl.textContent = "#" + (r.numero ?? "00");
  numberEl.style.fontFamily = NUMBER_FONTS[r.numeroFont] || NUMBER_FONTS.inter;
  numberEl.style.color = r.numeroColor || "#F4C400";

  // Recuento de carrera: victorias, podios y títulos conseguidos hasta la
  // última temporada disputada (sustituye al antiguo "Valor" en €).
  const career = state.history.reduce((acc, s) => {
    acc.wins += s.cg; acc.podiums += s.pod;
    if (s.pos === 1) acc.titles += 1;
    return acc;
  }, { wins: 0, podiums: 0, titles: 0 });
  animateCountUp($("#rider-wins"), career.wins);
  animateCountUp($("#rider-podiums"), career.podiums);
  animateCountUp($("#rider-titles"), career.titles);

  // Al ganar un campeonato, en vez de un aviso aparte, el propio recuadro
  // de "Títulos" se enmarca en dorado un momento mientras el número sube,
  // y el marco se desvanece solo después.
  if (state.justWonChampionship) {
    const titlesNum = $("#rider-titles");
    titlesNum.classList.remove("title-flash");
    void titlesNum.offsetWidth; // fuerza el reflow para poder reiniciar la animación
    titlesNum.classList.add("title-flash");
    state.justWonChampionship = null;
    saveState();
  }

  renderHistory(justSimulated);
  renderMarket();
}

// Flechita de comparación de una estadística con la temporada anterior.
// higherIsBetter=false para estadísticas donde menos es mejor (posición).
function trendArrow(curr, prev, higherIsBetter = true) {
  if (prev === undefined || prev === null) return "";
  if (curr === prev) return `<span class="trend trend-same">–</span>`;
  const improved = higherIsBetter ? curr > prev : curr < prev;
  return `<span class="trend ${improved ? "trend-up" : "trend-down"}">${improved ? "▲" : "▼"}</span>`;
}

function renderHistory(justSimulated = false) {
  const body = $("#history-body");
  body.innerHTML = "";

  // Fila de la temporada actual (aún sin disputar)
  const rows = state.retirementPending
    ? [...state.history]
    : [...state.history, {
        age: state.age, team: state.team.name, ovr: state.ovr,
        championship: state.championship, disputed: false,
      }];

  rows.forEach((s, idx) => {
    const row = document.createElement("div");
    row.className = "history-row";
    if (!s.disputed) row.classList.add("current");
    else if (s.championship === "MotoGP") row.classList.add("highlight");
    else if (s.championship === "Moto2") row.classList.add("blueish");

    // Solo la temporada recién disputada (la última del historial, justo
    // después de simular) arranca sus números en 0 / en el OVR anterior
    // para poder animarlos subiendo — el resto de filas son historial fijo
    // y se pintan directamente con su valor final.
    const isNewest = justSimulated && s.disputed && idx === state.history.length - 1;
    if (isNewest) row.classList.add("row-enter");

    if (!s.disputed) {
      row.innerHTML = `<span><span class="ovr-badge" style="background:${teamColor(s.team, s.championship)}">${s.age}</span></span><span class="not-played">Sin disputar — ${s.team}</span>`;
    } else {
      const posClass = s.pos === 1 ? "pos-badge pos-gold" : s.pos === 2 ? "pos-badge pos-silver" : s.pos === 3 ? "pos-badge pos-bronze" : "pos-badge pos-plain";
      const eventDot = s.event ? ` <span class="event-dot" title="${s.event}">✦</span>` : "";
      const titleMark = s.pos === 1 ? ` <span class="title-mark" title="Campeón del Mundo">🏆</span>` : "";

      // Comparación con la temporada anterior (CG/POD/POS), si existe.
      const prev = idx > 0 ? rows[idx - 1] : null;
      const cgTrend = prev ? trendArrow(s.cg, prev.cg, true) : "";
      const podTrend = prev ? trendArrow(s.pod, prev.pod, true) : "";
      const posTrend = prev ? trendArrow(s.pos, prev.pos, false) : "";

      const ovrStart = isNewest ? (prev ? prev.ovr : s.ovr) : s.ovr;

      row.innerHTML = `
        <span><span class="ovr-badge" style="background:${teamColor(s.team, s.championship)}">${s.age}</span></span>
        <span class="col-team">${s.team}${titleMark}${eventDot}</span>
        <span><span class="ovr-badge js-ovr-num" style="background:${ovrColor(s.ovr)}">${ovrStart}</span></span>
        <span class="stat-cell">${STAT_ICONS.cg}<span class="stat-num js-stat-num" data-final="${s.cg}">${isNewest ? 0 : s.cg}</span>${cgTrend}</span>
        <span class="stat-cell">${STAT_ICONS.pod}<span class="stat-num js-stat-num" data-final="${s.pod}">${isNewest ? 0 : s.pod}</span>${podTrend}</span>
        <span class="stat-cell">${STAT_ICONS.pol}<span class="stat-num js-stat-num" data-final="${s.pol}">${isNewest ? 0 : s.pol}</span></span>
        <span class="stat-cell">${STAT_ICONS.dnf}<span class="stat-num js-stat-num" data-final="${s.dnf}">${isNewest ? 0 : s.dnf}</span></span>
        <span><span class="${posClass}">${s.pos}</span>${posTrend}</span>
      `;
    }
    body.appendChild(row);

    if (isNewest) {
      const ovrBadge = row.querySelector(".js-ovr-num");
      if (ovrBadge) animateCountUp(ovrBadge, s.ovr, 1200);
      row.querySelectorAll(".js-stat-num").forEach((el) => {
        animateCountUp(el, parseInt(el.dataset.final, 10), 1200);
      });
    }
  });

  // scroll al final (temporada actual)
  const table = $("#history-table");
  table.scrollTop = table.scrollHeight;
}

function renderMarket() {
  const wrap = $("#market-offers");
  wrap.innerHTML = "";
  wrap.classList.remove("offers-locked");

  // Carrera terminada: no hay más ofertas, solo la opción de pasar al
  // resumen cuando el jugador quiera.
  if (state.retirementPending) {
    $("#market-hint").textContent = "Has disputado tu última temporada";
    $("#market-hint").classList.remove("market-hint-warning");
    const card = document.createElement("div");
    card.className = "offer-card retire-option card-enter";
    card.innerHTML = `
      <div class="offer-top">
        <span class="offer-team-name">Ver resumen de carrera</span>
        <span class="offer-champ-badge">Fin de carrera</span>
      </div>
    `;
    card.addEventListener("click", () => retireCareer());
    card.addEventListener("animationend", () => card.classList.remove("card-enter"), { once: true });
    wrap.appendChild(card);
    return;
  }

  const offers = generateMarketOffers();
  const renewed = offers.some((o) => o.isCurrent);
  // AJUSTE (solo visual): si la falta de renovación es porque has ganado el
  // campeonato y toca dar el salto (forcedExit), no se muestra el aviso
  // rojo de "no te ha renovado" — no es un rechazo, es un ascenso. El aviso
  // rojo se reserva para cuando de verdad no te han renovado.
  const isForcedExit = !!offers.forcedExit;

  $("#market-hint").textContent = renewed
    ? "Elige equipo para disputar la temporada"
    : isForcedExit
      ? "Elige tu nuevo equipo para la temporada"
      : `${state.team.name} no ha renovado tu contrato — elige tu nuevo equipo para la temporada`;
  $("#market-hint").classList.toggle("market-hint-warning", !renewed && !isForcedExit);

  offers.forEach((o, i) => {
    const card = document.createElement("div");
    card.className = "offer-card card-enter" + (o.isCurrent ? " current" : "");
    card.style.animationDelay = (i * 90) + "ms";
    card.innerHTML = offerCardHTML(o.team, o.championship);
    // Elegir un equipo ficha para la próxima temporada Y la simula al momento,
    // pero primero se ve un pequeño gesto visual: la tarjeta elegida se marca
    // con un trazo blanco y las otras se apagan poco a poco (~0.9s).
    card.addEventListener("click", () => {
      if (wrap.classList.contains("offers-locked")) return;
      wrap.classList.add("offers-locked");
      Array.from(wrap.children).forEach((c) => {
        if (c === card) c.classList.add("offer-picked");
        else c.classList.add("offer-fading");
      });

      setTimeout(() => {
        const categoryChanged = o.championship !== state.championship || o.team.name !== state.team.name;
        const previousChampionship = state.championship;
        state.team = { name: o.team.name, strength: o.team.strength };
        state.championship = o.championship;
        simulateSeason(categoryChanged, previousChampionship);
      }, 900);
    });
    card.addEventListener("animationend", () => card.classList.remove("card-enter"), { once: true });
    wrap.appendChild(card);
  });

  if (state.age >= RETIRE_MIN_AGE) {
    const retireCard = document.createElement("div");
    retireCard.className = "offer-card retire-option card-enter";
    retireCard.style.animationDelay = (offers.length * 90) + "ms";
    retireCard.innerHTML = `
      <div class="offer-top">
        <span class="offer-team-name">Retirarme</span>
        <span class="offer-champ-badge">Fin de carrera</span>
      </div>
    `;
    retireCard.addEventListener("click", () => {
      showConfirm("¿Seguro que quieres retirarte y terminar tu carrera aquí?", () => retireCareer());
    });
    retireCard.addEventListener("animationend", () => retireCard.classList.remove("card-enter"), { once: true });
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
// Saltar de Moto3 a Moto2 es, a propósito, el ascenso más difícil de toda
// la carrera (el filtro real de la parrilla): se exige más tiempo asentado
// de normal (3 temporadas es lo habitual) y el ascenso relámpago es muy
// raro, no solo "poco frecuente".
function pickPromotionThreshold(fromChamp) {
  const r = Math.random();
  // Fase de formación: la idea es que la mayoría llegue a Moto3/SportBike
  // con 18 años (2 temporadas en la categoría júnior, empezando a los 16),
  // con solo un pequeño margen de variación — un ascenso relámpago con 17
  // años, o alguno que se asiente un poco más y llegue con 19.
  if (fromChamp === "MotoJunior" || fromChamp === "RedBullRookies" || fromChamp === "YamahaR3Cup") {
    if (r < 0.10) return 1;
    if (r < 0.90) return 2; // lo más habitual: llegar con 18 años
    return 3;
  }
  if (fromChamp === "Moto3") {
    if (r < 0.04) return 1;  // ascenso relámpago, muy raro
    if (r < 0.22) return 2;
    if (r < 0.70) return 3;  // lo más habitual, saliendo de Moto3
    return 4;
  }
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

// Tres temporadas SEGUIDAS sin entrar siquiera en el top 10 del
// campeonato, dentro de la categoría actual: no es tan grave como estar
// hundido (ver seasonsStuckBadly), pero sí motivo para que de vez en
// cuando te llegue alguna oferta para probar suerte en otro sitio, en vez
// de seguir estancado a mitad de tabla año tras año.
function seasonsStuckMediocre() {
  const h = state.history;
  if ((state.seasonsInChamp || 0) < 3 || h.length < 3) return false;
  const recent = h.slice(-3);
  return recent.every((s) => s.championship === state.championship && s.pos > 10);
}

// Categoría "hermana" de la otra escalera, al mismo nivel aproximado: la
// vía lateral que se ofrece cuando un piloto se estanca (ver
// seasonsStuckMediocre) en vez de subir o bajar dentro de su propia
// escalera.
const LATERAL_LADDER = {
  Moto3: "SportBike", SportBike: "Moto3",
  Moto2: "Supersport", Supersport: "Moto2",
  MotoGP: "WorldSBK", WorldSBK: "MotoGP",
};

// Campeonatos nacionales de Superbike (por debajo de WorldSBK). Cuando
// lleguen ofertas de esta vía, nunca deben aparecer los 3 a la vez: como
// mucho 2, y también puede no llegar ninguna.
const NATIONAL_CHAMPS = ["ESBK", "BSB", "CIV"];
function pickNationalOffers(minStrength, maxStrength, boosted = false) {
  // Distribución base: 0 o 1 lo más habitual, 2 más raro. Con "boosted"
  // (piloto de WorldSBK a los 33-34, viendo cómo se le acaba el nivel
  // máximo) baja un pelín la probabilidad de que no llegue ninguna oferta
  // nacional y sube un pelín la de que lleguen 2.
  const pool = boosted ? [0, 1, 1, 1, 2, 2] : [0, 0, 1, 1, 1, 2];
  const howMany = pool[randInt(0, pool.length - 1)];
  const chosen = [...NATIONAL_CHAMPS].sort(() => Math.random() - 0.5).slice(0, howMany);
  return chosen.map((champ) => ({
    team: pickTeamByStrength(champ, minStrength, maxStrength),
    championship: champ,
  }));
}

// Igual que pickNationalOffers, pero garantiza SIEMPRE al menos 1 oferta
// (nunca 0): se usa cuando el mercado debe asegurar como mínimo una vía
// de vuelta a un campeonato nacional, en vez de dejarlo al azar.
function pickGuaranteedNationalOffer(minStrength, maxStrength) {
  const champ = NATIONAL_CHAMPS[randInt(0, NATIONAL_CHAMPS.length - 1)];
  return { team: pickTeamByStrength(champ, minStrength, maxStrength), championship: champ };
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

  const lastGood = lastSeasonWasGood();
  // Para SUBIR de categoría hace falta haberlo hecho bien de verdad: podios,
  // victorias o top 5. (lastGood, más laxo, sigue valiendo para vías laterales.)
  const lastForPromo = state.history[state.history.length - 1];
  // Top 5 (top 4 en SportBike); solo con muchas victorias vale un 6º-7º.
  const promoPosCap = state.championship === "SportBike" ? 4 : 5;
  const promoGood = !!lastForPromo &&
    (lastForPromo.pos <= promoPosCap || (lastForPromo.pos <= 7 && lastForPromo.cg >= 3));
  const lastSeason = state.history[state.history.length - 1];

  // No renovación: si la temporada ha sido claramente mala (fuera del
  // top 15), a veces (no muy a menudo) tu propio equipo decide no seguir
  // contando contigo. No es la norma — la mayoría de las malas temporadas
  // el equipo sigue confiando en ti — pero es una posibilidad real. Se
  // decide una sola vez por temporada dentro de simulateSeason (ver
  // state.pendingNonRenewal), no aquí, para que el mercado sea estable
  // aunque el dashboard se vuelva a renderizar.
  // Encadenar muy malas temporadas (2 seguidas fuera del top 17) en el mismo
  // campeonato acaba provocando la salida: no hay renovación ni equipos de
  // la misma categoría, solo salidas a otros campeonatos.
  const badStreak = state.history.length >= 2 &&
    state.history.slice(-2).every((h) => h.championship === state.championship && h.pos > 17);
  const nonRenewal = !!state.pendingNonRenewal || badStreak;

  // Oferta de renovación: disponible siempre, salvo que el equipo decida
  // no renovar (ver nonRenewal más arriba), o que ganar (o quedar 2º) en
  // el Europeo de Moto2 o en Stock600 haga que la salida sea obligatoria
  // esta temporada — en ese caso ni siquiera se ofrece la renovación,
  // para que "quedarte" no sea una opción en absoluto (antes la tarjeta de
  // renovación aparecía igualmente, sin depender de las vías de salida de
  // arriba).
  const forcedExit = lastSeason &&
    ((state.championship === "Moto2Euro" && lastSeason.pos === 1) ||
     (state.championship === "Stock600" && lastSeason.pos === 1));
  if (!nonRenewal && !forcedExit) {
    offers.push({ team: currentTeamData, championship: state.championship, isCurrent: true });
  }

  // Si en la categoría actual ya te han dejado sin renovar un par de veces
  // (o más), es la escalera avisando de que este nivel no está funcionando:
  // el mercado GARANTIZA como mínimo una oferta para dar un paso atrás —
  // MotoGP → WorldSBK, WorldSBK → un campeonato nacional, Moto2 → Moto3,
  // Supersport → SportBike — en vez de depender solo del azar de
  // seasonsStuckBadly (que exige, además, estar hundido en la tabla).
  let repeatedNonRenewalPick = null;
  if ((state.nonRenewalsInChamp || 0) >= 2) {
    if (state.championship === "MotoGP") {
      repeatedNonRenewalPick = { team: pickTeamByStrength("WorldSBK", 69, 77), championship: "WorldSBK" };
    } else if (state.championship === "WorldSBK") {
      repeatedNonRenewalPick = pickGuaranteedNationalOffer(55, 70);
    } else if (state.championship === "Moto2") {
      repeatedNonRenewalPick = { team: pickTeamByStrength("Moto3", 54, 58), championship: "Moto3" };
    } else if (state.championship === "Supersport") {
      repeatedNonRenewalPick = { team: pickTeamByStrength("SportBike", 46, 54), championship: "SportBike" };
    }
  }

  // El ascenso de categoría exige, de normal, haber cumplido ya el tiempo
  // "esperado" en la categoría actual (2-3 temporadas lo más habitual, ver
  // pickPromotionThreshold) además de una temporada buena. Una temporada
  // realmente excepcional (título o un aluvión de podios) puede saltarse
  // ese tiempo mínimo, pero solo a veces — así hay sitio tanto para
  // ascensos rápidos como para carreras que se alargan más en la categoría.
  const tenure = state.seasonsInChamp || 1;
  const tenureOk = tenure >= (state.promotionReadyAt || 2);
  const exceptional = lastSeason && (lastSeason.pos === 1 || lastSeason.pod >= 10);

  // Quedar entre los 3 primeros del campeonato (o ser campeón) en Moto3,
  // Moto2 o Supersport es motivo suficiente por sí solo para recibir SÍ O
  // SÍ una oferta de la categoría superior, sin esperar al tiempo "mínimo"
  // habitual en la categoría (tenureOk). Es la excepción clara a la regla
  // general de ascenso gradual.
  const top3Finish = lastSeason && lastSeason.pos <= 3;
  const guaranteedPromotion = top3Finish &&
    (state.championship === "MotoJunior" || state.championship === "RedBullRookies" ||
     state.championship === "YamahaR3Cup" ||
     state.championship === "Moto3" || state.championship === "Moto2" ||
     state.championship === "Supersport" || state.championship === "SportBike");

  // Tiradas de salida del CAMPEÓN (Europeo de Moto2 y Stock 600). Son
  // funciones para poder repetirlas: al ser la salida obligatoria no hay
  // renovación, y las 2-3 tarjetas del mercado deben salir TODAS de estos
  // porcentajes (antes las que sobraban se rellenaban con equipos de la
  // misma categoría que acababas de ganar).
  const rollMoto2EuroChampion = () => {
    const r = Math.random();
    if (r < 0.83) return { team: pickTeamByStrength("Moto2", 68, 75), championship: "Moto2" };
    if (r < 0.93) return { team: pickTeamByStrength("Supersport", 69, 75), championship: "Supersport" };
    if (r < 0.94) return { team: pickTeamByStrength("SportBike", 50, 58), championship: "SportBike" };
    return pickGuaranteedNationalOffer(55, 68);
  };
  const rollStock600Champion = () => {
    const r = Math.random();
    if (r < 0.86) return { team: pickTeamByStrength("Moto2Euro", 58, 64), championship: "Moto2Euro" };
    if (r < 0.92) return pickGuaranteedNationalOffer(50, 64);
    if (r < 0.97) return { team: pickTeamByStrength("SportBike", 50, 58), championship: "SportBike" };
    return { team: pickTeamByStrength("Supersport", 66, 72), championship: "Supersport" };
  };

  const sameLevelCandidates = TEAMS[state.championship]
    .filter((t) => t.name !== state.team.name)
    .map((t) => ({ team: t, championship: state.championship }))
    .sort(() => Math.random() - 0.5);

  // Red Bull Rookies Cup y Yamaha R3 Cup son monomarca: no existe otro
  // equipo dentro de la misma categoría al que cambiarse. Si ese año no
  // hay ascenso ni ninguna otra vía especial, se ofrece como alternativa
  // equipos de otra categoría en vez de dejar el mercado con menos
  // tarjetas de las esperadas.
  if (!sameLevelCandidates.length && state.championship === "RedBullRookies") {
    // Red Bull Rookies apunta a Moto3: la alternativa natural es FIM
    // JuniorGP (misma escalera de motos).
    sameLevelCandidates.push(
      ...TEAMS.MotoJunior.map((t) => ({ team: t, championship: "MotoJunior" }))
        .sort(() => Math.random() - 0.5)
    );
  } else if (!sameLevelCandidates.length && state.championship === "YamahaR3Cup") {
    // AJUSTE (nuevo): R3 Cup apunta a la escalera de Superbikes (SportBike),
    // no a la de motos — así que ahora la alternativa es mayoritariamente
    // SportBike o Stock600, con muy poco peso para JuniorGP (antes era la
    // única opción, prácticamente garantizada).
    const alt = [
      ...TEAMS.SportBike.map((t) => ({ team: t, championship: "SportBike" })),
      ...TEAMS.Stock600.map((t) => ({ team: t, championship: "Stock600" })),
      ...[...TEAMS.MotoJunior].sort(() => Math.random() - 0.5).slice(0, 2)
        .map((t) => ({ team: t, championship: "MotoJunior" })),
    ];
    sameLevelCandidates.push(...alt.sort(() => Math.random() - 0.5));
  }

  // Con el retiro ya disponible, solo se añade 1 oferta extra (2 en total
  // junto con la renovación) para que el retiro sea la tercera opción,
  // no una tarjeta añadida aparte. Si no ha habido renovación (o la salida
  // es obligatoria, ver forcedExit), hace falta una oferta extra más (no
  // hay "renovación" que cuente como una de las tres tarjetas).
  const noRenewalCard = nonRenewal || forcedExit;
  const extraPicksNeeded = state.age >= RETIRE_MIN_AGE
    ? (noRenewalCard ? 2 : 1)
    : (noRenewalCard ? 3 : 2);

  // Equipos de la categoría superior ordenados por nivel; el tramo que se
  // ofrece depende del resultado: campeón → los mejores, podio → buenos,
  // top 5 → pelotón, peor → los de abajo. Así un 5º no recibe un equipo oficial.
  const promoWindowFor = (champ) => {
    const sorted = [...(TEAMS[champ] || [])].sort((a, b) => b.strength - a.strength);
    const n = sorted.length;
    const pos = lastSeason ? lastSeason.pos : 8;
    let [f, t] = pos === 1 ? [0, 0.45] : pos <= 3 ? [0.1, 0.7] : pos <= 5 ? [0.4, 1] : [0.6, 1];
    // Red Bull Rookies Cup: los mejores resultados dan acceso a equipos de
    // Moto3 un pelín mejores que desde otras categorías.
    if (state.championship === "RedBullRookies") {
      if (pos === 1) [f, t] = [0, 0.35];
      else if (pos <= 3) [f, t] = [0.05, 0.6];
    }
    const win = sorted.slice(Math.floor(f * n), Math.max(Math.ceil(t * n), Math.floor(f * n) + 1));
    return win.sort(() => Math.random() - 0.5);
  };

  const buildSpecialPicks = () => {
  let targetChamp = null;
  if (promoGood && (tenureOk || (exceptional && Math.random() < 0.25) || guaranteedPromotion)) {
    // Fase de formación: FIM JuniorGP y Red Bull Rookies Cup desembocan en
    // Moto3; Yamaha R3 Cup desemboca en SportBike.
    if (state.championship === "MotoJunior" || state.championship === "RedBullRookies") {
      targetChamp = "Moto3";
    } else if (state.championship === "YamahaR3Cup") {
      // Si queda entre 2º y 4º (top 4 pero sin ser campeón), hay
      // probabilidad de que la vía sea Stock600 en vez de SportBike;
      // siendo campeón, o fuera del top 4, la vía sigue siendo la de
      // siempre (SportBike). AJUSTE (pelín más Stock600): quedando 2º, las
      // dos vías pesan exactamente igual (50/50); quedando 3º o 4º, la
      // probabilidad de Stock600 también sube un poco respecto a antes.
      const pos = lastSeason && lastSeason.pos;
      const stockChance = pos === 2 ? 0.50 : (pos === 3 || pos === 4) ? 0.42 : 0;
      targetChamp = (stockChance > 0 && Math.random() < stockChance) ? "Stock600" : "SportBike";
    // Ninguna oferta de Moto2 puede llegar antes de los 18 años, por muy
    // bien que vaya la temporada — ni siquiera con un ascenso meteórico.
    } else if (state.championship === "Moto3") {
      if (state.age >= 18) targetChamp = "Moto2";
    } else if (state.championship === "Moto2") {
      // AJUSTE (nuevo): fuera del top 7 del campeonato, ninguna oferta de
      // MotoGP puede llegar esta temporada, aunque el resto de requisitos
      // (temporada "buena", tiempo cumplido, etc.) se cumplan.
      // AJUSTE: antes bastaba con el top 7. Ahora: top 3 (ascenso directo) o
      // top 5 habiendo cumplido al menos 2 temporadas en Moto2.
      const m2pos = lastSeason ? lastSeason.pos : 99;
      // LÓGICA: MotoGP aprieta con la edad. Hasta 25 años vale el podio (o
      // top 5 con 2+ años y 24 o menos); con 26-27 solo siendo top 2; con
      // 28-29 solo siendo campeón; más allá, nunca desde Moto2.
      const gpAgeOk = state.age <= 25 || (state.age <= 27 && m2pos <= 2) || (state.age <= 29 && m2pos === 1);
      if (gpAgeOk && (m2pos <= 3 || (m2pos <= 5 && tenure >= 2 && state.age <= 24))) targetChamp = "MotoGP";
    }
    else if (state.championship === "Supersport") {
      // LÓGICA: siendo joven (<=22) subir con un 3º/2º es normal (4º-5º, muy
      // poco probable); siendo más mayor, o ganas o lo tienes difícil.
      const sp = lastSeason ? lastSeason.pos : 99;
      const r = Math.random();
      const young = state.age <= 22;
      if (young ? (sp <= 3 || (sp <= 5 && r < 0.08))
                : (sp === 1 || (sp === 2 && r < 0.25) || (sp === 3 && r < 0.10))) targetChamp = "WorldSBK";
    }
    else if (state.championship === "SportBike") targetChamp = "Supersport";
  }

  // Vía especial: piloto puntero de WorldSBK (gana carreras o está entre
  // los 2 primeros del campeonato) puede recibir ofertas de MotoGP — pero
  // solo hasta los 28 años. Pasada esa edad, por muy bien que le siga
  // yendo en Superbikes, esa puerta ya no se abre. Y ni siquiera con el
  // tope de edad cumplido es un hecho garantizado: hay muy buena
  // probabilidad, pero no el 100% de las veces.
  // Caso especial dentro de esta vía: ser CAMPEÓN de WorldSBK siendo menor
  // de 24 años es un resultado tan fuera de lo normal para esa edad que la
  // probabilidad de recibir esa oferta de MotoGP sube mucho (aunque
  // tampoco al 100%).
  if (!targetChamp && state.championship === "WorldSBK" && state.age < 24 &&
      lastSeason && lastSeason.pos === 1 && Math.random() < 0.70) {
    targetChamp = "MotoGP";
  } else if (!targetChamp && state.championship === "WorldSBK" && state.age <= 28 && lastSeason &&
      ((lastSeason.pos === 1 && Math.random() < 0.50) ||
       (lastSeason.pos === 2 && lastSeason.cg >= 3 && Math.random() < 0.22))) {
    targetChamp = "MotoGP";
  }

  // Ascenso desde un campeonato NACIONAL (ESBK/BSB/CIV): un Top 1 o Top 2
  // es un resultado excepcional que, por sí solo, abre la puerta de vuelta
  // a los campeonatos internacionales — no hace falta esperar ningún
  // tiempo "mínimo" en la categoría, es justo la vía de segunda
  // oportunidad. A DÓNDE vuelve depende de su nivel real (OVR), no solo
  // del resultado: con una media decente, la vía es WorldSBK (a su nivel
  // real de pelotón); con una media más normal (un campeón "de la casa",
  // sin tanto nivel de fondo), la vía es Supersport, un peldaño más
  // realista para su OVR. Si además el piloto es joven y con margen real
  // de mejora (potencial alto, algo que el jugador nunca ve directamente),
  // también cabe la posibilidad de que a un piloto con media decente le
  // llegue, aparte, una oportunidad en Supersport.
  let nationalPromoWsbk = null;
  let nationalPromoSsp = null;
  if (NATIONAL_CHAMPS.includes(state.championship) && lastSeason && lastSeason.pos <= 2) {
    const decentOvr = state.ovr >= 74;
    // AJUSTE (nuevo): a partir de los 35 años, la puerta de vuelta a
    // Superbikes ya no se abre por muy bien que vaya la temporada —
    // demasiado tarde para ese salto. La vía de Supersport, en cambio,
    // sigue disponible.
    const tooOldForSuperbikes = state.age >= 35;
    if (decentOvr && !tooOldForSuperbikes) {
      nationalPromoWsbk = { team: pickTeamByStrength("WorldSBK", 69, 78), championship: "WorldSBK" };
      const youngWithPotential = state.age <= 27 && state.potential >= 85;
      if (youngWithPotential && Math.random() < 0.35) {
        nationalPromoSsp = { team: pickTeamByStrength("Supersport", 70, 76), championship: "Supersport" };
      }
    } else {
      nationalPromoSsp = {
        team: pickTeamByStrength("Supersport", decentOvr ? 70 : 67, decentOvr ? 76 : 73),
        championship: "Supersport",
      };
    }
  }

  // Salida lateral a WorldSBK: dos vías distintas.
  //  - Veterano de MotoGP (32+) que ya no está ganando: puede refugiarse en
  //    un equipo de Superbikes acorde a su nivel, en vez de languidecer en
  //    la categoría reina.
  //  - Piloto de Moto2 que se queda a mitad de tabla (4º o peor, sin
  //    ascenso a MotoGP): la vía lateral YA NO es siempre la misma oferta.
  //    La mayoría de las veces el mercado simplemente ofrece otro equipo
  //    de Moto2 (ver sameLevelCandidates más abajo); a veces (no siempre)
  //    aparece una oferta de WorldSBK, y muy de vez en cuando una de
  //    Supersport en su lugar.
  let wsbkPick = null;
  if (state.championship === "MotoGP" && state.age >= 32 && !lastGood && Math.random() < 0.6) {
    const [lo, hi] = state.ovr >= 85 ? [76, 82] : [69, 77];
    wsbkPick = { team: pickTeamByStrength("WorldSBK", lo, hi), championship: "WorldSBK" };
  }

  // Piloto de Moto2 que no triunfa (fuera del Top 5) a partir de su 2ª o 3ª
  // temporada en la categoría (el umbral varía cada vez, para que no sea
  // siempre el mismo punto de corte): el mercado reparte, al azar, entre 4
  // caminos — un campeonato nacional, el salto lateral a Supersport, la
  // vía del Europeo de Moto2, o simplemente quedarse en Moto2 (lo más
  // habitual, relleno luego con sameLevelCandidates). Las proporciones
  // varían de tirada en tirada, así que ninguna partida se siente igual.
  // AJUSTE (nuevo): más ofertas de Supersport, y un poco más las
  // nacionales — sobre todo si además estás fuera del top 7 (donde ya no
  // puede llegar ninguna oferta de MotoGP esa temporada).
  let moto2StuckPick = null;
  if (state.championship === "Moto2" && !targetChamp && lastSeason && lastSeason.pos > 5) {
    const stuckGate = tenure >= (Math.random() < 0.5 ? 2 : 3);
    if (stuckGate) {
      const outsideTop7 = lastSeason.pos > 7;
      const nationalChance = outsideTop7 ? 0.17 : 0.14;
      const sspWidth = outsideTop7 ? 0.23 : 0.18;
      const euroWidth = 0.23;
      const r = Math.random();
      if (r < nationalChance) {
        moto2StuckPick = pickGuaranteedNationalOffer(55, 70);
      } else if (r < nationalChance + sspWidth) {
        moto2StuckPick = { team: pickTeamByStrength("Supersport", 67, 74), championship: "Supersport" };
      } else if (r < nationalChance + sspWidth + euroWidth) {
        moto2StuckPick = { team: pickTeamByStrength("Moto2Euro", 55, 62), championship: "Moto2Euro" };
      }
      // El resto: se queda en Moto2, sin vía especial esta temporada (39%
      // dentro del top 7, 29% fuera de él).
    }
  }

  // Salida lateral a Supersport: piloto de Moto3 que no destaca (temporada
  // no "buena") puede dar el salto a la escalera de Superbikes en vez de
  // seguir estancado en el Mundial de motos. Es la puerta de entrada a esa
  // escalera, de la que luego se puede ascender a WorldSBK.
  let sspPick = null;
  if (state.championship === "Moto3" && !lastGood && Math.random() < 0.5) {
    sspPick = { team: pickTeamByStrength("Supersport", 68, 73), championship: "Supersport" };
  }

  // Piloto de Moto3 que "cumple" pero no destaca (fuera del Top 5 a partir
  // de su 2ª temporada en la categoría): con menos frecuencia que el caso
  // equivalente en Moto2 (ver moto2StuckPick), también puede llegarle una
  // oferta del Europeo de Moto2 como vía alternativa.
  let moto3ToEuroPick = null;
  if (state.championship === "Moto3" && tenure >= 2 && lastSeason && lastSeason.pos > 5 &&
      Math.random() < 0.12) { // AJUSTE: 3ª temp/top3/10% → 2ª temp/top5/16% → 12%
    moto3ToEuroPick = { team: pickTeamByStrength("Moto2Euro", 55, 61), championship: "Moto2Euro" };
  }

  // Dos temporadas SEGUIDAS fuera del Top 4 en Moto3 (independientemente
  // de la edad y de cuánto tiempo lleve ya en la categoría): motivo aparte
  // para que, con cierta probabilidad — no siempre, pero real — también le
  // pueda llegar una oferta del Europeo de Moto2. Es una vía distinta e
  // independiente de moto3ToEuroPick (esa exige 2ª temporada o más y solo
  // mira la última); esta mira directamente las 2 últimas, sin más
  // condición que esa racha.
  let moto3TwoSeasonsEuroPick = null;
  const moto3StuckTop4 = state.championship === "Moto3" && state.history.length >= 2 &&
    state.history.slice(-2).every((s) => s.championship === "Moto3" && s.pos > 4);
  if (moto3StuckTop4 && Math.random() < 0.18) {
    moto3TwoSeasonsEuroPick = { team: pickTeamByStrength("Moto2Euro", 55, 61), championship: "Moto2Euro" };
  }

  // Posibilidad MÍNIMA de saltar directamente desde la fase de formación
  // (FIM JuniorGP / Red Bull Rookies Cup) al Europeo de Moto2, sin pasar
  // por Moto3, si la temporada ha sido excepcional (podio del campeonato).
  // Es una rareza a propósito, bastante menos frecuente que el resto de
  // vías hacia esta categoría.
  let juniorToEuroPick = null;
  if ((state.championship === "MotoJunior" || state.championship === "RedBullRookies") &&
      lastSeason && lastSeason.pos <= 3 && Math.random() < 0.04) { // AJUSTE: 0.05 → 0.07
    juniorToEuroPick = { team: pickTeamByStrength("Moto2Euro", 55, 60), championship: "Moto2Euro" };
  }

  // Piloto de FIM JuniorGP / Red Bull Rookies Cup que a los 18 años sigue
  // sin subir a Moto3 (no ha habido ascenso normal esta temporada, ver
  // "!targetChamp" — quedar 1º o 2º YA da el ascenso a Moto3 de forma
  // determinista más arriba, así que este bloque nunca llega a activarse
  // en ese caso: las opciones de quedarte en Junior/Red Bull con un
  // resultado así son, de hecho, cero). En vez de dejarlo estancado sin
  // más, el mercado reparte al azar entre 5 caminos — un pequeño margen de
  // llegar igualmente a Moto3, las vías laterales a Stock600, SportBike o
  // el Europeo de Moto2 (con más peso las tres juntas que Moto3), o
  // simplemente seguir un año más en la categoría júnior.
  let juniorStuck18Pick = null;
  if ((state.championship === "MotoJunior" || state.championship === "RedBullRookies") &&
      state.age >= 17 && !targetChamp) {
    const r = Math.random();
    // AJUSTE (nuevo): se añade el Europeo de Moto2 como tercera vía
    // lateral, y cuanto más se alarga la fase júnior, menos probable Moto3
    // y más las tres vías laterales — a los 19 años o más la diferencia ya
    // es muy marcada (Moto3 prácticamente residual).
    const olderThan18 = state.age >= 19;
    const moto3Chance = olderThan18 ? 0.04 : 0.08;
    const stockWidth = olderThan18 ? 0.38 : 0.34;
    const sportbikeWidth = olderThan18 ? 0.36 : 0.32;
    const euroWidth = olderThan18 ? 0.07 : 0.06;
    if (r < moto3Chance) {
      juniorStuck18Pick = { team: pickTeamByStrength("Moto3", 50, 55), championship: "Moto3" };
    } else if (r < moto3Chance + stockWidth) {
      juniorStuck18Pick = { team: pickTeamByStrength("Stock600", 46, 54), championship: "Stock600" };
    } else if (r < moto3Chance + stockWidth + sportbikeWidth) {
      juniorStuck18Pick = { team: pickTeamByStrength("SportBike", 46, 54), championship: "SportBike" };
    } else if (r < moto3Chance + stockWidth + sportbikeWidth + euroWidth) {
      juniorStuck18Pick = { team: pickTeamByStrength("Moto2Euro", 50, 56), championship: "Moto2Euro" };
    }
    // El resto: sigue un año más en la categoría júnior, sin vía especial
    // (8% a los 18, solo un 4% a partir de los 19).
  }

  if (juniorStuck18Pick && Math.random() > ({ 16: 0.10, 17: 0.40, 18: 0.85 }[state.age] ?? 1)) juniorStuck18Pick = null;

  // Piloto de Supersport que queda 5º o peor, a partir de su 2ª temporada
  // en la categoría, independientemente de la edad: también puede
  // llegarle alguna oferta del Europeo de Moto2 como vía alternativa.
  let sspToEuroPick = null;
  if (state.championship === "Supersport" && tenure >= 2 && lastSeason && lastSeason.pos >= 5 &&
      Math.random() < 0.13) {
    sspToEuroPick = { team: pickTeamByStrength("Moto2Euro", 56, 62), championship: "Moto2Euro" };
  }

  // Salto de Supersport a Moto2: la vía normal desde Supersport es subir a
  // WorldSBK, pero si el piloto destaca MUCHO (campeón o un aluvión de
  // victorias) existe una pequeña posibilidad de que le llegue una oferta
  // para dar el salto al Mundial de motos en su lugar. Poco frecuente
  // a propósito — es la excepción, no la norma — y tampoco antes de los
  // 18 años, igual que cualquier otra oferta de Moto2.
  let sspToMoto2Pick = null;
  if (state.championship === "Supersport" && state.age >= 18 &&
      lastSeason && (lastSeason.pos === 1 || lastSeason.cg >= 4) && Math.random() < 0.12) {
    sspToMoto2Pick = { team: pickTeamByStrength("Moto2", 68, 76), championship: "Moto2" };
  }

  // Salto de SportBike a Moto3: la vía normal desde SportBike es subir a
  // Supersport, pero si el piloto destaca MUCHO (campeón o un aluvión de
  // victorias) existe una pequeña posibilidad de que un equipo de Moto3 se
  // fije en él y le ofrezca dar el salto directo al Mundial de motos, sin
  // pasar por Supersport. Poco frecuente a propósito — es la excepción, no
  // la norma — igual que el salto equivalente de Supersport a Moto2.
  let spbToMoto3Pick = null;
  if (state.championship === "SportBike" &&
      lastSeason && (lastSeason.pos === 1 || lastSeason.cg >= 4) && Math.random() < 0.12) {
    spbToMoto3Pick = { team: pickTeamByStrength("Moto3", 50, 55), championship: "Moto3" };
  }

  // Además del salto (raro) a Moto3, un piloto destacado de SportBike
  // también tiene alguna posibilidad de que le llegue una oferta del
  // Europeo de Moto2 — se suma a su vía normal de ascenso a Supersport,
  // no la sustituye.
  let spbToMoto2EuroPick = null;
  if (state.championship === "SportBike" &&
      lastSeason && (lastSeason.pos === 1 || lastSeason.cg >= 4) && Math.random() < 0.13) { // AJUSTE: 0.10 → 0.13
    spbToMoto2EuroPick = { team: pickTeamByStrength("Moto2Euro", 55, 60), championship: "Moto2Euro" };
  }

  // Piloto de SportBike que queda fuera del top 6 del campeonato: aparte
  // de la vía normal (quedarse o, si la temporada es buena, ascender a
  // Supersport), existe una probabilidad de que le llegue una oferta de
  // Stock600 como vía alternativa de nivel similar.
  let spbToStock600Pick = null;
  if (state.championship === "SportBike" && lastSeason && lastSeason.pos > 6 &&
      Math.random() < 0.32) { // AJUSTE (pelín más Stock600): 0.28 → 0.32
    spbToStock600Pick = { team: pickTeamByStrength("Stock600", 46, 54), championship: "Stock600" };
  }

  // AJUSTE (nuevo): salto lateral desde Moto2. La vía normal sigue siendo
  // ascender a MotoGP, pero un piloto destacado (campeón o un aluvión de
  // victorias) también tiene una pequeña posibilidad de recibir una oferta
  // de WorldSBK (poquito) o, algo más a menudo, de Supersport.
  let moto2ToWsbkPick = null;
  if (state.championship === "Moto2" &&
      lastSeason && (lastSeason.pos === 1 || lastSeason.cg >= 4) && Math.random() < 0.08) {
    moto2ToWsbkPick = { team: pickTeamByStrength("WorldSBK", 74, 80), championship: "WorldSBK" };
  }
  let moto2ToSspPick = null;
  if (state.championship === "Moto2" &&
      lastSeason && (lastSeason.pos === 1 || lastSeason.cg >= 4) && Math.random() < 0.14) {
    moto2ToSspPick = { team: pickTeamByStrength("Supersport", 70, 76), championship: "Supersport" };
  }

  // Salida de Stock600, según cómo termine la temporada:
  //  - Campeón: AJUSTE — sí o sí oferta del Europeo de Moto2, y prácticamente
  //    ninguna posibilidad de quedarse (ver más abajo, no hay ni una
  //    probabilidad que lo frene).
  //  - 2º: AJUSTE — ahora también garantizado (antes 68% de probabilidad).
  //  - 3º: AJUSTE — sube a 72% (antes 45%), "top3 más fácil de salir".
  //  - 4º-8º: pequeña posibilidad de salir (sin cambios), con más variedad
  //    de destino: la mayoría de las veces un equipo de SportBike (nivel
  //    parecido), y alguna vez el Europeo de Moto2.
  //  - 25 años o más (y no ha sido ni 1º, 2º ni 3º esta vez): normalmente
  //    se le manda hacia un campeonato nacional, con una pequeña
  //    posibilidad de que sea Supersport en su lugar — o, la mayoría de
  //    las veces que no se activa ninguna de las dos, simplemente sigue
  //    en Stock600.
  let stock600ExitPick = null;
  if (state.championship === "Stock600" && lastSeason) {
    const pos = lastSeason.pos;
    const r = Math.random();
    const natPick = () => pickGuaranteedNationalOffer(50, 64);
    const spbPick = () => ({ team: pickTeamByStrength("SportBike", 50, 58), championship: "SportBike" });
    if (pos === 1) {
      // Campeón: Europeo de Moto2 prácticamente siempre (salida obligatoria,
      // ver forcedExit); muy remoto Supersport, y poco una vía nacional.
      stock600ExitPick = rollStock600Champion();
    } else if (pos === 2 || pos === 3) {
      // Podio: Europeo de Moto2 con probabilidad alta; opciones reducidas
      // de nacional o SportBike; el resto, sigue (renovación disponible).
      if (r < 0.70) stock600ExitPick = { team: pickTeamByStrength("Moto2Euro", 55, 62), championship: "Moto2Euro" };
      else if (r < 0.83) stock600ExitPick = natPick();
      else if (r < 0.95) stock600ExitPick = spbPick();
    } else if (pos === 4 || pos === 5) {
      // 4º-5º: lo normal es repetir en Stock600 si eres joven; con 26+ años
      // y 3+ temporadas en el campeonato, la renovación se complica (ver
      // pendingNonRenewal en simulateSeason) y lo habitual es salir hacia
      // un nacional o SportBike (presupuesto/edad).
      const veteran = state.age >= 26 && (state.seasonsInSeries || 1) >= 3;
      if (r < (veteran ? 0.70 : 0.15)) stock600ExitPick = Math.random() < 0.6 ? natPick() : spbPick();
    } else if (pos >= 6 && pos <= 8 && r < 0.22) {
      stock600ExitPick = Math.random() < 0.7 ? spbPick() : { team: pickTeamByStrength("Moto2Euro", 52, 58), championship: "Moto2Euro" };
    }
  }
  let stock600VeteranPick = null;
  let stock600VeteranSspPick = null;
  if (state.championship === "Stock600" && state.age >= 25 && !stock600ExitPick &&
      lastSeason && lastSeason.pos >= 6 &&
      Math.random() < 0.60) { // AJUSTE: 0.55 → 0.60
    if (Math.random() < 0.15) {
      stock600VeteranSspPick = { team: pickTeamByStrength("Supersport", 66, 72), championship: "Supersport" };
    } else {
      stock600VeteranPick = pickGuaranteedNationalOffer(50, 64);
    }
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
    } else if (state.championship === "Supersport") {
      demotionPick = { team: pickTeamByStrength("SportBike", 46, 54), championship: "SportBike" };
    }
  }

  // Estancamiento: 3 temporadas seguidas sin top 10 en la categoría actual
  // pueden traer, de vez en cuando, una oferta lateral hacia la escalera
  // hermana (ver LATERAL_LADDER) a un nivel de equipo parecido al actual —
  // ni ascenso ni descenso, solo un cambio de aires cuando el nivel actual
  // no acaba de cuajar.
  let stagnationPick = null;
  if (seasonsStuckMediocre() && Math.random() < 0.4) {
    const target = LATERAL_LADDER[state.championship];
    if (target) {
      const cs = state.team.strength;
      stagnationPick = { team: pickTeamByStrength(target, cs - 10, cs + 6), championship: target };
    }
  }

  // Salida del Europeo de Moto2, según cómo termine la temporada:
  //  - Campeón: salida OBLIGATORIA (ver forcedExit). 84% Mundial de Moto2,
  //    6% Supersport, 4% SportBike, 6% campeonato nacional.
  //  - 2º-3º: Mundial de Moto2 con probabilidad alta (60% el 2º, 50% el
  //    3º); Supersport 12%, SportBike 10%, nacional 13%; el resto repite en
  //    el Europeo para ir a por el título (renovación disponible).
  //  - 4º-5º: lo normal es repetir (más aún siendo joven); vía habitual
  //    para relanzarse: Supersport, SportBike o nacional. A partir de 26
  //    años (salida por edad) aumentan mucho las salidas.
  //  - 6º o peor: igual que antes (nacional o Supersport, más peso en 26+).
  let moto2EuroExitPick = null;
  if (state.championship === "Moto2Euro" && lastSeason) {
    const pos = lastSeason.pos;
    const olderRider = state.age >= 26;
    const r = Math.random();
    const m2 = (lo, hi) => ({ team: pickTeamByStrength("Moto2", lo, hi), championship: "Moto2" });
    const ssp = (lo, hi) => ({ team: pickTeamByStrength("Supersport", lo, hi), championship: "Supersport" });
    const spb = () => ({ team: pickTeamByStrength("SportBike", 50, 58), championship: "SportBike" });
    if (pos === 1) {
      moto2EuroExitPick = rollMoto2EuroChampion();
    } else if (pos === 2 || pos === 3) {
      const moto2Chance = pos === 2 ? 0.60 : 0.50;
      if (r < moto2Chance) moto2EuroExitPick = m2(68, 73);
      else if (r < moto2Chance + 0.12) moto2EuroExitPick = ssp(67, 74);
      else if (r < moto2Chance + 0.22) moto2EuroExitPick = spb();
      else if (r < moto2Chance + 0.35) moto2EuroExitPick = pickGuaranteedNationalOffer(53, 68);
    } else if (pos === 4 || pos === 5) {
      const sspW = olderRider ? 0.17 : 0.10, spbW = olderRider ? 0.13 : 0.08, natW = olderRider ? 0.25 : 0.12;
      if (r < sspW) moto2EuroExitPick = ssp(65, 72);
      else if (r < sspW + spbW) moto2EuroExitPick = spb();
      else if (r < sspW + spbW + natW) moto2EuroExitPick = pickGuaranteedNationalOffer(50, 65);
    } else {
      if (r < (olderRider ? 0.40 : 0.20)) moto2EuroExitPick = pickGuaranteedNationalOffer(50, 65);
      else if (r < (olderRider ? 0.55 : 0.35)) moto2EuroExitPick = ssp(65, 71);
    }
  }

  // Vía hacia los campeonatos NACIONALES de Superbike (ESBK, BSB, CIV) —
  // refugio para quien no consigue llegar (o mantenerse) en los
  // campeonatos superiores. Tres puertas distintas de entrada:
  //   1) Desde Moto2 o Supersport, a partir de los 24-25 años, si esta
  //      temporada no ha traído ascenso (no hay targetChamp).
  //   2) Específica de Supersport: 4+ temporadas estancado en la
  //      categoría, o 26 años o más, sin nivel para subir a Moto2 ni a
  //      WorldSBK (tampoco hay targetChamp ni salida lateral a Moto2).
  //   3) Desde WorldSBK, a los 33-34 años, cuando el piloto empieza a
  //      quedar de forma habitual fuera del Top 10 — simula el final de
  //      su carrera al máximo nivel.
  // Nunca llegan las 3 ofertas nacionales a la vez (ver pickNationalOffers).
  const seasonsStuck4 = (state.seasonsInChamp || 0) >= 4;
  const outsideTop10Recently = state.history.length >= 2 &&
    state.history.slice(-2).every((s) => s.championship === state.championship && s.pos > 10);
  // 3 temporadas SEGUIDAS fuera del Top 10 en WorldSBK, sin importar la
  // edad: motivo suficiente por sí solo para GARANTIZAR como mínimo una
  // oferta de un campeonato nacional (antes esto solo se activaba a partir
  // de los 33-34 años, ver worldSbkCareerFading justo debajo).
  const outsideTop10For3 = state.championship === "WorldSBK" && state.history.length >= 3 &&
    state.history.slice(-3).every((s) => s.championship === "WorldSBK" && s.pos > 10);
  const ageGate24_25 = state.age >= 25 || (state.age === 24 && Math.random() < 0.5);
  const ageGate33_34 = state.age >= 34 || (state.age === 33 && Math.random() < 0.5);
  const stuckWithoutPromotion =
    (state.championship === "Moto2" || state.championship === "Supersport") &&
    ageGate24_25 && !targetChamp;
  const supersportDeadEnd =
    state.championship === "Supersport" && !targetChamp && !sspToMoto2Pick &&
    (seasonsStuck4 || state.age >= 26);
  const worldSbkCareerFading =
    state.championship === "WorldSBK" && ageGate33_34 && outsideTop10Recently;

  // Dos empujoncitos ligeros más a la vía nacional (nada exagerado, solo
  // un poco más de probabilidad de verla):
  //  - En WorldSBK, con 33 años o más, si esta temporada NO has quedado
  //    entre los 3 primeros — antes hacía falta llevar 2 temporadas
  //    SEGUIDAS fuera del Top 10 (ver worldSbkCareerFading); esto es más
  //    laxo y cubre también al piloto veterano que simplemente ya no está
  //    entre los mejores, sin estar hundido del todo.
  //  - En Supersport, si quedas fuera del Top 5 del campeonato.
  const wsbk33PlusNotTop3 =
    state.championship === "WorldSBK" && state.age >= 33 &&
    lastSeason && lastSeason.pos > 3 && Math.random() < 0.25;
  const sspOutsideTop5 =
    state.championship === "Supersport" &&
    lastSeason && lastSeason.pos > 5 && Math.random() < 0.18;

  let nationalPicks = [];
  if (outsideTop10For3) {
    // Garantizado: como mínimo 1, nunca 0 (a diferencia de las otras vías).
    nationalPicks = pickNationalOffers(55, 70, true);
    if (nationalPicks.length === 0) nationalPicks = [pickGuaranteedNationalOffer(55, 70)];
  } else if (stuckWithoutPromotion || supersportDeadEnd || worldSbkCareerFading ||
             wsbk33PlusNotTop3 || sspOutsideTop5) {
    nationalPicks = pickNationalOffers(55, 70);
  }

  // AJUSTE (nuevo): salto lateral entre campeonatos nacionales (ESBK/BSB/
  // CIV) — posibilidad real pero baja de cambiar a otro nacional distinto
  // sin que sea ni ascenso ni descenso, solo variedad dentro del mismo
  // nivel (nunca al mismo campeonato en el que ya estás).
  let nationalLateralPick = null;
  if (NATIONAL_CHAMPS.includes(state.championship) && Math.random() < 0.12) {
    const others = NATIONAL_CHAMPS.filter((c) => c !== state.championship);
    const champ = others[randInt(0, others.length - 1)];
    const cs = state.team.strength;
    nationalLateralPick = { team: pickTeamByStrength(champ, cs - 8, cs + 8), championship: champ };
  }

  // Salidas laterales "de base": no dependen de que la temporada vaya mal
  // ni de ser un campeón, solo de que puedan pasar (probabilidades bajas).
  const baselineLaterals = [];
  const addBase = (chance, to, lo, hi) => {
    if (Math.random() < chance) {
      baselineLaterals.push({ team: pickTeamByStrength(to, lo, hi), championship: to });
    }
  };
  if (state.championship === "Moto2") {
    addBase(0.06, "Supersport", 66, 74);
    addBase(0.03, "WorldSBK", 69, 76);
  } else if (state.championship === "Moto3") {
    addBase(0.04, "SportBike", 46, 54);
    addBase(0.03, "Supersport", 66, 72);
  } else if (state.championship === "MotoGP") {
    addBase(0.03, "WorldSBK", 72, 80);
  } else if (state.championship === "Supersport" && state.age >= 18) {
    addBase(0.03, "Moto2", 66, 72);
  }

  const picks = [];
  if (targetChamp) {
    const promoCandidates = promoWindowFor(targetChamp)
      .map((t) => ({ team: t, championship: targetChamp, promo: true }));
    if (promoCandidates.length) picks.push(promoCandidates[0]);
  }
  baselineLaterals.forEach((p) => picks.push(p));
  if (wsbkPick) picks.push(wsbkPick);
  if (sspPick) picks.push(sspPick);
  if (nationalPromoWsbk) picks.push(nationalPromoWsbk);
  if (nationalPromoSsp) picks.push(nationalPromoSsp);
  if (sspToMoto2Pick) picks.push(sspToMoto2Pick);
  if (spbToMoto3Pick) picks.push(spbToMoto3Pick);
  if (moto2ToWsbkPick) picks.push(moto2ToWsbkPick);
  if (moto2ToSspPick) picks.push(moto2ToSspPick);
  if (moto2StuckPick) picks.push(moto2StuckPick);
  if (moto3ToEuroPick) picks.push(moto3ToEuroPick);
  if (moto3TwoSeasonsEuroPick) picks.push(moto3TwoSeasonsEuroPick);
  if (juniorToEuroPick) picks.push(juniorToEuroPick);
  if (state.championship === "MotoJunior" && lastSeason && lastSeason.pos >= 4 && lastSeason.pos <= 5 &&
      tenure === 1 && state.age < 17 && Math.random() < 0.5) {
    picks.push({ team: TEAMS.RedBullRookies[0], championship: "RedBullRookies" });
  }
  if (juniorStuck18Pick) picks.push(juniorStuck18Pick);
  if (sspToEuroPick) picks.push(sspToEuroPick);
  if (spbToMoto2EuroPick) picks.push(spbToMoto2EuroPick);
  if (spbToStock600Pick) picks.push(spbToStock600Pick);
  if (stock600ExitPick) picks.push(stock600ExitPick);
  if (stock600VeteranPick) picks.push(stock600VeteranPick);
  if (stock600VeteranSspPick) picks.push(stock600VeteranSspPick);
  if (moto2EuroExitPick) picks.push(moto2EuroExitPick);
  if (nationalLateralPick) picks.push(nationalLateralPick);
  if (demotionPick) picks.push(demotionPick);
  if (stagnationPick) picks.push(stagnationPick);
  nationalPicks.forEach((p) => picks.push(p));

  return picks;
  };

  // Cada oferta extra sale de su PROPIA tirada con los porcentajes de la
  // situación, así que nada es lineal. Reglas:
  //  - Subida de categoría (promo): solo existe si la temporada fue buena.
  //    Se garantiza una; si fuiste CAMPEÓN, todas las tarjetas extra son de
  //    la categoría superior (equipos distintos), no hay "quedarse" extra;
  //    si fuiste 2º-3º, hasta dos.
  //  - Cada destino distinto (campeonato) sale una sola vez.
  //  - Si no sale ninguna vía especial, la tarjeta es otro equipo de tu
  //    categoría, pero NO cuando acabas de ganar y hay ascenso.
  //  - "Clima" del mercado (cold/normal/hot) cambia cuánto se mueve el año.
  const picks = [];
  if (repeatedNonRenewalPick) picks.push(repeatedNonRenewalPick);
  // Un mismo equipo (por NOMBRE) nunca puede salir dos veces, ni coincidir con el
  // tuyo, aunque exista en varios campeonatos (AGR, Aspar, Promoracing...).
  const sameOffer = (a, b) => a.team.name === b.team.name;
  const destTaken = (c) => !c.promo && !forcedExit && c.championship !== state.championship &&
    picks.some((p) => p.championship === c.championship);
  const champion = !!lastSeason && lastSeason.pos === 1;
  // Campeón o 2º: todas las tarjetas extra pueden ser de la categoría
  // superior; 3º: a veces. Más abajo, una sola (si la hay).
  const multiPromo = champion || (!!lastSeason && lastSeason.pos === 2) ||
    (!!lastSeason && lastSeason.pos === 3 && Math.random() < 0.6);
  const maxPromo = champion ? 3 : (lastSeason && lastSeason.pos <= 3 ? 2 : 1);
  const mood = state.marketMood || "normal";
  const keepProb = { cold: 0.65, loyal: 0.5, normal: 0.88, hot: 1, lateral: 0.9 }[mood] ?? 0.88;
  let stayProb = { cold: 0.30, loyal: 0.38, normal: 0.15, hot: 0.06, lateral: 0.08 }[mood] ?? 0.15;
  let lateralP = { cold: 0.12, loyal: 0.04, normal: 0.20, hot: 0.35, lateral: 0.55 }[mood] ?? 0.20;
  // LÓGICA: siendo joven (<=21) en las escaleras bajas es muy normal seguir
  // un año más; y una temporada floja abre más salidas a otros campeonatos.
  if (state.age <= 21) stayProb += 0.20;
  if (!promoGood) lateralP += 0.15;
  if (badStreak) { lateralP = 1; stayProb = 0; }
  // Moto2 con 27-28+ años: el mercado empuja a salir (Supersport, WorldSBK, algún nacional).
  if (state.championship === "Moto2" && state.age >= 27) { lateralP += 0.25; stayProb *= 0.7; }
  // Júnior: una mala temporada a los 16-17 casi nunca significa irse (se
  // sigue un año más); a los 18-19 ya es lo habitual.
  const juniorExitAge = { 16: 0.10, 17: 0.40, 18: 0.85 }[state.age] ?? (state.age < 16 ? 0.05 : 1);
  if (state.championship === "MotoJunior" || state.championship === "RedBullRookies") {
    lateralP *= juniorExitAge;
    stayProb += (1 - juniorExitAge) * 0.35;
  }
  if (state.championship === "Moto3" && !promoGood) stayProb += 0.10; // o seguir en Moto3
  // Salidas laterales con sentido según dónde estés (en vez de "subir").
  const lateralOffer = () => {
    const ch = state.championship, opts = [];
    const add = (w, champ, lo, hi) => opts.push({ w, champ, lo, hi });
    if (ch === "MotoJunior" || ch === "RedBullRookies") { add(3, "Stock600", 46, 54); add(3, "SportBike", 46, 54); add(0.7, "Moto2Euro", 50, 56); }
    else if (ch === "Moto3") { add(2, "Moto2Euro", 55, 61); add(2.8, "SportBike", 46, 54); add(2.3, "Supersport", 66, 72); add(0.5, "Stock600", 48, 54); }
    else if (ch === "Moto2") {
      if (state.age >= 27) { add(4.5, "Supersport", 67, 74); add(1.8, "WorldSBK", 69, 76); add(1.6, "NAT", 55, 70); add(0.5, "Moto2Euro", 55, 62); }
      else { add(2.6, "Supersport", 67, 74); add(2.5, "Moto2Euro", 55, 62); add(1.5, "NAT", 55, 70); add(0.6, "WorldSBK", 69, 76); }
    }
    else if (ch === "Moto2Euro") { add(3.4, "NAT", 50, 65); add(1.2, "Supersport", 65, 71); add(1, "SportBike", 50, 58); add(0.4, "Stock600", 50, 56); }
    else if (ch === "Supersport") { add(1.7, "NAT", 55, 70); add(1.5, "SportBike", 46, 54); add(1, "Moto2Euro", 56, 62); }
    else if (ch === "SportBike") { add(3, "Stock600", 46, 54); add(state.age <= 21 ? 0.15 : 2, "NAT", 52, 66); add(1.5, "Moto2Euro", 55, 60); }
    else if (ch === "MotoGP") { add(4, "WorldSBK", 69, 77); add(0.7, "NAT", 58, 72); }
    else if (ch === "WorldSBK") { add(3.4, "NAT", 55, 70); add(1.5, "Supersport", 67, 74); }
    else if (NATIONAL_CHAMPS.includes(ch)) { add(2.6, "NAT", 52, 68); add(1.5, "Supersport", 66, 72); add(1, "Moto2Euro", 55, 62); add(1, "SportBike", 50, 58); }
    else if (ch === "Stock600") { add(2, "SportBike", 50, 58); add(1.3, "NAT", 50, 64); add(1, "Moto2Euro", 52, 58); }
    if (!opts.length) return null;
    let r = Math.random() * opts.reduce((a, o) => a + o.w, 0), o = opts[0];
    for (const x of opts) { r -= x.w; if (r <= 0) { o = x; break; } }
    if (o.champ === "NAT") return pickGuaranteedNationalOffer(o.lo, o.hi);
    return { team: pickTeamByStrength(o.champ, o.lo, o.hi), championship: o.champ };
  };
  const nPromo = () => picks.filter((p) => p.promo).length;
  // Campeón de la Yamaha R3 Cup: SportBike muy común, JuniorGP poco común,
  // Stock 600 y Red Bull Rookies muy poco. Todas las tarjetas extra salen de
  // esta tirada (equipos distintos).
  if (state.championship === "YamahaR3Cup" && champion) {
    const rollYamaha = () => {
      const r = Math.random();
      if (r < 0.68) return { team: pickTeamByStrength("SportBike", 46, 54), championship: "SportBike" };
      if (r < 0.88) return { team: pickTeamByStrength("MotoJunior", 41, 46), championship: "MotoJunior" };
      if (r < 0.95) return { team: pickTeamByStrength("Stock600", 46, 54), championship: "Stock600" };
      return { team: TEAMS.RedBullRookies[0], championship: "RedBullRookies" };
    };
    let at = 0;
    while (picks.length < extraPicksNeeded && at++ < 40) {
      const x = rollYamaha();
      if (x.team.name !== state.team.name && !picks.some((p) => sameOffer(p, x))) picks.push(x);
    }
  }
  // CUOTA de salidas: de las tarjetas extra, cuántas pueden ser para SALIR
  // del campeonato (las subidas no cuentan: son buenas noticias). Varía cada
  // vez: tras una temporada floja puede haber 0, 1 o 2 salidas (más
  // probables cuanto peor fue), y el resto son para quedarte. Así un 10º en
  // MotoGP o una mala temporada en Moto2 no siempre significa "2 para irte".
  const posNow = lastSeason ? lastSeason.pos : 10;
  const uq = Math.random();
  let maxExits = 3;
  if (!forcedExit && !badStreak) {
    if (posNow >= 15)     maxExits = uq < 0.15 ? 0 : uq < 0.60 ? 1 : 2;
    else if (posNow >= 9) maxExits = uq < 0.35 ? 0 : uq < 0.80 ? 1 : 2;
    else                  maxExits = uq < 0.50 ? 0 : uq < 0.90 ? 1 : 2;
  }
  if (state.championship === "Moto2" && state.age >= 27 && !forcedExit && !badStreak) {
    maxExits = Math.max(maxExits, Math.random() < 0.4 ? 2 : 1);
  }
  const exitCount = () => picks.filter((p) => !p.promo && p.championship !== state.championship).length;
  for (let slot = 0; slot < extraPicksNeeded && picks.length < extraPicksNeeded; slot++) {
    const cands = buildSpecialPicks()
      .filter((c) => c.team.name !== state.team.name && !picks.some((p) => sameOffer(p, c)) && !destTaken(c))
      .filter((c) => c.promo || Math.random() < keepProb);
    const promoPool = nPromo() < maxPromo ? cands.filter((c) => c.promo) : [];
    if (promoPool.length && (nPromo() === 0 || multiPromo)) {
      picks.push(promoPool[randInt(0, promoPool.length - 1)]);
      continue;
    }
    const hasPromoRoute = cands.some((c) => c.promo);
    // Salida lateral lógica de la categoría (según el perfil de la temporada)
    if (!forcedExit && !(multiPromo && hasPromoRoute) && exitCount() < maxExits && Math.random() < lateralP) {
      const lat = lateralOffer();
      if (lat && lat.team.name !== state.team.name && lat.championship !== state.championship &&
          !picks.some((p) => p.championship === lat.championship || sameOffer(p, lat))) {
        picks.push(lat);
        continue;
      }
    }
    if (!forcedExit && !badStreak && !(multiPromo && hasPromoRoute) && sameLevelCandidates.length &&
        (Math.random() < stayProb || exitCount() >= maxExits)) {
      picks.push(sameLevelCandidates.shift());
      continue;
    }
    const pool = cands.filter((c) => !c.promo);
    if (pool.length && exitCount() < maxExits) picks.push(pool[randInt(0, pool.length - 1)]);
    else if (!forcedExit && !badStreak && sameLevelCandidates.length) picks.push(sameLevelCandidates.shift());
  }
  if (picks.length > extraPicksNeeded) picks.length = extraPicksNeeded;
  // Salida obligatoria (campeón de Moto2 Europeo / Stock 600): si aún faltan
  // tarjetas, se repite la tirada del campeón; nunca equipos de la categoría
  // que acabas de ganar.
  if (forcedExit) {
    const roll = state.championship === "Moto2Euro" ? rollMoto2EuroChampion : rollStock600Champion;
    let attempts = 0;
    while (picks.length < extraPicksNeeded && attempts++ < 40) {
      const extra = roll();
      if (extra.team.name !== state.team.name && !picks.some((p) => sameOffer(p, extra))) picks.push(extra);
    }
  }
  if (multiPromo && picks.some((p) => p.promo)) {
    // Campeón con ascenso disponible: las tarjetas que falten son más
    // equipos de la categoría superior, nunca de la que acabas de ganar.
    const up = picks.find((p) => p.promo).championship;
    const more = promoWindowFor(up).filter((t) => t.name !== state.team.name && !picks.some((p) => p.team.name === t.name));
    while (picks.length < extraPicksNeeded && more.length) {
      picks.push({ team: more.shift(), championship: up, promo: true });
    }
  }
  if (badStreak) {
    let at = 0;
    while (picks.length < extraPicksNeeded && at++ < 60) {
      const lat = lateralOffer();
      if (lat && lat.championship !== state.championship && lat.team.name !== state.team.name &&
          !picks.some((p) => sameOffer(p, lat)) && (at > 20 || !picks.some((p) => p.championship === lat.championship))) picks.push(lat);
    }
  }
  while (!forcedExit && !badStreak && picks.length < extraPicksNeeded && sameLevelCandidates.length) {
    picks.push(sameLevelCandidates.shift());
  }

  {
    // LÓGICA por edad/situación (se quita la oferta y se repone con otra):
    //  - SportBike con 21 años o menos: irse a un nacional es MUY poco
    //    probable (10%); siendo joven lo normal es seguir o ir a Stock/Europeo.
    //  - Recién llegado a MotoGP (2 temporadas o menos) y aún joven (27 o
    //    menos): WorldSBK solo aparece tras una mala temporada (fuera del
    //    top 12) o si no te renuevan; la edad ya no cuenta como "joven".
    for (let i = picks.length - 1; i >= 0; i--) {
      const p = picks[i];
      if (state.championship === "SportBike" && state.age <= 21 &&
          NATIONAL_CHAMPS.includes(p.championship) && Math.random() < 0.9) picks.splice(i, 1);
      else if (NATIONAL_CHAMPS.includes(p.championship) && !forcedExit && Math.random() < 0.28) picks.splice(i, 1);
      else if (state.championship === "MotoGP" && state.age <= 27 && tenure <= 2 &&
          p.championship === "WorldSBK" && !(lastSeason && lastSeason.pos >= 13) && !nonRenewal) picks.splice(i, 1);
    }
    // Seguridad: sin equipos repetidos ni el tuyo; si algo se quita, se repone.
    const seen = new Set([state.team.name]);
    for (let i = picks.length - 1; i >= 0; i--) {
      if (seen.has(picks[i].team.name)) picks.splice(i, 1);
      else seen.add(picks[i].team.name);
    }
    const spare = badStreak ? [] : sameLevelCandidates.filter((c) => !seen.has(c.team.name));
    while (picks.length < extraPicksNeeded && spare.length) {
      const c = spare.shift();
      picks.push(c); seen.add(c.team.name);
    }
  }

  picks.forEach((c) => {
    offers.push({ team: c.team, championship: c.championship, isCurrent: false });
  });

  // Orden: la renovación (si existe) siempre va primera / a la izquierda,
  // pero el resto de tarjetas se mezclan cada vez. Antes salían siempre en
  // el mismo orden relativo (p. ej. WorldSBK siempre en medio y Moto2
  // siempre a la derecha), lo cual quedaba raro y predecible.
  const renewalOffer = offers.find((o) => o.isCurrent);
  const restOffers = offers.filter((o) => !o.isCurrent).sort(() => Math.random() - 0.5);
  const finalOffers = renewalOffer ? [renewalOffer, ...restOffers] : restOffers;
  // AJUSTE (solo visual, sin tocar porcentajes ni lógica de mercado): se
  // expone si la falta de renovación es un rechazo real (nonRenewal) o
  // simplemente que ganar el campeonato obliga a salir (forcedExit) — así
  // renderMarket puede distinguir ambos casos y no mostrar el aviso rojo de
  // "no te ha renovado" cuando en realidad es un ascenso.
  finalOffers.forcedExit = forcedExit;
  return finalOffers;
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
  // Monomarca (Red Bull Rookies / Yamaha R3 Cup): toda la parrilla corre
  // con la misma moto, así que el peso del equipo debe ser casi nulo — lo
  // que decide es casi exclusivamente el piloto.
  MotoJunior:      { rider: 0.86, team: 0.14 },
  RedBullRookies:  { rider: 0.97, team: 0.03 },
  YamahaR3Cup:     { rider: 0.97, team: 0.03 },
  Moto3:      { rider: 0.83, team: 0.17 },
  Moto2:      { rider: 0.82, team: 0.18 },
  MotoGP:     { rider: 0.65, team: 0.35 },
  Moto2Euro:  { rider: 0.83, team: 0.17 },
  SportBike:  { rider: 0.84, team: 0.16 },
  Supersport: { rider: 0.79, team: 0.21 },
  WorldSBK:   { rider: 0.72, team: 0.28 },
  ESBK:       { rider: 0.81, team: 0.19 },
  BSB:        { rider: 0.81, team: 0.19 },
  CIV:        { rider: 0.81, team: 0.19 },
  // Stock 600: 4 equipos, todos con moto Yamaha (a efectos prácticos, casi
  // monomarca), así que el equipo pesa poco — parecido a Rookies/R3 Cup,
  // aunque no tan extremo, porque sí hay 4 escuadras distintas entre las
  // que elegir.
  Stock600:   { rider: 0.90, team: 0.10 },
};

// ------------------------------------------------------------
// Crecimiento anual de OVR — combina perfil oculto, edad, resultados
// deportivos, adaptación a un cambio de equipo/categoría y azar.
// Nada de esto es una fórmula fija: dos pilotos con los mismos resultados
// pueden acabar la temporada con crecimientos muy distintos.
// ------------------------------------------------------------
function computeSeasonGrowth(pts, champPosition, categoryChanged, previousChampionship = null) {
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
  let base = room * p.learningRate * curveMultiplier(p.curve, state.age) * 1.55;

  // AJUSTE DE DIFICULTAD: muro adicional a partir de 85 de OVR, aparte del
  // margen respecto al potencial (`room`). Cuanto más alto el OVR actual,
  // más cuesta seguir subiendo — así superar los 88-90 queda reservado de
  // verdad a los pilotos con mucho potencial Y buen ritmo de aprendizaje
  // (los "muy top"), no a cualquiera que se vaya acercando a su techo.
  const highOvrWall = state.ovr >= 82 ? clamp(1 - (state.ovr - 82) / 10, 0.15, 1) : 1;
  base *= highOvrWall;

  // 1a. Trayectoria de la carrera (ver CAREER_ARCS). Pueden dispararse una
  // sola vez cambios de guion, que quedan contados como evento de la temporada.
  let arcEvent = null, arcDrift = 0;
  {
    const arc = p.arc || "normal";
    if (arc === "lento") base *= 0.92;
    else if (arc === "estrella") base *= 1.10;
    else if (arc === "promesaRota") {
      if (state.age < p.arcAge) base *= 1.20;
      else {
        if (!p.arcDone) {
          p.arcDone = true;
          state.potential = clamp(state.ovr + randInt(-2, 1), 55, state.potential);
          arcEvent = { text: "La promesa se rompe: su progresión se frena en seco", kind: "negative" };
        }
        base *= 0.40;
        if (state.age < p.arcAge + 3) arcDrift = -0.5;
      }
    } else if (arc === "estancado" && state.age >= p.arcAge) {
      if (!p.arcDone) {
        p.arcDone = true;
        state.potential = clamp(state.ovr + randInt(1, 4), 55, state.potential);
        arcEvent = { text: "Su progresión se estanca: ya no mejora como antes", kind: "negative" };
      }
      base *= 0.50;
    } else if (arc === "remontada") {
      if (state.age < p.arcAge) base *= 0.55;
      else {
        if (!p.arcDone) {
          p.arcDone = true;
          state.potential = Math.min(94, state.potential + randInt(3, 6));
          arcEvent = { text: "Algo hace clic: empieza a dar el salto que no llegaba", kind: "positive" };
        }
        if (state.age < p.arcAge + 4) base *= 1.6;
      }
    }
  }

  // 1b. Impulso de novato: los primeros años en Moto3 (16-18 años) suelen
  // ser de aprendizaje muy rápido en la vida real — se nota incluso en los
  // pilotos de progresión más lenta. Se difumina hacia los 20.
  if (state.age <= 18) base *= 1.35;
  else if (state.age === 19) base *= 1.15;

  // 2. Edad — influye bastante menos que antes, pero a partir de los 30
  // años el declive es la norma general (con un pelín de variación
  // personal según el pico de forma oculto de cada piloto).
  const ageDist = state.age - p.peakAge;
  const personalAgeFactor = ageDist <= 0
    ? clamp(1 - Math.abs(ageDist) / 12, 0, 1) * 0.45
    : -clamp(ageDist / 8, 0, 1) * 0.5;
  const post30Penalty = state.age >= 30 ? -clamp((state.age - 29) * 0.4, 0, 3.5) : 0;
  // AJUSTE CAMPEONATOS NACIONALES: en ESBK/BSB/CIV el nivel físico exigido
  // es menor y los pilotos se mantienen competitivos mucho más tiempo. A
  // partir de los 34-35 años, el declive por edad se reduce a menos de la
  // mitad respecto a MotoGP o WorldSBK — no desaparece del todo (siguen
  // siendo veteranos), pero cae mucho más despacio.
  const nationalAgeRelief = NATIONAL_CHAMPS.includes(state.championship) && state.age >= 34 ? 0.4 : 1;
  const ageFactor = personalAgeFactor + post30Penalty * nationalAgeRelief;

  // 3. Resultados deportivos — pesan, pero no deciden por sí solos.
  let perfFactor = (perfRatio - 0.22) * 3;
  if (champPosition <= 3) perfFactor += (4 - champPosition) * 0.3;
  else if (champPosition >= 20) perfFactor -= 0.4;
  // Siendo joven (<=26), quedar en la cola no te hace peor piloto: se sigue
  // aprendiendo. Sin este suelo, perder genera menos media y eso más derrotas
  // (la espiral de "siempre último").
  perfFactor = clamp(perfFactor, state.age <= 26 ? -0.4 : -1.2, 2);
  // Un buen resultado pesa menos en campeonatos de menor nivel: ganar el
  // Europeo de Moto2 no puede subir la media como ganar en un Mundial.
  // NIVEL del campeonato: ganar uno fácil (SportBike, Stock 600, Europeo,
  // júnior...) dice mucho menos de tu nivel que ganar en un Mundial, así que
  // el premio por buenos resultados se pondera. Solo recorta lo positivo.
  const CHAMP_PERF_WEIGHT = {
    MotoJunior: 0.65, RedBullRookies: 0.75, YamahaR3Cup: 0.60,
    Stock600: 0.60, Moto2Euro: 0.60, SportBike: 0.65,
    Moto3: 0.90, Supersport: 0.85,
  };
  const tierMult = NATIONAL_CHAMPS.includes(state.championship) ? 0.80 : CHAMP_PERF_WEIGHT[state.championship];
  if (tierMult && perfFactor > 0) perfFactor *= tierMult;
  // Y no se encadenan los saltos: si ya vienes de una subida grande, el
  // premio por resultados se enfría (ganar un título tras otro desde un nivel
  // bajo no te catapulta sin fin).
  const lastG = state.lastGrowth || 0;
  if (perfFactor > 0 && lastG >= 3) perfFactor *= 0.55;
  else if (perfFactor > 0 && lastG === 2) perfFactor *= 0.8;

  // 4. Azar — más amplio en pilotos irregulares (baja "consistency").
  const luckSpread = lerp(0.4, 1.5, 1 - p.consistency);
  const luck = noise(luckSpread);

  // 5. Adaptación a un cambio de equipo o categoría.
  const adaptBonus = categoryChanged
    ? (p.adaptability - 1) * 1.6 + rand(-0.5, 0.5)
    : 0;

  // 5b. Recuperación: tras temporadas seguidas en la cola (15º o peor) el
  // piloto "da la vuelta" poco a poco — aprende de los malos resultados.
  // Solo actúa si todavía hay margen hasta su techo y no afecta a quien
  // pelea arriba.
  state.bottomStreak = champPosition >= 15 ? (state.bottomStreak || 0) + 1 : 0;
  let recovery = 0;
  if (state.bottomStreak >= 1 && state.potential - state.ovr >= 4 && state.age <= 30) {
    recovery = Math.min(1.5, 0.5 * state.bottomStreak);
  }

  // INERCIA: la progresión sigue una tendencia (subes poco a poco o bajas
  // poco a poco) en vez de dar bandazos temporada a temporada. El crecimiento
  // "de fondo" se mezcla con la tendencia de los años anteriores; los
  // eventos y shocks (lesiones, cambios de categoría, giros de guion) se
  // suman aparte, así que siguen pudiendo romper la tendencia de vez en cuando.
  let core = base + ageFactor + perfFactor + luck + adaptBonus + arcDrift + recovery;
  const prevTrend = state.growthTrend == null ? core : state.growthTrend;
  core = 0.55 * core + 0.45 * prevTrend;
  state.growthTrend = core;
  let growth = core;

  // 6. Evento de desarrollo — poco frecuente, cambia la historia de la
  // temporada (para bien o para mal).
  let eventText = null, eventKind = null;

  // 6a. Shock de cambio de categoría: probabilidad baja pero real de que el
  // salto (Moto3→Moto2, Moto2→MotoGP, Moto2→WorldSBK, etc.) marque la
  // temporada mucho más de lo normal. A veces encajas de inmediato y das
  // un salto grande; otras te pierdes por completo y retrocedes bastante.
  // Cuando esto ocurre, sustituye a los eventos de desarrollo normales de
  // esa temporada (la transición ya es, de por sí, la historia del año).
  if (categoryChanged && Math.random() < 0.10) {
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

  // 6b. Lesión grave / crisis (rara): temporada perdida en lo físico o mental.
  if (!eventText && Math.random() < 0.03) {
    growth += rand(-5.5, -3);
    eventText = Math.random() < 0.5 ? "Lesión grave que condiciona toda la temporada" : "Crisis de confianza y de motivación";
    eventKind = "negative";
  }
  // 6c. Cambio de guion de la trayectoria (ver 1a): tiene prioridad como historia.
  if (arcEvent) { eventText = arcEvent.text; eventKind = arcEvent.kind; }

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
  // FIX: antes se sumaba también al cambiar de equipo dentro de MotoGP/WorldSBK.
  if (previousChampionship != null && previousChampionship !== state.championship &&
      (state.championship === "MotoGP" || state.championship === "WorldSBK")) {
    rounded += Math.random() < 0.5 ? 1 : 2;
  }

  // 8. Cierre del salto de graduación (2ª parte): si el piloto llegó a
  // Moto3/SportBike desde la fase de formación (ver el empujón inicial en
  // simulateSeason), al terminar su 2ª temporada ahí se completa el resto
  // del camino hasta el nivel objetivo que se fijó en su momento — así el
  // total acumulado (empujón inicial + crecimiento normal de la temporada 1
  // y 2 + este cierre) deja al piloto en un nivel parecido al de siempre,
  // solo que repartido en dos temporadas en vez de todo de golpe.
  if (!categoryChanged && state.seasonsInChamp === 2 && state.juniorGradTarget != null &&
      (state.championship === "Moto3" || state.championship === "SportBike")) {
    const projectedOvr = state.ovr + rounded;
    const jump = clamp(state.juniorGradTarget - projectedOvr, 0, 20);
    rounded += Math.round(jump);
    state.juniorGradTarget = null;
  }

  state.lastGrowth = rounded;
  return { growth: rounded, eventText };
}

function simulateSeason(categoryChanged = false, previousChampionship = null) {
  // ---------- Seguimiento de permanencia en la categoría actual ----------
  // Se usa para exigir un número mínimo de temporadas antes de poder subir
  // de categoría (ver generateMarketOffers) — así el ascenso deja de
  // depender solo de tener una temporada buena y se vuelve más gradual.
  // FIX: antes se reiniciaba también al cambiar solo de EQUIPO dentro del
  // mismo campeonato, así que la permanencia nunca se acumulaba (y el umbral
  // de ascenso se re-sorteaba en cada cambio de equipo, con un 10% de
  // "ascenso relámpago" cada vez). Ahora solo cuenta el cambio de campeonato.
  const champSwitch = previousChampionship != null && previousChampionship !== state.championship;
  if (champSwitch) {
    state.seasonsInChamp = 1;
    state.promotionReadyAt = pickPromotionThreshold(state.championship);
  } else {
    state.seasonsInChamp = (state.seasonsInChamp || 0) + 1;
  }

  // FIX SESGO 2º: "categoryChanged" también es true al cambiar solo de
  // EQUIPO dentro del mismo campeonato, y eso reiniciaba la "temporada de
  // novato" (con 85% de recorte del título a 2º/3º) en cada cambio de
  // equipo. Para el recorte de título, lo que cuenta es el CAMPEONATO.
  // En la primera temporada de la carrera previousChampionship es null.
  const champChanged = previousChampionship !== state.championship;
  state.seasonsInSeries = champChanged
    ? 1
    : (state.seasonsInSeries ? state.seasonsInSeries + 1 : (state.seasonsInChamp || 1));

  // AJUSTE (7ª pasada): el salto de la fase de formación (JuniorGP/Red Bull
  // Rookies/R3 Cup) a Moto3 o SportBike se reparte en dos partes en vez de
  // llegar todo de golpe al final de la primera temporada — así la primera
  // temporada ya no se juega "floja" (se nota parte de la mejora desde el
  // primer momento) y el salto entre la 1ª y la 2ª temporada es más suave.
  // Primera parte: un empujón inmediato AQUÍ, antes de disputar la
  // temporada, que cubre algo más de la mitad del camino hasta el nivel
  // objetivo (el mismo rango de siempre, 62-75 según potencial). El resto
  // del camino se completa gradualmente con el crecimiento normal de la
  // temporada 1 y, si aún falta algo, con un cierre al terminar la
  // temporada 2 (ver computeSeasonGrowth) — así se llega a Moto2/Supersport
  // con una media parecida a la de siempre, solo que de forma más gradual.
  if (categoryChanged && JUNIOR_CHAMPS.includes(previousChampionship) &&
      (state.championship === "Moto3" || state.championship === "SportBike")) {
    const p = state.hiddenProfile;
    const target = clamp(randInt(62, 75) + Math.round((p.potential - 85) / 8), 56, 80);
    state.juniorGradTarget = target;
    const initialJump = clamp(Math.round((target - state.ovr) * 0.55), 0, 20);
    state.ovr = clamp(state.ovr + initialJump, 40, state.potential);
  }

  const w = CATEGORY_WEIGHTS[state.championship] || CATEGORY_WEIGHTS.Moto3;

  const seasonsInChampNow = state.seasonsInSeries || 1;
  const isRookieSeason = seasonsInChampNow === 1;
  const isSophomoreSeason = seasonsInChampNow === 2;

  // AJUSTE (3ª pasada): la primerísima temporada de la carrera (16 años,
  // en la fase de formación) ya no resta nada al rating — antes restaba 1
  // punto por el "shock" de la primera vez en pista; ahora es un pelín
  // más fácil. El estreno en Moto3 recién graduado de la fase júnior suma,
  // en cambio, un pequeño empujón de forma (+2) — aparte de todo lo que ya
  // aporta el salto de OVR de la graduación.
  const isMoto3RookieSeason = categoryChanged && state.championship === "Moto3" &&
    JUNIOR_CHAMPS.includes(previousChampionship);
  // AJUSTE (6ª pasada): en Moto2 y Moto3 la primera temporada ya no lleva
  // ningún ajuste especial de dificultad — ni recorte del resultado ni
  // descuento de rating; sale tal cual de la simulación normal de la
  // temporada. Se mantiene solo el aviso de que es "temporada de novato"
  // (isMotoStepUpRookie) para que el amortiguado general de más abajo no
  // se le aplique.
  const isMotoStepUpRookie = isRookieSeason &&
    (state.championship === "Moto2" || state.championship === "Moto3");
  // AJUSTE (más azar): "forma de la temporada" del piloto — un año puede
  // salir algo mejor o peor de lo que dice su rating, sin que se note a
  // simple vista (sd ~3.5 puntos, casi nunca más de ±5).
  const seasonForm = noise(2.8);
  const playerRating = state.ovr * w.rider + state.team.strength * w.team
    + (isMoto3RookieSeason ? 2 : 0) + seasonForm + 1.0; // AJUSTE: +1 de rating, un pelín más fácil

  // Nivel base de cada rival para toda la temporada (su sitio dentro del
  // pelotón), heredado (con una ligera deriva) de la temporada anterior.
  // AJUSTE (más azar): cada rival también tiene su propia forma esa
  // temporada (sd ~2.5), para que el pelotón no sea tan estable año a año.
  const rivalBase = getRivalField(state.championship).map((r) => r + noise(2.5));
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
    const qPlayer = playerRating + noise(10);
    const qRivals = rivalBase.map((r) => r + noise(10));
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
    const rPlayer = playerRating + noise(12) + inspiredDay;
    const rRivals = rivalBase.map((r) => r + noise(11));

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
  let champPosition = standings.findIndex((s) => s.idx === -1) + 1;

  // Ganar el título en el primerísimo año dentro de una categoría (tanto si
  // es el debut absoluto en Moto3 como el primer año tras ascender a Moto2
  // o a MotoGP) es algo excepcional en la realidad: casi nadie llega y se
  // corona a la primera. Si el resultado bruto de la temporada da campeón,
  // la mayoría de las veces (85%) se "amortigua" a un resultado igualmente
  // brillante (2º o 3º) en vez de la corona — sigue siendo una temporada de
  // debut sobresaliente, solo que no el título. A partir del tercer año en
  // la misma categoría la probabilidad de ser campeón queda intacta (la
  // segunda temporada es una transición a medias, ver isSophomoreSeason).
  // AJUSTE (6ª pasada): en Moto2 y Moto3 este amortiguado ya NO se aplica
  // en su primera temporada — sale directamente de la simulación normal,
  // sin recorte y sin ningún otro ajuste.
  let champDampChance = 0;
  let top3DampChance = 0;
  const top3DampRange = [4, 9];
  if (!isMotoStepUpRookie) {
    if (isRookieSeason) {
      champDampChance = isMoto3RookieSeason ? 0.80 : 0.85;
      top3DampChance = isMoto3RookieSeason ? 0.75 : 0.80;
    } else if (isSophomoreSeason) {
      // FIX: en Moto2/Moto3 la 1ª temporada NO se recortaba pero la 2ª sí
      // (35%), así que la segunda salía peor. Ahora esas dos no se recortan
      // y en el resto solo queda un residuo pequeño.
      const sophomoreExempt = state.championship === "Moto2" || state.championship === "Moto3";
      champDampChance = sophomoreExempt ? 0 : 0.12;
      top3DampChance = sophomoreExempt ? 0 : 0.10;
    }
  }
  // FIX SESGO 2º: una temporada dominante (60%+ de victorias, p. ej. 12 o
  // más de 20) nunca se recorta: acabar 2º con 15 victorias no tiene sentido.
  const dominantSeason = cg >= Math.ceil(RACES_PER_SEASON * 0.6);
  if (champPosition === 1 && !dominantSeason && Math.random() < champDampChance) {
    champPosition = randInt(2, 3);
  }

  // Además de amortiguar el título, un debutante que NO es de verdad uno de
  // los mejores del pelotón esa temporada (ver isTopTier, calculado antes
  // de disputar las carreras) rara vez debe firmar una temporada de debut
  // entre los 3 primeros solo por el azar del campeonato — eso hay que
  // ganárselo siendo un piloto top. La mayoría de esas veces el resultado
  // se "amortigua" a una posición más realista para un debutante, aunque
  // la temporada siga contando como sólida.
  if (champPosition <= 3 && !isTopTier && Math.random() < top3DampChance) {
    champPosition = randInt(top3DampRange[0], top3DampRange[1]);
  }

  // AJUSTE (4ª pasada, revertido en la 5ª): la redistribución fija a
  // posiciones concretas (3º-4º con hueco para 1º/5º/9º) se ha quitado —
  // en Moto2 y Moto3 el resultado de la primera temporada sale ahora
  // directamente de la simulación de la temporada (ya con el rating un
  // poco más bajo de arriba), sin ningún reajuste posterior.

  const isChampion = champPosition === 1;

  // ---------- Crecimiento de OVR ----------
  // Combina perfil oculto, edad, resultados deportivos, adaptación y
  // eventos aleatorios — nunca una fórmula fija. Ver computeSeasonGrowth().
  const { growth, eventText } = computeSeasonGrowth(pts, champPosition, categoryChanged, previousChampionship);

  // Guardar en historial (incluye el evento de la temporada, si lo hubo)
  state.history.push({
    age: state.age, team: state.team.name, ovr: state.ovr,
    championship: state.championship,
    ce, dnf, cg, pod, pol, pos: champPosition, disputed: true,
    event: eventText,
  });

  // No renovación: se decide UNA vez, aquí, al cerrar la temporada — no en
  // generateMarketOffers, que puede volver a llamarse varias veces sobre el
  // mismo estado (p. ej. al re-renderizar el dashboard) y antes re-sorteaba
  // el resultado cada vez. Se guarda en el estado para que el mercado sea
  // estable y, además, para poder contar cuántas veces ha pasado en esta
  // categoría (ver repeatedNonRenewalPick en generateMarketOffers).
  const thisSeasonGood = pod >= 3 || cg >= 1 || champPosition <= 8;
  const thisSeasonBad = !thisSeasonGood && champPosition >= 15;
  // AJUSTE (más variedad): hundido (15º o peor) = 15% de que no te renueven;
  // temporada floja (9º-14º, sin podios ni victorias) = 6%.
  // PERFIL de la temporada de mercado (se decide UNA vez aquí, estable al
  // re-renderizar). Da personalidad: a veces tu equipo te renueva hagas lo
  // que hagas ("loyal"), a veces el mercado se mueve mucho ("hot"), a veces
  // llegan muchas ofertas de otros campeonatos ("lateral"), y a veces el
  // año es duro y se te cierran puertas ("cold").
  // RASGO DE CARRERA (oculto, se sortea una vez por partida): cómo se mueve
  // tu entorno. Hace que cada partida tenga su propio carácter: con buenos
  // contactos casi siempre hay mercado; un piloto "fiel" tiene más
  // renovaciones; un "aventurero" recibe más salidas a otros campeonatos;
  // uno "discreto" pasa más desapercibido y tiene años fríos.
  if (!state.careerTrait) {
    state.careerTrait = ["conectado", "fiel", "aventurero", "discreto", "equilibrado", "equilibrado"][randInt(0, 5)];
  }
  // pesos: [cold, loyal, normal, hot, lateral]
  const traitW = {
    conectado:   [0.10, 0.10, 0.22, 0.32, 0.26],
    fiel:        [0.12, 0.34, 0.28, 0.14, 0.12],
    aventurero:  [0.16, 0.08, 0.22, 0.20, 0.34],
    discreto:    [0.34, 0.14, 0.28, 0.12, 0.12],
    equilibrado: [0.20, 0.15, 0.25, 0.20, 0.20],
  }[state.careerTrait] || [0.20, 0.15, 0.25, 0.20, 0.20];
  { let m = Math.random();
    const names = ["cold", "loyal", "normal", "hot", "lateral"];
    let pick = "normal";
    for (let i = 0; i < names.length; i++) { m -= traitW[i]; if (m <= 0) { pick = names[i]; break; } }
    state.marketMood = pick; }
  const mm = state.marketMood;
  const mediocre = !thisSeasonGood && !thisSeasonBad;
  if (mm === "loyal") {
    state.pendingNonRenewal = false; // te renuevan aunque la temporada sea mala
  } else if (mm === "cold") {
    state.pendingNonRenewal = (thisSeasonBad && Math.random() < 0.38) || (mediocre && Math.random() < 0.14);
  } else {
    state.pendingNonRenewal = (thisSeasonBad && Math.random() < 0.15) || (mediocre && Math.random() < 0.06);
  }
  if (state.championship === "Stock600" && champPosition >= 4 && champPosition <= 5 &&
      state.age >= 26 && (state.seasonsInSeries || 1) >= 3) {
    state.pendingNonRenewal = Math.random() < 0.6; // renovar se vuelve muy difícil
  }
  // FIX: tras una no renovación SIEMPRE cambias de equipo, así que con
  // categoryChanged el contador se reiniciaba y nunca llegaba a 2.
  state.nonRenewalsInChamp = champSwitch
    ? (state.pendingNonRenewal ? 1 : 0)
    : (state.nonRenewalsInChamp || 0) + (state.pendingNonRenewal ? 1 : 0);

  const newOvr = Math.round(clamp(state.ovr + growth, 40, state.potential));
  const seasonAge = state.age; // edad de la temporada recién disputada
  const seasonChamp = state.championship;
  state.ovr = newOvr;
  state.age += 1;
  state.seasonNumber += 1;
  state.justWonChampionship = isChampion ? { champ: seasonChamp, age: seasonAge } : null;

  // Última temporada: se simula y se queda en el dashboard mostrando ese
  // resultado; el salto al resumen de carrera lo decide el jugador con la
  // tarjeta "Ver resumen de carrera" (ver renderMarket).
  state.retirementPending = state.age > (NATIONAL_CHAMPS.includes(state.championship) ? MAX_AGE_NATIONAL : MAX_AGE);
  saveState();
  renderDashboard(true);
}

// ============================================================
// RETIRADA
// ============================================================

// Lista de equipos únicos por los que ha pasado el piloto en toda su
// carrera, en el orden en que los fichó por primera vez (deduplicados por
// nombre — si vuelve a un equipo más tarde no se repite).
function getCareerTeams() {
  const seen = new Set();
  const teams = [];
  state.history.forEach((s) => {
    if (!seen.has(s.team)) {
      seen.add(s.team);
      teams.push({ name: s.team, championship: s.championship });
    }
  });
  return teams;
}

// Estadísticas agregadas por cada equipo a lo largo de toda la carrera —
// carreras ganadas, podios y títulos conseguidos con ese equipo — en el
// orden en que se ficharon por primera vez (deduplicados por nombre, igual
// que hacía antes getCareerTeams).
function getCareerTeamStats() {
  const map = new Map();
  state.history.forEach((s) => {
    if (!map.has(s.team)) {
      map.set(s.team, { name: s.team, championship: s.championship, cg: 0, pod: 0, titles: 0 });
    }
    const t = map.get(s.team);
    t.cg += s.cg;
    t.pod += s.pod;
    if (s.pos === 1) t.titles += 1;
  });
  return Array.from(map.values());
}

function renderCareerTeamsList(containerSelector) {
  const teams = getCareerTeamStats();
  $(containerSelector).innerHTML = teams.map((t) => {
    const logo = teamLogo(t.name, t.championship);
    const color = teamColor(t.name, t.championship);
    const initial = t.name.trim().charAt(0).toUpperCase();
    const cardBg = `linear-gradient(160deg, ${hexToRgba(color, 0.32)}, var(--card) 68%)`;
    const logoHTML = logo
      ? `<img class="retiro-team-logo" src="${logo}" alt="" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">`
      : "";
    return `
      <div class="retiro-team-card" style="background:${cardBg};">
        <span class="retiro-team-badge">${champLabel(t.championship)}</span>
        <div class="retiro-team-visual">
          ${logoHTML}
          <div class="retiro-team-fallback" style="background:${color}; display:${logo ? "none" : "flex"};">${initial}</div>
        </div>
        <span class="retiro-team-name">${t.name}</span>
        <div class="retiro-team-stats-row">
          <span class="retiro-team-stat" title="Carreras ganadas">🏆<span>${t.cg}</span></span>
          <span class="retiro-team-stat" title="Podios">🥇<span>${t.pod}</span></span>
          <span class="retiro-team-stat" title="Títulos">👑<span>${t.titles || "—"}</span></span>
        </div>
      </div>
    `;
  }).join("");
}

function retireCareer() {
  const h = state.history;
  const seasons = h.length;

  const totals = h.reduce((acc, s) => {
    acc.cg += s.cg; acc.pod += s.pod; acc.pol += s.pol;
    if (s.pos === 1) acc.titles += 1;
    return acc;
  }, { cg: 0, pod: 0, pol: 0, titles: 0 });

  // Desglose de títulos por campeonato (solo se listan los que tienen al
  // menos 1), en el orden habitual de la escalera de categorías. Incluye
  // los campeonatos nacionales (ESBK/BSB/CIV) — antes se quedaban fuera de
  // esta lista aunque sí sumaban al recuento total de arriba.
  const titlesByChamp = {};
  h.forEach((s) => {
    if (s.pos === 1) titlesByChamp[s.championship] = (titlesByChamp[s.championship] || 0) + 1;
  });
  const CHAMP_ORDER = [
    "MotoJunior", "RedBullRookies", "YamahaR3Cup",
    "SportBike", "Stock600", "Moto3", "Supersport", "Moto2Euro", "Moto2",
    "ESBK", "BSB", "CIV", "WorldSBK", "MotoGP",
  ];
  const titlesBreakdown = CHAMP_ORDER
    .filter((c) => titlesByChamp[c])
    .map((c) => `${champLabel(c)}: ${titlesByChamp[c]}`)
    .join("   ");

  // Mejor posición de campeonato conseguida, y en qué temporada.
  let bestPos = null, bestPosSeason = null;
  h.forEach((s, idx) => {
    if (bestPos === null || s.pos < bestPos) { bestPos = s.pos; bestPosSeason = idx + 1; }
  });

  // OVR máximo alcanzado y en qué temporada. `s.ovr` es el OVR al INICIO
  // de esa temporada, así que el pico real puede estar en state.ovr (ya
  // con el crecimiento de la última temporada disputada aplicado).
  let peakOvr = state.ovr, peakOvrSeason = seasons || 1;
  h.forEach((s, idx) => {
    if (s.ovr > peakOvr) { peakOvr = s.ovr; peakOvrSeason = idx + 1; }
  });

  const lastChamp = seasons ? h[seasons - 1].championship : state.championship;
  const avg = (total) => (seasons ? (total / seasons).toFixed(1) : "0.0");

  // ---------- Hero: nombre, dorsal y subtítulo ----------
  const r = state.rider;
  $("#retiro-rider-name").textContent = r.apellido || "PILOTO";
  const numberEl = $("#retiro-rider-number");
  numberEl.textContent = "#" + (r.numero ?? "00");
  numberEl.style.fontFamily = NUMBER_FONTS[r.numeroFont] || NUMBER_FONTS.inter;
  numberEl.style.color = r.numeroColor || "#F4C400";
  $("#retiro-subtitle").textContent =
    `${seasons} temporada${seasons === 1 ? "" : "s"} como profesional, compitiendo en ${champLabel(lastChamp)}.`;

  // ---------- Grid de 6 estadísticas ----------
  $("#retire-stats").innerHTML = `
    <div class="retiro-stat-card">
      <div class="retiro-stat-head">🏆<span>Carreras ganadas</span></div>
      <div class="retiro-stat-value">${totals.cg}</div>
      <div class="retiro-stat-sub">Promedio: ${avg(totals.cg)} / temporada</div>
    </div>
    <div class="retiro-stat-card">
      <div class="retiro-stat-head">🥇<span>Podios</span></div>
      <div class="retiro-stat-value">${totals.pod}</div>
      <div class="retiro-stat-sub">Promedio: ${avg(totals.pod)} / temporada</div>
    </div>
    <div class="retiro-stat-card">
      <div class="retiro-stat-head">⚡<span>Poles</span></div>
      <div class="retiro-stat-value">${totals.pol}</div>
      <div class="retiro-stat-sub">Promedio: ${avg(totals.pol)} / temporada</div>
    </div>
    <div class="retiro-stat-card">
      <div class="retiro-stat-head">👑<span>Títulos</span></div>
      <div class="retiro-stat-value">${totals.titles}</div>
      <div class="retiro-stat-sub">${titlesBreakdown || "—"}</div>
    </div>
    <div class="retiro-stat-card">
      <div class="retiro-stat-head">🏁<span>Mejor posición</span></div>
      <div class="retiro-stat-value">${bestPos ?? "—"}º</div>
      <div class="retiro-stat-sub">${bestPosSeason ? `Temporada ${bestPosSeason}` : "—"}</div>
    </div>
    <div class="retiro-stat-card">
      <div class="retiro-stat-head">📈<span>OVR máximo</span></div>
      <div class="retiro-stat-value">${peakOvr}</div>
      <div class="retiro-stat-sub">Temporada ${peakOvrSeason}</div>
    </div>
  `;

  renderCareerTeamsList("#retire-teams");

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
  const W = 640;
  const teams = info.careerTeams || [];

  // Calcular cuánto espacio hace falta para los logos de los equipos ANTES
  // de fijar el tamaño del canvas (el nº de filas depende de cuántos
  // equipos distintos tuvo el piloto a lo largo de la carrera).
  const logosPerRow = 7, logoSize = 52, logoGap = 14;
  const teamRows = teams.length ? Math.ceil(teams.length / logosPerRow) : 0;
  const teamsSectionH = teams.length ? 46 + teamRows * (logoSize + 30) : 0;

  const baseH = 800;   // hasta el final de la cuadrícula de estadísticas
  const footerH = 70;
  const H = baseH + teamsSectionH + footerH;

  canvas.width = W;
  canvas.height = H;

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

  // Dorsal (con la fuente y el color elegidos por el jugador; si la
  // carrera se guardó antes de tener esta opción, usa los valores clásicos)
  const numFont = NUMBER_FONTS[r.numeroFont] || NUMBER_FONTS.inter;
  ctx.fillStyle = r.numeroColor || "#F4C400";
  ctx.font = `900 84px ${numFont}`;
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

  // Equipos de la carrera — logo si se pudo cargar, si no un círculo con el
  // color del equipo, en filas centradas de hasta 7.
  if (teams.length) {
    const sectionTop = baseH - 26;
    ctx.fillStyle = "#5A5A5E";
    ctx.font = "700 13px Inter, sans-serif";
    ctx.fillText("EQUIPOS DE LA CARRERA", W / 2, sectionTop);

    teams.forEach((t, i) => {
      const row = Math.floor(i / logosPerRow);
      const itemsInRow = Math.min(logosPerRow, teams.length - row * logosPerRow);
      const rowWidth = itemsInRow * (logoSize + logoGap) - logoGap;
      const col = i % logosPerRow;
      const x = W / 2 - rowWidth / 2 + col * (logoSize + logoGap);
      const y = sectionTop + 24 + row * (logoSize + 30);

      if (t.logoImg) {
        ctx.drawImage(t.logoImg, x, y, logoSize, logoSize);
      } else {
        ctx.fillStyle = t.color || "#3B82F6";
        ctx.beginPath();
        ctx.arc(x + logoSize / 2, y + logoSize / 2, logoSize / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  // Pie
  ctx.fillStyle = "#5A5A5E";
  ctx.font = "600 14px Inter, sans-serif";
  ctx.fillText(`Se retiró a los ${info.lastAge} años`, W / 2, H - 30);
}

// Carga una imagen sin romper el flujo si falla (CORS, 404, etc.) —
// se usa tanto para la bandera como para los logos de los equipos.
function loadImageSafe(src) {
  return new Promise((resolve) => {
    if (!src) { resolve(null); return; }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function generateTradingCard() {
  if (!state) return;
  const h = state.history;
  const totals = h.reduce((acc, s) => {
    acc.cg += s.cg; acc.pod += s.pod; acc.pol += s.pol;
    if (s.pos === 1) acc.titles += 1;
    return acc;
  }, { cg: 0, pod: 0, pol: 0, titles: 0 });

  const careerTeams = getCareerTeams().map((t) => ({
    ...t,
    color: teamColor(t.name, t.championship),
    logoSrc: teamLogo(t.name, t.championship),
  }));

  const info = {
    totals,
    peakOvr: h.length ? Math.max(...h.map((s) => s.ovr), state.ovr) : state.ovr,
    bestPos: h.length ? Math.min(...h.map((s) => s.pos)) : null,
    lastAge: h.length ? h[h.length - 1].age : state.age,
    lastChamp: h.length ? h[h.length - 1].championship : state.championship,
    lastTeam: h.length ? h[h.length - 1].team : state.team.name,
    careerTeams,
  };

  const canvas = $("#trading-card-canvas");
  const ctx = canvas.getContext("2d");
  const r = state.rider;
  const genBtn = $("#btn-generate-card");
  const dlBtn = $("#btn-download-card");
  genBtn.disabled = true;

  const finish = (dataUrl) => {
    lastCardDataUrl = dataUrl;
    const preview = $("#trading-card-preview");
    preview.src = dataUrl;
    preview.style.display = "block";
    genBtn.disabled = false;
    dlBtn.style.display = "inline-block";
  };

  const flagSrc = r.nacionalidad ? `https://flagcdn.com/w160/${r.nacionalidad.code.toLowerCase()}.png` : null;

  // Bandera y logos de todos los equipos de la carrera, en paralelo — si
  // alguno falla (404, CORS...) simplemente se dibuja el círculo de color
  // de respaldo en su lugar, sin romper la generación de la tarjeta.
  Promise.all([loadImageSafe(flagSrc), ...careerTeams.map((t) => loadImageSafe(t.logoSrc))])
    .then(([flagEl, ...logoEls]) => {
      careerTeams.forEach((t, i) => { t.logoImg = logoEls[i]; });
      try {
        drawTradingCard(ctx, canvas, info, flagEl);
        finish(canvas.toDataURL("image/png"));
      } catch (err) {
        // El navegador puede "contaminar" el canvas si alguna imagen no
        // permite CORS: en ese caso se redibuja igual, pero sin bandera ni
        // logos (solo los círculos de color).
        careerTeams.forEach((t) => { t.logoImg = null; });
        drawTradingCard(ctx, canvas, info, null);
        finish(canvas.toDataURL("image/png"));
      }
    });
}

// Guarda la última tarjeta generada para que el botón de descarga pueda
// usarla sin tener que regenerarla.
let lastCardDataUrl = null;

$("#btn-generate-card").addEventListener("click", generateTradingCard);

$("#btn-download-card").addEventListener("click", () => {
  if (!lastCardDataUrl) return;
  const r = state.rider;
  const a = document.createElement("a");
  a.href = lastCardDataUrl;
  a.download = `${(r.apellido || "piloto").toLowerCase()}-motogp-card.png`;
  a.click();
});

// Reinicio completo: limpia el estado en memoria, el localStorage y TODOS
// los campos visuales de las pantallas 1 y 2 (antes se quedaban el toggle
// de "mano" y el buscador de país con el valor de la partida anterior,
// aunque el "draft" interno sí estuviera reiniciado).
function resetGame() {
  localStorage.removeItem(STORAGE_KEY);
  state = null;
  draft = { apellido: "", numero: null, nacionalidad: null, numeroFont: "inter", numeroColor: "#F4C400" };

  $("#input-apellido").value = "";
  $("#input-numero").value = "";
  $("#bike-surname").textContent = "APELLIDO";
  $("#bike-number").textContent = "00";
  $("#bike-number").style.fontFamily = NUMBER_FONTS.inter;
  $("#bike-number").style.color = "#F4C400";
  $("#number-plate").style.setProperty("--plate-accent", "#F4C400");
  $$("#number-font-group .number-font-btn").forEach((b) => b.classList.toggle("selected", b.dataset.font === "inter"));
  $$("#number-color-group .number-color-swatch").forEach((b) => b.classList.toggle("selected", b.dataset.color === "#F4C400"));
  $("#input-numero").value = "";


  $$("#number-font-group .number-font-btn").forEach((b) => b.classList.remove("selected"));
  $(`#number-font-group .number-font-btn[data-font="inter"]`).classList.add("selected");
  $$("#number-color-group .number-color-swatch").forEach((b) => b.classList.remove("selected"));
  $(`#number-color-group .number-color-swatch[data-color="#F4C400"]`).classList.add("selected");

  $("#input-search-country").value = "";
  $("#random-country-result").innerHTML = "";
  buildCountryGrid();
  $("#btn-to-debut").disabled = true;

  const preview = $("#trading-card-preview");
  preview.style.display = "none";
  preview.removeAttribute("src");
  $("#btn-download-card").style.display = "none";
  lastCardDataUrl = null;

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
// PRECARGA DE LOGOS
// ============================================================
// Precarga todos los logos de equipo usados en TEAMS (data.js) para que no
// haya parpadeo/carga tardía la primera vez que aparecen en una tarjeta de
// oferta o en el dashboard.
const logos = [
  "AGR.png", "ASPAR.png", "ASracing.png", "Advocates.png", "Ajo.png",
  "Althea.png", "AmericanRacing.png", "Aprilia.png", "ArcoYamaha.png", "Aruba.png",
  "BMW.png", "BOE.png", "Barni.png", "Bimota.png", "BluCruPramac.png",
  "BrCorse.png", "Broncos.png", "CIP.png", "CMTriumph.png", "Cardoso.png",
  "Cerba.png", "Ciatti.png", "DMR.png", "Ducati.png", "EasyRace.png",
  "EstrellaGalicia.png", "Fantic.png", "Fau55.png", "Feel.png", "GMT94.png",
  "GV.png", "GYTR.png", "GoEleven.png", "Gresini.png", "GresiniMoto2.png",
  "HRC.png", "Honda.png", "HondaAsia.png", "IntactGp.png", "Italtrans.png",
  "JDO.png", "Kawasaki.png", "Klint.png", "Kove.png", "Ktm.png",
  "Laglisse.png", "Lcr.png", "Leopard.png", "MDR.png", "MGM.png",
  "MLAV.png", "MMR.png", "MSI.png", "MTA.png", "MTM.png",
  "MarcVDS.png", "McAms.png", "Momoven.png", "MotoRapido.png", "MotoX.png",
  "Motocorsa.png", "Motozoo.png", "Niti.png", "Nitrous.png", "Orelac.png",
  "PBM.png", "PataYamaha.png", "Pons.png", "Pramac.png", "Prodina.png",
  "QJ.png", "R3Cup.png", "RedBullRookies.png", "Renzi.png", "RevoM2.png",
  "SNIPERS.png", "Sic58.png", "SpeedUp.png", "StyloBike.png", "Tech3.png",
  "TenKate.png", "TopSurface.png", "Trackhouse.png", "Triumph.png", "VFT.png",
  "VLRsuzuki.png", "VR46.png", "WRP.png", "WixxSuzuki.png", "Yamaha.png",
  "ZXmoto.png",
];
logos.forEach(file => {
  const img = new Image();
  img.src = `logos/${file}`;
});

// ============================================================
// INICIO
// ============================================================
if (loadState()) {
  renderDashboard();
  showScreen("screen-dashboard");
} else {
  showScreen("screen-identidad");
}
