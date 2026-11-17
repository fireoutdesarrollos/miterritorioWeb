// ==========================================
// ARCHIVO: programa-service.js
// ==========================================
import { db } from './firebase-core.js';
import { doc, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';

let bannerYaMostrado = false;
let salidasCrudasCache = [];

// 🔥 1. Normalizador de textos
function normalizarTexto(texto) {
    if (!texto) return "";
    return texto.trim().toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); 
}

// 🔥 2. Motor de tiempo: Devuelve el milisegundo exacto del inicio de la salida
function obtenerInicioSalidaMillis(fechaMillis, horaStr) {
    if (!fechaMillis) return 0;
    const date = new Date(fechaMillis);
    if (horaStr && horaStr.includes(":")) {
        const partes = horaStr.split(":");
        date.setHours(parseInt(partes[0], 10) || 0, parseInt(partes[1], 10) || 0, 0, 0);
    }
    return date.getTime();
}

// 🔥 3. Escucha la base de datos en tiempo real
export function inicializarProgramaPublico() {
    let congId = localStorage.getItem('miCongregacionId') 
        || (window.miUsuario && window.miUsuario.congregacionId) 
        || localStorage.getItem('congregacionId');
    
    if (!congId) {
        const contenedor = document.getElementById('lista-programa-publico');
        if(contenedor) contenedor.innerHTML = `<p style="color: #E53935; text-align: center; margin-top: 40px;">⚠️ Error interno: No se detectó tu congregación. Intenta cerrar sesión y volver a entrar.</p>`;
        return;
    }

    const planificadorRef = doc(db, 'congregaciones', congId, 'planificador', 'semana_actual');
    
    onSnapshot(planificadorRef, (docSnap) => {
        salidasCrudasCache = docSnap.exists() ? (docSnap.data().salidas || []) : [];
        procesarSalidas(salidasCrudasCache);
    }, (error) => {
        console.error("🔴 Firebase bloqueó la lectura:", error);
        const contenedor = document.getElementById('lista-programa-publico');
        if(contenedor) contenedor.innerHTML = `<p style="color: #E53935; text-align: center; margin-top: 40px;">⚠️ Permiso denegado al leer el programa.</p>`;
    });

    // Reloj automático cada 30 segundos para que caigan las salidas 1 hora después de su inicio
    if (window.relojProgramaPublico) clearInterval(window.relojProgramaPublico);
    window.relojProgramaPublico = setInterval(() => {
        procesarSalidas(salidasCrudasCache);
    }, 30000);
}

// 🔥 4. Procesa, ordena y filtra las salidas (1 hora de vigencia)
function procesarSalidas(salidas) {
    const ahora = Date.now();
    const unaHoraMs = 1 * 60 * 60 * 1000;
    
    const miNombreCompleto = localStorage.getItem('nombre_completo_publicador') || "";
    const miNombreCompletoNorm = normalizarTexto(miNombreCompleto);

    const salidasVigentes = salidas
        .map(s => ({ ...s, inicioExacto: obtenerInicioSalidaMillis(s.fechaMillis, s.horaStr) }))
        .filter(s => s.inicioExacto > 0 && ahora <= (s.inicioExacto + unaHoraMs))
        .sort((a, b) => a.inicioExacto - b.inicioExacto);

    renderizarPrograma(salidasVigentes);

    if (!bannerYaMostrado) {
        const misSalidas = salidasVigentes.filter(s => {
            const condNorm = normalizarTexto(s.conductor || "");
            return condNorm === miNombreCompletoNorm && condNorm !== "";
        });

        if (misSalidas.length > 0) {
            mostrarBannerAsignacion(misSalidas[0]);
            bannerYaMostrado = true;
        }
    }
}

