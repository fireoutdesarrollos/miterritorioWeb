// 1. IMPORTACIONES DE FIREBASE (Alineadas con la arquitectura)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithRedirect, getRedirectResult, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, getDocs, doc, getDoc, query, where, onSnapshot, orderBy, addDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => console.error(err));
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

// Escuchador del Historial (Global para evitar solapamientos)
window.historialUnsubscribe = null;

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
            
            window.miUsuario = { email, nombre: nombreCompleto, rol: miRol, congregacionId: miCongregacionId, visitaActivaId: null };

            const tabServicio = document.getElementById('tab-servicio');
            if (miRol === 'siervo' || miRol === 'ayudante') tabServicio.style.display = 'block'; 
            else tabServicio.style.display = 'none'; 

            // MOTOR DE RENDERS: MIS VISITAS
            const visitasContainer = document.getElementById('lista-visitas-container');
            let todasLasVisitas = []; 
            let filtroActual = 'Todos';

            const visitasRef = collection(db, "usuarios", email, "mis_visitas");
            const qVisitas = query(visitasRef, where("congregacionId", "==", window.miUsuario.congregacionId));

            onSnapshot(qVisitas, (snapshot) => {
                todasLasVisitas = [];
                snapshot.forEach((doc) => { todasLasVisitas.push({ id: doc.id, ...doc.data() }); });
                todasLasVisitas.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                renderizarVisitas();
            });

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
                    let colorPin = '#FF9800'; 
                    if (visita.estado === 'Nueva') colorPin = '#2196F3'; 
                    if (visita.estado === 'Ausente') colorPin = '#F44336'; 
                    if (visita.estado === 'Revisita') colorPin = '#4CAF50'; 
                    if (visita.estado === 'Estudio') colorPin = '#FFEB3B'; 
                    if (visita.estado === 'No visitar') colorPin = '#9C27B0'; 

                    const nombreMostrar = (visita.nombre === 'Nueva' && visita.apellido === 'Visita') ? 'Visita Nueva' : `${visita.nombre} ${visita.apellido}`;
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
                    
                    // ACCIÓN AL TOCAR: LEER DATOS E HISTORIAL (RÉPLICA ANDROID)
                    card.onclick = () => {
                        window.miUsuario.visitaActivaId = visita.id;

                        // Datos fijos
                        document.getElementById('ficha-nombre').value = visita.nombre !== 'Nueva' ? visita.nombre : '';
                        document.getElementById('ficha-apellido').value = visita.apellido !== 'Visita' ? visita.apellido : '';
                        document.getElementById('ficha-terr').innerText = visita.territorio || '-';
                        document.getElementById('ficha-manz').innerText = visita.poligono || '-';
                        document.getElementById('ficha-estado').value = visita.estado || 'Nueva';
                        document.getElementById('ficha-direccion').value = visita.direccion || '';
                        document.getElementById('ficha-publi').value = visita.publicacionDejada || '';
                        document.getElementById('ficha-video').value = visita.videoVisto || '';
                        document.getElementById('ficha-proximo').value = visita.proximoPaso || '';

                        // CRITICAL RÉPLICA: Siempre arranca LIMPIO arriba
                        document.getElementById('ficha-notas').value = '';

                        // Cargar subcolección de historial en tiempo real
                        if (window.historialUnsubscribe) window.historialUnsubscribe();

                        const chatContainer = document.getElementById('historial-conversaciones-container');
                        chatContainer.innerHTML = '<p style="color: gray; font-size: 13px; text-align: center;">Buscando mensajes...</p>';

                        const historialRef = collection(db, "usuarios", email, "mis_visitas", visita.id, "conversaciones");
                        const qHistorial = query(historialRef, orderBy("timestamp", "asc")); // Cronológico como WhatsApp

                        window.historialUnsubscribe = onSnapshot(qHistorial, (hSnapshot) => {
                            chatContainer.innerHTML = '';
                            if (hSnapshot.empty) {
                                chatContainer.innerHTML = '<p style="color: gray; font-size: 13px; text-align: center; margin-top: 10px;">No hay conversaciones previas registradas.</p>';
                                return;
                            }
                            hSnapshot.forEach((hDoc) => {
                                const dataConv = hDoc.data();
                                const cFecha = new Date(dataConv.timestamp || Date.now()).toLocaleDateString();
                                const globo = document.createElement('div');
                                globo.className = 'chat-bubble';
                                globo.innerHTML = `
                                    <div class="chat-text">${dataConv.notas || ''}</div>
                                    <div class="chat-meta">📅 ${cFecha}</div>
                                `;
                                chatContainer.appendChild(globo);
                            });
                        });

                        document.getElementById('ficha-modal').style.display = 'flex';
                    };
                    visitasContainer.appendChild(card);
                });
            };

            const chips = document.querySelectorAll('.filtro-chip');
            chips.forEach(chip => {
                chip.addEventListener('click', (e) => {
                    chips.forEach(c => c.classList.remove('active')); e.target.classList.add('active');
                    filtroActual = e.target.getAttribute('data-filtro'); renderizarVisitas();
                });
            });

            // LOGICA GUARDAR MODAL (Escritura en subcolección de historial)
            document.getElementById('btn-guardar-ficha').onclick = async () => {
                const vId = window.miUsuario.visitaActivaId;
                if (!vId) return;

                const inputNotasVal = document.getElementById('ficha-notas').value.trim();
                const docVisitaRef = doc(db, "usuarios", email, "mis_visitas", vId);

                // 1. Guardar cambios estructurales de la ficha
                await updateDoc(docVisitaRef, {
                    nombre: document.getElementById('ficha-nombre').value.trim() || 'Nueva',
                    apellido: document.getElementById('ficha-apellido').value.trim() || 'Visita',
                    estado: document.getElementById('ficha-estado').value,
                    direccion: document.getElementById('ficha-direccion').value.trim(),
                    publicacionDejada: document.getElementById('ficha-publi').value,
                    videoVisto: document.getElementById('ficha-video').value,
                    proximoPaso: document.getElementById('ficha-proximo').value.trim(),
                    timestamp: Date.currentTimeMillis ? Date.currentTimeMillis() : Date.now()
                });

                // 2. Si el hermano escribió algo en "Qué hablamos hoy", lo sumamos al chat
                if (inputNotasVal.length > 0) {
                    const subCollRef = collection(db, "usuarios", email, "mis_visitas", vId, "conversaciones");
                    await addDoc(subCollRef, {
                        notas: inputNotasVal,
                        timestamp: Date.currentTimeMillis ? Date.currentTimeMillis() : Date.now()
                    });
                }

                document.getElementById('ficha-modal').style.display = 'none';
            };

            // MAP LOADING
            const llaveRef = doc(db, "configuracion", "ApiKeys");
            const llaveSnap = await getDoc(llaveRef);
            
            const scriptMapa = document.createElement('script');
            scriptMapa.src = `https://maps.googleapis.com/maps/api/js?key=${llaveSnap.data().ApiMapsWeb}`;
            scriptMapa.async = true;
            
            scriptMapa.onload = async () => {
                const map = new google.maps.Map(document.getElementById("map"), { disableDefaultUI: true, zoomControl: false, mapTypeControl: false, streetViewControl: false });
                map.data.setStyle((feature) => { return { fillColor: feature.getProperty('fill') || '#6200EE', strokeColor: '#444444', strokeWeight: 1, fillOpacity: 0.35 }; });

                const snapshotM = await getDocs(collection(db, "congregaciones", window.miUsuario.congregacionId, "territorios"));
                const bounds = new google.maps.LatLngBounds();
                const marcadoresMicro = []; const marcadoresMacro = []; const agrupacionMacro = {};

                snapshotM.forEach(doc => { if (doc.data().geojson) map.data.addGeoJson(JSON.parse(doc.data().geojson)); });
                map.data.forEach(feature => {
                    const fBounds = new google.maps.LatLngBounds(); feature.getGeometry().forEachLatLng(p => { bounds.extend(p); fBounds.extend(p); });
                    const numManzana = feature.getProperty('numero') || ''; const numTerritorio = feature.getProperty('territorio') || '';
                    if (!numManzana || numManzana.toLowerCase() === 'plaza') return;
                    
                    const textE = numTerritorio ? `T${numTerritorio} - ${numManzana}` : numManzana;
                    const mMicro = new google.maps.Marker({ position: fBounds.getCenter(), label: { text: textE, color: 'black', fontWeight: '900', fontSize: '14px', className: 'map-label-micro' }, icon: { url: "", scaledSize: new google.maps.Size(0,0) } });
                    marcadoresMicro.push(mMicro);

                    if (numTerritorio) {
                        if (!agrupacionMacro[numTerritorio]) agrupacionMacro[numTerritorio] = { latSum: 0, lngSum: 0, count: 0 };
                        agrupacionMacro[numTerritorio].latSum += fBounds.getCenter().lat(); agrupacionMacro[numTerritorio].lngSum += fBounds.getCenter().lng(); agrupacionMacro[numTerritorio].count++;
                    }
                });

                Object.keys(agrupacionMacro).forEach(t => {
                    const d = agrupacionMacro[t];
                    const mMacro = new google.maps.Marker({ position: { lat: d.latSum / d.count, lng: d.lngSum / d.count }, label: { text: t, color: 'black', fontWeight: '900', fontSize: '34px', className: 'map-label-macro' }, icon: { url: "", scaledSize: new google.maps.Size(0,0) } });
                    marcadoresMacro.push(mMacro);
                });

                map.addListener('zoom_changed', () => {
                    const z = map.getZoom();
                    if (z >= 15.5) { marcadoresMicro.forEach(m => m.setMap(map)); marcadoresMacro.forEach(m => m.setMap(null)); } 
                    else if (z >= 13) { marcadoresMicro.forEach(m => m.setMap(null)); marcadoresMacro.forEach(m => m.setMap(map)); } 
                    else { marcadoresMicro.forEach(m => m.setMap(null)); marcadoresMacro.forEach(m => m.setMap(null)); }
                });

                if (snapshotM.size > 0) { map.fitBounds(bounds); google.maps.event.trigger(map, 'zoom_changed'); }
            };
            document.head.appendChild(scriptMapa);

        } catch (error) { console.error(error); }
    } else {
        loginSection.style.display = 'block'; dashboardSection.style.display = 'none';
    }
});

// MOTOR PESTAÑAS
const tabs = document.querySelectorAll('.tab');
const views = document.querySelectorAll('.view-section');
tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active')); views.forEach(v => v.style.display = 'none');
        tab.classList.add('active'); const tId = tab.getAttribute('data-target'); const tView = document.getElementById(tId);
        if (tId === 'map-view') tView.style.display = 'flex'; else tView.style.display = 'block';
    });
});

document.getElementById('btn-cerrar-ficha').onclick = () => {
    if (window.historialUnsubscribe) window.historialUnsubscribe();
    document.getElementById('ficha-modal').style.display = 'none';
};
