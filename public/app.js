// 1. IMPORTACIONES DE FIREBASE
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithRedirect, getRedirectResult, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// REGISTRO DEL SERVICE WORKER (PWA)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('Service Worker registrado con éxito.', reg.scope))
      .catch(err => console.error('Error al registrar el Service Worker:', err));
  });
}

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

        // A. CHALECO ANTIBALAS: Cambiar de pantalla de inmediato
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
            
            // Definimos qué pasa cuando el mapa termine de descargarse
scriptMapa.onload = async () => {
                document.getElementById('user-email').innerText = `Dibujando el territorio...`;

                const map = new google.maps.Map(document.getElementById("map"), {
                    disableDefaultUI: true, 
                    zoomControl: false, // Lo quitamos para que sea 100% táctil como la app
                    mapTypeControl: false,
                    streetViewControl: false
                });

// Definimos el diseño visual de las manzanas (Más limpio, estilo Android)
                map.data.setStyle((feature) => {
                    let color = feature.getProperty('fill') || '#6200EE';
                    return {
                        fillColor: color,
                        strokeColor: '#444444', // Gris oscuro sutil
                        strokeWeight: 1,        // Borde mucho más fino
                        fillOpacity: 0.35
                    };
                });
                const territoriosRef = collection(db, "congregaciones", "1552", "territorios");
                const snapshot = await getDocs(territoriosRef);

                let contador = 0;
                const bounds = new google.maps.LatLngBounds();
                
                // Arreglos para guardar nuestros textos flotantes
                const marcadoresMicro = [];
                const marcadoresMacro = [];
                const agrupacionMacro = {};

                // --- 1. PROCESAR GEOJSON Y CREAR LÍMITES ---
                snapshot.forEach((doc) => {
                    const geojsonString = doc.data().geojson;
                    if (geojsonString) {
                        const parsedGeoJson = JSON.parse(geojsonString);
                        map.data.addGeoJson(parsedGeoJson); 
                        contador++;
                    }
                });

                // --- 2. MATEMÁTICA DE CENTROS Y ETIQUETAS ---
                // Iteramos sobre lo que Google Maps ya dibujó
                map.data.forEach((feature) => {
                    const featureBounds = new google.maps.LatLngBounds();
                    feature.getGeometry().forEachLatLng(latLng => {
                        bounds.extend(latLng); // Para la cámara general
                        featureBounds.extend(latLng); // Para el centro de esta manzana
                    });
                    
                    const centro = featureBounds.getCenter();
                    const numManzana = feature.getProperty('numero') || '';
                    const numTerritorio = feature.getProperty('territorio') || '';

                    if (!numManzana || numManzana.toLowerCase() === 'plaza') return;

                   // A. Crear etiqueta MICRO (Manzana - Solo el número)
                    const microMarker = new google.maps.Marker({
                        position: centro,
                        label: { 
                            text: numManzana, // Acá aseguramos que solo muestre el número (ej: "1")
                            color: 'black', 
                            fontWeight: '900', 
                            fontSize: '16px',
                            className: 'map-label-micro'
                        },
                        icon: { url: "", scaledSize: new google.maps.Size(0,0) }
                    });
                    marcadoresMicro.push(microMarker);

// C. Crear etiquetas MACRO (Territorio gigante)
                Object.keys(agrupacionMacro).forEach(terr => {
                    const data = agrupacionMacro[terr];
                    const macroMarker = new google.maps.Marker({
                        position: { lat: data.latSum / data.count, lng: data.lngSum / data.count },
                        label: { 
                            text: terr, 
                            color: 'black', 
                            fontWeight: '900', 
                            fontSize: '34px', // Tamaño gigante como en Android
                            className: 'map-label-macro' 
                        },
                        icon: { url: "", scaledSize: new google.maps.Size(0,0) }
                    });
                    marcadoresMacro.push(macroMarker);
                });

                // C. Crear etiquetas MACRO calculando el promedio
                Object.keys(agrupacionMacro).forEach(terr => {
                    const data = agrupacionMacro[terr];
                    const macroMarker = new google.maps.Marker({
                        position: { lat: data.latSum / data.count, lng: data.lngSum / data.count },
                        label: { text: terr, color: 'black', fontWeight: '900', fontSize: '28px' },
                        icon: { url: "", scaledSize: new google.maps.Size(0,0) }
                    });
                    marcadoresMacro.push(macroMarker);
                });

                // --- 3. EL VIGILANTE DEL ZOOM ---
                map.addListener('zoom_changed', () => {
                    const zoom = map.getZoom();
                    if (zoom >= 15.5) {
                        // Nivel calle: Mostrar manzanas
                        marcadoresMicro.forEach(m => m.setMap(map));
                        marcadoresMacro.forEach(m => m.setMap(null));
                    } else if (zoom >= 13) {
                        // Nivel barrio: Mostrar territorios grandes
                        marcadoresMicro.forEach(m => m.setMap(null));
                        marcadoresMacro.forEach(m => m.setMap(map));
                    } else {
                        // Nivel ciudad: Ocultar todo para no saturar
                        marcadoresMicro.forEach(m => m.setMap(null));
                        marcadoresMacro.forEach(m => m.setMap(null));
                    }
                });

                // --- 4. ENFOQUE FINAL ---
                if (contador > 0) {
                    map.fitBounds(bounds);
                    // Forzamos al vigilante a revisar el zoom inicial
                    google.maps.event.trigger(map, 'zoom_changed');
                }

                document.getElementById('user-email').innerText = `¡Éxito! ${contador} zonas sincronizadas.`;
                
                // Ocultar el cartelito después de 3 segundos
                setTimeout(() => {
                    document.getElementById('user-email').style.display = 'none';
                }, 3000);
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