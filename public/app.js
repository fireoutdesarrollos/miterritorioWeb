import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithRedirect, getRedirectResult, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Tu configuración original con la API Key correcta
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
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

const btnLogin = document.getElementById('btn-login');
const loginSection = document.getElementById('login-section');
const dashboardSection = document.getElementById('dashboard-section');

// Botón de Login adaptado 100% a celulares
btnLogin.addEventListener('click', () => {
    signInWithRedirect(auth, provider);
});

// Capturamos cualquier error silencioso al volver de Google
getRedirectResult(auth).then((result) => {
    if (result) console.log("Login exitoso tras redirección");
}).catch((error) => {
    console.error("Error en redirect:", error);
});

// El corazón de la aplicación
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // 1. CHALECO ANTIBALAS: Mostrar el panel inmediatamente (evita el rebote)
        loginSection.style.display = 'none';
        dashboardSection.style.display = 'block';

        try {
            document.getElementById('user-greeting').innerText = `¡Hola, ${user.displayName || 'Hermano'}!`;
            document.getElementById('user-email').innerText = `Cargando tu mapa...`;
        } catch(e) { console.error("Error en HTML", e); }

        // 2. CARGAR EL MAPA
        try {
            if (typeof google === 'undefined') {
                throw new Error("Falta inyectar la API Key de Google Maps en el código.");
            }

            const map = new google.maps.Map(document.getElementById("map"), {
                zoom: 14,
                center: { lat: -32.8908, lng: -68.8272 }, // Coordenadas temporales
                disableDefaultUI: true,
                zoomControl: true
            });

            map.data.setStyle((feature) => {
                let color = feature.getProperty('fill') || '#6200EE';
                return {
                    fillColor: color,
                    strokeColor: '#000000',
                    strokeWeight: 2,
                    fillOpacity: 0.35
                };
            });

            // 3. DESCARGAR TERRITORIOS
            const idCongregacion = "1552"; 
            const territoriosRef = collection(db, "congregaciones", idCongregacion, "territorios");
            const snapshot = await getDocs(territoriosRef);

            let contador = 0;
            snapshot.forEach((doc) => {
                const geojsonString = doc.data().geojson;
                if (geojsonString) {
                    const geojsonObj = JSON.parse(geojsonString);
                    map.data.addGeoJson(geojsonObj); 
                    contador++;
                }
            });

            document.getElementById('user-email').innerText = `¡Mapas cargados exitosamente! (${contador})`;

        } catch (error) {
            console.error("Fallo visual:", error);
            document.getElementById('user-email').innerText = error.message;
        }

    } else {
        // Si no hay sesión iniciada, mostrar botón
        loginSection.style.display = 'block';
        dashboardSection.style.display = 'none';
    }
});
