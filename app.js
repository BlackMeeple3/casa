// ============================================================
// Sopralluogo · schede immobili — app.js
// Vanilla JS, nessun build step. Persistenza real-time su
// Firestore (Firebase modular SDK v10 via CDN).
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, doc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, serverTimestamp, setDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseApp = initializeApp(window.FIREBASE_CONFIG);
const db = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);
const googleProvider = new GoogleAuthProvider();
const immobiliRef = collection(db, "immobili");
// Documento unico e condiviso, indipendente da qualunque immobile: le
// offerte di mutuo che stai confrontando restano le stesse qualunque
// casa tu stia visitando in questo momento.
const mutuoRef = doc(db, "mutuo", "comparazione");

// ------------------------------------------------------------
// Confronto offerte di mutuo: elenco libero (una scheda per ogni
// banca/preventivo), a differenza degli arredi qui il numero di
// voci è variabile perché non sai in anticipo quante banche
// confronterai.
// ------------------------------------------------------------
const OFFERTA_FIELDS = [
  { key: "banca", label: "Banca", type: "text", compare: "none" },
  { key: "stato", label: "Stato della richiesta", type: "chip", options: ["Da richiedere", "Inviata", "Pre-delibera OK", "Rifiutata", "Scaduta", "Scelta"], compare: "none" },
  { key: "importoMutuo", label: "Importo mutuo", type: "number", unit: "€", compare: "none" },
  { key: "ltv", label: "LTV", type: "number", unit: "%", compare: "none" },
  { key: "durataAnni", label: "Durata", type: "number", unit: "anni", compare: "none" },
  { key: "tan", label: "TAN", type: "number", unit: "%", compare: "min" },
  { key: "taeg", label: "TAEG", type: "number", unit: "%", compare: "min" },
  { key: "rataMensile", label: "Rata mensile", type: "number", unit: "€", compare: "min" },
  { key: "istruttoria", label: "Istruttoria", type: "number", unit: "€", compare: "min" },
  { key: "perizia", label: "Perizia", type: "number", unit: "€", compare: "min" },
  { key: "impostaSostitutiva", label: "Imposta sostitutiva", type: "number", unit: "€", compare: "min" },
  { key: "assicurazioneVitaObbligatoria", label: "Assicurazione vita obbligatoria", type: "bool", compare: "preferFalse" },
  { key: "costoAssicurazioneVita", label: "Costo assicurazione vita (annuo)", type: "number", unit: "€", compare: "min" },
  { key: "costoAssicurazioneIncendio", label: "Costo assicurazione incendio (annuo)", type: "number", unit: "€", compare: "min" },
  { key: "scontiApplicati", label: "Sconti applicati (Giovani, Green, Consap...)", type: "text", compare: "none" },
  { key: "note", label: "Note", type: "text", compare: "none" },
];

function nuovaOfferta() {
  const o = {};
  for (const f of OFFERTA_FIELDS) o[f.key] = f.type === "bool" ? null : (f.type === "number" ? null : "");
  return o;
}

