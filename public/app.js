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

console.log("🚀 MOTOR JS GEMELO (VERSIÓN 106 - INVENTARIO + BOTÓN ATRÁS) CARGADO");

// ==========================================
// LOGIN
// ==========================================
window.iniciarSesionGoogle = async () => {
    const btn = document.getElementById('btn-login');
    if (btn) btn.innerText = "Conectando con Google...";
    try {
        await signInWithPopup(auth, provider);
    } catch (error) {
        if (btn) btn.innerText = "Error. Intentar de nuevo";
    }
};
const botonLogin = document.getElementById('btn-login');
if (botonLogin) {
    botonLogin.addEventListener('click', window.iniciarSesionGoogle);
}

// ==========================================
// VARIABLES GLOBALES (MAPA Y REGISTRO)
// ==========================================
window.mapaGlobal = null;
window.pinesVisitas = [];

let modoRegistroActivo = false;
let manzanasSeleccionadas = new Set(); 

function refrescarEstilosMapa() {
    if(!window.mapaGlobal) return;
    
    window.mapaGlobal.data.setStyle((feature) => {
        const numTerritorio = feature.getProperty('territorio') || '-';
        const numManzana = feature.getProperty('numero') || '-';
        const etiqueta = `T${numTerritorio} - ${numManzana}`;
        
        let fillColor = feature.getProperty('fill') || '#6200EE';
        let strokeColor = '#444444';
        let strokeWeight = 1;
        let fillOpacity = 0.35;

        // Si la manzana fue tocada durante el Modo Registro, la pintamos de violeta intenso
        if (modoRegistroActivo && manzanasSeleccionadas.has(etiqueta)) {
            fillColor = '#6200EE';
            fillOpacity = 0.7;
            strokeColor = 'white';
            strokeWeight = 3;
        }

        return { fillColor, strokeColor, strokeWeight, fillOpacity };
    });
}

