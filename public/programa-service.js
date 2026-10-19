// ==========================================
// ARCHIVO: programa-service.js
// ==========================================
import { db } from './firebase-core.js';
import { doc, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';

let bannerYaMostrado = false;

// 🔥 1. Normalizador de textos (Quita tildes, igual que en Android)
function normalizarTexto(texto) {
    if (!texto) return "";
    return texto.trim().toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); 
}

// 🔥 2. Motor de tiempo: Suma 2 horas exactas a la hora fijada
function calcularLimiteVigencia(fechaMillis, horaStr) {
    const date = new Date(fechaMillis);
    if (horaStr && horaStr.includes(":")) {
        const partes = horaStr.split(":");
        date.setHours(parseInt(partes[0], 10), parseInt(partes[1], 10), 0, 0);
    }
    return date.getTime() + (2 * 60 * 60 * 1000);
}

// 🔥 3. Escucha la base de datos en tiempo real
export function inicializarProgramaPublico() {
    const congId = localStorage.getItem('cong_id') || localStorage.getItem('congregacion_id');
    if (!congId) return;

    const planificadorRef = doc(db, 'congregaciones', congId, 'planificador', 'semana_actual');
    
    onSnapshot(planificadorRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            procesarSalidas(data.salidas || []);
        } else {
            renderizarPrograma([]);
        }
    });
}

// 🔥 4. Procesa y filtra las salidas
function procesarSalidas(salidas) {
    const ahora = Date.now();
    
    // Leemos el nombre exacto que guardamos en auth-service.js
    const miNombreCompleto = localStorage.getItem('nombre_completo_publicador') || "";
    const miNombreCompletoNorm = normalizarTexto(miNombreCompleto);

    // FILTRO: Solo dejamos las que no hayan pasado su límite de 2 horas
    const salidasVigentes = salidas.filter(salida => {
        const limite = calcularLimiteVigencia(salida.fechaMillis, salida.horaStr);
        return ahora <= limite;
    }).sort((a, b) => (a.fechaMillis || 0) - (b.fechaMillis || 0));

    renderizarPrograma(salidasVigentes);

    // LÓGICA DEL BANNER ANIMADO
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

    // Desaparece a los 15 segundos
    setTimeout(() => { ocultarBanner(banner); }, 16200);

    banner.onclick = () => ocultarBanner(banner);
}

function ocultarBanner(banner) {
    banner.style.transform = 'translateY(-150%)';
    banner.style.opacity = '0';
    setTimeout(() => { banner.style.display = 'none'; }, 500);
}

// 🔥 6. Dibujar las tarjetas idénticas a Compose
function renderizarPrograma(salidas) {
    const contenedor = document.getElementById('lista-programa-publico');
    if (!contenedor) return;

    if (salidas.length === 0) {
        contenedor.innerHTML = `<p style="color: gray; text-align: center; margin-top: 40px;">No hay salidas programadas o ya finalizaron.</p>`;
        return;
    }

    contenedor.innerHTML = '';
    
    salidas.forEach(salida => {
        const date = new Date(salida.fechaMillis);
        const opciones = { weekday: 'long', day: 'numeric', month: 'long' };
        let fechaStr = date.toLocaleDateString('es-ES', opciones);
        fechaStr = fechaStr.charAt(0).toUpperCase() + fechaStr.slice(1);

        const card = document.createElement('div');
        card.style.cssText = 'background: var(--surface-color); border-radius: 12px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.2); margin-bottom: 16px;';
        
        const territorios = salida.tipo === "Exhibidores" ? "N/A" : (salida.territorios || "");

        card.innerHTML = `
            <div style="background: var(--primary-container, #4b2c91); padding: 12px 16px; display: flex; justify-content: space-between; align-items: center;">
                <span style="color: var(--on-primary-container, white); font-weight: bold; font-size: 15px;">${fechaStr}</span>
                <span style="color: var(--primary-color, #CBA4FF); font-weight: 900; font-size: 18px;">${salida.horaStr || ''}</span>
            </div>
            <div style="padding: 16px; display: flex; flex-direction: column; gap: 12px; color: var(--text-color); font-size: 14px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="color: gray;">📍</span> <strong>Lugar:</strong> ${salida.lugar || ''}
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
