// 1. IMPORTACIONES DE FIREBASE
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithRedirect, getRedirectResult, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// 2. CONFIGURACIÓN DE TU PROYECTO
const firebaseConfig = {
  apiKey: "AIzaSyALd_mItZYSLluocbxI8EUPle18UE4-8NQ",
  authDomain: "territorios-a3ba5.firebaseapp.com",
  projectId: "territorios-a3ba5",
  storageBucket: "territorios-a3ba5.firebasestorage.app",
  messagingSenderId: "745104413831",
  appId: "1:745104413831:web:3dac44b13311aeff829422",
  measurementId: "G-097G2Y8GRG"
};

// Inicializamos los servicios
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// Elementos de la interfaz (HTML)
const btnLogin = document.getElementById('btn-login');
const loginSection = document.getElementById('login-section');
const dashboardSection = document.getElementById('dashboard-section');

// 3. EVENTO DE INICIO DE SESIÓN (Optimizado para móviles)
btnLogin.addEventListener('click', () => {
    signInWithRedirect(auth, provider);
});

// Capturamos posibles errores del login al regresar de Google
getRedirectResult(auth).then((result) => {
    if (result) console.log("Login exitoso tras redirección");
}).catch((error) => {
    console.error("Error en el retorno de redirección:", error);
});

// 4. EL CORAZÓN DE LA APLICACIÓN (Control de accesos y carga de datos)
onAuthStateChanged(auth, async (user) => {
    if (user) {
        console.log("Usuario autenticado:", user.email);

        // A. CHALECO ANTIBALAS: Cambiar de pantalla de inmediato para evitar rebotes
        loginSection.style.display = 'none';
        dashboardSection.style.display = 'block';

        try {
            document.getElementById('user-greeting').innerText = `¡Hola, ${user.displayName || 'Hermano'}!`;
            document.getElementById('user-email').innerText = `Conectando con la base de datos...`;
        } catch(e) { 
            console.error("Error al actualizar textos en el HTML:", e); 
        }

        // B. CARGA DINÁMICA DE LA LLAVE Y EL MAPA
        try {
            // Buscamos el documento con la API Key en Firestore
            const llaveRef = doc(db, "configuracion", "ApiKeys");
            const llaveSnap = await getDoc(llaveRef);
            
            if (!llaveSnap.exists()) {
                throw new Error("No se encontró el documento de configuración 'ApiKeys' en Firestore.");
            }
            
            const apiMapsWeb = llaveSnap.data().ApiMapsWeb;
            if (!apiMapsWeb) {
                throw new Error("El campo 'ApiMapsWeb' está vacío en la base de datos.");
            }

            document.getElementById('user-email').innerText = `Descargando Google Maps de forma segura...`;

            // Creamos la etiqueta de script en memoria
            const scriptMapa = document.createElement('script');
            scriptMapa.src = `https://maps.googleapis.com/maps/api/js?key=${apiMapsWeb}`;
            scriptMapa.async = true;
            
            // Definimos qué pasa cuando el mapa termine de descargarse de los servidores de Google
            scriptMapa.onload = async () => {
                document.getElementById('user-email').innerText = `Dibujando el territorio...`;

                // Inicializamos el mapa en el contenedor div con id="map"
                const map = new google.maps.Map(document.getElementById("map"), {
                    zoom: 14,
                    center: { lat: -32.8908, lng: -68.8272 }, // Coordenadas de tu ciudad
                    disableDefaultUI: true, // Quita controles innecesarios para parecer App nativa
                    zoomControl: true
                });

                // Definimos el diseño visual de las manzanas/polígonos
                map.data.setStyle((feature) => {
                    let color = feature.getProperty('fill') || '#6200EE';
                    return {
                        fillColor: color,
                        strokeColor: '#000000',
                        strokeWeight: 2,
                        fillOpacity: 0.35
                    };
                });

                // Descargamos los GeoJSON de la congregación 1552
                const territoriosRef = collection(db, "congregaciones", "1552", "territorios");
                const snapshot = await getDocs(territoriosRef);

                let contador = 0;
                snapshot.forEach((doc) => {
                    const geojsonString = doc.data().geojson;
                    if (geojsonString) {
                        // Google Maps procesa y dibuja el string GeoJSON automáticamente
                        map.data.addGeoJson(JSON.parse(geojsonString)); 
                        contador++;
                    }
                });

                document.getElementById('user-email').innerText = `¡Éxito! ${contador} zonas de territorio sincronizadas.`;
            };

            // Inyectamos el script en el HTML para activar la descarga
            document.head.appendChild(scriptMapa);

        } catch (error) {
            console.error("Fallo durante la inicialización del mapa:", error);
            document.getElementById('user-email').innerText = `Error: ${error.message}`;
        }

    } else {
        // Si no hay sesión, regresamos a la pantalla de bienvenida
        loginSection.style.display = 'block';
        dashboardSection.style.display = 'none';
    }
});
