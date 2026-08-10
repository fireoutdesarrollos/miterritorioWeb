// ==========================================
// ARCHIVO: ministerio-service.js
// ==========================================
import { collection, doc, setDoc, deleteDoc, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
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
const btnPerfilWeb = document.querySelector('.icon-profile') || document.getElementById('btn-perfil-web'); // Engancha tu botón de iniciales
const selectMeta = document.getElementById('select-meta-horas');
const cajaMetaPersonalizada = document.getElementById('caja-meta-personalizada');
const inputMetaPersonalizada = document.getElementById('input-meta-personalizada');
const modalPerfil = document.getElementById('modal-perfil');

// 3. INICIALIZADOR PRINCIPAL (Se llama desde app.js)
export function inicializarMinisterio() {
    if (!btnNav) return;
    
    btnNav.style.display = 'flex'; // Mostramos el botón superior
    
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
        iconoCrono.innerText = "⏸️"; 
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
            tiempoInicio = Date.now() - tiempoPausa;
            cronometroActivo = true;
            localStorage.setItem('crono_activo', 'true');
            localStorage.setItem('crono_inicio', tiempoInicio.toString());
            iniciarBucleReloj();
            modalCrono.style.display = 'none';
        }
    };

    // --- EVENTOS DEL MODAL DE PERFIL Y METAS ---
    const btnPerfilWeb = document.querySelector('.icon-profile') || document.getElementById('btn-perfil-web'); 
    const modalPerfil = document.getElementById('modal-perfil');
    const btnCerrarPerfil = document.getElementById('btn-cerrar-perfil');
    
    const selectMeta = document.getElementById('select-meta-horas');
    const cajaMetaPersonalizada = document.getElementById('caja-meta-personalizada');
    const inputMetaPersonalizada = document.getElementById('input-meta-personalizada');
    const btnGuardarMeta = document.getElementById('btn-guardar-meta');

    // 1. Abrir el modal de perfil al tocar tus iniciales
    if (btnPerfilWeb && modalPerfil) {
        btnPerfilWeb.onclick = () => {
            if (selectMeta) {
                selectMeta.value = metaHoras > 0 && ![15, 30, 50].includes(metaHoras) ? "-1" : metaHoras.toString();
                if (cajaMetaPersonalizada) cajaMetaPersonalizada.style.display = selectMeta.value === "-1" ? 'block' : 'none';
                if (selectMeta.value === "-1" && inputMetaPersonalizada) inputMetaPersonalizada.value = metaHoras;
            }
            modalPerfil.style.display = 'flex';
        };
    }

    // 2. Cerrar el modal de perfil
    if (btnCerrarPerfil) {
        btnCerrarPerfil.onclick = () => {
            if (modalPerfil) modalPerfil.style.display = 'none';
        };
    }

    // 3. Lógica para guardar la meta
    if (selectMeta && btnGuardarMeta) {
        selectMeta.onchange = (e) => {
            if (cajaMetaPersonalizada) cajaMetaPersonalizada.style.display = e.target.value === "-1" ? 'block' : 'none';
        };

        btnGuardarMeta.onclick = () => {
            let nuevaMeta = parseInt(selectMeta.value);
            if (nuevaMeta === -1) {
                nuevaMeta = parseInt(inputMetaPersonalizada.value) || 0;
            }
            
            metaHoras = nuevaMeta;
            localStorage.setItem('meta_horas', nuevaMeta.toString());
            
            // Actualizamos la tarjeta al instante
            if (typeof actualizarDashboard === 'function') actualizarDashboard();
            
            if(window.mostrarToastM3) window.mostrarToastM3("Meta guardada.", "success");
            
            // Opcional: cerramos el panel de perfil luego de guardar
            if (modalPerfil) modalPerfil.style.display = 'none';
        };
    }
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
    textoCrono.innerText = "Comenzar a predicar";
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

function formatearAHorasMinutos(ms) {
    const horas = Math.floor(ms / (1000 * 60 * 60));
    const minutos = Math.floor((ms / (1000 * 60)) % 60);
    return `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`;
}


// Variable global para guardar los registros del mes
let registrosMes = [];
let totalMilisegundosMes = 0;

