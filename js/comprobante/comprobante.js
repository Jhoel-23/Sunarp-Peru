import { sql } from '../config/neon-config.js';
import { exigirRol, rutaInicioSegunRol } from '../auth/auth.js';
import { formatearSoles } from '../registro/tarifario.js';
import { $, iniciarInterfaz, fechaLima, estadoFirma, errorAmigable } from '../comun/ui.js';

const usuario = exigirRol('cliente', 'administrador', 'empleado', 'cajero');
if (!usuario) throw new Error('Acceso denegado');
iniciarInterfaz(usuario);
$('volver').href = rutaInicioSegunRol(usuario.rol) === 'registro.html' ? 'consulta.html' : rutaInicioSegunRol(usuario.rol);
const metodos = {
  tarjeta_debito: 'Tarjeta de débito', tarjeta_credito: 'Tarjeta de crédito',
  billetera: 'Billetera electrónica', efectivo: 'Efectivo', pos: 'Tarjeta POS'
};

function agregar(lista, etiqueta, valor) {
  const dt = document.createElement('dt');
  const dd = document.createElement('dd');
  dt.textContent = etiqueta;
  dd.textContent = valor ?? '—';
  lista.append(dt, dd);
}

async function cargar() {
  const op = new URLSearchParams(location.search).get('op');
  if (!op || op.length > 20) {
    $('comprobante').textContent = 'Operación inválida.';
    return;
  }
  try {
    const filas = await sql`
      SELECT p.*, r.codigo_seguimiento, r.nombre_usuario, r.paginas,
        r.estado AS estado_operativo, r.estado_pago, r.firma_habilitada,
        r.firma_digital_fecha, r.codigo_firma, c.nombre AS cajero,
        v.nombre AS verificador, f.nombre AS firmante
      FROM pagos p JOIN citas_sunarp r ON r.id = p.id_registro
      LEFT JOIN usuarios c ON c.id = p.id_cajero
      LEFT JOIN usuarios v ON v.id = p.verificado_por
      LEFT JOIN usuarios f ON f.id = r.firmado_por
      WHERE p.codigo_operacion = ${op} AND p.estado = 'aprobado'
        AND (${usuario.rol} <> 'cliente' OR r.id_usuario = ${usuario.id});
    `;
    const p = filas[0];
    $('comprobante').replaceChildren();
    if (!p) {
      $('comprobante').textContent = 'Comprobante no encontrado o sin permiso de acceso.';
      return;
    }
    const dl = document.createElement('dl');
    const datos = [
      ['Operación', p.codigo_operacion], ['Solicitud', p.codigo_seguimiento],
      ['Cliente', p.nombre_usuario], ['Servicio', 'Expedición de vigencia de poder'],
      ['Páginas', p.paginas], ['Canal', p.canal === 'pasarela' ? 'En línea' : 'Ventanilla'],
      ['Medio', `${metodos[p.metodo]} ${p.marca_tarjeta ?? p.proveedor_billetera ?? ''}`],
      ['Referencia', p.referencia], ['Importe pagado', formatearSoles(p.monto)],
      ['Fecha y hora de Lima', fechaLima(p.fecha_pago)]
    ];
    if (p.metodo === 'efectivo') {
      datos.push(['Monto recibido', formatearSoles(p.monto_recibido)], ['Vuelto', formatearSoles(p.vuelto)]);
    }
    if (p.cajero) datos.push(['Cajero', p.cajero]);
    if (p.canal === 'pasarela') datos.push(['Verificación', p.verificado ? `Verificado por ${p.verificador}` : 'Pendiente de caja']);
    datos.push(['Firma', estadoFirma({ ...p, estado: p.estado_operativo })]);
    if (p.firmante) datos.push(['Registrador', p.firmante], ['Fecha de firma simulada', fechaLima(p.firma_digital_fecha)]);
    datos.forEach(([etiqueta, valor]) => agregar(dl, etiqueta, valor));
    $('comprobante').append(dl);
    $('imprimir').disabled = false;
  } catch (error) {
    $('comprobante').textContent = errorAmigable(error);
  }
}
$('imprimir').addEventListener('click', () => window.print());
cargar();
