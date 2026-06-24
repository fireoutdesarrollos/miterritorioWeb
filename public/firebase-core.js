import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyALd_mItZYSLluocbxI8EUPle18UE4-8NQ",
    authDomain: "territorios-a3ba5.firebaseapp.com",
    projectId: "territorios-a3ba5",
    storageBucket: "territorios-a3ba5.firebasestorage.app",
    messagingSenderId: "745104413831",
    appId: "1:745104413831:web:3dac44b13311aeff829422",
    measurementId: "G-097G2Y8GRG"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const provider = new GoogleAuthProvider();