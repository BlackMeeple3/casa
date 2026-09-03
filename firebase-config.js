// Incolla qui la configurazione del TUO progetto Firebase.
// La trovi in: Console Firebase → ⚙️ Impostazioni progetto → Le tue app → Configurazione SDK.
// Questi valori non sono segreti (sono destinati a girare nel browser): la vera
// protezione dei dati la fanno le regole di sicurezza di Firestore, vedi README.md.

window.FIREBASE_CONFIG = {
  apiKey: "INCOLLA_QUI_LA_TUA_API_KEY",
  authDomain: "tuo-progetto.firebaseapp.com",
  projectId: "tuo-progetto",
  storageBucket: "tuo-progetto.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:xxxxxxxxxxxxxxxxxxxxxx"
};
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDtg2pcFtebuToDdjkuY0Lxfe0zfpvQE2s",
  authDomain: "casa-fa153.firebaseapp.com",
  databaseURL: "https://casa-fa153-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "casa-fa153",
  storageBucket: "casa-fa153.firebasestorage.app",
  messagingSenderId: "430490985790",
  appId: "1:430490985790:web:1c415dffe0fb06ea4bb86f"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
