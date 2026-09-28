import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// This config is safe to ship in client code — access is controlled by
// your Firestore security rules, not by hiding these values.
const firebaseConfig = {
  apiKey: "AIzaSyAsHIlnvQZ5xuGlTZ5jLE7IDqjLOogmZG0",
  authDomain: "psych-web-3c425.firebaseapp.com",
  projectId: "psych-web-3c425",
  storageBucket: "psych-web-3c425.firebasestorage.app",
  messagingSenderId: "54400163561",
  appId: "1:54400163561:web:c022c0cce17b7d0c1a1a78",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);