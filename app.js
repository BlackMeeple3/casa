// ============================================================
// Sopralluogo · schede immobili — app.js
// Vanilla JS, nessun build step. Persistenza real-time su
// Firestore (Firebase modular SDK v10 via CDN).
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, doc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseApp = initializeApp(window.FIREBASE_CONFIG);
const db = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);
const googleProvider = new GoogleAuthProvider();
const immobiliRef = collection(db, "immobili");

// ------------------------------------------------------------
// Schema: ogni sezione ha una chiave (= nome del campo mappa
// su Firestore), un'etichetta di fase e i campi che contiene.
// Aggiungere una voce qui la fa comparire automaticamente
// nell'interfaccia, con l'input giusto per il suo tipo.
// ------------------------------------------------------------
const SECTIONS = [
  {
    key: "documenti", tag: "Prima di entrare", title: "Documenti da farsi mandare",
    fields: [
      { key: "planimetriaCatastale", label: "Planimetria catastale aggiornata", type: "bool" },
      { key: "visuraCatastale", label: "Visura catastale", type: "bool" },
      { key: "ape", label: "Attestato di Prestazione Energetica (APE)", type: "bool" },
      { key: "docRistrutturazione", label: "Documenti ristrutturazione (CILA/SCIA, conformità impianti)", type: "bool" },
      { key: "regolamentoCorte", label: "Regolamento/accordi sulla corte condivisa", type: "bool" },
    ],
  },
  {
    key: "domande", tag: "Da chiedere", title: "Domande ad agente e venditore",
    fields: [
      { key: "prezzoTrattabile", label: "Il prezzo è trattabile?", type: "bool" },
      { key: "mesiSulMercato", label: "Da quanti mesi è sul mercato", type: "number", unit: "mesi" },
      { key: "motivoVendita", label: "Motivo della vendita", type: "text" },
      { key: "speseAnnueBollette", label: "Spesa media annua bollette/riscaldamento", type: "number", unit: "€" },
      { key: "annoRistrutturazione", label: "Anno della ristrutturazione", type: "number", unit: "anno" },
      { key: "rifElettrico", label: "Rifatto: impianto elettrico", type: "bool" },
      { key: "rifIdraulico", label: "Rifatto: impianto idraulico", type: "bool" },
      { key: "rifTetto", label: "Rifatto: tetto", type: "bool" },
      { key: "rifCaldaia", label: "Rifatto: caldaia", type: "bool" },
      { key: "postoAutoEsclusivo", label: "Posto auto di proprietà esclusiva (non solo passaggio)", type: "bool" },
      { key: "sottotettoCatastale", label: "Sottotetto regolare come vano accessorio", type: "bool" },
      { key: "tipoScalaSottotetto", label: "Tipo di scala per il sottotetto", type: "chip", options: ["Fissa", "Retrattile", "A chiocciola"] },
      { key: "vincoliStorici", label: "Vincoli storici/paesaggistici sull'edificio", type: "bool" },
      { key: "provenienza", label: "Provenienza dell'immobile", type: "chip", options: ["Acquisto", "Successione", "Donazione"] },
      { key: "tempiLiberta", label: "Tempi di libertà dell'immobile", type: "chip", options: ["Subito", "Da concordare"] },
    ],
  },
  {
    key: "sopralluogo", tag: "Da controllare", title: "Sopralluogo fisico",
    fields: [
      { key: "umiditaMuffa", label: "Umidità/muffa su pareti, soffitti, cantina", type: "bool" },
      { key: "infissiTenuta", label: "Infissi con buona tenuta", type: "bool" },
      { key: "salvavitaPresente", label: "Salvavita presente nel quadro elettrico", type: "bool" },
      { key: "dichiarazioneConformita", label: "Dichiarazione di conformità impianti mostrata", type: "bool" },
      { key: "pressioneIdrica", label: "Buona pressione idrica ai rubinetti", type: "bool" },
      { key: "scarichiOk", label: "Scarichi che funzionano bene", type: "bool" },
      { key: "riscaldamentoFunzionante", label: "Riscaldamento a pavimento visto funzionante", type: "bool" },
      { key: "etaCaldaia", label: "Età della caldaia", type: "number", unit: "anni" },
      { key: "altezzaSottotetto", label: "Altezza reale sottotetto misurata", type: "number", unit: "cm" },
      { key: "dimensioneCortileReale", label: "Dimensione reale cortile/giardino percepita", type: "number", unit: "m²" },
      { key: "statoTetto", label: "Stato del tetto/copertura", type: "chip", options: ["Buono", "Discreto", "Da rifare"] },
      { key: "crepeCappotto", label: "Crepe o distacchi nel cappotto termico", type: "bool" },
      { key: "rumoreStrada", label: "Rumore percepito dalla strada", type: "chip", options: ["Basso", "Medio", "Alto"] },
      { key: "rumoreVicini", label: "Rumore dai vicini (pareti in comune)", type: "chip", options: ["Basso", "Medio", "Alto"] },
      { key: "esposizioneVerificata", label: "Esposizione verificata con la bussola", type: "chip", options: ["N", "NE", "E", "SE", "S", "SO", "O", "NO"] },
      { key: "tarli", label: "Segni di tarli/insetti sul legno", type: "bool" },
    ],
  },
  {
    key: "catastale", tag: "Catastale e legale", title: "Aspetti catastali e legali",
    fields: [
      { key: "planimetriaConforme", label: "Planimetria depositata conforme allo stato di fatto", type: "bool" },
      { key: "ipotechePignoramenti", label: "Assenza di ipoteche o pignoramenti", type: "bool" },
      { key: "abusiEdilizi", label: "Assenza di abusi edilizi non sanati", type: "bool" },
    ],
  },
  {
    key: "economico", tag: "Conti", title: "Aspetti economici",
    fields: [
      { key: "simulazioneBancaria", label: "Simulazione reale fatta in banca (non solo online)", type: "bool" },
      { key: "iseeSotto40k", label: "ISEE sotto 40.000 € confermato (Fondo Consap)", type: "bool" },
      { key: "nonProprietarioAltri", label: "Confermato: nessun'altra proprietà immobiliare", type: "bool" },
      { key: "budgetTotale", label: "Budget totale (anticipo + spese accessorie)", type: "number", unit: "€" },
    ],
  },
];

