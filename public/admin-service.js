// ==========================================
// ARCHIVO: admin-service.js
// ==========================================
import { collection, doc, setDoc, onSnapshot, getDocs, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { db } from "./firebase-core.js";
import { refrescarEstilosMapa } from "./map-service.js"; 

window.modoRegistroActivo = false;
window.manzanasSeleccionadas = new Set();

// ==========================================
// GENERADOR DE PDF (FORMULARIO S-13)
// ==========================================
async function generarPDF_S13() {
    // Inicializamos la librería de PDF
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Título y Encabezado
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("Registro de Asignación de Territorios (S-13)", 14, 20);
    
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`Congregación: ${window.miUsuario.congregacionId}`, 14, 28);
    const fechaHoy = new Date().toLocaleDateString('es-ES');
    doc.text(`Fecha de exportación: ${fechaHoy}`, 14, 34);

    // Traemos los datos frescos de la base de datos
    const snapshot = await getDocs(collection(db, "congregaciones", window.miUsuario.congregacionId, "gestion_mapas"));
    let datosTabla = [];

    snapshot.forEach(d => {
        const mapa = d.id; // Ej: T1 - A
        const data = d.data();
        
        // Filtramos solo los que están actualmente asignados (No disponibles)
        if (!data.estaDisponible && data.fecha) {
            const fSalida = new Date(data.fecha);
            const fVencimiento = new Date(data.fecha);
            fVencimiento.setMonth(fVencimiento.getMonth() + (data.duracionMeses || 4));

            const diasRestantes = Math.ceil((fVencimiento - new Date()) / (1000 * 60 * 60 * 24));
            let estado = diasRestantes < 0 ? "VENCIDO" : "Al día";

            datosTabla.push([
                mapa,
                data.asignadoA || "Desconocido",
                fSalida.toLocaleDateString('es-ES'),
                fVencimiento.toLocaleDateString('es-ES'),
                estado
            ]);
        }
    });

    // Ordenamos la tabla alfabéticamente por Territorio (Ej: T1, T2, T3)
    datosTabla.sort((a,b) => a[0].localeCompare(b[0], undefined, {numeric: true}));

    if (datosTabla.length === 0) {
        alert("No hay territorios asignados para generar el reporte S-13.");
        return;
    }

    // Dibujamos la tabla automática
    doc.autoTable({
        startY: 42,
        head: [['Territorio / Manzana', 'Publicador Asignado', 'F. Salida', 'Vence', 'Estado']],
        body: datosTabla,
        theme: 'striped',
        headStyles: { fillColor: [168, 117, 255] }, // Tu color violeta (--primary-color)
        styles: { fontSize: 10, cellPadding: 4 },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        columnStyles: {
            4: { fontStyle: 'bold', textColor: [0, 0, 0] } 
        },
        // Cambiar color del texto si está vencido
        didParseCell: function(data) {
            if (data.section === 'body' && data.column.index === 4) {
                if (data.cell.raw === 'VENCIDO') {
                    data.cell.styles.textColor = [198, 40, 40]; // Rojo
                } else {
                    data.cell.styles.textColor = [46, 125, 50]; // Verde
                }
            }
        }
    });

    // Guardar y descargar el archivo
    const nombreArchivo = `S-13_Congregacion_${window.miUsuario.congregacionId}_${fechaHoy.replace(/\//g, '-')}.pdf`;
    doc.save(nombreArchivo);
}

