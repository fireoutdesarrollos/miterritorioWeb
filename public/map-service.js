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
            // Verifica que TODAS las palabras escritas estén en la opción (no importa el orden)
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
    // 0. Cargar listas y activar la búsqueda inteligente
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
            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div class="chat-meta">${nota.fecha}</div>
                    <span style="color:var(--error-text); cursor:pointer; font-size:14px; font-weight:bold; padding: 0 5px;" class="btn-borrar-nota">✕</span>
                </div>
                <div class="chat-text">${nota.texto}</div>
            `;
            
            card.querySelector('.btn-borrar-nota').onclick = () => {
                if(confirm("¿Seguro que deseas eliminar esta conversación del historial?")) {
                    window.listaNotasActuales = window.listaNotasActuales.filter(n => n.id !== nota.id);
                    renderizarHistorial();
                    
                    const visitaActualizada = { notas: empaquetarNotasHistorial(window.listaNotasActuales) };
                    setDoc(doc(db, "usuarios", window.miUsuario.email, "mis_visitas", visita.id), visitaActualizada, { merge: true });
                }
            };
            container.appendChild(card);
        });
    }
    
    renderizarHistorial();

    if (gn('ficha-modal')) gn('ficha-modal').style.display = 'flex';
}