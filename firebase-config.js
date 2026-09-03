// Configurazione del progetto Firebase "casa-fa153".
// Nota: qui usiamo il formato "window.FIREBASE_CONFIG" invece del classico
// `import { initializeApp } from "firebase/app"` che ti propone la console
// Firebase, perché il nostro progetto non usa npm/build: i moduli Firebase
// sono caricati direttamente da CDN dentro app.js. I valori sono gli stessi,
// cambia solo il "contenitore".
//
// databaseURL è per il Realtime Database: qui non lo usiamo (l'app salva
// su Firestore), l'ho lasciato comunque perché non dà fastidio a nessuno.

window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyDtg2pcFtebuToDdjkuY0Lxfe0zfpvQE2s",
  authDomain: "casa-fa153.firebaseapp.com",
  databaseURL: "https://casa-fa153-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "casa-fa153",
  storageBucket: "casa-fa153.firebasestorage.app",
  messagingSenderId: "430490985790",
  appId: "1:430490985790:web:1c415dffe0fb06ea4bb86f"
};
