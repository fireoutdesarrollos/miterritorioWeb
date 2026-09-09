// ==========================================
// ARCHIVO: ui-controller.js (CANDADO DE PRIVACIDAD)
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
import { guardarNuevoPuntoSalida } from './map-service.js';

document.addEventListener('DOMContentLoaded', () => {
    const modalPunto = document.getElementById('modal-punto-salida');
    
    // Abrir modal
    document.getElementById('btn-abrir-modal-punto')?.addEventListener('click', () => {
        modalPunto.style.display = 'flex';
    });

    // Cerrar modal
    document.getElementById('btn-cancelar-punto')?.addEventListener('click', () => {
        modalPunto.style.display = 'none';
    });

    // Guardar en Firebase
    document.getElementById('btn-guardar-punto')?.addEventListener('click', async () => {
        const nombre = document.getElementById('punto-nombre').value;
        const lat = document.getElementById('punto-lat').value;
        const lng = document.getElementById('punto-lng').value;
        const emoji = document.getElementById('punto-emoji').value;

        if (!nombre || !lat || !lng) {
            alert("Por favor, completa el nombre y las coordenadas.");
            return;
        }

        // Cambiamos el texto del botón mientras guarda
        const btnGuardar = document.getElementById('btn-guardar-punto');
        btnGuardar.innerText = "Guardando...";
        btnGuardar.disabled = true;

        const exito = await guardarNuevoPuntoSalida(nombre, lat, lng, emoji);
        
        if (exito) {
            modalPunto.style.display = 'none';
            // Limpiamos los campos para la próxima vez
            document.getElementById('punto-nombre').value = '';
            document.getElementById('punto-lat').value = '';
            document.getElementById('punto-lng').value = '';
            document.getElementById('punto-emoji').value = '📍';
            alert("Lugar guardado. Ya debería aparecer en el mapa.");
        } else {
            alert("Hubo un error al guardar.");
        }

        btnGuardar.innerText = "Guardar";
        btnGuardar.disabled = false;
    });
});
