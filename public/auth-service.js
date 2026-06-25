// ==========================================
// ARCHIVO: auth-service.js (VERSIÓN DEFINITIVA Y SEGURA)
// ==========================================
import { signInWithPopup, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, getDoc, collection, getDocs, updateDoc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { auth, provider, db } from "./firebase-core.js";
import { inicializarMapaYVisitas } from "./map-service.js";
import { configurarPanelAdmin } from "./admin-service.js";

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

            window.miUsuario = { email, nombre: nombreCompleto, rol: null, congregacionId: null };
            let miCongregacionId = localStorage.getItem('miCongregacionId');

            if (miCongregacionId) {
                activarVigilanteRealtime(email, miCongregacionId, nombreCompleto);
            } else {
                mostrarBuscadorCongregaciones(email, nombreCompleto);
            }
        } else {
            if (loginSection) loginSection.style.display = 'flex'; 
            if (dashboardSection) dashboardSection.style.display = 'none';
            if (btnLogin) btnLogin.innerText = "Iniciar sesión con Google";
            
            document.getElementById('contenedor-onboarding')?.remove();
            if (window.unsubVigilanteRole) { window.unsubVigilanteRole(); window.unsubVigilanteRole = null; }
            window.motoresArrancados = false; // Reiniciamos el seguro al salir
        }
    });
}

// ==============================================================
// MOTOR BUSCADOR PREDICTIVO
// ==============================================================
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
                                // YA ESTABA REGISTRADO (No le pisamos el rol)
                                localStorage.setItem('miCongregacionId', cong.id);
                                activarVigilanteRealtime(email, cong.id, nombreCompleto);
                            } else {
                                // ES NUEVO (Lo ponemos en sala de espera)
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

// ==============================================================
// EL VIGILANTE DE SEGURIDAD (SNAPSHOT EN TIEMPO REAL)
// ==============================================================
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
            mostrarPantallaSalaEspera(congId, congData.nombre || `Congregación ${congId}`, email, nombreCompleto);
        } else if (miRolActual) {
            document.getElementById('contenedor-onboarding')?.remove();
            toggleContenidoApp(true);

            window.miUsuario = {
                email, nombre: nombreCompleto, rol: miRolActual, congregacionId: congId,
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

            // EL SEGURO: Encendemos los motores SOLO una vez
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

// ==============================================================
// VISTAS ACCESORIAS DE INTERFAZ DILIGENTE
// ==============================================================
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