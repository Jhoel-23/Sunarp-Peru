import { normalizarFecha } from './reglas-formulario.js';
import { cerrarSesion } from '../auth/auth.js';

export const $ = (id) => document.getElementById(id);

export function iniciarInterfaz(usuario) {
  $('usuario-activo').textContent = `${usuario.nombre} · ${usuario.rol}`;
  $('cerrar-sesion').addEventListener('click', cerrarSesion);
  document.querySelectorAll('[data-roles]').forEach((a) => {
    a.hidden = !a.dataset.roles.split(' ').includes(usuario.rol);
  });
}

export function mensaje(id, texto, tipo = 'info') {
  const el = $(id);
  el.textContent = texto;
  el.className = `mensaje mensaje--${tipo}`;
}

export function celda(fila, texto = '') {
  const td = document.createElement('td');
  td.textContent = texto ?? '—';
  fila.append(td);
  return td;
}

export function filaVacia(tbody, columnas, texto) {
  const tr = document.createElement('tr');
  celda(tr, texto).colSpan = columnas;
  tbody.append(tr);
}

export function enlace(td, texto, href) {
  const a = document.createElement('a');
  a.textContent = texto;
  a.href = href;
  a.className = 'boton secundario';
  td.append(a);
}

export function boton(td, texto, accion, id) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = texto;
  b.dataset.accion = accion;
  b.dataset.id = id;
  td.append(b);
  return b;
}

export function fechaLima(valor) {
  return new Date(valor).toLocaleString('es-PE', { timeZone: 'America/Lima' });
}

export function hoyLima() {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const parte = (tipo) => partes.find((p) => p.type === tipo).value;
  return `${parte('year')}-${parte('month')}-${parte('day')}`;
}

export function fechaCita(valor) {
  const iso = normalizarFecha(valor);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso)
    ? new Date(`${iso}T00:00:00`).toLocaleDateString('es-PE') : '—';
}

export function estadoFirma(r) {
  if (r.firma_digital_fecha) return `Firmado (simulado) · ${r.codigo_firma}`;
  if (r.estado === 'rechazado' || r.estado === 'cancelado') return 'No habilitada por estado operativo';
  if (r.estado_pago !== 'pagado') return 'Bloqueada: falta el pago';
  if (!r.firma_habilitada) return 'Pago en línea por verificar en caja';
  return 'Habilitada para el registrador';
}

export function errorAmigable(error) {
  if (error.code === '23505') return 'Esta solicitud ya fue pagada o el código ya existe.';
  if (error.code === '23503') return 'No se puede eliminar: existe historial de pagos.';
  if (error.code === '42P01' || error.code === '42703') {
    return 'Falta instalar sql/01_CASO24_INSTALAR.sql en sunarp_db.';
  }
  return error.message || 'No se pudo completar la operación.';
}
