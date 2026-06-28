// ==========================================
// ARCHIVO: guide-service.js (GUÍA INTERACTIVA M3 - TEXTOS WEB)
// ==========================================

export function inicializarGuias() {
    const btnAyuda = document.querySelector('.icon-help');
    if (!btnAyuda) return;

    btnAyuda.addEventListener('click', () => {
        const tabActiva = document.querySelector('.tab.active');
        if (!tabActiva) return;
        
        const target = tabActiva.getAttribute('data-target');
        mostrarGuiaParaTab(target);
    });
}

function mostrarGuiaParaTab(target) {
    const rol = window.miUsuario ? window.miUsuario.rol : 'publicador';
    const esAdminOConductor = rol === 'siervo' || rol === 'ayudante' || rol === 'conductor';
    let pasos = [];

    if (target === 'map-view') {
        if (esAdminOConductor) {
            pasos.push({ titulo: "🗺️ Tu Territorio en Vivo", desc: "Aquí puedes ver todas las manzanas de la congregación. Los colores te indicarán cuáles están libres, ocupadas por otros, y cuáles son tuyas.", icono: "🗺️" });
        } else {
            pasos.push({ titulo: "🗺️ Tu Territorio en Vivo", desc: "Aquí verás el mapa de la congregación. Tu territorio asignado se resaltará en color verde para que sepas exactamente dónde predicar.", icono: "🗺️" });
        }
        
        // CORRECCIÓN WEB: Clic en la manzana en vez de mantener presionado
        pasos.push({ titulo: "📍 Registrar una Visita", desc: "Para anotar a una nueva persona, simplemente haz clic (o toca) directamente sobre cualquier manzana en el mapa.", icono: "📍" });
        
        pasos.push({ titulo: "👆 Ver Detalles", desc: "Si tocas cualquiera de los pines de colores que dejaste en el mapa, abrirás su ficha para actualizar la visita.", icono: "👆" });
        
        if (esAdminOConductor) {
            pasos.push({ titulo: "📋 Modo Registro", desc: "Como tienes privilegios, verás un botón flotante con una tabla para seleccionar manzanas y reportar rápidamente la predicación de hoy.", icono: "📋" });
        }
    } else if (target === 'visitas-view') {
        pasos = [
            { titulo: "📁 Tu Libreta Digital", desc: "Aquí verás todas las personas que has visitado, ordenadas desde la más reciente a la más antigua.", icono: "📁" },
            { titulo: "🔍 Filtros Rápidos", desc: "Usa los botones superiores para filtrar tu libreta y ver solo tus Revisitas, los Estudios o los Ausentes.", icono: "🔍" },
            
            // CORRECCIÓN WEB: Tocar la X en vez de mantener presionado
            { titulo: "✏️ Editar o Borrar", desc: "Toca una tarjeta para abrir su ficha. Si necesitas borrar una conversación antigua, simplemente toca la pequeña '✕' roja junto a la fecha en el historial.", icono: "✏️" }
        ];
    } else if (target === 'servicio-view') {
        pasos = [
            { titulo: "🛠️ Rincón de Servicio", desc: "Bienvenido a la administración. Desde aquí puedes coordinar los territorios, revisar informes y gestionar los accesos de la congregación.", icono: "🛠️" },
            { titulo: "🗺️ Gestión de Territorios", desc: "En el inventario puedes seleccionar múltiples manzanas para asignárselas a un publicador o recibirlas de vuelta cuando las terminen.", icono: "🗺️" },
            { titulo: "📊 Reportes y Estadísticas", desc: "Mira el historial de actividad y analiza fácilmente qué zonas de la congregación llevan más tiempo sin predicarse.", icono: "📊" },
            { titulo: "👥 Hermanos y Permisos", desc: "Administra los accesos y modifica los roles (Siervo, Ayudante, Conductor o Publicador) de los hermanos que usan la app.", icono: "👥" }
        ];
    }

    if (pasos.length > 0) renderizarModalGuia(pasos);
}

function renderizarModalGuia(pasos) {
    let pasoActual = 0;
    
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.7); z-index: 10000; display: flex; align-items: center; justify-content: center; padding: 20px; box-sizing: border-box; backdrop-filter: blur(3px);';
    
    const card = document.createElement('div');
    card.style.cssText = 'background: var(--surface-color, #2B2A33); width: 100%; max-width: 340px; border-radius: 20px; padding: 30px 24px; text-align: center; box-shadow: 0 10px 40px rgba(0,0,0,0.5); border: 1px solid var(--border-color, #3F3E47); display: flex; flex-direction: column; align-items: center;';
    
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    
    function actualizarVista() {
        const paso = pasos[pasoActual];
        const esUltimo = pasoActual === pasos.length - 1;
        
        const dotsHTML = pasos.map((_, i) => {
            const color = i === pasoActual ? 'var(--primary-color, #CBA4FF)' : 'var(--border-color, #555)';
            const width = i === pasoActual ? '16px' : '8px';
            return `<div style="width: ${width}; height: 8px; border-radius: 4px; background: ${color}; transition: all 0.3s;"></div>`;
        }).join('');
        
        card.innerHTML = `
            <div style="font-size: 56px; margin-bottom: 20px; line-height: 1;">${paso.icono}</div>
            <h3 style="margin: 0 0 12px 0; font-size: 20px; font-weight: bold; color: var(--text-color, white);">${paso.titulo}</h3>
            <p style="margin: 0 0 30px 0; font-size: 15px; line-height: 1.5; color: var(--text-muted, #A0A0A0); min-height: 70px;">${paso.desc}</p>
            
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                <div style="display: flex; gap: 6px;">
                    ${dotsHTML}
                </div>
                <button id="btn-guia-siguiente" style="background: var(--primary-color, #CBA4FF); color: #4A148C; border: none; padding: 12px 24px; border-radius: 12px; font-weight: bold; cursor: pointer; transition: background 0.2s;">
                    ${esUltimo ? '¡Entendido!' : 'Siguiente'}
                </button>
            </div>
        `;
        
        document.getElementById('btn-guia-siguiente').onclick = () => {
            if (esUltimo) {
                overlay.style.opacity = '0';
                setTimeout(() => overlay.remove(), 200);
            } else {
                pasoActual++;
                actualizarVista();
            }
        };
    }
    
    actualizarVista();
}