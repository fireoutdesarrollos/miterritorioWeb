// ==========================================
// ARCHIVO: app.js (MOTOR PRINCIPAL RESTAURADO)
// ==========================================
import { iniciarControladorUI } from "./ui-controller.js";
import { iniciarAutenticacion } from "./auth-service.js";
import { inicializarGuias } from "./guide-service.js";
import { inicializarMinisterio, escucharHorasMensuales } from "./ministerio-service.js";

console.log("🚀 MOTOR JS MODULAR (VERSIÓN 200 - ARQUITECTURA LIMPIA) CARGADO");

iniciarControladorUI();
iniciarAutenticacion();
inicializarMinisterio(); // Inicializa los botones del reloj

if (typeof inicializarGuias === 'function') inicializarGuias();

// Exportamos la función de escucharFirebase para que 'auth-service.js' la llame 
// justo después de que el usuario inicia sesión con éxito.
window.activarDashboardMinisterio = escucharHorasMensuales;

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