// ==========================================
// ARCHIVO: ui-controller.js
// ==========================================
import { guardarNuevoPuntoSalida } from './map-service.js';

export function iniciarControladorUI() {
    // 1. Manejo de Pestañas (NUEVA BOTTOM NAVIGATION BAR M3)
    const navItems = document.querySelectorAll('.nav-item');
    const views = document.querySelectorAll('.view-section');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault(); 
            history.pushState({ page: 'tab' }, '', '');
            
            navItems.forEach(t => t.classList.remove('active')); 
            views.forEach(v => v.style.display = 'none');
            
            // Aseguramos que al cambiar de pestaña principal, las sub-vistas del Siervo se oculten
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
            
            item.classList.add('active'); 
            const tId = item.getAttribute('data-target'); 
            const tView = document.getElementById(tId);
            
            // Soporte dual para IDs viejos y nuevos
            if ((tId === 'map-view' || tId === 'vista-mapa') && tView) {
                tView.style.display = 'flex'; 
            } else if (tView) {
                tView.style.display = 'block';
            }
        });
    });

    // 2. Cerrar Modales básicos
    const btnCerrarFicha = document.getElementById('btn-cerrar-ficha');
    if (btnCerrarFicha) btnCerrarFicha.onclick = () => history.back();
   
    inicializarModalListaPuntos();
}

// 🔥 EL CANDADO DEFINITIVO DE PRIVACIDAD 🔥
export function aplicarCandadoPrivacidad(rol) {
    const tabServicio = document.querySelector('.nav-item[data-target="servicio-view"]') || document.querySelector('.nav-item[data-target="vista-planificador"]');
    const tabPrograma = document.querySelector('.nav-item[data-target="programa-view"]') || document.querySelector('.nav-item[data-target="vista-territorios"]');
    
    // 1. Mostrar Programa para TODOS
    if (tabPrograma) {
        tabPrograma.style.display = 'flex';
    }

    if (!tabServicio) return;

    // 2. Mostrar Servicio SOLO para Alta Gerencia
    if (rol === 'siervo' || rol === 'ayudante') {
        tabServicio.style.display = 'flex'; 
    } else {
        // Publicadores, invitados y CONDUCTORES rebotan acá
        tabServicio.style.display = 'none';
        
        // Si estaba espiando la URL, lo pateamos al mapa
        if (tabServicio.classList.contains('active')) {
            const tabMapa = document.querySelector('.nav-item[data-target="map-view"]') || document.querySelector('.nav-item[data-target="vista-mapa"]');
            if (tabMapa) tabMapa.click();
        }
    }
}

