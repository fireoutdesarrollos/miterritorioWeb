// ==========================================
// ARCHIVO: map-service.js (CON PINES ROJOS EXACTOS PARA CONDUCTORES)
// ==========================================
import { collection, getDocs, doc, getDoc, query, where, onSnapshot, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { db } from "./firebase-core.js";

window.mapaGlobal = null;
window.pinesVisitas = [];
let pinesAlertasGlobales = []; // 🔥 Nuevo: Array para los pines rojos de la congregación
let filtroActual = 'Todos';
let todasLasVisitas = [];
let alertasGlobalesData = []; // 🔥 Nuevo: Guarda la info cruda de las alertas

let mapasOcupados = {}; 
let marcadoresMicroMap = {}; 
let alertasNoVisitarPorManzana = {}; 
let ticketsActivosGlobales = new Set(); 

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
        const hayAlertaGlobal = alertasNoVisitarPorManzana[etiqueta];

        let textoMostrar = etiqueta;
        
        if (esMio) {
            textoMostrar = `⭐ ${etiqueta}`; 
        } else if (estaOcupado && (rol === "siervo" || rol === "ayudante")) {
            const soloNombre = asignadoA.split(' ')[0]; 
            textoMostrar = `👤 ${etiqueta} (${soloNombre})`; 
        } else if (estaOcupado && rol === "conductor") {
            textoMostrar = `🔒 ${etiqueta}`; 
        }

        if (hayAlertaGlobal && (rol === "conductor" || rol === "siervo" || rol === "ayudante")) {
             textoMostrar = `⛔ ${textoMostrar}`;
        }

        marker.setLabel({ text: textoMostrar, color: 'black', fontWeight: '900', fontSize: '14px', className: 'map-label-micro' });
    }
}