// ------------------------------------------------------------
// Checklist arredi/elettrodomestici di default: compare uguale
// per ogni immobile. Per ognuno segni se è già presente in casa;
// se non lo è, puoi annotare il costo stimato per aggiungerlo.
// ------------------------------------------------------------
const ARREDI_GROUPS = [
  { label: "Cucina", fields: [
    { key: "cucinaComponibile", label: "Cucina componibile (base + pensili)" },
    { key: "pianoCottura", label: "Piano cottura" },
    { key: "forno", label: "Forno" },
    { key: "cappa", label: "Cappa aspirante" },
    { key: "frigorifero", label: "Frigorifero" },
    { key: "lavastoviglie", label: "Lavastoviglie" },
    { key: "lavelloRubinetteria", label: "Lavello e rubinetteria" },
    { key: "tavoloCucina", label: "Tavolo da pranzo" },
    { key: "sedieCucina", label: "Sedie" },
  ]},
  { label: "Soggiorno", fields: [
    { key: "divano", label: "Divano" },
    { key: "tavolino", label: "Tavolino" },
    { key: "mobileTv", label: "Mobile porta TV" },
    { key: "tv", label: "Televisore" },
    { key: "libreria", label: "Libreria/mensole" },
    { key: "tendeSoggiorno", label: "Tende" },
    { key: "tappeto", label: "Tappeto" },
    { key: "lampadaTerra", label: "Lampada da terra" },
  ]},
  { label: "Camera da letto", fields: [
    { key: "letto", label: "Letto matrimoniale + rete" },
    { key: "materasso", label: "Materasso" },
    { key: "armadio", label: "Armadio" },
    { key: "comodini", label: "Comodini" },
    { key: "cassettiera", label: "Cassettiera" },
    { key: "lampadeComodino", label: "Lampade da comodino" },
    { key: "tendeCamera", label: "Tende" },
  ]},
  { label: "Bagno", fields: [
    { key: "mobileBagno", label: "Mobile bagno con lavabo" },
    { key: "specchio", label: "Specchio" },
    { key: "lavatrice", label: "Lavatrice" },
    { key: "accessoriBagno", label: "Accessori bagno" },
    { key: "cestoBiancheria", label: "Cesto biancheria" },
  ]},
  { label: "Ripostiglio / cantina / soffitta", fields: [
    { key: "scaffalature", label: "Scaffalature" },
    { key: "contenitori", label: "Contenitori/scatole organizzazione" },
  ]},
  { label: "Cortile / portico", fields: [
    { key: "tavoloEsterno", label: "Tavolo e sedie da esterno" },
    { key: "vasiPiante", label: "Vasi e piante" },
    { key: "illuminazioneEsterna", label: "Illuminazione esterna" },
  ]},
  { label: "Varie / elettrodomestici extra", fields: [
    { key: "climatizzatore", label: "Climatizzatore" },
    { key: "kitPulizie", label: "Kit pulizie iniziale" },
    { key: "ferroStiro", label: "Ferro da stiro e asse" },
    { key: "aspirapolvere", label: "Aspirapolvere" },
  ]},
];

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
    key: "trattativa", tag: "In trattativa", title: "Stato della trattativa",
    fields: [
      { key: "offertaFatta", label: "Offerta economica fatta al venditore", type: "number", unit: "€" },
      { key: "rispostaVenditore", label: "Risposta del venditore", type: "chip", options: ["Accettata", "Rifiutata", "In attesa", "Controproposta"] },
      { key: "controproposta", label: "Importo della controproposta", type: "number", unit: "€" },
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
  {
    key: "finanziamento", tag: "Il mutuo", title: "Finanziamento scelto",
    fields: [
      { key: "bancaScelta", label: "Banca del preventivo scelto", type: "text" },
      { key: "importoMutuo", label: "Importo del mutuo", type: "number", unit: "€" },
      { key: "percentualeLTV", label: "Percentuale finanziata (LTV)", type: "number", unit: "%" },
      { key: "anticipoVersato", label: "Anticipo versato", type: "number", unit: "€" },
      { key: "durataAnni", label: "Durata del mutuo", type: "number", unit: "anni" },
      { key: "tanOfferto", label: "TAN offerto", type: "number", unit: "%" },
      { key: "taegOfferto", label: "TAEG offerto", type: "number", unit: "%" },
      { key: "rataMensile", label: "Rata mensile risultante", type: "number", unit: "€" },
      { key: "consapRichiesto", label: "Richiesto il Fondo Consap under 36", type: "bool" },
      { key: "costoPerizia", label: "Costo perizia", type: "number", unit: "€" },
      { key: "costoIstruttoria", label: "Costo istruttoria", type: "number", unit: "€" },
      { key: "impostaSostitutiva", label: "Imposta sostitutiva sul mutuo", type: "number", unit: "€" },
    ],
  },
];

