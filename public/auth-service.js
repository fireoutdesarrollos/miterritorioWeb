// ==========================================
// ARCHIVO: auth-service.js (VERSIÓN DEFINITIVA CON STORAGE Y MICRÓFONO)
// ==========================================
import { signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, getDoc, collection, getDocs, updateDoc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";
import { auth, provider, db } from "./firebase-core.js";
import { inicializarMapaYVisitas } from "./map-service.js";
import { configurarPanelAdmin } from "./admin-service.js";

// Aplicar el tema guardado apenas el navegador procese el archivo JavaScript
aplicarTemaInicial();

export function iniciarAutenticacion() {
    const loginSection = document.getElementById('login-section');
    const dashboardSection = document.getElementById('dashboard-section');
    const btnLogin = document.getElementById('btn-login');

    if (btnLogin) {
        btnLogin.addEventListener('click', async () => {
            btnLogin.innerText = "Conectando con Google...";
            try {
                await signInWithPopup(auth, provider);
            } catch (error) {
                btnLogin.innerText = "Error. Intentar de nuevo";
            }
        });
    }

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            if (loginSection) loginSection.style.display = 'none';
            if (dashboardSection) dashboardSection.style.display = 'block';

            const email = user.email;
            let nombreCompleto = user.displayName || "Hermano";

            const userSnap = await getDoc(doc(db, "usuarios", email));
            if (userSnap.exists()) {
                nombreCompleto = `${userSnap.data().nombre || ''} ${userSnap.data().apellido || ''}`.trim();
            }

            window.miUsuario = { email, nombre: nombreCompleto, rol: null, congregacionId: null, congregacionNombre: null };
            let miCongregacionId = localStorage.getItem('miCongregacionId');

            if (miCongregacionId) {
                activarVigilanteRealtime(email, miCongregacionId, nombreCompleto);
            } else {
                mostrarBuscadorCongregaciones(email, nombreCompleto);
            }
            
            inyectarBotonPerfil(nombreCompleto);

        } else {
            if (loginSection) loginSection.style.display = 'flex'; 
            if (dashboardSection) dashboardSection.style.display = 'none';
            if (btnLogin) btnLogin.innerText = "Iniciar sesión con Google";
            
            document.getElementById('contenedor-onboarding')?.remove();
            document.getElementById('btn-flotante-perfil')?.remove();
            if (window.unsubVigilanteRole) { window.unsubVigilanteRole(); window.unsubVigilanteRole = null; }
            window.motoresArrancados = false; 
        }
    });
}

