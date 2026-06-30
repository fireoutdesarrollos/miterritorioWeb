// ==========================================
// ARCHIVO: auth-service.js (VERSIÓN CON DELEGACIÓN DE EVENTOS Y POPUP)
// ==========================================
import { signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, getDoc, collection, getDocs, updateDoc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";
import { auth, provider, db } from "./firebase-core.js";
import { inicializarMapaYVisitas } from "./map-service.js";
import { configurarPanelAdmin } from "./admin-service.js";
import { aplicarCandadoPrivacidad } from "./ui-controller.js";

const WEB_VERSION = "v1.7.9"; 

aplicarTemaInicial();

export function iniciarAutenticacion() {
    const loginSection = document.getElementById('login-section');
    const dashboardSection = document.getElementById('dashboard-section');

    // 🔥 DELEGACIÓN DE EVENTOS: Atrapa el clic sin importar cuándo cargó el botón
    document.addEventListener('click', async (e) => {
        const btnLogin = e.target.closest('#btn-login');
        
        if (btnLogin) {
            e.preventDefault();
            console.log("🟢 [LOGIN] Botón presionado. Iniciando Popup...");
            btnLogin.innerText = "Conectando con Google...";
            
            try {
                await signInWithPopup(auth, provider); 
                console.log("🟢 [LOGIN] Popup ejecutado con éxito.");
            } catch (error) {
                console.error("🔴 [LOGIN] Error:", error);
                btnLogin.innerText = "Error. Intentar de nuevo";
                if (error.code !== 'auth/popup-closed-by-user') {
                    alert("Error al iniciar sesión: " + error.message);
                }
            }
        }
    });

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            console.log("🟢 [AUTH] Usuario detectado:", user.email);
            if (loginSection) loginSection.style.display = 'none';
            if (dashboardSection) dashboardSection.style.display = 'block';

            const email = user.email.toLowerCase();
            const userSnap = await getDoc(doc(db, "usuarios", email));

            if (userSnap.exists() && userSnap.data().nombre) {
                const nombreCompleto = `${userSnap.data().nombre} ${userSnap.data().apellido || ''}`.trim();
                continuarFlujoAutenticacion(email, nombreCompleto);
            } else {
                mostrarPantallaOnboarding(email, user.displayName || "");
            }

        } else {
            console.log("🟡 [AUTH] No hay sesión activa.");
            if (loginSection) loginSection.style.display = 'flex'; 
            if (dashboardSection) dashboardSection.style.display = 'none';
            
            const btnLogin = document.getElementById('btn-login');
            if (btnLogin) btnLogin.innerText = "Iniciar sesión con Google";
            
            document.getElementById('contenedor-onboarding')?.remove();
            document.getElementById('btn-flotante-perfil')?.remove();
            if (window.unsubVigilanteRole) { window.unsubVigilanteRole(); window.unsubVigilanteRole = null; }
            window.motoresArrancados = false; 
        }
    });
}