const BOOL_YES = "si";
const BOOL_NO = "no";

// ------------------------------------------------------------
// Stato locale
// ------------------------------------------------------------
const state = {
  view: "list",           // "list" | "detail"
  immobili: new Map(),    // id -> dati documento
  order: [],              // id in ordine di creazione (più recenti prima)
  currentId: null,
  openSections: new Set([SECTIONS[0].key]),
  loaded: false,
};

const debounceTimers = new Map();

// ------------------------------------------------------------
// Firestore: sottoscrizione in tempo reale
// ------------------------------------------------------------
function subscribe() {
  const q = query(immobiliRef, orderBy("createdAt", "desc"));
  onSnapshot(q, (snap) => {
    state.loaded = true;
    state.order = [];
    snap.forEach((d) => {
      state.immobili.set(d.id, d.data());
      state.order.push(d.id);
    });
    if (state.view === "list") {
      renderList();
    } else if (state.view === "detail") {
      renderDetailSafe();
    }
  }, (err) => {
    console.error(err);
    showToast("Errore di connessione a Firestore");
  });
}

function emptyImmobile(base) {
  const out = { ...base, createdAt: serverTimestamp() };
  for (const section of SECTIONS) {
    out[section.key] = {};
    for (const f of section.fields) out[section.key][f.key] = null;
  }
  out.arredi = [];
  out.valutazione = { stelle: 0, andreiAvanti: null, noteFinali: "" };
  return out;
}

async function createImmobile(base) {
  const docData = emptyImmobile(base);
  const ref = await addDoc(immobiliRef, docData);
  // Seed locale immediato: non aspettiamo il round-trip dello snapshot
  // per poter aprire subito la scheda appena creata.
  state.immobili.set(ref.id, docData);
  if (!state.order.includes(ref.id)) state.order.unshift(ref.id);
  return ref.id;
}

async function patchImmobile(id, partialDotted) {
  try {
    await updateDoc(doc(db, "immobili", id), partialDotted);
  } catch (err) {
    console.error(err);
    showToast("Salvataggio non riuscito");
  }
}

async function removeImmobile(id) {
  await deleteDoc(doc(db, "immobili", id));
}

