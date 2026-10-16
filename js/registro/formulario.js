import { validarCampo, normalizarFecha, hoyLima } from '../comun/reglas-formulario.js';
import { calcularMontoServicio, formatearSoles, paginasValidas } from './tarifario.js';

export function leerFormulario(form) {
  const d = Object.fromEntries(new FormData(form));
  for (const campo of ['nombre', 'dni', 'celular', 'oficina', 'fecha', 'hora']) {
    d[campo] = String(d[campo] ?? '').trim();
  }
  for (const campo of ['oficina', 'hora']) {
    const el = form.elements[campo];
    if (el?.tagName === 'SELECT' && el.value) {
      d[campo] = el.options[el.selectedIndex].textContent.trim();
    }
  }
  return d;
}

export function validarDatos(form, datos) {
  if (!form.checkValidity()) {
    form.reportValidity();
    return false;
  }
  if (validarCampo({ clave: 'nombre', valor: datos.nombre, requerido: true }) || !paginasValidas(datos.paginas)) return false;
  return /^\d{8}$/.test(datos.dni) && /^9\d{8}$/.test(datos.celular);
}

export function conectarCotizador(form, salida) {
  function actualizar() {
    const paginas = form.elements.paginas.value;
    salida.textContent = paginasValidas(paginas)
      ? formatearSoles(calcularMontoServicio({ paginas })) : 'Ingresa páginas válidas';
  }
  form.addEventListener('input', actualizar);
  form.addEventListener('change', actualizar);
  form.addEventListener('reset', () => setTimeout(actualizar, 0));
  actualizar();
  return actualizar;
}

export function cargarCampos(form, r) {
  const valores = {
    nombre: r.nombre_usuario, dni: r.dni, celular: r.celular,
    tramite: r.tipo_tramite, oficina: r.oficina, fecha: normalizarFecha(r.fecha_cita),
    hora: r.horario, paginas: r.paginas
  };
  for (const [campo, valor] of Object.entries(valores)) {
    const el = form.elements[campo];
    if (!el) continue;
    if (el.tagName === 'SELECT' && valor && ![...el.options].some((o) => o.value === valor)) {
      el.add(new Option(valor, valor));
    }
    el.value = valor ?? '';
    if (campo === 'fecha') {
      el.required = true;
      el.min = hoyLima();
      el.setCustomValidity('');
    }
  }
}
