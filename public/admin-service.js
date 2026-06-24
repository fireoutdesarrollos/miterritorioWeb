import { collection, doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { db } from "./firebase-core.js";
import { refrescarEstilosMapa } from "./map-service.js"; 

window.modoRegistroActivo = false;
window.manzanasSeleccionadas = new Set();

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

    document.getElementById('btn-cerrar-registro').onclick = () => {
        window.modoRegistroActivo = false;
        panelRegistro.style.display = 'none';
        btnFabRegistro.style.display = 'block';
        window.manzanasSeleccionadas.clear();
        refrescarEstilosMapa();
    };

    async function guardarReporteActividad(cobertura) {
        if (window.manzanasSeleccionadas.size === 0) return alert("Toca al menos una manzana en el mapa.");
        
        let notas = "";
        if (cobertura === "Parcial") notas = prompt("Registro Parcial: ¿Qué parte faltó?") || "";

        try {
            const nuevoId = Date.now().toString();
            await setDoc(doc(db, "congregaciones", window.miUsuario.congregacionId, "registro_actividad", nuevoId), {
                fecha: Date.now(), manzanas: Array.from(window.manzanasSeleccionadas),
                cobertura: cobertura, notas: notas, reportadoPor: window.miUsuario.nombre
            });
            alert(`¡Reporte ${cobertura} guardado!`);
            document.getElementById('btn-cerrar-registro').click();
        } catch (error) { alert("Error al guardar el reporte."); }
    }

    document.getElementById('btn-registro-completo').onclick = () => guardarReporteActividad("Completo");
    document.getElementById('btn-registro-parcial').onclick = () => guardarReporteActividad("Parcial");

    // LÓGICA DE LAS PESTAÑAS INTERNAS DE SERVICIO
    const adminDashboard = document.getElementById('admin-dashboard');
    const viewInventario = document.getElementById('admin-inventario-view');
    const viewReportes = document.getElementById('admin-reportes-view');
    const viewRoles = document.getElementById('admin-roles-view');

    document.querySelectorAll('.btn-volver-admin').forEach(btn => btn.onclick = () => history.back());

    // 1. REPORTES
    document.getElementById('btn-admin-reportes').onclick = () => {
        history.pushState({ page: 'admin_sub' }, '', '');
        adminDashboard.style.display = 'none'; viewReportes.style.display = 'block';
        
        onSnapshot(collection(db, "congregaciones", window.miUsuario.congregacionId, "registro_actividad"), (snapshot) => {
            const listaHtml = document.getElementById('lista-reportes'); listaHtml.innerHTML = '';
            let reportes = [];
            snapshot.forEach(doc => reportes.push({id: doc.id, ...doc.data()}));
            reportes.sort((a,b) => b.fecha - a.fecha);
            
            if(reportes.length === 0) { listaHtml.innerHTML = '<p style="color:gray;text-align:center;">No hay reportes.</p>'; return; }

            reportes.forEach(rep => {
                const d = new Date(rep.fecha);
                const fStr = `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()} - ${d.getHours()}:${d.getMinutes().toString().padStart(2,'0')}`;
                const colorBadge = rep.cobertura === 'Completo' ? '#388E3C' : '#E65100';
                
                const card = document.createElement('div'); card.className = 'admin-reporte-card';
                card.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center;"><span style="color:gray; font-size:13px; font-weight:bold;">${fStr}</span><span style="background:${colorBadge}20; color:${colorBadge}; padding:4px 8px; border-radius:8px; font-size:11px; font-weight:900;">${rep.cobertura.toUpperCase()}</span></div>
                    <p style="margin: 10px 0 5px 0; font-weight:bold; color:var(--text-color); font-size:15px;">Manzanas: <span style="color:var(--primary-color);">${rep.manzanas.join(', ')}</span></p>
                    <p style="margin: 0; font-size:14px; color:gray;">👤 Por: ${rep.reportadoPor}</p>
                    ${rep.notas ? `<div style="margin-top:10px; background:rgba(128,128,128,0.1); padding:10px; border-radius:8px; font-size:13px; color:var(--text-color, #444);">📝 ${rep.notas}</div>` : ''}
                `;
                listaHtml.appendChild(card);
            });
        });
    };

    // 2. INVENTARIO
    let seleccionadosInventario = new Set();
    let mapasEstadoGlobal = {};

    function actualizarBarraInventario() {
        document.getElementById('contador-inventario').innerText = seleccionadosInventario.size;
        const btnAsignar = document.getElementById('btn-asignar-mapas');
        const btnRecibir = document.getElementById('btn-recibir-mapas');
        
        if (seleccionadosInventario.size === 0) { btnAsignar.disabled = true; btnRecibir.style.display = 'none'; btnAsignar.style.display = 'block'; return; }
        
        let todosLibres = true;
        seleccionadosInventario.forEach(id => { if (mapasEstadoGlobal[id] && !mapasEstadoGlobal[id].estaDisponible) todosLibres = false; });
        if (todosLibres) { btnAsignar.style.display = 'block'; btnAsignar.disabled = false; btnRecibir.style.display = 'none'; } 
        else { btnAsignar.style.display = 'none'; btnRecibir.style.display = 'block'; }
    }

    document.getElementById('btn-admin-inventario').onclick = () => {
        history.pushState({ page: 'admin_sub' }, '', '');
        adminDashboard.style.display = 'none'; viewInventario.style.display = 'block';
        document.getElementById('barra-accion-inventario').style.display = 'flex';
        seleccionadosInventario.clear(); actualizarBarraInventario();

        let manzanasUnicas = new Set();
        if(window.mapaGlobal) {
            window.mapaGlobal.data.forEach(f => {
                const t = f.getProperty('territorio'); const m = f.getProperty('numero');
                if(t && m && m.toLowerCase() !== 'plaza') manzanasUnicas.add(`T${t} - ${m}`);
            });
        }
        const listaManzanas = Array.from(manzanasUnicas).sort((a,b) => a.localeCompare(b, undefined, {numeric: true}));

        onSnapshot(collection(db, "congregaciones", window.miUsuario.congregacionId, "gestion_mapas"), (snapshot) => {
            mapasEstadoGlobal = {}; snapshot.forEach(doc => mapasEstadoGlobal[doc.id] = doc.data());
            const listaHtml = document.getElementById('lista-inventario'); listaHtml.innerHTML = '';

            listaManzanas.forEach(manzanaId => {
                const gestion = mapasEstadoGlobal[manzanaId] || { estaDisponible: true };
                let badgeHtml = `<span class="badge-libre">LIBRE</span>`; let infoHtml = ``;

                if (!gestion.estaDisponible && gestion.fecha) {
                    const fVencimiento = new Date(gestion.fecha); fVencimiento.setMonth(fVencimiento.getMonth() + (gestion.duracionMeses || 4));
                    const diasRestantes = Math.ceil((fVencimiento - new Date()) / (1000 * 60 * 60 * 24));
                    if (diasRestantes < 0) { badgeHtml = `<span class="badge-vencido">VENCIDO</span>`; infoHtml = `<p>👤 ${gestion.asignadoA}</p><p style="color:#C62828; font-weight:bold;">⚠️ Vencido hace ${Math.abs(diasRestantes)} días</p>`; } 
                    else { badgeHtml = `<span class="badge-asignado">ASIGNADO</span>`; infoHtml = `<p>👤 ${gestion.asignadoA}</p><p style="color:var(--primary-color);">Faltan ${diasRestantes} días</p>`; }
                }

                const div = document.createElement('div'); div.className = 'inventario-item';
                div.innerHTML = `<input type="checkbox" value="${manzanaId}" ${seleccionadosInventario.has(manzanaId) ? 'checked' : ''}><div class="inventario-info"><h4>Manzana ${manzanaId} ${badgeHtml}</h4>${infoHtml}</div>`;
                
                const checkbox = div.querySelector('input');
                div.onclick = (e) => { if(e.target !== checkbox) checkbox.checked = !checkbox.checked;
                    if (checkbox.checked) seleccionadosInventario.add(manzanaId); else seleccionadosInventario.delete(manzanaId);
                    actualizarBarraInventario();
                };
                listaHtml.appendChild(div);
            });
        });
    };

    document.getElementById('btn-recibir-mapas').onclick = () => {
        seleccionadosInventario.forEach(async (id) => { await setDoc(doc(db, "congregaciones", window.miUsuario.congregacionId, "gestion_mapas", id), { estaDisponible: true }); });
        seleccionadosInventario.clear(); actualizarBarraInventario();
    };

    document.getElementById('btn-asignar-mapas').onclick = () => {
        history.pushState({ page: 'modal_asignar' }, '', '');
        document.getElementById('asignar-text').innerText = `Vas a asignar ${seleccionadosInventario.size} manzanas.`;
        document.getElementById('asignar-modal').style.display = 'flex';
    };

    document.getElementById('btn-cancelar-asignar').onclick = () => history.back();

    document.getElementById('btn-confirmar-asignar').onclick = () => {
        const nombre = document.getElementById('asignar-nombre').value.trim();
        const meses = parseInt(document.getElementById('asignar-meses').value) || 4;
        if (!nombre) return alert("Ingresa un nombre");

        seleccionadosInventario.forEach(async (id) => {
            await setDoc(doc(db, "congregaciones", window.miUsuario.congregacionId, "gestion_mapas", id), { asignadoA: nombre, fecha: Date.now(), estaDisponible: false, duracionMeses: meses });
        });
        document.getElementById('asignar-nombre').value = ''; seleccionadosInventario.clear(); actualizarBarraInventario(); history.back(); 
    };

    document.getElementById('btn-admin-roles').onclick = () => {
        history.pushState({ page: 'admin_sub' }, '', '');
        adminDashboard.style.display = 'none'; viewRoles.style.display = 'block';
        document.getElementById('lista-roles').innerHTML = '<p style="color:gray; text-align:center; margin-top:20px;">En construcción... 🏗️</p>';
    };
}