function mostrarPantallaOnboarding(email, googleName) {
    toggleContenidoApp(false);

    let preNombre = ""; let preApellido = "";
    if (googleName) {
        const partes = googleName.split(' ');
        preNombre = partes[0] || "";
        preApellido = partes.slice(1).join(' ') || "";
    }

    let contenedor = document.getElementById('contenedor-onboarding');
    if (!contenedor) {
        contenedor = document.createElement('div');
        contenedor.id = 'contenedor-onboarding';
        contenedor.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: var(--bg-color, #f5f5f5); display: flex; align-items: center; justify-content: center; z-index: 9999; padding: 20px; box-sizing: border-box; font-family: sans-serif;';
        document.body.appendChild(contenedor);
    }

    contenedor.innerHTML = `
        <div style="background: var(--surface-color, white); padding: 30px; border-radius: 16px; box-shadow: 0 8px 24px rgba(0,0,0,0.1); width: 100%; max-width: 400px; box-sizing: border-box; border: 1px solid var(--border-color, #eee);">
            <h3 style="margin: 0 0 8px 0; color: var(--text-color, #333); font-size: 22px; text-align: center;">¡Bienvenido a Mi Territorio!</h3>
            <p style="color: var(--text-muted, #666); margin-bottom: 24px; font-size: 14px; text-align: center;">Para empezar, dinos cómo te llamas:</p>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; font-size: 13px; color: var(--text-muted, gray); font-weight: bold; margin-bottom: 6px;">Nombre</label>
                <input type="text" id="onboarding-nombre" value="${preNombre}" placeholder="Ej: Juan" style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--border-color, #ccc); background: var(--bg-color, transparent); color: var(--text-color, #333); box-sizing: border-box; font-size: 15px; outline: none;">
            </div>
            
            <div style="margin-bottom: 25px;">
                <label style="display: block; font-size: 13px; color: var(--text-muted, gray); font-weight: bold; margin-bottom: 6px;">Apellido</label>
                <input type="text" id="onboarding-apellido" value="${preApellido}" placeholder="Ej: Perez" style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--border-color, #ccc); background: var(--bg-color, transparent); color: var(--text-color, #333); box-sizing: border-box; font-size: 15px; outline: none;">
            </div>
            
            <button id="btn-guardar-onboarding" style="width: 100%; background: var(--primary-color, #6200EE); color: white; border: none; padding: 14px; border-radius: 12px; font-weight: bold; font-size: 16px; cursor: pointer; box-shadow: 0 4px 6px rgba(0,0,0,0.2);">Continuar</button>
        </div>
    `;

    document.getElementById('btn-guardar-onboarding').onclick = async () => {
        const nombre = document.getElementById('onboarding-nombre').value.trim();
        const apellido = document.getElementById('onboarding-apellido').value.trim();

        if (!nombre) return alert("Por favor, ingresa al menos tu nombre.");

        document.getElementById('btn-guardar-onboarding').innerText = "Guardando...";
        document.getElementById('btn-guardar-onboarding').disabled = true;

        try {
            const nombreCompletoArmado = `${nombre} ${apellido}`.trim();
            await setDoc(doc(db, "usuarios", email), {
                email: email, 
                nombre: nombre,
                apellido: apellido,
                nombreCompleto: nombreCompletoArmado,
                fechaRegistro: Date.now()
            }, { merge: true });

            contenedor.remove();
            continuarFlujoAutenticacion(email, nombreCompletoArmado);

        } catch (error) {
            alert("Error al guardar: " + error.message);
            document.getElementById('btn-guardar-onboarding').innerText = "Continuar";
            document.getElementById('btn-guardar-onboarding').disabled = false;
        }
    };
}

function continuarFlujoAutenticacion(email, nombreCompleto) {
    window.miUsuario = { email, nombre: nombreCompleto, rol: null, congregacionId: null, congregacionNombre: null };
    let miCongregacionId = localStorage.getItem('miCongregacionId');

    if (miCongregacionId) {
        activarVigilanteRealtime(email, miCongregacionId, nombreCompleto);
    } else {
        mostrarBuscadorCongregaciones(email, nombreCompleto);
    }
    inyectarBotonPerfil(nombreCompleto);
}

function aplicarTemaInicial() {
    const pref = localStorage.getItem('themePref') || 'system';
    if (pref === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    else if (pref === 'light') document.documentElement.setAttribute('data-theme', 'light');
    else document.documentElement.removeAttribute('data-theme');
}

function inyectarBotonPerfil(nombreCompleto) {
    if (document.getElementById('btn-flotante-perfil')) return;

    const iniciales = nombreCompleto.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'U';

    const btnPerfil = document.createElement('div');
    btnPerfil.id = 'btn-flotante-perfil';
    btnPerfil.style.cssText = 'width: 38px; height: 38px; border-radius: 50%; background-color: var(--primary-color, #CBA4FF); color: white; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 15px; cursor: pointer; flex-shrink: 0; margin-left: 15px; box-shadow: 0 2px 5px rgba(0,0,0,0.2);';
    btnPerfil.innerText = iniciales;
    
    btnPerfil.onclick = () => mostrarPantallaPerfil();
    
    const contenedorIconos = document.querySelector('.app-icons');
    if (contenedorIconos) contenedorIconos.appendChild(btnPerfil);
    else document.body.appendChild(btnPerfil);
}

async function mostrarPantallaPerfil() {
    let modal = document.getElementById('modal-perfil-usuario');
    if (modal) modal.remove();

    const storage = getStorage();
    let fotoPerfilUrl = ""; let videoPerfilUrl = ""; let audioPerfilUrl = "";
    
    try {
        const uSnap = await getDoc(doc(db, "usuarios", window.miUsuario.email));
        if (uSnap.exists()) {
            const data = uSnap.data();
            fotoPerfilUrl = data.fotoPerfil || "";
            videoPerfilUrl = data.videoPerfil || "";
            audioPerfilUrl = data.audioPerfil || "";
        }
    } catch (e) { console.error("Error al obtener archivos:", e); }

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

    const opcionesTemasTextos = { 'light': 'Claro', 'dark': 'Oscuro', 'system': 'Automático' };
    let temaActual = localStorage.getItem('themePref') || 'system';

    modal = document.createElement('div');
    modal.id = 'modal-perfil-usuario';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: var(--modal-overlay, rgba(20, 20, 25, 0.82)); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); z-index: 9999; display: flex; align-items: center; justify-content: center; font-family: system-ui, -apple-system, sans-serif; box-sizing: border-box; padding: 10px;';
    
    modal.innerHTML = `
        <div style="background: var(--surface-color, #1E1D24); width: 100%; max-width: 480px; max-height: 92vh; border-radius: 28px; border: 1px solid var(--border-color, rgba(255,255,255,0.08)); display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 24px 48px rgba(0,0,0,0.6); position: relative;">
            <div style="padding: 16px 20px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border-color, rgba(255,255,255,0.05)); flex-shrink: 0;">
                <span style="color: var(--text-color, white); font-weight: bold; font-size: 16px;">Perfil de Usuario</span>
                <button id="btn-cerrar-perfil" style="background: var(--border-color, rgba(255,255,255,0.06)); border: none; color: var(--text-color, white); font-size: 16px; width: 36px; height: 36px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: opacity 0.2s;">✕</button>
            </div>
            
            <div style="flex: 1; overflow-y: auto; padding: 24px 20px; display: flex; flex-direction: column; gap: 24px; box-sizing: border-box;">
                
                <div style="display: flex; flex-direction: column; align-items: center; text-align: center; position: relative; flex-shrink: 0;">
                    <div id="contenedor-avatar" style="width: 100px; height: 100px; border-radius: 50%; background-color: var(--primary-color, #CBA4FF); color: white; display: flex; align-items: center; justify-content: center; font-size: 38px; font-weight: bold; margin-bottom: 16px; position: relative; cursor: pointer; overflow: hidden; box-shadow: 0 8px 16px rgba(0,0,0,0.3); border: 2px solid var(--border-color, rgba(255,255,255,0.1));">
                        ${fotoPerfilUrl ? `<img src="${fotoPerfilUrl}" style="width:100%; height:100%; object-fit:cover;">` : iniciales}
                        <div style="position: absolute; bottom: 0; left: 0; width: 100%; background: rgba(0,0,0,0.6); height: 28px; display: flex; align-items: center; justify-content: center; font-size: 14px; color: white;">📷</div>
                    </div>
                    <input type="file" id="input-foto-perfil" accept="image/*" style="display: none;">
                    
                    <h2 style="color: var(--text-color, white); margin: 0 0 4px 0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">${window.miUsuario.nombre}</h2>
                    <p style="color: var(--text-muted, #A0A0A0); margin: 0 0 16px 0; font-size: 14px;">${window.miUsuario.email}</p>
                    <div style="background-color: var(--bg-color, #2B2A33); color: var(--text-color, #E0E0E0); padding: 8px 16px; border-radius: 16px; font-size: 13px; font-weight: 500; border: 1px solid var(--border-color, rgba(255,255,255,0.05));">
                        ${congregacionTexto}
                    </div>
                </div>

                <div style="display: flex; flex-direction: column; background: var(--bg-color, #25242C); border-radius: 20px; overflow: hidden; border: 1px solid var(--border-color, rgba(255,255,255,0.04)); flex-shrink: 0;">
                    <div class="perfil-opcion" id="opc-editar-datos" style="padding: 16px 20px; border-bottom: 1px solid var(--border-color, rgba(255,255,255,0.04)); display: flex; align-items: center; cursor: pointer; transition: opacity 0.2s;">
                        <span style="margin-right: 16px; font-size: 18px;">✏️</span>
                        <span style="color: var(--text-color, white); font-size: 15px; font-weight: 500;">Editar mis datos</span>
                    </div>
                    <div class="perfil-opcion" id="opc-tema" style="padding: 16px 20px; border-bottom: 1px solid var(--border-color, rgba(255,255,255,0.04)); display: flex; align-items: center; cursor: pointer; transition: opacity 0.2s;">
                        <span style="margin-right: 16px; font-size: 18px;">⚙️</span>
                        <span id="txt-tema-actual" style="color: var(--text-color, white); font-size: 15px; font-weight: 500;">Tema: ${opcionesTemasTextos[temaActual]}</span>
                    </div>
                    <div class="perfil-opcion" id="opc-cambiar-cong" style="padding: 16px 20px; border-bottom: 1px solid var(--border-color, rgba(255,255,255,0.04)); display: flex; align-items: center; cursor: pointer; transition: opacity 0.2s;">
                        <span style="margin-right: 16px; font-size: 18px;">🔄</span>
                        <span style="color: var(--text-color, white); font-size: 15px; font-weight: 500;">Cambiar de congregación</span>
                    </div>
                    <div class="perfil-opcion" id="opc-reportar" style="padding: 16px 20px; border-bottom: 1px solid var(--border-color, rgba(255,255,255,0.04)); display: flex; align-items: center; cursor: pointer; background: rgba(203, 164, 255, 0.05); transition: opacity 0.2s;">
                        <span style="margin-right: 16px; font-size: 18px; color: var(--primary-color, #CBA4FF);">💡</span>
                        <span style="color: var(--primary-color, #CBA4FF); font-size: 15px; font-weight: bold;">Reportar problema o idea</span>
                    </div>
                    <div class="perfil-opcion" id="opc-cerrar-sesion" style="padding: 16px 20px; display: flex; align-items: center; cursor: pointer; transition: opacity 0.2s;">
                        <span style="margin-right: 16px; font-size: 18px; color: var(--error-text, #E53935);">🚪</span>
                        <span style="color: var(--error-text, #E53935); font-size: 15px; font-weight: 500;">Cerrar sesión</span>
                    </div>
                </div>

                <div style="text-align: center; padding: 10px 20px 20px 20px; color: var(--text-muted, #777); font-size: 13px; margin-top: auto; flex-shrink: 0;">
                    <div style="font-weight: bold; color: var(--primary-color, #CBA4FF); font-size: 14px; letter-spacing: 0.5px;">Mi Territorio Web</div>
                    <div style="margin-top: 6px; font-weight: 500;">Versión instalada: ${WEB_VERSION}</div>
                </div>
                
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    function comprimirImagen(file, maxWithOrHeight = 700) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width; let height = img.height;
                    if (width > height) { if (width > maxWithOrHeight) { height *= maxWithOrHeight / width; width = maxWithOrHeight; } } 
                    else { if (height > maxWithOrHeight) { width *= maxWithOrHeight / height; height = maxWithOrHeight; } }
                    canvas.width = width; canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.75);
                };
            };
        });
    }

    document.getElementById('btn-cerrar-perfil').onclick = () => modal.remove();

    const contenedorAvatar = document.getElementById('contenedor-avatar');
    const inputFoto = document.getElementById('input-foto-perfil');
    contenedorAvatar.onclick = () => inputFoto.click();
    
    inputFoto.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        contenedorAvatar.innerHTML = `<span style="font-size:13px; color:white; font-weight:bold;">Subiendo...</span>`;
        try {
            const blobComprimido = await comprimirImagen(file);
            const storageRef = ref(storage, `usuarios/${window.miUsuario.email}/avatar.jpg`);
            await uploadBytes(storageRef, blobComprimido);
            const downloadUrl = await getDownloadURL(storageRef);
            await setDoc(doc(db, "usuarios", window.miUsuario.email), { fotoPerfil: downloadUrl }, { merge: true });
            contenedorAvatar.innerHTML = `<img src="${downloadUrl}" style="width:100%; height:100%; object-fit:cover;"><div style="position: absolute; bottom: 0; left: 0; width: 100%; background: rgba(0,0,0,0.6); height: 28px; display: flex; align-items: center; justify-content: center; font-size: 14px; color: white;">📷</div>`;
            const btnPrincipal = document.getElementById('btn-flotante-perfil');
            if(btnPrincipal) btnPrincipal.innerHTML = `<img src="${downloadUrl}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
        } catch(err) {
            alert("Error al subir: " + err.message); modal.remove(); mostrarPantallaPerfil();
        }
    };

    document.getElementById('opc-editar-datos').onclick = () => {
        const partes = window.miUsuario.nombre.split(' ');
        const viejoNombre = partes[0] || '';
        const viejoApellido = partes.slice(1).join(' ') || '';
        
        mostrarModalEditarDatos(viejoNombre, viejoApellido, async (nuevoNombre, nuevoApellido) => {
            const nombreArmado = `${nuevoNombre.trim()} ${nuevoApellido.trim()}`.trim();
            try {
                await setDoc(doc(db, "usuarios", window.miUsuario.email), { nombre: nuevoNombre.trim(), apellido: nuevoApellido.trim(), nombreCompleto: nombreArmado }, { merge: true });
                window.miUsuario.nombre = nombreArmado;
                modal.remove(); mostrarPantallaPerfil();
            } catch (error) { alert("Error al actualizar: " + error.message); }
        });
    };

    document.getElementById('opc-tema').onclick = () => {
        const temas = ['system', 'light', 'dark'];
        temaActual = temas[(temas.indexOf(temaActual) + 1) % temas.length];
        localStorage.setItem('themePref', temaActual);
        if (temaActual === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
        else if (temaActual === 'light') document.documentElement.setAttribute('data-theme', 'light');
        else document.documentElement.removeAttribute('data-theme');
        document.getElementById('txt-tema-actual').innerText = `Tema: ${opcionesTemasTextos[temaActual]}`;
    };

    document.getElementById('opc-cambiar-cong').onclick = () => {
        mostrarModalConfirmacion("¿Cambiar de congregación?", "Si sales de tu congregación actual, tu rol se perderá y volverás a la sala de espera al unirte a una nueva. ¿Estás seguro?", "Sí, salir", "var(--error-text)", () => {
            localStorage.removeItem('miCongregacionId'); location.reload();
        });
    };

    document.getElementById('opc-cerrar-sesion').onclick = () => {
        mostrarModalConfirmacion("¿Cerrar sesión?", "¿Seguro que deseas cerrar tu sesión en este dispositivo?", "Cerrar sesión", "var(--error-text)", async () => {
            await signOut(auth); modal.remove(); location.reload();
        });
    };

    document.getElementById('opc-reportar').onclick = () => abrirModalReporteAvanzado();
}

