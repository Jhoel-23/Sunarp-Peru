import { sql } from '../config/neon-config.js';
import { exigirRol } from '../auth/auth.js';
import { calcularMontoServicio, formatearSoles } from '../registro/tarifario.js';
import { conectarCotizador, leerFormulario, validarDatos, cargarCampos } from '../registro/formulario.js';
import { $, iniciarInterfaz, mensaje, celda, boton, enlace, filaVacia, fechaLima, estadoFirma, errorAmigable } from '../comun/ui.js';

const usuario = exigirRol('administrador', 'empleado');
if (!usuario) throw new Error('Acceso denegado');
iniciarInterfaz(usuario);
const formCrear = $('form-crear');
const formEditar = $('form-editar');
const modal = $('modal-editar');
conectarCotizador(formCrear, $('crear-monto'));
const cotizarEditar = conectarCotizador(formEditar, $('panel-editar-monto'));
let registros = [];
let original = null;
let permisoTurno = false;
let ocupado = false;
let accionPendiente = null;
let cargando = false;

async function obtenerPermiso() {
  const filas = await sql`SELECT c24_puede_gestionar(${usuario.id}) AS permitido`;
  permisoTurno = Boolean(filas[0].permitido);
  $('estado-turno').textContent = permisoTurno
    ? 'Turno habilitado: puedes gestionar el estado y firmar solicitudes habilitadas.'
    : 'Fuera de turno: puedes consultar y corregir datos pendientes; el cambio de estado y la firma están bloqueados.';
}

async function cargar() {
  if (cargando) return;
  cargando = true;
  try {
    await obtenerPermiso();
    registros = await sql`
      SELECT r.*, p.codigo_operacion,
        EXISTS (SELECT 1 FROM pagos h WHERE h.id_registro = r.id) AS tiene_historial
      FROM citas_sunarp r
      LEFT JOIN pagos p ON p.id_registro = r.id AND p.estado = 'aprobado'
      ORDER BY r.fecha_registro DESC, r.id DESC;
    `;
    const tbody = $('cuerpo-panel');
    tbody.replaceChildren();
    for (const r of registros) {
      const tr = document.createElement('tr');
      [r.codigo_seguimiento, r.nombre_usuario, r.dni, r.paginas,
        formatearSoles(r.monto_calculado), r.estado,
        `${r.estado_pago} / ${r.canal_pago ?? '—'}`, estadoFirma(r)]
        .forEach((v) => celda(tr, v));
      const acciones = celda(tr);
      if (!r.firma_digital_fecha) boton(acciones, 'Editar', 'editar', r.id);
      if (r.firma_habilitada && !r.firma_digital_fecha && permisoTurno) {
        boton(acciones, 'Firmar (simulado)', 'firmar', r.id);
      }
      if (!r.tiene_historial) boton(acciones, 'Eliminar', 'eliminar', r.id).className = 'peligro';
      if (r.codigo_operacion) enlace(acciones, 'Comprobante', `comprobante.html?op=${encodeURIComponent(r.codigo_operacion)}`);
      tbody.append(tr);
    }
    if (!registros.length) filaVacia(tbody, 9, 'No hay solicitudes.');
    $('resumen-panel').textContent = `${registros.length} registro(s). El pago se gestiona exclusivamente por pasarela o caja.`;
    await cargarHistorial();
  } catch (error) {
    mensaje('mensaje-panel', errorAmigable(error), 'error');
  } finally {
    cargando = false;
  }
}

async function cargarHistorial() {
  const filas = await sql`
    SELECT h.*, u.nombre FROM historial_estados h
    LEFT JOIN usuarios u ON u.id = h.usuario_id
    ORDER BY h.id DESC LIMIT 40;
  `;
  const tbody = $('cuerpo-historial');
  tbody.replaceChildren();
  for (const h of filas) {
    const tr = document.createElement('tr');
    [h.cita_id, h.estado_anterior, h.estado_nuevo, h.nombre, fechaLima(h.fecha_cambio)]
      .forEach((v) => celda(tr, v));
    tbody.append(tr);
  }
  if (!filas.length) filaVacia(tbody, 5, 'Sin cambios de estado registrados.');
}

formCrear.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (ocupado) return;
  const d = leerFormulario(formCrear);
  if (!validarDatos(formCrear, d)) return mensaje('mensaje-panel', 'Revisa los campos del registro.', 'error');
  ocupado = true;
  const b = formCrear.querySelector('button[type="submit"]');
  b.disabled = true;
  try {
    const codigo = 'SUN24-' + crypto.randomUUID().slice(0, 13).toUpperCase();
    await sql`
      INSERT INTO citas_sunarp (
        codigo_seguimiento,nombre_usuario,dni,tipo_tramite,oficina,
        fecha_cita,horario,celular,id_usuario,estado,paginas,monto_calculado,estado_pago
      ) VALUES (
        ${codigo},${d.nombre},${d.dni},'Expedición de vigencia de poder',${d.oficina},
        ${d.fecha},${d.hora},${d.celular},NULL,'registrado',${Number(d.paginas)},${calcularMontoServicio(d)},'pendiente'
      );
    `;
    await window.SunarpUI.notificar('Solicitud registrada', `Código ${codigo}. Comunícalo al cliente para pagar en caja.`);
    formCrear.reset();
    mensaje('mensaje-panel', `Solicitud ${codigo} creada. Comunica el código al cliente para el cobro en caja.`, 'exito');
    await cargar();
  } catch (error) {
    mensaje('mensaje-panel', errorAmigable(error), 'error');
  } finally {
    ocupado = false;
    b.disabled = false;
  }
});

