// ==========================================
// ARCHIVO: ui-utils.js (Componentes Visuales)
// ==========================================

export function mostrarModalEditarNota(textoActual, onGuardar) {
    let m = document.createElement('div');
    m.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: var(--modal-overlay); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); z-index: 10005; display: flex; align-items: center; justify-content: center; padding: 20px; box-sizing: border-box; font-family: sans-serif;';
    m.innerHTML = `
        <div style="background: var(--surface-color); width: 100%; max-width: 360px; border-radius: 24px; padding: 24px; box-shadow: 0 16px 40px rgba(0,0,0,0.4); border: 1px solid var(--border-color);">
            <h3 style="color: var(--text-color); margin: 0 0 16px 0; font-size: 18px;">Editar Conversación</h3>
            <textarea id="input-edit-nota" style="width: 100%; height: 140px; background: var(--bg-color); border: 1px solid var(--input-border); color: var(--text-color); padding: 14px; border-radius: var(--border-radius); margin-bottom: 24px; font-size: 15px; box-sizing: border-box; outline: none; transition: border 0.2s; resize: none;">${textoActual}</textarea>
            <div style="display: flex; justify-content: flex-end; gap: 12px;">
                <button id="btn-cancelar-edit-nota" style="background: transparent; border: none; color: var(--primary-color); font-weight: bold; font-size: 15px; padding: 10px 16px; border-radius: var(--border-radius); cursor: pointer;">Cancelar</button>
                <button id="btn-guardar-edit-nota" style="background: var(--primary-color); color: white; border: none; font-weight: bold; font-size: 15px; padding: 10px 20px; border-radius: var(--border-radius); cursor: pointer;">Guardar</button>
            </div>
        </div>
    `;
    document.body.appendChild(m);
    const inputNota = document.getElementById('input-edit-nota');
    inputNota.addEventListener('focus', (e) => e.target.style.borderColor = 'var(--primary-color)');
    inputNota.addEventListener('blur', (e) => e.target.style.borderColor = 'var(--input-border)');

    document.getElementById('btn-cancelar-edit-nota').onclick = () => m.remove();
    document.getElementById('btn-guardar-edit-nota').onclick = () => {
        const nTexto = inputNota.value.trim(); if(!nTexto) return alert("La nota no puede quedar vacía.");
        const btnGuardar = document.getElementById('btn-guardar-edit-nota'); btnGuardar.innerText = "Guardando..."; btnGuardar.disabled = true;
        onGuardar(nTexto); m.remove();
    };
}

window.mostrarModalConfirmacionGlobal = function(titulo, mensaje, txtConfirmar, colorConfirmar, onConfirm) {
    let m = document.createElement('div');
    m.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: var(--modal-overlay); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); z-index: 10050; display: flex; align-items: center; justify-content: center; padding: 20px; box-sizing: border-box; font-family: sans-serif; opacity: 0; transition: opacity 0.2s ease;';
    m.innerHTML = `
        <div style="background: var(--surface-color); width: 100%; max-width: 320px; border-radius: 28px; padding: 24px; box-shadow: 0 24px 48px rgba(0,0,0,0.4); border: 1px solid var(--border-color); text-align: center; transform: scale(0.95); transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);">
            <div style="font-size: 42px; margin-bottom: 16px;">⚠️</div><h3 style="color: var(--text-color); margin: 0 0 12px 0; font-size: 20px;">${titulo}</h3>
            <p style="color: var(--text-muted); font-size: 15px; margin: 0 0 28px 0; line-height: 1.5;">${mensaje}</p>
            <div style="display: flex; flex-direction: column; gap: 12px;">
                <button id="btn-accion-confirm-global" style="background: ${colorConfirmar}; color: white; border: none; font-weight: bold; padding: 16px; border-radius: 16px; cursor: pointer; font-size: 16px;">${txtConfirmar}</button>
                <button id="btn-cancelar-confirm-global" style="background: transparent; border: 1px solid var(--border-color); color: var(--text-color); font-weight: bold; padding: 16px; border-radius: 16px; cursor: pointer; font-size: 16px;">Cancelar</button>
            </div>
        </div>
    `;
    document.body.appendChild(m); setTimeout(() => { m.style.opacity = '1'; m.children[0].style.transform = 'scale(1)'; }, 10);
    function cerrarModal() { m.style.opacity = '0'; m.children[0].style.transform = 'scale(0.95)'; setTimeout(() => m.remove(), 200); }
    document.getElementById('btn-cancelar-confirm-global').onclick = cerrarModal;
    document.getElementById('btn-accion-confirm-global').onclick = () => { cerrarModal(); onConfirm(); };
};