function obtenerColorPin(estado) {
    let color = '#E65100'; 
    if (estado === 'Nueva') color = '#0288D1'; 
    if (estado === 'Ausente') color = '#D32F2F'; 
    if (estado === 'Revisita') color = '#388E3C'; 
    if (estado === 'Estudio') color = '#FBC02D'; 
    if (estado === 'No visitar' || estado === 'Quitar de No Visitar') color = '#7B1FA2'; 
    if (estado === 'AlertaGlobal') color = '#B71C1C'; // 🔥 Nuevo: Rojo oscuro para alertas de conductores

    const svgMarker = encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="28" height="42">
            <path fill="${color}" stroke="white" stroke-width="2" d="M12 0C5.373 0 0 5.373 0 12c0 7.5 12 24 12 24s12-16.5 12-24c0-6.627-5.373-12-12-12zm0 17c-2.761 0-5-2.239-5-5s2.239-5 5-5 5 2.239 5 5-2.239 5-5 5z"/>
        </svg>
    `);

    return { 
        url: `data:image/svg+xml;charset=UTF-8,${svgMarker}`, 
        scaledSize: new google.maps.Size(28, 42),
        anchor: new google.maps.Point(14, 42)
    };
}

function normalizarTexto(texto) {
    if (!texto) return "";
    return texto.toString().toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") 
        .replace(/v/g, "b"); 
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

function limpiarPinesHuerfanos() {
    if (!todasLasVisitas || todasLasVisitas.length === 0) return;
    
    todasLasVisitas.forEach(async (v) => {
        if (v.estado === "No visitar" || v.estado === "Quitar de No Visitar") {
            const timeSinceCreation = Date.now() - (v.timestamp || 0);
            if (!ticketsActivosGlobales.has(v.id) && timeSinceCreation > 5000) {
                try {
                    await deleteDoc(doc(db, "usuarios", window.miUsuario.email, "mis_visitas", v.id));
                } catch(e) {}
            }
        }
    });
}

// 🔥 NUEVO: Dibuja los pines rojos exactos de las casas bloqueadas 🔥
function renderizarAlertasGlobales() {
    // 1. Limpiamos los pines viejos
    pinesAlertasGlobales.forEach(pin => pin.setMap(null));
    pinesAlertasGlobales = [];

    if (!window.mapaGlobal || !window.miUsuario) return;

    // 2. Solo los de la alta gerencia pueden ver estos pines
    const rol = window.miUsuario.rol;
    const puedeVerBloqueos = (rol === "siervo" || rol === "ayudante" || rol === "conductor");
    if (!puedeVerBloqueos) return;

    alertasGlobalesData.forEach(alerta => {
        // Solo dibujamos si el ticket guardó las coordenadas
        if (alerta.latitud && alerta.longitud) {
            
            // Filtro: Si la alerta la creé YO, ya estoy viendo mi pin morado personal, así que no pongo el rojo encima.
            if (alerta.publicadorEmail === window.miUsuario.email) return;

            const pinRojo = new google.maps.Marker({
                position: { lat: alerta.latitud, lng: alerta.longitud },
                map: window.mapaGlobal,
                icon: obtenerColorPin('AlertaGlobal'), // Rojo sangre
                zIndex: 9999 // Siempre por encima del resto
            });

            // Si el conductor toca el pin rojo, le avisa la dirección
            pinRojo.addListener('click', () => {
                if(!window.modoRegistroActivo && window.mostrarToastM3) {
                    window.mostrarToastM3(`⛔ Casa Bloqueada: ${alerta.direccion || 'Sin dirección'}`, "error");
                }
            });

            pinesAlertasGlobales.push(pinRojo);
        }
    });
}

export async function inicializarMapaYVisitas() {
    cargarListasMinisterio();
    inicializarBandejaSiervo(); 

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
        limpiarPinesHuerfanos();
        renderizarVisitas();
    });

    const qAlertasGlobales = collection(db, "congregaciones", window.miUsuario.congregacionId, "solicitudes_no_visitar");
    onSnapshot(qAlertasGlobales, (snapshot) => {
        alertasGlobalesData = [];
        alertasNoVisitarPorManzana = {};
        ticketsActivosGlobales.clear(); 

        snapshot.forEach(docSnap => {
            ticketsActivosGlobales.add(docSnap.id); 
            const data = docSnap.data();
            if (data.estado === "Aprobado") {
                alertasGlobalesData.push(data); // Guardamos la info cruda (incluyendo lat/lng)
                const etiqueta = `T${data.territorio} - ${data.poligono}`;
                alertasNoVisitarPorManzana[etiqueta] = true;
            }
        });
        
        limpiarPinesHuerfanos(); 
        refrescarEstilosMapa();
        renderizarAlertasGlobales(); // 🔥 Mandamos a dibujar los pines rojos
    });

    document.querySelectorAll('.filtro-chip').forEach(chip => {
        chip.addEventListener('click', (e) => {
            document.querySelectorAll('.filtro-chip').forEach(c => c.classList.remove('active')); 
            e.target.classList.add('active'); filtroActual = e.target.getAttribute('data-filtro'); renderizarVisitas();
        });
    });

    const btnCerrar = document.getElementById('btn-cerrar-ficha');
    if (btnCerrar) {
        btnCerrar.onclick = () => { 
            if (window.comprobarCambiosAntesDeSalir && window.comprobarCambiosAntesDeSalir()) {
                if(window.mostrarModalCambiosSinGuardar) {
                    window.mostrarModalCambiosSinGuardar(
                        () => { document.getElementById('btn-guardar-ficha').click(); }, 
                        () => { document.getElementById('ficha-modal').style.display = 'none'; } 
                    );
                }
            } else {
                document.getElementById('ficha-modal').style.display = 'none'; 
            }
        };
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
            const numTerritorio = document.getElementById('ficha-terr').innerText;
            const numManzana = document.getElementById('ficha-manz').innerText;

            const visitaActualizada = {
                nombre: nuevoNombre,
                apellido: nuevoApellido,
                direccion: nuevaDireccion,
                estado: nuevoEstado,
                notas: historialEmpaquetado,
                territorio: numTerritorio,
                poligono: numManzana,
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
                
                if (nuevoEstado === "No visitar") {
                    const ticketRef = doc(db, "congregaciones", window.miUsuario.congregacionId, "solicitudes_no_visitar", vId);
                    await setDoc(ticketRef, {
                        publicadorNombre: window.miUsuario.nombre,
                        publicadorEmail: window.miUsuario.email,
                        territorio: numTerritorio,
                        poligono: numManzana,
                        nombreVisita: nuevoNombre,
                        apellidoVisita: nuevoApellido,
                        direccion: nuevaDireccion,
                        motivo: nuevaNotaHoy || "Sin notas u observaciones especificadas.",
                        estado: "Pendiente",
                        latitud: window.miUsuario.tempLat, // 🔥 SE ENVIAN LAS COORDENADAS AL SIERVO
                        longitud: window.miUsuario.tempLng,
                        timestamp: Date.now()
                    }, { merge: true });
                    
                    if(window.mostrarToastM3) window.mostrarToastM3("Reporte de bloqueo enviado al Siervo.", "success");
                
                } else if (nuevoEstado === "Quitar de No Visitar") {
                    const ticketRef = doc(db, "congregaciones", window.miUsuario.congregacionId, "solicitudes_no_visitar", vId);
                    await setDoc(ticketRef, {
                        publicadorNombre: window.miUsuario.nombre,
                        publicadorEmail: window.miUsuario.email,
                        territorio: numTerritorio,
                        poligono: numManzana,
                        nombreVisita: nuevoNombre,
                        apellidoVisita: nuevoApellido,
                        direccion: nuevaDireccion,
                        motivo: nuevaNotaHoy || "El publicador solicita quitar este bloqueo.",
                        estado: "Pendiente_Eliminar", 
                        latitud: window.miUsuario.tempLat, // 🔥 POR SI ACASO
                        longitud: window.miUsuario.tempLng,
                        timestamp: Date.now()
                    }, { merge: true });
                    
                    if(window.mostrarToastM3) window.mostrarToastM3("Solicitud de desbloqueo enviada.", "success");
                } else {
                    if(window.mostrarToastM3) window.mostrarToastM3("Visita guardada correctamente.", "success");
                }

                document.getElementById('ficha-modal').style.display = 'none';
            } catch (error) {
                if(window.mostrarToastM3) window.mostrarToastM3("Error al guardar: " + error.message, "error");
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
            linkFantasma.href = urlCalendario; linkFantasma.target = '_blank'; linkFantasma.rel = 'noopener noreferrer';
            document.body.appendChild(linkFantasma); linkFantasma.click(); linkFantasma.remove(); 
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
            } catch (error) { console.error("Escudo activado: ", error); }

            renderizarVisitas();
            refrescarEstilosMapa(); 
            renderizarAlertasGlobales(); // 🔥 Aseguramos que se dibujen al cargar el mapa
        };
        document.head.appendChild(scriptMapa);
    }
}

function inicializarBandejaSiervo() {
    const btnBandeja = document.getElementById('btn-admin-solicitudes');
    const vistaBandeja = document.getElementById('admin-solicitudes-view');
    const listaSolicitudes = document.getElementById('lista-solicitudes');
    const listaActivos = document.getElementById('lista-bloqueos-activos');
    const badge = document.getElementById('badge-solicitudes');

    if (!btnBandeja || !vistaBandeja || !listaSolicitudes) return;

    if (window.miUsuario.rol !== 'siervo' && window.miUsuario.rol !== 'ayudante') {
        btnBandeja.style.display = 'none';
        return;
    }

    const qTickets = query(collection(db, "congregaciones", window.miUsuario.congregacionId, "solicitudes_no_visitar"), where("estado", "in", ["Pendiente", "Pendiente_Eliminar"]));
    onSnapshot(qTickets, (snapshot) => {
        listaSolicitudes.innerHTML = '';
        
        if (snapshot.empty) {
            badge.style.display = 'none';
            listaSolicitudes.innerHTML = '<p style="color: var(--text-muted, gray); text-align: center; margin-top: 20px;">No hay solicitudes nuevas.</p>';
        } else {
            badge.style.display = 'flex';
            badge.innerText = snapshot.size;

            snapshot.forEach(docSnap => {
                const ticket = docSnap.data();
                const ticketId = docSnap.id;
                
                const esDesbloqueo = ticket.estado === "Pendiente_Eliminar";
                const etiquetaTipo = esDesbloqueo 
                    ? `<span style="background: rgba(76, 175, 80, 0.2); color: #4CAF50; padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: 900; letter-spacing: 0.5px;">🟢 SOLICITA DESBLOQUEO</span>`
                    : `<span style="background: rgba(229, 57, 53, 0.2); color: var(--error-text); padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: 900; letter-spacing: 0.5px;">🔴 SOLICITA BLOQUEO</span>`;

                const nombre = ticket.nombreVisita || ticket.nombre || 'Nueva';
                const apellido = ticket.apellidoVisita || ticket.apellido || 'Visita';
                const nombreCompletoVisita = (nombre === 'Nueva' && apellido === 'Visita') ? 'No especificado' : `${nombre} ${apellido}`.trim();
                
                const card = document.createElement('div');
                card.style.cssText = "background: var(--surface-color, #25242C); border: 1px solid var(--border-color, rgba(128,128,128,0.2)); padding: 16px; border-radius: 16px; margin-bottom: 12px; box-shadow: 0 4px 10px rgba(0,0,0,0.1);";
                
                card.innerHTML = `
                    <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                        <span style="font-weight: bold; color: var(--primary-color, #CBA4FF); font-size: 16px;">T${ticket.territorio} - Mz ${ticket.poligono}</span>
                        ${etiquetaTipo}
                    </div>
                    <p style="margin: 0 0 6px 0; color: var(--text-color, #fff); font-size: 14px;"><strong>👤 Persona:</strong> ${nombreCompletoVisita}</p>
                    <p style="margin: 0 0 12px 0; color: var(--text-color, #fff); font-size: 14px;"><strong>📍 Dirección:</strong> ${ticket.direccion || 'No provista'}</p>
                    <div style="background: var(--bg-color, rgba(0,0,0,0.1)); border-left: 3px solid ${esDesbloqueo ? '#4CAF50' : '#E53935'}; padding: 12px; border-radius: 0 8px 8px 0; margin-bottom: 16px;">
                        <p style="margin: 0 0 4px 0; color: var(--text-muted, #A0A0A0); font-size: 12px; text-transform: uppercase; letter-spacing: 1px; font-weight: bold;">📝 Motivo de Solicitud</p>
                        <p style="margin: 0; color: var(--text-color, #fff); font-size: 14px; font-style: italic;">"${ticket.motivo}"</p>
                    </div>
                    <p style="margin: 0 0 16px 0; font-size: 13px; color: var(--text-muted, #A0A0A0);">Generado por: <strong>${ticket.publicadorNombre}</strong></p>
                    <div style="display: flex; gap: 10px;">
                        <button class="btn-rechazar" style="flex: 1; background: transparent; border: 1px solid var(--error-text); color: var(--error-text); padding: 12px; border-radius: 12px; font-weight: bold; cursor: pointer;">Rechazar</button>
                        <button class="btn-aprobar" style="flex: 1; background: var(--primary-color, #CBA4FF); border: none; color: white; padding: 12px; border-radius: 12px; font-weight: bold; cursor: pointer;">Aprobar</button>
                    </div>
                `;

                card.querySelector('.btn-aprobar').onclick = async () => {
                    if (esDesbloqueo) {
                        await deleteDoc(doc(db, "congregaciones", window.miUsuario.congregacionId, "solicitudes_no_visitar", ticketId));
                        
                        const qB = query(collection(db, "congregaciones", window.miUsuario.congregacionId, "solicitudes_no_visitar"), 
                            where("territorio", "==", ticket.territorio), 
                            where("poligono", "==", ticket.poligono),
                            where("estado", "==", "Aprobado"));
                        
                        const snapB = await getDocs(qB);
                        snapB.forEach(d => {
                            const originalDir = normalizarTexto(d.data().direccion);
                            const reqDir = normalizarTexto(ticket.direccion);
                            if (snapB.size === 1 || originalDir.includes(reqDir) || reqDir.includes(originalDir)) {
                                deleteDoc(d.ref);
                            }
                        });
                        
                        if(window.mostrarToastM3) window.mostrarToastM3("Desbloqueo aprobado. La casa está libre.", "success");
                    } else {
                        await setDoc(doc(db, "congregaciones", window.miUsuario.congregacionId, "solicitudes_no_visitar", ticketId), { estado: "Aprobado" }, { merge: true });
                        if(window.mostrarToastM3) window.mostrarToastM3("Alerta aprobada. Visible en el mapa.", "success");
                    }
                };

                card.querySelector('.btn-rechazar').onclick = async () => {
                    if (esDesbloqueo) {
                        await setDoc(doc(db, "congregaciones", window.miUsuario.congregacionId, "solicitudes_no_visitar", ticketId), { estado: "Aprobado" }, { merge: true });
                        if(window.mostrarToastM3) window.mostrarToastM3("Desbloqueo rechazado. Sigue bloqueada.", "error");
                    } else {
                        await deleteDoc(doc(db, "congregaciones", window.miUsuario.congregacionId, "solicitudes_no_visitar", ticketId));
                        if(window.mostrarToastM3) window.mostrarToastM3("Solicitud de bloqueo descartada.", "error");
                    }
                };

                listaSolicitudes.appendChild(card);
            });
        }
    });

    if (listaActivos) {
        const qActivos = query(collection(db, "congregaciones", window.miUsuario.congregacionId, "solicitudes_no_visitar"), where("estado", "==", "Aprobado"));
        onSnapshot(qActivos, (snapshot) => {
            listaActivos.innerHTML = '';
            
            if (snapshot.empty) {
                listaActivos.innerHTML = '<p style="color: var(--text-muted, gray); text-align: center; margin-top: 20px;">No hay bloqueos activos en el territorio.</p>';
                return;
            }

            snapshot.forEach(docSnap => {
                const ticket = docSnap.data();
                const ticketId = docSnap.id;
                
                const nombre = ticket.nombreVisita || ticket.nombre || 'Nueva';
                const apellido = ticket.apellidoVisita || ticket.apellido || 'Visita';
                const nombreCompletoVisita = (nombre === 'Nueva' && apellido === 'Visita') ? 'No especificado' : `${nombre} ${apellido}`.trim();
                
                const card = document.createElement('div');
                card.style.cssText = "background: var(--surface-color, #25242C); border: 1px solid rgba(229, 57, 53, 0.4); padding: 16px; border-radius: 16px; margin-bottom: 12px; box-shadow: 0 4px 10px rgba(0,0,0,0.1);";
                
                card.innerHTML = `
                    <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                        <span style="font-weight: bold; color: #E53935; font-size: 16px;">⛔ T${ticket.territorio} - Mz ${ticket.poligono}</span>
                        <span style="font-size: 12px; color: var(--text-muted, #A0A0A0);">${new Date(ticket.timestamp).toLocaleDateString()}</span>
                    </div>
                    <p style="margin: 0 0 6px 0; color: var(--text-color, #fff); font-size: 14px;"><strong>👤 Persona:</strong> ${nombreCompletoVisita}</p>
                    <p style="margin: 0 0 12px 0; color: var(--text-color, #fff); font-size: 14px;"><strong>📍 Dirección:</strong> ${ticket.direccion || 'No provista'}</p>
                    <p style="margin: 0 0 16px 0; color: var(--text-muted, #A0A0A0); font-size: 13px; font-style: italic;">"${ticket.motivo}"</p>
                    <div style="display: flex; justify-content: flex-end;">
                        <button class="btn-eliminar-bloqueo" style="background: var(--error-bg); border: 1px solid var(--error-text); color: var(--error-text); padding: 10px 16px; border-radius: 12px; font-weight: bold; cursor: pointer; font-size: 14px; transition: opacity 0.2s;">🗑️ Forzar Desbloqueo</button>
                    </div>
                `;

                card.querySelector('.btn-eliminar-bloqueo').onclick = () => {
                    if(window.mostrarModalConfirmacionGlobal) {
                        window.mostrarModalConfirmacionGlobal(
                            "¿Eliminar bloqueo?", 
                            "Esta dirección dejará de estar prohibida y desaparecerá la alerta del mapa.", 
                            "Sí, eliminar", 
                            "var(--error-text)", 
                            async () => {
                                await deleteDoc(doc(db, "congregaciones", window.miUsuario.congregacionId, "solicitudes_no_visitar", ticketId));
                                if(window.mostrarToastM3) window.mostrarToastM3("Bloqueo eliminado correctamente.", "success");
                            }
                        );
                    }
                };

                listaActivos.appendChild(card);
            });
        });
    }

    btnBandeja.onclick = () => {
        document.getElementById('admin-dashboard').style.display = 'none';
        vistaBandeja.style.display = 'block';
    };

    const btnVolver = vistaBandeja.querySelector('.btn-volver-admin');
    if (btnVolver) {
        btnVolver.onclick = () => {
            vistaBandeja.style.display = 'none';
            document.getElementById('admin-dashboard').style.display = 'flex';
        };
    }
}

function manejarBorradoVisita(visita, nombreMostrar) {
    let mensajeExtra = "";
    if (visita.estado === 'No visitar' || visita.estado === 'Quitar de No Visitar') {
        mensajeExtra = "<br><br><span style='color:var(--text-muted); font-size:13px;'><b>Ojo:</b> Esto solo borrará tu pin. La alerta global de la congregación sigue activa hasta que el Siervo la elimine desde la bandeja.</span>";
    }

    if (window.mostrarModalConfirmacionGlobal) {
        window.mostrarModalConfirmacionGlobal(
            "¿Eliminar ficha?",
            `Se borrará tu registro local de la visita de ${nombreMostrar}.${mensajeExtra}`,
            "Sí, eliminar",
            "var(--error-text)",
            async () => {
                try {
                    await deleteDoc(doc(db, "usuarios", window.miUsuario.email, "mis_visitas", visita.id));
                    if(window.mostrarToastM3) window.mostrarToastM3("Visita eliminada con éxito", "success");
                } catch(e) {
                    if(window.mostrarToastM3) window.mostrarToastM3("Error al eliminar", "error");
                }
            }
        );
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
        if (visita.estado === 'No visitar' || visita.estado === 'Quitar de No Visitar') colorPinLista = '#9C27B0'; 
        
        const nombreMostrar = (visita.nombre === 'Nueva' && visita.apellido === 'Visita') ? 'Visita Nueva' : `${visita.nombre} ${visita.apellido}`;
        const fecha = new Date(visita.timestamp || Date.now()).toLocaleDateString();

        const card = document.createElement('div'); 
        card.className = 'visita-card';
        card.innerHTML = `<div class="visita-color" style="background-color: ${colorPinLista};"></div><div class="visita-info" style="flex: 1;"><h3>${nombreMostrar}</h3><p>📍 T${visita.territorio} - ${visita.poligono} | 📅 ${fecha}</p></div>`;
        
        let pressTimer;
        let isLongPress = false;

        card.addEventListener('touchstart', (e) => {
            isLongPress = false;
            pressTimer = setTimeout(() => {
                isLongPress = true;
                manejarBorradoVisita(visita, nombreMostrar);
            }, 600);
        }, {passive: true});

        card.addEventListener('touchend', () => clearTimeout(pressTimer));
        card.addEventListener('touchmove', () => clearTimeout(pressTimer));

        card.addEventListener('mousedown', (e) => {
            isLongPress = false;
            pressTimer = setTimeout(() => {
                isLongPress = true;
                manejarBorradoVisita(visita, nombreMostrar);
            }, 600);
        });

        card.addEventListener('mouseup', () => clearTimeout(pressTimer));
        card.addEventListener('mouseleave', () => clearTimeout(pressTimer));
        card.addEventListener('mousemove', () => clearTimeout(pressTimer));

        card.onclick = (e) => {
            if (isLongPress) {
                e.preventDefault(); 
                return;
            }
            abrirFichaVisita(visita); 
        };

        visitasContainer.appendChild(card);
    });
}

function parsearNotasHistorial(notesRaw) {
    if (!notesRaw || notesRaw.trim() === '') return [];
    if (notesRaw.trim().startsWith("[")) { try { return JSON.parse(notesRaw); } catch(e) {} }
    try {
        return notesRaw.split("|||").map(str => {
            const parts = str.split("&&&");
            if (parts.length === 3) return { id: parts[0], fecha: parts[1], texto: parts[2].replace(/\/\/\//g, "\n") };
            return null;
        }).filter(Boolean);
    } catch(e) { return [{ id: Date.now().toString(), fecha: "Historial Previo", texto: notesRaw }]; }
}

function empaquetarNotasHistorial(listaNotas) {
    if (!listaNotas || listaNotas.length === 0) return "";
    return listaNotas.map(nota => `${nota.id}&&&${nota.fecha}&&&${nota.texto.replace(/\n/g, "///")}`).join("|||");
}

function formatearFechaHoy() {
    const meses = ["ene.","feb.","mar.","abr.","may.","jun.","jul.","ago.","sep.","oct.","nov.","dic."];
    const d = new Date(); const dia = d.getDate().toString().padStart(2, '0'); const mes = meses[d.getMonth()];
    const anio = d.getFullYear(); const hora = d.getHours().toString().padStart(2, '0'); const min = d.getMinutes().toString().padStart(2, '0');
    return `${dia} ${mes} ${anio} - ${hora}:${min}`; 
}

window.comprobarCambiosAntesDeSalir = function() {
    const gn = (id) => document.getElementById(id) ? document.getElementById(id).value.trim() : '';
    if (gn('ficha-notas') || gn('ficha-publi') || gn('ficha-video') || gn('ficha-proximo')) return true;
    if (window.datosOriginalesFicha) {
        if (gn('ficha-nombre') !== window.datosOriginalesFicha.nombre || gn('ficha-apellido') !== window.datosOriginalesFicha.apellido || gn('ficha-estado') !== window.datosOriginalesFicha.estado || gn('ficha-direccion') !== window.datosOriginalesFicha.direccion) return true;
    }
    return false;
};

function abrirFichaVisita(visita) {
    window.miUsuario.visitaActivaId = visita.id; window.miUsuario.tempLat = visita.latitud || 0; window.miUsuario.tempLng = visita.longitud || 0;
    
    const selectEstado = document.getElementById('ficha-estado');
    const gn = (id) => document.getElementById(id);
    
    if(gn('ficha-nombre')) gn('ficha-nombre').value = visita.nombre !== 'Nueva' ? visita.nombre : '';
    if(gn('ficha-apellido')) gn('ficha-apellido').value = visita.apellido !== 'Visita' ? visita.apellido : '';
    if(gn('ficha-terr')) gn('ficha-terr').innerText = visita.territorio || '-'; 
    if(gn('ficha-manz')) gn('ficha-manz').innerText = visita.poligono || '-';
    if(gn('ficha-direccion')) gn('ficha-direccion').value = visita.direccion || '';
    if(gn('ficha-publi')) gn('ficha-publi').value = ''; if(gn('ficha-video')) gn('ficha-video').value = '';
    if(gn('ficha-proximo')) gn('ficha-proximo').value = ''; if(gn('ficha-notas')) gn('ficha-notas').value = ''; 

    if (selectEstado) {
        if (visita.estado === 'No visitar' || visita.estado === 'Quitar de No Visitar') {
            selectEstado.innerHTML = `
                <option value="No visitar">No visitar</option>
                <option value="Quitar de No Visitar">Solicitar desbloqueo</option>
            `;
            selectEstado.value = visita.estado;
        } else {
            selectEstado.innerHTML = `
                <option value="Nueva">Nueva</option>
                <option value="Revisita">Revisita</option>
                <option value="Ausente">Ausente</option>
                <option value="Estudio">Estudio</option>
                <option value="No visitar">No visitar</option>
            `;
            selectEstado.value = visita.estado || 'Nueva';
        }

        let alertaDiv = document.getElementById('alerta-no-visitar');
        if (!alertaDiv) {
            alertaDiv = document.createElement('div');
            alertaDiv.id = 'alerta-no-visitar';
            alertaDiv.style.cssText = "display: none; padding: 12px; border-radius: var(--border-radius); font-size: 14px; margin-top: 15px; font-weight: 500; text-align: center; line-height: 1.4;";
            const notasArea = document.getElementById('ficha-notas');
            if(notasArea) notasArea.parentNode.insertBefore(alertaDiv, notasArea);
        }
        
        function actualizarAlertaEstado(val) {
            if (val === 'No visitar') {
                alertaDiv.style.display = 'block';
                alertaDiv.style.background = 'var(--error-bg)';
                alertaDiv.style.border = '1px solid var(--error-text)';
                alertaDiv.style.color = 'var(--error-text)';
                alertaDiv.innerHTML = "⚠️ <b>Atención:</b> Al guardar, esta dirección se enviará al Siervo para revisión y bloqueo oficial.";
            } else if (val === 'Quitar de No Visitar') {
                alertaDiv.style.display = 'block';
                alertaDiv.style.background = 'rgba(76, 175, 80, 0.1)';
                alertaDiv.style.border = '1px solid #4CAF50';
                alertaDiv.style.color = '#4CAF50';
                alertaDiv.innerHTML = "🟢 <b>Solicitud de Desbloqueo:</b> Se enviará una petición al Siervo para eliminar la prohibición del mapa.";
            } else {
                alertaDiv.style.display = 'none';
            }
        }

        actualizarAlertaEstado(selectEstado.value);
        selectEstado.addEventListener('change', (e) => actualizarAlertaEstado(e.target.value));
    }

    window.datosOriginalesFicha = { nombre: visita.nombre !== 'Nueva' ? visita.nombre : '', apellido: visita.apellido !== 'Visita' ? visita.apellido : '', estado: visita.estado || 'Nueva', direccion: visita.direccion || '' };
    const titulo = document.getElementById('ficha-titulo'); if (titulo) titulo.innerText = visita.nombre === 'Nueva' ? "Registrar Visita" : `Ficha de ${visita.nombre}`;
    window.listaNotasActuales = parsearNotasHistorial(visita.notas || "");

    const btnGps = document.getElementById('btn-ir-gps');
    if (btnGps) {
        btnGps.style.cssText = "background-color: var(--primary-color) !important; border: none !important; border-radius: 16px !important; width: 54px !important; height: 54px !important; display: flex !important; align-items: center !important; justify-content: center !important; cursor: pointer !important; box-shadow: 0 2px 6px rgba(0,0,0,0.15) !important; transition: opacity 0.2s ease !important; flex-shrink: 0 !important; margin-bottom: 15px !important;";
        
        btnGps.innerHTML = `
            <svg viewBox="0 0 24 24" fill="white" style="width: 28px !important; height: 28px !important; min-width: 28px !important; min-height: 28px !important; pointer-events: none; flex-shrink: 0 !important; display: block !important;">
                <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71L12 2z"/>
            </svg>
        `;
        
        btnGps.onmousedown = () => { btnGps.style.opacity = '0.7'; };
        btnGps.onmouseup = () => { btnGps.style.opacity = '1'; };
        btnGps.onmouseleave = () => { btnGps.style.opacity = '1'; };
        btnGps.onclick = (e) => { e.preventDefault(); abrirNavegadorGPS(visita.latitud, visita.longitud); };
    }

    function renderizarHistorial() {
        const container = document.getElementById('historial-conversaciones-container'); container.innerHTML = '';
        if (window.listaNotasActuales.length === 0) { container.innerHTML = `<p style="color: var(--text-muted); font-size: 14px;">No hay conversaciones previas registradas.</p>`; return; }
        window.listaNotasActuales.forEach(nota => {
            const card = document.createElement('div'); card.className = 'chat-bubble'; card.style.position = 'relative';
            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 8px;">
                    <div class="chat-meta">${nota.fecha}</div>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn-editar-nota" style="background: transparent; border: none; color: var(--primary-color); width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: opacity 0.2s; font-size: 13px;">✏️</button>
                        <button class="btn-borrar-nota" style="background: transparent; border: none; color: var(--error-text); width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: opacity 0.2s; font-size: 13px;">🗑️</button>
                    </div>
                </div>
                <div class="chat-text" style="line-height: 1.4;">${nota.texto}</div>
            `;
            card.querySelector('.btn-borrar-nota').onclick = () => {
                if (window.mostrarModalConfirmacionGlobal) {
                    window.mostrarModalConfirmacionGlobal("¿Eliminar conversación?", "Esta acción no se puede deshacer y borrará la nota del historial.", "Sí, eliminar", "var(--error-text)", () => {
                            window.listaNotasActuales = window.listaNotasActuales.filter(n => n.id !== nota.id); renderizarHistorial(); 
                            const visitaActualizada = { notas: empaquetarNotasHistorial(window.listaNotasActuales) };
                            setDoc(doc(db, "usuarios", window.miUsuario.email, "mis_visitas", visita.id), visitaActualizada, { merge: true });
                    });
                }
            };
            card.querySelector('.btn-editar-nota').onclick = () => {
                mostrarModalEditarNota(nota.texto, (nuevoTexto) => {
                    if (nuevoTexto === nota.texto) return; 
                    window.listaNotasActuales = window.listaNotasActuales.map(n => { if (n.id === nota.id) return { ...n, texto: nuevoTexto }; return n; });
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

function mostrarModalEditarNota(textoActual, onGuardar) {
    let m = document.createElement('div');
    m.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: var(--modal-overlay); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); z-index: 10005; display: flex; align-items: center; justify-content: center; padding: 20px; box-sizing: border-box; font-family: sans-serif;';
    m.innerHTML = `
        <div style="background: var(--surface-color); width: 100%; max-width: 360px; border-radius: 24px; padding: 24px; box-shadow: 0 16px 40px rgba(0,0,0,0.4); border: 1px solid var(--border-color);">
            <h3 style="color: var(--text-color); margin: 0 0 16px 0; font-size: 18px;">Editar Conversación</h3>
            <textarea id="input-edit-nota" style="width: 100%; height: 140px; background: var(--bg-color); border: 1px solid var(--input-border); color: var(--text-color); padding: 14px; border-radius: var(--border-radius); margin-bottom: 24px; font-size: 15px; box-sizing: border-box; outline: none; transition: border 0.2s; resize: none;">${textoActual}</textarea>
            <div style="display: flex; justify-content: flex-end; gap: 12px;">
                <button id="btn-cancelar-edit-nota" style="background: transparent; border: none; color: var(--primary-color); font-weight: bold; font-size: 15px; padding: 10px 16px; border-radius: var(--border-radius); cursor: pointer;">Cancelar</button>
                <button id="btn-guardar-edit-nota" style="background: var(--primary-color); color: white; border: none; font-weight: bold; font-size: 15px; padding: 10px 20px; border-radius: var(--border-radius); cursor: pointer;">Guardar</button>
            </div>
        </div>
    `;
    document.body.appendChild(m);
    const inputNota = document.getElementById('input-edit-nota');
    inputNota.addEventListener('focus', (e) => e.target.style.borderColor = 'var(--primary-color)');
    inputNota.addEventListener('blur', (e) => e.target.style.borderColor = 'var(--input-border)');

    document.getElementById('btn-cancelar-edit-nota').onclick = () => m.remove();
    document.getElementById('btn-guardar-edit-nota').onclick = () => {
        const nTexto = inputNota.value.trim(); if(!nTexto) return alert("La nota no puede quedar vacía.");
        const btnGuardar = document.getElementById('btn-guardar-edit-nota'); btnGuardar.innerText = "Guardando..."; btnGuardar.disabled = true;
        onGuardar(nTexto); m.remove();
    };
}

window.mostrarModalConfirmacionGlobal = function(titulo, mensaje, txtConfirmar, colorConfirmar, onConfirm) {
    let m = document.createElement('div');
    m.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: var(--modal-overlay); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); z-index: 10050; display: flex; align-items: center; justify-content: center; padding: 20px; box-sizing: border-box; font-family: sans-serif; opacity: 0; transition: opacity 0.2s ease;';
    m.innerHTML = `
        <div style="background: var(--surface-color); width: 100%; max-width: 320px; border-radius: 28px; padding: 24px; box-shadow: 0 24px 48px rgba(0,0,0,0.4); border: 1px solid var(--border-color); text-align: center; transform: scale(0.95); transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);">
            <div style="font-size: 42px; margin-bottom: 16px;">⚠️</div><h3 style="color: var(--text-color); margin: 0 0 12px 0; font-size: 20px;">${titulo}</h3>
            <p style="color: var(--text-muted); font-size: 15px; margin: 0 0 28px 0; line-height: 1.5;">${mensaje}</p>
            <div style="display: flex; flex-direction: column; gap: 12px;">
                <button id="btn-accion-confirm-global" style="background: ${colorConfirmar}; color: white; border: none; font-weight: bold; padding: 16px; border-radius: 16px; cursor: pointer; font-size: 16px;">${txtConfirmar}</button>
                <button id="btn-cancelar-confirm-global" style="background: transparent; border: 1px solid var(--border-color); color: var(--text-color); font-weight: bold; padding: 16px; border-radius: 16px; cursor: pointer; font-size: 16px;">Cancelar</button>
            </div>
        </div>
    `;
    document.body.appendChild(m); setTimeout(() => { m.style.opacity = '1'; m.children[0].style.transform = 'scale(1)'; }, 10);
    function cerrarModal() { m.style.opacity = '0'; m.children[0].style.transform = 'scale(0.95)'; setTimeout(() => m.remove(), 200); }
    document.getElementById('btn-cancelar-confirm-global').onclick = cerrarModal;
    document.getElementById('btn-accion-confirm-global').onclick = () => { cerrarModal(); onConfirm(); };
};

window.mostrarModalCambiosSinGuardar = function(onGuardar, onSalir) {
    let m = document.createElement('div');
    m.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: var(--modal-overlay); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); z-index: 10060; display: flex; align-items: center; justify-content: center; padding: 20px; box-sizing: border-box; font-family: sans-serif; opacity: 0; transition: opacity 0.2s ease;';
    m.innerHTML = `
        <div style="background: var(--surface-color); width: 100%; max-width: 340px; border-radius: 28px; padding: 24px; box-shadow: 0 24px 48px rgba(0,0,0,0.4); border: 1px solid var(--border-color); text-align: center; transform: scale(0.95); transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);">
            <div style="font-size: 42px; margin-bottom: 16px;">💾</div><h3 style="color: var(--text-color); margin: 0 0 12px 0; font-size: 20px;">Cambios sin guardar</h3>
            <p style="color: var(--text-muted); font-size: 15px; margin: 0 0 28px 0; line-height: 1.5;">Tienes información nueva en esta visita. ¿Qué deseas hacer?</p>
            <div style="display: flex; flex-direction: column; gap: 10px;">
                <button id="btn-modal-guardar" style="background: var(--primary-color); color: white; border: none; font-weight: bold; padding: 16px; border-radius: 16px; cursor: pointer; font-size: 16px; transition: opacity 0.2s;">Guardar cambios</button>
                <button id="btn-modal-salir" style="background: transparent; border: 1px solid var(--error-text); color: var(--error-text); font-weight: bold; padding: 16px; border-radius: 16px; cursor: pointer; font-size: 16px; transition: opacity 0.2s;">Salir sin guardar</button>
                <button id="btn-modal-cancelar" style="background: transparent; border: none; color: var(--text-muted); font-weight: bold; padding: 12px; border-radius: 16px; cursor: pointer; font-size: 15px;">Cancelar</button>
            </div>
        </div>
    `;
    document.body.appendChild(m); setTimeout(() => { m.style.opacity = '1'; m.children[0].style.transform = 'scale(1)'; }, 10);
    function cerrarModal() { m.style.opacity = '0'; m.children[0].style.transform = 'scale(0.95)'; setTimeout(() => m.remove(), 200); }
    document.getElementById('btn-modal-cancelar').onclick = cerrarModal;
    document.getElementById('btn-modal-guardar').onclick = () => { cerrarModal(); if(onGuardar) onGuardar(); };
    document.getElementById('btn-modal-salir').onclick = () => { cerrarModal(); if(onSalir) onSalir(); };
};

window.mostrarToastM3 = function(mensaje, tipo = 'success') {
    const bg = tipo === 'error' ? 'var(--error-text)' : '#4CAF50';
    const icon = tipo === 'error' ? '❌' : '✅';
    
    const toastViejo = document.getElementById('toast-m3');
    if (toastViejo) toastViejo.remove();

    const toast = document.createElement('div');
    toast.id = 'toast-m3';
    toast.style.cssText = `position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%) translateY(100px); background: ${bg}; color: white; padding: 12px 24px; border-radius: 50px; font-family: sans-serif; font-size: 14px; font-weight: bold; box-shadow: 0 8px 24px rgba(0,0,0,0.4); z-index: 11000; display: flex; align-items: center; gap: 10px; opacity: 0; transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1); width: max-content; max-width: 90%; pointer-events: none;`;
    toast.innerHTML = `<span style="font-size: 18px;">${icon}</span> <span>${mensaje}</span>`;
    
    document.body.appendChild(toast);
    
    setTimeout(() => { toast.style.transform = 'translateX(-50%) translateY(0)'; toast.style.opacity = '1'; }, 10);
    setTimeout(() => { 
        toast.style.transform = 'translateX(-50%) translateY(100px)'; toast.style.opacity = '0'; 
        setTimeout(() => toast.remove(), 300);
    }, 3500);
};

function abrirNavegadorGPS(lat, lng) {
    if (!lat || !lng) {
        if(window.mostrarToastM3) window.mostrarToastM3("No hay coordenadas exactas para esta visita.", "error");
        return;
    }
    let m = document.createElement('div');
    m.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: var(--modal-overlay); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); z-index: 10020; display: flex; align-items: flex-end; justify-content: center; font-family: sans-serif;';
    m.innerHTML = `
        <div style="background: var(--surface-color); width: 100%; max-width: 480px; border-radius: 28px 28px 0 0; padding: 24px 24px 36px 24px; box-shadow: 0 -8px 40px rgba(0,0,0,0.4); border-top: 1px solid var(--border-color); animation: slideUpNav 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);">
            <div style="width: 40px; height: 5px; background: var(--border-color); border-radius: 3px; margin: 0 auto 24px auto;"></div>
            <h3 style="color: var(--text-color); margin: 0 0 20px 0; font-size: 20px; text-align: center;">¿Cómo quieres llegar?</h3>
            <div style="display: flex; flex-direction: column; gap: 12px;">
                <button id="btn-nav-maps" style="background: var(--bg-color); border: 1px solid var(--border-color); color: var(--text-color); padding: 16px; border-radius: 16px; font-size: 16px; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 16px; transition: opacity 0.2s;"><span style="font-size: 24px;">🗺️</span> Google Maps</button>
                <button id="btn-nav-waze" style="background: var(--bg-color); border: 1px solid var(--border-color); color: var(--text-color); padding: 16px; border-radius: 16px; font-size: 16px; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 16px; transition: opacity 0.2s;"><span style="font-size: 24px;">🚗</span> Waze</button>
                <button id="btn-nav-apple" style="background: var(--bg-color); border: 1px solid var(--border-color); color: var(--text-color); padding: 16px; border-radius: 16px; font-size: 16px; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 16px; transition: opacity 0.2s;"><span style="font-size: 24px;">🍎</span> Apple Maps</button>
            </div>
            <button id="btn-cancelar-nav" style="width: 100%; background: transparent; border: none; color: var(--text-muted); font-weight: bold; font-size: 16px; padding: 20px 16px 0 16px; margin-top: 8px; cursor: pointer;">Cancelar</button>
        </div>
    `;
    
    if (!document.getElementById('anim-slide-up-nav')) {
        const style = document.createElement('style'); style.id = 'anim-slide-up-nav';
        style.innerHTML = `@keyframes slideUpNav { from { transform: translateY(100%); } to { transform: translateY(0); } }`;
        document.head.appendChild(style);
    }
    document.body.appendChild(m);

    const isApple = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (!isApple) document.getElementById('btn-nav-apple').style.display = 'none';

    document.getElementById('btn-cancelar-nav').onclick = () => m.remove();
    
    document.getElementById('btn-nav-maps').onclick = () => {
        window.open(`http://googleusercontent.com/maps.google.com/maps?daddr=${lat},${lng}`, '_blank'); m.remove();
    };
    document.getElementById('btn-nav-waze').onclick = () => {
        window.open(`https://waze.com/ul?ll=${lat},${lng}&navigate=yes`, '_blank'); m.remove();
    };
    document.getElementById('btn-nav-apple').onclick = () => {
        window.open(`http://maps.apple.com/?daddr=${lat},${lng}`, '_blank'); m.remove();
    };
}