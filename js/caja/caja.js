import { sql } from '../config/neon-config.js';
import { exigirRol } from '../auth/auth.js';
import { formatearSoles, redondear } from '../registro/tarifario.js';
import { generarCodigoOperacion } from '../pago/validaciones.js';
import { $, iniciarInterfaz, mensaje, celda, boton, enlace, filaVacia, hoyLima, fechaLima, errorAmigable } from '../comun/ui.js';

const usuario = exigirRol('cajero', 'administrador');
if (!usuario) throw new Error('Acceso denegado');
iniciarInterfaz(usuario);
const tablaPendientes = document.querySelector('#tabla-pendientes tbody');
const tablaEnLinea = document.querySelector('#tabla-en-linea tbody');
const tablaResumen = document.querySelector('#tabla-resumen tbody');
const formCobro = $('form-cobro');
const dialogo = $('dialogo-cobro');
const metodos = {
  efectivo: { metodo: 'efectivo', proveedor: null },
  pos: { metodo: 'pos', proveedor: null },
  andipay: { metodo: 'billetera', proveedor: 'andipay' },
  pagomovil: { metodo: 'billetera', proveedor: 'pagomovil' }
};
let pendientes = [];
let registro = null;
let ocupado = false;
let refrescando = false;
let refrescoPendiente = false;
let ultimoId = null;
let fechaAnterior = '';
$('fecha-caja').value = hoyLima();

async function buscarPendientes(criterio) {
  const patron = `%${criterio.trim()}%`;
  return sql`
    SELECT r.*, COALESCE(u.nombre, r.nombre_usuario) AS cliente,
      COALESCE(r.dni, u.dni) AS cliente_dni
    FROM citas_sunarp r LEFT JOIN usuarios u ON u.id = r.id_usuario
    WHERE r.estado_pago = 'pendiente' AND r.estado NOT IN ('rechazado', 'cancelado')
      AND (r.codigo_seguimiento ILIKE ${patron} OR r.dni ILIKE ${patron}
        OR r.nombre_usuario ILIKE ${patron} OR u.dni ILIKE ${patron} OR u.nombre ILIKE ${patron})
    ORDER BY r.fecha_registro, r.id LIMIT 100;
  `;
}

async function cargarPendientes() {
  pendientes = await buscarPendientes($('criterio').value);
  tablaPendientes.replaceChildren();
  for (const r of pendientes) {
    const tr = document.createElement('tr');
    [r.codigo_seguimiento, r.cliente, r.cliente_dni, formatearSoles(r.monto_calculado)]
      .forEach((v) => celda(tr, v));
    boton(celda(tr), 'Cobrar', 'cobrar', r.id);
    tablaPendientes.append(tr);
  }
  if (!pendientes.length) filaVacia(tablaPendientes, 5, 'Sin solicitudes pendientes para esta búsqueda.');
}

function describirMedio(p) {
  return p.metodo === 'billetera' ? `${p.proveedor_billetera} ${p.referencia}`
    : `${p.marca_tarjeta ?? p.metodo} ${p.referencia ?? ''}`;
}

async function cargarMovimientos(fecha, soloPorVerificar) {
  return sql`
    SELECT p.*, r.codigo_seguimiento, COALESCE(u.nombre, r.nombre_usuario) AS cliente,
      v.nombre AS verificador
    FROM pagos p JOIN citas_sunarp r ON r.id = p.id_registro
    LEFT JOIN usuarios u ON u.id = p.id_usuario
    LEFT JOIN usuarios v ON v.id = p.verificado_por
    WHERE p.canal = 'pasarela'
      AND (p.fecha_pago AT TIME ZONE 'America/Lima')::date = ${fecha}::date
      AND (${soloPorVerificar} = false OR (p.estado = 'aprobado' AND NOT p.verificado))
    ORDER BY p.fecha_pago DESC, p.id DESC;
  `;
}

