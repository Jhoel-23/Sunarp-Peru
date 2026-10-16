import { validarCampo, hoyLima } from './reglas-formulario.js';
import { validarFormularioTarjeta, enmascararTarjeta } from '../pago/validaciones.js';

// Una sola capa para validación, confirmación y avisos de resultado.
const dialogo = document.createElement('dialog');
dialogo.className = 'sunarp-dialogo';
dialogo.setAttribute('aria-labelledby', 'sunarp-dialogo-titulo');
dialogo.setAttribute('aria-describedby', 'sunarp-dialogo-descripcion');
const icono = document.createElement('div');
icono.className = 'sunarp-dialogo-icono';
icono.setAttribute('aria-hidden', 'true');
const titulo = document.createElement('h2');
titulo.id = 'sunarp-dialogo-titulo';
const descripcion = document.createElement('p');
descripcion.id = 'sunarp-dialogo-descripcion';
const resumen = document.createElement('dl');
const pie = document.createElement('div');
pie.className = 'sunarp-dialogo-pie';
const cancelar = document.createElement('button');
cancelar.type = 'button';
cancelar.textContent = 'Volver a revisar';
cancelar.className = 'sunarp-volver';
const aceptar = document.createElement('button');
aceptar.type = 'button';
aceptar.className = 'sunarp-confirmar';
pie.append(cancelar, aceptar);
dialogo.append(icono, titulo, descripcion, resumen, pie);
document.body.append(dialogo);
let cola = Promise.resolve();
function mostrar({ titulo: t, texto = '', filas = [], confirmacion = false, boton = 'Entendido', tipo = 'exito' }) {
  const trabajo = () => new Promise(resolve => {
    const anterior = document.activeElement;
    titulo.textContent = t;
    descripcion.textContent = texto;
    icono.textContent = confirmacion ? '?' : tipo === 'error' ? '!' : '✓';
    dialogo.dataset.tipo = confirmacion ? 'confirmacion' : tipo;
    cancelar.hidden = !confirmacion;
    aceptar.textContent = boton;
    resumen.replaceChildren();
    for (const [etiqueta, valor] of filas) {
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = etiqueta;
      dd.textContent = String(valor ?? '—');
      resumen.append(dt, dd);
    }
    resumen.hidden = !filas.length;
    const hermanos = [...document.body.children].filter(el => el !== dialogo);
    const previos = hermanos.map(el => el.inert);
    hermanos.forEach(el => { el.inert = true; });
    const cerrar = valor => {
      aceptar.onclick = cancelar.onclick = null;
      dialogo.oncancel = null;
      dialogo.close();
      hermanos.forEach((el, i) => { el.inert = previos[i]; });
      if (anterior?.isConnected) anterior.focus();
      resolve(valor);
    };
    aceptar.onclick = () => cerrar(true);
    cancelar.onclick = () => cerrar(false);
    dialogo.oncancel = e => { e.preventDefault(); cerrar(false); };
    dialogo.showModal();
    (confirmacion ? cancelar : aceptar).focus();
  });
  const promesa = cola.then(trabajo);
  cola = promesa.catch(() => {});
  return promesa;
}
window.SunarpUI = {
  confirmar: opciones => mostrar({ ...opciones, confirmacion: true }),
  notificar: (titulo, texto, tipo = 'exito') => mostrar({ titulo, texto, tipo })
};
const esperando = new WeakSet();
const autorizados = new WeakSet();
let secuencia = 0;
const claveDe = el => el.name || el.id;
function visibles(form) {
  return [...form.elements].filter(el => el.matches('input,select,textarea') && !el.matches(':disabled') &&
    !el.readOnly && !['hidden', 'submit', 'button', 'reset'].includes(el.type) && !el.closest('[hidden]'));
}
function errorCampo(el, texto) {
  if (!el.id) el.id = `campo-validado-${++secuencia}`;
  let salida = document.getElementById(`validacion-${el.id}`);
  if (!salida) {
    salida = document.createElement('small');
    salida.id = `validacion-${el.id}`;
    salida.className = 'sunarp-error-campo';
    salida.setAttribute('aria-live', 'polite');
    el.insertAdjacentElement('afterend', salida);
    const ids = new Set((el.getAttribute('aria-describedby') || '').split(' ').filter(Boolean));
    ids.add(salida.id);
    el.setAttribute('aria-describedby', [...ids].join(' '));
  }
  salida.textContent = texto;
  salida.hidden = !texto;
  el.setAttribute('aria-invalid', texto ? 'true' : 'false');
  el.setCustomValidity(texto);
}
function revisar(form, enfocar = true, solo = null) {
  let primero;
  const campos = visibles(form).filter(el => !solo || el === solo);
  const tarjeta = form.id === 'form-tarjeta'
    ? validarFormularioTarjeta(Object.fromEntries(new FormData(form))).errores : {};
  for (const el of campos) {
    el.setCustomValidity('');
    const clave = claveDe(el);
    if (!['password', 'checkbox', 'radio'].includes(el.type)) el.value = el.value.trim();
    if (clave.includes('nombre') || clave === 'titular') el.value = el.value.replace(/\s+/g, ' ');
    let texto = validarCampo({
      clave, valor: el.type === 'checkbox' ? (el.checked ? 'si' : '') : el.value,
      requerido: el.required || (form.id === 'form-cobro' && ['monto_recibido', 'referencia'].includes(clave)), tipo: el.type,
      minimo: el.minLength > 0 ? el.minLength : 0,
      maximo: el.maxLength > 0 ? el.maxLength : 0,
      opciones: el.tagName === 'SELECT' ? [...el.options].filter(o => !o.disabled).map(o => o.value) : undefined,
      fechaNueva: clave === 'fecha' && ['form-registro', 'form-crear', 'form-actualizar', 'form-editar'].includes(form.id),
      claveOriginal: document.getElementById('contrasena')?.value
    });
    if (tarjeta[clave]) texto = tarjeta[clave];
    if (!texto && !el.validity.valid) texto = el.validationMessage || 'Revisa el formato de este campo.';
    if (clave === 'monto_recibido' && !texto) {
      const total = Number((document.getElementById('cobro-total')?.textContent || '').replace(/[^\d.]/g, ''));
      if (Number(el.value) < total) texto = 'El monto recibido no cubre el total a pagar.';
    }
    errorCampo(el, texto);
    if (texto && !primero) primero = el;
  }
  if (!solo && (form.id === 'form-tarjeta' || form.id === 'form-billetera')) {
    const seleccion = document.getElementById('registro');
    if (!seleccion.value) { errorCampo(seleccion, 'Selecciona una solicitud pendiente de pago.'); primero ||= seleccion; }
    else { errorCampo(seleccion, ''); }
  }
  if (primero && enfocar) primero.focus();
  return !primero;
}
function preparar(form) {
  // El navegador delega en la capa de errores accesibles junto a cada campo.
  form.noValidate = true;
  for (const el of visibles(form)) {
    const clave = claveDe(el);
    if (clave.includes('nombre') || clave === 'titular') el.maxLength = 100;
    if (el.type === 'email' || el.type === 'password') el.maxLength = 150;
    if (clave === 'criterio') el.maxLength = 150;
    if (clave === 'fecha') { el.required = true; el.min = hoyLima(); }
  }
}
document.querySelectorAll('form').forEach(preparar);
document.addEventListener('focusout', e => {
  if (e.target.form && e.target.matches('input,textarea,select')) revisar(e.target.form, false, e.target);
});
document.addEventListener('input', e => {
  const el = e.target;
  if (el.form && el.matches('input,textarea,select') && el.getAttribute('aria-invalid') === 'true') revisar(el.form, false, el);
});
document.addEventListener('reset', e => {
  setTimeout(() => [...e.target.elements].filter(el => el.matches('input:not([type=hidden]),select,textarea')).forEach(el => errorCampo(el, '')), 0);
}, true);
function resumenFormulario(form) {
  const filas = [];
  for (const el of visibles(form)) {
    const clave = claveDe(el);
    if (el.type === 'password' || /contrasena|cvv|codigo/.test(clave) || ['checkbox', 'radio'].includes(el.type)) continue;
    const etiqueta = el.labels?.[0]?.textContent.trim() || clave;
    const valor = clave === 'numero' ? enmascararTarjeta(el.value) : el.tagName === 'SELECT'
      ? el.selectedOptions[0]?.textContent : el.value;
    if (valor) filas.push([etiqueta, valor]);
  }
  if (form.id === 'form-tarjeta' || form.id === 'form-billetera') {
    const r = document.getElementById('registro');
    filas.unshift(['Solicitud', r.selectedOptions[0]?.textContent]);
    filas.push(['Total', document.getElementById('resumen-monto').textContent]);
  } else if (form.id === 'form-cobro') {
    filas.unshift(['Solicitud', document.getElementById('cobro-codigo').textContent], ['Total', document.getElementById('cobro-total').textContent]);
    if (form.elements.metodo.value === 'efectivo') filas.push(['Vuelto', document.getElementById('vuelto').textContent]);
  } else if (form.elements.paginas && !form.elements.paginas.matches(':disabled')) {
    filas.push(['Total calculado', `S/ ${(24 + 6 * Math.max(Number(form.elements.paginas.value) - 2, 0)).toFixed(2)}`]);
  }
  return filas;
}
function configuracion(form) {
  const cuenta = form.id === 'form-registro' && location.pathname.endsWith('/login.html');
  if (cuenta) return ['Crear tu cuenta', 'Confirma tus datos para registrar una cuenta de cliente.', 'Sí, crear cuenta'];
  if (['form-tarjeta', 'form-billetera', 'form-cobro'].includes(form.id)) return ['Confirmar pago', 'Revisa la solicitud, el medio y el importe. El pago se procesa en el entorno simulado de la práctica.', 'Sí, confirmar pago'];
  if (['form-actualizar', 'form-editar'].includes(form.id)) return ['Guardar cambios', 'Revisa los datos antes de actualizar la solicitud.', 'Sí, guardar cambios'];
  if (['form-registro', 'form-crear', 'form-actualizar', 'form-editar'].includes(form.id)) return ['Registrar solicitud', 'Confirma los datos y el monto calculado para agendar la solicitud.', 'Sí, registrar'];
  if (form.closest('body') && location.pathname.endsWith('/contacto.html')) return ['Confirmar mensaje de prueba', 'Este formulario es una demostración: no envía correos ni registra un reclamo oficial.', 'Confirmar demostración'];
  return null;
}
const huella = form => JSON.stringify(visibles(form).map(el => [claveDe(el), el.value, el.checked])) + (document.getElementById('registro')?.value || '');
document.addEventListener('submit', async e => {
  const form = e.target;
  if (!(form instanceof HTMLFormElement)) return;
  if (autorizados.has(form)) { autorizados.delete(form); return; }
  e.preventDefault();
  e.stopImmediatePropagation();
  if (esperando.has(form) || form.getAttribute('aria-busy') === 'true') return;
  if (!revisar(form)) return;
  const config = configuracion(form);
  if (!config) {
    autorizados.add(form);
    form.requestSubmit(e.submitter || undefined);
    return;
  }
  esperando.add(form);
  const submitter = e.submitter;
  const original = huella(form);
  try {
    const ok = await window.SunarpUI.confirmar({ titulo: config[0], texto: config[1], boton: config[2], filas: resumenFormulario(form) });
    if (!ok) return;
    if (huella(form) !== original || !revisar(form)) {
      await window.SunarpUI.notificar('Revisa los datos', 'Los datos cambiaron. Vuelve a revisar y confirmar antes de continuar.', 'error');
      return;
    }
    if (location.pathname.endsWith('/contacto.html')) {
      await window.SunarpUI.notificar('Demostración completada', 'El mensaje es válido. No se envió a SUNARP ni se guardó como reclamo oficial.');
      return;
    }
    autorizados.add(form);
    form.requestSubmit(submitter?.isConnected ? submitter : undefined);
  } finally { esperando.delete(form); }
}, true);