// ------------------------------------------------------------
// Helpers di dominio
// ------------------------------------------------------------
function countProgress(data) {
  let total = 0, filled = 0;
  for (const section of SECTIONS) {
    for (const f of section.fields) {
      total++;
      const v = data[section.key] ? data[section.key][f.key] : null;
      if (v !== null && v !== undefined && v !== "") filled++;
    }
  }
  // valutazione finale conta come un unico blocco extra
  total += 2;
  if (data.valutazione) {
    if (data.valutazione.stelle) filled++;
    if (data.valutazione.andreiAvanti !== null && data.valutazione.andreiAvanti !== undefined) filled++;
  }
  return { filled, total };
}

function fmtMoney(n) {
  if (n === null || n === undefined || n === "") return "—";
  return Number(n).toLocaleString("it-IT") + " €";
}

// ------------------------------------------------------------
// Rendering: elenco
// ------------------------------------------------------------
const appEl = document.getElementById("app");
const topbarTitle = document.getElementById("topbarTitle");
const topbarSubtitle = document.getElementById("topbarSubtitle");
const backBtn = document.getElementById("backBtn");
const editBtn = document.getElementById("editBtn");
const deleteBtn = document.getElementById("deleteBtn");
const fab = document.getElementById("fabAdd");

function renderList() {
  topbarTitle.textContent = "Sopralluoghi";
  topbarSubtitle.textContent = state.order.length
    ? `${state.order.length} scheda${state.order.length === 1 ? "" : "e"}`
    : "";
  backBtn.hidden = true;
  editBtn.hidden = true;
  deleteBtn.hidden = true;
  fab.hidden = false;

  if (!state.loaded) {
    appEl.innerHTML = `<p class="loading">Connessione a Firestore…</p>`;
    return;
  }

  if (state.order.length === 0) {
    appEl.innerHTML = `
      <div class="empty-state">
        <strong>Nessuna scheda ancora</strong>
        Tocca “+” per aggiungere il primo immobile da visitare.
      </div>
      ${signOutLinkHtml()}`;
    document.getElementById("signOutBtn").addEventListener("click", () => signOut(auth));
    return;
  }

  const items = state.order.map((id) => {
    const d = state.immobili.get(id);
    const { filled, total } = countProgress(d);
    return `
      <li class="property-card" data-open="${id}">
        <div class="property-card-main">
          <h2>${escapeHtml(d.indirizzo || "Senza indirizzo")}</h2>
          <p class="property-card-meta">${fmtMoney(d.prezzoRichiesto)} · ${d.superficieMq ? d.superficieMq + " m²" : "— m²"}</p>
        </div>
        <div class="property-card-progress">
          <span class="progress-ring-label">${filled}/${total}</span>
        </div>
      </li>`;
  }).join("");

  appEl.innerHTML = `<ul class="property-list">${items}</ul>${signOutLinkHtml()}`;
  document.getElementById("signOutBtn").addEventListener("click", () => signOut(auth));
}

function signOutLinkHtml() {
  return `
    <p style="text-align:center; margin-top:22px;">
      <button id="signOutBtn" style="background:none; border:none; color:var(--ink-soft); font-size:0.82rem; text-decoration:underline; cursor:pointer;">
        Esci da ${escapeHtml(auth.currentUser?.email || "Google")}
      </button>
    </p>`;
}

// ------------------------------------------------------------
// Rendering: dettaglio
// ------------------------------------------------------------
function renderDetailSafe() {
  // Evita di ridisegnare (e perdere il focus) mentre l'utente
  // sta scrivendo in un campo testo/numero.
  const active = document.activeElement;
  if (active && appEl.contains(active) && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) {
    return;
  }
  renderDetail();
}

function renderDetail() {
  const d = state.immobili.get(state.currentId);
  if (!d) { goList(); return; }

  topbarTitle.textContent = d.indirizzo || "Immobile";
  topbarSubtitle.textContent = `${fmtMoney(d.prezzoRichiesto)} · ${d.superficieMq ? d.superficieMq + " m²" : "— m²"}`;
  backBtn.hidden = false;
  editBtn.hidden = false;
  deleteBtn.hidden = false;
  fab.hidden = true;

  const { filled, total } = countProgress(d);
  const pct = total ? Math.round((filled / total) * 100) : 0;

  const sectionsHtml = SECTIONS.map((section) => renderSection(section, d)).join("");
  const arrediHtml = renderArrediSection(d);
  const valutazioneHtml = renderValutazioneSection(d);

  appEl.innerHTML = `
    <div class="progress-summary"><span>Compilato</span><span>${filled}/${total} · ${pct}%</span></div>
    <div class="progress-bar"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
    ${sectionsHtml}
    ${arrediHtml}
    ${valutazioneHtml}
  `;
}

