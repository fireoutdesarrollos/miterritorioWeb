// ==========================================
// ARCHIVO: ui-controller.js (SIN CONFLICTOS + CANDADO DE PRIVACIDAD)
// ==========================================

export function iniciarControladorUI() {
    // 1. Manejo de Pestañas (Tabs)
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
            
            if (tId === 'map-view' && tView) tView.style.display = 'flex'; 
            else if (tView) tView.style.display = 'block';
        });
    });

    // 2. Cerrar Modales básicos
    const btnCerrarFicha = document.getElementById('btn-cerrar-ficha');
    if (btnCerrarFicha) btnCerrarFicha.onclick = () => history.back();

    // 🛑 ATENCIÓN: Se eliminó el eventListener 'popstate' de aquí.
    // Ahora el Escudo Avanzado de app.js tiene el control exclusivo del botón "Atrás" de Android.
}

// 🔥 EL CANDADO DEFINITIVO DE PRIVACIDAD 🔥
export function aplicarCandadoPrivacidad(rol) {
    const tabServicio = document.querySelector('.tab[data-target="servicio-view"]');
    
    if (!tabServicio) return;

    // Solo la alta gerencia puede ver la pestaña
    if (rol === 'siervo' || rol === 'ayudante') {
        tabServicio.style.display = 'flex'; // o 'block', dependiendo de tu flexbox
    } else {
        // Publicadores, invitados y CONDUCTORES rebotan acá
        tabServicio.style.display = 'none';
        
        // Medida de seguridad extra: si un conductor estaba en la pestaña, lo pateamos al mapa
        if (tabServicio.classList.contains('active')) {
            const tabMapa = document.querySelector('.tab[data-target="map-view"]');
            if (tabMapa) tabMapa.click();
        }
    }
}