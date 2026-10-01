import { sql } from '../config/neon-config.js';
import { exigirSesion, cerrarSesion } from '../auth/auth.js';

const usuario = exigirSesion(['cliente']);
if (!usuario) throw new Error('Sesión no válida');

const $ = (id) => document.getElementById(id);
$('usuario-activo').textContent = `${usuario.nombre} · Cliente`;
$('btn-salir').addEventListener('click', cerrarSesion);

const tbody = $('cuerpo-citas');
const resumen = $('resumen-citas');

function escapar(texto) {
  return String(texto ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function fechaBonita(fecha) {
  if (!fecha) return '—';
  const d = new Date(`${fecha}T00:00:00`);
  return Number.isNaN(d.getTime()) ? fecha : d.toLocaleDateString('es-PE');
}

async function cargar() {
  resumen.textContent = 'Cargando tus citas...';
  tbody.innerHTML = '';

  try {
    const filas = await sql`
      SELECT id, codigo_seguimiento, nombre_usuario, dni, tipo_tramite,
             oficina, fecha_cita, horario, celular, estado, fecha_registro
      FROM citas_sunarp
      WHERE id_usuario = ${usuario.id}
      ORDER BY fecha_registro DESC, id DESC;
    `;

    resumen.textContent = `Tienes ${filas.length} cita(s) asociada(s) a tu cuenta.`;

    if (filas.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8">Todavía no tienes citas registradas.</td></tr>';
      return;
    }

    tbody.innerHTML = filas.map((f) => {
      const puedeEditar = f.estado === 'registrado';
      return `
        <tr>
          <td>${escapar(f.codigo_seguimiento)}</td>
          <td>${escapar(f.tipo_tramite)}</td>
          <td>${escapar(f.oficina)}</td>
          <td>${fechaBonita(f.fecha_cita)}</td>
          <td>${escapar(f.horario)}</td>
          <td>${escapar(f.dni)}</td>
          <td><span class="estado estado--${escapar(f.estado)}">${escapar(f.estado)}</span></td>
          <td>${puedeEditar
            ? `<a class="accion-tabla" href="actualizar.html?id=${f.id}">Editar</a>`
            : '<span class="solo-lectura">Solo lectura</span>'}
          </td>
        </tr>`;
    }).join('');
  } catch (error) {
    console.error(error);
    resumen.textContent = 'No se pudieron cargar las citas. Revisa la conexión con Neon.';
    tbody.innerHTML = '<tr><td colspan="8">Error de conexión.</td></tr>';
  }
}

cargar();