// 5. CARGAR DATOS DE FIREBASE PARA EL DASHBOARD
export function escucharHorasMensuales() {
    if (!window.miUsuario || !window.miUsuario.email) return;

    const fechaActual = new Date();
    const inicioMes = new Date(fechaActual.getFullYear(), fechaActual.getMonth(), 1).getTime();

    const q = query(
        collection(db, "usuarios", window.miUsuario.email, "registros_predicacion"),
        where("fecha", ">=", inicioMes)
    );

    onSnapshot(q, (snapshot) => {
        totalMilisegundosMes = 0;
        registrosMes = [];
        
        snapshot.forEach(doc => {
            const data = doc.data();
            totalMilisegundosMes += data.duracionMillis || 0;
            registrosMes.push(data);
        });
        
        // Ordenamos los registros desde el más nuevo al más viejo
        registrosMes.sort((a, b) => b.fecha - a.fecha);
        
        actualizarDashboard();
        
        // Si el modal está abierto, lo actualiza en vivo
        if (document.getElementById('modal-historial-servicio').style.display === 'flex') {
            renderizarHistorialHoras();
        }
    });

    // 🔥 EVENTO CLIC EN EL TABLERO 🔥
    const btnDashboard = document.getElementById('dashboard-ministerio');
    const modalHistorial = document.getElementById('modal-historial-servicio');
    const btnCerrarHistorial = document.getElementById('btn-cerrar-historial');

    if (btnDashboard) {
        btnDashboard.onclick = () => {
            renderizarHistorialHoras();
            modalHistorial.style.display = 'flex';
            history.pushState({ modal: 'historial_horas' }, null, null); // Para el botón atrás de Android
        };
    }

    if (btnCerrarHistorial) {
        btnCerrarHistorial.onclick = () => {
            modalHistorial.style.display = 'none';
        };
    }
}

// Dibuja la lista de días adentro del historial
let registroEditandoId = null;

const modalEditarHoras = document.getElementById('modal-editar-horas');
const tituloModalHoras = document.getElementById('titulo-modal-horas');
const inputFecha = document.getElementById('input-edit-fecha');

// 🔥 EL NUEVO BOTÓN "+" 🔥
if (document.getElementById('btn-agregar-registro-manual')) {
    document.getElementById('btn-agregar-registro-manual').onclick = () => {
        registroEditandoId = null; // Avisa que es un registro nuevo
        tituloModalHoras.innerText = "➕ Agregar Tiempo";
        
        // Ponemos la fecha de hoy por defecto en el calendario
        const hoy = new Date();
        const offset = hoy.getTimezoneOffset();
        const fechaLocal = new Date(hoy.getTime() - (offset*60*1000)).toISOString().split('T')[0];
        
        inputFecha.value = fechaLocal;
        document.getElementById('input-edit-horas').value = "";
        document.getElementById('input-edit-minutos').value = "";
        
        modalEditarHoras.style.display = 'flex';
    };
}

if (document.getElementById('btn-cancelar-edit-horas')) {
    document.getElementById('btn-cancelar-edit-horas').onclick = () => {
        modalEditarHoras.style.display = 'none';
        registroEditandoId = null;
    };
}

if (document.getElementById('btn-guardar-edit-horas')) {
    document.getElementById('btn-guardar-edit-horas').onclick = async (e) => {
        const h = parseInt(document.getElementById('input-edit-horas').value) || 0;
        const m = parseInt(document.getElementById('input-edit-minutos').value) || 0;
        const nuevoMillis = ((h * 60) + m) * 60 * 1000;
        
        if (nuevoMillis === 0) {
            if(window.mostrarToastM3) window.mostrarToastM3("Ingresa un tiempo válido", "error");
            return;
        }

        const fechaStr = inputFecha.value;
        if (!fechaStr) {
            if(window.mostrarToastM3) window.mostrarToastM3("Selecciona una fecha", "error");
            return;
        }

        // Armamos la fecha a mediodía para evitar cambios de día por zona horaria
        const partes = fechaStr.split('-');
        const fechaAGuardar = new Date(partes[0], partes[1] - 1, partes[2], 12, 0, 0).getTime();
        
        const btn = e.target;
        btn.innerText = "Guardando...";
        
        try {
            if (registroEditandoId) {
                // MODO EDICIÓN
                await setDoc(doc(db, "usuarios", window.miUsuario.email, "registros_predicacion", registroEditandoId), { 
                    duracionMillis: nuevoMillis,
                    fecha: fechaAGuardar 
                }, { merge: true });
                if(window.mostrarToastM3) window.mostrarToastM3("Registro actualizado", "success");
            } else {
                // MODO CREACIÓN NUEVA
                const nuevoId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString();
                await setDoc(doc(db, "usuarios", window.miUsuario.email, "registros_predicacion", nuevoId), { 
                    id: nuevoId,
                    fecha: fechaAGuardar,
                    duracionMillis: nuevoMillis
                });
                if(window.mostrarToastM3) window.mostrarToastM3("Registro agregado", "success");
            }
            modalEditarHoras.style.display = 'none';
        } catch(error) {
            if(window.mostrarToastM3) window.mostrarToastM3("Error al guardar", "error");
        } finally {
            btn.innerText = "Guardar";
            registroEditandoId = null;
        }
    };
}