export function configurarPanelAdmin() {
    const btnFabRegistro = document.getElementById('btn-fab-registro');
    const panelRegistro = document.getElementById('panel-registro');
    const contadorManzanas = document.getElementById('contador-manzanas');

    if (btnFabRegistro) {
        btnFabRegistro.onclick = () => {
            window.modoRegistroActivo = true;
            btnFabRegistro.style.display = 'none';
            panelRegistro.style.display = 'flex';
            window.manzanasSeleccionadas.clear();
            contadorManzanas.innerText = "0";
            refrescarEstilosMapa();
        };
    }

    const btnCerrarRegistro = document.getElementById('btn-cerrar-registro');
    if (btnCerrarRegistro) {
        btnCerrarRegistro.onclick = () => {
            window.modoRegistroActivo = false;
            panelRegistro.style.display = 'none';
            btnFabRegistro.style.display = 'block';
            window.manzanasSeleccionadas.clear();
            refrescarEstilosMapa();
        };
    }

    async function guardarReporteActividad(cobertura) {
        if (window.manzanasSeleccionadas.size === 0) return alert("Toca al menos una manzana en el mapa.");
        
        let notas = "";
        if (cobertura === "Parcial") notas = prompt("Registro Parcial: ¿Qué parte faltó?") || "";

        try {
            const nuevoId = Date.now().toString();
            await setDoc(doc(db, "congregaciones", window.miUsuario.congregacionId, "registro_actividad", nuevoId), {
                fecha: Date.now(),
                manzanas: Array.from(window.manzanasSeleccionadas),
                cobertura: cobertura,
                notes: notas,
                reportadoPor: window.miUsuario.nombre
            });
            alert(`¡Reporte ${cobertura} guardado!`);
            if (btnCerrarRegistro) btnCerrarRegistro.click();
        } catch (error) { 
            alert("Error al guardar el reporte."); 
        }
    }

    const btnRegCompleto = document.getElementById('btn-registro-completo');
    if (btnRegCompleto) btnRegCompleto.onclick = () => guardarReporteActividad("Completo");

    const btnRegParcial = document.getElementById('btn-registro-parcial');
    if (btnRegParcial) btnRegParcial.onclick = () => guardarReporteActividad("Parcial");

    // LÓGICA DE LAS PESTAÑAS INTERNAS DE SERVICIO
    const adminDashboard = document.getElementById('admin-dashboard');
    const viewInventario = document.getElementById('admin-inventario-view');
    const viewReportes = document.getElementById('admin-reportes-view');
    const viewRoles = document.getElementById('admin-roles-view');

    document.querySelectorAll('.btn-volver-admin').forEach(btn => btn.onclick = () => history.back());

    // 1. REPORTES Y ESTADÍSTICAS
    const btnAdminReportes = document.getElementById('btn-admin-reportes');
    if (btnAdminReportes) {
        btnAdminReportes.onclick = () => {
            history.pushState({ page: 'admin_sub' }, '', '');
            if (adminDashboard) adminDashboard.style.display = 'none'; 
            if (viewReportes) viewReportes.style.display = 'block';
            
            onSnapshot(collection(db, "congregaciones", window.miUsuario.congregacionId, "registro_actividad"), (snapshot) => {
                const listaHtml = document.getElementById('lista-reportes'); 
                if (!listaHtml) return;
                listaHtml.innerHTML = '';
                let reportes = [];
                snapshot.forEach(doc => reportes.push({id: doc.id, ...doc.data()}));
                reportes.sort((a,b) => b.fecha - a.fecha);
                
                if(reportes.length === 0) { 
                    listaHtml.innerHTML = '<p style="color:gray;text-align:center;margin-top:40px;">No hay reportes de actividad todavía.</p>'; 
                    return; 
                }

                reportes.forEach(rep => {
                    const d = new Date(rep.fecha);
                    const fStr = `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()} - ${d.getHours()}:${d.getMinutes().toString().padStart(2,'0')}`;
                    const colorBadge = rep.cobertura === 'Completo' ? '#388E3C' : '#E65100';
                    
                    const card = document.createElement('div'); 
                    card.className = 'admin-reporte-card';
                    card.innerHTML = `
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span style="color:gray; font-size:13px; font-weight:bold;">${fStr}</span>
                            <span style="background:${colorBadge}20; color:${colorBadge}; padding:4px 8px; border-radius:8px; font-size:11px; font-weight:900;">${rep.cobertura.toUpperCase()}</span>
                        </div>
                        <p style="margin: 10px 0 5px 0; font-weight:bold; color:var(--text-color); font-size:15px;">Manzanas: <span style="color:var(--primary-color);">${rep.manzanas.join(', ')}</span></p>
                        <p style="margin: 0; font-size:14px; color:gray;">👤 Por: ${rep.reportadoPor}</p>
                        ${rep.notes || rep.notas ? `<div style="margin-top:10px; background:rgba(128,128,128,0.1); padding:10px; border-radius:8px; font-size:13px; color:var(--text-color, #444);">📝 ${rep.notes || rep.notas}</div>` : ''}
                    `;
                    listaHtml.appendChild(card);
                });
            });
        };
    }

    // 2. GESTIÓN DE TERRITORIOS (INVENTARIO)
    let seleccionadosInventario = new Set();
    let mapasEstadoGlobal = {};

    function actualizarBarraInventario() {
        const contadorInv = document.getElementById('contador-inventario');
        if (contadorInv) contadorInv.innerText = seleccionadosInventario.size;
        const btnAsignar = document.getElementById('btn-assignar-mapas') || document.getElementById('btn-asignar-mapas');
        const btnRecibir = document.getElementById('btn-recibir-mapas');
        
        if (!btnAsignar || !btnRecibir) return;

        if (seleccionadosInventario.size === 0) { 
            btnAsignar.disabled = true; 
            btnRecibir.style.display = 'none'; 
            btnAsignar.style.display = 'block'; 
            return; 
        }
        
        let todosLibres = true;
        seleccionadosInventario.forEach(id => { 
            if (mapasEstadoGlobal[id] && !mapasEstadoGlobal[id].estaDisponible) todosLibres = false; 
        });
        
        if (todosLibres) { 
            btnAsignar.style.display = 'block'; 
            btnAsignar.disabled = false; 
            btnRecibir.style.display = 'none'; 
        } else { 
            btnAsignar.style.display = 'none'; 
            btnRecibir.style.display = 'block'; 
        }
    }

    const btnAdminInventario = document.getElementById('btn-admin-inventario');
    if (btnAdminInventario) {
        btnAdminInventario.onclick = () => {
            // INYECTAR EL BOTÓN DEL S-13 DINÁMICAMENTE
            const listaHtml = document.getElementById('lista-inventario');
            let btnExportar = document.getElementById('btn-exportar-s13');
            
            if (!btnExportar && listaHtml) {
                btnExportar = document.createElement('button');
                btnExportar.id = 'btn-exportar-s13';
                btnExportar.innerText = '📄 Descargar Reporte S-13 (PDF)';
                btnExportar.style.cssText = 'width: 100%; margin-bottom: 15px; background-color: #388E3C; color: white; border-radius: 12px; padding: 14px; font-weight: bold; border: none; cursor: pointer; box-shadow: 0 4px 6px rgba(0,0,0,0.1);';
                btnExportar.onclick = generarPDF_S13;
                
                // Lo insertamos justo antes de la lista
                listaHtml.parentNode.insertBefore(btnExportar, listaHtml);
            }
            history.pushState({ page: 'admin_sub' }, '', '');
            if (adminDashboard) adminDashboard.style.display = 'none'; 
            if (viewInventario) viewInventario.style.display = 'block';
            const barraActionInv = document.getElementById('barra-accion-inventario');
            if (barraActionInv) barraActionInv.style.display = 'flex';
            seleccionadosInventario.clear(); 
            actualizarBarraInventario();

            let manzanasUnicas = new Set();
            if(window.mapaGlobal) {
                window.mapaGlobal.data.forEach(f => {
                    const t = f.getProperty('territorio'); 
                    const m = f.getProperty('numero');
                    if(t && m && m.toLowerCase() !== 'plaza') manzanasUnicas.add(`T${t} - ${m}`);
                });
            }
            const listaManzanas = Array.from(manzanasUnicas).sort((a,b) => a.localeCompare(b, undefined, {numeric: true}));

            onSnapshot(collection(db, "congregaciones", window.miUsuario.congregacionId, "gestion_mapas"), (snapshot) => {
                mapasEstadoGlobal = {}; 
                snapshot.forEach(doc => mapasEstadoGlobal[doc.id] = doc.data());
                const listaHtml = document.getElementById('lista-inventario'); 
                if (!listaHtml) return;
                listaHtml.innerHTML = '';

                listaManzanas.forEach(manzanaId => {
                    const gestion = mapasEstadoGlobal[manzanaId] || { estaDisponible: true };
                    let badgeHtml = `<span class="badge-libre">LIBRE</span>`; 
                    let infoHtml = ``;

                    if (!gestion.estaDisponible && gestion.fecha) {
                        const fVencimiento = new Date(gestion.fecha); 
                        fVencimiento.setMonth(fVencimiento.getMonth() + (gestion.duracionMeses || 4));
                        const diasRestantes = Math.ceil((fVencimiento - new Date()) / (1000 * 60 * 60 * 24));
                        if (diasRestantes < 0) { 
                            badgeHtml = `<span class="badge-vencido">VENCIDO</span>`; 
                            infoHtml = `<p>👤 ${gestion.asignadoA}</p><p style="color:#C62828; font-weight:bold;">⚠️ Vencido hace ${Math.abs(diasRestantes)} días</p>`; 
                        } else { 
                            badgeHtml = `<span class="badge-asignado">ASIGNADO</span>`; 
                            infoHtml = `<p>👤 ${gestion.asignadoA}</p><p style="color:var(--primary-color);">Faltan ${diasRestantes} días</p>`; 
                        }
                    }

                    const div = document.createElement('div'); 
                    div.className = 'inventario-item';
                    div.innerHTML = `<input type="checkbox" value="${manzanaId}" ${seleccionadosInventario.has(manzanaId) ? 'checked' : ''}><div class="inventario-info"><h4>Manzana ${manzanaId} ${badgeHtml}</h4>${infoHtml}</div>`;
                    
                    const checkbox = div.querySelector('input');
                    div.onclick = (e) => { 
                        if(e.target !== checkbox) checkbox.checked = !checkbox.checked;
                        if (checkbox.checked) seleccionadosInventario.add(manzanaId); 
                        else seleccionadosInventario.delete(manzanaId);
                        actualizarBarraInventario();
                    };
                    listaHtml.appendChild(div);
                });
            });
        };
    }

    const btnRecibirMapas = document.getElementById('btn-recibir-mapas');
    if (btnRecibirMapas) {
        btnRecibirMapas.onclick = () => {
            seleccionadosInventario.forEach(async (id) => { 
                await setDoc(doc(db, "congregaciones", window.miUsuario.congregacionId, "gestion_mapas", id), { estaDisponible: true }); 
            });
            seleccionadosInventario.clear(); 
            actualizarBarraInventario();
        };
    }

    const btnAsignarMapas = document.getElementById('btn-asignar-mapas');
    if (btnAsignarMapas) {
        btnAsignarMapas.onclick = () => {
            history.pushState({ page: 'modal_asignar' }, '', '');
            const asignarText = document.getElementById('asignar-text');
            if (asignarText) asignarText.innerText = `Vas a asignar ${seleccionadosInventario.size} manzanas.`;
            const asignarModal = document.getElementById('asignar-modal');
            if (asignarModal) asignarModal.style.display = 'flex';
        };
    }

    const btnCancelarAsignar = document.getElementById('btn-cancelar-asignar');
    if (btnCancelarAsignar) btnCancelarAsignar.onclick = () => history.back();

    const btnConfirmarAsignar = document.getElementById('btn-confirmar-asignar');
    if (btnConfirmarAsignar) {
        btnConfirmarAsignar.onclick = () => {
            const nombreInput = document.getElementById('asignar-nombre');
            const nombre = nombreInput ? nombreInput.value.trim() : '';
            const mesesInput = document.getElementById('asignar-meses');
            const meses = mesesInput ? parseInt(mesesInput.value) || 4 : 4;
            if (!nombre) return alert("Ingresa un nombre");

            seleccionadosInventario.forEach(async (id) => {
                await setDoc(doc(db, "congregaciones", window.miUsuario.congregacionId, "gestion_mapas", id), { 
                    asignadoA: nombre, 
                    fecha: Date.now(), 
                    estaDisponible: false, 
                    duracionMeses: meses 
                });
            });

            if (nombreInput) nombreInput.value = '';
            seleccionadosInventario.clear();
            actualizarBarraInventario();
            history.back(); 
        };
    }

    // 3. HERMANOS Y PERMISOS (GESTIÓN DE ACCESOS SECURE MULTI-CONGREGACIÓN)
    const btnAdminRoles = document.getElementById('btn-admin-roles');
    if (btnAdminRoles) {
        btnAdminRoles.onclick = () => {
            history.pushState({ page: 'admin_sub' }, '', '');
            if (adminDashboard) adminDashboard.style.display = 'none'; 
            if (viewRoles) viewRoles.style.display = 'block';
            
            const listaHtml = document.getElementById('lista-roles');
            if (!listaHtml) return;
            listaHtml.innerHTML = '<p style="color:gray; text-align:center; margin-top:20px;">Cargando lista de hermanos...</p>';

            const congRef = doc(db, "congregaciones", window.miUsuario.congregacionId);
            
            onSnapshot(congRef, async (docSnap) => {
                if (!docSnap.exists()) return;
                
                const rolesMap = docSnap.data().roles || {};
                const emailsCongregacion = Object.keys(rolesMap);
                
                if (emailsCongregacion.length === 0) {
                    listaHtml.innerHTML = '<p style="color:gray; text-align:center; margin-top:40px;">No hay usuarios registrados en esta congregación.</p>';
                    return;
                }

                // Buscamos SOLO los datos de los usuarios que pertenecen estrictamente a esta congregación
                let nombresUsuarios = {};
                await Promise.all(emailsCongregacion.map(async (email) => {
                    try {
                        const uDoc = await getDoc(doc(db, "usuarios", email));
                        if (uDoc.exists()) {
                            nombresUsuarios[email] = `${uDoc.data().nombre || ''} ${uDoc.data().apellido || ''}`.trim();
                        }
                    } catch (e) {
                        console.warn(`No se pudo leer el perfil de ${email}`);
                    }
                }));

                listaHtml.innerHTML = '';
                const soySiervo = window.miUsuario.rol === 'siervo';
                const miEmail = window.miUsuario.email;
                const listaEntradas = Object.entries(rolesMap).sort((a, b) => a[1].localeCompare(b[1]));

                listaEntradas.forEach(([email, rolActual]) => {
                    const nombreMostrar = nombresUsuarios[email] || email;
                    const esMiPropioUsuario = email === miEmail;

                    const card = document.createElement('div');
                    card.className = 'admin-reporte-card';
                    card.style.display = 'flex';
                    card.style.justifyContent = 'space-between';
                    card.style.alignItems = 'center';
                    card.style.gap = '10px';

                    const opcionesRoles = {
                        "siervo": "Siervo de Territorios",
                        "ayudante": "Ayudante de Territorios",
                        "conductor": "Conductor de Grupo",
                        "publicador": "Publicador"
                    };

                    let controlRolHtml = `<span style="color:var(--primary-color); font-weight:bold; font-size:14px;">${opcionesRoles[rolActual] || rolActual.toUpperCase()}</span>`;
                    
                    if (!esMiPropioUsuario && soySiervo) {
                        controlRolHtml = `
                            <select class="select-rol-dinamico" data-email="${email}" style="padding: 6px 10px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--surface-color); color: var(--text-color); font-size: 13px; font-weight: bold;">
                                <option value="publicador" ${rolActual === 'publicador' ? 'selected' : ''}>Publicador</option>
                                <option value="conductor" ${rolActual === 'conductor' ? 'selected' : ''}>Conductor de Grupo</option>
                                <option value="ayudante" ${rolActual === 'ayudante' ? 'selected' : ''}>Ayudante de Territorios</option>
                                <option value="siervo" ${rolActual === 'siervo' ? 'selected' : ''}>Siervo de Territorios</option>
                                <option value="quitar" style="color:#C62828;">❌ Quitar Acceso</option>
                            </select>
                        `;
                    }

                    card.innerHTML = `
                        <div style="flex:1; min-width:0;">
                            <h4 style="margin:0 0 4px 0; color:var(--text-color); font-size:16px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                                ${nombreMostrar} ${esMiPropioUsuario ? '<span style="color:var(--primary-color); font-size:12px;">(Tú)</span>' : ''}
                            </h4>
                            <p style="margin:0; font-size:13px; color:gray; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${email}</p>
                        </div>
                        <div style="flex-shrink:0;">
                            ${controlRolHtml}
                        </div>
                    `;

                    if (!esMiPropioUsuario && soySiervo) {
                        const select = card.querySelector('.select-rol-dinamico');
                        if (select) {
                            select.onchange = async (e) => {
                                const nuevoRol = e.target.value;
                                const emailTarget = e.target.getAttribute('data-email');
                                
                                if (nuevoRol === 'quitar') {
                                    if (confirm(`¿Estás seguro de que quieres quitarle el acceso a ${nombreMostrar}?`)) {
                                        delete rolesMap[emailTarget];
                                        await setDoc(congRef, { roles: rolesMap }, { merge: true });
                                    } else {
                                        e.target.value = rolActual;
                                    }
                                } else {
                                    rolesMap[emailTarget] = nuevoRol;
                                    await setDoc(congRef, { roles: rolesMap }, { merge: true });
                                }
                            };
                        }
                    }
                    listaHtml.appendChild(card);
                });
            });
        };
    }
}