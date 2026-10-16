import { sql } from '../config/neon-config.js';
import { exigirRol } from '../auth/auth.js';
import { formatearSoles } from '../registro/tarifario.js';
import { $, iniciarInterfaz, celda, filaVacia, enlace, fechaCita, estadoFirma, errorAmigable } from '../comun/ui.js';

const usuario = exigirRol('cliente');
if (!usuario) throw new Error('Acceso denegado');
iniciarInterfaz(usuario);
let cargando = false;

async function cargar() {
  if (cargando) return;
  cargando = true;
  $('refrescar').disabled = true;
  try {
    const filas = await sql`
      SELECT r.*, p.codigo_operacion
      FROM citas_sunarp r
      LEFT JOIN pagos p ON p.id_registro = r.id AND p.estado = 'aprobado'
      WHERE r.id_usuario = ${usuario.id}
      ORDER BY r.fecha_registro DESC, r.id DESC;
    `;
    const tbody = $('cuerpo-citas');
    tbody.replaceChildren();
    for (const r of filas) {
      const tr = document.createElement('tr');
      [r.codigo_seguimiento, r.tipo_tramite, r.oficina, fechaCita(r.fecha_cita),
        r.horario, r.dni, r.estado, r.paginas, formatearSoles(r.monto_calculado), r.estado_pago, estadoFirma(r)]
        .forEach((v) => celda(tr, v));
      const acciones = celda(tr);
      if (r.estado_pago === 'pendiente' && !['rechazado', 'cancelado'].includes(r.estado)) {
        enlace(acciones, 'Pagar', `pago.html?id=${r.id}`);
        if (r.estado === 'registrado') enlace(acciones, 'Editar', `actualizar.html?id=${r.id}`);
      } else if (r.estado_pago === 'pendiente') {
        acciones.textContent = 'Pago no habilitado por estado operativo';
      } else if (r.estado_pago === 'pagado' && r.codigo_operacion) {
        enlace(acciones, 'Ver comprobante', `comprobante.html?op=${encodeURIComponent(r.codigo_operacion)}`);
      }
      tbody.append(tr);
    }
    if (!filas.length) filaVacia(tbody, 12, 'Aún no tienes solicitudes.');
    $('resumen-citas').textContent = `${filas.length} solicitud(es) de tu cuenta.`;
  } catch (error) {
    $('resumen-citas').textContent = errorAmigable(error);
  } finally {
    cargando = false;
    $('refrescar').disabled = false;
  }
}
$('refrescar').addEventListener('click', cargar);
cargar();
