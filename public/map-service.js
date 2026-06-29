// ==========================================
// ARCHIVO: map-service.js (VERSIÓN INTEGRAL Y COMPLETADA)
// ==========================================
import { collection, getDocs, doc, getDoc, query, where, onSnapshot, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { db } from "./firebase-core.js";

window.mapaGlobal = null;
window.pinesVisitas = [];
let filtroActual = 'Todos';
let todasLasVisitas = [];

let mapasOcupados = {}; 
let marcadoresMicroMap = {}; 

export function refrescarEstilosMapa() {
    if(!window.mapaGlobal || !window.miUsuario) return;
    
    const rol = window.miUsuario.rol;
    const miNombre = window.miUsuario.nombre.trim().toLowerCase();

    window.mapaGlobal.data.setStyle((feature) => {
        const numTerritorio = feature.getProperty('territorio') || '-';
        const numManzana = feature.getProperty('numero') || '-';
        const etiqueta = `T${numTerritorio} - ${numManzana}`;
        
        let fillColor = feature.getProperty('fill') || '#6200EE';
        let strokeColor = '#444444';
        let strokeWeight = 1;
        let fillOpacity = 0.35;

        const asignadoA = mapasOcupados[etiqueta];
        const estaOcupado = asignadoA !== undefined;
        const esMio = estaOcupado && asignadoA.trim().toLowerCase() === miNombre;
        const puedeVerBloqueo = (rol === "siervo" || rol === "ayudante" || rol === "conductor");

        if (window.modoRegistroActivo && window.manzanasSeleccionadas.has(etiqueta)) {
            fillColor = '#6200EE'; fillOpacity = 0.7; strokeColor = 'white'; strokeWeight = 3;
        } else if (esMio) {
            fillColor = '#4CAF50'; fillOpacity = 0.6; strokeColor = '#388E3C'; strokeWeight = 3;
        } else if (estaOcupado && puedeVerBloqueo) {
            fillColor = '#424242'; fillOpacity = 0.75; strokeColor = 'black'; strokeWeight = 2;
        }

        return { fillColor, strokeColor, strokeWeight, fillOpacity };
    });

    for (const [etiqueta, marker] of Object.entries(marcadoresMicroMap)) {
        const asignadoA = mapasOcupados[etiqueta];
        const estaOcupado = asignadoA !== undefined;
        const esMio = estaOcupado && asignadoA.trim().toLowerCase() === miNombre;

        let textoMostrar = etiqueta;
        
        if (esMio) {
            textoMostrar = `⭐ ${etiqueta}`; 
        } else if (estaOcupado && (rol === "siervo" || rol === "ayudante")) {
            const soloNombre = asignadoA.split(' ')[0]; 
            textoMostrar = `👤 ${etiqueta} (${soloNombre})`; 
        } else if (estaOcupado && rol === "conductor") {
            textoMostrar = `🔒 ${etiqueta}`; 
        }

        marker.setLabel({ text: textoMostrar, color: 'black', fontWeight: '900', fontSize: '14px', className: 'map-label-micro' });
    }
}

function obtenerColorPin(estado) {
    let color = '#E65100'; 
    if (estado === 'Nueva') color = '#0288D1'; if (estado === 'Ausente') color = '#D32F2F'; 
    if (estado === 'Revisita') color = '#388E3C'; if (estado === 'Estudio') color = '#FBC02D'; 
    if (estado === 'No visitar') color = '#7B1FA2'; 
    return { path: google.maps.SymbolPath.CIRCLE, fillColor: color, fillOpacity: 1, strokeColor: 'white', strokeWeight: 2, scale: 8 };
}

// ==========================================
// MOTOR DE BÚSQUEDA INTELIGENTE (FUZZY SEARCH M3)
// ==========================================
function normalizarTexto(texto) {
    if (!texto) return "";
    return texto.toString().toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Arranca tildes
        .replace(/v/g, "b"); // Iguala V y B
}

function configurarAutocomplete(inputId, listId, opciones) {
    const input = document.getElementById(inputId);
    const list = document.getElementById(listId);
    if (!input || !list) return;

    input.addEventListener('focus', () => renderList(input.value));
    input.addEventListener('input', (e) => renderList(e.target.value));

    document.addEventListener('click', (e) => {
        if (e.target !== input && !list.contains(e.target)) list.style.display = 'none';
    });

    function renderList(query) {
        list.innerHTML = '';
        const queryWords = normalizarTexto(query).trim().split(/\s+/);
        
        const filtrados = opciones.filter(opc => {
            const opcNorm = normalizarTexto(opc);
            return queryWords.every(word => opcNorm.includes(word));
        });
        
        if (filtrados.length === 0) {
            list.style.display = 'none';
            return;
        }

        filtrados.forEach(opc => {
            const item = document.createElement('div');
            item.className = 'autocomplete-item';
            item.textContent = opc;
            item.onmousedown = (e) => { 
                e.preventDefault(); 
                input.value = opc;
                list.style.display = 'none';
            };
            list.appendChild(item);
        });
        list.style.display = 'block';
    }
}

let masterPubs = [];
let masterVids = [];

async function cargarListasMinisterio() {
    try {
        const docSnap = await getDoc(doc(db, "configuracion", "ministerio"));
        if (docSnap.exists()) {
            masterPubs = docSnap.data().publicaciones || [];
            masterVids = docSnap.data().videos || [];
            
            configurarAutocomplete('ficha-publi', 'lista-pubs', masterPubs);
            configurarAutocomplete('ficha-video', 'lista-vids', masterVids);
        }
    } catch (error) { console.error("Error al cargar listas:", error); }
}

export async function inicializarMapaYVisitas() {
    cargarListasMinisterio();

    const gestionRef = collection(db, "congregaciones", window.miUsuario.congregacionId, "gestion_mapas");
    onSnapshot(gestionRef, (snapshot) => {
        mapasOcupados = {};
        snapshot.forEach(doc => {
            const data = doc.data();
            if (!data.estaDisponible) mapasOcupados[doc.id] = data.asignadoA;
        });
        refrescarEstilosMapa();
    });

    const qVisitas = query(collection(db, "usuarios", window.miUsuario.email, "mis_visitas"), where("congregacionId", "==", window.miUsuario.congregacionId));
    onSnapshot(qVisitas, (snapshot) => {
        todasLasVisitas = [];
        snapshot.forEach((doc) => { todasLasVisitas.push({ id: doc.id, ...doc.data() }); });
        todasLasVisitas.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        renderizarVisitas();
    });

    document.querySelectorAll('.filtro-chip').forEach(chip => {
        chip.addEventListener('click', (e) => {
            document.querySelectorAll('.filtro-chip').forEach(c => c.classList.remove('active')); 
            e.target.classList.add('active'); filtroActual = e.target.getAttribute('data-filtro'); renderizarVisitas();
        });
    });

    const btnCerrar = document.getElementById('btn-cerrar-ficha');
    if (btnCerrar) {
        btnCerrar.onclick = () => { document.getElementById('ficha-modal').style.display = 'none'; };
    }

    const btnGuardar = document.getElementById('btn-guardar-ficha');
    if (btnGuardar) {
        btnGuardar.onclick = async () => {
            const vId = window.miUsuario.visitaActivaId; 
            if (!vId) return;

            const gn = (id) => document.getElementById(id) ? document.getElementById(id).value.trim() : '';
            
            const nuevoNombre = gn('ficha-nombre') || 'Nueva';
            const nuevoApellido = gn('ficha-apellido') || 'Visita';
            const nuevaDireccion = gn('ficha-direccion');
            const nuevoEstado = gn('ficha-estado');
            
            const nuevaNotaHoy = gn('ficha-notas');
            const publicacion = gn('ficha-publi');
            const video = gn('ficha-video');
            const proximoPaso = gn('ficha-proximo');

            const hayNovedades = nuevaNotaHoy || publicacion || video || proximoPaso;

            if (hayNovedades) {
                const detallesDeEstaVisita = [];
                if (nuevaNotaHoy) detallesDeEstaVisita.push(nuevaNotaHoy);
                if (publicacion) detallesDeEstaVisita.push(`📚 Publicación: ${publicacion}`);
                if (video) detallesDeEstaVisita.push(`🎬 Video: ${video}`);
                if (proximoPaso) detallesDeEstaVisita.push(`➔ Próxima visita: ${proximoPaso}`);

                if (detallesDeEstaVisita.length > 0) {
                    const fechaHoy = formatearFechaHoy();
                    const textoCompletoHistorial = detallesDeEstaVisita.join('\n');
                    
                    const yaExiste = window.listaNotasActuales.length > 0 && window.listaNotasActuales[0].texto === textoCompletoHistorial;
                    
                    if (!yaExiste) {
                        window.listaNotasActuales.unshift({
                            id: (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString(),
                            fecha: fechaHoy,
                            texto: textoCompletoHistorial
                        });
                    }
                }
            }

            const historialEmpaquetado = empaquetarNotasHistorial(window.listaNotasActuales);

            const visitaActualizada = {
                nombre: nuevoNombre,
                apellido: nuevoApellido,
                direccion: nuevaDireccion,
                estado: nuevoEstado,
                notas: historialEmpaquetado,
                territorio: document.getElementById('ficha-terr').innerText,
                poligono: document.getElementById('ficha-manz').innerText,
                temaConversacion: "",
                proximoPaso: "",
                publicacionDejada: "",
                videoVisto: "",
                latitud: window.miUsuario.tempLat,
                longitud: window.miUsuario.tempLng,
                congregacionId: window.miUsuario.congregacionId,
                timestamp: Date.now()
            };

            try {
                await setDoc(doc(db, "usuarios", window.miUsuario.email, "mis_visitas", vId), visitaActualizada, { merge: true });
                document.getElementById('ficha-modal').style.display = 'none';
            } catch (error) {
                alert("Error al guardar: " + error.message);
            }
        };
    }

    const btnAgendar = document.getElementById('btn-agendar-visita') || document.querySelector('.btn-agendar');
    if (btnAgendar) {
        btnAgendar.onclick = (e) => {
            e.preventDefault(); 

            const gn = (id) => document.getElementById(id) ? document.getElementById(id).value.trim() : '';
            
            const nombre = gn('ficha-nombre');
            const apellido = gn('ficha-apellido');
            const direccion = gn('ficha-direccion');
            
            const nuevaNotaHoy = gn('ficha-notas');
            const publicacion = gn('ficha-publi');
            const video = gn('ficha-video');
            const proximoPaso = gn('ficha-proximo');

            let tituloEvento = "Revisita";
            if (nombre && nombre !== "Nueva") {
                tituloEvento = `Revisita: ${nombre} ${apellido}`.trim();
            }

            const descExtras = [];
            if (nuevaNotaHoy) descExtras.push(`Última charla: ${nuevaNotaHoy}`);
            if (publicacion) descExtras.push(`Publicación que dejé: ${publicacion}`);
            if (video) descExtras.push(`Video que vimos: ${video}`);
            if (proximoPaso) descExtras.push(`Quedamos en: ${proximoPaso}`);

            const descripcion = descExtras.join("\n\n");

            const urlCalendario = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(tituloEvento)}&details=${encodeURIComponent(descripcion)}&location=${encodeURIComponent(direccion)}`;
            
            const linkFantasma = document.createElement('a');
            linkFantasma.href = urlCalendario;
            linkFantasma.target = '_blank';
            linkFantasma.rel = 'noopener noreferrer';
            document.body.appendChild(linkFantasma);
            linkFantasma.click();
            linkFantasma.remove(); 
        };
    }

    const llaveSnap = await getDoc(doc(db, "configuracion", "ApiKeys"));
    if (llaveSnap.exists()) {
        const scriptMapa = document.createElement('script');
        scriptMapa.src = `https://maps.googleapis.com/maps/api/js?key=${llaveSnap.data().ApiMapsWeb}`;
        scriptMapa.async = true;
        
        scriptMapa.onload = async () => {
            const mapEl = document.getElementById("map");
            if (!mapEl) return; 
            window.mapaGlobal = new google.maps.Map(mapEl, { disableDefaultUI: true, zoomControl: false, mapTypeControl: false, streetViewControl: false });
            refrescarEstilosMapa();

            window.mapaGlobal.data.addListener('click', (event) => {
                const numManzana = event.feature.getProperty('numero') || '-'; 
                const numTerritorio = event.feature.getProperty('territorio') || '-';
                const etiqueta = `T${numTerritorio} - ${numManzana}`;

                if (window.modoRegistroActivo) {
                    if (window.manzanasSeleccionadas.has(etiqueta)) window.manzanasSeleccionadas.delete(etiqueta); else window.manzanasSeleccionadas.add(etiqueta);
                    document.getElementById('contador-manzanas').innerText = window.manzanasSeleccionadas.size; refrescarEstilosMapa(); 
                } else {
                    abrirFichaVisita({ id: Date.now().toString(), nombre: 'Nueva', apellido: 'Visita', territorio: numTerritorio, poligono: numManzana, latitud: event.latLng.lat(), longitud: event.latLng.lng(), estado: 'Nueva', direccion: '', notas: '' });
                }
            });

            try {
                const congIdLimpio = window.miUsuario.congregacionId.toString().trim();
                const snapshotReal = await getDocs(collection(db, "congregaciones", congIdLimpio, "territorios")); 
                const bounds = new google.maps.LatLngBounds();
                const centrosMacro = {};

                for (let documento of snapshotReal.docs) {
                    try {
                        const jsonString = documento.data().geojson;
                        if (!jsonString) continue;
                        window.mapaGlobal.data.addGeoJson(JSON.parse(jsonString));
                    } catch(e){}
                }
                
                window.mapaGlobal.data.forEach(feature => {
                    const fBounds = new google.maps.LatLngBounds(); feature.getGeometry().forEachLatLng(p => { bounds.extend(p); fBounds.extend(p); });
                    const numManzana = feature.getProperty('numero') || ''; const numTerritorio = feature.getProperty('territorio') || '';
                    if (!numManzana || numManzana.toLowerCase() === 'plaza') return;
                    
                    const textE = numTerritorio ? `T${numTerritorio} - ${numManzana}` : numManzana;
                    const mMicro = new google.maps.Marker({ position: fBounds.getCenter(), label: { text: textE, color: 'black', fontWeight: '900', fontSize: '14px', className: 'map-label-micro' }, icon: { url: "", scaledSize: new google.maps.Size(0,0) } });
                    
                    marcadoresMicroMap[textE] = mMicro; 

                    if (numTerritorio) {
                        if (!centrosMacro[numTerritorio]) centrosMacro[numTerritorio] = { latSum: 0, lngSum: 0, count: 0 };
                        centrosMacro[numTerritorio].latSum += fBounds.getCenter().lat(); centrosMacro[numTerritorio].lngSum += fBounds.getCenter().lng(); centrosMacro[numTerritorio].count++;
                    }
                });

                const marcadoresMacro = [];
                Object.keys(centrosMacro).forEach(t => {
                    const d = centrosMacro[t];
                    marcadoresMacro.push(new google.maps.Marker({ position: { lat: d.latSum / d.count, lng: d.lngSum / d.count }, label: { text: t, color: 'black', fontWeight: '900', fontSize: '34px', className: 'map-label-macro' }, icon: { url: "", scaledSize: new google.maps.Size(0,0) } }));
                });

                window.mapaGlobal.addListener('zoom_changed', () => {
                    const z = window.mapaGlobal.getZoom();
                    if (z >= 15.5) { 
                        Object.values(marcadoresMicroMap).forEach(m => m.setMap(window.mapaGlobal)); 
                        marcadoresMacro.forEach(m => m.setMap(null)); 
                    } 
                    else if (z >= 13) { 
                        Object.values(marcadoresMicroMap).forEach(m => m.setMap(null)); 
                        marcadoresMacro.forEach(m => m.setMap(window.mapaGlobal)); 
                    } 
                    else { 
                        Object.values(marcadoresMicroMap).forEach(m => m.setMap(null)); 
                        marcadoresMacro.forEach(m => m.setMap(null)); 
                    }
                });

                if (snapshotReal.size > 0) { 
                    window.mapaGlobal.fitBounds(bounds); 
                    google.maps.event.trigger(window.mapaGlobal, 'zoom_changed'); 
                }
            } catch (error) {
                console.error("Escudo activado: ", error);
            }

            renderizarVisitas();
            refrescarEstilosMapa(); 
        };
        document.head.appendChild(scriptMapa);
    }
}

function renderizarVisitas() {
    const visitasContainer = document.getElementById('lista-visitas-container');
    if (!visitasContainer) return; visitasContainer.innerHTML = ''; 
    window.pinesVisitas.forEach(pin => pin.setMap(null)); window.pinesVisitas = [];

    const visitasFiltradas = todasLasVisitas.filter(v => (filtroActual === 'Todos' || v.estado === filtroActual));
    if (visitasFiltradas.length === 0) { visitasContainer.innerHTML = `<p style="color: var(--text-muted); text-align: center; margin-top: 40px;">No hay visitas registradas.</p>`; return; }

    visitasFiltradas.forEach(visita => {
        if (window.mapaGlobal && visita.latitud && visita.longitud) {
            const pin = new google.maps.Marker({ position: { lat: visita.latitud, lng: visita.longitud }, map: window.mapaGlobal, icon: obtenerColorPin(visita.estado) });
            pin.addListener('click', () => { if(!window.modoRegistroActivo) abrirFichaVisita(visita); });
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

        const card = document.createElement('div'); card.className = 'visita-card';
        card.innerHTML = `<div class="visita-color" style="background-color: ${colorPinLista};"></div><div class="visita-info" style="flex: 1;"><h3>${nombreMostrar}</h3><p>📍 T${visita.territorio} - ${visita.poligono} | 📅 ${fecha}</p></div>`;
        card.onclick = () => { abrirFichaVisita(visita); }; visitasContainer.appendChild(card);
    });
}

function parsearNotasHistorial(notesRaw) {
    if (!notesRaw || notesRaw.trim() === '') return [];
    
    if (notesRaw.trim().startsWith("[")) {
        try { return JSON.parse(notesRaw); } catch(e) {}
    }

    try {
        return notesRaw.split("|||").map(str => {
            const parts = str.split("&&&");
            if (parts.length === 3) {
                return { id: parts[0], fecha: parts[1], texto: parts[2].replace(/\/\/\//g, "\n") };
            }
            return null;
        }).filter(Boolean);
    } catch(e) {
        return [{ id: Date.now().toString(), fecha: "Historial Previo", texto: notesRaw }];
    }
}

function empaquetarNotasHistorial(listaNotas) {
    if (!listaNotas || listaNotas.length === 0) return "";
    return listaNotas.map(nota => `${nota.id}&&&${nota.fecha}&&&${nota.texto.replace(/\n/g, "///")}`).join("|||");
}

function formatearFechaHoy() {
    const meses = ["ene.","feb.","mar.","abr.","may.","jun.","jul.","ago.","sep.","oct.","nov.","dic."];
    const d = new Date();
    const dia = d.getDate().toString().padStart(2, '0');
    const mes = meses[d.getMonth()];
    const anio = d.getFullYear();
    const hora = d.getHours().toString().padStart(2, '0');
    const min = d.getMinutes().toString().padStart(2, '0');
    return `${dia} ${mes} ${anio} - ${hora}:${min}`; 
}

function abrirFichaVisita(visita) {
    window.miUsuario.visitaActivaId = visita.id;
    window.miUsuario.tempLat = visita.latitud || 0; 
    window.miUsuario.tempLng = visita.longitud || 0;

    const gn = (id) => document.getElementById(id);
    if(gn('ficha-nombre')) gn('ficha-nombre').value = visita.nombre !== 'Nueva' ? visita.nombre : '';
    if(gn('ficha-apellido')) gn('ficha-apellido').value = visita.apellido !== 'Visita' ? visita.apellido : '';
    if(gn('ficha-terr')) gn('ficha-terr').innerText = visita.territorio || '-'; 
    if(gn('ficha-manz')) gn('ficha-manz').innerText = visita.poligono || '-';
    if(gn('ficha-estado')) gn('ficha-estado').value = visita.estado || 'Nueva'; 
    if(gn('ficha-direccion')) gn('ficha-direccion').value = visita.direccion || '';
    
    if(gn('ficha-publi')) gn('ficha-publi').value = ''; 
    if(gn('ficha-video')) gn('ficha-video').value = '';
    if(gn('ficha-proximo')) gn('ficha-proximo').value = ''; 
    if(gn('ficha-notas')) gn('ficha-notas').value = ''; 

    const titulo = document.getElementById('ficha-titulo');
    if (titulo) {
        titulo.innerText = visita.nombre === 'Nueva' ? "Registrar Visita" : `Ficha de ${visita.nombre}`;
    }

    window.listaNotasActuales = parsearNotasHistorial(visita.notas || "");

    // 🔥 ACÁ LE DAMOS VIDA AL BOTÓN DEL GPS (FORZADO DESDE JS PARA VENCER LA CACHÉ) 🔥
    const btnGps = document.getElementById('btn-ir-gps');
    if (btnGps) {
        // Machacamos el estilo viejo inyectando el CSS directamente en el elemento
        btnGps.style.cssText = "background-color: #d8bcff !important; border: none !important; border-radius: 16px !important; width: 54px !important; height: 54px !important; display: flex !important; align-items: center !important; justify-content: center !important; cursor: pointer !important; box-shadow: 0 2px 6px rgba(0,0,0,0.15) !important; transition: transform 0.15s ease !important; flex-shrink: 0 !important; margin-bottom: 15px !important;";
        
        // Le inyectamos el ícono oficial de navegación de Android (Rombo con flecha)
        btnGps.innerHTML = `<svg viewBox="0 0 24 24" fill="#311B92" width="28px" height="28px" style="pointer-events: none;"><path d="M21.71 11.29l-9-9c-.39-.39-1.02-.39-1.41 0l-9 9c-.39.39-.39 1.02 0 1.41l9 9c.39.39 1.02.39 1.41 0l9-9c.39-.38.39-1.01 0-1.41zM14 14.5V12h-4v3H8v-4c0-.55.45-1 1-1h5V7.5l3.5 3.5-3.5 3.5z"/></svg>`;
        
        // Efecto físico de hundimiento
        btnGps.onmousedown = () => btnGps.style.transform = 'scale(0.92)';
        btnGps.onmouseup = () => btnGps.style.transform = 'scale(1)';
        btnGps.onmouseleave = () => btnGps.style.transform = 'scale(1)';

        // La acción de abrir el navegador
        btnGps.onclick = (e) => {
            e.preventDefault();
            abrirNavegadorGPS(visita.latitud, visita.longitud); 
        };
    }

    function renderizarHistorial() {
        const container = document.getElementById('historial-conversaciones-container');
        container.innerHTML = '';
        
        if (window.listaNotasActuales.length === 0) {
            container.innerHTML = `<p style="color: var(--text-muted); font-size: 14px;">No hay conversaciones previas registradas.</p>`;
            return;
        }

        window.listaNotasActuales.forEach(nota => {
            const card = document.createElement('div');
            card.className = 'chat-bubble';
            card.style.position = 'relative';

            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 8px;">
                    <div class="chat-meta">${nota.fecha}</div>
                    
                    <div style="display: flex; gap: 8px;">
                        <button class="btn-editar-nota" style="background: rgba(203, 164, 255, 0.1); border: none; color: var(--primary-color, #CBA4FF); width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: background 0.2s; font-size: 13px;">
                            ✏️
                        </button>
                        <button class="btn-borrar-nota" style="background: rgba(229, 57, 53, 0.1); border: none; color: var(--error-text, #E53935); width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: background 0.2s; font-size: 13px;">
                            🗑️
                        </button>
                    </div>
                </div>
                <div class="chat-text" style="line-height: 1.4;">${nota.texto}</div>
            `;
            
            // ==========================================
            // LÓGICA ELIMINAR NOTA (Con Modal M3)
            // ==========================================
            card.querySelector('.btn-borrar-nota').onclick = () => {
                mostrarModalConfirmacionNota(
                    "¿Eliminar conversación?", 
                    "Esta acción no se puede deshacer y borrará la nota del historial.", 
                    "Sí, eliminar", 
                    "#E53935", 
                    () => {
                        window.listaNotasActuales = window.listaNotasActuales.filter(n => n.id !== nota.id);
                        renderizarHistorial(); 
                        
                        const visitaActualizada = { notas: empaquetarNotasHistorial(window.listaNotasActuales) };
                        setDoc(doc(db, "usuarios", window.miUsuario.email, "mis_visitas", visita.id), visitaActualizada, { merge: true });
                    }
                );
            };

            // ==========================================
            // LÓGICA EDITAR NOTA (Con Modal M3)
            // ==========================================
            card.querySelector('.btn-editar-nota').onclick = () => {
                mostrarModalEditarNota(nota.texto, (nuevoTexto) => {
                    if (nuevoTexto === nota.texto) return; 
                    
                    window.listaNotasActuales = window.listaNotasActuales.map(n => {
                        if (n.id === nota.id) return { ...n, texto: nuevoTexto };
                        return n;
                    });
                    
                    renderizarHistorial(); 
                    
                    const visitaActualizada = { notas: empaquetarNotasHistorial(window.listaNotasActuales) };
                    setDoc(doc(db, "usuarios", window.miUsuario.email, "mis_visitas", visita.id), visitaActualizada, { merge: true });
                });
            };

            container.appendChild(card);
        });
    }
    
    renderizarHistorial();

    if (gn('ficha-modal')) gn('ficha-modal').style.display = 'flex';
}


    window.listaNotasActuales = parsearNotasHistorial(visita.notas || "");

    // 🔥 ACÁ LE DAMOS VIDA AL BOTÓN DEL GPS 🔥
    const btnGps = document.getElementById('btn-ir-gps');
    if (btnGps) {
        btnGps.onclick = (e) => {
            e.preventDefault();
            abrirNavegadorGPS(visita.latitud, visita.longitud); 
        };
    }

    function renderizarHistorial() {
        const container = document.getElementById('historial-conversaciones-container');
        container.innerHTML = '';
        
        if (window.listaNotasActuales.length === 0) {
            container.innerHTML = `<p style="color: var(--text-muted); font-size: 14px;">No hay conversaciones previas registradas.</p>`;
            return;
        }

        window.listaNotasActuales.forEach(nota => {
            const card = document.createElement('div');
            card.className = 'chat-bubble';
            card.style.position = 'relative';

            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 8px;">
                    <div class="chat-meta">${nota.fecha}</div>
                    
                    <div style="display: flex; gap: 8px;">
                        <button class="btn-editar-nota" style="background: rgba(203, 164, 255, 0.1); border: none; color: var(--primary-color, #CBA4FF); width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: background 0.2s; font-size: 13px;">
                            ✏️
                        </button>
                        <button class="btn-borrar-nota" style="background: rgba(229, 57, 53, 0.1); border: none; color: var(--error-text, #E53935); width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: background 0.2s; font-size: 13px;">
                            🗑️
                        </button>
                    </div>
                </div>
                <div class="chat-text" style="line-height: 1.4;">${nota.texto}</div>
            `;
            
            // ==========================================
            // LÓGICA ELIMINAR NOTA (Con Modal M3)
            // ==========================================
            card.querySelector('.btn-borrar-nota').onclick = () => {
                mostrarModalConfirmacionNota(
                    "¿Eliminar conversación?", 
                    "Esta acción no se puede deshacer y borrará la nota del historial.", 
                    "Sí, eliminar", 
                    "#E53935", 
                    () => {
                        window.listaNotasActuales = window.listaNotasActuales.filter(n => n.id !== nota.id);
                        renderizarHistorial(); 
                        
                        const visitaActualizada = { notas: empaquetarNotasHistorial(window.listaNotasActuales) };
                        setDoc(doc(db, "usuarios", window.miUsuario.email, "mis_visitas", visita.id), visitaActualizada, { merge: true });
                    }
                );
            };

            // ==========================================
            // LÓGICA EDITAR NOTA (Con Modal M3)
            // ==========================================
            card.querySelector('.btn-editar-nota').onclick = () => {
                mostrarModalEditarNota(nota.texto, (nuevoTexto) => {
                    if (nuevoTexto === nota.texto) return; 
                    
                    window.listaNotasActuales = window.listaNotasActuales.map(n => {
                        if (n.id === nota.id) return { ...n, texto: nuevoTexto };
                        return n;
                    });
                    
                    renderizarHistorial(); 
                    
                    const visitaActualizada = { notas: empaquetarNotasHistorial(window.listaNotasActuales) };
                    setDoc(doc(db, "usuarios", window.miUsuario.email, "mis_visitas", visita.id), visitaActualizada, { merge: true });
                });
            };

            container.appendChild(card);
        });
    }
    
    renderizarHistorial();

    if (gn('ficha-modal')) gn('ficha-modal').style.display = 'flex';
}

// ========================================================
// MOTORES DE MODALES EXCLUSIVOS PARA LAS NOTAS
// ========================================================
function mostrarModalEditarNota(textoActual, onGuardar) {
    let m = document.createElement('div');
    m.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.75); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); z-index: 10005; display: flex; align-items: center; justify-content: center; padding: 20px; box-sizing: border-box; font-family: sans-serif;';
    
    m.innerHTML = `
        <div style="background: var(--surface-color, #25242C); width: 100%; max-width: 360px; border-radius: 24px; padding: 24px; box-shadow: 0 16px 40px rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.08);">
            <h3 style="color: var(--text-color, white); margin: 0 0 16px 0; font-size: 18px;">Editar Conversación</h3>
            <textarea id="input-edit-nota" style="width: 100%; height: 140px; background: var(--bg-color, #1E1D24); border: 1px solid rgba(255,255,255,0.1); color: var(--text-color, white); padding: 14px; border-radius: 12px; margin-bottom: 24px; font-size: 15px; box-sizing: border-box; outline: none; transition: border 0.2s; resize: none;">${textoActual}</textarea>
            <div style="display: flex; justify-content: flex-end; gap: 12px;">
                <button id="btn-cancelar-edit-nota" style="background: transparent; border: none; color: var(--primary-color, #CBA4FF); font-weight: bold; font-size: 15px; padding: 10px 16px; border-radius: 10px; cursor: pointer;">Cancelar</button>
                <button id="btn-guardar-edit-nota" style="background: var(--primary-color, #CBA4FF); color: #4A148C; border: none; font-weight: bold; font-size: 15px; padding: 10px 20px; border-radius: 10px; cursor: pointer;">Guardar</button>
            </div>
        </div>
    `;
    document.body.appendChild(m);
    
    const inputNota = document.getElementById('input-edit-nota');
    inputNota.addEventListener('focus', (e) => e.target.style.borderColor = 'var(--primary-color, #CBA4FF)');
    inputNota.addEventListener('blur', (e) => e.target.style.borderColor = 'rgba(255,255,255,0.1)');

    document.getElementById('btn-cancelar-edit-nota').onclick = () => m.remove();
    document.getElementById('btn-guardar-edit-nota').onclick = () => {
        const nTexto = inputNota.value.trim();
        if(!nTexto) return alert("La nota no puede quedar vacía.");
        const btnGuardar = document.getElementById('btn-guardar-edit-nota');
        btnGuardar.innerText = "Guardando..."; btnGuardar.disabled = true;
        onGuardar(nTexto); m.remove();
    };
}

function mostrarModalConfirmacionNota(titulo, mensaje, txtConfirmar, colorConfirmar, onConfirm) {
    let m = document.createElement('div');
    m.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.75); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); z-index: 10005; display: flex; align-items: center; justify-content: center; padding: 20px; box-sizing: border-box; font-family: sans-serif;';
    
    m.innerHTML = `
        <div style="background: var(--surface-color, #25242C); width: 100%; max-width: 320px; border-radius: 24px; padding: 24px; box-shadow: 0 16px 40px rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.08); text-align: center;">
            <div style="font-size: 36px; margin-bottom: 16px;">⚠️</div>
            <h3 style="color: var(--text-color, white); margin: 0 0 12px 0; font-size: 18px;">${titulo}</h3>
            <p style="color: var(--text-muted, #A0A0A0); font-size: 14px; margin: 0 0 28px 0; line-height: 1.5;">${mensaje}</p>
            <div style="display: flex; flex-direction: column; gap: 12px;">
                <button id="btn-accion-confirm-nota" style="background: ${colorConfirmar}; color: white; border: none; font-weight: bold; padding: 14px; border-radius: 12px; cursor: pointer; font-size: 15px;">${txtConfirmar}</button>
                <button id="btn-cancelar-confirm-nota" style="background: transparent; border: 1px solid rgba(255,255,255,0.15); color: var(--text-color, white); font-weight: bold; padding: 14px; border-radius: 12px; cursor: pointer; font-size: 15px;">Cancelar</button>
            </div>
        </div>
    `;
    document.body.appendChild(m);
    document.getElementById('btn-cancelar-confirm-nota').onclick = () => m.remove();
    document.getElementById('btn-accion-confirm-nota').onclick = () => { m.remove(); onConfirm(); };
}

// ========================================================
// MOTOR DE NAVEGACIÓN GPS (ESTILO BOTTOM SHEET M3)
// ========================================================
function abrirNavegadorGPS(lat, lng) {
    if (!lat || !lng) return alert("No se encontraron las coordenadas exactas de esta visita. Asegúrate de haber tocado el mapa.");

    let m = document.createElement('div');
    m.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.75); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); z-index: 10020; display: flex; align-items: flex-end; justify-content: center; font-family: sans-serif;';
    
    m.innerHTML = `
        <div style="background: var(--surface-color, #25242C); width: 100%; max-width: 480px; border-radius: 28px 28px 0 0; padding: 24px 24px 36px 24px; box-shadow: 0 -8px 40px rgba(0,0,0,0.6); border-top: 1px solid rgba(255,255,255,0.08); animation: slideUpNav 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);">
            <div style="width: 40px; height: 5px; background: rgba(255,255,255,0.2); border-radius: 3px; margin: 0 auto 24px auto;"></div>
            <h3 style="color: var(--text-color, white); margin: 0 0 20px 0; font-size: 20px; text-align: center;">¿Cómo quieres llegar?</h3>
            
            <div style="display: flex; flex-direction: column; gap: 12px;">
                <button id="btn-nav-maps" style="background: var(--bg-color, #1E1D24); border: 1px solid rgba(255,255,255,0.08); color: var(--text-color, white); padding: 16px; border-radius: 16px; font-size: 16px; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 16px; transition: background 0.2s;">
                    <span style="font-size: 24px;">🗺️</span> Google Maps
                </button>
                <button id="btn-nav-waze" style="background: var(--bg-color, #1E1D24); border: 1px solid rgba(255,255,255,0.08); color: var(--text-color, white); padding: 16px; border-radius: 16px; font-size: 16px; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 16px; transition: background 0.2s;">
                    <span style="font-size: 24px;">🚗</span> Waze
                </button>
                <button id="btn-nav-apple" style="background: var(--bg-color, #1E1D24); border: 1px solid rgba(255,255,255,0.08); color: var(--text-color, white); padding: 16px; border-radius: 16px; font-size: 16px; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 16px; transition: background 0.2s;">
                    <span style="font-size: 24px;">🍎</span> Apple Maps
                </button>
            </div>
            <button id="btn-cancelar-nav" style="width: 100%; background: transparent; border: none; color: var(--text-muted, #A0A0A0); font-weight: bold; font-size: 16px; padding: 20px 16px 0 16px; margin-top: 8px; cursor: pointer;">Cancelar</button>
        </div>
    `;
    
    if (!document.getElementById('anim-slide-up-nav')) {
        const style = document.createElement('style');
        style.id = 'anim-slide-up-nav';
        style.innerHTML = `@keyframes slideUpNav { from { transform: translateY(100%); } to { transform: translateY(0); } }`;
        document.head.appendChild(style);
    }

    document.body.appendChild(m);

    const isApple = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (!isApple) document.getElementById('btn-nav-apple').style.display = 'none';

    document.getElementById('btn-cancelar-nav').onclick = () => m.remove();
    
document.getElementById('btn-nav-maps').onclick = () => {
        // Enlace oficial optimizado para activar la app de Google Maps en Android
        window.open(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`, '_blank');
        m.remove();
    };

    document.getElementById('btn-nav-waze').onclick = () => {
        window.open(`https://waze.com/ul?ll=${lat},${lng}&navigate=yes`, '_blank');
        m.remove();
    };

    document.getElementById('btn-nav-apple').onclick = () => {
        window.open(`http://maps.apple.com/?daddr=${lat},${lng}`, '_blank');
        m.remove();
    };
}