function mostrarModalEditarDatos(nombreActual, apellidoActual, onGuardar) {
    let m = document.createElement('div');
    m.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: var(--modal-overlay); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); z-index: 10005; display: flex; align-items: center; justify-content: center; padding: 20px; box-sizing: border-box; font-family: sans-serif;';
    
    m.innerHTML = `
        <div style="background: var(--surface-color); width: 100%; max-width: 320px; border-radius: 24px; padding: 24px; box-shadow: 0 16px 40px rgba(0,0,0,0.6); border: 1px solid var(--border-color);">
            <h3 style="color: var(--text-color); margin: 0 0 20px 0; font-size: 20px; text-align: center;">Editar mis datos</h3>
            <label style="display: block; color: var(--text-muted); font-size: 12px; font-weight: bold; margin-bottom: 6px; text-transform: uppercase;">Nombre</label>
            <input type="text" id="input-edit-nombre" value="${nombreActual}" style="width: 100%; background: var(--bg-color); border: 1px solid var(--border-color); color: var(--text-color); padding: 14px; border-radius: 12px; margin-bottom: 16px; font-size: 15px; box-sizing: border-box; outline: none; transition: border 0.2s;">
            <label style="display: block; color: var(--text-muted); font-size: 12px; font-weight: bold; margin-bottom: 6px; text-transform: uppercase;">Apellido</label>
            <input type="text" id="input-edit-apellido" value="${apellidoActual}" style="width: 100%; background: var(--bg-color); border: 1px solid var(--border-color); color: var(--text-color); padding: 14px; border-radius: 12px; margin-bottom: 24px; font-size: 15px; box-sizing: border-box; outline: none; transition: border 0.2s;">
            <div style="display: flex; justify-content: flex-end; gap: 12px;">
                <button id="btn-cancelar-edit" style="background: transparent; border: none; color: var(--primary-color); font-weight: bold; font-size: 15px; padding: 10px 16px; border-radius: 10px; cursor: pointer;">Cancelar</button>
                <button id="btn-guardar-edit" style="background: var(--primary-color); color: white; border: none; font-weight: bold; font-size: 15px; padding: 10px 20px; border-radius: 10px; cursor: pointer;">Guardar</button>
            </div>
        </div>
    `;
    document.body.appendChild(m);
    
    document.getElementById('input-edit-nombre').addEventListener('focus', (e) => e.target.style.borderColor = 'var(--primary-color)');
    document.getElementById('input-edit-nombre').addEventListener('blur', (e) => e.target.style.borderColor = 'var(--border-color)');
    document.getElementById('input-edit-apellido').addEventListener('focus', (e) => e.target.style.borderColor = 'var(--primary-color)');
    document.getElementById('input-edit-apellido').addEventListener('blur', (e) => e.target.style.borderColor = 'var(--border-color)');

    document.getElementById('btn-cancelar-edit').onclick = () => m.remove();
    document.getElementById('btn-guardar-edit').onclick = () => {
        const nNombre = document.getElementById('input-edit-nombre').value.trim();
        const nApellido = document.getElementById('input-edit-apellido').value.trim();
        if(!nNombre) return alert("Por favor, ingresa al menos tu nombre.");
        
        const btnGuardar = document.getElementById('btn-guardar-edit');
        btnGuardar.innerText = "Guardando..."; btnGuardar.disabled = true;
        onGuardar(nNombre, nApellido); m.remove();
    };
}