function obtenerColorPin(estado) {
    let color = '#E65100'; 
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

            // MOSTRAR PRIVILEGIOS DE ADMIN/CONDUCTOR
            const tabServicio = document.getElementById('tab-servicio');
            const btnFabRegistro = document.getElementById('btn-fab-registro');
            
            if (miRol === 'siervo' || miRol === 'ayudante' || miRol === 'conductor') {
                if (tabServicio) tabServicio.style.display = 'block';
                if (btnFabRegistro) btnFabRegistro.style.display = 'block';
            }

            // ==========================================
            // LÓGICA DEL PANEL DE REGISTRO
            // ==========================================
            const panelRegistro = document.getElementById('panel-registro');
            const contadorManzanas = document.getElementById('contador-manzanas');

            if (btnFabRegistro) {
                btnFabRegistro.onclick = () => {
                    modoRegistroActivo = true;
                    btnFabRegistro.style.display = 'none';
                    panelRegistro.style.display = 'flex';
                    manzanasSeleccionadas.clear();
                    contadorManzanas.innerText = "0";
                    refrescarEstilosMapa();
                };
            }

            document.getElementById('btn-cerrar-registro').onclick = () => {
                modoRegistroActivo = false;
                panelRegistro.style.display = 'none';
                btnFabRegistro.style.display = 'block';
                manzanasSeleccionadas.clear();
                refrescarEstilosMapa();
            };

            async function guardarReporteActividad(cobertura) {
                if (manzanasSeleccionadas.size === 0) {
                    alert("Por favor, toca al menos una manzana en el mapa antes de guardar.");
                    return;
                }
                
                let notas = "";
                if (cobertura === "Parcial") {
                    notas = prompt("Registro Parcial: ¿Qué parte faltó o qué debemos tener en cuenta?") || "";
                }

                try {
                    const nuevoId = Date.now().toString();
                    const nuevoDocRef = doc(db, "congregaciones", window.miUsuario.congregacionId, "registro_actividad", nuevoId);
                    
                    await setDoc(nuevoDocRef, {
                        fecha: Date.now(),
                        manzanas: Array.from(manzanasSeleccionadas),
                        cobertura: cobertura,
                        notas: notas,
                        reportadoPor: window.miUsuario.nombre
                    });

                    alert(`¡Reporte ${cobertura} guardado con éxito!`);
                    document.getElementById('btn-cerrar-registro').click(); // Cierra y resetea el mapa
                } catch (error) {
                    console.error("Error guardando reporte:", error);
                    alert("Hubo un error al guardar el reporte.");
                }
            }

            document.getElementById('btn-registro-completo').onclick = () => guardarReporteActividad("Completo");
            document.getElementById('btn-registro-parcial').onclick = () => guardarReporteActividad("Parcial");

            // ==========================================
            // LÓGICA DEL RINCÓN DE SERVICIO
            // ==========================================
            const adminDashboard = document.getElementById('admin-dashboard');
            const viewInventario = document.getElementById('admin-inventario-view');
            const viewReportes = document.getElementById('admin-reportes-view');
            const viewRoles = document.getElementById('admin-roles-view');

            // Botones para volver al menú principal
            document.querySelectorAll('.btn-volver-admin').forEach(btn => {
                btn.onclick = () => {
                    history.back(); // Delega al popstate
                };
            });

            // A. PESTAÑA REPORTES (Historial 📋)
            document.getElementById('btn-admin-reportes').onclick = () => {
                history.pushState({ page: 'admin_sub' }, '', '');
                adminDashboard.style.display = 'none';
                viewReportes.style.display = 'block';
                
                const reportesRef = collection(db, "congregaciones", window.miUsuario.congregacionId, "registro_actividad");
                
                onSnapshot(reportesRef, (snapshot) => {
                    const listaHtml = document.getElementById('lista-reportes');
                    listaHtml.innerHTML = '';
                    
                    let reportes = [];
                    snapshot.forEach(doc => reportes.push({id: doc.id, ...doc.data()}));
                    reportes.sort((a,b) => b.fecha - a.fecha); // Orden descendente
                    
                    if(reportes.length === 0) {
                        listaHtml.innerHTML = '<p style="color:gray; text-align:center;">No hay reportes de actividad todavía.</p>';
                        return;
                    }

                    reportes.forEach(rep => {
                        const d = new Date(rep.fecha);
                        const fStr = `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()} - ${d.getHours()}:${d.getMinutes().toString().padStart(2,'0')}`;
                        const colorBadge = rep.cobertura === 'Completo' ? '#388E3C' : '#E65100';
                        const terText = rep.manzanas.join(', ');

                        const card = document.createElement('div');
                        card.className = 'admin-reporte-card';
                        card.innerHTML = `
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <span style="color:gray; font-size:13px; font-weight:bold;">${fStr}</span>
                                <span style="background:${colorBadge}20; color:${colorBadge}; padding:4px 8px; border-radius:8px; font-size:11px; font-weight:900;">${rep.cobertura.toUpperCase()}</span>
                            </div>
                            <p style="margin: 10px 0 5px 0; font-weight:bold; color:var(--text-color); font-size:15px;">Manzanas: <span style="color:var(--primary-color);">${terText}</span></p>
                            <p style="margin: 0; font-size:14px; color:gray;">👤 Por: ${rep.reportadoPor}</p>
                            ${rep.notas ? `<div style="margin-top:10px; background:rgba(128,128,128,0.1); padding:10px; border-radius:8px; font-size:13px; color:var(--text-color, #444);">📝 ${rep.notas}</div>` : ''}                        
                        `;
                        listaHtml.appendChild(card);
                    });
                });
            };

            // B. GESTIÓN DE TERRITORIOS (Inventario)
            let seleccionadosInventario = new Set();
            let mapasEstadoGlobal = {};

            document.getElementById('btn-admin-inventario').onclick = () => {
                history.pushState({ page: 'admin_sub' }, '', '');
                adminDashboard.style.display = 'none'; 
                viewInventario.style.display = 'block';
                document.getElementById('barra-accion-inventario').style.display = 'flex';
                seleccionadosInventario.clear();
                actualizarBarraInventario();

                // Extraer manzanas del mapa
                let manzanasUnicas = new Set();
                if(window.mapaGlobal) {
                    window.mapaGlobal.data.forEach(f => {
                        const t = f.getProperty('territorio'); const m = f.getProperty('numero');
                        if(t && m && m.toLowerCase() !== 'plaza') manzanasUnicas.add(`T${t} - ${m}`);
                    });
                }
                const listaManzanas = Array.from(manzanasUnicas).sort((a,b) => a.localeCompare(b, undefined, {numeric: true}));

                const gestionRef = collection(db, "congregaciones", window.miUsuario.congregacionId, "gestion_mapas");
                onSnapshot(gestionRef, (snapshot) => {
                    mapasEstadoGlobal = {};
                    snapshot.forEach(doc => mapasEstadoGlobal[doc.id] = doc.data());
                    
                    const listaHtml = document.getElementById('lista-inventario');
                    listaHtml.innerHTML = '';

                    listaManzanas.forEach(manzanaId => {
                        const gestion = mapasEstadoGlobal[manzanaId] || { estaDisponible: true };
                        
                        let badgeHtml = `<span class="badge-libre">LIBRE</span>`;
                        let infoHtml = ``;
                        let estaVencido = false;

                        if (!gestion.estaDisponible && gestion.fecha) {
                            const fechaVencimiento = new Date(gestion.fecha);
                            fechaVencimiento.setMonth(fechaVencimiento.getMonth() + (gestion.duracionMeses || 4));
                            
                            const hoy = new Date();
                            const diasRestantes = Math.ceil((fechaVencimiento - hoy) / (1000 * 60 * 60 * 24));
                            
                            if (diasRestantes < 0) {
                                estaVencido = true;
                                badgeHtml = `<span class="badge-vencido">VENCIDO</span>`;
                                infoHtml = `<p>👤 ${gestion.asignadoA}</p><p style="color:#C62828; font-weight:bold;">⚠️ Vencido hace ${Math.abs(diasRestantes)} días</p>`;
                            } else {
                                badgeHtml = `<span class="badge-asignado">ASIGNADO</span>`;
                                infoHtml = `<p>👤 ${gestion.asignadoA}</p><p style="color:var(--primary-color);">Faltan ${diasRestantes} días</p>`;
                            }
                        }

                        const div = document.createElement('div');
                        div.className = 'inventario-item';
                        div.innerHTML = `
                            <input type="checkbox" value="${manzanaId}" ${seleccionadosInventario.has(manzanaId) ? 'checked' : ''}>
                            <div class="inventario-info">
                                <h4>Manzana ${manzanaId} ${badgeHtml}</h4>
                                ${infoHtml}
                            </div>
                        `;
                        
                        const checkbox = div.querySelector('input');
                        div.onclick = (e) => {
                            if(e.target !== checkbox) checkbox.checked = !checkbox.checked;
                            if (checkbox.checked) seleccionadosInventario.add(manzanaId);
                            else seleccionadosInventario.delete(manzanaId);
                            actualizarBarraInventario();
                        };
                        
                        listaHtml.appendChild(div);
                    });
                });
            };

            function actualizarBarraInventario() {
                document.getElementById('contador-inventario').innerText = seleccionadosInventario.size;
                const btnAsignar = document.getElementById('btn-asignar-mapas');
                const btnRecibir = document.getElementById('btn-recibir-mapas');
                
                if (seleccionadosInventario.size === 0) {
                    btnAsignar.disabled = true; btnRecibir.style.display = 'none'; btnAsignar.style.display = 'block';
                    return;
                }
                
                let todosLibres = true;
                seleccionadosInventario.forEach(id => {
                    if (mapasEstadoGlobal[id] && !mapasEstadoGlobal[id].estaDisponible) todosLibres = false;
                });

                if (todosLibres) {
                    btnAsignar.style.display = 'block'; btnAsignar.disabled = false; btnRecibir.style.display = 'none';
                } else {
                    btnAsignar.style.display = 'none'; btnRecibir.style.display = 'block';
                }
            }

            document.getElementById('btn-recibir-mapas').onclick = () => {
                seleccionadosInventario.forEach(async (id) => {
                    await setDoc(doc(db, "congregaciones", window.miUsuario.congregacionId, "gestion_mapas", id), { estaDisponible: true });
                });
                seleccionadosInventario.clear(); actualizarBarraInventario();
            };

            document.getElementById('btn-asignar-mapas').onclick = () => {
                history.pushState({ page: 'modal_asignar' }, '', '');
                document.getElementById('asignar-text').innerText = `Vas a asignar ${seleccionadosInventario.size} manzanas.`;
                document.getElementById('asignar-modal').style.display = 'flex';
            };

            document.getElementById('btn-cancelar-asignar').onclick = () => history.back();

            document.getElementById('btn-confirmar-asignar').onclick = () => {
                const nombre = document.getElementById('asignar-nombre').value.trim();
                const meses = parseInt(document.getElementById('asignar-meses').value) || 4;
                if (!nombre) return alert("Ingresa un nombre");

                seleccionadosInventario.forEach(async (id) => {
                    await setDoc(doc(db, "congregaciones", window.miUsuario.congregacionId, "gestion_mapas", id), {
                        asignadoA: nombre, fecha: Date.now(), estaDisponible: false, duracionMeses: meses
                    });
                });

                document.getElementById('asignar-nombre').value = '';
                seleccionadosInventario.clear();
                actualizarBarraInventario();
                history.back(); 
            };

            document.getElementById('btn-admin-roles').onclick = () => {
                history.pushState({ page: 'admin_sub' }, '', '');
                adminDashboard.style.display = 'none'; viewRoles.style.display = 'block';
                document.getElementById('lista-roles').innerHTML = '<p style="color:gray; text-align:center; margin-top:20px;">En construcción para el próximo paso 🏗️...</p>';
            };

            // ==========================================
            // CARGA DE CONFIGURACIÓN Y VISITAS
            // ==========================================
            const ministerioRef = doc(db, "configuracion", "ministerio");
            const ministerioSnap = await getDoc(ministerioRef);
            if (ministerioSnap.exists()) {
                const dataMin = ministerioSnap.data();
                const selectPubli = document.getElementById('ficha-publi');
                const selectVideo = document.getElementById('ficha-video');
                
                if (selectPubli) selectPubli.innerHTML = '<option value="">Ninguna</option>';
                if (selectVideo) selectVideo.innerHTML = '<option value="">Ninguno</option>';
                
                if (dataMin.publicaciones && selectPubli) {
                    dataMin.publicaciones.forEach(pub => { 
                        const opt = document.createElement('option'); opt.value = pub; opt.textContent = pub; selectPubli.appendChild(opt); 
                    });
                }
                if (dataMin.videos && selectVideo) {
                    dataMin.videos.forEach(vid => { 
                        const opt = document.createElement('option'); opt.value = vid; opt.textContent = vid; selectVideo.appendChild(opt); 
                    });
                }
            }

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

                window.pinesVisitas.forEach(pin => pin.setMap(null));
                window.pinesVisitas = [];

                const visitasFiltradas = todasLasVisitas.filter(v => (filtroActual === 'Todos' || v.estado === filtroActual));
                
                if (visitasFiltradas.length === 0) {
                    visitasContainer.innerHTML = `<p style="color: gray; text-align: center; margin-top: 40px;">No hay visitas.</p>`;
                    return;
                }

                visitasFiltradas.forEach(visita => {
                    if (window.mapaGlobal && visita.latitud && visita.longitud) {
                        const pin = new google.maps.Marker({
                            position: { lat: visita.latitud, lng: visita.longitud },
                            map: window.mapaGlobal,
                            icon: obtenerColorPin(visita.estado)
                        });
                        pin.addListener('click', () => { 
                            if(!modoRegistroActivo) abrirFichaVisita(visita); 
                        });
                        window.pinesVisitas.push(pin);
                    }

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

            function abrirFichaVisita(visita) {
                history.pushState({ page: 'modal_ficha' }, '', '');
                window.miUsuario.visitaActivaId = visita.id;
                window.miUsuario.visitaActivaNotas = visita.notas || "";
                window.miUsuario.tempLat = visita.latitud || 0;
                window.miUsuario.tempLng = visita.longitud || 0;

                const inputNombre = document.getElementById('ficha-nombre');
                if (inputNombre) inputNombre.value = visita.nombre !== 'Nueva' ? visita.nombre : '';
                
                const inputApellido = document.getElementById('ficha-apellido');
                if (inputApellido) inputApellido.value = visita.apellido !== 'Visita' ? visita.apellido : '';
                
                const lblTerritorio = document.getElementById('ficha-terr');
                if (lblTerritorio) lblTerritorio.innerText = visita.territorio || '-';
                
                const lblManzana = document.getElementById('ficha-manz');
                if (lblManzana) lblManzana.innerText = visita.poligono || '-';
                
                const selectEstado = document.getElementById('ficha-estado');
                if (selectEstado) selectEstado.value = visita.estado || 'Nueva';
                
                const inputDireccion = document.getElementById('ficha-direccion');
                if (inputDireccion) inputDireccion.value = visita.direccion || '';
                
                const selectPubli = document.getElementById('ficha-publi');
                if (selectPubli) selectPubli.value = visita.publicacionDejada || '';
                
                const selectVideo = document.getElementById('ficha-video');
                if (selectVideo) selectVideo.value = visita.videoVisto || '';
                
                const inputProximo = document.getElementById('ficha-proximo');
                if (inputProximo) inputProximo.value = visita.proximoPaso || '';
                
                const inputNotas = document.getElementById('ficha-notas');
                if (inputNotas) inputNotas.value = ''; 

                pintarGlobosHistorial(visita.notas); 
                
                const modal = document.getElementById('ficha-modal');
                if (modal) modal.style.display = 'flex';
            }

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
            // LOGICA GUARDAR MODAL
            // ==========================================
            const btnGuardar = document.getElementById('btn-guardar-ficha');
            if (btnGuardar) {
                btnGuardar.onclick = async () => {
                    const vId = window.miUsuario.visitaActivaId;
                    if (!vId) return;

                    const inputNotasElement = document.getElementById('ficha-notas');
                    const inputNotasVal = inputNotasElement ? inputNotasElement.value.trim() : '';
                    
                    const publiElement = document.getElementById('ficha-publi');
                    const publiVal = publiElement ? publiElement.value : '';
                    
                    const videoElement = document.getElementById('ficha-video');
                    const videoVal = videoElement ? videoElement.value : '';
                    
                    const proximoElement = document.getElementById('ficha-proximo');
                    const proximoVal = proximoElement ? proximoElement.value.trim() : '';
                    
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
                        
                        if (stringNotasFinal !== "") {
                            stringNotasFinal += `||${nuevaEntrada}`;
                        } else {
                            stringNotasFinal = nuevaEntrada;
                        }
                    }

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

                    history.back(); // Cierra el modal y actualiza el historial
                };
            }

            // ==========================================
            // MAPA Y EVENTOS DE SELECCIÓN
            // ==========================================
            const llaveRef = doc(db, "configuracion", "ApiKeys");
            const llaveSnap = await getDoc(llaveRef);
            
            if (llaveSnap.exists()) {
                const scriptMapa = document.createElement('script');
                scriptMapa.src = `https://maps.googleapis.com/maps/api/js?key=${llaveSnap.data().ApiMapsWeb}`;
                scriptMapa.async = true;
                
                scriptMapa.onload = async () => {
                    const mapEl = document.getElementById("map");
                    if (!mapEl) return; 

                    window.mapaGlobal = new google.maps.Map(mapEl, { 
                        disableDefaultUI: true, 
                        zoomControl: false, 
                        mapTypeControl: false, 
                        streetViewControl: false 
                    });
                    
                    refrescarEstilosMapa();

                    // EVENTO PRINCIPAL: TOQUE EN LA MANZANA
                    window.mapaGlobal.data.addListener('click', (event) => {
                        const numManzana = event.feature.getProperty('numero') || '-'; 
                        const numTerritorio = event.feature.getProperty('territorio') || '-';
                        const etiqueta = `T${numTerritorio} - ${numManzana}`;

                        if (modoRegistroActivo) {
                            // MODO REGISTRO: Seleccionar/Deseleccionar
                            if (manzanasSeleccionadas.has(etiqueta)) {
                                manzanasSeleccionadas.delete(etiqueta);
                            } else {
                                manzanasSeleccionadas.add(etiqueta);
                            }
                            document.getElementById('contador-manzanas').innerText = manzanasSeleccionadas.size;
                            refrescarEstilosMapa(); 
                        } else {
                            // MODO NORMAL: Nueva Visita
                            const nuevoId = Date.now().toString(); 
                            const visitaVacia = {
                                id: nuevoId, nombre: 'Nueva', apellido: 'Visita',
                                territorio: numTerritorio, poligono: numManzana,
                                latitud: event.latLng.lat(), longitud: event.latLng.lng(),
                                estado: 'Nueva', direccion: '', notas: ''
                            };
                            abrirFichaVisita(visitaVacia);
                        }
                    });

                    const snapshotM = await getDocs(collection(db, "congregaciones", window.miUsuario.congregacionId, "territorios"));
                    const bounds = new google.maps.LatLngBounds();
                    const marcadoresMicro = []; 
                    const marcadoresMacro = []; 
                    const agrupacionMacro = {};

                    snapshotM.forEach(doc => { 
                        if (doc.data().geojson) window.mapaGlobal.data.addGeoJson(JSON.parse(doc.data().geojson)); 
                    });
                    
                    window.mapaGlobal.data.forEach(feature => {
                        const fBounds = new google.maps.LatLngBounds(); 
                        feature.getGeometry().forEachLatLng(p => { bounds.extend(p); fBounds.extend(p); });
                        
                        const numManzana = feature.getProperty('numero') || ''; 
                        const numTerritorio = feature.getProperty('territorio') || '';
                        
                        if (!numManzana || numManzana.toLowerCase() === 'plaza') return;
                        
                        const textE = numTerritorio ? `T${numTerritorio} - ${numManzana}` : numManzana;
                        const mMicro = new google.maps.Marker({ 
                            position: fBounds.getCenter(), 
                            label: { text: textE, color: 'black', fontWeight: '900', fontSize: '14px', className: 'map-label-micro' }, 
                            icon: { url: "", scaledSize: new google.maps.Size(0,0) } 
                        });
                        marcadoresMicro.push(mMicro);

                        if (numTerritorio) {
                            if (!agrupacionMacro[numTerritorio]) agrupacionMacro[numTerritorio] = { latSum: 0, lngSum: 0, count: 0 };
                            agrupacionMacro[numTerritorio].latSum += fBounds.getCenter().lat(); 
                            agrupacionMacro[numTerritorio].lngSum += fBounds.getCenter().lng(); 
                            agrupacionMacro[numTerritorio].count++;
                        }
                    });

                    Object.keys(agrupacionMacro).forEach(t => {
                        const d = agrupacionMacro[t];
                        const mMacro = new google.maps.Marker({ 
                            position: { lat: d.latSum / d.count, lng: d.lngSum / d.count }, 
                            label: { text: t, color: 'black', fontWeight: '900', fontSize: '34px', className: 'map-label-macro' }, 
                            icon: { url: "", scaledSize: new google.maps.Size(0,0) } 
                        });
                        marcadoresMacro.push(mMacro);
                    });

                    window.mapaGlobal.addListener('zoom_changed', () => {
                        const z = window.mapaGlobal.getZoom();
                        if (z >= 15.5) { 
                            marcadoresMicro.forEach(m => m.setMap(window.mapaGlobal)); 
                            marcadoresMacro.forEach(m => m.setMap(null)); 
                        } else if (z >= 13) { 
                            marcadoresMicro.forEach(m => m.setMap(null)); 
                            marcadoresMacro.forEach(m => m.setMap(window.mapaGlobal)); 
                        } else { 
                            marcadoresMicro.forEach(m => m.setMap(null)); 
                            marcadoresMacro.forEach(m => m.setMap(null)); 
                        }
                    });

                    if (snapshotM.size > 0) { 
                        window.mapaGlobal.fitBounds(bounds); 
                        google.maps.event.trigger(window.mapaGlobal, 'zoom_changed'); 
                    }
                    
                    renderizarVisitas();
                };
                document.head.appendChild(scriptMapa);
            }
        } catch (error) { 
            console.error("Error capturado:", error); 
        }
    } else {
        if (loginSection) loginSection.style.display = 'flex'; 
        if (dashboardSection) dashboardSection.style.display = 'none';
        const btn = document.getElementById('btn-login');
        if (btn) btn.innerText = "Iniciar sesión con Google";
    }
});

