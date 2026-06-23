// 1. IMPORTACIONES DE FIREBASE
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithRedirect, getRedirectResult, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// REGISTRO DEL SERVICE WORKER (PWA)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .catch(err => console.error('Error al registrar el Service Worker:', err));
  });
}

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

btnLogin.addEventListener('click', () => { signInWithRedirect(auth, provider); });

getRedirectResult(auth).catch((error) => console.error("Error en el retorno:", error));

// 4. EL CORAZÓN DE LA APLICACIÓN
onAuthStateChanged(auth, async (user) => {
    if (user) {
        loginSection.style.display = 'none';
        dashboardSection.style.display = 'block';

        try {
            const email = user.email;
            let nombreCompleto = user.displayName || "Hermano";
            let miCongregacionId = "1552"; 
            let miRol = "publicador";

            const userRef = doc(db, "usuarios", email);
            const userSnap = await getDoc(userRef);
            if (userSnap.exists()) {
                nombreCompleto = `${userSnap.data().nombre} ${userSnap.data().apellido}`;
            }

            const congRef = doc(db, "congregaciones", miCongregacionId);
            const congSnap = await getDoc(congRef);
            if (congSnap.exists()) {
                const congData = congSnap.data();
                document.querySelector('.app-title').innerText = congData.nombre || `Congregación ${miCongregacionId}`;
                if (congData.roles && congData.roles[email]) miRol = congData.roles[email];
            }
            
            window.miUsuario = { email, nombre: nombreCompleto, rol: miRol, congregacionId: miCongregacionId };
            console.log(`👤 ${nombreCompleto} | 🛡️ Rol: ${miRol}`);

            // === FASE 2: FILTRO VISUAL SEGÚN EL ROL ===
            const tabServicio = document.getElementById('tab-servicio');
            if (miRol === 'siervo' || miRol === 'ayudante') {
                tabServicio.style.display = 'block'; // Lo mostramos si es administrador
            } else {
                tabServicio.style.display = 'none'; // Lo ocultamos si es publicador
            }

            const llaveRef = doc(db, "configuracion", "ApiKeys");
            const llaveSnap = await getDoc(llaveRef);
            if (!llaveSnap.exists()) throw new Error("No se encontró 'ApiKeys'.");
            
            const scriptMapa = document.createElement('script');
            scriptMapa.src = `https://maps.googleapis.com/maps/api/js?key=${llaveSnap.data().ApiMapsWeb}`;
            scriptMapa.async = true;
            
            scriptMapa.onload = async () => {
                const map = new google.maps.Map(document.getElementById("map"), {
                    disableDefaultUI: true, zoomControl: false, mapTypeControl: false, streetViewControl: false
                });

                map.data.setStyle((feature) => {
                    return { fillColor: feature.getProperty('fill') || '#6200EE', strokeColor: '#444444', strokeWeight: 1, fillOpacity: 0.35 };
                });

                const territoriosRef = collection(db, "congregaciones", window.miUsuario.congregacionId, "territorios");
                const snapshot = await getDocs(territoriosRef);

                let contador = 0;
                const bounds = new google.maps.LatLngBounds();
                const marcadoresMicro = [];
                const marcadoresMacro = [];
                const agrupacionMacro = {};

                snapshot.forEach((doc) => {
                    if (doc.data().geojson) {
                        map.data.addGeoJson(JSON.parse(doc.data().geojson)); 
                        contador++;
                    }
                });

                map.data.forEach((feature) => {
                    const featureBounds = new google.maps.LatLngBounds();
                    feature.getGeometry().forEachLatLng(latLng => { bounds.extend(latLng); featureBounds.extend(latLng); });
                    const centro = featureBounds.getCenter();
                    const numManzana = feature.getProperty('numero') || '';
                    const numTerritorio = feature.getProperty('territorio') || '';

                    if (!numManzana || numManzana.toLowerCase() === 'plaza') return;

                    const textoEtiqueta = numTerritorio ? `T${numTerritorio} - ${numManzana}` : numManzana;
                    const microMarker = new google.maps.Marker({
                        position: centro, label: { text: textoEtiqueta, color: 'black', fontWeight: '900', fontSize: '14px', className: 'map-label-micro' }, icon: { url: "", scaledSize: new google.maps.Size(0,0) }
                    });
                    marcadoresMicro.push(microMarker);

                    if (numTerritorio) {
                        if (!agrupacionMacro[numTerritorio]) agrupacionMacro[numTerritorio] = { latSum: 0, lngSum: 0, count: 0 };
                        agrupacionMacro[numTerritorio].latSum += centro.lat();
                        agrupacionMacro[numTerritorio].lngSum += centro.lng();
                        agrupacionMacro[numTerritorio].count += 1;
                    }
                });

                Object.keys(agrupacionMacro).forEach(terr => {
                    const data = agrupacionMacro[terr];
                    const macroMarker = new google.maps.Marker({
                        position: { lat: data.latSum / data.count, lng: data.lngSum / data.count }, label: { text: terr, color: 'black', fontWeight: '900', fontSize: '34px', className: 'map-label-macro' }, icon: { url: "", scaledSize: new google.maps.Size(0,0) }
                    });
                    marcadoresMacro.push(macroMarker);
                });

                map.addListener('zoom_changed', () => {
                    const zoom = map.getZoom();
                    if (zoom >= 15.5) {
                        marcadoresMicro.forEach(m => m.setMap(map)); marcadoresMacro.forEach(m => m.setMap(null));
                    } else if (zoom >= 13) {
                        marcadoresMicro.forEach(m => m.setMap(null)); marcadoresMacro.forEach(m => m.setMap(map));
                    } else {
                        marcadoresMicro.forEach(m => m.setMap(null)); marcadoresMacro.forEach(m => m.setMap(null));
                    }
                });

                if (contador > 0) { map.fitBounds(bounds); google.maps.event.trigger(map, 'zoom_changed'); }
                
                const msgElement = document.getElementById('user-email');
                if (msgElement) {
                    msgElement.innerText = `¡Éxito! ${contador} zonas sincronizadas.`;
                    setTimeout(() => { msgElement.style.display = 'none'; }, 3000);
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

// === MOTOR DE PESTAÑAS (Interacción de Interfaz) ===
const tabs = document.querySelectorAll('.tab');
const views = document.querySelectorAll('.view-section');

tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        // 1. Apagar todas las pestañas y ocultar todas las vistas
        tabs.forEach(t => t.classList.remove('active'));
        views.forEach(v => v.style.display = 'none');
        
        // 2. Encender la pestaña que el usuario tocó
        tab.classList.add('active');
        
        // 3. Mostrar la vista correspondiente a esa pestaña
        const targetId = tab.getAttribute('data-target');
        const targetView = document.getElementById(targetId);
        
        if (targetId === 'map-view') {
            targetView.style.display = 'flex'; // El mapa necesita 'flex' para ocupar toda la pantalla
        } else {
            targetView.style.display = 'block'; // Las otras pantallas usan 'block' normal
        }
    });
});