// Dibuja la lista de días adentro del historial
function renderizarHistorialHoras() {
    const container = document.getElementById('lista-registros-horas');
    if (!container) return;
    
    container.innerHTML = '';
    document.getElementById('historial-total-hs').innerText = formatearAHorasMinutos(totalMilisegundosMes) + ' hs';

    if (registrosMes.length === 0) {
        container.innerHTML = '<p style="color: gray; text-align: center; margin-top: 30px;">No hay registros este mes.</p>';
        return;
    }

    registrosMes.forEach(reg => {
        const fechaObj = new Date(reg.fecha);
        const opcionesFecha = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
        let fechaTexto = fechaObj.toLocaleDateString('es-ES', opcionesFecha);
        fechaTexto = fechaTexto.charAt(0).toUpperCase() + fechaTexto.slice(1);

        const item = document.createElement('div');
        item.style.cssText = "background: var(--surface-color); border-radius: 12px; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; border: 1px solid var(--border-color);";
        
        const horasFormateadas = formatearAHorasMinutos(reg.duracionMillis);
        
        item.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 4px;">
                <span style="color: var(--text-color); font-size: 14px;">${fechaTexto}</span>
                <span style="color: var(--primary-color); font-weight: bold; font-size: 16px;">${horasFormateadas} hs</span>
            </div>
            <div style="display: flex; gap: 8px;">
                <button class="btn-editar-reg" style="background: transparent; border: none; font-size: 18px; cursor: pointer; padding: 5px; opacity: 0.8;">✏️</button>
                <button class="btn-borrar-reg" style="background: transparent; border: none; font-size: 18px; cursor: pointer; padding: 5px; opacity: 0.8;">🗑️</button>
            </div>
        `;

        // Acción: Editar
        item.querySelector('.btn-editar-reg').onclick = () => {
            registroEditandoId = reg.id;
            tituloModalHoras.innerText = "✏️ Editar Tiempo";
            
            const h = Math.floor(reg.duracionMillis / (1000 * 60 * 60));
            const m = Math.floor((reg.duracionMillis / (1000 * 60)) % 60);
            
            // Reconstuir la fecha guardada para que aparezca en el calendario
            const f = new Date(reg.fecha);
            const offset = f.getTimezoneOffset();
            const fechaLocal = new Date(f.getTime() - (offset*60*1000)).toISOString().split('T')[0];
            
            inputFecha.value = fechaLocal;
            document.getElementById('input-edit-horas').value = h;
            document.getElementById('input-edit-minutos').value = m;
            
            modalEditarHoras.style.display = 'flex';
        };

        // Acción: Borrar
        item.querySelector('.btn-borrar-reg').onclick = () => {
            if (window.mostrarModalConfirmacionGlobal) {
                window.mostrarModalConfirmacionGlobal(
                    "¿Eliminar registro?",
                    "Esta acción borrará este tiempo de tu total del mes.",
                    "Sí, eliminar",
                    "var(--error-text)",
                    async () => {
                        await deleteDoc(doc(db, "usuarios", window.miUsuario.email, "registros_predicacion", reg.id));
                        if(window.mostrarToastM3) window.mostrarToastM3("Registro eliminado", "success");
                    }
                );
            } else if (confirm("¿Seguro que deseas eliminar este registro de horas?")) {
                deleteDoc(doc(db, "usuarios", window.miUsuario.email, "registros_predicacion", reg.id));
            }
        };

        container.appendChild(item);
    });
}

function actualizarDashboard() {
    const horasElement = document.getElementById('horas-totales-mes');
    const porcentajeElement = document.getElementById('porcentaje-meta');
    
    if (horasElement) {
        const horas = Math.floor(totalMilisegundosMes / (1000 * 60 * 60));
        const minutos = Math.floor((totalMilisegundosMes / (1000 * 60)) % 60);
        horasElement.innerText = `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')} hs`;
    }

    if (porcentajeElement) {
        let porcentaje = 0;
        if (metaHoras > 0) {
            const horasDecimales = totalMilisegundosMes / (1000 * 60 * 60);
            porcentaje = Math.min(Math.round((horasDecimales / metaHoras) * 100), 100);
        } else {
            porcentaje = 100;
        }

        porcentajeElement.innerText = `${porcentaje}%`;
        
        try {
            const anilloContainer = porcentajeElement.parentElement.parentElement;
            if (anilloContainer && anilloContainer.style) {
                anilloContainer.style.setProperty('--progreso', `${porcentaje}%`);
            }
        } catch (e) {
            console.log("No se pudo animar el anillo.");
        }
    }
}