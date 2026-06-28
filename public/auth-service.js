// ==========================================
// ARCHIVO: auth-service.js (VERSIÓN v1.6.6 - CON ONBOARDING DE USUARIO)
// ==========================================
import { signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, getDoc, collection, getDocs, updateDoc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";
import { auth, provider, db } from "./firebase-core.js";
import { inicializarMapaYVisitas } from "./map-service.js";
import { configurarPanelAdmin } from "./admin-service.js";

// 👇 CONTROL DE CACHÉ ACTIVO 👇
const WEB_VERSION = "v1.6.6"; 

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
            const userSnap = await getDoc(doc(db, "usuarios", email));

            // 🔥 FILTRO DE PRIMER INGRESO (ONBOARDING) 🔥
            if (userSnap.exists() && userSnap.data().nombre) {
                // El usuario ya existe en la base de datos, seguimos de largo
                const nombreCompleto = `${userSnap.data().nombre} ${userSnap.data().apellido || ''}`.trim();
                continuarFlujoAutenticacion(email, nombreCompleto);
            } else {
                // ¡Es nuevo! Le pedimos el nombre y apellido
                mostrarPantallaOnboarding(email, user.displayName || "");
            }

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

function mostrarPantallaOnboarding(email, googleName) {
    toggleContenidoApp(false);

    // Intentamos pre-llenar los campos desarmando el nombre que nos da Google
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
        contenedor.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: #f5f5f5; display: flex; align-items: center; justify-content: center; z-index: 9999; padding: 20px; box-sizing: border-box; font-family: sans-serif;';
        document.body.appendChild(contenedor);
    }

    contenedor.innerHTML = `
        <div style="background: white; padding: 30px; border-radius: 16px; box-shadow: 0 8px 24px rgba(0,0,0,0.1); width: 100%; max-width: 400px; box-sizing: border-box;">
            <h3 style="margin: 0 0 8px 0; color: #333; font-size: 22px; text-align: center;">¡Bienvenido a Mi Territorio!</h3>
            <p style="color: #666; margin-bottom: 24px; font-size: 14px; text-align: center;">Para empezar, dinos cómo te llamas:</p>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; font-size: 13px; color: gray; font-weight: bold; margin-bottom: 6px;">Nombre</label>
                <input type="text" id="onboarding-nombre" value="${preNombre}" placeholder="Ej: Juan" style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid #ccc; box-sizing: border-box; font-size: 15px; outline: none;">
            </div>
            
            <div style="margin-bottom: 25px;">
                <label style="display: block; font-size: 13px; color: gray; font-weight: bold; margin-bottom: 6px;">Apellido</label>
                <input type="text" id="onboarding-apellido" value="${preApellido}" placeholder="Ej: Perez" style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid #ccc; box-sizing: border-box; font-size: 15px; outline: none;">
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
            // Guardamos al hermano en la colección general
            await setDoc(doc(db, "usuarios", email), {
                nombre: nombre,
                apellido: apellido,
                fechaRegistro: Date.now()
            }, { merge: true });

            const nombreCompleto = `${nombre} ${apellido}`.trim();
            contenedor.remove();
            
            // Reanudamos el motor de la app
            continuarFlujoAutenticacion(email, nombreCompleto);

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
    btnPerfil.style.cssText = 'width: 38px; height: 38px; border-radius: 50%; background-color: #CBA4FF; color: #4A148C; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 15px; cursor: pointer; flex-shrink: 0; margin-left: 15px; box-shadow: 0 2px 5px rgba(0,0,0,0.2);';
    btnPerfil.innerText = iniciales;
    
    btnPerfil.onclick = () => mostrarPantallaPerfil();
    
    const contenedorIconos = document.querySelector('.app-icons');
    if (contenedorIconos) {
        contenedorIconos.appendChild(btnPerfil);
    } else {
        document.body.appendChild(btnPerfil);
    }
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
        <div style="text-align: center; padding: 20px; color: #777; font-size: 13px;">
            <div style="font-weight: bold; color: #CBA4FF; font-size: 14px;">Mi Territorio Web</div>
            <div style="margin-top: 4px;">Versión instalada: ${WEB_VERSION}</div>
        </div>
    `;

    document.body.appendChild(modal);
    document.getElementById('btn-cerrar-perfil').onclick = () => modal.remove();
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
                item.style.cssText = 'padding: 12px; cursor: pointer; border-bottom: 1px solid #eee; text-align: left;';
                item.innerHTML = `<div style="font-weight: bold; color: #333; font-size: 15px;">${cong.nombre}</div><div style="font-size: 12px; color: #777;">Nº Oficial: ${cong.id}</div>`;
                
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
            listaResultados.innerHTML = '<div style="padding: 12px; color: #c62828; font-size: 13px; text-align: left;">No se encontró ninguna congregación.</div>';
            listaResultados.style.display = 'block';
        }
    };

    btnAbrirCrear.onclick = () => {
        const numero = prompt("Ingresa el Número Oficial:");
        if (!numero || !/^\d+$/.test(numero)) return alert("Número inválido.");
        const nombre = prompt("Ingresa el Nombre:");
        if (!nombre || !nombre.trim()) return alert("Nombre obligatorio.");

        const docRef = doc(db, "congregaciones", numero.trim());
        setDoc(docRef, { nombre: nombre.trim(), roles: { [email]: "siervo" } }, { merge: true }).then(() => {
            localStorage.setItem('miCongregacionId', numero.trim());
            activarVigilanteRealtime(email, numero.trim(), nombreCompleto);
        }).catch(err => alert(err.message));
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
        } else { manejarExpulsionORechazo(); }
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
            <button id="btn-cancelar-solicitud" style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid #ccc; background: transparent; color: #555; font-weight: bold; cursor: pointer;">Cancelar solicitud</button>
        </div>
    `;

    document.getElementById('btn-cancelar-solicitud').onclick = () => {
        if (confirm("¿Quieres cancelar la solicitud?")) {
            if (window.unsubVigilanteRole) { window.unsubVigilanteRole(); window.unsubVigilanteRole = null; }
            localStorage.removeItem('miCongregacionId'); contenedor.remove(); location.reload();
        }
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