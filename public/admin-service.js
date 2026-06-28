// ==========================================
// ARCHIVO: admin-service.js (VERSIÓN DEFINITIVA Y BLINDADA A PUNTOS)
// ==========================================
import { collection, doc, setDoc, updateDoc, onSnapshot, getDocs, getDoc, deleteField } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { db } from "./firebase-core.js";
import { refrescarEstilosMapa } from "./map-service.js"; 

window.modoRegistroActivo = false;
window.manzanasSeleccionadas = new Set();

export function configurarPanelAdmin() {
    // ==========================================
    // CONTROLES DE REGISTRO EN MAPA
    // ==========================================
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
                notas: notas,
                notes: notas, // Guardamos ambas para compatibilidad
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

    // ==========================================
    // ALARMA DE SALA DE ESPERA (GLOBO ROJO)
    // ==========================================
    if (window.miUsuario && window.miUsuario.rol === 'siervo') {
        onSnapshot(doc(db, "congregaciones", window.miUsuario.congregacionId), (docSnap) => {
            if (docSnap.exists()) {
                const rolesMap = docSnap.data().roles || {};
                const cantidadPendientes = Object.values(rolesMap).filter(rol => rol === 'pendiente').length;
                
                const btnRoles = document.getElementById('btn-admin-roles');
                if (btnRoles) {
                    let badge = document.getElementById('badge-pendientes');
                    if (cantidadPendientes > 0) {
                        if (!badge) {
                            badge = document.createElement('span');
                            badge.id = 'badge-pendientes';
                            badge.style.cssText = 'background-color: #E53935; color: white; border-radius: 50%; padding: 2px 8px; font-size: 12px; margin-left: 10px; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.2); animation: latido 1.5s infinite;';
                            if (!document.getElementById('style-latido')) {
                                const style = document.createElement('style');
                                style.id = 'style-latido';
                                style.innerHTML = `@keyframes latido { 0% { transform: scale(1); } 50% { transform: scale(1.1); } 100% { transform: scale(1); } }`;
                                document.head.appendChild(style);
                            }
                            btnRoles.appendChild(badge);
                        }
                        badge.innerText = cantidadPendientes;
                    } else if (badge) {
                        badge.remove();
                    }
                }
            }
        });
    }

    // ==========================================
    // PESTAÑAS INTERNAS DE SERVICIO
    // ==========================================
    const adminDashboard = document.getElementById('admin-dashboard');
    const viewInventario = document.getElementById('admin-inventario-view');
    const viewReportes = document.getElementById('admin-reportes-view');
    const viewRoles = document.getElementById('admin-roles-view');

    document.querySelectorAll('.btn-volver-admin').forEach(btn => btn.onclick = () => history.back());

    // -----------------------------------------------------------
    // 1. REPORTES, ESTADÍSTICAS Y PDF S-13
    // -----------------------------------------------------------
    let todosLosReportes = []; 
    let todosLosTerritorios = new Set(); 

    const btnAdminReportes = document.getElementById('btn-admin-reportes');
    if (btnAdminReportes) {
        btnAdminReportes.onclick = () => {
            history.pushState({ page: 'admin_sub' }, '', '');
            
            // Declaramos las vistas de forma segura
            const adminDashboard = document.getElementById('admin-dashboard');
            const viewReportes = document.getElementById('admin-reportes-view');
            
            if (adminDashboard) adminDashboard.style.display = 'none'; 
            if (viewReportes) viewReportes.style.display = 'block';
            
            const viewContenedor = document.getElementById('admin-reportes-view');
            const listaHtml = document.getElementById('lista-reportes'); 
            
            let headerReportes = document.getElementById('header-reportes-clon');
            if (!headerReportes && viewContenedor && listaHtml) {
                headerReportes = document.createElement('div');
                headerReportes.id = 'header-reportes-clon';
                headerReportes.innerHTML = `
                    <div style="display: flex; gap: 8px; margin-bottom: 15px; border-bottom: 2px solid var(--border-color);">
                        <button id="tab-historial" style="flex: 1; background: none; border: none; padding: 10px; font-weight: bold; color: var(--primary-color); border-bottom: 3px solid var(--primary-color); cursor: pointer;">Historial</button>
                        <button id="tab-atrasados" style="flex: 1; background: none; border: none; padding: 10px; font-weight: bold; color: gray; border-bottom: 3px solid transparent; cursor: pointer;">Más Atrasados</button>
                    </div>
                    
                    <div id="contenedor-historial">
                        <button id="btn-oficial-s13" style="width: 100%; background-color: #388E3C; color: white; border-radius: 12px; padding: 14px; font-weight: bold; border: none; cursor: pointer; box-shadow: 0 4px 6px rgba(0,0,0,0.1); margin-bottom: 15px; display: flex; align-items: center; justify-content: center; gap: 8px;">
                            📄 Descargar S-13 (PDF)
                        </button>
                        <div class="visitas-filtros" style="margin-bottom: 15px;">
                            <div class="filtro-chip active" data-filtro="1mes">Último Mes</div>
                            <div class="filtro-chip" data-filtro="6meses">Últimos 6 Meses</div>
                            <div class="filtro-chip" data-filtro="rango" id="chip-rango">Rango Personalizado</div>
                        </div>
                        <div id="panel-fechas-rango" style="display: none; gap: 10px; margin-bottom: 15px; background: var(--surface-color); padding: 12px; border-radius: 12px; border: 1px solid var(--border-color);">
                            <div style="flex: 1;">
                                <label style="font-size: 11px; color: gray; font-weight: bold;">Desde</label>
                                <input type="date" id="filtro-desde" style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid var(--border-color); background: transparent; color: var(--text-color);">
                            </div>
                            <div style="flex: 1;">
                                <label style="font-size: 11px; color: gray; font-weight: bold;">Hasta</label>
                                <input type="date" id="filtro-hasta" style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid var(--border-color); background: transparent; color: var(--text-color);">
                            </div>
                        </div>
                    </div>
                `;
                
                // Usamos insertBefore en el padre de listaHtml para que nunca falle
                listaHtml.parentNode.insertBefore(headerReportes, listaHtml);

                const tabHistorial = document.getElementById('tab-historial');
                if (tabHistorial) {
                    tabHistorial.onclick = (e) => {
                        e.target.style.color = 'var(--primary-color)'; e.target.style.borderBottomColor = 'var(--primary-color)';
                        const tabAtrasados = document.getElementById('tab-atrasados');
                        if (tabAtrasados) { tabAtrasados.style.color = 'gray'; tabAtrasados.style.borderBottomColor = 'transparent'; }
                        const contHistorial = document.getElementById('contenedor-historial');
                        if (contHistorial) contHistorial.style.display = 'block';
                        window.pestanaReportesActiva = 'historial';
                        renderizarReportesFiltrados();
                    };
                }

                const tabAtrasados = document.getElementById('tab-atrasados');
                if (tabAtrasados) {
                    tabAtrasados.onclick = (e) => {
                        e.target.style.color = 'var(--primary-color)'; e.target.style.borderBottomColor = 'var(--primary-color)';
                        const tabHist = document.getElementById('tab-historial');
                        if (tabHist) { tabHist.style.color = 'gray'; tabHist.style.borderBottomColor = 'transparent'; }
                        const contHistorial = document.getElementById('contenedor-historial');
                        if (contHistorial) contHistorial.style.display = 'none';
                        window.pestanaReportesActiva = 'atrasados';
                        renderizarReportesFiltrados();
                    };
                }

                window.filtroTiempoActivo = '1mes';
                const chipsFiltro = headerReportes.querySelectorAll('.filtro-chip');
                chipsFiltro.forEach(chip => {
                    chip.onclick = (e) => {
                        chipsFiltro.forEach(c => c.classList.remove('active'));
                        e.target.classList.add('active');
                        window.filtroTiempoActivo = e.target.getAttribute('data-filtro');
                        const panelFechas = document.getElementById('panel-fechas-rango');
                        if (panelFechas) panelFechas.style.display = (window.filtroTiempoActivo === 'rango') ? 'flex' : 'none';
                        renderizarReportesFiltrados();
                    };
                });

                document.getElementById('filtro-desde')?.addEventListener('change', renderizarReportesFiltrados);
                document.getElementById('filtro-hasta')?.addEventListener('change', renderizarReportesFiltrados);
                
                const btnPdf = document.getElementById('btn-oficial-s13');
                if (btnPdf) btnPdf.onclick = generarPDF_S13;
            }
            
            if(window.mapaGlobal) {
                todosLosTerritorios.clear();
                window.mapaGlobal.data.forEach(f => {
                    const t = f.getProperty('territorio'); const m = f.getProperty('numero');
                    if(t && m && m.toLowerCase() !== 'plaza') todosLosTerritorios.add(`T${t} - ${m}`);
                });
            }

            onSnapshot(collection(db, "congregaciones", window.miUsuario.congregacionId, "registro_actividad"), (snapshot) => {
                todosLosReportes = [];
                snapshot.forEach(doc => {
                    const data = doc.data();
                    data.manzanas = data.manzanas || []; 
                    todosLosReportes.push({id: doc.id, ...data});
                });
                todosLosReportes.sort((a,b) => b.fecha - a.fecha);
                renderizarReportesFiltrados();
            });
        };
    }
    
    function generarPDF_S13() {
        try {
            if (!window.jspdf || !window.jspdf.jsPDF) {
                alert("Las librerías de PDF aún no han cargado. Revisa tu conexión a internet.");
                return;
            }
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF('portrait', 'mm', 'a4'); 
            
            let reportesFiltrados = todosLosReportes;
            const hoy = Date.now();
            if (window.filtroTiempoActivo === '1mes') {
                reportesFiltrados = reportesFiltrados.filter(r => r.fecha >= hoy - (30 * 24 * 60 * 60 * 1000));
            } else if (window.filtroTiempoActivo === '6meses') {
                reportesFiltrados = reportesFiltrados.filter(r => r.fecha >= hoy - (180 * 24 * 60 * 60 * 1000));
            } else if (window.filtroTiempoActivo === 'rango') {
                const fDesde = document.getElementById('filtro-desde')?.value;
                const fHasta = document.getElementById('filtro-hasta')?.value;
                if (fDesde) reportesFiltrados = reportesFiltrados.filter(r => r.fecha >= new Date(fDesde + "T00:00:00").getTime());
                if (fHasta) reportesFiltrados = reportesFiltrados.filter(r => r.fecha <= new Date(fHasta + "T23:59:59").getTime());
            }

            let historialPorTerritorio = {};
            let baseTerritorios = Array.from(todosLosTerritorios).map(t => t.split('-')[0].replace('T', '').trim());
            baseTerritorios = [...new Set(baseTerritorios)].sort((a,b) => (parseInt(a)||999) - (parseInt(b)||999));
            if (baseTerritorios.length === 0) baseTerritorios = Array.from({length: 20}, (_, i) => (i + 1).toString());
            baseTerritorios.forEach(t => historialPorTerritorio[t] = []);

            let reportesAsc = [...reportesFiltrados].sort((a,b) => a.fecha - b.fecha);
            reportesAsc.forEach(rep => {
                let basesDelReporte = [...new Set((rep.manzanas || []).map(m => m.split('-')[0].replace('T', '').trim()))];
                basesDelReporte.forEach(b => { 
                    if (historialPorTerritorio[b] !== undefined) historialPorTerritorio[b].push(rep); 
                });
            });

            let bodyTabla = [];
            baseTerritorios.forEach(numTerr => {
                let reportesDelTerr = historialPorTerritorio[numTerr] || [];
                if (reportesDelTerr.length > 4) reportesDelTerr = reportesDelTerr.slice(reportesDelTerr.length - 4); 
                
                let filaNombres = [
                    { content: numTerr, rowSpan: 2, styles: { halign: 'center', valign: 'middle', fontStyle: 'bold', fontSize: 11 } },
                    { content: '', rowSpan: 2 } 
                ];
                let filaFechas = [];

                for (let i = 0; i < 4; i++) {
                    if (i < reportesDelTerr.length) {
                        let rep = reportesDelTerr[i];
                        let d = new Date(rep.fecha);
                        let fechaCompStr = `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear().toString().slice(-2)}`;
                        
                        filaNombres.push({ content: rep.reportadoPor || "Desc.", colSpan: 2, styles: { halign: 'center', fontStyle: 'bold', fontSize: 8, overflow: 'hidden' } });
                        filaFechas.push(''); 
                        filaFechas.push({ content: fechaCompStr, styles: { halign: 'center', fontSize: 8 } });
                    } else {
                        filaNombres.push({ content: '', colSpan: 2 });
                        filaFechas.push('');
                        filaFechas.push('');
                    }
                }
                bodyTabla.push(filaNombres);
                bodyTabla.push(filaFechas);
            });

            doc.setFontSize(14);
            doc.setFont("helvetica", "bold");
            doc.text("REGISTRO DE ASIGNACIÓN DE TERRITORIO", 105, 15, { align: 'center' });
            
            doc.setFontSize(10);
            doc.setFont("helvetica", "normal");
            const anio = new Date().getFullYear();
            doc.text(`Año de servicio: ${anio}`, 14, 25);

            doc.autoTable({
                startY: 30,
                theme: 'grid',
                styles: { lineColor: [0, 0, 0], lineWidth: 0.2, textColor: [0, 0, 0], font: 'helvetica' },
                headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', halign: 'center', valign: 'middle', fontSize: 8, cellPadding: 1 },
                head: [
                    [
                        { content: 'Núm.\nde\nterr.', rowSpan: 2 },
                        { content: 'Última fecha\nen que se\ncompletó*', rowSpan: 2 },
                        { content: 'Asignado a', colSpan: 2 }, { content: 'Asignado a', colSpan: 2 },
                        { content: 'Asignado a', colSpan: 2 }, { content: 'Asignado a', colSpan: 2 }
                    ],
                    [
                        'Fecha en que\nse asignó', 'Fecha en que\nse completó',
                        'Fecha en que\nse asignó', 'Fecha en que\nse completó',
                        'Fecha en que\nse asignó', 'Fecha en que\nse completó',
                        'Fecha en que\nse asignó', 'Fecha en que\nse completó'
                    ]
                ],
                body: bodyTabla
            });

            const finalY = doc.lastAutoTable.finalY || 280;
            doc.setFontSize(8);
            doc.setFont("helvetica", "italic");
            doc.text("*Cuando comience una nueva página, anote en esta columna la última fecha en que los territorios se completaron.", 14, finalY + 10);
            doc.setFont("helvetica", "bold");
            doc.text("S-13-S 1/22", 180, finalY + 10);

            const hoyStr = new Date().toLocaleDateString('es-ES').replace(/\//g, '-');
            doc.save(`S-13_Congregacion_${window.miUsuario.congregacionId}_${hoyStr}.pdf`);
        } catch (error) {
            console.error(error);
            alert("Hubo un error al crear el PDF: " + error.message);
        }
    }

    function renderizarReportesFiltrados() {
        try {
            const listaHtml = document.getElementById('lista-reportes'); 
            if (!listaHtml) return;
            listaHtml.innerHTML = '';
            
            if (window.pestanaReportesActiva === 'atrasados') {
                let ultimaVez = {};
                todosLosReportes.forEach(reporte => {
                    (reporte.manzanas || []).forEach(m => {
                        if (!ultimaVez[m]) ultimaVez[m] = reporte.fecha;
                    });
                });

                let ranking = Array.from(todosLosTerritorios).map(m => ({
                    manzana: m,
                    fechaUltima: ultimaVez[m] || 0
                })).sort((a, b) => a.fechaUltima - b.fechaUltima);

                ranking.forEach(item => {
                    const nunca = item.fechaUltima === 0;
                    const dias = nunca ? 0 : Math.floor((Date.now() - item.fechaUltima) / (1000 * 60 * 60 * 24));
                    const txt = nunca ? "Nunca reportado" : `Hace ${dias} días`;
                    const cBg = nunca ? "var(--error-container, #FFEBEE)" : "var(--surface-color)";
                    const cTx = nunca ? "var(--error-color, #C62828)" : "gray";

                    const card = document.createElement('div'); 
                    card.className = 'admin-reporte-card';
                    card.style.backgroundColor = cBg;
                    card.innerHTML = `
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span style="font-weight:bold; color:var(--text-color); font-size:16px;">Manzana ${item.manzana}</span>
                            <span style="font-weight:bold; color:${cTx}; font-size:14px;">${txt}</span>
                        </div>
                    `;
                    listaHtml.appendChild(card);
                });
                return;
            }

            let reportesFiltrados = todosLosReportes;
            const hoy = Date.now();

            if (window.filtroTiempoActivo === '1mes') {
                reportesFiltrados = reportesFiltrados.filter(r => r.fecha >= hoy - (30 * 24 * 60 * 60 * 1000));
            } else if (window.filtroTiempoActivo === '6meses') {
                reportesFiltrados = reportesFiltrados.filter(r => r.fecha >= hoy - (180 * 24 * 60 * 60 * 1000));
            } else if (window.filtroTiempoActivo === 'rango') {
                const fDesde = document.getElementById('filtro-desde')?.value;
                const fHasta = document.getElementById('filtro-hasta')?.value;
                if (fDesde) reportesFiltrados = reportesFiltrados.filter(r => r.fecha >= new Date(fDesde + "T00:00:00").getTime());
                if (fHasta) reportesFiltrados = reportesFiltrados.filter(r => r.fecha <= new Date(fHasta + "T23:59:59").getTime());
            }
            
            if(reportesFiltrados.length === 0) { 
                listaHtml.innerHTML = '<p style="color:gray;text-align:center;margin-top:40px;">No hay actividad en este período.</p>'; 
                return; 
            }

            reportesFiltrados.forEach(rep => {
                const d = new Date(rep.fecha);
                const fStr = `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()} - ${d.getHours()}:${d.getMinutes().toString().padStart(2,'0')}`;
                const colorBadge = rep.cobertura === 'Completo' ? '#388E3C' : '#E65100';
                
                const agrupados = {};
                (rep.manzanas || []).forEach(m => {
                    const base = m.split('-')[0].trim();
                    if (!agrupados[base]) agrupados[base] = [];
                    agrupados[base].push(m);
                });
                const textoTerritorios = Object.keys(agrupados).map(base => {
                    if (rep.cobertura === 'Completo') return base;
                    const numeros = agrupados[base].map(x => x.split('-')[1]?.trim() || "Completa").join(", ");
                    return `${base} (Mz: ${numeros})`;
                }).join(" | ");

                const card = document.createElement('div'); 
                card.className = 'admin-reporte-card';
                card.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="color:gray; font-size:13px; font-weight:bold;">${fStr}</span>
                        <span style="background:${colorBadge}20; color:${colorBadge}; padding:4px 8px; border-radius:8px; font-size:11px; font-weight:900;">${rep.cobertura.toUpperCase()}</span>
                    </div>
                    <p style="margin: 10px 0 5px 0; font-weight:bold; color:var(--text-color); font-size:15px;">Territorios: <span style="color:var(--primary-color);">${textoTerritorios}</span></p>
                    <p style="margin: 0; font-size:14px; color:gray;">👤 Por: ${rep.reportadoPor || 'Desconocido'}</p>
                    ${rep.notes || rep.notas ? `<div style="margin-top:10px; background:rgba(128,128,128,0.1); padding:10px; border-radius:8px; font-size:13px; color:var(--text-color, #444);">📝 ${rep.notes || rep.notas}</div>` : ''}
                `;
                listaHtml.appendChild(card);
            });
        } catch (e) {
            console.error("Error al renderizar reportes:", e);
        }
    }

    // -----------------------------------------------------------
    // 2. GESTIÓN DE TERRITORIOS (INVENTARIO)
    // -----------------------------------------------------------
    let seleccionadosInventario = new Set();
    let mapasEstadoGlobal = {};

    function actualizarBarraInventario() {
        const contadorInv = document.getElementById('contador-inventario');
        if (contadorInv) contadorInv.innerText = seleccionadosInventario.size;
        const btnAsignar = document.getElementById('btn-asignar-mapas') || document.getElementById('btn-assignar-mapas');
        const btnRecibir = document.getElementById('btn-recibir-mapas');
        
        if (!btnAsignar || !btnRecibir) return;

        if (seleccionadosInventario.size === 0) { 
            btnAsignar.disabled = true; btnRecibir.style.display = 'none'; btnAsignar.style.display = 'block'; 
            return; 
        }
        
        let todosLibres = true;
        seleccionadosInventario.forEach(id => { 
            if (mapasEstadoGlobal[id] && !mapasEstadoGlobal[id].estaDisponible) todosLibres = false; 
        });
        
        if (todosLibres) { btnAsignar.style.display = 'block'; btnAsignar.disabled = false; btnRecibir.style.display = 'none'; } 
        else { btnAsignar.style.display = 'none'; btnRecibir.style.display = 'block'; }
    }

    const btnAdminInventario = document.getElementById('btn-admin-inventario');
    if (btnAdminInventario) {
        btnAdminInventario.onclick = () => {
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
                    const t = f.getProperty('territorio'); const m = f.getProperty('numero');
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

                    const div = document.createElement('div'); div.className = 'inventario-item';
                    div.innerHTML = `<input type="checkbox" value="${manzanaId}" ${seleccionadosInventario.has(manzanaId) ? 'checked' : ''}><div class="inventario-info"><h4>Manzana ${manzanaId} ${badgeHtml}</h4>${infoHtml}</div>`;
                    
                    const checkbox = div.querySelector('input');
                    div.onclick = (e) => { 
                        if(e.target !== checkbox) checkbox.checked = !checkbox.checked;
                        if (checkbox.checked) seleccionadosInventario.add(manzanaId); else seleccionadosInventario.delete(manzanaId);
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
            seleccionadosInventario.clear(); actualizarBarraInventario();
        };
    }

    const btnAsignarMapas = document.getElementById('btn-asignar-mapas') || document.getElementById('btn-assignar-mapas');
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
                    asignadoA: nombre, fecha: Date.now(), estaDisponible: false, duracionMeses: meses 
                });
            });
            if (nombreInput) nombreInput.value = '';
            seleccionadosInventario.clear(); actualizarBarraInventario(); history.back(); 
        };
    }

    // -----------------------------------------------------------
    // 3. HERMANOS Y PERMISOS (GESTIÓN DE ROLES BLINDADA)
    // -----------------------------------------------------------
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
                    listaHtml.innerHTML = '<p style="color:gray; text-align:center; margin-top:40px;">No hay usuarios registrados.</p>'; return;
                }

                let nombresUsuarios = {};
                await Promise.all(emailsCongregacion.map(async (email) => {
                    try {
                        const uDoc = await getDoc(doc(db, "usuarios", email));
                        if (uDoc.exists()) nombresUsuarios[email] = `${uDoc.data().nombre || ''} ${uDoc.data().apellido || ''}`.trim();
                    } catch (e) {}
                }));

                listaHtml.innerHTML = '';
                const soySiervo = window.miUsuario.rol === 'siervo';
                const miEmail = window.miUsuario.email;
                
                const listaEntradas = Object.entries(rolesMap).sort((a, b) => {
                    const rolA = String(a[1] || '');
                    const rolB = String(b[1] || '');
                    if (rolA === 'pendiente' && rolB !== 'pendiente') return -1;
                    if (rolB === 'pendiente' && rolA !== 'pendiente') return 1;
                    return rolA.localeCompare(rolB);
                });

                listaEntradas.forEach(([email, rolActual]) => {
                    const nombreMostrar = nombresUsuarios[email] || email;
                    const esMiPropioUsuario = email === miEmail;
                    const esPendiente = rolActual === 'pendiente';

                    const card = document.createElement('div'); 
                    card.className = 'admin-reporte-card';
                    card.style.display = 'flex'; 
                    card.style.justifyContent = 'space-between'; 
                    card.style.alignItems = 'center'; 
                    card.style.gap = '10px';
                    
                    if (esPendiente) {
                        card.style.borderLeft = '4px solid #E65100';
                        card.style.backgroundColor = '#FFF3E0';
                    }

                    const opcionesRoles = { "siervo": "Siervo", "ayudante": "Ayudante", "conductor": "Conductor", "publicador": "Publicador", "pendiente": "⏳ EN ESPERA" };
                    let colorRol = esPendiente ? '#E65100' : 'var(--primary-color)';
                    let controlRolHtml = `<span style="color:${colorRol}; font-weight:bold; font-size:14px;">${opcionesRoles[rolActual] || String(rolActual).toUpperCase()}</span>`;
                    
                    if (!esMiPropioUsuario && soySiervo) {
                        controlRolHtml = `
                            <select class="select-rol-dinamico" data-email="${email}" style="padding: 6px 10px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--surface-color); color: var(--text-color); font-size: 13px; font-weight: bold;">
                                ${esPendiente ? `<option value="pendiente" selected disabled>⏳ Aprobar como...</option>` : ''}
                                <option value="publicador" ${rolActual === 'publicador' ? 'selected' : ''}>Publicador</option>
                                <option value="conductor" ${rolActual === 'conductor' ? 'selected' : ''}>Conductor</option>
                                <option value="ayudante" ${rolActual === 'ayudante' ? 'selected' : ''}>Ayudante</option>
                                <option value="siervo" ${rolActual === 'siervo' ? 'selected' : ''}>Siervo</option>
                                <option value="quitar" style="color:#C62828;">❌ ${esPendiente ? 'Rechazar' : 'Quitar'}</option>
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
                        <div style="flex-shrink:0;">${controlRolHtml}</div>
                    `;

                    if (!esMiPropioUsuario && soySiervo) {
                        const select = card.querySelector('.select-rol-dinamico');
                        if (select) {
                            select.onchange = async (e) => {
                                const nuevoRol = e.target.value; 
                                const emailTarget = e.target.getAttribute('data-email');
                                
                                // 🔥 ACÁ APLICAMOS LA VACUNA CONTRA LOS PUNTOS EN EL EMAIL 🔥
                                if (nuevoRol === 'quitar') {
                                    if (confirm(`¿Seguro que quieres ${esPendiente ? 'rechazar' : 'quitar el acceso'} a ${nombreMostrar}?`)) {
                                        // Usamos setDoc con merge en lugar de updateDoc
                                        await setDoc(congRef, { roles: { [emailTarget]: deleteField() } }, { merge: true });
                                    } else {
                                        e.target.value = rolActual;
                                    }
                                } else {
                                    // Usamos setDoc con merge en lugar de updateDoc
                                    await setDoc(congRef, { roles: { [emailTarget]: nuevoRol } }, { merge: true });
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