function renderSection(section, d) {
  const open = state.openSections.has(section.key);
  const data = d[section.key] || {};
  let filled = 0;
  const fieldsHtml = section.fields.map((f) => {
    const v = data[f.key];
    if (v !== null && v !== undefined && v !== "") filled++;
    return renderField(section.key, f, v);
  }).join("");

  return `
    <div class="section ${open ? "open" : ""}" data-section="${section.key}">
      <button class="section-header" data-toggle-section="${section.key}">
        <span class="section-tag">${section.tag}</span>
        <h3>${section.title}</h3>
        <span class="section-count">${filled}/${section.fields.length}</span>
        <span class="section-chevron">⌄</span>
      </button>
      <div class="section-body">${fieldsHtml}</div>
    </div>`;
}

function renderField(sectionKey, f, value) {
  const path = `${sectionKey}.${f.key}`;
  if (f.type === "bool") {
    return `
      <div class="field-row" data-field="${path}">
        <span class="field-label">${f.label}</span>
        <div class="bool-toggle">
          <button class="bool-btn yes ${value === true ? "active" : ""}" data-bool-set="${path}" data-bool-val="true">Sì</button>
          <button class="bool-btn no ${value === false ? "active" : ""}" data-bool-set="${path}" data-bool-val="false">No</button>
        </div>
      </div>`;
  }
  if (f.type === "number") {
    return `
      <div class="field-row stacked" data-field="${path}">
        <span class="field-label">${f.label}</span>
        <div class="num-field">
          <input class="num-input" type="number" inputmode="decimal" data-num-set="${path}" value="${value ?? ""}" placeholder="0" />
          <span class="num-unit">${f.unit || ""}</span>
        </div>
      </div>`;
  }
  if (f.type === "text") {
    return `
      <div class="field-row stacked" data-field="${path}">
        <span class="field-label">${f.label}</span>
        <textarea data-text-set="${path}" placeholder="Scrivi qui…">${escapeHtml(value || "")}</textarea>
      </div>`;
  }
  if (f.type === "chip") {
    const chips = f.options.map((opt) => `
      <button class="chip ${value === opt ? "active" : ""}" data-chip-set="${path}" data-chip-val="${escapeHtml(opt)}">${opt}</button>
    `).join("");
    return `
      <div class="field-row stacked" data-field="${path}">
        <span class="field-label">${f.label}</span>
        <div class="chip-group">${chips}</div>
      </div>`;
  }
  return "";
}

function renderArrediSection(d) {
  const open = state.openSections.has("arredi");
  const arredi = d.arredi || [];
  const rows = arredi.map((a, i) => `
    <div class="arredo-row" data-arredo-index="${i}">
      <input class="text-input" type="text" placeholder="Es. cucina, tende…" data-arredo-field="nome" value="${escapeHtml(a.nome || "")}" />
      <div class="bool-toggle">
        <button class="bool-btn yes ${a.incluso === true ? "active" : ""}" data-arredo-bool="true">Sì</button>
        <button class="bool-btn no ${a.incluso === false ? "active" : ""}" data-arredo-bool="false">No</button>
      </div>
      <input class="num-input" type="number" inputmode="decimal" placeholder="€" data-arredo-field="valore" value="${a.valore ?? ""}" />
      <button class="arredo-remove" data-arredo-remove="${i}" aria-label="Rimuovi">✕</button>
    </div>
  `).join("");

  return `
    <div class="section ${open ? "open" : ""}" data-section="arredi">
      <button class="section-header" data-toggle-section="arredi">
        <span class="section-tag">Trattativa</span>
        <h3>Arredi/elettrodomestici inclusi</h3>
        <span class="section-count">${arredi.length}</span>
        <span class="section-chevron">⌄</span>
      </button>
      <div class="section-body">
        ${rows}
        <button class="add-row-btn" data-add-arredo>+ aggiungi voce</button>
      </div>
    </div>`;
}

