export function iniciarControladorUI() {
    // 1. Manejo de Pestañas (Tabs)
    const tabs = document.querySelectorAll('.tab');
    const views = document.querySelectorAll('.view-section');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            history.pushState({ page: 'tab' }, '', '');
            
            tabs.forEach(t => t.classList.remove('active')); 
            views.forEach(v => v.style.display = 'none');
            
            tab.classList.add('active'); 
            const tId = tab.getAttribute('data-target'); 
            const tView = document.getElementById(tId);
            
            if (tId === 'map-view' && tView) tView.style.display = 'flex'; 
            else if (tView) tView.style.display = 'block';
        });
    });

    // 2. Cerrar Modales
    const btnCerrarFicha = document.getElementById('btn-cerrar-ficha');
    if (btnCerrarFicha) btnCerrarFicha.onclick = () => history.back();

    // 3. Intercepción del Botón "Atrás" de Android
    window.addEventListener('popstate', () => {
        const modalFicha = document.getElementById('ficha-modal');
        const modalAsignar = document.getElementById('asignar-modal');
        const barraInventario = document.getElementById('barra-accion-inventario');
        const adminDashboard = document.getElementById('admin-dashboard');
        const viewsAdmin = ['admin-inventario-view', 'admin-reportes-view', 'admin-roles-view'];
        
        // Cierra modales
        if (modalFicha && modalFicha.style.display === 'flex') { modalFicha.style.display = 'none'; return; }
        if (modalAsignar && modalAsignar.style.display === 'flex') { modalAsignar.style.display = 'none'; return; }

        // Cierra sub-menús de admin
        let cerroAdmin = false;
        viewsAdmin.forEach(id => {
            const el = document.getElementById(id);
            if (el && el.style.display === 'block') {
                el.style.display = 'none';
                cerroAdmin = true;
            }
        });
        
        if (cerroAdmin) {
            if(barraInventario) barraInventario.style.display = 'none';
            if(adminDashboard) adminDashboard.style.display = 'flex';
            return;
        }

        // Vuelve al mapa si estás en otra pestaña
        const tabMapa = document.querySelector('.tab[data-target="map-view"]');
        if (tabMapa && !tabMapa.classList.contains('active')) {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active')); 
            document.querySelectorAll('.view-section').forEach(v => v.style.display = 'none');
            tabMapa.classList.add('active'); 
            document.getElementById('map-view').style.display = 'flex';
        }
    });
}