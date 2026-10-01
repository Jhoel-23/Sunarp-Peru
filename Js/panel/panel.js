import { sql } from '../config/neon-config.js';
import { exigirSesion, cerrarSesion } from '../auth/auth.js';

const usuario = exigirSesion(['administrador', 'empleado']);
if (!usuario) throw new Error('Sesión no válida');

const $ = (id) => document.getElementById(id);
const tbody = $('cuerpo-panel');
const resumen = $('resumen-panel');
const formCrear = $('form-crear');
const formEditar = $('form-editar');
const modal = $('modal-editar');
const estadoTurno = $('estado-turno');
const historialBody = $('cuerpo-historial');

$('btn-salir').addEventListener('click', cerrarSesion);

const ETIQUETAS_TURNO = {
  manana: 'Mañana (08:00 a 13:00)',
  tarde: 'Tarde (13:00 a 18:00)',
  'noche-madrugada': 'Noche–madrugada (18:00 a 08:00)'
};

let permisoTurno = {
  puedeCambiarEstado: usuario.rol === 'administrador',
  turnoActual: null,
  horaPeru: '',
  turnoUsuario: usuario.turno || null
};

function escapar(texto) {
  return String(texto ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function textoSelect(form, nombre) {
  const s = form.elements[nombre];
  return s.options[s.selectedIndex].textContent.trim();
}

function fechaISO(fecha) {
  if (!fecha) return '';

  if (fecha instanceof Date && !Number.isNaN(fecha.getTime())) {
    const anio = fecha.getUTCFullYear();
    const mes = String(fecha.getUTCMonth() + 1).padStart(2, '0');
    const dia = String(fecha.getUTCDate()).padStart(2, '0');
    return `${anio}-${mes}-${dia}`;
  }

  const texto = String(fecha).trim();
  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const d = new Date(texto);
  if (Number.isNaN(d.getTime())) return '';

  const anio = d.getUTCFullYear();
  const mes = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(d.getUTCDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

function fechaBonita(fecha) {
  const iso = fechaISO(fecha);
  if (!iso) return '—';

  const [anio, mes, dia] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(anio, mes - 1, dia));

  return new Intl.DateTimeFormat('es-PE', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(d);
}

function etiquetaTurno(turno) {
  return ETIQUETAS_TURNO[turno] || turno || 'Sin turno';
}

async function obtenerPermisoTurno() {
  const filas = await sql`
    WITH reloj AS (
      SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::time AS hora
    )
    SELECT
      u.id,
      u.rol,
      u.turno,
      TO_CHAR((CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima'), 'HH24:MI') AS hora_peru,
      CASE
        WHEN reloj.hora >= TIME '08:00' AND reloj.hora < TIME '13:00' THEN 'manana'
        WHEN reloj.hora >= TIME '13:00' AND reloj.hora < TIME '18:00' THEN 'tarde'
        ELSE 'noche-madrugada'
      END AS turno_actual,
      CASE
        WHEN u.rol = 'administrador' THEN TRUE
        WHEN u.rol = 'empleado' AND u.turno = (
          CASE
            WHEN reloj.hora >= TIME '08:00' AND reloj.hora < TIME '13:00' THEN 'manana'
            WHEN reloj.hora >= TIME '13:00' AND reloj.hora < TIME '18:00' THEN 'tarde'
            ELSE 'noche-madrugada'
          END
        ) THEN TRUE
        ELSE FALSE
      END AS puede_cambiar_estado
    FROM usuarios u
    CROSS JOIN reloj
    WHERE u.id = ${usuario.id}
    LIMIT 1;
  `;

  if (!filas.length) {
    throw new Error('No se pudo validar el usuario activo.');
  }

  const fila = filas[0];
  permisoTurno = {
    puedeCambiarEstado: Boolean(fila.puede_cambiar_estado),
    turnoActual: fila.turno_actual,
    horaPeru: fila.hora_peru,
    turnoUsuario: fila.turno
  };

  return permisoTurno;
}

function pintarUsuarioYTurno() {
  const turnoUsuario = usuario.rol === 'empleado'
    ? ` · ${etiquetaTurno(permisoTurno.turnoUsuario)}`
    : '';

  $('usuario-activo').textContent = `${usuario.nombre} · ${usuario.rol}${turnoUsuario}`;

  if (usuario.rol === 'administrador') {
    estadoTurno.innerHTML = `<strong>Administrador:</strong> puede cambiar estados en cualquier turno. Hora de Perú: ${escapar(permisoTurno.horaPeru)}.`;
    estadoTurno.className = 'aviso-turno aviso-turno--ok';
    return;
  }

  if (permisoTurno.puedeCambiarEstado) {
    estadoTurno.innerHTML = `<strong>Turno habilitado:</strong> ${escapar(etiquetaTurno(permisoTurno.turnoUsuario))}. Puedes editar el estado de las citas. Hora de Perú: ${escapar(permisoTurno.horaPeru)}.`;
    estadoTurno.className = 'aviso-turno aviso-turno--ok';
  } else {
    estadoTurno.innerHTML = `<strong>Fuera de turno:</strong> tu turno es ${escapar(etiquetaTurno(permisoTurno.turnoUsuario))} y ahora corresponde ${escapar(etiquetaTurno(permisoTurno.turnoActual))}. Puedes consultar y editar los demás datos, pero el estado queda bloqueado.`;
    estadoTurno.className = 'aviso-turno aviso-turno--bloqueado';
  }
}

async function refrescarPermisoTurno() {
  await obtenerPermisoTurno();
  pintarUsuarioYTurno();
  return permisoTurno;
}

async function listarTodos() {
  resumen.textContent = 'Cargando registros...';

  try {
    await refrescarPermisoTurno();

    const filas = await sql`
      SELECT c.*, u.nombre AS cliente_nombre, u.correo AS cliente_correo
      FROM citas_sunarp c
      LEFT JOIN usuarios u ON u.id = c.id_usuario
      ORDER BY c.fecha_registro DESC, c.id DESC;
    `;

    resumen.textContent = `${filas.length} registro(s) en citas_sunarp.`;
    tbody.innerHTML = filas.length ? filas.map(f => `
      <tr>
        <td>${escapar(f.codigo_seguimiento)}</td>
        <td>${escapar(f.nombre_usuario)}</td>
        <td>${escapar(f.dni)}</td>
        <td>${escapar(f.tipo_tramite)}</td>
        <td>${fechaBonita(f.fecha_cita)}</td>
        <td><span class="estado estado--${escapar(f.estado)}">${escapar(f.estado)}</span></td>
        <td>${f.id_usuario ? `${escapar(f.cliente_nombre)} (#${f.id_usuario})` : 'Atención directa'}</td>
        <td class="acciones-tabla">
          <button type="button" class="accion-tabla btn-editar" data-id="${f.id}">Editar</button>
          <button type="button" class="accion-tabla accion-tabla--peligro btn-eliminar" data-id="${f.id}" data-codigo="${escapar(f.codigo_seguimiento)}">Eliminar</button>
        </td>
      </tr>
    `).join('') : '<tr><td colspan="8">No existen registros.</td></tr>';
  } catch (error) {
    console.error(error);
    resumen.textContent = 'No se pudieron cargar los registros.';
  }
}

async function cargarHistorial() {
  if (!historialBody) return;

  try {
    const filas = await sql`
      SELECT h.id, h.cita_id, h.estado_anterior, h.estado_nuevo,
             h.rol, h.turno, h.fecha_cambio,
             u.nombre AS usuario_nombre
      FROM historial_estados h
      LEFT JOIN usuarios u ON u.id = h.usuario_id
      ORDER BY h.fecha_cambio DESC, h.id DESC
      LIMIT 30;
    `;

    historialBody.innerHTML = filas.length ? filas.map(h => `
      <tr>
        <td>${escapar(h.cita_id ?? '—')}</td>
        <td>${escapar(h.estado_anterior)}</td>
        <td>${escapar(h.estado_nuevo)}</td>
        <td>${escapar(h.usuario_nombre || 'Usuario')}</td>
        <td>${escapar(h.rol)}</td>
        <td>${escapar(etiquetaTurno(h.turno))}</td>
        <td>${escapar(new Date(h.fecha_cambio).toLocaleString('es-PE'))}</td>
      </tr>
    `).join('') : '<tr><td colspan="7">Aún no hay cambios de estado registrados.</td></tr>';
  } catch (error) {
    console.error(error);
    historialBody.innerHTML = '<tr><td colspan="7">No se pudo cargar el historial. Ejecuta el SQL de turnos si la tabla aún no existe.</td></tr>';
  }
}

formCrear.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!formCrear.checkValidity()) return formCrear.reportValidity();

  const m = $('mensaje-panel');
  m.textContent = 'Creando registro...';
  const codigo = `SUN-${Date.now().toString().slice(-10)}`;

  try {
    await sql`
      INSERT INTO citas_sunarp (
        codigo_seguimiento, nombre_usuario, dni, tipo_tramite, oficina,
        fecha_cita, horario, celular, estado, id_usuario
      ) VALUES (
        ${codigo},
        ${formCrear.elements.nombre.value.trim()},
        ${formCrear.elements.dni.value.trim()},
        ${textoSelect(formCrear, 'tramite')},
        ${textoSelect(formCrear, 'oficina')},
        ${formCrear.elements.fecha.value},
        ${textoSelect(formCrear, 'hora')},
        ${formCrear.elements.celular.value.trim()},
        'registrado',
        NULL
      );
    `;

    formCrear.reset();
    m.textContent = `Registro creado: ${codigo}. id_usuario quedó en NULL por ser una atención desde el panel.`;
    m.className = 'mensaje-sistema mensaje-sistema--ok';
    await listarTodos();
  } catch (error) {
    console.error(error);
    m.textContent = 'No se pudo crear el registro.';
    m.className = 'mensaje-sistema mensaje-sistema--error';
  }
});

async function abrirEdicion(id) {
  try {
    await refrescarPermisoTurno();

    const filas = await sql`SELECT * FROM citas_sunarp WHERE id = ${id} LIMIT 1;`;
    if (!filas.length) return;
    const f = filas[0];

    formEditar.elements.id.value = f.id;
    formEditar.elements.codigo.value = f.codigo_seguimiento;
    formEditar.elements.nombre.value = f.nombre_usuario;
    formEditar.elements.dni.value = f.dni;
    formEditar.elements.tramite.value = f.tipo_tramite;
    formEditar.elements.oficina.value = f.oficina ?? '';
    formEditar.elements.fecha.value = String(f.fecha_cita ?? '').slice(0, 10);
    formEditar.elements.hora.value = f.horario ?? '';
    formEditar.elements.celular.value = f.celular ?? '';
    formEditar.elements.estado.value = f.estado;
    formEditar.dataset.estadoOriginal = f.estado;

    const selectEstado = formEditar.elements.estado;
    const fueraDeTurno = usuario.rol === 'empleado' && !permisoTurno.puedeCambiarEstado;
    selectEstado.disabled = fueraDeTurno;

    $('nota-estado-turno').textContent = fueraDeTurno
      ? `Estado bloqueado: este empleado está fuera de su turno (${etiquetaTurno(permisoTurno.turnoUsuario)}).`
      : usuario.rol === 'administrador'
        ? 'Administrador: puede cambiar el estado en cualquier horario.'
        : `Turno activo: ${etiquetaTurno(permisoTurno.turnoUsuario)}. Puedes cambiar el estado.`;

    if (typeof modal.showModal === 'function') modal.showModal();
    else modal.setAttribute('open', '');
  } catch (error) {
    console.error(error);
    alert('No se pudo abrir el registro.');
  }
}

formEditar.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = Number(formEditar.elements.id.value);

  try {
    await refrescarPermisoTurno();

    const originales = await sql`
      SELECT estado
      FROM citas_sunarp
      WHERE id = ${id}
      LIMIT 1;
    `;

    if (!originales.length) {
      throw new Error('El registro ya no existe.');
    }

    const estadoAnterior = originales[0].estado;
    const estadoSolicitado = formEditar.elements.estado.disabled
      ? estadoAnterior
      : formEditar.elements.estado.value;

    const filas = await sql`
      UPDATE citas_sunarp AS c
      SET nombre_usuario = ${formEditar.elements.nombre.value.trim()},
          dni = ${formEditar.elements.dni.value.trim()},
          tipo_tramite = ${formEditar.elements.tramite.value.trim()},
          oficina = ${formEditar.elements.oficina.value.trim()},
          fecha_cita = ${formEditar.elements.fecha.value},
          horario = ${formEditar.elements.hora.value.trim()},
          celular = ${formEditar.elements.celular.value.trim()},
          estado = CASE
            WHEN ${usuario.rol} = 'administrador' THEN ${estadoSolicitado}
            WHEN EXISTS (
              SELECT 1
              FROM usuarios u
              WHERE u.id = ${usuario.id}
                AND u.rol = 'empleado'
                AND (
                  (u.turno = 'manana' AND (CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::time >= TIME '08:00' AND (CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::time < TIME '13:00')
                  OR
                  (u.turno = 'tarde' AND (CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::time >= TIME '13:00' AND (CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::time < TIME '18:00')
                  OR
                  (u.turno = 'noche-madrugada' AND ((CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::time >= TIME '18:00' OR (CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::time < TIME '08:00'))
                )
            ) THEN ${estadoSolicitado}
            ELSE c.estado
          END
      WHERE c.id = ${id}
      RETURNING c.estado;
    `;

    if (!filas.length) {
      throw new Error('No se pudo actualizar el registro.');
    }

    const estadoFinal = filas[0].estado;

    if (estadoFinal !== estadoAnterior) {
      await sql`
        INSERT INTO historial_estados (
          cita_id, usuario_id, rol, turno,
          estado_anterior, estado_nuevo, fecha_cambio
        ) VALUES (
          ${id},
          ${usuario.id},
          ${usuario.rol},
          ${usuario.turno || null},
          ${estadoAnterior},
          ${estadoFinal},
          CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima'
        );
      `;
    }

    modal.close();

    if (usuario.rol === 'empleado' && estadoSolicitado !== estadoAnterior && estadoFinal === estadoAnterior) {
      $('mensaje-panel').textContent = 'Los demás datos se actualizaron, pero el estado no cambió porque el empleado está fuera de su turno.';
      $('mensaje-panel').className = 'mensaje-sistema mensaje-sistema--error';
    } else {
      $('mensaje-panel').textContent = estadoFinal !== estadoAnterior
        ? `Registro actualizado. Estado: ${estadoAnterior} → ${estadoFinal}. El cambio quedó registrado en el historial.`
        : 'Registro actualizado correctamente.';
      $('mensaje-panel').className = 'mensaje-sistema mensaje-sistema--ok';
    }

    await Promise.all([listarTodos(), cargarHistorial()]);
  } catch (error) {
    console.error(error);
    $('mensaje-panel').textContent = error.message || 'No se pudo actualizar el registro.';
    $('mensaje-panel').className = 'mensaje-sistema mensaje-sistema--error';
  }
});

async function eliminar(id, codigo) {
  if (!confirm(`¿Eliminar definitivamente la cita ${codigo}?`)) return;

  try {
    await sql`DELETE FROM citas_sunarp WHERE id = ${id};`;
    $('mensaje-panel').textContent = `Registro ${codigo} eliminado.`;
    $('mensaje-panel').className = 'mensaje-sistema mensaje-sistema--ok';
    await listarTodos();
  } catch (error) {
    console.error(error);
    alert('No se pudo eliminar el registro.');
  }
}

tbody.addEventListener('click', (e) => {
  const editar = e.target.closest('.btn-editar');
  if (editar) abrirEdicion(Number(editar.dataset.id));

  const borrar = e.target.closest('.btn-eliminar');
  if (borrar) eliminar(Number(borrar.dataset.id), borrar.dataset.codigo);
});

$('cerrar-modal').addEventListener('click', () => modal.close());

Promise.all([listarTodos(), cargarHistorial()]);
