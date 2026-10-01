import { sql } from '../config/neon-config.js';
import { exigirSesion, cerrarSesion } from '../auth/auth.js';

const usuario = exigirSesion(['cliente']);
if (!usuario) throw new Error('Sesión no válida');

const $ = (id) => document.getElementById(id);
$('usuario-activo').textContent = `${usuario.nombre} · Cliente`;
$('btn-salir').addEventListener('click', cerrarSesion);

const params = new URLSearchParams(window.location.search);
const id = Number(params.get('id'));
const form = $('form-actualizar');
const mensaje = $('mensaje-actualizar');
const botonGuardar = $('btn-guardar');

function seleccionarPorTexto(select, texto) {
  const valor = String(texto ?? '').trim();
  let opcion = [...select.options].find(o => o.textContent.trim() === valor);
  // Los 30 datos de prueba pueden contener valores distintos a los del formulario original.
  // Si ocurre, se conserva el valor actual agregándolo como opción editable.
  if (!opcion && valor) {
    opcion = document.createElement('option');
    opcion.value = `actual-${select.id}`;
    opcion.textContent = valor;
    select.appendChild(opcion);
  }
  if (opcion) select.value = opcion.value;
}

function bloquearFormulario() {
  [...form.elements].forEach(el => {
    if (el.id !== 'btn-volver') el.disabled = true;
  });
  botonGuardar.style.display = 'none';
}

async function cargarRegistro() {
  if (!Number.isInteger(id) || id <= 0) {
    mensaje.textContent = 'No se indicó una cita válida.';
    mensaje.className = 'mensaje-sistema mensaje-sistema--error';
    bloquearFormulario();
    return;
  }

  try {
    const filas = await sql`
      SELECT id, codigo_seguimiento, nombre_usuario, dni, tipo_tramite,
             oficina, fecha_cita, horario, celular, estado
      FROM citas_sunarp
      WHERE id = ${id} AND id_usuario = ${usuario.id}
      LIMIT 1;
    `;

    if (filas.length === 0) {
      mensaje.textContent = 'La cita no existe o no pertenece a tu cuenta.';
      mensaje.className = 'mensaje-sistema mensaje-sistema--error';
      bloquearFormulario();
      return;
    }

    const f = filas[0];
    $('codigo').value = f.codigo_seguimiento;
    $('nombre').value = f.nombre_usuario;
    $('dni').value = f.dni;
    $('fecha').value = f.fecha_cita;
    $('celular').value = f.celular ?? '';
    $('estado').value = f.estado;
    seleccionarPorTexto($('tramite'), f.tipo_tramite);
    seleccionarPorTexto($('oficina'), f.oficina);
    seleccionarPorTexto($('hora'), f.horario);

    if (f.estado !== 'registrado') {
      mensaje.textContent = `Esta cita está en estado “${f.estado}” y ya no puede ser modificada por el cliente.`;
      mensaje.className = 'mensaje-sistema';
      bloquearFormulario();
    } else {
      mensaje.textContent = 'Puedes corregir los datos mientras la cita siga en estado registrado.';
      mensaje.className = 'mensaje-sistema';
    }
  } catch (error) {
    console.error(error);
    mensaje.textContent = 'No se pudo cargar la cita. Revisa la conexión con Neon.';
    mensaje.className = 'mensaje-sistema mensaje-sistema--error';
    bloquearFormulario();
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  botonGuardar.disabled = true;
  mensaje.textContent = 'Guardando cambios...';

  try {
    const filas = await sql`
      UPDATE citas_sunarp
      SET nombre_usuario = ${$('nombre').value.trim()},
          dni = ${$('dni').value.trim()},
          tipo_tramite = ${$('tramite').options[$('tramite').selectedIndex].textContent.trim()},
          oficina = ${$('oficina').options[$('oficina').selectedIndex].textContent.trim()},
          fecha_cita = ${$('fecha').value},
          horario = ${$('hora').options[$('hora').selectedIndex].textContent.trim()},
          celular = ${$('celular').value.trim()}
      WHERE id = ${id}
        AND id_usuario = ${usuario.id}
        AND estado = 'registrado'
      RETURNING id;
    `;

    if (filas.length === 0) {
      mensaje.textContent = 'No se pudo actualizar: la cita ya no está disponible para edición.';
      mensaje.className = 'mensaje-sistema mensaje-sistema--error';
      return;
    }

    mensaje.innerHTML = 'Cambios guardados correctamente. <a href="consulta.html">Volver a mis citas</a>';
    mensaje.className = 'mensaje-sistema mensaje-sistema--ok';
  } catch (error) {
    console.error(error);
    mensaje.textContent = 'No se pudo actualizar la cita.';
    mensaje.className = 'mensaje-sistema mensaje-sistema--error';
  } finally {
    botonGuardar.disabled = false;
  }
});

cargarRegistro();
