import { collection, getDocs, doc, getDoc, query, where, onSnapshot, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { db } from "./firebase-core.js";

window.mapaGlobal = null;
window.pinesVisitas = [];
let filtroActual = 'Todos';
let todasLasVisitas = [];

export function refrescarEstilosMapa() {
    if(!window.mapaGlobal) return;
    window.mapaGlobal.data.setStyle((feature) => {
        const numTerritorio = feature.getProperty('territorio') || '-';
        const numManzana = feature.getProperty('numero') || '-';
        const etiqueta = `T${numTerritorio} - ${numManzana}`;
        
        let fillColor = feature.getProperty('fill') || '#6200EE';
        let strokeColor = '#444444';
        let strokeWeight = 1;
        let fillOpacity = 0.35;

        if (window.modoRegistroActivo && window.manzanasSeleccionadas.has(etiqueta)) {
            fillColor = '#6200EE'; fillOpacity = 0.7; strokeColor = 'white'; strokeWeight = 3;
        }
        return { fillColor, strokeColor, strokeWeight, fillOpacity };
    });
}

function obtenerColorPin(estado) {
    let color = '#E65100'; 
    if (estado === 'Nueva') color = '#0288D1'; if (estado === 'Ausente') color = '#D32F2F'; 
    if (estado === 'Revisita') color = '#388E3C'; if (estado === 'Estudio') color = '#FBC02D'; 
    if (estado === 'No visitar') color = '#7B1FA2'; 
    return { path: google.maps.SymbolPath.CIRCLE, fillColor: color, fillOpacity: 1, strokeColor: 'white', strokeWeight: 2, scale: 8 };
}

export async function inicializarMapaYVisitas() {
    // 1. Cargar Publicaciones en la Ficha
    const ministerioSnap = await getDoc(doc(db, "configuracion", "ministerio"));
    if (ministerioSnap.exists()) {
        const dataMin = ministerioSnap.data();
        const selectPubli = document.getElementById('ficha-publi'); const selectVideo = document.getElementById('ficha-video');
        if (selectPubli && dataMin.publicaciones) dataMin.publicaciones.forEach(pub => { const o = document.createElement('option'); o.value = pub; o.textContent = pub; selectPubli.appendChild(o); });
        if (selectVideo && dataMin.videos) dataMin.videos.forEach(vid => { const o = document.createElement('option'); o.value = vid; o.textContent = vid; selectVideo.appendChild(o); });
    }

    // 2. Escuchar la Libreta de Visitas
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

    // 3. Guardar Ficha
    const btnGuardar = document.getElementById('btn-guardar-ficha');
    if (btnGuardar) {
        btnGuardar.onclick = async () => {
            const vId = window.miUsuario.visitaActivaId; if (!vId) return;
            const gn = (id) => document.getElementById(id) ? document.getElementById(id).value.trim() : '';
            const iNotas = gn('ficha-notas'); const publi = gn('ficha-publi'); const video = gn('ficha-video'); const prox = gn('ficha-proximo');
            
            let strNotas = window.miUsuario.visitaActivaNotas;
            if (iNotas.length > 0) {
                const d = new Date(); const f = `${d.getDate()} ${d.toLocaleString('es', {month:'short'})}. ${d.getFullYear()} - ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
                let msg = iNotas; if (publi) msg += `//📚 Publicación: ${publi}`; if (video) msg += `//🎬 Video: ${video}`; if (prox) msg += `//➡️ Próximo paso: ${prox}`;
                const nEntrada = `${Date.now()}&&&${f}&&&${msg}`;
                strNotas = strNotas !== "" ? `${strNotas}||${nEntrada}` : nEntrada;
            }

            await setDoc(doc(db, "usuarios", window.miUsuario.email, "mis_visitas", vId), {
                nombre: gn('ficha-nombre') || 'Nueva', apellido: gn('ficha-apellido') || 'Visita', estado: gn('ficha-estado') || 'Nueva',
                direccion: gn('ficha-direccion'), territorio: document.getElementById('ficha-terr').innerText, poligono: document.getElementById('ficha-manz').innerText,
                publicacionDejada: publi, videoVisto: video, proximoPaso: prox, notas: strNotas, latitud: window.miUsuario.tempLat, longitud: window.miUsuario.tempLng, congregacionId: window.miUsuario.congregacionId, timestamp: Date.now()
            }, { merge: true });
            history.back(); 
        };
    }

    // 4. Iniciar Google Maps
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
                marcadoresMacro.push(new google.maps.Marker({ position: { lat: d.latSum / d.count, lng: d.lngSum / d.count }, label: { text: t, color: 'black', fontWeight: '900', fontSize: '34px', className: 'map-label-macro' }, icon: { url: "", scaledSize: new google.maps.Size(0,0) } }));
            });

            window.mapaGlobal.addListener('zoom_changed', () => {
                const z = window.mapaGlobal.getZoom();
                if (z >= 15.5) { marcadoresMicro.forEach(m => m.setMap(window.mapaGlobal)); marcadoresMacro.forEach(m => m.setMap(null)); } 
                else if (z >= 13) { marcadoresMicro.forEach(m => m.setMap(null)); marcadoresMacro.forEach(m => m.setMap(window.mapaGlobal)); } 
                else { marcadoresMicro.forEach(m => m.setMap(null)); marcadoresMacro.forEach(m => m.setMap(null)); }
            });

            if (snapshotM.size > 0) { window.mapaGlobal.fitBounds(bounds); google.maps.event.trigger(window.mapaGlobal, 'zoom_changed'); }
            renderizarVisitas();
        };
        document.head.appendChild(scriptMapa);
    }
}