// 🔥 LÓGICA DEL MODAL DE PUNTOS DE SALIDA 🔥
export function inicializarModalPuntosSalida() {
    const modalPunto = document.getElementById('modal-punto-salida');
    if (!modalPunto) return;
    
    const btnAbrir = document.getElementById('btn-abrir-modal-punto');
    if (btnAbrir) {
        btnAbrir.addEventListener('click', () => {
            modalPunto.style.display = 'flex';
            history.pushState({ modalAbierto: true }, null, null);
        });
    }

    const btnCancelar = document.getElementById('btn-cancelar-punto');
    if (btnCancelar) {
        btnCancelar.addEventListener('click', () => {
            modalPunto.style.display = 'none';
            if (history.state && history.state.modalAbierto) history.back();
        });
    }

    // 3. Lógica de buscar en el mapa (CON BOTÓN CANCELAR)
    const btnElegirMapa = document.getElementById('btn-elegir-mapa-punto');
    if (btnElegirMapa) {
        btnElegirMapa.addEventListener('click', () => {
            modalPunto.style.display = 'none';
            window.modoUbicacionActivo = true; 
            
            const banner = document.createElement('div');
            banner.id = 'banner-ubicacion';
            banner.style.cssText = 'position: fixed; top: 80px; left: 50%; transform: translateX(-50%); background: #2196F3; color: white; padding: 10px 20px; border-radius: 30px; font-weight: bold; z-index: 5000; box-shadow: 0 4px 15px rgba(0,0,0,0.3); display: flex; align-items: center; gap: 12px;';
            banner.innerHTML = `
                <span>👇 Toca el lugar exacto</span>
                <button id="btn-cancelar-ubicacion" style="background: rgba(255,255,255,0.25); border: none; color: white; padding: 6px 12px; border-radius: 20px; font-size: 13px; font-weight: bold; cursor: pointer;">Cancelar</button>
            `;
            document.body.appendChild(banner);
            
            let list1, list2;

            const atraparClic = (lat, lng) => {
                if(!window.modoUbicacionActivo) return;
                window.modoUbicacionActivo = false; 
                banner.remove(); 
                
                document.getElementById('punto-lat').value = lat;
                document.getElementById('punto-lng').value = lng;
                document.getElementById('punto-coords').value = 'Coordenadas capturadas ✅';
                
                modalPunto.style.display = 'flex';
            };

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

            document.getElementById('btn-cancelar-ubicacion').addEventListener('click', (e) => {
                e.stopPropagation(); 
                window.modoUbicacionActivo = false;
                banner.remove();
                google.maps.event.removeListener(list1);
                google.maps.event.removeListener(list2);
                modalPunto.style.display = 'flex'; 
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
                
                if(window.mostrarToastM3) window.mostrarToastM3("Lugar guardado.", "success");
            } else {
                alert("Hubo un error al guardar.");
            }

            btnGuardar.innerText = "Guardar";
            btnGuardar.disabled = false;
        });
    }
}

// 🔥 LÓGICA DE LA LISTA DE PUNTOS DE SALIDA 🔥
export function inicializarModalListaPuntos() {
    const modalLista = document.getElementById('modal-lista-puntos');
    const btnAbrir = document.getElementById('btn-abrir-lista-puntos');
    const btnCerrar = document.getElementById('btn-cerrar-lista-puntos');
    const contenedor = document.getElementById('contenedor-lista-puntos');

    if (!modalLista || !btnAbrir || !contenedor) return;

    btnAbrir.addEventListener('click', async () => {
        modalLista.style.display = 'flex';
        contenedor.innerHTML = '<p style="text-align:center; color:gray; font-size: 14px;">Cargando lugares...</p>';

        try {
            const { collection, getDocs, doc, deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js");
            const { db } = await import("./firebase-core.js");

            const q = collection(db, "congregaciones", window.miUsuario.congregacionId, "puntos_salida");
            const snapshot = await getDocs(q);

            contenedor.innerHTML = '';

            if (snapshot.empty) {
                contenedor.innerHTML = '<p style="text-align:center; color:gray; font-size: 14px;">No hay lugares registrados.</p>';
                return;
            }

            snapshot.forEach(docSnap => {
                const data = docSnap.data();
                const puntoId = docSnap.id;

                const card = document.createElement('div');
                card.style.cssText = 'display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.05); padding: 12px; border-radius: 12px; margin-bottom: 10px; border: 1px solid var(--border-color);';

                card.innerHTML = `
                    <div style="flex: 1;">
                        <h4 style="margin: 0 0 4px 0; color: var(--text-color); font-size: 15px;">${data.emoji || '📍'} ${data.nombre}</h4>
                    </div>
                    <button class="btn-borrar-punto" style="background: rgba(229, 57, 53, 0.1); border: 1px solid #E53935; color: #E53935; padding: 6px 12px; border-radius: 8px; cursor: pointer; font-weight: bold;">🗑️ Borrar</button>
                `;

                card.querySelector('.btn-borrar-punto').onclick = async () => {
                    if (confirm(`¿Seguro que quieres eliminar "${data.nombre}"?`)) {
                        card.style.opacity = '0.4';
                        card.style.pointerEvents = 'none';
                        await deleteDoc(doc(db, "congregaciones", window.miUsuario.congregacionId, "puntos_salida", puntoId));
                        card.remove();

                        if (contenedor.children.length === 0) {
                            contenedor.innerHTML = '<p style="text-align:center; color:gray; font-size: 14px;">No hay lugares registrados.</p>';
                        }
                        if (window.mostrarToastM3) window.mostrarToastM3("Lugar eliminado", "success");
                    }
                };

                contenedor.appendChild(card);
            });

        } catch (error) {
            console.error("Error al cargar puntos:", error);
            contenedor.innerHTML = '<p style="text-align:center; color:#E53935; font-size: 14px;">Error al cargar la base de datos.</p>';
        }
    });

    if (btnCerrar) {
        btnCerrar.addEventListener('click', () => {
            modalLista.style.display = 'none';
        });
    }
}
document.addEventListener('DOMContentLoaded', () => {
    const topTabs = document.querySelectorAll('.top-tab');
    const adminSubViews = document.querySelectorAll('.admin-sub-view');

    topTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // 1. Apagar todas las pestañas y vistas
            topTabs.forEach(t => t.classList.remove('active'));
            adminSubViews.forEach(v => v.style.display = 'none');

            // 2. Encender la seleccionada
            tab.classList.add('active');
            const targetId = tab.getAttribute('data-target');
            document.getElementById(targetId).style.display = 'block';
            
            // 3. Opcional: Centrar la pestaña clickeada al hacer scroll horizontal
            tab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        });
    });
});
document.addEventListener('DOMContentLoaded', () => {
    // (Aquí asumo que ya tienes tu código anterior que hace el .click() de las top-tabs)

    // 🔥 NUEVO: LÓGICA DE DESLIZAMIENTO (SWIPE) PARA LAS PESTAÑAS SUPERIORES 🔥
    const vistaServicio = document.getElementById('servicio-view');
    if (!vistaServicio) return;

    let toqueInicialX = 0;
    let toqueInicialY = 0;

    vistaServicio.addEventListener('touchstart', (e) => {
        toqueInicialX = e.changedTouches[0].screenX;
        toqueInicialY = e.changedTouches[0].screenY;
    }, { passive: true });

    vistaServicio.addEventListener('touchend', (e) => {
        // Evitamos interferir si el usuario está intentando deslizar la tabla del planificador
        if (e.target.closest('table') || e.target.closest('[style*="overflow-x: auto"]')) return;

        const toqueFinalX = e.changedTouches[0].screenX;
        const toqueFinalY = e.changedTouches[0].screenY;

        const diferenciaX = toqueInicialX - toqueFinalX;
        const diferenciaY = toqueInicialY - toqueFinalY;

        // Si el movimiento fue más vertical que horizontal (scroll normal), no hacemos nada
        if (Math.abs(diferenciaY) > Math.abs(diferenciaX)) return;

        // Si el deslizamiento fue muy corto (menos de 50px), lo ignoramos
        if (Math.abs(diferenciaX) < 50) return;

        const pestañas = Array.from(document.querySelectorAll('.top-tab'));
        const indiceActual = pestañas.findIndex(tab => tab.classList.contains('active'));
        
        if (indiceActual === -1) return;

        if (diferenciaX > 0) {
            // Deslizó hacia la izquierda ⬅️ (Ir a la pestaña Siguiente)
            if (indiceActual < pestañas.length - 1) {
                pestañas[indiceActual + 1].click();
            }
        } else {
            // Deslizó hacia la derecha ➡️ (Ir a la pestaña Anterior)
            if (indiceActual > 0) {
                pestañas[indiceActual - 1].click();
            }
        }
    });
});
document.addEventListener('DOMContentLoaded', () => {
    
    // 1. Lógica de clics para pestañas de Ministerio
    const tabsMinisterio = document.querySelectorAll('.top-tab-ministerio');
    const subViewsMinisterio = document.querySelectorAll('.ministerio-sub-view');

    tabsMinisterio.forEach(tab => {
        tab.addEventListener('click', () => {
            tabsMinisterio.forEach(t => t.classList.remove('active'));
            subViewsMinisterio.forEach(v => v.style.display = 'none');

            tab.classList.add('active');
            const targetId = tab.getAttribute('data-target');
            document.getElementById(targetId).style.display = 'block';
        });
    });

    // 2. Lógica de deslizamiento (Swipe) para Ministerio
    const vistaVisitas = document.getElementById('visitas-view');
    if (!vistaVisitas) return;

    let toqueInicioMinX = 0;
    let toqueInicioMinY = 0;

    vistaVisitas.addEventListener('touchstart', (e) => {
        toqueInicioMinX = e.changedTouches[0].screenX;
        toqueInicioMinY = e.changedTouches[0].screenY;
    }, { passive: true });

    vistaVisitas.addEventListener('touchend', (e) => {
        // Evitar conflictos con elementos deslizables horizontales internos (si los hubiera)
        if (e.target.closest('.visitas-filtros')) return;

        const toqueFinMinX = e.changedTouches[0].screenX;
        const toqueFinMinY = e.changedTouches[0].screenY;

        const difX = toqueInicioMinX - toqueFinMinX;
        const difY = toqueInicioMinY - toqueFinMinY;

        if (Math.abs(difY) > Math.abs(difX)) return; // Fue un scroll vertical
        if (Math.abs(difX) < 50) return; // Movimiento muy corto

        const pestañas = Array.from(document.querySelectorAll('.top-tab-ministerio'));
        const indiceActivo = pestañas.findIndex(tab => tab.classList.contains('active'));
        
        if (indiceActivo === -1) return;

        if (difX > 0 && indiceActivo < pestañas.length - 1) {
            pestañas[indiceActivo + 1].click(); // Swipe Izquierda (Siguiente)
        } else if (difX < 0 && indiceActivo > 0) {
            pestañas[indiceActivo - 1].click(); // Swipe Derecha (Anterior)
        }
    });
});
document.addEventListener('DOMContentLoaded', () => {
    // 1. Abrir Modal al tocar la tarjeta morada
    const dashboardMinisterio = document.getElementById('dashboard-ministerio');
    const modalMeta = document.getElementById('modal-meta-ministerio');
    const btnCancelarMeta = document.getElementById('btn-cancelar-meta');
    
    if (dashboardMinisterio && modalMeta) {
        dashboardMinisterio.addEventListener('click', () => {
            modalMeta.style.display = 'flex';
        });
    }

    if (btnCancelarMeta && modalMeta) {
        btnCancelarMeta.addEventListener('click', () => {
            modalMeta.style.display = 'none';
        });
    }

    // 2. Aquí conectarás tu botón "btn-guardar-meta" con la función 
    // de Firebase que actualizaba la meta desde el perfil.
    const btnGuardarMeta = document.getElementById('btn-guardar-meta');
    if (btnGuardarMeta) {
        btnGuardarMeta.addEventListener('click', () => {
            const nuevaMeta = document.getElementById('input-nueva-meta').value;
            // LLAMAR AQUÍ A TU FUNCIÓN DE GUARDADO (Ej: actualizarMetaFirebase(nuevaMeta))
            // modalMeta.style.display = 'none';
        });
    }
});