async function abrirEdicion(id) {
  await obtenerPermiso();
  const filas = await sql`SELECT * FROM citas_sunarp WHERE id = ${id}`;
  original = filas[0];
  if (!original || original.firma_digital_fecha) throw new Error('La solicitud ya no está disponible para editar.');
  cargarCampos(formEditar, original);
  formEditar.elements.id.value = original.id;
  const select = formEditar.elements.estado;
  if (![...select.options].some((o) => o.value === original.estado)) select.add(new Option(original.estado, original.estado));
  select.value = original.estado;
  select.disabled = !permisoTurno;
  $('datos-editables').disabled = original.estado_pago !== 'pendiente';
  $('nota-editar').textContent = original.estado_pago === 'pagado'
    ? 'Pago confirmado: la fecha, los datos y las páginas se muestran para consulta y están bloqueados. Solo se permite gestión operativa.'
    : 'El monto se recalcula al cambiar las páginas. El estado financiero no se edita aquí.';
  cotizarEditar();
  mensaje('mensaje-editar', '');
  modal.showModal();
}

formEditar.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (ocupado || !original) return;
  const editarDatos = original.estado_pago === 'pendiente';
  const d = editarDatos ? leerFormulario(formEditar) : null;
  if (editarDatos && !validarDatos(formEditar, d)) return mensaje('mensaje-editar', 'Revisa los datos y las páginas.', 'error');
  ocupado = true;
  const b = formEditar.querySelector('button[type="submit"]');
  b.disabled = true;
  const estado = formEditar.elements.estado.disabled ? original.estado : formEditar.elements.estado.value;
  try {
    const operaciones = [];
    if (editarDatos) {
      operaciones.push(sql`SELECT c24_exigir_pendiente(${original.id})`);
      operaciones.push(sql`
        UPDATE citas_sunarp SET nombre_usuario = ${d.nombre}, dni = ${d.dni}, celular = ${d.celular},
          oficina = ${d.oficina}, fecha_cita = ${d.fecha}, horario = ${d.hora},
          paginas = ${Number(d.paginas)}, monto_calculado = ${calcularMontoServicio(d)}
        WHERE id = ${original.id} AND estado_pago = 'pendiente';
      `);
    }
    operaciones.push(sql`SELECT c24_cambiar_estado(${original.id}, ${usuario.id}, ${estado})`);
    await sql.transaction(operaciones);
    modal.close();
    mensaje('mensaje-panel', 'Solicitud actualizada.', 'exito');
    await window.SunarpUI.notificar('Cambios guardados', 'La solicitud fue actualizada correctamente.');
    await cargar();
  } catch (error) {
    mensaje('mensaje-editar', errorAmigable(error), 'error');
  } finally {
    ocupado = false;
    b.disabled = false;
  }
});

$('cerrar-modal').addEventListener('click', () => { if (!ocupado) modal.close(); });
modal.addEventListener('cancel', (e) => { if (ocupado) e.preventDefault(); });
$('cuerpo-panel').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-accion]');
  if (!b || ocupado) return;
  const id = Number(b.dataset.id);
  try {
    if (b.dataset.accion === 'editar') return await abrirEdicion(id);
    const r = registros.find((fila) => Number(fila.id) === id);
    if (!r) return;
    accionPendiente = { id, accion: b.dataset.accion };
    $('texto-accion').textContent = b.dataset.accion === 'firmar'
      ? `Se registrará la firma digital simulada y la atención de ${r.codigo_seguimiento}. Se validarán nuevamente el pago, la verificación y el turno.`
      : `¿Eliminar ${r.codigo_seguimiento}? Solo se permite si no tiene ningún historial de pagos.`;
    $('dialogo-accion').showModal();
  } catch (error) {
    mensaje('mensaje-panel', errorAmigable(error), 'error');
  }
});
$('cancelar-accion').addEventListener('click', () => { if (!ocupado) $('dialogo-accion').close(); });
$('dialogo-accion').addEventListener('cancel', (e) => { if (ocupado) e.preventDefault(); });
$('confirmar-accion').addEventListener('click', async () => {
  if (ocupado || !accionPendiente) return;
  ocupado = true;
  $('confirmar-accion').disabled = true;
  try {
    if (accionPendiente.accion === 'firmar') {
      const filas = await sql`SELECT c24_firmar(${accionPendiente.id}, ${usuario.id}) AS codigo`;
      mensaje('mensaje-panel', `Documento firmado en simulación: ${filas[0].codigo}.`, 'exito');
    } else {
      await sql`DELETE FROM citas_sunarp WHERE id = ${accionPendiente.id}`;
      mensaje('mensaje-panel', 'Solicitud eliminada.', 'exito');
    }
    $('dialogo-accion').close();
    await window.SunarpUI.notificar('Operación completada', $('mensaje-panel').textContent);
    await cargar();
  } catch (error) {
    $('dialogo-accion').close();
    mensaje('mensaje-panel', errorAmigable(error), 'error');
  } finally {
    ocupado = false;
    $('confirmar-accion').disabled = false;
  }
});
$('refrescar').addEventListener('click', cargar);
cargar();