function renderValutazioneSection(d) {
  const open = state.openSections.has("valutazione");
  const v = d.valutazione || { stelle: 0, andreiAvanti: null, noteFinali: "" };
  const stars = [1, 2, 3, 4, 5].map((n) => `
    <button class="star-btn ${n <= (v.stelle || 0) ? "filled" : ""}" data-star="${n}">★</button>
  `).join("");

  return `
    <div class="section ${open ? "open" : ""}" data-section="valutazione">
      <button class="section-header" data-toggle-section="valutazione">
        <span class="section-tag">Dopo la visita</span>
        <h3>Valutazione complessiva</h3>
        <span class="section-count">${v.stelle ? v.stelle + "/5" : "—"}</span>
        <span class="section-chevron">⌄</span>
      </button>
      <div class="section-body">
        <div class="field-row stacked">
          <span class="field-label">Punteggio</span>
          <div class="star-row">${stars}</div>
        </div>
        <div class="field-row">
          <span class="field-label">Andrei avanti con questa proposta?</span>
          <div class="bool-toggle">
            <button class="bool-btn yes ${v.andreiAvanti === true ? "active" : ""}" data-bool-set="valutazione.andreiAvanti" data-bool-val="true">Sì</button>
            <button class="bool-btn no ${v.andreiAvanti === false ? "active" : ""}" data-bool-set="valutazione.andreiAvanti" data-bool-val="false">No</button>
          </div>
        </div>
        <div class="field-row stacked">
          <span class="field-label">Note libere</span>
          <textarea data-text-set="valutazione.noteFinali" placeholder="Qualunque cosa non rientri sopra…">${escapeHtml(v.noteFinali || "")}</textarea>
        </div>
      </div>
    </div>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ------------------------------------------------------------
// Aggiornamenti leggeri di solo testo (senza re-render pieno),
// usati mentre l'utente digita in un numero/testo.
// ------------------------------------------------------------
function refreshCountersOnly() {
  const d = state.immobili.get(state.currentId);
  if (!d) return;
  const { filled, total } = countProgress(d);
  const pct = total ? Math.round((filled / total) * 100) : 0;
  const summary = appEl.querySelector(".progress-summary span:last-child");
  const bar = appEl.querySelector(".progress-bar-fill");
  if (summary) summary.textContent = `${filled}/${total} · ${pct}%`;
  if (bar) bar.style.width = `${pct}%`;

  for (const section of SECTIONS) {
    const data = d[section.key] || {};
    const count = section.fields.filter((f) => {
      const v = data[f.key];
      return v !== null && v !== undefined && v !== "";
    }).length;
    const el = appEl.querySelector(`.section[data-section="${section.key}"] .section-count`);
    if (el) el.textContent = `${count}/${section.fields.length}`;
  }
}

// ------------------------------------------------------------
// Navigazione
// ------------------------------------------------------------
function goList() {
  state.view = "list";
  state.currentId = null;
  renderList();
}

function openImmobile(id) {
  state.view = "detail";
  state.currentId = id;
  state.openSections = new Set([SECTIONS[0].key]);
  renderDetail();
}

backBtn.addEventListener("click", goList);

// ------------------------------------------------------------
// Toast
// ------------------------------------------------------------
let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 1400);
}

// ------------------------------------------------------------
// Scrittura locale ottimistica + patch Firestore con dot-path
// ------------------------------------------------------------
function setLocalValue(id, path, value) {
  const d = state.immobili.get(id);
  if (!d) return;
  const [sectionKey, fieldKey] = path.split(".");
  if (!d[sectionKey]) d[sectionKey] = {};
  d[sectionKey][fieldKey] = value;
}

function writeField(path, value, { debounceMs = 0 } = {}) {
  const id = state.currentId;
  setLocalValue(id, path, value);
  refreshCountersOnly();

  const key = id + "::" + path;
  if (debounceMs > 0) {
    clearTimeout(debounceTimers.get(key));
    debounceTimers.set(key, setTimeout(() => {
      patchImmobile(id, { [path]: value }).then(() => showToast("Salvato"));
    }, debounceMs));
  } else {
    patchImmobile(id, { [path]: value }).then(() => showToast("Salvato"));
  }
}

async function writeArredi(id, newArredi) {
  const d = state.immobili.get(id);
  if (d) d.arredi = newArredi;
  if (id === state.currentId) refreshCountersOnly();
  await patchImmobile(id, { arredi: newArredi });
  showToast("Salvato");
}

// ------------------------------------------------------------
// Delegazione eventi sull'app
// ------------------------------------------------------------
appEl.addEventListener("click", (e) => {
  const card = e.target.closest("[data-open]");
  if (card) { openImmobile(card.dataset.open); return; }

  const sectionToggle = e.target.closest("[data-toggle-section]");
  if (sectionToggle) {
    const key = sectionToggle.dataset.toggleSection;
    if (state.openSections.has(key)) state.openSections.delete(key);
    else state.openSections.add(key);
    renderDetail();
    return;
  }

  const boolBtn = e.target.closest("[data-bool-set]");
  if (boolBtn) {
    const path = boolBtn.dataset.boolSet;
    const val = boolBtn.dataset.boolVal === "true";
    // click su un valore già attivo lo azzera (torna a "non risposto")
    const current = getLocalValue(path);
    writeField(path, current === val ? null : val);
    renderDetail();
    return;
  }

  const chipBtn = e.target.closest("[data-chip-set]");
  if (chipBtn) {
    const path = chipBtn.dataset.chipSet;
    const val = chipBtn.dataset.chipVal;
    const current = getLocalValue(path);
    writeField(path, current === val ? null : val);
    renderDetail();
    return;
  }

  const starBtn = e.target.closest("[data-star]");
  if (starBtn) {
    const n = Number(starBtn.dataset.star);
    const d = state.immobili.get(state.currentId);
    const current = d.valutazione?.stelle || 0;
    const next = current === n ? 0 : n;
    d.valutazione = d.valutazione || {};
    d.valutazione.stelle = next;
    refreshCountersOnly();
    patchImmobile(state.currentId, { "valutazione.stelle": next }).then(() => showToast("Salvato"));
    renderDetail();
    return;
  }

  const addArredo = e.target.closest("[data-add-arredo]");
  if (addArredo) {
    const id = state.currentId;
    const d = state.immobili.get(id);
    const next = [...(d.arredi || []), { nome: "", incluso: null, valore: null }];
    writeArredi(id, next);
    renderDetail();
    return;
  }

  const removeArredo = e.target.closest("[data-arredo-remove]");
  if (removeArredo) {
    const idx = Number(removeArredo.dataset.arredoRemove);
    const id = state.currentId;
    const d = state.immobili.get(id);
    const next = (d.arredi || []).filter((_, i) => i !== idx);
    writeArredi(id, next);
    renderDetail();
    return;
  }

  const arredoBool = e.target.closest("[data-arredo-bool]");
  if (arredoBool) {
    const row = arredoBool.closest("[data-arredo-index]");
    const idx = Number(row.dataset.arredoIndex);
    const val = arredoBool.dataset.arredoBool === "true";
    const id = state.currentId;
    const d = state.immobili.get(id);
    const next = [...d.arredi];
    next[idx] = { ...next[idx], incluso: next[idx].incluso === val ? null : val };
    writeArredi(id, next);
    renderDetail();
    return;
  }
});

function getLocalValue(path) {
  const d = state.immobili.get(state.currentId);
  const [sectionKey, fieldKey] = path.split(".");
  return d && d[sectionKey] ? d[sectionKey][fieldKey] : null;
}

appEl.addEventListener("input", (e) => {
  const numEl = e.target.closest("[data-num-set]");
  if (numEl) {
    const path = numEl.dataset.numSet;
    const raw = numEl.value;
    const val = raw === "" ? null : Number(raw);
    writeField(path, val, { debounceMs: 500 });
    return;
  }

  const textEl = e.target.closest("[data-text-set]");
  if (textEl) {
    const path = textEl.dataset.textSet;
    writeField(path, textEl.value, { debounceMs: 600 });
    return;
  }

  const arredoField = e.target.closest("[data-arredo-field]");
  if (arredoField) {
    const row = arredoField.closest("[data-arredo-index]");
    const idx = Number(row.dataset.arredoIndex);
    const field = arredoField.dataset.arredoField;
    const raw = arredoField.value;
    const id = state.currentId;
    const d = state.immobili.get(id);
    const next = [...d.arredi];
    next[idx] = { ...next[idx], [field]: field === "valore" ? (raw === "" ? null : Number(raw)) : raw };
    d.arredi = next;
    const key = id + "::arredi";
    clearTimeout(debounceTimers.get(key));
    debounceTimers.set(key, setTimeout(() => writeArredi(id, next), 500));
    return;
  }
});

// ------------------------------------------------------------
// Modale "nuovo immobile" / "modifica dati generali"
// ------------------------------------------------------------
function openFormModal(existingId) {
  const d = existingId ? state.immobili.get(existingId) : null;
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal-sheet">
      <h2>${existingId ? "Modifica dati generali" : "Nuovo immobile"}</h2>
      <label for="f-indirizzo">Indirizzo</label>
      <input id="f-indirizzo" class="text-input" type="text" value="${escapeHtml(d?.indirizzo || "")}" placeholder="Via Trento 12, San Martino Siccomario" />
      <div class="field-grid" style="margin-top:10px;">
        <div>
          <label for="f-prezzo">Prezzo richiesto (€)</label>
          <input id="f-prezzo" class="text-input" type="number" inputmode="decimal" value="${d?.prezzoRichiesto ?? ""}" />
        </div>
        <div>
          <label for="f-mq">Superficie (m²)</label>
          <input id="f-mq" class="text-input" type="number" inputmode="decimal" value="${d?.superficieMq ?? ""}" />
        </div>
      </div>
      <div class="field-full" style="margin-top:10px;">
        <label for="f-link">Link annuncio</label>
        <input id="f-link" class="text-input" type="url" value="${escapeHtml(d?.link || "")}" placeholder="https://www.immobiliare.it/…" />
      </div>
      <div class="modal-actions">
        <button class="btn" data-modal-cancel>Annulla</button>
        <button class="btn primary" data-modal-save>${existingId ? "Salva" : "Crea scheda"}</button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);

  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop || e.target.closest("[data-modal-cancel]")) {
      backdrop.remove();
    }
  });

  backdrop.querySelector("[data-modal-save]").addEventListener("click", async () => {
    const base = {
      indirizzo: backdrop.querySelector("#f-indirizzo").value.trim(),
      prezzoRichiesto: numOrNull(backdrop.querySelector("#f-prezzo").value),
      superficieMq: numOrNull(backdrop.querySelector("#f-mq").value),
      link: backdrop.querySelector("#f-link").value.trim(),
    };
    if (!base.indirizzo) {
      showToast("Serve almeno l'indirizzo");
      return;
    }
    if (existingId) {
      await patchImmobile(existingId, base);
      showToast("Aggiornato");
    } else {
      const id = await createImmobile(base);
      showToast("Scheda creata");
      openImmobile(id);
    }
    backdrop.remove();
  });
}

function numOrNull(v) { return v === "" || v === null || v === undefined ? null : Number(v); }

fab.addEventListener("click", () => openFormModal(null));
editBtn.addEventListener("click", () => openFormModal(state.currentId));

deleteBtn.addEventListener("click", async () => {
  if (!state.currentId) return;
  const d = state.immobili.get(state.currentId);
  const ok = confirm(`Eliminare definitivamente la scheda "${d?.indirizzo || ""}"?`);
  if (!ok) return;
  await removeImmobile(state.currentId);
  showToast("Scheda eliminata");
  goList();
});

// ------------------------------------------------------------
// Avvio: schermata di accesso con Google. L'app vera e propria
// parte solo dopo il login, così le regole Firestore possono
// restringere lettura/scrittura al tuo solo uid.
// ------------------------------------------------------------
let started = false;

function renderLoginGate() {
  topbarTitle.textContent = "Sopralluoghi";
  topbarSubtitle.textContent = "";
  backBtn.hidden = true;
  editBtn.hidden = true;
  deleteBtn.hidden = true;
  fab.hidden = true;
  appEl.innerHTML = `
    <div class="empty-state">
      <strong>Accesso richiesto</strong>
      Le schede sono private: accedi con il tuo account Google per continuare.
      <div style="margin-top:18px;">
        <button class="btn primary" id="googleLoginBtn" style="display:inline-flex; width:auto; padding:12px 22px;">Accedi con Google</button>
      </div>
    </div>`;
  document.getElementById("googleLoginBtn").addEventListener("click", () => {
    signInWithPopup(auth, googleProvider).catch((err) => {
      console.error(err);
      if (err.code === "auth/unauthorized-domain") {
        showToast("Dominio non autorizzato: aggiungilo in Firebase → Authentication → Impostazioni");
      } else {
        showToast("Accesso non riuscito");
      }
    });
  });
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    if (!started) { started = true; subscribe(); }
  } else {
    started = false;
    renderLoginGate();
  }
});
