// Importamos Firebase (Vanilla JS)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
// IMPORTANTE: Cambiamos signInWithPopup por signInWithRedirect y getRedirectResult
import { getAuth, GoogleAuthProvider, signInWithRedirect, getRedirectResult, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// LA CONFIGURACIÓN REAL DE TU APP
const firebaseConfig = {
  apiKey: "AIzaSyALd_miTZySLluocbxI8EUp1e18UE4-8NQ",
  authDomain: "territorios-a3ba5.firebaseapp.com",
  projectId: "territorios-a3ba5",
  storageBucket: "territorios-a3ba5.firebasestorage.app",
  messagingSenderId: "745104413831",
  appId: "1:745104413831:web:3dac44b13311aeff829422",
  measurementId: "G-097G2Y8GRG"
};

// Inicializamos Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// Lógica de la interfaz
const btnLogin = document.getElementById('btn-login');
const loginSection = document.getElementById('login-section');
const dashboardSection = document.getElementById('dashboard-section');

// Evento para el botón "Entrar con Google" usando Redirección (Ideal para móviles)
btnLogin.addEventListener('click', () => {
    signInWithRedirect(auth, provider);
});

// Atrapamos al usuario cuando Google lo devuelve a nuestra PWA
getRedirectResult(auth).then((result) => {
    if (result) {
        console.log("Usuario logueado con éxito después del redirect:", result.user.email);
    }
}).catch((error) => {
    console.error("Error al iniciar sesión:", error);
});

// Escuchamos si el usuario ya está conectado
onAuthStateChanged(auth, (user) => {
    if (user) {
        loginSection.style.display = 'none';
        dashboardSection.style.display = 'block';
        dashboardSection.innerHTML = `
            <h2>¡Hola, ${user.displayName}!</h2>
            <p>Conectado como: ${user.email}</p>
            <p><em>Sincronizando datos con la nube...</em></p>
        `;
    } else {
        loginSection.style.display = 'block';
        dashboardSection.style.display = 'none';
    }
});