function mostrarModalConfirmacion(titulo, mensaje, txtConfirmar, colorConfirmar, onConfirm) {
    let m = document.createElement('div');
    m.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: var(--modal-overlay); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); z-index: 10005; display: flex; align-items: center; justify-content: center; padding: 20px; box-sizing: border-box; font-family: sans-serif;';
    
    m.innerHTML = `
        <div style="background: var(--surface-color); width: 100%; max-width: 320px; border-radius: 24px; padding: 24px; box-shadow: 0 16px 40px rgba(0,0,0,0.6); border: 1px solid var(--border-color); text-align: center;">
            <div style="font-size: 36px; margin-bottom: 16px; animation: latido 2s infinite;">⚠️</div>
            <h3 style="color: var(--text-color); margin: 0 0 12px 0; font-size: 20px;">${titulo}</h3>
            <p style="color: var(--text-muted); font-size: 14px; margin: 0 0 28px 0; line-height: 1.5;">${mensaje}</p>
            <div style="display: flex; flex-direction: column; gap: 12px;">
                <button id="btn-accion-confirm" style="background: ${colorConfirmar}; color: white; border: none; font-weight: bold; padding: 14px; border-radius: 12px; cursor: pointer; font-size: 15px;">${txtConfirmar}</button>
                <button id="btn-cancelar-confirm" style="background: transparent; border: 1px solid var(--border-color); color: var(--text-color); font-weight: bold; padding: 14px; border-radius: 12px; cursor: pointer; font-size: 15px;">Cancelar</button>
            </div>
        </div>
    `;
    document.body.appendChild(m);
    
    document.getElementById('btn-cancelar-confirm').onclick = () => m.remove();
    document.getElementById('btn-accion-confirm').onclick = () => { m.remove(); onConfirm(); };
}