function pintarMovimientos(pagos, fecha, filtrado) {
  tablaEnLinea.replaceChildren();
  for (const p of pagos) {
    const tr = document.createElement('tr');
    if (p.estado === 'rechazado') tr.className = 'fila-rechazada';
    [fechaLima(p.fecha_pago), p.codigo_operacion, p.codigo_seguimiento, p.cliente,
      describirMedio(p), formatearSoles(p.monto),
      p.estado === 'aprobado' ? 'Aprobado' : `Rechazado: ${p.motivo_rechazo}`]
      .forEach((v) => celda(tr, v));
    const acciones = celda(tr);
    if (p.estado === 'aprobado' && !p.verificado) boton(acciones, 'Verificar', 'verificar', p.id);
    if (p.verificado) acciones.textContent = `Verificado por ${p.verificador}`;
    if (p.estado === 'aprobado') enlace(acciones, 'Comprobante', `comprobante.html?op=${encodeURIComponent(p.codigo_operacion)}`);
    tablaEnLinea.append(tr);
  }
  if (!pagos.length) filaVacia(tablaEnLinea, 8, 'Sin operaciones en línea para este filtro.');
  // Evitar avisos falsos al cambiar la fecha o el filtro.
  const clave = `${fecha}/${filtrado}`;
  const max = pagos.reduce((m, p) => Math.max(m, p.estado === 'aprobado' ? Number(p.id) : 0), 0);
  if (fechaAnterior === clave && ultimoId !== null && max > ultimoId) {
    const nuevos = pagos.filter((p) => p.estado === 'aprobado' && Number(p.id) > ultimoId).length;
    $('aviso-nuevos').textContent = `Ingresaron ${nuevos} pago(s) nuevo(s) por la pasarela.`;
  } else if (fechaAnterior !== clave) {
    $('aviso-nuevos').textContent = '';
  }
  ultimoId = fechaAnterior === clave ? Math.max(ultimoId ?? 0, max) : max;
  fechaAnterior = clave;
}

async function cargarResumen(fecha) {
  return sql`
    SELECT canal, metodo, COUNT(*)::int AS operaciones, SUM(monto) AS total
    FROM pagos
    WHERE estado = 'aprobado'
      AND (fecha_pago AT TIME ZONE 'America/Lima')::date = ${fecha}::date
    GROUP BY canal, metodo ORDER BY canal, metodo;
  `;
}

function pintarResumen(filas) {
  tablaResumen.replaceChildren();
  let total = 0;
  for (const f of filas) {
    const tr = document.createElement('tr');
    [f.canal === 'pasarela' ? 'En línea' : 'Ventanilla', f.metodo, f.operaciones,
      formatearSoles(f.total)].forEach((v) => celda(tr, v));
    total += Number(f.total);
    tablaResumen.append(tr);
  }
  if (!filas.length) filaVacia(tablaResumen, 4, 'Sin cobros aprobados en esta fecha.');
  $('total-dia').textContent = formatearSoles(redondear(total));
}

async function refrescar() {
  if (refrescando) {
    refrescoPendiente = true;
    return;
  }
  const fecha = $('fecha-caja').value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return;
  const filtro = $('solo-por-verificar').checked;
  refrescando = true;
  try {
    const [pagos, resumen] = await Promise.all([cargarMovimientos(fecha, filtro), cargarResumen(fecha)]);
    if (fecha === $('fecha-caja').value && filtro === $('solo-por-verificar').checked) {
      pintarMovimientos(pagos, fecha, filtro);
      pintarResumen(resumen);
      $('ultima-revision').textContent = `Última revisión: ${fechaLima(new Date())}. Refresco cada 15 segundos con la pestaña visible.`;
    }
  } catch (error) {
    mensaje('mensaje-caja', errorAmigable(error), 'error');
  } finally {
    refrescando = false;
    if (refrescoPendiente) {
      refrescoPendiente = false;
      refrescar();
    }
  }
}

$('form-buscar').addEventListener('submit', (e) => {
  e.preventDefault();
  cargarPendientes().catch((error) => mensaje('mensaje-caja', errorAmigable(error), 'error'));
});

function ajustarMetodo() {
  const efectivo = $('metodo-caja').value === 'efectivo';
  $('campo-recibido').hidden = !efectivo;
  $('campo-referencia').hidden = efectivo;
  $('monto-recibido').required = efectivo;
  $('referencia').required = !efectivo;
  calcularVuelto();
}

function calcularVuelto() {
  const vuelto = redondear(Number($('monto-recibido').value) - Number(registro?.monto_calculado || 0));
  $('vuelto').textContent = vuelto >= 0 ? formatearSoles(vuelto) : 'Monto insuficiente';
}

$('metodo-caja').addEventListener('change', ajustarMetodo);
$('monto-recibido').addEventListener('input', calcularVuelto);
tablaPendientes.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-accion="cobrar"]');
  if (!b || ocupado) return;
  registro = pendientes.find((r) => String(r.id) === b.dataset.id);
  if (!registro) return;
  formCobro.reset();
  $('cobro-codigo').textContent = registro.codigo_seguimiento;
  $('cobro-total').textContent = formatearSoles(registro.monto_calculado);
  $('monto-recibido').value = registro.monto_calculado;
  mensaje('mensaje-cobro', '');
  ajustarMetodo();
  dialogo.showModal();
});
$('cancelar-cobro').addEventListener('click', () => { if (!ocupado) dialogo.close(); });
dialogo.addEventListener('cancel', (e) => { if (ocupado) e.preventDefault(); });

