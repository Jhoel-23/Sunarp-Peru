import { sql } from '../config/neon-config.js';
import { exigirSesion, cerrarSesion } from '../auth/auth.js';

const usuario = exigirSesion(['cliente']);
if (!usuario) throw new Error('Sesión no válida');

const $ = (id) => document.getElementById(id);
$('usuario-activo').textContent = `${usuario.nombre} · Cliente`;
$('btn-salir').addEventListener('click', cerrarSesion);

const form = $('form-cita');
const mensaje = $('mensaje-registro');

function textoSeleccionado(id) {
  const select = $(id);
  return select.options[select.selectedIndex]?.textContent.trim() || '';
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const boton = form.querySelector('button[type="submit"]');
  boton.disabled = true;
  mensaje.textContent = 'Guardando cita...';
  mensaje.className = 'mensaje-sistema';

  const codigo = `SUN-${Date.now().toString().slice(-10)}`;

  try {
    await sql`
      INSERT INTO citas_sunarp (
        codigo_seguimiento,
        nombre_usuario,
        dni,
        tipo_tramite,
        oficina,
        fecha_cita,
        horario,
        celular,
        estado,
        id_usuario
      ) VALUES (
        ${codigo},
        ${$('nombre').value.trim()},
        ${$('dni').value.trim()},
        ${textoSeleccionado('tramite')},
        ${textoSeleccionado('oficina')},
        ${$('fecha').value},
        ${textoSeleccionado('hora')},
        ${$('celular').value.trim()},
        'registrado',
        ${usuario.id}
      );
    `;

    mensaje.innerHTML = `Cita registrada correctamente. Código: <strong>${codigo}</strong>. <a href="consulta.html">Ver mis citas</a>`;
    mensaje.className = 'mensaje-sistema mensaje-sistema--ok';
    form.reset();
  } catch (error) {
    console.error(error);
    mensaje.textContent = 'No se pudo registrar la cita. Revisa la conexión con Neon.';
    mensaje.className = 'mensaje-sistema mensaje-sistema--error';
  } finally {
    boton.disabled = false;
  }
});