function mostrarModalCrearCongregacion(onCrear) {
    let m = document.createElement('div');
    m.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: var(--modal-overlay); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); z-index: 10005; display: flex; align-items: center; justify-content: center; padding: 20px; box-sizing: border-box; font-family: sans-serif;';
    
    m.innerHTML = `
        <div style="background: var(--surface-color); width: 100%; max-width: 340px; border-radius: 24px; padding: 24px; box-shadow: 0 16px 40px rgba(0,0,0,0.6); border: 1px solid var(--border-color);">
            <div style="font-size: 32px; text-align: center; margin-bottom: 12px;">🏛️</div>
            <h3 style="color: var(--text-color); margin: 0 0 20px 0; font-size: 20px; text-align: center;">Crear Congregación</h3>
            
            <label style="display: block; color: var(--text-muted); font-size: 12px; font-weight: bold; margin-bottom: 6px; text-transform: uppercase;">Número Oficial</label>
            <input type="number" id="input-crear-numero" placeholder="Ej: 1552" style="width: 100%; background: var(--bg-color); border: 1px solid var(--border-color); color: var(--text-color); padding: 14px; border-radius: 12px; margin-bottom: 16px; font-size: 15px; box-sizing: border-box; outline: none; transition: border 0.2s;">
            
            <label style="display: block; color: var(--text-muted); font-size: 12px; font-weight: bold; margin-bottom: 6px; text-transform: uppercase;">Nombre de la Congregación</label>
            <input type="text" id="input-crear-nombre" placeholder="Ej: Mendoza" style="width: 100%; background: var(--bg-color); border: 1px solid var(--border-color); color: var(--text-color); padding: 14px; border-radius: 12px; margin-bottom: 20px; font-size: 15px; box-sizing: border-box; outline: none; transition: border 0.2s;">
            
            <p id="error-crear-cong" style="color: var(--error-text); font-size: 13px; margin: 0 0 16px 0; display: none; text-align: center; font-weight: bold;"></p>

            <div style="display: flex; justify-content: flex-end; gap: 12px;">
                <button id="btn-cancelar-crear" style="background: transparent; border: none; color: var(--primary-color); font-weight: bold; font-size: 15px; padding: 10px 16px; border-radius: 10px; cursor: pointer;">Cancelar</button>
                <button id="btn-guardar-crear" style="background: var(--primary-color); color: white; border: none; font-weight: bold; font-size: 15px; padding: 10px 20px; border-radius: 10px; cursor: pointer;">Crear</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(m);
    
    document.getElementById('input-crear-numero').addEventListener('focus', (e) => e.target.style.borderColor = 'var(--primary-color)');
    document.getElementById('input-crear-numero').addEventListener('blur', (e) => e.target.style.borderColor = 'var(--border-color)');
    document.getElementById('input-crear-nombre').addEventListener('focus', (e) => e.target.style.borderColor = 'var(--primary-color)');
    document.getElementById('input-crear-nombre').addEventListener('blur', (e) => e.target.style.borderColor = 'var(--border-color)');

    const lblError = document.getElementById('error-crear-cong');

    document.getElementById('btn-cancelar-crear').onclick = () => m.remove();
    document.getElementById('btn-guardar-crear').onclick = () => {
        const numero = document.getElementById('input-crear-numero').value.trim();
        const nombre = document.getElementById('input-crear-nombre').value.trim();
        lblError.style.display = 'none';

        if (!numero || !/^\d+$/.test(numero)) { lblError.innerText = "Error: Ingresa un número válido."; lblError.style.display = 'block'; return; }
        if (!nombre) { lblError.innerText = "Error: El nombre es obligatorio."; lblError.style.display = 'block'; return; }
        
        const btnGuardar = document.getElementById('btn-guardar-crear');
        btnGuardar.innerText = "Creando..."; btnGuardar.disabled = true;
        
        onCrear(numero, nombre, m);
    };
}

function abrirModalReporteAvanzado() {
    let modal = document.getElementById('modal-reporte-pro');
    if (modal) modal.remove();

    let archivoAdjunto = null;
    let tipoArchivo = "";

    modal = document.createElement('div');
    modal.id = 'modal-reporte-pro';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: var(--surface-color); z-index: 10000; display: flex; flex-direction: column; font-family: sans-serif;';
    
    modal.innerHTML = `
        <div style="padding: 16px; display: flex; align-items: center; border-bottom: 1px solid var(--border-color);">
            <button id="btn-cerrar-reporte" style="background: none; border: none; color: var(--text-color); font-size: 20px; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 10px;">
                ✕ <span style="font-size: 18px;">Reportar Idea o Problema</span>
            </button>
        </div>
        
        <div style="padding: 24px; display: flex; flex-direction: column; flex: 1;">
            <h3 style="color: var(--primary-color); margin: 0 0 8px 0; font-size: 18px;">¡Tu opinión nos ayuda a mejorar!</h3>
            <p style="color: var(--text-muted); font-size: 14px; margin: 0 0 20px 0; line-height: 1.4;">Cuéntanos qué problema tuviste o qué idea genial se te ocurrió. Puedes adjuntar fotos o grabar un audio.</p>
            
            <textarea id="txt-reporte-detalle" placeholder="Escribe aquí todos los detalles..." style="width: 100%; height: 150px; background: transparent; border: 1px solid var(--border-color); border-radius: 12px; padding: 16px; color: var(--text-color); font-size: 15px; resize: none; outline: none; margin-bottom: 20px; box-sizing: border-box;"></textarea>
            
            <div id="preview-adjunto" style="display: none; align-items: center; gap: 10px; background: rgba(203, 164, 255, 0.1); padding: 12px; border-radius: 12px; margin-bottom: 20px; border: 1px solid rgba(203, 164, 255, 0.3);">
                <span id="icono-adjunto" style="font-size: 24px;">📄</span>
                <span id="nombre-adjunto" style="color: var(--text-color); font-size: 14px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">Archivo.jpg</span>
                <button id="btn-quitar-adjunto" style="background: none; border: none; color: var(--error-text); font-size: 18px; cursor: pointer;">✕</button>
            </div>

            <div style="display: flex; gap: 12px;">
                <button id="btn-adjuntar" style="flex: 1; background: transparent; border: 1px solid var(--border-color); color: var(--text-color); border-radius: 12px; padding: 14px; font-weight: bold; display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer;">
                    📎 Adjuntar
                </button>
                <input type="file" id="input-archivo-reporte" accept="image/*,video/*,.pdf" style="display: none;">
                
                <button id="btn-microfono" style="width: 56px; height: 52px; background: var(--primary-color); border: none; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 22px; cursor: pointer; box-shadow: 0 4px 8px rgba(0,0,0,0.2);">
                    🎤
                </button>
                <input type="file" id="input-audio-reporte" accept="audio/*" capture="microphone" style="display: none;">
            </div>

            <div style="flex: 1;"></div>

            <button id="btn-enviar-reporte" style="width: 100%; background: var(--primary-color); color: white; border: none; padding: 16px; border-radius: 12px; font-weight: bold; font-size: 16px; cursor: pointer; box-shadow: 0 4px 12px rgba(203, 164, 255, 0.2); margin-top: 20px;">
                Enviar Reporte
            </button>
        </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('btn-cerrar-reporte').onclick = () => modal.remove();
    
    const divPreview = document.getElementById('preview-adjunto');
    const txtNombre = document.getElementById('nombre-adjunto');
    const iconoAdjunto = document.getElementById('icono-adjunto');

    function mostrarPreview(file, icon) {
        archivoAdjunto = file; iconoAdjunto.innerText = icon;
        txtNombre.innerText = file.name || "Grabación de audio";
        divPreview.style.display = 'flex';
    }

    document.getElementById('btn-quitar-adjunto').onclick = () => {
        archivoAdjunto = null; divPreview.style.display = 'none';
        document.getElementById('input-archivo-reporte').value = '';
        document.getElementById('input-audio-reporte').value = '';
    };

    document.getElementById('btn-adjuntar').onclick = () => document.getElementById('input-archivo-reporte').click();
    document.getElementById('input-archivo-reporte').onchange = (e) => {
        if(e.target.files[0]) { tipoArchivo = "imagen_documento"; mostrarPreview(e.target.files[0], '📎'); }
    };

    document.getElementById('btn-microfono').onclick = () => document.getElementById('input-audio-reporte').click();
    document.getElementById('input-audio-reporte').onchange = (e) => {
        if(e.target.files[0]) { tipoArchivo = "audio"; mostrarPreview(e.target.files[0], '🎵'); }
    };

    document.getElementById('btn-enviar-reporte').onclick = async () => {
        const texto = document.getElementById('txt-reporte-detalle').value.trim();
        if (!texto && !archivoAdjunto) return alert("Por favor, escribe un detalle o adjunta un archivo.");

        const btnEnviar = document.getElementById('btn-enviar-reporte');
        btnEnviar.innerText = "Enviando..."; btnEnviar.disabled = true;

        try {
            let fileUrl = "";
            if (archivoAdjunto) {
                const extension = archivoAdjunto.name ? archivoAdjunto.name.split('.').pop() : (tipoArchivo === 'audio' ? 'm4a' : 'jpg');
                const storageRef = ref(getStorage(), `reportes/${window.miUsuario.email}_${Date.now()}.${extension}`);
                await uploadBytes(storageRef, archivoAdjunto);
                fileUrl = await getDownloadURL(storageRef);
            }

            await setDoc(doc(db, "reportes_ideas", Date.now().toString()), {
                email: window.miUsuario.email, nombre: window.miUsuario.nombre,
                mensaje: texto, adjunto: fileUrl, tipoAdjunto: tipoArchivo,
                fecha: Date.now(), congregacionId: window.miUsuario.congregacionId || "Ninguna"
            });

            alert("¡Sugerencia enviada! El equipo la revisará pronto.");
            modal.remove();
        } catch (e) {
            alert("Error al enviar el reporte: " + e.message);
            btnEnviar.innerText = "Enviar Reporte"; btnEnviar.disabled = false;
        }
    };
}

