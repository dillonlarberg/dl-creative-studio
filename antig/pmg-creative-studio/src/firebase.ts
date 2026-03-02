import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
    apiKey: "AIzaSyDwnBEjbWTkF9ugTYlq-_jvzNpXsW401AQ",
    authDomain: "automated-creative-e10d7.firebaseapp.com",
    projectId: "automated-creative-e10d7",
    storageBucket: "automated-creative-e10d7.firebasestorage.app",
    messagingSenderId: "663631825004",
    appId: "1:663631825004:web:e6d6da5214afdb6700b049"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);

export default app;
