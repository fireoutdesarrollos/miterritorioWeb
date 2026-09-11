// ==========================================
// ARCHIVO: app.js (MOTOR PRINCIPAL RESTAURADO)
// ==========================================
import { iniciarControladorUI, inicializarModalPuntosSalida } from "./ui-controller.js";
import { iniciarAutenticacion } from "./auth-service.js";
import { inicializarGuias } from "./guide-service.js";
import { inicializarMinisterio, escucharHorasMensuales } from "./ministerio-service.js";

console.log("🚀 MOTOR JS MODULAR (VERSIÓN 200 - ARQUITECTURA LIMPIA) CARGADO");

iniciarControladorUI();
iniciarAutenticacion();
inicializarMinisterio(); 
inicializarModalPuntosSalida(); // 🔥 Arrancamos la escucha de los botones del modal

if (typeof inicializarGuias === 'function') inicializarGuias();

// 🔥 BOTÓN DE AYUDA (ABRE LAS GUÍAS MANUALMENTE) 🔥
const btnAyuda = document.querySelector('.icon-help') || document.getElementById('btn-ayuda-web');
if (btnAyuda) {
    btnAyuda.onclick = () => {
        if (typeof inicializarGuias === 'function') {
            inicializarGuias(true); // El "true" fuerza a que se abra aunque ya la haya visto
        }
    };
}

// ========================================================
// ESCUDO DE NAVEGACIÓN M3 (BOTÓN ATRÁS NATIVO DEL CELULAR)
// ========================================================
history.pushState({ escudo: true }, null, null);

window.addEventListener('popstate', (event) => {
    let cerramosAlgo = false;

    const modalesFlotantes = Array.from(document.body.children).filter(el => {
        const z = parseInt(el.style.zIndex) || 0;
        return el.tagName === 'DIV' && el.style.position === 'fixed' && z >= 9000;
    });

    if (modalesFlotantes.length > 0) {
        modalesFlotantes[modalesFlotantes.length - 1].remove();
        cerramosAlgo = true;
    } 
    else {
        const modalPunto = document.getElementById('modal-punto-salida');
        if (modalPunto && modalPunto.style.display !== 'none' && modalPunto.style.display !== '') {
            modalPunto.style.display = 'none';
            cerramosAlgo = true;
        }
        else {
            const fichaModal = document.getElementById('ficha-modal');
            if (fichaModal && fichaModal.style.display !== 'none' && fichaModal.style.display !== '') {
                
                if (window.comprobarCambiosAntesDeSalir && window.comprobarCambiosAntesDeSalir()) {
                    history.pushState({ escudo: true }, null, null);
                    if (window.mostrarModalCambiosSinGuardar) {
                        window.mostrarModalCambiosSinGuardar(
                            () => { document.getElementById('btn-guardar-ficha').click(); }, 
                            () => { fichaModal.style.display = 'none'; } 
                        );
                    }
                    return; 
                }
                fichaModal.style.display = 'none';
                cerramosAlgo = true;
            }
            else {
                const panelRegistro = document.getElementById('panel-registro');
                if (panelRegistro && panelRegistro.style.display !== 'none' && panelRegistro.style.display !== '') {
                    panelRegistro.style.display = 'none';
                    cerramosAlgo = true;
                }
                else {
                    // 🔥 NUEVO: ESCUDO PARA LOS PANELES DE ADMINISTRACIÓN 🔥
                    const adminViews = ['admin-solicitudes-view', 'admin-planificador-view', 'admin-inventario-view', 'admin-reportes-view', 'admin-roles-view'];
                    let cerroAdmin = false;
                    for (let id of adminViews) {
                        const view = document.getElementById(id);
                        if (view && view.style.display !== 'none' && view.style.display !== '') {
                            view.style.display = 'none';
                            cerroAdmin = true;
                        }
                    }
                    // Si cerró una sub-pantalla, vuelve a mostrar los cuadraditos del menú
                    if (cerroAdmin) {
                        const dashboard = document.getElementById('admin-dashboard');
                        if (dashboard) dashboard.style.display = 'flex';
                        cerramosAlgo = true;
                    }
                }
            }
        }
    }

    if (cerramosAlgo) {
        history.pushState({ escudo: true }, null, null);
    } else {
        const tabMapa = document.querySelector('.tab[data-target="map-view"]');
        if (tabMapa && !tabMapa.classList.contains('active')) {
            tabMapa.click();
            history.pushState({ escudo: true }, null, null);
        }
    }
});