function normalizarTexto(texto) {
    if (!texto) return "";
    return texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/v/g, "b");
}

function mostrarBuscadorCongregaciones(email, nombreCompleto) {
    toggleContenidoApp(false);

    let contenedor = document.getElementById('contenedor-onboarding');
    if (!contenedor) {
        contenedor = document.createElement('div');
        contenedor.id = 'contenedor-onboarding';
        contenedor.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: var(--bg-color); display: flex; align-items: center; justify-content: center; z-index: 9999; padding: 20px; box-sizing: border-box; font-family: sans-serif;';
        document.body.appendChild(contenedor);
    }

    contenedor.innerHTML = `
        <div style="background: var(--surface-color); padding: 30px; border-radius: 16px; box-shadow: 0 8px 24px rgba(0,0,0,0.1); width: 100%; max-width: 420px; text-align: center; box-sizing: border-box; border: 1px solid var(--border-color);">
            <h3 style="margin: 0 0 8px 0; color: var(--text-color); font-size: 20px;">Hola, ${nombreCompleto}</h3>
            <p style="color: var(--text-muted); margin-bottom: 20px; font-size: 14px;">Busca tu congregación para unirte:</p>
            <div style="position: relative; text-align: left;">
                <input type="text" id="input-busqueda-cong" placeholder="Nombre o Número (Ej: Mendoza)" style="width: 100%; padding: 12px 40px 12px 12px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--bg-color); color: var(--text-color); box-sizing: border-box; font-size: 15px; outline: none;">
                <span style="position: absolute; right: 12px; top: 12px; color: #aaa;">🔍</span>
            </div>
            <div id="lista-resultados-cong" style="max-height: 180px; overflow-y: auto; margin-top: 10px; border-radius: 8px; background: var(--bg-color); border: 1px solid var(--border-color); display: none;"></div>
            <div style="margin-top: 25px;">
                <button id="btn-abrir-crear-cong" style="background: none; border: none; color: var(--primary-color); font-weight: bold; cursor: pointer; font-size: 14px;">¿Tu congregación no está? Créala aquí</button>
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
    }).catch(err => console.error(err));

    inputBusqueda.oninput = () => {
        const txtNorm = normalizarTexto(inputBusqueda.value);
        if (!txtNorm) { listaResultados.style.display = 'none'; return; }

        const filtrados = directorioGlobal.filter(c => normalizarTexto(c.id).includes(txtNorm) || normalizarTexto(c.nombre).includes(txtNorm));

        if (filtrados.length > 0) {
            listaResultados.innerHTML = '';
            listaResultados.style.display = 'block';
            filtrados.forEach(cong => {
                const item = document.createElement('div');
                item.style.cssText = 'padding: 12px; cursor: pointer; border-bottom: 1px solid var(--border-color); text-align: left;';
                item.innerHTML = `<div style="font-weight: bold; color: var(--text-color); font-size: 15px;">${cong.nombre}</div><div style="font-size: 12px; color: var(--text-muted);">Nº Oficial: ${cong.id}</div>`;
                
                item.onclick = async () => {
                    inputBusqueda.disabled = true;
                    listaResultados.style.display = 'none';
                    contenedor.innerHTML = '<div style="color:var(--text-muted); font-weight:bold;">Verificando acceso... ⏳</div>';
                    
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
                                await setDoc(docRef, { roles: { [email]: "pendiente" } }, { merge: true });
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
            listaResultados.innerHTML = '<div style="padding: 12px; color: var(--error-text); font-size: 13px; text-align: left;">No se encontró ninguna congregación.</div>';
            listaResultados.style.display = 'block';
        }
    };

    btnAbrirCrear.onclick = () => {
        mostrarModalCrearCongregacion((numero, nombre, modalReference) => {
            const docRef = doc(db, "congregaciones", numero);
            setDoc(docRef, { nombre: nombre, roles: { [email]: "siervo" } }, { merge: true }).then(() => {
                localStorage.setItem('miCongregacionId', numero);
                modalReference.remove();
                activarVigilanteRealtime(email, numero, nombreCompleto);
            }).catch(err => {
                const lblError = document.getElementById('error-crear-cong');
                if (lblError) {
                    lblError.innerText = "Error de conexión: " + err.message;
                    lblError.style.display = 'block';
                }
                const btnGuardar = document.getElementById('btn-guardar-crear');
                btnGuardar.innerText = "Crear"; btnGuardar.disabled = false;
            });
        });
    };
}

function activarVigilanteRealtime(email, congId, nombreCompleto) {
    if (window.unsubVigilanteRole) window.unsubVigilanteRole();
    const docRef = doc(db, "congregaciones", congId);

    window.unsubVigilanteRole = onSnapshot(docRef, (docSnap) => {
        if (!docSnap.exists()) { manejarExpulsionORechazo(); return; }

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

            window.miUsuario = { email, nombre: nombreCompleto, rol: miRolActual, congregacionId: congId, congregacionNombre: congData.nombre || '' };

            aplicarCandadoPrivacidad(miRolActual);

            const btnFabRegistro = document.getElementById('btn-fab-registro');
            if (btnFabRegistro) {
                if (miRolActual === 'siervo' || miRolActual === 'ayudante' || miRolActual === 'conductor') {
                    btnFabRegistro.style.display = 'block';
                } else {
                    btnFabRegistro.style.display = 'none';
                }
            }

            if (!window.motoresArrancados) {
                configurarPanelAdmin();
                inicializarMapaYVisitas();
                window.motoresArrancados = true;
            }
        } else { manejarExpulsionORechazo(); }
    });
}

function mostrarPantallaSalaEspera(congId, congNombre, email, nombreCompleto) {
    toggleContenidoApp(false);
    let contenedor = document.getElementById('contenedor-onboarding');
    if (!contenedor) {
        contenedor = document.createElement('div');
        contenedor.id = 'contenedor-onboarding';
        contenedor.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: var(--bg-color); display: flex; align-items: center; justify-content: center; z-index: 9999; padding: 20px; box-sizing: border-box; font-family: sans-serif;';
        document.body.appendChild(contenedor);
    }

    contenedor.innerHTML = `
        <div style="background: var(--surface-color); padding: 40px 30px; border-radius: 16px; box-shadow: 0 8px 24px rgba(0,0,0,0.1); width: 100%; max-width: 420px; text-align: center; box-sizing: border-box; border: 1px solid var(--border-color);">
            <div style="font-size: 52px; margin-bottom: 20px; animation: rotarReloj 2s linear infinite;">⏳</div>
            <h3 style="margin: 0 0 12px 0; color: var(--text-color); font-size: 22px; font-weight: bold;">Solicitud Enviada</h3>
            <p style="color: var(--text-muted); font-size: 14px; line-height: 1.5; margin-bottom: 16px;">
                Tu solicitud para unirte a <strong>${congNombre} (Nº ${congId})</strong> está en lista de espera.
            </p>
            <p style="color: var(--primary-color); font-size: 14px; font-weight: bold; line-height: 1.5; margin-bottom: 30px;">
                Espera que el Siervo de Territorios apruebe tu cuenta. Esta pantalla se actualizará de forma automática.
            </p>
            <button id="btn-cancelar-solicitud" style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--border-color); background: transparent; color: var(--text-color); font-weight: bold; cursor: pointer; transition: background 0.2s;">Cancelar solicitud</button>
        </div>
    `;

    document.getElementById('btn-cancelar-solicitud').onclick = () => {
        mostrarModalConfirmacion(
            "¿Cancelar solicitud?", 
            "¿Seguro que deseas cancelar tu ingreso a esta congregación? Se cerrará tu sesión para que puedas ingresar con otra cuenta si lo deseas.", 
            "Sí, cancelar y salir", 
            "var(--error-text)", 
            async () => {
                if (window.unsubVigilanteRole) { window.unsubVigilanteRole(); window.unsubVigilanteRole = null; }
                localStorage.removeItem('miCongregacionId'); 
                await signOut(auth); 
                contenedor.remove(); 
                location.reload(); 
            }
        );
    };
}

function manejarExpulsionORechazo() {
    if (window.unsubVigilanteRole) { window.unsubVigilanteRole(); window.unsubVigilanteRole = null; }
    localStorage.removeItem('miCongregacionId'); location.reload();
}

function toggleContenidoApp(mostrar) {
    const dashboardSection = document.getElementById('dashboard-section');
    if (!dashboardSection) return;
    Array.from(dashboardSection.children).forEach(child => { if (child.id !== 'contenedor-onboarding') child.style.visibility = mostrar ? 'visible' : 'hidden'; });
}