window.mostrarModalCambiosSinGuardar = function(onGuardar, onSalir) {
    let m = document.createElement('div');
    m.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: var(--modal-overlay); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); z-index: 10060; display: flex; align-items: center; justify-content: center; padding: 20px; box-sizing: border-box; font-family: sans-serif; opacity: 0; transition: opacity 0.2s ease;';
    m.innerHTML = `
        <div style="background: var(--surface-color); width: 100%; max-width: 340px; border-radius: 28px; padding: 24px; box-shadow: 0 24px 48px rgba(0,0,0,0.4); border: 1px solid var(--border-color); text-align: center; transform: scale(0.95); transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);">
            <div style="font-size: 42px; margin-bottom: 16px;">💾</div><h3 style="color: var(--text-color); margin: 0 0 12px 0; font-size: 20px;">Cambios sin guardar</h3>
            <p style="color: var(--text-muted); font-size: 15px; margin: 0 0 28px 0; line-height: 1.5;">Tienes información nueva en esta visita. ¿Qué deseas hacer?</p>
            <div style="display: flex; flex-direction: column; gap: 10px;">
                <button id="btn-modal-guardar" style="background: var(--primary-color); color: white; border: none; font-weight: bold; padding: 16px; border-radius: 16px; cursor: pointer; font-size: 16px; transition: opacity 0.2s;">Guardar cambios</button>
                <button id="btn-modal-salir" style="background: transparent; border: 1px solid var(--error-text); color: var(--error-text); font-weight: bold; padding: 16px; border-radius: 16px; cursor: pointer; font-size: 16px; transition: opacity 0.2s;">Salir sin guardar</button>
                <button id="btn-modal-cancelar" style="background: transparent; border: none; color: var(--text-muted); font-weight: bold; padding: 12px; border-radius: 16px; cursor: pointer; font-size: 15px;">Cancelar</button>
            </div>
        </div>
    `;
    document.body.appendChild(m); setTimeout(() => { m.style.opacity = '1'; m.children[0].style.transform = 'scale(1)'; }, 10);
    function cerrarModal() { m.style.opacity = '0'; m.children[0].style.transform = 'scale(0.95)'; setTimeout(() => m.remove(), 200); }
    document.getElementById('btn-modal-cancelar').onclick = cerrarModal;
    document.getElementById('btn-modal-guardar').onclick = () => { cerrarModal(); if(onGuardar) onGuardar(); };
    document.getElementById('btn-modal-salir').onclick = () => { cerrarModal(); if(onSalir) onSalir(); };
};

window.mostrarToastM3 = function(mensaje, tipo = 'success') {
    const bg = tipo === 'error' ? 'var(--error-text)' : '#4CAF50';
    const icon = tipo === 'error' ? '❌' : '✅';
    
    const toastViejo = document.getElementById('toast-m3');
    if (toastViejo) toastViejo.remove();

    const toast = document.createElement('div');
    toast.id = 'toast-m3';
    toast.style.cssText = `position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%) translateY(100px); background: ${bg}; color: white; padding: 12px 24px; border-radius: 50px; font-family: sans-serif; font-size: 14px; font-weight: bold; box-shadow: 0 8px 24px rgba(0,0,0,0.4); z-index: 11000; display: flex; align-items: center; gap: 10px; opacity: 0; transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1); width: max-content; max-width: 90%; pointer-events: none;`;
    toast.innerHTML = `<span style="font-size: 18px;">${icon}</span> <span>${mensaje}</span>`;
    
    document.body.appendChild(toast);
    
    setTimeout(() => { toast.style.transform = 'translateX(-50%) translateY(0)'; toast.style.opacity = '1'; }, 10);
    setTimeout(() => { 
        toast.style.transform = 'translateX(-50%) translateY(100px)'; toast.style.opacity = '0'; 
        setTimeout(() => toast.remove(), 300);
    }, 3500);
};

