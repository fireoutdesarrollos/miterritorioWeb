// 1. IMPORTACIONES DE FIREBASE (Actualizadas)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithRedirect, getRedirectResult, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, getDocs, doc, getDoc, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// REGISTRO PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .catch(err => console.error('Error Service Worker:', err));
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
getRedirectResult(auth).catch((error) => console.error(error));

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

            const tabServicio = document.getElementById('tab-servicio');
            if (miRol === 'siervo' || miRol === 'ayudante') {
                tabServicio.style.display = 'block'; 
            } else {
                tabServicio.style.display = 'none'; 
            }

            // ==========================================
            // FASE 3: MOTOR DE MIS VISITAS (Tiempo Real)
            // ==========================================
            const visitasContainer = document.getElementById('lista-visitas-container');
            let todasLasVisitas = []; 
            let filtroActual = 'Todos';

            // Consultamos a Firebase solo las visitas de esta congregación
            const visitasRef = collection(db, "usuarios", email, "mis_visitas");
            const qVisitas = query(visitasRef, where("congregacionId", "==", window.miUsuario.congregacionId));

            // onSnapshot es como un "radar" que actualiza la lista si hay cambios
            onSnapshot(qVisitas, (snapshot) => {
                todasLasVisitas = [];
                snapshot.forEach((doc) => {
                    todasLasVisitas.push({ id: doc.id, ...doc.data() });
                });
                
                // Ordenamos por fecha (las más recientes arriba)
                todasLasVisitas.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                renderizarVisitas();
            });

            // Función que dibuja las tarjetas en el HTML
            window.renderizarVisitas = () => {
                if (!visitasContainer) return;
                visitasContainer.innerHTML = ''; 

                const visitasFiltradas = todasLasVisitas.filter(v => {
                    if (filtroActual === 'Todos') return true;
                    return v.estado === filtroActual;
                });

                if (visitasFiltradas.length === 0) {
                    visitasContainer.innerHTML = `<p style="color: gray; text-align: center; margin-top: 40px;">No hay visitas en esta categoría.</p>`;
                    return;
                }

                visitasFiltradas.forEach(visita => {
                    // Colores de los estados igual que en Android
                    let colorPin = '#FF9800'; // Naranja
                    if (visita.estado === 'Nueva') colorPin = '#2196F3'; // Azul
                    if (visita.estado === 'Ausente') colorPin = '#F44336'; // Rojo
                    if (visita.estado === 'Revisita') colorPin = '#4CAF50'; // Verde
                    if (visita.estado === 'Estudio') colorPin = '#FFEB3B'; // Amarillo
                    if (visita.estado === 'No visitar') colorPin = '#9C27B0'; // Violeta

                    const nombreMostrar = (visita.nombre === 'Nueva' && visita.apellido === 'Visita') 
                                        ? 'Visita Nueva' 
                                        : `${visita.nombre} ${visita.apellido}`;
                    
                    const fecha = new Date(visita.timestamp || Date.now()).toLocaleDateString();

                    const card = document.createElement('div');
                    card.className = 'visita-card';
                    card.innerHTML = `
                        <div class="visita-color" style="background-color: ${colorPin};"></div>
                        <div class="visita-info" style="flex: 1;">
                            <h3>${nombreMostrar}</h3>
                            <p>📍 T${visita.territorio} - ${visita.poligono} | 📅 ${fecha}</p>
                        </div>
                    `;
                    
                                        // Acción al tocar la tarjeta: Abrir el Modal
                    card.onclick = () => {
                        // 1. Llenamos el HTML con los datos de esta visita
                        document.getElementById('ficha-nombre').value = visita.nombre !== 'Nueva' ? visita.nombre : '';
                        document.getElementById('ficha-apellido').value = visita.apellido !== 'Visita' ? visita.apellido : '';
                        document.getElementById('ficha-terr').innerText = visita.territorio || '-';
                        document.getElementById('ficha-manz').innerText = visita.poligono || '-';
                        document.getElementById('ficha-estado').value = visita.estado || 'Nueva';
                        document.getElementById('ficha-direccion').value = visita.direccion || '';
                        document.getElementById('ficha-notas').value = visita.notas || '';
                        document.getElementById('ficha-publi').value = visita.publicacionDejada || '';
                        document.getElementById('ficha-video').value = visita.videoVisto || '';
                        document.getElementById('ficha-proximo').value = visita.proximoPaso || '';

                        // 2. Mostramos el modal
                        document.getElementById('ficha-modal').style.display = 'flex';
                    };

                    visitasContainer.appendChild(card);
                });
            };

            // Activar los botones de filtro
            const chips = document.querySelectorAll('.filtro-chip');
            chips.forEach(chip => {
                chip.addEventListener('click', (e) => {
                    chips.forEach(c => c.classList.remove('active'));
                    e.target.classList.add('active');
                    filtroActual = e.target.getAttribute('data-filtro');
                    renderizarVisitas();
                });
            });
            // ==========================================

            const llaveRef = doc(db, "configuracion", "ApiKeys");
            const llaveSnap = await getDoc(llaveRef);
            if (!llaveSnap.exists()) throw new Error("No ApiKey.");
            
            const scriptMapa = document.createElement('script');
            scriptMapa.src = `https://maps.googleapis.com/maps/api/js?key=${llaveSnap.data().ApiMapsWeb}`;
            scriptMapa.async = true;
            
            scriptMapa.onload = async () => {
                const map = new google.maps.Map(document.getElementById("map"), {
                    disableDefaultUI: true, zoomControl: false, mapTypeControl: false, streetViewControl: false
                });

                map.data.setStyle((feature) => { return { fillColor: feature.getProperty('fill') || '#6200EE', strokeColor: '#444444', strokeWeight: 1, fillOpacity: 0.35 }; });

                const territoriosRef = collection(db, "congregaciones", window.miUsuario.congregacionId, "territorios");
                const snapshot = await getDocs(territoriosRef);

                let contador = 0;
                const bounds = new google.maps.LatLngBounds();
                const marcadoresMicro = [];
                const marcadoresMacro = [];
                const agrupacionMacro = {};

                snapshot.forEach((doc) => {
                    if (doc.data().geojson) { map.data.addGeoJson(JSON.parse(doc.data().geojson)); contador++; }
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
                    const macroMarker = new google.maps.Marker({ position: { lat: data.latSum / data.count, lng: data.lngSum / data.count }, label: { text: terr, color: 'black', fontWeight: '900', fontSize: '34px', className: 'map-label-macro' }, icon: { url: "", scaledSize: new google.maps.Size(0,0) } });
                    marcadoresMacro.push(macroMarker);
                });

                map.addListener('zoom_changed', () => {
                    const zoom = map.getZoom();
                    if (zoom >= 15.5) { marcadoresMicro.forEach(m => m.setMap(map)); marcadoresMacro.forEach(m => m.setMap(null)); } 
                    else if (zoom >= 13) { marcadoresMicro.forEach(m => m.setMap(null)); marcadoresMacro.forEach(m => m.setMap(map)); } 
                    else { marcadoresMicro.forEach(m => m.setMap(null)); marcadoresMacro.forEach(m => m.setMap(null)); }
                });

                if (contador > 0) { map.fitBounds(bounds); google.maps.event.trigger(map, 'zoom_changed'); }
                const msgElement = document.getElementById('user-email');
                if (msgElement) { msgElement.innerText = `¡Éxito!`; setTimeout(() => { msgElement.style.display = 'none'; }, 2000); }
            };
            document.head.appendChild(scriptMapa);

        } catch (error) { console.error("Error:", error); }

    } else {
        loginSection.style.display = 'block'; dashboardSection.style.display = 'none';
    }
});

// MOTOR DE PESTAÑAS
const tabs = document.querySelectorAll('.tab');
const views = document.querySelectorAll('.view-section');

tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        views.forEach(v => v.style.display = 'none');
        tab.classList.add('active');
        const targetId = tab.getAttribute('data-target');
        const targetView = document.getElementById(targetId);
        if (targetId === 'map-view') targetView.style.display = 'flex';
        else targetView.style.display = 'block';
    });
});
