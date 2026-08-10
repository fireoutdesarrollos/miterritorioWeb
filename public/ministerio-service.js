// ==========================================
// ARCHIVO: ministerio-service.js
// ==========================================
import { collection, doc, setDoc, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { db } from "./firebase-core.js";

// 1. VARIABLES DE MEMORIA PERSISTENTE (localStorage)
let cronometroActivo = localStorage.getItem('crono_activo') === 'true';
let tiempoInicio = parseInt(localStorage.getItem('crono_inicio')) || 0;
let tiempoPausa = parseInt(localStorage.getItem('crono_pausa')) || 0;
let metaHoras = parseInt(localStorage.getItem('meta_horas')) || 0;

let intervaloReloj = null;
let milisegundosActuales = 0;

// 2. REFERENCIAS A LA UI
const btnNav = document.getElementById('btn-cronometro-nav');
const iconoCrono = document.getElementById('icono-crono');
const textoCrono = document.getElementById('texto-crono');

const modalCrono = document.getElementById('modal-cronometro');
const displayModal = document.getElementById('crono-display-modal');

const modalMeta = document.getElementById('modal-meta');
const btnPerfilWeb = document.getElementById('btn-perfil-web');
const selectMeta = document.getElementById('select-meta-horas');
const cajaMetaPersonalizada = document.getElementById('caja-meta-personalizada');
const inputMetaPersonalizada = document.getElementById('input-meta-personalizada');

// 3. INICIALIZADOR PRINCIPAL (Se llama desde app.js)
export function inicializarMinisterio() {
    if (!btnNav) return;
    
    btnNav.style.display = 'flex'; // Mostramos el botón superior
    actualizarTextosMenuMeta();
    
    // Si recargan la página y estaba corriendo, lo retomamos
    if (cronometroActivo) {
        iniciarBucleReloj();
    } else if (tiempoPausa > 0) {
        milisegundosActuales = tiempoPausa;
        renderizarTiempo(milisegundosActuales);
        iconoCrono.innerText = "⏸️";
    }

    // --- EVENTOS DEL BOTÓN SUPERIOR ---
    btnNav.onclick = () => {
        if (!cronometroActivo) {
            // PLAY o REANUDAR
            const nuevoInicio = Date.now() - tiempoPausa;
            tiempoInicio = nuevoInicio;
            cronometroActivo = true;
            
            localStorage.setItem('crono_activo', 'true');
            localStorage.setItem('crono_inicio', nuevoInicio.toString());
            
            iniciarBucleReloj();
        } else {
            // STOP (Abre el modal)
            cronometroActivo = false;
            tiempoPausa = Date.now() - tiempoInicio;
            
            localStorage.setItem('crono_activo', 'false');
            localStorage.setItem('crono_pausa', tiempoPausa.toString());
            
            detenerBucleReloj();
            displayModal.innerText = formatearMilisegundos(tiempoPausa);
            modalCrono.style.display = 'flex';
        }
    };

    // --- EVENTOS DEL MODAL DE CRONÓMETRO ---
    document.getElementById('btn-crono-pausar').onclick = () => {
        modalCrono.style.display = 'none';
        iconoCrono.innerText = "⏸️"; // Cambia el icono arriba para mostrar que está en pausa
    };

    document.getElementById('btn-crono-eliminar').onclick = () => {
        limpiarMemoriaReloj();
        modalCrono.style.display = 'none';
    };

    document.getElementById('btn-crono-guardar').onclick = async (e) => {
        if (tiempoPausa < 60000) {
            if(window.mostrarToastM3) window.mostrarToastM3("Debes predicar al menos 1 minuto para guardar.", "error");
            return;
        }
        
        const btnGuardar = e.target;
        btnGuardar.innerText = "Guardando...";
        btnGuardar.disabled = true;

        try {
            const docId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString();
            const registro = {
                id: docId,
                fecha: Date.now(),
                duracionMillis: tiempoPausa
            };

            await setDoc(doc(db, "usuarios", window.miUsuario.email, "registros_predicacion", docId), registro);
            
            if(window.mostrarToastM3) window.mostrarToastM3("Tiempo guardado en la nube ☁️", "success");
            limpiarMemoriaReloj();
            modalCrono.style.display = 'none';
        } catch (error) {
            if(window.mostrarToastM3) window.mostrarToastM3("Error al guardar: " + error.message, "error");
        } finally {
            btnGuardar.innerText = "Guardar";
            btnGuardar.disabled = false;
        }
    };

    // Cerrar modal de crono tocando afuera
    modalCrono.onclick = (e) => {
        if (e.target === modalCrono) {
            // Tocar afuera reanuda el reloj
            tiempoInicio = Date.now() - tiempoPausa;
            cronometroActivo = true;
            localStorage.setItem('crono_activo', 'true');
            localStorage.setItem('crono_inicio', tiempoInicio.toString());
            iniciarBucleReloj();
            modalCrono.style.display = 'none';
        }
    };

    // --- EVENTOS DEL MODAL DE METAS (PERFIL) ---
    btnPerfilWeb.onclick = () => {
        selectMeta.value = metaHoras > 0 && ![15, 30, 50].includes(metaHoras) ? "-1" : metaHoras.toString();
        cajaMetaPersonalizada.style.display = selectMeta.value === "-1" ? 'block' : 'none';
        inputMetaPersonalizada.value = selectMeta.value === "-1" ? metaHoras : '';
        modalMeta.style.display = 'flex';
    };

    selectMeta.onchange = (e) => {
        cajaMetaPersonalizada.style.display = e.target.value === "-1" ? 'block' : 'none';
    };

    document.getElementById('btn-cancelar-meta').onclick = () => {
        modalMeta.style.display = 'none';
    };

    document.getElementById('btn-guardar-meta').onclick = () => {
        let nuevaMeta = parseInt(selectMeta.value);
        if (nuevaMeta === -1) {
            nuevaMeta = parseInt(inputMetaPersonalizada.value) || 0;
        }
        
        metaHoras = nuevaMeta;
        localStorage.setItem('meta_horas', nuevaMeta.toString());
        actualizarTextosMenuMeta();
        actualizarDashboard(); // Refresca el círculo
        
        if(window.mostrarToastM3) window.mostrarToastM3("Meta actualizada.", "success");
        modalMeta.style.display = 'none';
    };
}

// 4. FUNCIONES DEL RELOJ INTERNO
function iniciarBucleReloj() {
    iconoCrono.innerText = "⏹️";
    if (intervaloReloj) clearInterval(intervaloReloj);
    
    intervaloReloj = setInterval(() => {
        milisegundosActuales = Date.now() - tiempoInicio;
        renderizarTiempo(milisegundosActuales);
    }, 1000);
}

function detenerBucleReloj() {
    if (intervaloReloj) {
        clearInterval(intervaloReloj);
        intervaloReloj = null;
    }
}

function limpiarMemoriaReloj() {
    cronometroActivo = false;
    tiempoInicio = 0;
    tiempoPausa = 0;
    localStorage.setItem('crono_activo', 'false');
    localStorage.setItem('crono_inicio', '0');
    localStorage.setItem('crono_pausa', '0');
    detenerBucleReloj();
    iconoCrono.innerText = "▶️";
    textoCrono.innerText = "Predicar";
}

function renderizarTiempo(ms) {
    textoCrono.innerText = formatearMilisegundos(ms);
}

function formatearMilisegundos(ms) {
    const horas = Math.floor(ms / (1000 * 60 * 60));
    const minutos = Math.floor((ms / (1000 * 60)) % 60);
    const segundos = Math.floor((ms / 1000) % 60);
    
    if (horas > 0) {
        return `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}:${String(segundos).padStart(2, '0')}`;
    }
    return `${String(minutos).padStart(2, '0')}:${String(segundos).padStart(2, '0')}`;
}

// 5. CARGAR DATOS DE FIREBASE PARA EL DASHBOARD
export function escucharHorasMensuales() {
    if (!window.miUsuario || !window.miUsuario.email) return;

    const fechaActual = new Date();
    // Conseguimos el día 1 del mes actual a las 00:00 hs
    const inicioMes = new Date(fechaActual.getFullYear(), fechaActual.getMonth(), 1).getTime();

    const q = query(
        collection(db, "usuarios", window.miUsuario.email, "registros_predicacion"),
        where("fecha", ">=", inicioMes)
    );

    onSnapshot(q, (snapshot) => {
        totalMilisegundosMes = 0;
        snapshot.forEach(doc => {
            totalMilisegundosMes += doc.data().duracionMillis || 0;
        });
        actualizarDashboard();
    });
}

function actualizarTextosMenuMeta() {
    const textoMeta = document.getElementById('texto-meta-actual');
    if (!textoMeta) return;

    if (metaHoras === 0) textoMeta.innerText = "Sin meta fija";
    else if (metaHoras === 15) textoMeta.innerText = "Meta: Precursor Auxiliar (15 hs)";
    else if (metaHoras === 30) textoMeta.innerText = "Meta: Precursor Auxiliar (30 hs)";
    else if (metaHoras === 50) textoMeta.innerText = "Meta: Precursor Regular (50 hs)";
    else textoMeta.innerText = `Meta: Personalizada (${metaHoras} hs)`;
}

function actualizarDashboard() {
    const horasElement = document.getElementById('horas-totales-mes');
    const porcentajeElement = document.getElementById('porcentaje-meta');
    const anilloContainer = porcentajeElement ? porcentajeElement.parentElement.parentElement : null;
    
    if (!horasElement || !anilloContainer) return;

    // Calcular las horas completas del mes
    const horas = Math.floor(totalMilisegundosMes / (1000 * 60 * 60));
    const minutos = Math.floor((totalMilisegundosMes / (1000 * 60)) % 60);
    horasElement.innerText = `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')} hs`;

    // Calcular progreso
    let porcentaje = 0;
    if (metaHoras > 0) {
        // Fracción decimal de horas (ej: 14.5 horas)
        const horasDecimales = totalMilisegundosMes / (1000 * 60 * 60);
        porcentaje = Math.min(Math.round((horasDecimales / metaHoras) * 100), 100);
    } else {
        porcentaje = 100; // Si no hay meta, dibujamos el aro completo
    }

    porcentajeElement.innerText = `${porcentaje}%`;
    anilloContainer.style.setProperty('--progreso', `${porcentaje}%`);
}