export function abrirNavegadorGPS(lat, lng) {
    if (!lat || !lng) {
        if(window.mostrarToastM3) window.mostrarToastM3("No hay coordenadas exactas para esta visita.", "error");
        return;
    }
    let m = document.createElement('div');
    m.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: var(--modal-overlay); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); z-index: 10020; display: flex; align-items: flex-end; justify-content: center; font-family: sans-serif;';
    m.innerHTML = `
        <div style="background: var(--surface-color); width: 100%; max-width: 480px; border-radius: 28px 28px 0 0; padding: 24px 24px 36px 24px; box-shadow: 0 -8px 40px rgba(0,0,0,0.4); border-top: 1px solid var(--border-color); animation: slideUpNav 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);">
            <div style="width: 40px; height: 5px; background: var(--border-color); border-radius: 3px; margin: 0 auto 24px auto;"></div>
            <h3 style="color: var(--text-color); margin: 0 0 20px 0; font-size: 20px; text-align: center;">¿Cómo quieres llegar?</h3>
            <div style="display: flex; flex-direction: column; gap: 12px;">
                <button id="btn-nav-maps" style="background: var(--bg-color); border: 1px solid var(--border-color); color: var(--text-color); padding: 16px; border-radius: 16px; font-size: 16px; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 16px; transition: opacity 0.2s;"><span style="font-size: 24px;">🗺️</span> Google Maps</button>
                <button id="btn-nav-waze" style="background: var(--bg-color); border: 1px solid var(--border-color); color: var(--text-color); padding: 16px; border-radius: 16px; font-size: 16px; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 16px; transition: opacity 0.2s;"><span style="font-size: 24px;">🚗</span> Waze</button>
                <button id="btn-nav-apple" style="background: var(--bg-color); border: 1px solid var(--border-color); color: var(--text-color); padding: 16px; border-radius: 16px; font-size: 16px; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 16px; transition: opacity 0.2s;"><span style="font-size: 24px;">🍎</span> Apple Maps</button>
            </div>
            <button id="btn-cancelar-nav" style="width: 100%; background: transparent; border: none; color: var(--text-muted); font-weight: bold; font-size: 16px; padding: 20px 16px 0 16px; margin-top: 8px; cursor: pointer;">Cancelar</button>
        </div>
    `;
    
    if (!document.getElementById('anim-slide-up-nav')) {
        const style = document.createElement('style'); style.id = 'anim-slide-up-nav';
        style.innerHTML = `@keyframes slideUpNav { from { transform: translateY(100%); } to { transform: translateY(0); } }`;
        document.head.appendChild(style);
    }
    document.body.appendChild(m);

    const isApple = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (!isApple) document.getElementById('btn-nav-apple').style.display = 'none';

    document.getElementById('btn-cancelar-nav').onclick = () => m.remove();
    
    document.getElementById('btn-nav-maps').onclick = () => {
        window.open(`http://googleusercontent.com/maps.google.com/maps?daddr=${lat},${lng}`, '_blank'); m.remove();
    };
    document.getElementById('btn-nav-waze').onclick = () => {
        window.open(`https://waze.com/ul?ll=${lat},${lng}&navigate=yes`, '_blank'); m.remove();
    };
    document.getElementById('btn-nav-apple').onclick = () => {
        window.open(`http://maps.apple.com/?daddr=${lat},${lng}`, '_blank'); m.remove();
    };
}