function aplicarTemaInicial() {
    const pref = localStorage.getItem('themePref') || 'system';
    if (pref === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    } else if (pref === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
}

function inyectarBotonPerfil(nombreCompleto) {
    if (document.getElementById('btn-flotante-perfil')) return;

    const iniciales = nombreCompleto.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'U';

    const btnPerfil = document.createElement('div');
    btnPerfil.id = 'btn-flotante-perfil';
    btnPerfil.style.cssText = 'position: fixed; top: 12px; right: 15px; width: 40px; height: 40px; border-radius: 50%; background-color: #CBA4FF; color: #4A148C; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 16px; cursor: pointer; z-index: 1000; box-shadow: 0 2px 5px rgba(0,0,0,0.2);';
    btnPerfil.innerText = iniciales;
    
    btnPerfil.onclick = () => mostrarPantallaPerfil();
    document.body.appendChild(btnPerfil);
}

function mostrarPantallaPerfil() {
    let modal = document.getElementById('modal-perfil-usuario');
    if (modal) modal.remove();

    const iniciales = window.miUsuario.nombre.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'U';
    
    const rolesMapeados = {
        "siervo": "Siervo de Territorios",
        "ayudante": "Ayudante de Territorios",
        "conductor": "Conductor de Grupo",
        "publicador": "Publicador",
        "pendiente": "En espera"
    };

    const congNombre = window.miUsuario.congregacionNombre || "Suarez";
    const congId = window.miUsuario.congregacionId || "";
    const rolTexto = rolesMapeados[window.miUsuario.rol] || "Sin rol";

    const congregacionTexto = congId ? `Cong. ${congNombre} (${congId}) • ${rolTexto}` : 'Sin congregación asignada';

    const opcionesTemasTextos = { 'light': 'Claro', 'dark': 'Oscuro', 'system': 'Automático (Sistema)' };
    const temaActualTxt = opcionesTemasTextos[localStorage.getItem('themePref') || 'system'];

    modal = document.createElement('div');
    modal.id = 'modal-perfil-usuario';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: #2B2A33; z-index: 9999; display: flex; flex-direction: column; overflow-y: auto; font-family: sans-serif;';
    
    modal.innerHTML = `
        <div style="padding: 16px; display: flex; align-items: center;">
            <button id="btn-cerrar-perfil" style="background: none; border: none; color: white; font-size: 24px; cursor: pointer;">✕</button>
        </div>
        
        <div style="display: flex; flex-direction: column; align-items: center; padding: 20px;">
            <div style="width: 90px; height: 90px; border-radius: 50%; background-color: #CBA4FF; color: white; display: flex; align-items: center; justify-content: center; font-size: 36px; font-weight: bold; margin-bottom: 16px;">
                ${iniciales}
            </div>
            <h2 style="color: white; margin: 0 0 4px 0; font-size: 24px;">${window.miUsuario.nombre}</h2>
            <p style="color: #A0A0A0; margin: 0 0 16px 0; font-size: 14px;">${window.miUsuario.email}</p>
            <div style="background-color: #3F3E47; color: #E0E0E0; padding: 6px 16px; border-radius: 20px; font-size: 13px;">
                ${congregacionTexto}
            </div>
        </div>

        <div style="border-top: 1px solid #3F3E47; width: 100%; margin-top: 10px;"></div>

        <div style="display: flex; flex-direction: column; width: 100%;">
            <div class="perfil-opcion" id="opc-editar-datos" style="padding: 20px; border-bottom: 1px solid #3F3E47; display: flex; align-items: center; cursor: pointer;">
                <span style="color: white; margin-right: 16px; font-size: 20px;">✏️</span>
                <span style="color: white; font-size: 16px;">Editar mis datos</span>
            </div>
            <div class="perfil-opcion" id="opc-tema" style="padding: 20px; border-bottom: 1px solid #3F3E47; display: flex; align-items: center; cursor: pointer;">
                <span style="color: white; margin-right: 16px; font-size: 20px;">⚙️</span>
                <span style="color: white; font-size: 16px;">Tema: ${temaActualTxt}</span>
            </div>
            <div class="perfil-opcion" id="opc-cambiar-cong" style="padding: 20px; border-bottom: 1px solid #3F3E47; display: flex; align-items: center; cursor: pointer;">
                <span style="color: white; margin-right: 16px; font-size: 20px;">🔄</span>
                <span style="color: white; font-size: 16px;">Cambiar de congregación</span>
            </div>
            <div class="perfil-opcion" id="opc-reportar" style="padding: 20px; border-bottom: 1px solid #3F3E47; display: flex; align-items: center; cursor: pointer;">
                <span style="color: #CBA4FF; margin-right: 16px; font-size: 20px;">💡</span>
                <span style="color: #CBA4FF; font-size: 16px;">Reportar problema o idea</span>
            </div>
            <div class="perfil-opcion" id="opc-cerrar-sesion" style="padding: 20px; border-bottom: 1px solid #3F3E47; display: flex; align-items: center; cursor: pointer;">
                <span style="color: #E53935; margin-right: 16px; font-size: 20px;">🚪</span>
                <span style="color: #E53935; font-size: 16px;">Cerrar sesión de Google</span>
            </div>
        </div>
        
        <div style="flex-grow: 1;"></div>
        <div style="text-align: center; padding: 20px; color: #777; font-size: 12px;">
            Mi Territorio v1.5 (Web)
        </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('btn-cerrar-perfil').onclick = () => modal.remove();

    // ===============================================
    // MODAL ELEGANTE: EDITAR DATOS
    // ===============================================
    document.getElementById('opc-editar-datos').onclick = () => {
        const nombreActual = window.miUsuario.nombre.split(' ')[0] || '';
        const apellidoActual = window.miUsuario.nombre.split(' ').slice(1).join(' ') || '';

        const modalEdit = document.createElement('div');
        modalEdit.id = 'modal-editar-datos';
        modalEdit.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); z-index: 10000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px); font-family: sans-serif;';
        
        modalEdit.innerHTML = `
            <div style="background: #2B2A33; width: 90%; max-width: 350px; border-radius: 16px; padding: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); border: 1px solid #3F3E47;">
                <h3 style="color: white; margin-top: 0; margin-bottom: 20px; font-size: 20px;">Editar mis datos</h3>
                
                <label style="color: #A0A0A0; font-size: 13px; margin-bottom: 6px; display: block;">Nombre</label>
                <input type="text" id="input-edit-nombre" value="${nombreActual}" style="width: 100%; background: #3F3E47; border: 1px solid #555; color: white; padding: 12px; border-radius: 8px; margin-bottom: 16px; box-sizing: border-box; outline: none; font-size: 16px;">
                
                <label style="color: #A0A0A0; font-size: 13px; margin-bottom: 6px; display: block;">Apellido</label>
                <input type="text" id="input-edit-apellido" value="${apellidoActual}" style="width: 100%; background: #3F3E47; border: 1px solid #555; color: white; padding: 12px; border-radius: 8px; margin-bottom: 24px; box-sizing: border-box; outline: none; font-size: 16px;">
                
                <div style="display: flex; gap: 12px;">
                    <button id="btn-cancelar-edit" style="flex: 1; background: transparent; color: white; border: 1px solid #555; padding: 12px; border-radius: 8px; font-weight: bold; cursor: pointer;">Cancelar</button>
                    <button id="btn-guardar-edit" style="flex: 1; background: #CBA4FF; color: #4A148C; border: none; padding: 12px; border-radius: 8px; font-weight: bold; cursor: pointer;">Guardar</button>
                </div>
            </div>
        `;

        document.body.appendChild(modalEdit);

        document.getElementById('btn-cancelar-edit').onclick = () => modalEdit.remove();

        document.getElementById('btn-guardar-edit').onclick = async () => {
            const nuevoNombre = document.getElementById('input-edit-nombre').value.trim();
            const nuevoApellido = document.getElementById('input-edit-apellido').value.trim();
            const btnGuardar = document.getElementById('btn-guardar-edit');

            if (!nuevoNombre || !nuevoApellido) {
                alert("Por favor, completa nombre y apellido.");
                return;
            }

            btnGuardar.innerText = "Guardando...";
            btnGuardar.disabled = true;

            try {
                await setDoc(doc(db, "usuarios", window.miUsuario.email), {
                    nombre: nuevoNombre,
                    apellido: nuevoApellido
                }, { merge: true });
                
                window.miUsuario.nombre = `${nuevoNombre} ${nuevoApellido}`;
                modalEdit.remove();
                mostrarPantallaPerfil(); 
                
                const btnAvatar = document.getElementById('btn-flotante-perfil');
                if(btnAvatar) btnAvatar.innerText = window.miUsuario.nombre.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'U';

            } catch (e) {
                alert("Error al actualizar datos.");
                btnGuardar.innerText = "Guardar";
                btnGuardar.disabled = false;
            }
        };
    };

    // ===============================================
    // MODAL ELEGANTE: SELECCIÓN DE TEMA 
    // ===============================================
    document.getElementById('opc-tema').onclick = () => {
        const prefActual = localStorage.getItem('themePref') || 'system';

        const modalTema = document.createElement('div');
        modalTema.id = 'modal-seleccionar-tema';
        modalTema.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); z-index: 10000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px); font-family: sans-serif;';
        
        modalTema.innerHTML = `
            <div style="background: #2B2A33; width: 90%; max-width: 320px; border-radius: 16px; padding: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); border: 1px solid #3F3E47;">
                <h3 style="color: white; margin-top: 0; margin-bottom: 20px; font-size: 20px;">Seleccionar tema</h3>
                
                <div class="tema-opcion" id="tema-opc-claro" style="padding: 14px; border-radius: 8px; color: white; cursor: pointer; display: flex; align-items: center; gap: 12px; margin-bottom: 8px; background: ${prefActual === 'light' ? '#3F3E47' : 'transparent'}; border: 1px solid ${prefActual === 'light' ? '#CBA4FF' : 'transparent'};">
                    <span style="font-size: 18px;">☀️</span> <span style="font-size: 16px; font-weight: 500;">Claro</span>
                </div>
                <div class="tema-opcion" id="tema-opc-oscuro" style="padding: 14px; border-radius: 8px; color: white; cursor: pointer; display: flex; align-items: center; gap: 12px; margin-bottom: 8px; background: ${prefActual === 'dark' ? '#3F3E47' : 'transparent'}; border: 1px solid ${prefActual === 'dark' ? '#CBA4FF' : 'transparent'};">
                    <span style="font-size: 18px;">🌙</span> <span style="font-size: 16px; font-weight: 500;">Oscuro</span>
                </div>
                <div class="tema-opcion" id="tema-opc-sistema" style="padding: 14px; border-radius: 8px; color: white; cursor: pointer; display: flex; align-items: center; gap: 12px; margin-bottom: 24px; background: ${prefActual === 'system' ? '#3F3E47' : 'transparent'}; border: 1px solid ${prefActual === 'system' ? '#CBA4FF' : 'transparent'};">
                    <span style="font-size: 18px;">⚙️</span> <span style="font-size: 16px; font-weight: 500;">Automático (Sistema)</span>
                </div>
                
                <button id="btn-cerrar-tema" style="background: transparent; color: white; border: 1px solid #555; padding: 12px; border-radius: 8px; font-weight: bold; cursor: pointer; width: 100%;">Cancelar</button>
            </div>
        `;

        document.body.appendChild(modalTema);

        const cambiarPrefTema = (nuevaPref) => {
            localStorage.setItem('themePref', nuevaPref);
            aplicarThemePref(nuevaPref);
            modalTema.remove();
            mostrarPantallaPerfil(); 
        };

        document.getElementById('tema-opc-claro').onclick = () => cambiarPrefTema('light');
        document.getElementById('tema-opc-oscuro').onclick = () => cambiarPrefTema('dark');
        document.getElementById('tema-opc-sistema').onclick = () => cambiarPrefTema('system');
        document.getElementById('btn-cerrar-tema').onclick = () => modalTema.remove();
    };

    function aplicarThemePref(pref) {
        if (pref === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
        } else if (pref === 'light') {
            document.documentElement.setAttribute('data-theme', 'light');
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
    }

    // ===============================================
    // MODAL ELEGANTE: CAMBIAR CONGREGACIÓN
    // ===============================================
    document.getElementById('opc-cambiar-cong').onclick = () => {
        const modalCambiar = document.createElement('div');
        modalCambiar.id = 'modal-cambiar-cong';
        modalCambiar.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); z-index: 10000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px); font-family: sans-serif;';
        
        const congActual = window.miUsuario.congregacionNombre || 'esta congregación';
        
        modalCambiar.innerHTML = `
            <div style="background: #2B2A33; width: 90%; max-width: 350px; border-radius: 16px; padding: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); border: 1px solid #3F3E47;">
                <h3 style="color: white; margin-top: 0; margin-bottom: 8px; font-size: 20px;">Cambiar de congregación</h3>
                <p style="color: #A0A0A0; font-size: 14px; margin-bottom: 24px; line-height: 1.5;">¿Estás seguro de que deseas salir de <strong>${congActual}</strong>?<br><br>Tendrás que solicitar acceso nuevamente si decides volver.</p>
                
                <div style="display: flex; gap: 12px;">
                    <button id="btn-cancelar-cambio" style="flex: 1; background: transparent; color: white; border: 1px solid #555; padding: 12px; border-radius: 8px; font-weight: bold; cursor: pointer;">Cancelar</button>
                    <button id="btn-confirmar-cambio" style="flex: 1; background: #CBA4FF; color: #4A148C; border: none; padding: 12px; border-radius: 8px; font-weight: bold; cursor: pointer;">Sí, salir</button>
                </div>
            </div>
        `;

        document.body.appendChild(modalCambiar);

        document.getElementById('btn-cancelar-cambio').onclick = () => modalCambiar.remove();

        document.getElementById('btn-confirmar-cambio').onclick = () => {
            document.getElementById('btn-confirmar-cambio').innerText = "Saliendo...";
            localStorage.removeItem('miCongregacionId');
            if (window.unsubVigilanteRole) window.unsubVigilanteRole();
            location.reload();
        };
    };

    // ===============================================
    // MODAL ELEGANTE: REPORTAR IDEA (FULL CON COMPRESIÓN)
    // ===============================================
    document.getElementById('opc-reportar').onclick = () => {
        const modalReporte = document.createElement('div');
        modalReporte.id = 'modal-reportar-idea';
        modalReporte.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: #121212; z-index: 10000; display: flex; flex-direction: column; font-family: sans-serif; overflow-y: auto;';
        
        modalReporte.innerHTML = `
            <div style="padding: 20px; display: flex; align-items: center; border-bottom: 1px solid #2B2A33;">
                <button id="btn-cerrar-reporte" style="background: none; border: none; color: white; font-size: 24px; cursor: pointer; padding: 0 16px 0 0;">✕</button>
                <h2 style="color: white; margin: 0; font-size: 20px;">Reportar Idea o Problema</h2>
            </div>
            
            <div style="padding: 24px; flex: 1; display: flex; flex-direction: column;">
                <h3 style="color: #CBA4FF; margin-top: 0; margin-bottom: 12px; font-size: 18px;">¡Tu opinión nos ayuda a mejorar!</h3>
                <p style="color: #A0A0A0; font-size: 15px; margin-bottom: 24px; line-height: 1.5;">Cuéntanos qué problema tuviste o qué idea genial se te ocurrió. Puedes adjuntar fotos (se comprimirán solas) o grabar un audio.</p>
                
                <textarea id="input-reporte-texto" rows="8" placeholder="Escribe aquí todos los detalles..." style="width: 100%; background: transparent; border: 1px solid #555; color: white; padding: 16px; border-radius: 12px; margin-bottom: 16px; box-sizing: border-box; outline: none; font-size: 16px; resize: none;"></textarea>
                
                <input type="file" id="input-archivo-oculto" multiple accept="image/*,video/mp4,video/quicktime" style="display: none;">
                
                <div id="lista-adjuntos-ui" style="display: flex; gap: 8px; overflow-x: auto; margin-bottom: 16px;"></div>

                <div style="display: flex; gap: 12px; margin-bottom: 24px;">
                    <button id="btn-adjuntar-foto" style="flex: 2; background: transparent; color: white; border: 1px solid #555; padding: 14px; border-radius: 12px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;">
                        <span style="font-size: 18px;">📎</span> Adjuntar
                    </button>
                    <button id="btn-grabar-audio" style="flex: 1; background: #5c3b6e; color: white; border: none; border-radius: 12px; font-size: 20px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
                        🎤
                    </button>
                </div>
                
                <div style="flex: 1;"></div>
                
                <button id="btn-enviar-reporte" disabled style="width: 100%; background: #2B2A33; color: #666; border: none; padding: 16px; border-radius: 24px; font-weight: bold; font-size: 16px; cursor: not-allowed; display: flex; align-items: center; justify-content: center; gap: 8px; transition: all 0.3s;">
                    <span id="icono-enviar">➤</span> <span id="texto-enviar">Enviar a Soporte</span>
                </button>
            </div>
        `;

        document.body.appendChild(modalReporte);

        const inputTexto = document.getElementById('input-reporte-texto');
        const btnEnviar = document.getElementById('btn-enviar-reporte');
        const textoEnviar = document.getElementById('texto-enviar');
        const inputArchivo = document.getElementById('input-archivo-oculto');
        const btnGrabarAudio = document.getElementById('btn-grabar-audio');
        
        let archivosAdjuntos = [];
        let isRecording = false;
        let mediaRecorder = null;
        let audioChunks = [];

        function actualizarBotonEnviar() {
            if (inputTexto.value.trim().length > 0 || archivosAdjuntos.length > 0) {
                btnEnviar.style.background = '#3F3E47'; 
                btnEnviar.style.color = 'white';
                btnEnviar.disabled = false;
                btnEnviar.style.cursor = 'pointer';
            } else {
                btnEnviar.style.background = '#2B2A33';
                btnEnviar.style.color = '#666';
                btnEnviar.disabled = true;
                btnEnviar.style.cursor = 'not-allowed';
            }
        }

        function renderizarAdjuntos() {
            const cont = document.getElementById('lista-adjuntos-ui');
            cont.innerHTML = '';
            archivosAdjuntos.forEach((file, index) => {
                const chip = document.createElement('div');
                chip.style.cssText = 'background: #3F3E47; color: white; padding: 8px 14px; border-radius: 8px; font-size: 13px; display: flex; align-items: center; gap: 8px; flex-shrink: 0;';
                
                let icono = file.type.startsWith('video/') ? '🎬' : (file.type.startsWith('audio/') ? '🎵' : '📷');
                
                chip.innerHTML = `<span>${icono} ${file.name.substring(0, 15)}...</span> <span style="color:#E53935; cursor:pointer; font-weight:bold; font-size: 16px;">✕</span>`;
                chip.querySelector('span:last-child').onclick = () => {
                    archivosAdjuntos.splice(index, 1);
                    renderizarAdjuntos();
                    actualizarBotonEnviar();
                };
                cont.appendChild(chip);
            });
        }

        // MOTOR DE COMPRESIÓN DE IMÁGENES WEB
        function comprimirImagenWeb(file) {
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onload = (event) => {
                    const img = new Image();
                    img.src = event.target.result;
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        const MAX_WIDTH = 1200;
                        const MAX_HEIGHT = 1200;
                        let width = img.width;
                        let height = img.height;

                        if (width > height) {
                            if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
                        } else {
                            if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
                        }
                        
                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, width, height);

                        // Exportamos en JPEG al 70% de calidad
                        canvas.toBlob((blob) => {
                            const newFile = new File([blob], file.name.replace(/\.[^/.]+$/, ".jpg"), {
                                type: 'image/jpeg',
                                lastModified: Date.now()
                            });
                            resolve(newFile);
                        }, 'image/jpeg', 0.7);
                    };
                };
            });
        }

        inputTexto.addEventListener('input', actualizarBotonEnviar);
        document.getElementById('btn-cerrar-reporte').onclick = () => modalReporte.remove();

        document.getElementById('btn-adjuntar-foto').onclick = () => inputArchivo.click();

        inputArchivo.onchange = async (e) => {
            const MAX_VIDEO_MB = 30; // Límite de 30MB para videos
            
            for(let file of e.target.files) {
                if (file.type.startsWith('image/')) {
                    textoEnviar.innerText = "Comprimiendo imagen...";
                    btnEnviar.disabled = true;
                    
                    const compressedFile = await comprimirImagenWeb(file);
                    archivosAdjuntos.push(compressedFile);
                } 
                else if (file.type.startsWith('video/')) {
                    const fileSizeMB = file.size / (1024 * 1024);
                    if (fileSizeMB > MAX_VIDEO_MB) {
                        alert(`El video ${file.name} es muy pesado (${fileSizeMB.toFixed(1)}MB). Por favor, elige uno de máximo ${MAX_VIDEO_MB}MB.`);
                    } else {
                        archivosAdjuntos.push(file);
                    }
                } 
                else {
                    archivosAdjuntos.push(file);
                }
            }
            inputArchivo.value = ''; // Limpiar el input
            textoEnviar.innerText = "Enviar a Soporte";
            renderizarAdjuntos();
            actualizarBotonEnviar();
        };

        btnGrabarAudio.onclick = async () => {
            if (isRecording) {
                mediaRecorder.stop();
                isRecording = false;
                btnGrabarAudio.innerHTML = '🎤';
                btnGrabarAudio.style.background = '#5c3b6e';
                btnGrabarAudio.style.color = 'white';
            } else {
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    mediaRecorder = new MediaRecorder(stream);
                    audioChunks = [];
                    
                    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
                    
                    mediaRecorder.onstop = () => {
                        const audioBlob = new Blob(audioChunks, { type: 'audio/mp4' });
                        const fileName = `audio_idea_${Date.now()}.m4a`;
                        const audioFile = new File([audioBlob], fileName, { type: 'audio/mp4' });
                        archivosAdjuntos.push(audioFile);
                        renderizarAdjuntos();
                        actualizarBotonEnviar();
                        stream.getTracks().forEach(track => track.stop()); // Apagar luz de mic
                    };
                    
                    mediaRecorder.start();
                    isRecording = true;
                    btnGrabarAudio.innerHTML = '🔴';
                    btnGrabarAudio.style.background = '#FFEBEE';
                    btnGrabarAudio.style.color = '#C62828';
                } catch(e) {
                    alert("No se pudo acceder al micrófono.");
                }
            }
        };

        btnEnviar.onclick = async () => {
            const idea = inputTexto.value.trim();
            if (!idea && archivosAdjuntos.length === 0) return;

            textoEnviar.innerText = archivosAdjuntos.length > 0 ? "Subiendo archivos..." : "Enviando...";
            btnEnviar.disabled = true;
            btnEnviar.style.opacity = "0.7";

            try {
                const ticketId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString();
                const storage = getStorage();
                let urlsSubidas = [];

                for (let i = 0; i < archivosAdjuntos.length; i++) {
                    textoEnviar.innerText = `Subiendo ${i + 1} de ${archivosAdjuntos.length}...`;
                    const file = archivosAdjuntos[i];
                    const storageRef = ref(storage, `reportes_ideas/${ticketId}/${Date.now()}_${file.name}`);
                    await uploadBytes(storageRef, file);
                    const url = await getDownloadURL(storageRef);
                    urlsSubidas.push(url);
                }

                textoEnviar.innerText = "Guardando reporte...";

                const data = {
                    id: ticketId,
                    email: window.miUsuario.email,
                    nombre: window.miUsuario.nombre,
                    texto: idea,
                    archivos: urlsSubidas,
                    fecha: Date.now(),
                    estado: "Pendiente"
                };

                await setDoc(doc(db, "reportes_ideas", ticketId), data);
                
                modalReporte.remove();
                alert("¡Gracias! Tu reporte ha sido enviado al equipo de desarrollo.");
            } catch (e) {
                alert("Error al enviar reporte: " + e.message);
                textoEnviar.innerText = "Enviar a Soporte";
                btnEnviar.disabled = false;
                btnEnviar.style.opacity = "1";
            }
        };
    };

    // ===============================================
    // MODAL ELEGANTE: CERRAR SESIÓN
    // ===============================================
    document.getElementById('opc-cerrar-sesion').onclick = () => {
        const modalSalir = document.createElement('div');
        modalSalir.id = 'modal-cerrar-sesion';
        modalSalir.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); z-index: 10000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px); font-family: sans-serif;';
        
        modalSalir.innerHTML = `
            <div style="background: #2B2A33; width: 90%; max-width: 350px; border-radius: 16px; padding: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); border: 1px solid #3F3E47;">
                <h3 style="color: white; margin-top: 0; margin-bottom: 8px; font-size: 20px;">Cerrar sesión</h3>
                <p style="color: #A0A0A0; font-size: 14px; margin-bottom: 24px; line-height: 1.4;">¿Seguro que deseas salir de tu cuenta de Google?</p>
                
                <div style="display: flex; gap: 12px;">
                    <button id="btn-cancelar-salir" style="flex: 1; background: transparent; color: white; border: 1px solid #555; padding: 12px; border-radius: 8px; font-weight: bold; cursor: pointer;">Cancelar</button>
                    <button id="btn-confirmar-salir" style="flex: 1; background: #E53935; color: white; border: none; padding: 12px; border-radius: 8px; font-weight: bold; cursor: pointer;">Sí, cerrar sesión</button>
                </div>
            </div>
        `;

        document.body.appendChild(modalSalir);

        document.getElementById('btn-cancelar-salir').onclick = () => modalSalir.remove();

        document.getElementById('btn-confirmar-salir').onclick = async () => {
            const btnConfirm = document.getElementById('btn-confirmar-salir');
            btnConfirm.innerText = "Saliendo...";
            btnConfirm.disabled = true;
            try {
                if (window.unsubVigilanteRole) window.unsubVigilanteRole();
                localStorage.removeItem('miCongregacionId');
                await signOut(auth);
                location.reload();
            } catch (error) {
                alert("Error al cerrar sesión");
                btnConfirm.innerText = "Cerrar sesión";
                btnConfirm.disabled = false;
            }
        };
    };
}

function mostrarBuscadorCongregaciones(email, nombreCompleto) {
    toggleContenidoApp(false);

    let contenedor = document.getElementById('contenedor-onboarding');
    if (!contenedor) {
        contenedor = document.createElement('div');
        contenedor.id = 'contenedor-onboarding';
        contenedor.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: #f5f5f5; display: flex; align-items: center; justify-content: center; z-index: 9999; padding: 20px; box-sizing: border-box; font-family: sans-serif;';
        document.body.appendChild(contenedor);
    }

    contenedor.innerHTML = `
        <div style="background: white; padding: 30px; border-radius: 16px; box-shadow: 0 8px 24px rgba(0,0,0,0.1); width: 100%; max-width: 420px; text-align: center; box-sizing: border-box;">
            <h3 style="margin: 0 0 8px 0; color: #333; font-size: 20px;">Hola, ${nombreCompleto}</h3>
            <p style="color: #666; margin-bottom: 20px; font-size: 14px;">Busca tu congregación para unirte:</p>
            
            <div style="position: relative; text-align: left;">
                <input type="text" id="input-busqueda-cong" placeholder="Nombre o Número (Ej: Mendoza)" style="width: 100%; padding: 12px 40px 12px 12px; border-radius: 8px; border: 1px solid #ccc; box-sizing: border-box; font-size: 15px; outline: none;">
                <span style="position: absolute; right: 12px; top: 12px; color: #aaa;">🔍</span>
            </div>
            
            <div id="lista-resultados-cong" style="max-height: 180px; overflow-y: auto; margin-top: 10px; border-radius: 8px; background: #f9f9f9; border: 1px solid #eee; display: none;"></div>
            
            <div style="margin-top: 25px;">
                <button id="btn-abrir-crear-cong" style="background: none; border: none; color: #6200EE; font-weight: bold; cursor: pointer; font-size: 14px;">¿Tu congregación no está? Créala aquí</button>
            </div>
        </div>
    `;

    const inputBusqueda = document.getElementById('input-busqueda-cong');
    const listaResultados = document.getElementById('lista-resultados-cong');
    const btnAbrirCrear = document.getElementById('btn-abrir-crear-cong');

    let directorioGlobal = [];

    getDocs(collection(db, "congregaciones")).then((snapshot) => {
        directorioGlobal = [];
        snapshot.forEach(doc => {
            directorioGlobal.push({ id: doc.id, nombre: doc.data().nombre || `Congregación ${doc.id}` });
        });
        directorioGlobal.sort((a, b) => a.nombre.localeCompare(b.nombre));
    }).catch(err => console.error("Error al cargar directorio:", err));

    inputBusqueda.oninput = () => {
        const txt = inputBusqueda.value.trim().toLowerCase();
        if (!txt) {
            listaResultados.style.display = 'none';
            return;
        }

        const filtrados = directorioGlobal.filter(c => c.id.toLowerCase().includes(txt) || c.nombre.toLowerCase().includes(txt));

        if (filtrados.length > 0) {
            listaResultados.innerHTML = '';
            listaResultados.style.display = 'block';
            filtrados.forEach(cong => {
                const item = document.createElement('div');
                item.style.cssText = 'padding: 12px; cursor: pointer; border-bottom: 1px solid #eee; text-align: left; transition: background 0.2s;';
                item.innerHTML = `<div style="font-weight: bold; color: #333; font-size: 15px;">${cong.nombre}</div><div style="font-size: 12px; color: #777;">Nº Oficial: ${cong.id}</div>`;
                
                item.onmouseenter = () => item.style.backgroundColor = '#f0f0f0';
                item.onmouseleave = () => item.style.backgroundColor = 'transparent';
                
                item.onclick = async () => {
                    inputBusqueda.disabled = true;
                    listaResultados.style.display = 'none';
                    contenedor.innerHTML = '<div style="color:gray; font-weight:bold;">Verificando acceso... ⏳</div>';
                    
                    try {
                        const docRef = doc(db, "congregaciones", cong.id);
                        const docSnap = await getDoc(docRef);
                        
                        if (docSnap.exists()) {
                            const mapRoles = docSnap.data().roles || {};
                            const miRol = mapRoles[email];
                            
                            if (miRol) {
                                localStorage.setItem('miCongregacionId', cong.id);
                                activarVigilanteRealtime(email, cong.id, nombreCompleto);
                            } else {
                                await updateDoc(docRef, { [`roles.${email}`]: "pendiente" });
                                localStorage.setItem('miCongregacionId', cong.id);
                                activarVigilanteRealtime(email, cong.id, nombreCompleto);
                            }
                        }
                    } catch (e) {
                        alert("Error al enviar solicitud: " + e.message);
                        location.reload();
                    }
                };
                listaResultados.appendChild(item);
            });
        } else {
            listaResultados.innerHTML = '<div style="padding: 12px; color: #c62828; font-size: 13px; text-align: left;">No se encontró ninguna congregación con ese criterio.</div>';
            listaResultados.style.display = 'block';
        }
    };

    btnAbrirCrear.onclick = () => {
        const numero = prompt("Ingresa el Número Oficial de la congregación (Solo números):");
        if (!numero) return;
        if (!/^\d+$/.test(numero)) return alert("Error: Debe ser un número válido.");
        
        const nombre = prompt("Ingresa el Nombre de la congregación (Ej: Mendoza Centro):");
        if (!nombre || !nombre.trim()) return alert("Error: El nombre es obligatorio.");

        const docRef = doc(db, "congregaciones", numero.trim());
        setDoc(docRef, {
            nombre: nombre.trim(),
            roles: { [email]: "siervo" } 
        }, { merge: true }).then(() => {
            localStorage.setItem('miCongregacionId', numero.trim());
            activarVigilanteRealtime(email, numero.trim(), nombreCompleto);
        }).catch(err => alert("Error al crear congregación: " + err.message));
    };
}

function activarVigilanteRealtime(email, congId, nombreCompleto) {
    if (window.unsubVigilanteRole) window.unsubVigilanteRole();

    const docRef = doc(db, "congregaciones", congId);

    window.unsubVigilanteRole = onSnapshot(docRef, (docSnap) => {
        if (!docSnap.exists()) {
            manejarExpulsionORechazo();
            return;
        }

        const congData = docSnap.data();
        const rolesMap = congData.roles || {};
        const miRolActual = rolesMap[email];

        const appTitleEl = document.querySelector('.app-title');
        if (appTitleEl) appTitleEl.innerText = congData.nombre || `Congregación ${congId}`;

        if (miRolActual === 'pendiente') {
            window.miUsuario.rol = 'pendiente';
            window.miUsuario.congregacionId = congId;
            window.miUsuario.congregacionNombre = congData.nombre || '';
            mostrarPantallaSalaEspera(congId, congData.nombre || `Congregación ${congId}`, email, nombreCompleto);
        } else if (miRolActual) {
            document.getElementById('contenedor-onboarding')?.remove();
            toggleContenidoApp(true);

            window.miUsuario = {
                email, nombre: nombreCompleto, rol: miRolActual, congregacionId: congId, congregacionNombre: congData.nombre || '',
                visitaActivaId: null, visitaActivaNotas: "", tempLat: 0, tempLng: 0
            };

            const tabServicio = document.getElementById('tab-servicio');
            const btnFabRegistro = document.getElementById('btn-fab-registro');
            if (miRolActual === 'siervo' || miRolActual === 'ayudante' || miRolActual === 'conductor') {
                if (tabServicio) tabServicio.style.display = 'block';
                if (btnFabRegistro) btnFabRegistro.style.display = 'block';
            } else {
                if (tabServicio) tabServicio.style.display = 'none';
                if (btnFabRegistro) btnFabRegistro.style.display = 'none';
            }

            if (!window.motoresArrancados) {
                configurarPanelAdmin();
                inicializarMapaYVisitas();
                window.motoresArrancados = true;
            }

        } else {
            manejarExpulsionORechazo();
        }
    }, (error) => {
        manejarExpulsionORechazo();
    });
}

function mostrarPantallaSalaEspera(congId, congNombre, email, nombreCompleto) {
    toggleContenidoApp(false);

    let contenedor = document.getElementById('contenedor-onboarding');
    if (!contenedor) {
        contenedor = document.createElement('div');
        contenedor.id = 'contenedor-onboarding';
        contenedor.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: #f5f5f5; display: flex; align-items: center; justify-content: center; z-index: 9999; padding: 20px; box-sizing: border-box; font-family: sans-serif;';
        document.body.appendChild(contenedor);
    }

    contenedor.innerHTML = `
        <div style="background: white; padding: 40px 30px; border-radius: 16px; box-shadow: 0 8px 24px rgba(0,0,0,0.1); width: 100%; max-width: 420px; text-align: center; box-sizing: border-box;">
            <div style="font-size: 52px; margin-bottom: 20px; animation: rotarReloj 2s linear infinite;">⏳</div>
            <h3 style="margin: 0 0 12px 0; color: #333; font-size: 22px; font-weight: bold;">Solicitud Enviada</h3>
            <p style="color: #666; font-size: 14px; line-height: 1.5; margin-bottom: 16px;">
                Tu solicitud para unirte a <strong>${congNombre} (Nº ${congId})</strong> está en lista de espera.
            </p>
            <p style="color: #6200EE; font-size: 14px; font-weight: bold; line-height: 1.5; margin-bottom: 30px;">
                Espera que el Siervo de Territorios apruebe tu cuenta. Esta pantalla se actualizará de forma automática.
            </p>
            
            <button id="btn-cancelar-solicitud" style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid #ccc; background: transparent; color: #555; font-weight: bold; cursor: pointer; font-size: 14px; transition: background 0.2s;">
                Cancelar solicitud y salir
            </button>
        </div>
    `;

    if (!document.getElementById('style-reloj-onboarding')) {
        const style = document.createElement('style');
        style.id = 'style-reloj-onboarding';
        style.innerHTML = `@keyframes rotarReloj { 0% { transform: rotate(0deg); } 50% { transform: rotate(180deg); } 100% { transform: rotate(180deg); } }`;
        document.head.appendChild(style);
    }

    document.getElementById('btn-cancelar-solicitud').onclick = () => {
        if (confirm("¿Quieres cancelar la solicitud de acceso a esta congregación?")) {
            if (window.unsubVigilanteRole) { window.unsubVigilanteRole(); window.unsubVigilanteRole = null; }
            localStorage.removeItem('miCongregacionId');
            contenedor.remove();
            location.reload();
        }
    };
}

function manejarExpulsionORechazo() {
    if (window.unsubVigilanteRole) { window.unsubVigilanteRole(); window.unsubVigilanteRole = null; }
    localStorage.removeItem('miCongregacionId');
    if (window.miUsuario) window.miUsuario.congregacionId = null;
    alert("Tu acceso ha sido rechazado, o fuiste removido de la congregación.");
    location.reload();
}

function toggleContenidoApp(mostrar) {
    const dashboardSection = document.getElementById('dashboard-section');
    if (!dashboardSection) return;
    
    Array.from(dashboardSection.children).forEach(child => {
        if (child.id !== 'contenedor-onboarding') {
            child.style.visibility = mostrar ? 'visible' : 'hidden';
        }
    });
}