const BOOL_YES = "si";
const BOOL_NO = "no";

// ------------------------------------------------------------
// Helper generici per leggere/scrivere in un oggetto annidato
// tramite un percorso puntato, a qualunque profondità
// (es. "arredi.frigorifero.costo").
// ------------------------------------------------------------
function getPath(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function setPath(obj, path, value) {
  const keys = path.split(".");
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (typeof cur[keys[i]] !== "object" || cur[keys[i]] === null) cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
}

// ------------------------------------------------------------
// Stato locale
// ------------------------------------------------------------
const state = {
  view: "list",           // "list" | "detail" | "mutuo"
  immobili: new Map(),    // id -> dati documento
  order: [],              // id in ordine di creazione (più recenti prima)
  currentId: null,
  openSections: new Set([SECTIONS[0].key]),
  openOfferte: new Set(), // indici delle schede offerta espanse
  loaded: false,
  mutuoOfferte: [],       // condivise tra tutti gli immobili
  mutuoLoaded: false,
  mutuoTableView: false, // false = schede, true = tabella di confronto
  confrontoColonne: ["tan", "rataMensile", "taeg"], // max 3, in ordine — scelti dal popup
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

function subscribeMutuo() {
  onSnapshot(mutuoRef, (snap) => {
    state.mutuoLoaded = true;
    state.mutuoOfferte = snap.exists() ? (snap.data().offerte || []) : [];
    if (state.view === "mutuo") renderMutuoSafe();
  }, (err) => {
    console.error(err);
    showToast("Errore di connessione al confronto mutuo");
  });
}

function emptyImmobile(base) {
  const out = { ...base, createdAt: serverTimestamp() };
  for (const section of SECTIONS) {
    out[section.key] = {};
    for (const f of section.fields) out[section.key][f.key] = null;
  }
  out.arredi = {};
  for (const group of ARREDI_GROUPS) {
    for (const f of group.fields) out.arredi[f.key] = { presente: null, costo: null };
  }
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
  // arredi: conta come "compilata" ogni voce a cui è stato risposto sì/no
  const arredi = data.arredi || {};
  for (const group of ARREDI_GROUPS) {
    for (const f of group.fields) {
      total++;
      const v = arredi[f.key];
      if (v && (v.presente === true || v.presente === false)) filled++;
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
      ${mutuoLinkCardHtml()}
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

  appEl.innerHTML = `${mutuoLinkCardHtml()}<ul class="property-list">${items}</ul>${signOutLinkHtml()}`;
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

  const idxAfterSopralluogo = SECTIONS.findIndex((s) => s.key === "sopralluogo");
  const idxFinanziamento = SECTIONS.findIndex((s) => s.key === "finanziamento");
  const sectionsBefore = SECTIONS.slice(0, idxAfterSopralluogo + 1).map((s) => renderSection(s, d)).join("");
  const sectionsMiddle = SECTIONS.slice(idxAfterSopralluogo + 1, idxFinanziamento).map((s) => renderSection(s, d)).join("");
  const sectionsAfter = SECTIONS.slice(idxFinanziamento).map((s) => renderSection(s, d)).join("");
  const arrediHtml = renderArrediSection(d);
  const valutazioneHtml = renderValutazioneSection(d);

  appEl.innerHTML = `
    <div class="progress-summary"><span>Compilato</span><span>${filled}/${total} · ${pct}%</span></div>
    <div class="progress-bar"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
    ${sectionsBefore}
    ${arrediHtml}
    ${sectionsMiddle}
    ${mutuoLinkCardHtml()}
    ${sectionsAfter}
    ${valutazioneHtml}
  `;
}

function mutuoLinkCardHtml() {
  const n = state.mutuoOfferte.length;
  return `
    <button class="offerta-card mutuo-link" data-goto-mutuo>
      <div class="offerta-header" style="cursor:pointer;">
        <h4>💰 Confronto offerte di mutuo</h4>
        <span class="offerta-best-badge" style="background:none;">${n ? n + " salvate" : "vai →"}</span>
      </div>
      <p class="field-hint" style="padding:0 14px 12px;">Condiviso tra tutte le case che visiti, non solo questa.</p>
    </button>`;
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
  const arredi = d.arredi || {};
  let filled = 0, total = 0, costoDaAggiungere = 0;

  const groupsHtml = ARREDI_GROUPS.map((group) => {
    const rows = group.fields.map((f) => {
      const v = arredi[f.key] || {};
      total++;
      if (v.presente === true || v.presente === false) filled++;
      if (v.presente === false && typeof v.costo === "number") costoDaAggiungere += v.costo;

      const path = `arredi.${f.key}`;
      const costoRow = v.presente === false ? `
        <div class="num-field" style="margin-top:8px;">
          <input class="num-input" type="number" inputmode="decimal" data-num-set="${path}.costo" value="${v.costo ?? ""}" placeholder="0" />
          <span class="num-unit">€</span>
        </div>` : "";

      return `
        <div class="field-row stacked" data-field="${path}">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:12px;">
            <span class="field-label">${f.label}</span>
            <div class="bool-toggle">
              <button class="bool-btn yes ${v.presente === true ? "active" : ""}" data-bool-set="${path}.presente" data-bool-val="true">Sì</button>
              <button class="bool-btn no ${v.presente === false ? "active" : ""}" data-bool-set="${path}.presente" data-bool-val="false">No</button>
            </div>
          </div>
          ${costoRow}
        </div>`;
    }).join("");
    return `<p class="group-label">${escapeHtml(group.label)}</p>${rows}`;
  }).join("");

  const countLabel = costoDaAggiungere > 0
    ? `${filled}/${total} · +${costoDaAggiungere.toLocaleString("it-IT")} €`
    : `${filled}/${total}`;

  return `
    <div class="section ${open ? "open" : ""}" data-section="arredi">
      <button class="section-header" data-toggle-section="arredi">
        <span class="section-tag">Arredi</span>
        <h3>Dotazione arredi ed elettrodomestici</h3>
        <span class="section-count">${countLabel}</span>
        <span class="section-chevron">⌄</span>
      </button>
      <div class="section-body">${groupsHtml}</div>
    </div>`;
}

function renderMutuoSafe() {
  const active = document.activeElement;
  if (active && appEl.contains(active) && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) {
    return;
  }
  renderMutuoView();
}

function goMutuo() {
  state.view = "mutuo";
  state.openOfferte = new Set();
  renderMutuoView();
}

function renderMutuoView() {
  topbarTitle.textContent = "Confronto mutuo";
  topbarSubtitle.textContent = "Condiviso tra tutte le case";
  backBtn.hidden = false;
  editBtn.hidden = true;
  deleteBtn.hidden = true;
  fab.hidden = true;

  if (!state.mutuoLoaded) {
    appEl.innerHTML = `<p class="loading">Connessione a Firestore…</p>`;
    return;
  }

  const offerte = state.mutuoOfferte || [];
  const tanValidi = offerte.map((o) => o.tan).filter((v) => typeof v === "number");
  const migliorTan = tanValidi.length ? Math.min(...tanValidi) : null;

  const cardsHtml = offerte.map((o, i) => {
    const cardOpen = state.openOfferte.has(i);
    const titolo = o.banca ? escapeHtml(o.banca) : `Offerta ${i + 1}`;
    const badgeTan = typeof o.tan === "number" ? ` · TAN ${o.tan}%` : "";
    const isBest = migliorTan !== null && o.tan === migliorTan;

    const fieldsHtml = OFFERTA_FIELDS.map((f) => {
      const path = `${i}|${f.key}`;
      const value = o[f.key];
      if (f.type === "bool") {
        return `
          <div class="field-row" data-field="${path}">
            <span class="field-label">${f.label}</span>
            <div class="bool-toggle">
              <button class="bool-btn yes ${value === true ? "active" : ""}" data-offerta-bool="${path}" data-bool-val="true">Sì</button>
              <button class="bool-btn no ${value === false ? "active" : ""}" data-offerta-bool="${path}" data-bool-val="false">No</button>
            </div>
          </div>`;
      }
      if (f.type === "chip") {
        const chips = f.options.map((opt) => `
          <button class="chip ${value === opt ? "active" : ""}" data-offerta-chip="${path}" data-chip-val="${escapeHtml(opt)}">${opt}</button>
        `).join("");
        return `
          <div class="field-row stacked" data-field="${path}">
            <span class="field-label">${f.label}</span>
            <div class="chip-group">${chips}</div>
          </div>`;
      }
      if (f.type === "number") {
        return `
          <div class="field-row stacked" data-field="${path}">
            <span class="field-label">${f.label}</span>
            <div class="num-field">
              <input class="num-input" type="number" inputmode="decimal" data-offerta-field="${path}" value="${value ?? ""}" placeholder="0" />
              <span class="num-unit">${f.unit || ""}</span>
            </div>
          </div>`;
      }
      return `
        <div class="field-row stacked" data-field="${path}">
          <span class="field-label">${f.label}</span>
          <input class="text-input" type="text" data-offerta-field="${path}" value="${escapeHtml(value || "")}" />
        </div>`;
    }).join("");

    return `
      <div class="offerta-card ${isBest ? "best" : ""}">
        <button class="offerta-header" data-toggle-offerta="${i}">
          ${isBest ? '<span class="offerta-best-badge">★ miglior TAN</span>' : ""}
          <h4>${titolo}${badgeTan}</h4>
          <span class="section-chevron ${cardOpen ? "open" : ""}">⌄</span>
        </button>
        ${cardOpen ? `<div class="offerta-body">${fieldsHtml}
          <button class="add-row-btn danger" data-remove-offerta="${i}">✕ rimuovi questa offerta</button>
        </div>` : ""}
      </div>`;
  }).join("");

  appEl.innerHTML = `
    <p class="field-hint" style="margin-bottom:14px;">Queste offerte sono le stesse qualunque immobile tu stia guardando: confronta le banche una volta sola.</p>
    ${confrontoToggleBtnHtml(offerte.length)}
    ${state.mutuoTableView ? renderConfrontoTabella(offerte) : `${cardsHtml}<button class="add-row-btn" data-add-offerta>+ aggiungi offerta/banca</button>`}
  `;
}

function confrontoToggleBtnHtml(numOfferte) {
  if (numOfferte < 2) return "";
  return `
    <button class="compare-cta" data-toggle-confronto>
      ${state.mutuoTableView ? "← Torna alle schede" : "📊 Confronta tutte le offerte, parametro per parametro"}
    </button>`;
}

function fmtOffertaValue(v, f) {
  if (v === null || v === undefined || v === "") return "—";
  if (f.type === "bool") return v ? "Sì" : "No";
  if (f.type === "number") {
    const n = Number(v).toLocaleString("it-IT");
    if (f.unit === "€") return n + " €";
    if (f.unit === "%") return n + "%";
    if (f.unit) return n + " " + f.unit;
    return n;
  }
  return escapeHtml(String(v));
}

function renderConfrontoTabella(offerte) {
  const colFields = state.confrontoColonne
    .map((key) => OFFERTA_FIELDS.find((f) => f.key === key))
    .filter(Boolean);

  const pickBtnHtml = `
    <button class="add-row-btn" data-open-colonne>⚙ Scegli parametri da confrontare (${colFields.length}/3)</button>`;

  if (colFields.length === 0) {
    return `
      <p class="field-hint" style="margin-bottom:12px;">Nessun parametro scelto ancora.</p>
      ${pickBtnHtml}`;
  }

  // per ogni colonna scelta, trovo l'indice della banca con il valore migliore
  const bestPerCol = colFields.map((f) => {
    const values = offerte.map((o) => o[f.key]);
    if (f.compare === "min") {
      const nums = values.map((v) => (typeof v === "number" ? v : Infinity));
      const min = Math.min(...nums);
      return isFinite(min) ? nums.indexOf(min) : -1;
    }
    if (f.compare === "preferFalse") return values.findIndex((v) => v === false);
    return -1;
  });

  const headerCells = colFields.map((f) => `<th>${f.label}</th>`).join("");

  const bodyRows = offerte.map((o, i) => {
    const scelta = o.stato === "Scelta";
    const banca = o.banca ? escapeHtml(o.banca) : `Offerta ${i + 1}`;
    const cells = colFields.map((f, ci) => {
      const display = fmtOffertaValue(o[f.key], f);
      const isBest = bestPerCol[ci] === i && display !== "—";
      return `<td class="${isBest ? "cell-best" : ""}">${isBest ? "✓ " : ""}${display}</td>`;
    }).join("");
    return `<tr><th class="row-label ${scelta ? "row-scelta" : ""}">${banca}${scelta ? " ✓" : ""}</th>${cells}</tr>`;
  }).join("");

  return `
    <div class="confronto-wrap">
      <table class="confronto-table">
        <thead><tr><th class="corner"></th>${headerCells}</tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
    ${pickBtnHtml}`;
}

function openColonneModal() {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";

  const optionsHtml = OFFERTA_FIELDS.filter((f) => f.key !== "banca").map((f) => {
    const idx = state.confrontoColonne.indexOf(f.key);
    const selected = idx !== -1;
    return `
      <button class="colonna-pick ${selected ? "selected" : ""}" data-pick-colonna="${f.key}">
        ${selected ? `<span class="colonna-order">${idx + 1}</span>` : ""}
        <span>${f.label}</span>
      </button>`;
  }).join("");

  backdrop.innerHTML = `
    <div class="modal-sheet">
      <h2>Scegli fino a 3 parametri</h2>
      <p class="field-hint" style="margin-bottom:12px;">Tocca nell'ordine in cui li vuoi vedere in tabella. Tocca di nuovo per toglierne uno.</p>
      <div class="colonna-pick-list">${optionsHtml}</div>
      <div class="modal-actions">
        <button class="btn primary" data-close-colonne>Fatto</button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);

  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop || e.target.closest("[data-close-colonne]")) {
      backdrop.remove();
      renderMutuoView();
      return;
    }
    const pick = e.target.closest("[data-pick-colonna]");
    if (pick) {
      const key = pick.dataset.pickColonna;
      const idx = state.confrontoColonne.indexOf(key);
      if (idx !== -1) {
        state.confrontoColonne.splice(idx, 1);
      } else {
        if (state.confrontoColonne.length >= 3) {
          showToast("Massimo 3 parametri: togline uno prima");
          return;
        }
        state.confrontoColonne.push(key);
      }
      backdrop.remove();
      openColonneModal();
    }
  });
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

  // badge della sezione arredi: conteggio + costo da aggiungere
  {
    const arredi = d.arredi || {};
    let aFilled = 0, aTotal = 0, costo = 0;
    for (const group of ARREDI_GROUPS) {
      for (const f of group.fields) {
        aTotal++;
        const v = arredi[f.key];
        if (v && (v.presente === true || v.presente === false)) aFilled++;
        if (v && v.presente === false && typeof v.costo === "number") costo += v.costo;
      }
    }
    const el = appEl.querySelector('.section[data-section="arredi"] .section-count');
    if (el) el.textContent = costo > 0 ? `${aFilled}/${aTotal} · +${costo.toLocaleString("it-IT")} €` : `${aFilled}/${aTotal}`;
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
  state.openOfferte = new Set();
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
  setPath(d, path, value);
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

async function writeMutuoOfferte(newOfferte) {
  state.mutuoOfferte = newOfferte;
  try {
    await setDoc(mutuoRef, { offerte: newOfferte }, { merge: true });
    showToast("Salvato");
  } catch (err) {
    console.error(err);
    showToast("Salvataggio non riuscito");
  }
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

  const toggleOfferta = e.target.closest("[data-toggle-offerta]");
  if (toggleOfferta) {
    const idx = Number(toggleOfferta.dataset.toggleOfferta);
    if (state.openOfferte.has(idx)) state.openOfferte.delete(idx);
    else state.openOfferte.add(idx);
    renderMutuoView();
    return;
  }

  const gotoMutuo = e.target.closest("[data-goto-mutuo]");
  if (gotoMutuo) { goMutuo(); return; }

  const toggleConfronto = e.target.closest("[data-toggle-confronto]");
  if (toggleConfronto) {
    state.mutuoTableView = !state.mutuoTableView;
    renderMutuoView();
    return;
  }

  const openColonne = e.target.closest("[data-open-colonne]");
  if (openColonne) { openColonneModal(); return; }

  const addOfferta = e.target.closest("[data-add-offerta]");
  if (addOfferta) {
    const next = [...state.mutuoOfferte, nuovaOfferta()];
    state.openOfferte.add(next.length - 1);
    writeMutuoOfferte(next);
    renderMutuoView();
    return;
  }

  const removeOfferta = e.target.closest("[data-remove-offerta]");
  if (removeOfferta) {
    const idx = Number(removeOfferta.dataset.removeOfferta);
    const next = state.mutuoOfferte.filter((_, i) => i !== idx);
    state.openOfferte = new Set();
    writeMutuoOfferte(next);
    renderMutuoView();
    return;
  }

  const offertaBool = e.target.closest("[data-offerta-bool]");
  if (offertaBool) {
    const [idxStr, key] = offertaBool.dataset.offertaBool.split("|");
    const idx = Number(idxStr);
    const val = offertaBool.dataset.boolVal === "true";
    const next = [...state.mutuoOfferte];
    const current = next[idx][key];
    next[idx] = { ...next[idx], [key]: current === val ? null : val };
    writeMutuoOfferte(next);
    renderMutuoView();
    return;
  }

  const offertaChip = e.target.closest("[data-offerta-chip]");
  if (offertaChip) {
    const [idxStr, key] = offertaChip.dataset.offertaChip.split("|");
    const idx = Number(idxStr);
    const val = offertaChip.dataset.chipVal;
    const next = [...state.mutuoOfferte];
    const current = next[idx][key];
    next[idx] = { ...next[idx], [key]: current === val ? "" : val };
    writeMutuoOfferte(next);
    renderMutuoView();
    return;
  }
});

function getLocalValue(path) {
  const d = state.immobili.get(state.currentId);
  if (!d) return null;
  return getPath(d, path);
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

  const offertaField = e.target.closest("[data-offerta-field]");
  if (offertaField) {
    const [idxStr, key] = offertaField.dataset.offertaField.split("|");
    const idx = Number(idxStr);
    const fieldDef = OFFERTA_FIELDS.find((f) => f.key === key);
    const raw = offertaField.value;
    const val = fieldDef && fieldDef.type === "number" ? (raw === "" ? null : Number(raw)) : raw;

    const next = [...state.mutuoOfferte];
    next[idx] = { ...next[idx], [key]: val };
    state.mutuoOfferte = next;

    // un solo debounce condiviso per tutto l'array: evita che due campi
    // modificati quasi insieme si sovrascrivano a vicenda alla scrittura
    const debKey = "mutuoOfferte";
    clearTimeout(debounceTimers.get(debKey));
    debounceTimers.set(debKey, setTimeout(() => writeMutuoOfferte(next), 500));
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
    if (!started) { started = true; subscribe(); subscribeMutuo(); }
  } else {
    started = false;
    renderLoginGate();
  }
});
