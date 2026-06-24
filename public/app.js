// 1. IMPORTACIONES DE FIREBASE
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, getDocs, doc, getDoc, query, where, onSnapshot, updateDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// 2. SERVICE WORKER
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(err => console.error(err)));
}

// 3. CONFIGURACIÓN FIREBASE
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

const loginSection = document.getElementById('login-section');
const dashboardSection = document.getElementById('dashboard-section');

// ==========================================
// CONFIRMACIÓN Y MOTOR DE LOGIN DIRECTO
// ==========================================
console.log("🚀 MOTOR JS GEMELO (VERSIÓN 102 - LONG PRESS ACTIVO) CARGADO");

window.iniciarSesionGoogle = async () => {
    const btn = document.getElementById('btn-login');
    if (btn) btn.innerText = "Conectando con Google...";
    try {
        await signInWithPopup(auth, provider);
    } catch (error) {
        if (btn) btn.innerText = "Error. Intentar de nuevo";
    }
};

// VARIABLES GLOBALES DEL MAPA
window.mapaGlobal = null;
window.pinesVisitas = [];

// FUNCIONES DE COLORES (Traducción de tu Kotlin)
function obtenerColorPin(estado) {
    let color = '#E65100'; // Naranja (Otro)
    if (estado === 'Nueva') color = '#0288D1'; 
    if (estado === 'Ausente') color = '#D32F2F'; 
    if (estado === 'Revisita') color = '#388E3C'; 
    if (estado === 'Estudio') color = '#FBC02D'; 
    if (estado === 'No visitar') color = '#7B1FA2'; 
    return {
        path: google.maps.SymbolPath.CIRCLE,
        fillColor: color,
        fillOpacity: 1,
        strokeColor: 'white',
        strokeWeight: 2,
        scale: 8
    };
}