function renderizarVisitas() {
    const visitasContainer = document.getElementById('lista-visitas-container');
    if (!visitasContainer) return; visitasContainer.innerHTML = ''; 
    window.pinesVisitas.forEach(pin => pin.setMap(null)); window.pinesVisitas = [];

    const visitasFiltradas = todasLasVisitas.filter(v => (filtroActual === 'Todos' || v.estado === filtroActual));
    if (visitasFiltradas.length === 0) { visitasContainer.innerHTML = `<p style="color: gray; text-align: center; margin-top: 40px;">No hay visitas.</p>`; return; }

    visitasFiltradas.forEach(visita => {
        if (window.mapaGlobal && visita.latitud && visita.longitud) {
            const pin = new google.maps.Marker({ position: { lat: visita.latitud, lng: visita.longitud }, map: window.mapaGlobal, icon: obtenerColorPin(visita.estado) });
            pin.addListener('click', () => { if(!window.modoRegistroActivo) abrirFichaVisita(visita); });
            window.pinesVisitas.push(pin);
        }
        let colorPinLista = '#FF9800'; if (visita.estado === 'Nueva') colorPinLista = '#2196F3'; if (visita.estado === 'Ausente') colorPinLista = '#F44336'; if (visita.estado === 'Revisita') colorPinLista = '#4CAF50'; if (visita.estado === 'Estudio') colorPinLista = '#FFEB3B'; if (visita.estado === 'No visitar') colorPinLista = '#9C27B0'; 
        const nombreMostrar = (visita.nombre === 'Nueva' && visita.apellido === 'Visita') ? 'Visita Nueva' : `${visita.nombre} ${visita.apellido}`;
        const fecha = new Date(visita.timestamp || Date.now()).toLocaleDateString();

        const card = document.createElement('div'); card.className = 'visita-card';
        card.innerHTML = `<div class="visita-color" style="background-color: ${colorPinLista};"></div><div class="visita-info" style="flex: 1;"><h3>${nombreMostrar}</h3><p>📍 T${visita.territorio} - ${visita.poligono} | 📅 ${fecha}</p></div>`;
        card.onclick = () => { abrirFichaVisita(visita); }; visitasContainer.appendChild(card);
    });
}

function abrirFichaVisita(visita) {
    history.pushState({ page: 'modal_ficha' }, '', '');
    window.miUsuario.visitaActivaId = visita.id; window.miUsuario.visitaActivaNotas = visita.notas || "";
    window.miUsuario.tempLat = visita.latitud || 0; window.miUsuario.tempLng = visita.longitud || 0;

    const gn = (id) => document.getElementById(id);
    if(gn('ficha-nombre')) gn('ficha-nombre').value = visita.nombre !== 'Nueva' ? visita.nombre : '';
    if(gn('ficha-apellido')) gn('ficha-apellido').value = visita.apellido !== 'Visita' ? visita.apellido : '';
    if(gn('ficha-terr')) gn('ficha-terr').innerText = visita.territorio || '-'; if(gn('ficha-manz')) gn('ficha-manz').innerText = visita.poligono || '-';
    if(gn('ficha-estado')) gn('ficha-estado').value = visita.estado || 'Nueva'; if(gn('ficha-direccion')) gn('ficha-direccion').value = visita.direccion || '';
    if(gn('ficha-publi')) gn('ficha-publi').value = visita.publicacionDejada || ''; if(gn('ficha-video')) gn('ficha-video').value = visita.videoVisto || '';
    if(gn('ficha-proximo')) gn('ficha-proximo').value = visita.proximoPaso || ''; if(gn('ficha-notas')) gn('ficha-notas').value = ''; 

    const chatContainer = document.getElementById('historial-conversaciones-container');
    if (chatContainer) {
        chatContainer.innerHTML = '';
        if (!visita.notas || visita.notas.trim() === '') chatContainer.innerHTML = '<p style="color:gray;font-size:13px;text-align:center;">No hay conversaciones registradas.</p>';
        else {
            visita.notas.split('||').filter(e => e.trim() !== '').forEach(entrada => {
                const p = entrada.split('&&&'); const f = p.length >= 3 ? p[1] : (p.length === 2 ? p[0] : "Desconocida"); const c = p.length >= 3 ? p.slice(2).join('&&&') : (p.length === 2 ? p[1] : entrada);
                const div = document.createElement('div'); div.className = 'chat-bubble'; div.innerHTML = `<div class="chat-text">${c.replace(/\/\//g, '<br><br>• ')}</div><div class="chat-meta">📅 ${f}</div>`; chatContainer.appendChild(div);
            });
        }
    }
    if (gn('ficha-modal')) gn('ficha-modal').style.display = 'flex';
}