// 🔥 5. Animación del Cartel Verde
function mostrarBannerAsignacion(salida) {
    const banner = document.getElementById('banner-salida');
    const texto = document.getElementById('banner-salida-texto');
    if (!banner || !texto) return;

    const date = new Date(salida.fechaMillis);
    const opciones = { weekday: 'long', day: 'numeric' };
    let diaStr = date.toLocaleDateString('es-ES', opciones);
    diaStr = diaStr.charAt(0).toUpperCase() + diaStr.slice(1); 

    texto.innerText = `Es el ${diaStr} a las ${salida.horaStr || ''} en ${salida.lugar || ''} para predicar el territorio ${salida.territorios || ''}.`;

    banner.style.display = 'block';
    
    setTimeout(() => {
        banner.style.transform = 'translateY(0)';
        banner.style.opacity = '1';
    }, 1200);

    setTimeout(() => { ocultarBanner(banner); }, 16200);
    banner.onclick = () => ocultarBanner(banner);
}

function ocultarBanner(banner) {
    banner.style.transform = 'translateY(-150%)';
    banner.style.opacity = '0';
    setTimeout(() => { banner.style.display = 'none'; }, 500);
}

// 🔥 6. Dibujar las tarjetas (Destacando la próxima salida)
function renderizarPrograma(salidas) {
    const contenedor = document.getElementById('lista-programa-publico');
    if (!contenedor) return;

    if (salidas.length === 0) {
        contenedor.innerHTML = `<p style="color: gray; text-align: center; margin-top: 40px;">No hay salidas programadas o ya finalizaron.</p>`;
        return;
    }

    contenedor.innerHTML = '';
    
    salidas.forEach((salida, index) => {
        const esLaProxima = index === 0;
        const date = new Date(salida.fechaMillis);
        const opciones = { weekday: 'long', day: 'numeric', month: 'long' };
        let fechaStr = date.toLocaleDateString('es-ES', opciones);
        fechaStr = fechaStr.charAt(0).toUpperCase() + fechaStr.slice(1);

        const card = document.createElement('div');
        const bordeProxima = esLaProxima ? 'border: 2px solid #FFC107;' : 'border: 1px solid transparent;';
        card.style.cssText = `background: var(--surface-color); border-radius: 12px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.2); margin-bottom: 16px; ${bordeProxima}`;
        
        const territorios = salida.tipo === "Exhibidores" ? "N/A" : (salida.territorios || "");

        let lugarHtml = salida.lugar || '';
        if (salida.latitud && salida.longitud) {
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
            const isAndroid = /Android/.test(navigator.userAgent);
            
            let mapsUrl = `https://www.google.com/maps/search/?api=1&query=${salida.latitud},${salida.longitud}`;
            if (isAndroid) {
                mapsUrl = `geo:${salida.latitud},${salida.longitud}?q=${salida.latitud},${salida.longitud}(${encodeURIComponent(salida.lugar)})`;
            } else if (isIOS) {
                mapsUrl = `maps://?q=${salida.latitud},${salida.longitud}`;
            }

            lugarHtml = `<a href="${mapsUrl}" target="_blank" style="color: var(--primary-color, #CBA4FF); text-decoration: underline; font-weight: bold;">${salida.lugar}</a>`;
        }

        const badgeProxima = esLaProxima 
            ? `<span style="background: #FFC107; color: #1A1A1A; font-size: 10px; font-weight: 900; padding: 3px 8px; border-radius: 100px; letter-spacing: 0.5px; margin-left: 8px;">PRÓXIMA</span>` 
            : '';

        card.innerHTML = `
            <div style="background: var(--primary-container, #4b2c91); padding: 12px 16px; display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 4px;">
                    <span style="color: var(--on-primary-container, white); font-weight: bold; font-size: 15px;">${fechaStr}</span>
                    ${badgeProxima}
                </div>
                <span style="color: var(--primary-color, #CBA4FF); font-weight: 900; font-size: 18px;">${salida.horaStr || ''}</span>
            </div>
            <div style="padding: 16px; display: flex; flex-direction: column; gap: 12px; color: var(--text-color); font-size: 14px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="color: gray;">📍</span> <strong>Lugar:</strong> ${lugarHtml}
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="color: gray;">👤</span> <strong>Conductor:</strong> ${salida.conductor || ''}
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="color: gray;">📋</span> <strong>Territorios:</strong> ${territorios}
                </div>
                ${salida.tipo ? `
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="color: gray;">📌</span> <strong>Modalidad:</strong> ${salida.tipo}
                </div>` : ''}
            </div>
        `;
        contenedor.appendChild(card);
    });
}