// ==========================================
// TABS Y EVENTOS FUERA DE FIREBASE
// ==========================================
const tabs = document.querySelectorAll('.tab');
const views = document.querySelectorAll('.view-section');

tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        history.pushState({ page: 'tab' }, '', '');
        tabs.forEach(t => t.classList.remove('active')); 
        views.forEach(v => v.style.display = 'none');
        
        tab.classList.add('active'); 
        const tId = tab.getAttribute('data-target'); 
        const tView = document.getElementById(tId);
        
        if (tId === 'map-view' && tView) {
            tView.style.display = 'flex'; 
        } else if (tView) {
            tView.style.display = 'block';
        }
    });
});

if (document.getElementById('btn-cerrar-ficha')) {
    document.getElementById('btn-cerrar-ficha').onclick = () => {
        history.back();
    };
}

// ==========================================
// INTERCEPCIÓN DEL BOTÓN "ATRÁS" (HISTORY API)
// ==========================================
window.addEventListener('popstate', (e) => {
    const modalFicha = document.getElementById('ficha-modal');
    const modalAsignar = document.getElementById('asignar-modal');
    const barraInventario = document.getElementById('barra-accion-inventario');
    const adminDashboard = document.getElementById('admin-dashboard');
    const viewInventario = document.getElementById('admin-inventario-view');
    const viewReportes = document.getElementById('admin-reportes-view');
    const viewRoles = document.getElementById('admin-roles-view');
    
    // 1. Prioridad Máxima: Cerrar Modales
    if (modalFicha && modalFicha.style.display === 'flex') { modalFicha.style.display = 'none'; return; }
    if (modalAsignar && modalAsignar.style.display === 'flex') { modalAsignar.style.display = 'none'; return; }

    // 2. Prioridad Media: Cerrar sub-menús de administrador
    if (viewInventario && viewInventario.style.display === 'block' || 
        viewReportes && viewReportes.style.display === 'block' || 
        viewRoles && viewRoles.style.display === 'block') {
        if(viewInventario) viewInventario.style.display = 'none'; 
        if(viewReportes) viewReportes.style.display = 'none'; 
        if(viewRoles) viewRoles.style.display = 'none';
        if(barraInventario) barraInventario.style.display = 'none';
        if(adminDashboard) adminDashboard.style.display = 'flex';
        return;
    }

    // 3. Prioridad Baja: Si no estamos en el mapa, volver al mapa
    const tabMapa = document.querySelector('.tab[data-target="map-view"]');
    if (tabMapa && !tabMapa.classList.contains('active')) {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active')); 
        document.querySelectorAll('.view-section').forEach(v => v.style.display = 'none');
        tabMapa.classList.add('active'); 
        document.getElementById('map-view').style.display = 'flex';
    }
});