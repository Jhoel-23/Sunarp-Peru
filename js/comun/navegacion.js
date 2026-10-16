// Navegación de sesión sin depender de la conexión a Neon.
(() => {
  function actualizarNavegacion() {
    let usuario;
    try { usuario = JSON.parse(sessionStorage.getItem('usuario') || 'null'); }
    catch { return; }
    if (!usuario) return;
    const destinos = {
      administrador: ['panel.html', 'Gestión'],
      empleado: ['panel.html', 'Gestión'],
      cajero: ['caja.html', 'Caja'],
      cliente: ['consulta.html', 'Mis solicitudes']
    };
    const destino = destinos[usuario.rol];
    if (!destino) return;
    document.querySelectorAll('.nav-principal').forEach(nav => {
      if (nav.querySelector(`a[href="${destino[0]}"]`)) return;
      const a = document.createElement('a');
      a.href = destino[0];
      a.textContent = destino[1];
      const lista = nav.querySelector('ul');
      if (lista) {
        const li = document.createElement('li');
        li.append(a);
        lista.append(li);
      } else nav.append(a);
    });
    document.querySelectorAll('a[href="login.html"]').forEach(a => {
      if (a.textContent.trim() === 'Acceso al sistema') {
        a.href = destino[0];
        a.textContent = usuario.rol === 'cliente' ? 'Mis solicitudes' : 'Ir a ' + destino[1];
      }
    });
  }
  actualizarNavegacion();
  window.addEventListener('pageshow', actualizarNavegacion);
})();