// ==========================================
// EL CORAZÓN DE LA APLICACIÓN
// ==========================================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        if (loginSection) loginSection.style.display = 'none';
        if (dashboardSection) dashboardSection.style.display = 'block';

        try {
            const email = user.email;
            let nombreCompleto = user.displayName || "Hermano";
            let miCongregacionId = "1552"; 
            let miRol = "publicador";

            const userRef = doc(db, "usuarios", email);
            const userSnap = await getDoc(userRef);
            if (userSnap.exists()) nombreCompleto = `${userSnap.data().nombre} ${userSnap.data().apellido}`;

            const congRef = doc(db, "congregaciones", miCongregacionId);
            const congSnap = await getDoc(congRef);
            if (congSnap.exists()) {
                const congData = congSnap.data();
                const appTitleEl = document.querySelector('.app-title');
                if (appTitleEl) appTitleEl.innerText = congData.nombre || `Congregación ${miCongregacionId}`;
                if (congData.roles && congData.roles[email]) miRol = congData.roles[email];
            }
            
            window.miUsuario = { email, nombre: nombreCompleto, rol: miRol, congregacionId: miCongregacionId, visitaActivaId: null, visitaActivaNotas: "", tempLat: 0, tempLng: 0 };

            const tabServicio = document.getElementById('tab-servicio');
            if (tabServicio) tabServicio.style.display = (miRol === 'siervo' || miRol === 'ayudante') ? 'block' : 'none';

            // CARGAR PUBLICACIONES DINÁMICAS
            const ministerioRef = doc(db, "configuracion", "ministerio");
            const ministerioSnap = await getDoc(ministerioRef);
            if (ministerioSnap.exists()) {
                const dataMin = ministerioSnap.data();
                const selectPubli = document.getElementById('ficha-publi');
                const selectVideo = document.getElementById('ficha-video');
                
                if (selectPubli) selectPubli.innerHTML = '<option value="">Ninguna</option>';
                if (selectVideo) selectVideo.innerHTML = '<option value="">Ninguno</option>';
                
                if (dataMin.publicaciones && selectPubli) dataMin.publicaciones.forEach(pub => { const opt = document.createElement('option'); opt.value = pub; opt.textContent = pub; selectPubli.appendChild(opt); });
                if (dataMin.videos && selectVideo) dataMin.videos.forEach(vid => { const opt = document.createElement('option'); opt.value = vid; opt.textContent = vid; selectVideo.appendChild(opt); });
            }

            // MOTOR DE VISITAS
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

            function pintarGlobosHistorial(notasString) {
                const chatContainer = document.getElementById('historial-conversaciones-container');
                if (!chatContainer) return; 
                chatContainer.innerHTML = '';
                
                if (!notasString || notasString.trim() === '') {
                    chatContainer.innerHTML = '<p style="color: gray; font-size: 13px; text-align: center; margin-top: 10px;">No hay conversaciones previas registradas.</p>';
                    return;
                }

                const entradas = notasString.split('||').filter(e => e.trim() !== '');
                entradas.forEach(entrada => {
                    const partes = entrada.split('&&&');
                    let fechaStr = "Fecha desconocida";
                    let cuerpoTexto = "";

                    if (partes.length >= 3) {
                        fechaStr = partes[1]; 
                        cuerpoTexto = partes.slice(2).join('&&&'); 
                    } else if (partes.length === 2) {
                        fechaStr = partes[0]; cuerpoTexto = partes[1];
                    } else {
                        cuerpoTexto = entrada;
                    }

                    const textoLimpio = cuerpoTexto.replace(/\/\//g, '<br><br>• ');
                    const globo = document.createElement('div');
                    globo.className = 'chat-bubble';
                    globo.innerHTML = `<div class="chat-text">${textoLimpio}</div><div class="chat-meta">📅 ${fechaStr}</div>`;
                    chatContainer.appendChild(globo);
                });
            }

            window.renderizarVisitas = () => {
                if (!visitasContainer) return;
                visitasContainer.innerHTML = ''; 

                // 1. Limpiar pines viejos del mapa
                window.pinesVisitas.forEach(pin => pin.setMap(null));
                window.pinesVisitas = [];

                const visitasFiltradas = todasLasVisitas.filter(v => (filtroActual === 'Todos' || v.estado === filtroActual));
                
                if (visitasFiltradas.length === 0) {
                    visitasContainer.innerHTML = `<p style="color: gray; text-align: center; margin-top: 40px;">No hay visitas.</p>`;
                    return;
                }

                visitasFiltradas.forEach(visita => {
                    // 2. Dibujar Pin en el Mapa (si hay coordenadas y el mapa cargó)
                    if (window.mapaGlobal && visita.latitud && visita.longitud) {
                        const pin = new google.maps.Marker({
                            position: { lat: visita.latitud, lng: visita.longitud },
                            map: window.mapaGlobal,
                            icon: obtenerColorPin(visita.estado)
                        });

                        // Hacer que al tocar el pin en el mapa, se abra la ficha
                        pin.addListener('click', () => { abrirFichaVisita(visita); });
                        window.pinesVisitas.push(pin);
                    }

                    // 3. Dibujar Tarjeta en la lista
                    let colorPinLista = '#FF9800'; 
                    if (visita.estado === 'Nueva') colorPinLista = '#2196F3'; 
                    if (visita.estado === 'Ausente') colorPinLista = '#F44336'; 
                    if (visita.estado === 'Revisita') colorPinLista = '#4CAF50'; 
                    if (visita.estado === 'Estudio') colorPinLista = '#FFEB3B'; 
                    if (visita.estado === 'No visitar') colorPinLista = '#9C27B0'; 

                    const nombreMostrar = (visita.nombre === 'Nueva' && visita.apellido === 'Visita') ? 'Visita Nueva' : `${visita.nombre} ${visita.apellido}`;
                    const fecha = new Date(visita.timestamp || Date.now()).toLocaleDateString();

                    const card = document.createElement('div');
                    card.className = 'visita-card';
                    card.innerHTML = `<div class="visita-color" style="background-color: ${colorPinLista};"></div><div class="visita-info" style="flex: 1;"><h3>${nombreMostrar}</h3><p>📍 T${visita.territorio} - ${visita.poligono} | 📅 ${fecha}</p></div>`;
                    
                    card.onclick = () => { abrirFichaVisita(visita); };
                    visitasContainer.appendChild(card);
                });
            };

            // FUNCIÓN REUTILIZABLE PARA ABRIR LA FICHA
            function abrirFichaVisita(visita) {
                window.miUsuario.visitaActivaId = visita.id;
                window.miUsuario.visitaActivaNotas = visita.notas || "";
                window.miUsuario.tempLat = visita.latitud || 0;
                window.miUsuario.tempLng = visita.longitud || 0;

                const fn = document.getElementById('ficha-nombre'); if (fn) fn.value = visita.nombre !== 'Nueva' ? visita.nombre : '';
                const fa = document.getElementById('ficha-apellido'); if (fa) fa.value = visita.apellido !== 'Visita' ? visita.apellido : '';
                const ft = document.getElementById('ficha-terr'); if (ft) ft.innerText = visita.territorio || '-';
                const fm = document.getElementById('ficha-manz'); if (fm) fm.innerText = visita.poligono || '-';
                const fe = document.getElementById('ficha-estado'); if (fe) fe.value = visita.estado || 'Nueva';
                const fd = document.getElementById('ficha-direccion'); if (fd) fd.value = visita.direccion || '';
                const fp = document.getElementById('ficha-publi'); if (fp) fp.value = visita.publicacionDejada || '';
                const fv = document.getElementById('ficha-video'); if (fv) fv.value = visita.videoVisto || '';
                const fpx = document.getElementById('ficha-proximo'); if (fpx) fpx.value = visita.proximoPaso || '';
                const fno = document.getElementById('ficha-notas'); if (fno) fno.value = ''; 

                pintarGlobosHistorial(visita.notas); 
                const modal = document.getElementById('ficha-modal');
                if (modal) modal.style.display = 'flex';
            }

            const chips = document.querySelectorAll('.filtro-chip');
            chips.forEach(chip => {
                chip.addEventListener('click', (e) => {
                    chips.forEach(c => c.classList.remove('active')); e.target.classList.add('active');
                    filtroActual = e.target.getAttribute('data-filtro'); renderizarVisitas();
                });
            });

            // LOGICA GUARDAR MODAL (Para nuevas o editadas)
            const btnGuardar = document.getElementById('btn-guardar-ficha');
            if (btnGuardar) {
                btnGuardar.onclick = async () => {
                    const vId = window.miUsuario.visitaActivaId;
                    if (!vId) return;

                    const inputNotasVal = document.getElementById('ficha-notas') ? document.getElementById('ficha-notas').value.trim() : '';
                    const publiVal = document.getElementById('ficha-publi') ? document.getElementById('ficha-publi').value : '';
                    const videoVal = document.getElementById('ficha-video') ? document.getElementById('ficha-video').value : '';
                    const proximoVal = document.getElementById('ficha-proximo') ? document.getElementById('ficha-proximo').value.trim() : '';
                    
                    let stringNotasFinal = window.miUsuario.visitaActivaNotas;

                    if (inputNotasVal.length > 0) {
                        const ahora = new Date();
                        const fechaStr = `${ahora.getDate()} ${ahora.toLocaleString('es', { month: 'short' })}. ${ahora.getFullYear()} - ${ahora.getHours().toString().padStart(2, '0')}:${ahora.getMinutes().toString().padStart(2, '0')}`;
                        const idFalso = Date.now().toString(); 
                        
                        let cuerpoMensaje = inputNotasVal;
                        if (publiVal) cuerpoMensaje += `//📚 Publicación: ${publiVal}`;
                        if (videoVal) cuerpoMensaje += `//🎬 Video: ${videoVal}`;
                        if (proximoVal) cuerpoMensaje += `//➡️ Próximo paso: ${proximoVal}`;

                        const nuevaEntrada = `${idFalso}&&&${fechaStr}&&&${cuerpoMensaje}`;
                        
                        if (stringNotasFinal !== "") stringNotasFinal += `||${nuevaEntrada}`; else stringNotasFinal = nuevaEntrada;
                    }

                    // Usamos setDoc para que, si el ID es nuevo, lo cree, y si existe, lo actualice (equivalente al OnConflictStrategy.REPLACE de tu Kotlin)
                    const docVisitaRef = doc(db, "usuarios", email, "mis_visitas", vId);
                    await setDoc(docVisitaRef, {
                        nombre: document.getElementById('ficha-nombre').value.trim() || 'Nueva',
                        apellido: document.getElementById('ficha-apellido').value.trim() || 'Visita',
                        estado: document.getElementById('ficha-estado').value,
                        direccion: document.getElementById('ficha-direccion').value.trim(),
                        territorio: document.getElementById('ficha-terr').innerText,
                        poligono: document.getElementById('ficha-manz').innerText,
                        publicacionDejada: publiVal,
                        videoVisto: videoVal,
                        proximoPaso: proximoVal,
                        notas: stringNotasFinal,
                        latitud: window.miUsuario.tempLat,
                        longitud: window.miUsuario.tempLng,
                        congregacionId: window.miUsuario.congregacionId,
                        timestamp: Date.now()
                    }, { merge: true });

                    const modal = document.getElementById('ficha-modal');
                    if (modal) modal.style.display = 'none';
                };
            }

            // MAPA CON INTERACTIVIDAD (ACTUALIZADO PARA PULSO LARGO / CLIC DERECHO)
            const llaveRef = doc(db, "configuracion", "ApiKeys");
            const llaveSnap = await getDoc(llaveRef);
            if (llaveSnap.exists()) {
                const scriptMapa = document.createElement('script');
                scriptMapa.src = `https://maps.googleapis.com/maps/api/js?key=${llaveSnap.data().ApiMapsWeb}`;
                scriptMapa.async = true;
                scriptMapa.onload = async () => {
                    const mapEl = document.getElementById("map");
                    if (!mapEl) return; 

                    window.mapaGlobal = new google.maps.Map(mapEl, { disableDefaultUI: true, zoomControl: false, mapTypeControl: false, streetViewControl: false });
                    window.mapaGlobal.data.setStyle((feature) => { return { fillColor: feature.getProperty('fill') || '#6200EE', strokeColor: '#444444', strokeWeight: 1, fillOpacity: 0.35 }; });

                    // --- LA MAGIA DEL PULSO LARGO (rightclick en Google Maps JS) ---
                    // En celular, mantener presionado el mapa dispara un 'rightclick' de manera nativa.
                    window.mapaGlobal.data.addListener('rightclick', (event) => {
                        const numManzana = event.feature.getProperty('numero') || '-'; 
                        const numTerritorio = event.feature.getProperty('territorio') || '-';
                        
                        // Generamos un ID falso único como en Android (UUID)
                        const nuevoId = Date.now().toString(); 
                        
                        // Capturamos el event.latLng EXACTO donde el dedo tocó la pantalla
                        const visitaVacia = {
                            id: nuevoId,
                            nombre: 'Nueva',
                            apellido: 'Visita',
                            territorio: numTerritorio,
                            poligono: numManzana,
                            latitud: event.latLng.lat(),
                            longitud: event.latLng.lng(),
                            estado: 'Nueva',
                            direccion: '',
                            notas: ''
                        };

                        abrirFichaVisita(visitaVacia);
                    });

                    const snapshotM = await getDocs(collection(db, "congregaciones", window.miUsuario.congregacionId, "territorios"));
                    const bounds = new google.maps.LatLngBounds();
                    const marcadoresMicro = []; const marcadoresMacro = []; const agrupacionMacro = {};

                    snapshotM.forEach(doc => { if (doc.data().geojson) window.mapaGlobal.data.addGeoJson(JSON.parse(doc.data().geojson)); });
                    window.mapaGlobal.data.forEach(feature => {
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

                    window.mapaGlobal.addListener('zoom_changed', () => {
                        const z = window.mapaGlobal.getZoom();
                        if (z >= 15.5) { marcadoresMicro.forEach(m => m.setMap(window.mapaGlobal)); marcadoresMacro.forEach(m => m.setMap(null)); } 
                        else if (z >= 13) { marcadoresMicro.forEach(m => m.setMap(null)); marcadoresMacro.forEach(m => m.setMap(window.mapaGlobal)); } 
                        else { marcadoresMicro.forEach(m => m.setMap(null)); marcadoresMacro.forEach(m => m.setMap(null)); }
                    });

                    if (snapshotM.size > 0) { window.mapaGlobal.fitBounds(bounds); google.maps.event.trigger(window.mapaGlobal, 'zoom_changed'); }
                    
                    // Disparamos la renderización de pines por si las visitas cargaron antes que el mapa
                    renderizarVisitas();
                };
                document.head.appendChild(scriptMapa);
            }
        } catch (error) { console.error("Error capturado:", error); }
    } else {
        if (loginSection) loginSection.style.display = 'flex'; 
        if (dashboardSection) dashboardSection.style.display = 'none';
        const btn = document.getElementById('btn-login');
        if (btn) btn.innerText = "Iniciar sesión con Google";
    }
});

// TABS Y EVENTOS FUERA DE FIREBASE
const tabs = document.querySelectorAll('.tab');
const views = document.querySelectorAll('.view-section');
tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active')); views.forEach(v => v.style.display = 'none');
        tab.classList.add('active'); const tId = tab.getAttribute('data-target'); const tView = document.getElementById(tId);
        if (tId === 'map-view' && tView) tView.style.display = 'flex'; else if (tView) tView.style.display = 'block';
    });
});

const btnCerrarFicha = document.getElementById('btn-cerrar-ficha');
if (btnCerrarFicha) {
    btnCerrarFicha.onclick = () => {
        const modal = document.getElementById('ficha-modal');
        if (modal) modal.style.display = 'none';
    };
}