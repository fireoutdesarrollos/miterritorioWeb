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
    
    // 1. Abrir modal
    const btnAbrir = document.getElementById('btn-abrir-modal-punto');
    if (btnAbrir) {
        btnAbrir.addEventListener('click', () => {
            modalPunto.style.display = 'flex';
            history.pushState({ modalAbierto: true }, null, null);
        });
    }

    // 2. Cerrar modal
    const btnCancelar = document.getElementById('btn-cancelar-punto');
    if (btnCancelar) {
        btnCancelar.addEventListener('click', () => {
            modalPunto.style.display = 'none';
            if (history.state && history.state.modalAbierto) history.back();
        });
    }

    // 🔥 3. NUEVO: Lógica de buscar en el mapa (CON BOTÓN CANCELAR) 🔥
    const btnElegirMapa = document.getElementById('btn-elegir-mapa-punto');
    if (btnElegirMapa) {
        btnElegirMapa.addEventListener('click', () => {
            // Ocultamos el modal y activamos el "Modo Ubicación"
            modalPunto.style.display = 'none';
            window.modoUbicacionActivo = true; 
            
            // Creamos un cartel flotante avisando (ahora interactivo)
            const banner = document.createElement('div');
            banner.id = 'banner-ubicacion';
            banner.style.cssText = 'position: fixed; top: 80px; left: 50%; transform: translateX(-50%); background: #2196F3; color: white; padding: 10px 20px; border-radius: 30px; font-weight: bold; z-index: 5000; box-shadow: 0 4px 15px rgba(0,0,0,0.3); animation: fadeIn 0.3s; display: flex; align-items: center; gap: 12px;';
            banner.innerHTML = `
                <span>👇 Toca el lugar exacto</span>
                <button id="btn-cancelar-ubicacion" style="background: rgba(255,255,255,0.25); border: none; color: white; padding: 6px 12px; border-radius: 20px; font-size: 13px; font-weight: bold; cursor: pointer;">Cancelar</button>
            `;
            document.body.appendChild(banner);
            
            // Declaramos las variables de los listeners
            let list1, list2;

            // Función para atrapar el clic, guardar coords y restaurar todo
            const atraparClic = (lat, lng) => {
                if(!window.modoUbicacionActivo) return;
                window.modoUbicacionActivo = false; // Apagamos el modo
                banner.remove(); // Quitamos el cartel
                
                // Llenamos los datos invisibles y mostramos un check verde
                document.getElementById('punto-lat').value = lat;
                document.getElementById('punto-lng').value = lng;
                document.getElementById('punto-coords').value = 'Coordenadas capturadas ✅';
                
                // Volvemos a abrir el modal
                modalPunto.style.display = 'flex';
            };

            // Escuchamos UN SOLO clic en el mapa base o en una manzana
            list1 = window.mapaGlobal.addListener('click', (e) => {
                atraparClic(e.latLng.lat(), e.latLng.lng());
                google.maps.event.removeListener(list1);
                google.maps.event.removeListener(list2);
            });

            list2 = window.mapaGlobal.data.addListener('click', (e) => {
                atraparClic(e.latLng.lat(), e.latLng.lng());
                google.maps.event.removeListener(list1);
                google.maps.event.removeListener(list2);
            });

            // Lógica para el botón de cancelar
            document.getElementById('btn-cancelar-ubicacion').addEventListener('click', (e) => {
                e.stopPropagation(); // Evita que esto cuente como un clic en el mapa
                window.modoUbicacionActivo = false;
                banner.remove();
                google.maps.event.removeListener(list1);
                google.maps.event.removeListener(list2);
                modalPunto.style.display = 'flex'; // Volvemos a abrir el modal sin cambios
            });
        });
    }

    // 4. Guardar en Firebase
    const btnGuardar = document.getElementById('btn-guardar-punto');
    if (btnGuardar) {
        btnGuardar.addEventListener('click', async () => {
            const nombre = document.getElementById('punto-nombre').value;
            const lat = document.getElementById('punto-lat').value;
            const lng = document.getElementById('punto-lng').value;
            const emoji = document.getElementById('punto-emoji').value;

            if (!nombre || !lat || !lng) {
                alert("Por favor, dale un nombre y usa el botón para elegir la ubicación en el mapa.");
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
                document.getElementById('punto-coords').value = '';
                document.getElementById('punto-emoji').value = '📍';
                
                if(window.mostrarToastM3) window.mostrarToastM3("Lugar guardado. Ya debería aparecer en el mapa.", "success");
            } else {
                alert("Hubo un error al guardar.");
            }

            btnGuardar.innerText = "Guardar";
            btnGuardar.disabled = false;
        });
    }
}
