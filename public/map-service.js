// ==========================================
// ARCHIVO: map-service.js (CORE PRINCIPAL LIMPIO)
// ==========================================
import { collection, getDocs, doc, getDoc, query, where, onSnapshot, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { db } from "./firebase-core.js";

// Importamos las herramientas matemáticas y de texto
import { 
    oscurecerColorWeb, obtenerColorPin, normalizarTexto, configurarAutocomplete, 
    parsearNotasHistorial, empaquetarNotasHistorial, formatearFechaHoy 
} from "./map-helpers.js";

// Importamos las herramientas visuales y modales (esto también carga las funciones window.*)
import { mostrarModalEditarNota, abrirNavegadorGPS } from "./ui-utils.js";

window.mapaGlobal = null;
window.pinesVisitas = [];
let pinesAlertasGlobales = []; 
let filtroActual = 'Todos';
let todasLasVisitas = [];
let alertasGlobalesData = []; 

let mapasOcupados = {}; 
let marcadoresMicroMap = {}; 
let alertasNoVisitarPorManzana = {}; 
let ticketsActivosGlobales = new Set(); 

// 🔥 Variables de Motor de Ciclos
let ultimosReportesPorManzana = {};
let ultimaFechaCompletoPorTerritorio = {};

export function refrescarEstilosMapa() {
    if(!window.mapaGlobal || !window.miUsuario) return;
    
    const rol = window.miUsuario.rol;
    const miNombre = window.miUsuario.nombre.trim().toLowerCase();
    
    const ahora = Date.now();
    const tiempoLimite = 180 * 24 * 60 * 60 * 1000; // 6 meses

    // 🔥 Calculamos en memoria qué territorios están 100% completos
    const territoriosTotalmenteCompletos = new Set();
    const gruposPoligonos = {};
    
    window.mapaGlobal.data.forEach(feature => {
        const numTerritorio = feature.getProperty('territorio');
        if (!numTerritorio) return;
        const numTStr = `T${numTerritorio}`.trim(); 
        if (!gruposPoligonos[numTStr]) gruposPoligonos[numTStr] = [];
        gruposPoligonos[numTStr].push(feature);
    });

    for (const [prefijo, poligonos] of Object.entries(gruposPoligonos)) {
        const fechaCompleto = ultimaFechaCompletoPorTerritorio[prefijo] || 0;
        let todosHechosEnEstaRonda = poligonos.length > 0;
        
        for (let p of poligonos) {
            const numMz = p.getProperty('numero');
            if(!numMz || numMz.toLowerCase() === 'plaza') continue;
            
            const etiqueta = `${prefijo} - ${numMz}`;
            const f = ultimosReportesPorManzana[etiqueta] || 0;
            if (f <= fechaCompleto) {
                todosHechosEnEstaRonda = false;
                break;
            }
        }
        if (todosHechosEnEstaRonda) territoriosTotalmenteCompletos.add(prefijo);
    }

    window.mapaGlobal.data.setStyle((feature) => {
        const numTerritorio = feature.getProperty('territorio') || '-';
        const numManzana = feature.getProperty('numero') || '-';
        const etiqueta = `T${numTerritorio} - ${numManzana}`;
        const prefijoTerritorio = `T${numTerritorio}`.trim();
        
        let fillColor = feature.getProperty('fill') || '#6200EE';
        let strokeColor = '#444444';
        let strokeWeight = 1;
        let fillOpacity = 0.35;

        const infoOcupacion = mapasOcupados[etiqueta];
        const estaOcupado = infoOcupacion !== undefined;
        const nombreAsignado = infoOcupacion ? infoOcupacion.asignadoA : "";
        const fechaAsignacion = infoOcupacion ? infoOcupacion.fechaAsignacion : 0;

        const esMio = estaOcupado && nombreAsignado.trim().toLowerCase() === miNombre;
        const estaSeleccionadaParaRegistro = window.modoRegistroActivo && window.manzanasSeleccionadas.has(etiqueta);
        const puedeVerOcupacion = (rol === "siervo" || rol === "ayudante" || rol === "conductor");

        const fechaUltimoReporteManzana = ultimosReportesPorManzana[etiqueta] || 0;
        const fechaUltimoCompleto = ultimaFechaCompletoPorTerritorio[prefijoTerritorio] || 0;

        const esta100PorCientoCompleto = territoriosTotalmenteCompletos.has(prefijoTerritorio);
        const esReciente = (ahora - fechaUltimoReporteManzana) < tiempoLimite;
        const esDeEstaRonda = fechaUltimoReporteManzana > fechaUltimoCompleto;
        const reporteAplica = estaOcupado ? fechaUltimoReporteManzana >= fechaAsignacion : true;

        const mostrarProgreso = !esta100PorCientoCompleto && esReciente && esDeEstaRonda && reporteAplica;

        if (window.modoRegistroActivo && estaSeleccionadaParaRegistro) {
            fillColor = '#6200EE'; fillOpacity = 0.5; strokeColor = 'white'; strokeWeight = 3;
        } else if (mostrarProgreso && !window.modoRegistroActivo) {
            fillColor = '#808080'; fillOpacity = 0.5; strokeColor = '#A9A9A9'; strokeWeight = 1; 
        } else if (esMio && !window.modoRegistroActivo) {
            fillColor = '#4CAF50'; fillOpacity = 0.5; strokeColor = '#388E3C'; strokeWeight = 3;
        } else if (estaOcupado && puedeVerOcupacion) {
            fillColor = oscurecerColorWeb(fillColor); fillOpacity = 0.75; strokeColor = 'black'; strokeWeight = 2;
        }

        return { fillColor, strokeColor, strokeWeight, fillOpacity };
    });

    for (const [etiqueta, marker] of Object.entries(marcadoresMicroMap)) {
        
        const partes = etiqueta.split('-');
        const prefijoTerritorio = partes[0].trim(); 
        
        const infoOcupacion = mapasOcupados[etiqueta];
        const estaOcupado = infoOcupacion !== undefined;
        const nombreAsignado = infoOcupacion ? infoOcupacion.asignadoA : "";
        const fechaAsignacion = infoOcupacion ? infoOcupacion.fechaAsignacion : 0;

        const esMio = estaOcupado && nombreAsignado.trim().toLowerCase() === miNombre;
        const puedeVerOcupacion = (rol === "siervo" || rol === "ayudante" || rol === "conductor");
        const hayAlertaGlobal = alertasNoVisitarPorManzana[etiqueta];

        const esta100PorCientoCompleto = territoriosTotalmenteCompletos.has(prefijoTerritorio);
        const fechaUltimoReporteManzana = ultimosReportesPorManzana[etiqueta] || 0;
        const fechaUltimoCompleto = ultimaFechaCompletoPorTerritorio[prefijoTerritorio] || 0;

        const esReciente = (ahora - fechaUltimoReporteManzana) < tiempoLimite;
        const esDeEstaRonda = fechaUltimoReporteManzana > fechaUltimoCompleto;
        const reporteAplica = estaOcupado ? fechaUltimoReporteManzana >= fechaAsignacion : true;

        const mostrarProgreso = !esta100PorCientoCompleto && esReciente && esDeEstaRonda && reporteAplica;

        let textoExtra = "";
        if (mostrarProgreso && (puedeVerOcupacion || esMio)) {
            const dateObj = new Date(fechaUltimoReporteManzana);
            const dia = dateObj.getDate().toString().padStart(2, '0');
            const mes = (dateObj.getMonth() + 1).toString().padStart(2, '0');
            textoExtra = `\n✅ ${dia}/${mes}`;
        }

        let textoMostrar = etiqueta;
        
        if (esMio && !mostrarProgreso) {
            textoMostrar = `${etiqueta}\n⭐ Mi Territorio`; 
        } else if (esMio && mostrarProgreso) {
            textoMostrar = `${etiqueta}${textoExtra}`; 
        } else if (estaOcupado && (rol === "siervo" || rol === "ayudante")) {
            const soloNombre = nombreAsignado.split(' ')[0]; 
            textoMostrar = `${etiqueta}\n👤 ${soloNombre}${textoExtra}`; 
        } else if (estaOcupado && rol === "conductor") {
            textoMostrar = `${etiqueta}\n🔒 Asignado${textoExtra}`; 
        } else {
             textoMostrar = `${etiqueta}${textoExtra}`; 
        }

        if (hayAlertaGlobal && puedeVerOcupacion) {
             textoMostrar = `⛔ ${textoMostrar}`;
        }

        marker.setLabel({ text: textoMostrar, color: 'black', fontWeight: '900', fontSize: '14px', className: 'map-label-micro' });
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

function renderizarAlertasGlobales() {
    pinesAlertasGlobales.forEach(pin => pin.setMap(null));
    pinesAlertasGlobales = [];

    if (!window.mapaGlobal || !window.miUsuario) return;

    const rol = window.miUsuario.rol;
    const puedeVerBloqueos = (rol === "siervo" || rol === "ayudante" || rol === "conductor");
    if (!puedeVerBloqueos) return;

    alertasGlobalesData.forEach(alerta => {
        const lat = parseFloat(alerta.latitud);
        const lng = parseFloat(alerta.longitud);

        if (!isNaN(lat) && !isNaN(lng)) {
            if (rol === "publicador" && alerta.publicadorEmail === window.miUsuario.email) return;

            const pinRojo = new google.maps.Marker({
                position: { lat: lat, lng: lng },
                map: window.mapaGlobal,
                icon: obtenerColorPin('AlertaGlobal'), 
                zIndex: 9999 
            });

            pinRojo.addListener('click', () => {
                if(!window.modoRegistroActivo) {
                    abrirFichaVisita({
                        id: alerta.id, 
                        nombre: alerta.nombreVisita || 'Nueva',
                        apellido: alerta.apellidoVisita || 'Visita',
                        territorio: alerta.territorio,
                        poligono: alerta.poligono,
                        latitud: lat,
                        longitud: lng,
                        estado: 'No visitar', 
                        direccion: alerta.direccion || '',
                        notas: `[BLOQUEO OFICIAL] Motivo original: ${alerta.motivo || 'Sin detalles'}`
                    });
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
            if (!data.estaDisponible) {
                mapasOcupados[doc.id] = { asignadoA: data.asignadoA, fechaAsignacion: data.fecha || 0 };
            }
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
            data.id = docSnap.id; 
            
            if (data.estado === "Aprobado") {
                alertasGlobalesData.push(data); 
                const etiqueta = `T${data.territorio} - ${data.poligono}`;
                alertasNoVisitarPorManzana[etiqueta] = true;
            }
        });
        
        limpiarPinesHuerfanos(); 
        refrescarEstilosMapa();
        renderizarAlertasGlobales(); 
    });

    // 🔥 MOTOR DE CICLOS EN WEB 🔥
    const qReportes = collection(db, "congregaciones", window.miUsuario.congregacionId, "registro_actividad");
    onSnapshot(qReportes, (snapshot) => {
        const reportesManzanas = {};
        const reportesTerritoriosCompletos = {};

        snapshot.forEach(doc => {
            const data = doc.data();
            const fecha = data.fecha || 0;
            const cobertura = data.cobertura || "Parcial";
            const manzanas = data.manzanas || [];

            manzanas.forEach(m => {
                const fechaExistente = reportesManzanas[m] || 0;
                if (fecha > fechaExistente) reportesManzanas[m] = fecha;
            });

            if (cobertura === "Completo") {
                const prefijos = [...new Set(manzanas.map(m => m.split("-")[0].trim()))];
                prefijos.forEach(prefijo => {
                    const fechaExistente = reportesTerritoriosCompletos[prefijo] || 0;
                    if (fecha > fechaExistente) reportesTerritoriosCompletos[prefijo] = fecha;
                });
            }
        });

        ultimosReportesPorManzana = reportesManzanas;
        ultimaFechaCompletoPorTerritorio = reportesTerritoriosCompletos;
        refrescarEstilosMapa();
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
                        latitud: window.miUsuario.tempLat, 
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
                        latitud: window.miUsuario.tempLat, 
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
                // 🔥 Aseguráte de que acá diga "territorios" en tu base de datos 🔥
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
                    marcadoresMacro.push(new google.maps.Marker({ position: { lat: d.latSum / d.count, lng: d.lngSum / d.count }, label: { text: `T${t}`, color: 'black', fontWeight: '900', fontSize: '34px', className: 'map-label-macro' }, icon: { url: "", scaledSize: new google.maps.Size(0,0) } }));
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
            renderizarAlertasGlobales(); 
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

// LÓGICA DE REGISTRO
const btnAvanzar = document.getElementById('btn-avanzar-registro');
if (btnAvanzar) {
    btnAvanzar.onclick = async () => {
        if (!window.manzanasSeleccionadas || window.manzanasSeleccionadas.size === 0) return;
        
        const m = document.createElement('div');
        m.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: var(--modal-overlay); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); z-index: 10050; display: flex; align-items: center; justify-content: center; padding: 20px; box-sizing: border-box; font-family: sans-serif; opacity: 0; transition: opacity 0.2s ease;';
        
        const numSelec = window.manzanasSeleccionadas.size;
        const listaManzanas = Array.from(window.manzanasSeleccionadas).join(", ");
        
        m.innerHTML = `
            <div style="background: var(--surface-color); width: 100%; max-width: 360px; border-radius: 28px; padding: 24px; box-shadow: 0 24px 48px rgba(0,0,0,0.4); border: 1px solid var(--border-color); transform: scale(0.95); transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);">
                <h3 style="color: var(--text-color); margin: 0 0 12px 0; font-size: 20px;">Registro de Avance</h3>
                <p style="color: var(--text-muted); font-size: 14px; margin: 0 0 16px 0;">Manzanas seleccionadas: <b>${numSelec}</b><br><span style="font-size: 12px; color: gray;">${listaManzanas}</span></p>
                
                <p style="color: var(--text-color); font-size: 15px; margin: 0 0 8px 0; font-weight: bold;">¿Se completó el territorio con este avance?</p>
                
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                    <input type="radio" id="rad-comp" name="cobertura" value="Completo" style="accent-color: var(--primary-color); width: 18px; height: 18px;">
                    <label for="rad-comp" style="color: var(--text-color); font-size: 15px; cursor: pointer;">Sí (Liberar todo)</label>
                </div>
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px;">
                    <input type="radio" id="rad-parc" name="cobertura" value="Parcial" checked style="accent-color: var(--primary-color); width: 18px; height: 18px;">
                    <label for="rad-parc" style="color: var(--text-color); font-size: 15px; cursor: pointer;">No (Parcial)</label>
                </div>

                <textarea id="notas-registro" placeholder="¿Qué faltó? / Notas" style="width: 100%; height: 80px; background: var(--bg-color); border: 1px solid var(--input-border); color: var(--text-color); padding: 12px; border-radius: 12px; margin-bottom: 24px; font-size: 14px; box-sizing: border-box; outline: none; resize: none;"></textarea>
                
                <div style="display: flex; gap: 12px; justify-content: flex-end;">
                    <button id="btn-cancelar-reg" style="background: transparent; border: none; color: var(--text-muted); font-weight: bold; padding: 10px 16px; border-radius: 12px; cursor: pointer; font-size: 15px;">Cancelar</button>
                    <button id="btn-guardar-reg" style="background: var(--primary-color); color: white; border: none; font-weight: bold; padding: 10px 20px; border-radius: 12px; cursor: pointer; font-size: 15px;">Guardar Reporte</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(m); 
        setTimeout(() => { m.style.opacity = '1'; m.children[0].style.transform = 'scale(1)'; }, 10);
        
        function cerrarModal() { m.style.opacity = '0'; m.children[0].style.transform = 'scale(0.95)'; setTimeout(() => m.remove(), 200); }
        document.getElementById('btn-cancelar-reg').onclick = cerrarModal;
        
        document.getElementById('btn-guardar-reg').onclick = async () => {
            const btn = document.getElementById('btn-guardar-reg');
            btn.innerText = "Guardando..."; btn.disabled = true;
            
            const cobertura = document.querySelector('input[name="cobertura"]:checked').value;
            const notas = document.getElementById('notas-registro').value.trim();
            const manzanasAGuardar = Array.from(window.manzanasSeleccionadas);
            const ahoraMillis = Date.now();
            
            const docId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : ahoraMillis.toString();
            
            const data = {
                fecha: ahoraMillis,
                manzanas: manzanasAGuardar,
                cobertura: cobertura,
                notas: notas,
                reportadoPor: window.miUsuario.nombre
            };

            try {
                await setDoc(doc(db, "congregaciones", window.miUsuario.congregacionId, "registro_actividad", docId), data);
                
                const prefijosInvolucrados = [...new Set(manzanasAGuardar.map(m => m.split("-")[0].trim()))];
                
                for (const prefijo of prefijosInvolucrados) {
                    const todasLasManzanasDelTerritorio = [];
                    window.mapaGlobal.data.forEach(feature => {
                        const t = feature.getProperty('territorio');
                        const n = feature.getProperty('numero');
                        if (t && n && n.toLowerCase() !== 'plaza') {
                            const e = `T${t} - ${n}`;
                            if (e.split('-')[0].trim() === prefijo) todasLasManzanasDelTerritorio.push(e);
                        }
                    });

                    if (cobertura === "Completo") {
                        for (const m of todasLasManzanasDelTerritorio) {
                            await setDoc(doc(db, "congregaciones", window.miUsuario.congregacionId, "gestion_mapas", m), { id: m, estaDisponible: true, asignadoA: "", fecha: 0 });
                        }
                    } else {
                        const fechaUltimoCompleto = ultimaFechaCompletoPorTerritorio[prefijo] || 0;
                        const hechasEnCiclo = todasLasManzanasDelTerritorio.filter(m => {
                            const f = ultimosReportesPorManzana[m] || 0;
                            return f > fechaUltimoCompleto || manzanasAGuardar.includes(m);
                        });
                        
                        if (hechasEnCiclo.length === todasLasManzanasDelTerritorio.length && todasLasManzanasDelTerritorio.length > 0) {
                            for (const m of todasLasManzanasDelTerritorio) {
                                await setDoc(doc(db, "congregaciones", window.miUsuario.congregacionId, "gestion_mapas", m), { id: m, estaDisponible: true, asignadoA: "", fecha: 0 });
                            }
                            
                            const docIdCierre = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : (Date.now() + 1000).toString();
                            const dataCierre = {
                                fecha: ahoraMillis + 1000, 
                                manzanas: todasLasManzanasDelTerritorio,
                                cobertura: "Completo",
                                notas: "Ciclo cerrado automáticamente (Suma de parciales)",
                                reportadoPor: "Sistema Automático"
                            };
                            await setDoc(doc(db, "congregaciones", window.miUsuario.congregacionId, "registro_actividad", docIdCierre), dataCierre);
                        }
                    }
                }

                if(window.mostrarToastM3) window.mostrarToastM3("Reporte guardado", "success");
                cerrarModal();
                
                window.modoRegistroActivo = false;
                window.manzanasSeleccionadas.clear();
                document.getElementById('registro-panel').style.display = 'none';
                document.getElementById('fab-registro').style.display = 'flex';
                refrescarEstilosMapa();

            } catch(e) {
                console.error(e);
                if(window.mostrarToastM3) window.mostrarToastM3("Error al guardar", "error");
                btn.innerText = "Guardar Reporte"; btn.disabled = false;
            }
        };
    };
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