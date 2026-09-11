// ==========================================
// ARCHIVO: ui-controller.js (COMPLETO Y CORREGIDO)
// ==========================================
import { guardarNuevoPuntoSalida } from './map-service.js';

export function iniciarControladorUI() {
    // 1. Manejo de Pestañas (Tabs)
    const tabs = document.querySelectorAll('.tab');
    const views = document.querySelectorAll('.view-section');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            history.pushState({ page: 'tab' }, '', '');
            
            tabs.forEach(t => t.classList.remove('active')); 
            views.forEach(v => v.style.display = 'none');
            
            // 🔥 Aseguramos que al cambiar de pestaña principal, las sub-vistas del Siervo se oculten
            const vistaSoli = document.getElementById('admin-solicitudes-view');
            if(vistaSoli) vistaSoli.style.display = 'none';
            
            const vistaInv = document.getElementById('admin-inventario-view');
            if(vistaInv) vistaInv.style.display = 'none';
            
            const vistaRep = document.getElementById('admin-reportes-view');
            if(vistaRep) vistaRep.style.display = 'none';
            
            const vistaRol = document.getElementById('admin-roles-view');
            if(vistaRol) vistaRol.style.display = 'none';
            
            const panelPlan = document.getElementById('admin-planificador-view');
            if (panelPlan) panelPlan.style.display = 'none';

            // Restauramos el menú principal del Siervo
            const dashboardAdmin = document.getElementById('admin-dashboard');
            if(dashboardAdmin) dashboardAdmin.style.display = 'flex';
            
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
        tabServicio.style.display = 'flex'; 
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

// 🔥 LÓGICA DEL MODAL DE PUNTOS DE SALIDA 🔥
export function inicializarModalPuntosSalida() {
    const modalPunto = document.getElementById('modal-punto-salida');
    if (!modalPunto) return;
    
    // Abrir modal
    const btnAbrir = document.getElementById('btn-abrir-modal-punto');
    if (btnAbrir) {
        btnAbrir.addEventListener('click', () => {
            modalPunto.style.display = 'flex';
            history.pushState({ modalAbierto: true }, null, null); // Ancla para botón atrás Android
        });
    }

    // Cerrar modal
    const btnCancelar = document.getElementById('btn-cancelar-punto');
    if (btnCancelar) {
        btnCancelar.addEventListener('click', () => {
            modalPunto.style.display = 'none';
            // Retrocedemos el historial solo si fue abierto por botón (no afecta si el usuario usa la flecha del celular)
            if (history.state && history.state.modalAbierto) history.back();
        });
    }

    // Guardar en Firebase
    const btnGuardar = document.getElementById('btn-guardar-punto');
    if (btnGuardar) {
        btnGuardar.addEventListener('click', async () => {
            const nombre = document.getElementById('punto-nombre').value;
            const lat = document.getElementById('punto-lat').value;
            const lng = document.getElementById('punto-lng').value;
            const emoji = document.getElementById('punto-emoji').value;

            if (!nombre || !lat || !lng) {
                alert("Por favor, completa el nombre y las coordenadas.");
                return;
            }

            btnGuardar.innerText = "Guardando...";
            btnGuardar.disabled = true;

            const exito = await guardarNuevoPuntoSalida(nombre, lat, lng, emoji);
            
            if (exito) {
                modalPunto.style.display = 'none';
                document.getElementById('punto-nombre').value = '';
                document.getElementById('punto-lat').value = '';
                document.getElementById('punto-lng').value = '';
                document.getElementById('punto-emoji').value = '📍';
                
                if(window.mostrarToastM3) window.mostrarToastM3("Lugar guardado. Ya debería aparecer en el mapa.", "success");
                else alert("Lugar guardado. Ya debería aparecer en el mapa.");
            } else {
                alert("Hubo un error al guardar.");
            }

            btnGuardar.innerText = "Guardar";
            btnGuardar.disabled = false;
        });
    }
}