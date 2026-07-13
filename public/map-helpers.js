// ==========================================
// ARCHIVO: map-helpers.js (Utilidades y Matemática)
// ==========================================

export function oscurecerColorWeb(hexColor) {
    if (!hexColor || !hexColor.startsWith('#')) return '#424242';
    let r = parseInt(hexColor.slice(1, 3), 16);
    let g = parseInt(hexColor.slice(3, 5), 16);
    let b = parseInt(hexColor.slice(5, 7), 16);
    r = Math.floor(r * 0.4);
    g = Math.floor(g * 0.4);
    b = Math.floor(b * 0.4);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export function obtenerColorPin(estado) {
    let color = '#E65100'; 
    if (estado === 'Nueva') color = '#0288D1'; 
    if (estado === 'Ausente') color = '#D32F2F'; 
    if (estado === 'Revisita') color = '#388E3C'; 
    if (estado === 'Estudio') color = '#FBC02D'; 
    if (estado === 'No visitar' || estado === 'Quitar de No Visitar') color = '#7B1FA2'; 
    if (estado === 'AlertaGlobal') color = '#B71C1C'; 

    const svgMarker = encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="28" height="42">
            <path fill="${color}" stroke="white" stroke-width="2" d="M12 0C5.373 0 0 5.373 0 12c0 7.5 12 24 12 24s12-16.5 12-24c0-6.627-5.373-12-12-12zm0 17c-2.761 0-5-2.239-5-5s2.239-5 5-5 5 2.239 5 5-2.239 5-5 5z"/>
        </svg>
    `);

    return { 
        url: `data:image/svg+xml;charset=UTF-8,${svgMarker}`, 
        scaledSize: new google.maps.Size(28, 42),
        anchor: new google.maps.Point(14, 42)
    };
}

export function normalizarTexto(texto) {
    if (!texto) return "";
    return texto.toString().toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") 
        .replace(/v/g, "b"); 
}

export function configurarAutocomplete(inputId, listId, opciones) {
    const input = document.getElementById(inputId);
    const list = document.getElementById(listId);
    if (!input || !list) return;

    input.addEventListener('focus', () => renderList(input.value));
    input.addEventListener('input', (e) => renderList(e.target.value));

    document.addEventListener('click', (e) => {
        if (e.target !== input && !list.contains(e.target)) list.style.display = 'none';
    });

    function renderList(query) {
        list.innerHTML = '';
        const queryWords = normalizarTexto(query).trim().split(/\s+/);
        
        const filtrados = opciones.filter(opc => {
            const opcNorm = normalizarTexto(opc);
            return queryWords.every(word => opcNorm.includes(word));
        });
        
        if (filtrados.length === 0) {
            list.style.display = 'none';
            return;
        }

        filtrados.forEach(opc => {
            const item = document.createElement('div');
            item.className = 'autocomplete-item';
            item.textContent = opc;
            item.onmousedown = (e) => { 
                e.preventDefault(); 
                input.value = opc;
                list.style.display = 'none';
            };
            list.appendChild(item);
        });
        list.style.display = 'block';
    }
}

export function parsearNotasHistorial(notesRaw) {
    if (!notesRaw || notesRaw.trim() === '') return [];
    if (notesRaw.trim().startsWith("[")) { try { return JSON.parse(notesRaw); } catch(e) {} }
    try {
        return notesRaw.split("|||").map(str => {
            const parts = str.split("&&&");
            if (parts.length === 3) return { id: parts[0], fecha: parts[1], texto: parts[2].replace(/\/\/\//g, "\n") };
            return null;
        }).filter(Boolean);
    } catch(e) { return [{ id: Date.now().toString(), fecha: "Historial Previo", texto: notesRaw }]; }
}

export function empaquetarNotasHistorial(listaNotas) {
    if (!listaNotas || listaNotas.length === 0) return "";
    return listaNotas.map(nota => `${nota.id}&&&${nota.fecha}&&&${nota.texto.replace(/\n/g, "///")}`).join("|||");
}

export function formatearFechaHoy() {
    const meses = ["ene.","feb.","mar.","abr.","may.","jun.","jul.","ago.","sep.","oct.","nov.","dic."];
    const d = new Date(); const dia = d.getDate().toString().padStart(2, '0'); const mes = meses[d.getMonth()];
    const anio = d.getFullYear(); const hora = d.getHours().toString().padStart(2, '0'); const min = d.getMinutes().toString().padStart(2, '0');
    return `${dia} ${mes} ${anio} - ${hora}:${min}`; 
}