formCobro.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (ocupado || !registro) return;
  const datos = Object.fromEntries(new FormData(formCobro));
  const { metodo, proveedor } = metodos[datos.metodo];
  const monto = Number(registro.monto_calculado);
  let recibido = null;
  let vuelto = null;
  let referencia = 'Efectivo';
  if (metodo === 'efectivo') {
    recibido = Number(datos.monto_recibido);
    if (!Number.isFinite(recibido) || recibido < monto) {
      return mensaje('mensaje-cobro', 'El monto recibido es insuficiente.', 'error');
    }
    vuelto = redondear(recibido - monto);
  } else {
    if (!/^\d{6,12}$/.test(datos.referencia ?? '')) {
      return mensaje('mensaje-cobro', 'Ingresa una operación de 6 a 12 dígitos.', 'error');
    }
    referencia = `${metodo === 'pos' ? 'Voucher ' : 'Op. '}${datos.referencia}`;
  }
  ocupado = true;
  formCobro.querySelectorAll('button').forEach((b) => { b.disabled = true; });
  const codigo = generarCodigoOperacion('CJ');
  try {
    await sql.transaction([
      sql`INSERT INTO pagos (
          codigo_operacion, id_registro, id_usuario, canal, metodo, proveedor_billetera,
          referencia, monto, monto_recibido, vuelto, estado, id_cajero
        ) VALUES (
          ${codigo}, ${registro.id}, ${registro.id_usuario}, 'caja', ${metodo}, ${proveedor},
          ${referencia}, ${monto}, ${recibido}, ${vuelto}, 'aprobado', ${usuario.id}
        );`,
      sql`UPDATE citas_sunarp SET estado_pago = 'pagado', canal_pago = 'caja', fecha_pago = NOW()
        WHERE id = ${registro.id} AND estado_pago = 'pendiente';`
    ]);
    dialogo.close();
    mensaje('mensaje-caja', `Cobro aprobado. Operación ${codigo}.`, 'exito');
    await window.SunarpUI.notificar('Cobro registrado', `Operación ${codigo}. El pago simulado fue confirmado. Puedes abrir el comprobante desde el enlace de esta página.`);
    const a = document.createElement('a');
    a.href = `comprobante.html?op=${encodeURIComponent(codigo)}`;
    a.textContent = ' Abrir comprobante';
    $('mensaje-caja').append(a);
    await Promise.all([cargarPendientes(), refrescar()]);
  } catch (error) {
    mensaje('mensaje-cobro', errorAmigable(error), 'error');
  } finally {
    ocupado = false;
    formCobro.querySelectorAll('button').forEach((b) => { b.disabled = false; });
  }
});

let idPorVerificar = null;
tablaEnLinea.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-accion="verificar"]');
  if (!b || ocupado) return;
  idPorVerificar = Number(b.dataset.id);
  $('texto-verificar').textContent = 'Confirma que el pago aprobado figura en el estado de cuenta simulado. Esta acción habilita la firma.';
  $('dialogo-verificar').showModal();
});
$('cancelar-verificar').addEventListener('click', () => { if (!ocupado) $('dialogo-verificar').close(); });
$('dialogo-verificar').addEventListener('cancel', (e) => { if (ocupado) e.preventDefault(); });
$('confirmar-verificar').addEventListener('click', async () => {
  if (ocupado || !idPorVerificar) return;
  ocupado = true;
  $('confirmar-verificar').disabled = true;
  try {
    const filas = await sql`
      UPDATE pagos SET verificado = true, verificado_por = ${usuario.id}, fecha_verificacion = NOW()
      WHERE id = ${idPorVerificar} AND canal = 'pasarela' AND estado = 'aprobado' AND NOT verificado
      RETURNING id;
    `;
    $('dialogo-verificar').close();
    mensaje('mensaje-caja', filas.length ? 'Pago verificado. Firma habilitada para el registrador.' : 'El pago ya fue verificado o no está disponible.', filas.length ? 'exito' : 'info');
    if (filas.length) await window.SunarpUI.notificar('Pago verificado', 'Se verificó el pago en línea y se habilitó la firma para el registrador.');
    await refrescar();
  } catch (error) {
    $('dialogo-verificar').close();
    mensaje('mensaje-caja', errorAmigable(error), 'error');
  } finally {
    ocupado = false;
    $('confirmar-verificar').disabled = false;
  }
});

$('fecha-caja').addEventListener('change', refrescar);
$('solo-por-verificar').addEventListener('change', refrescar);
setInterval(() => { if (!document.hidden && !ocupado) refrescar(); }, 15000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refrescar(); });
cargarPendientes().catch((error) => mensaje('mensaje-caja', errorAmigable(error), 'error'));
refrescar();
