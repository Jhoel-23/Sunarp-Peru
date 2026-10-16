// Reglas puras compartidas por todos los formularios.
export function hoyLima(fecha = new Date()) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(fecha);
  const valor = tipo => partes.find(p => p.type === tipo).value;
  return `${valor('year')}-${valor('month')}-${valor('day')}`;
}
export function validarCampo({ clave, valor, requerido = false, tipo = 'text', minimo = 0,
  maximo = 0, opciones, hoy = hoyLima(), fechaNueva = false, claveOriginal = '' }) {
  const texto = String(valor ?? '');
  const v = texto.trim();
  if (requerido && !v) return 'Completa este campo.';
  if (!v) return '';
  if (maximo && texto.length > maximo) return `Usa como máximo ${maximo} caracteres.`;
  if (minimo && v.length < minimo) return `Escribe al menos ${minimo} caracteres.`;
  if (opciones && !opciones.includes(v)) return 'Selecciona una opción válida.';
  if (tipo === 'email' && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || v.length > 150)) return 'Ingresa un correo válido, por ejemplo nombre@correo.com.';
  if (clave.includes('nombre') || clave === 'titular') {
    if (v.length < 3 || v.length > 100 || (!/^[\p{L}\p{M} .’'\-]+$/u.test(v) || (v.match(/\p{L}/gu) || []).length < 2)) {
      return 'Usa de 3 a 100 caracteres: letras, espacios, puntos, apóstrofes o guiones.';
    }
  }
  if (clave === 'dni' && !/^\d{8}$/.test(v)) return 'El DNI debe tener exactamente 8 dígitos.';
  if (clave === 'celular' && !/^9\d{8}$/.test(v)) return 'El celular debe tener 9 dígitos y empezar con 9.';
  if (clave === 'paginas' && (!/^\d+$/.test(v) || !Number.isSafeInteger(Number(v)) || Number(v) < 1 || Number(v) > 16666664)) return 'Ingresa páginas enteras entre 1 y 16666664.';
  if (clave === 'codigo' && !/^\d{6}$/.test(v)) return 'El código debe tener 6 dígitos.';
  if (clave === 'referencia' && !/^\d{6,12}$/.test(v)) return 'La operación debe tener entre 6 y 12 dígitos.';
  if (clave === 'monto_recibido' && (!/^\d+(?:\.\d{1,2})?$/.test(v) || !Number.isFinite(Number(v)) || Number(v) <= 0 || Number(v) > 99999999.99)) return 'Ingresa un importe mayor que cero y con hasta 2 decimales.';
  if (clave.startsWith('contrasena')) {
    if (!v || texto.length > 150) return 'La contraseña no puede estar vacía ni superar 150 caracteres.';
    if (clave === 'contrasena2' && texto !== claveOriginal) return 'Las contraseñas no coinciden.';
  }
  if (tipo === 'date') {
    const d = new Date(`${v}T12:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== v) return 'Selecciona una fecha válida.';
    if (fechaNueva && v < hoy) return 'La fecha de la cita debe ser hoy o posterior.';
  }
  return '';
}

// PostgreSQL DATE puede llegar como YYYY-MM-DD o como Date en el driver.
// Usar el día UTC del Date evita desplazarlo al día anterior en Perú.
export function normalizarFecha(valor) {
  if (valor == null || valor === '') return '';
  let iso;
  if (valor instanceof Date) {
    if (!Number.isFinite(valor.getTime())) return '';
    iso = valor.toISOString().slice(0, 10);
  } else {
    const m = /^(\d{4}-\d{2}-\d{2})(?:$|[T ])/u.exec(String(valor).trim());
    if (!m) return '';
    iso = m[1];
  }
  const fecha = new Date(`${iso}T12:00:00Z`);
  return Number.isFinite(fecha.getTime()) && fecha.toISOString().slice(0, 10) === iso ? iso : '';
}
