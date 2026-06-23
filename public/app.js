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

// 3. EVENTO DE INICIO DE SESIÓN
btnLogin.addEventListener('click', () => {
    signInWithRedirect(auth, provider);
});

getRedirectResult(auth).then((result) => {
    if (result) console.log("Login exitoso tras redirección");
}).catch((error) => {
    console.error("Error en el retorno de redirección:", error);
});

// 4. EL CORAZÓN DE LA APLICACIÓN
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // Cambiar de pantalla
        loginSection.style.display = 'none';
        dashboardSection.style.display = 'block';

        try {
            // Buscamos el documento con la API Key en Firestore
            const llaveRef = doc(db, "configuracion", "ApiKeys");
            const llaveSnap = await getDoc(llaveRef);
            
            if (!llaveSnap.exists()) {
                throw new Error("No se encontró el documento 'ApiKeys'.");
            }
            
            const apiMapsWeb = llaveSnap.data().ApiMapsWeb;
            const msgElement = document.getElementById('user-email');
            
            if (msgElement) msgElement.innerText = `Descargando Google Maps...`;

            // Inyectar el script de Google Maps
            const scriptMapa = document.createElement('script');
            scriptMapa.src = `https://maps.googleapis.com/maps/api/js?key=${apiMapsWeb}`;
            scriptMapa.async = true;
            
            scriptMapa.onload = async () => {
                if (msgElement) msgElement.innerText = `Dibujando el territorio...`;

                // Inicializar mapa sin controles molestos
                const map = new google.maps.Map(document.getElementById("map"), {
                    disableDefaultUI: true, 
                    zoomControl: false,
                    mapTypeControl: false,
                    streetViewControl: false
                });

                // ESTILOS FINOS (Igual a Android)
                map.data.setStyle((feature) => {
                    let color = feature.getProperty('fill') || '#6200EE';
                    return {
                        fillColor: color,
                        strokeColor: '#444444', 
                        strokeWeight: 1,        
                        fillOpacity: 0.35
                    };
                });

                // Cargar datos de Firestore
                const territoriosRef = collection(db, "congregaciones", "1552", "territorios");
                const snapshot = await getDocs(territoriosRef);

                let contador = 0;
                const bounds = new google.maps.LatLngBounds();
                
                const marcadoresMicro = [];
                const marcadoresMacro = [];
                const agrupacionMacro = {};

                // 1. DIBUJAR POLÍGONOS
                snapshot.forEach((doc) => {
                    const geojsonString = doc.data().geojson;
                    if (geojsonString) {
                        map.data.addGeoJson(JSON.parse(geojsonString)); 
                        contador++;
                    }
                });

                // 2. CALCULAR CENTROS Y CREAR ETIQUETAS
                map.data.forEach((feature) => {
                    const featureBounds = new google.maps.LatLngBounds();
                    feature.getGeometry().forEachLatLng(latLng => {
                        bounds.extend(latLng); 
                        featureBounds.extend(latLng); 
                    });
                    
                    const centro = featureBounds.getCenter();
                    const numManzana = feature.getProperty('numero') || '';
                    const numTerritorio = feature.getProperty('territorio') || '';

                    if (!numManzana || numManzana.toLowerCase() === 'plaza') return;

                    // MICRO
                    const microMarker = new google.maps.Marker({
                        position: centro,
                        label: { 
                            text: numManzana, 
                            color: 'black', 
                            fontWeight: '900', 
                            fontSize: '16px',
                            className: 'map-label-micro'
                        },
                        icon: { url: "", scaledSize: new google.maps.Size(0,0) }
                    });
                    marcadoresMicro.push(microMarker);

                    // AGRUPACIÓN MACRO
                    if (numTerritorio) {
                        if (!agrupacionMacro[numTerritorio]) {
                            agrupacionMacro[numTerritorio] = { latSum: 0, lngSum: 0, count: 0 };
                        }
                        agrupacionMacro[numTerritorio].latSum += centro.lat();
                        agrupacionMacro[numTerritorio].lngSum += centro.lng();
                        agrupacionMacro[numTerritorio].count += 1;
                    }
                }); // <-- ¡Esta es la llavecita que había provocado el choque!

                // 3. GENERAR MARCADORES MACRO
                Object.keys(agrupacionMacro).forEach(terr => {
                    const data = agrupacionMacro[terr];
                    const macroMarker = new google.maps.Marker({
                        position: { lat: data.latSum / data.count, lng: data.lngSum / data.count },
                        label: { 
                            text: terr, 
                            color: 'black', 
                            fontWeight: '900', 
                            fontSize: '34px', 
                            className: 'map-label-macro' 
                        },
                        icon: { url: "", scaledSize: new google.maps.Size(0,0) }
                    });
                    marcadoresMacro.push(macroMarker);
                });

                // 4. VIGILANTE DE ZOOM
                map.addListener('zoom_changed', () => {
                    const zoom = map.getZoom();
                    if (zoom >= 15.5) {
                        marcadoresMicro.forEach(m => m.setMap(map));
                        marcadoresMacro.forEach(m => m.setMap(null));
                    } else if (zoom >= 13) {
                        marcadoresMicro.forEach(m => m.setMap(null));
                        marcadoresMacro.forEach(m => m.setMap(map));
                    } else {
                        marcadoresMicro.forEach(m => m.setMap(null));
                        marcadoresMacro.forEach(m => m.setMap(null));
                    }
                });

                // 5. ENFOCAR
                if (contador > 0) {
                    map.fitBounds(bounds);
                    google.maps.event.trigger(map, 'zoom_changed'); // Forzar chequeo inicial
                }

                if (msgElement) {
                    msgElement.innerText = `¡Éxito! ${contador} zonas sincronizadas.`;
                    setTimeout(() => {
                        msgElement.style.display = 'none';
                    }, 3000);
                }
            };

            document.head.appendChild(scriptMapa);

        } catch (error) {
            console.error("Fallo durante la inicialización:", error);
        }

    } else {
        loginSection.style.display = 'block';
        dashboardSection.style.display = 'none';
    }
});