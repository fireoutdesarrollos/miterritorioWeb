import { signInWithPopup, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
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
            let miCongregacionId = "1552"; 
            let miRol = "publicador";

            const userSnap = await getDoc(doc(db, "usuarios", email));
            if (userSnap.exists()) nombreCompleto = `${userSnap.data().nombre} ${userSnap.data().apellido}`;

            const congSnap = await getDoc(doc(db, "congregaciones", miCongregacionId));
            if (congSnap.exists()) {
                const congData = congSnap.data();
                const appTitleEl = document.querySelector('.app-title');
                if (appTitleEl) appTitleEl.innerText = congData.nombre || `Congregación ${miCongregacionId}`;
                if (congData.roles && congData.roles[email]) miRol = congData.roles[email];
            }
            
            // Guardamos al usuario en la ventana global para que los otros archivos lo vean
            window.miUsuario = { email, nombre: nombreCompleto, rol: miRol, congregacionId: miCongregacionId, visitaActivaId: null, visitaActivaNotas: "", tempLat: 0, tempLng: 0 };

            if (miRol === 'siervo' || miRol === 'ayudante' || miRol === 'conductor') {
                const tabServicio = document.getElementById('tab-servicio');
                const btnFabRegistro = document.getElementById('btn-fab-registro');
                if (tabServicio) tabServicio.style.display = 'block';
                if (btnFabRegistro) btnFabRegistro.style.display = 'block';
            }

            // Arrancar los otros motores ahora que sabemos quién es el usuario
            configurarPanelAdmin();
            inicializarMapaYVisitas();

        } else {
            if (loginSection) loginSection.style.display = 'flex'; 
            if (dashboardSection) dashboardSection.style.display = 'none';
            if (btnLogin) btnLogin.innerText = "Iniciar sesión con Google";
        }
    });
}