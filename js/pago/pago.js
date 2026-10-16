import { exigirRol } from '../auth/auth.js';
import { formatearSoles } from '../registro/tarifario.js';
import { $, iniciarInterfaz, errorAmigable } from '../comun/ui.js';
import {
  soloDigitos, enmascararTarjeta, formatearNumeroTarjeta, formatearVencimiento,
  detectarMarca, validarFormularioTarjeta, validarCelular, validarCodigoAprobacion
} from './validaciones.js';
import { obtenerRegistro, listarPendientesCliente, pagarConTarjeta, pagarConBilletera } from './pasarela.js';

const usuario = exigirRol('cliente');
if (!usuario) throw new Error('Acceso denegado');
iniciarInterfaz(usuario);
const formTarjeta = $('form-tarjeta');
const formBilletera = $('form-billetera');
const selectRegistro = $('registro');
let registroActual = null;
let ocupado = false;
let versionSeleccion = 0;

function mostrarMensaje(texto, tipo = 'info') {
  $('mensaje-pago').textContent = texto;
  $('mensaje-pago').className = `mensaje mensaje--${tipo}`;
}

function mostrarError(campo, texto = '') {
  $(`error-${campo}`).textContent = texto;
  $(campo).setAttribute('aria-invalid', texto ? 'true' : 'false');
}

function mostrarMetodo() {
  const hayPendiente = registroActual?.estado_pago === 'pendiente';
  const metodo = document.querySelector('input[name="metodo"]:checked').value;
  formTarjeta.hidden = !hayPendiente || metodo !== 'tarjeta';
  formBilletera.hidden = !hayPendiente || metodo !== 'billetera';
}

async function seleccionarRegistro() {
  const version = ++versionSeleccion;
  registroActual = null;
  mostrarMetodo();
  if (!selectRegistro.value) {
    $('resumen-monto').textContent = '—';
    $('resumen-paginas').textContent = '';
    return;
  }
  const r = await obtenerRegistro(Number(selectRegistro.value), usuario.id);
  if (version !== versionSeleccion) return;
  registroActual = r;
  $('resumen-monto').textContent = r ? formatearSoles(r.monto_calculado) : '—';
  $('resumen-paginas').textContent = r ? `${r.paginas} página(s) · Expedición de vigencia de poder` : '';
  mostrarMetodo();
}

async function cargarPendientes() {
  const pendientes = await listarPendientesCliente(usuario.id);
  selectRegistro.replaceChildren(new Option('Selecciona una solicitud', ''));
  for (const p of pendientes) {
    selectRegistro.add(new Option(`${p.codigo_seguimiento} — ${formatearSoles(p.monto_calculado)}`, p.id));
  }
  const id = new URLSearchParams(location.search).get('id');
  if (id && pendientes.some((p) => String(p.id) === id)) selectRegistro.value = id;
  if (!pendientes.length) {
    registroActual = null;
    $('resumen-monto').textContent = '—';
    mostrarMetodo();
    mostrarMensaje('No tienes solicitudes pendientes de pago. Revisa Mis solicitudes para consultar tus comprobantes.');
    return;
  }
  if (id && !pendientes.some((p) => String(p.id) === id)) {
    mostrarMensaje('La solicitud del enlace ya no está pendiente o no pertenece a tu cuenta. Elige otra explícitamente o revisa Mis solicitudes.', 'error');
  }
  await seleccionarRegistro();
}

function vista() {
  const marca = detectarMarca($('numero').value);
  $('marca-detectada').textContent = marca ?? 'Marca no reconocida';
  $('vista-marca').textContent = marca ?? 'Tarjeta de prueba';
  $('vista-numero').textContent = soloDigitos($('numero').value)
    ? enmascararTarjeta($('numero').value) : '**** **** **** ****';
  $('vista-titular').textContent = $('titular').value.toUpperCase() || 'NOMBRE DEL TITULAR';
  $('vista-vencimiento').textContent = $('vencimiento').value || 'MM/AA';
  $('cvv').maxLength = marca === 'American Express' ? 4 : 3;
}

$('numero').addEventListener('input', () => {
  $('numero').value = formatearNumeroTarjeta($('numero').value);
  vista();
});
$('vencimiento').addEventListener('input', () => {
  $('vencimiento').value = formatearVencimiento($('vencimiento').value);
  vista();
});
$('titular').addEventListener('input', vista);
$('cvv').addEventListener('focus', () => $('vista-tarjeta').classList.add('girada'));
$('cvv').addEventListener('blur', () => $('vista-tarjeta').classList.remove('girada'));
$('visa-prueba').addEventListener('click', () => {
  const datos = { numero: '4111 1111 1111 1111', vencimiento: '12/29', cvv: '123', titular: 'ANA TORRES QUISPE' };
  for (const [campo, valor] of Object.entries(datos)) $(campo).value = valor;
  vista();
});

function bloquearPago(bloquear) {
  document.querySelectorAll('#form-tarjeta button, #form-billetera button, input[name="metodo"]')
    .forEach((el) => { el.disabled = bloquear; });
  selectRegistro.disabled = bloquear;
}

async function procesar(formulario, operacion) {
  if (ocupado) return;
  if (!registroActual || registroActual.estado_pago !== 'pendiente') {
    return mostrarMensaje('Selecciona una solicitud pendiente.', 'error');
  }
  ocupado = true;
  bloquearPago(true);
  mostrarMensaje('Consultando al emisor simulado y confirmando la transacción…');
  let aprobado = false;
  try {
    const resultado = await operacion();
    if (resultado.aprobado) {
      aprobado = true;
      registroActual.estado_pago = 'pagado';
      formulario.reset();
      $('cvv').value = '';
      $('codigo').value = '';
      mostrarMensaje(`Pago aprobado. Operación ${resultado.codigo}.`, 'exito');
      $('ver-comprobante').href = `comprobante.html?op=${encodeURIComponent(resultado.codigo)}`;
      $('ver-comprobante').hidden = false;
      mostrarMetodo();
      await window.SunarpUI.notificar('Pago aprobado', `Operación ${resultado.codigo}. Se registró el pago simulado. A continuación se abrirá tu comprobante.`);
      location.href = $('ver-comprobante').href;
    } else {
      mostrarMensaje(`Pago rechazado: ${resultado.motivo}`, 'error');
      await window.SunarpUI.notificar('Pago rechazado', resultado.motivo, 'error');
    }
  } catch (error) {
    mostrarMensaje(errorAmigable(error) + ' Revisa Mis solicitudes antes de reintentar.', 'error');
    await window.SunarpUI.notificar('No se pudo confirmar el pago', errorAmigable(error) + ' Revisa Mis solicitudes antes de reintentar.', 'error');
  } finally {
    ocupado = false;
    if (!aprobado) bloquearPago(false);
  }
}

formTarjeta.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (ocupado) return;
  const datos = Object.fromEntries(new FormData(formTarjeta));
  const validacion = validarFormularioTarjeta(datos);
  ['numero', 'vencimiento', 'cvv', 'titular'].forEach((campo) => mostrarError(campo, validacion.errores[campo]));
  if (!validacion.valido) {
    $(Object.keys(validacion.errores)[0]).focus();
    return;
  }
  await procesar(formTarjeta, () => pagarConTarjeta({
    registro: registroActual, usuario, numero: datos.numero,
    mes: validacion.venc.mes, anio: validacion.venc.anio,
    cvv: datos.cvv, marca: validacion.marca
  }));
});

formBilletera.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (ocupado) return;
  const datos = Object.fromEntries(new FormData(formBilletera));
  const celularOk = validarCelular(datos.celular);
  const codigoOk = validarCodigoAprobacion(datos.codigo);
  mostrarError('celular', celularOk ? '' : 'Ingresa un celular de 9 dígitos que empiece con 9.');
  mostrarError('codigo', codigoOk ? '' : 'Ingresa el código de 6 dígitos.');
  if (!celularOk || !codigoOk) return;
  await procesar(formBilletera, () => pagarConBilletera({
    registro: registroActual, usuario, proveedor: datos.proveedor,
    celular: datos.celular, codigoAprobacion: datos.codigo
  }));
});

document.querySelectorAll('input[name="metodo"]').forEach((r) => r.addEventListener('change', mostrarMetodo));
selectRegistro.addEventListener('change', () => seleccionarRegistro().catch((e) => mostrarMensaje(errorAmigable(e), 'error')));
mostrarMetodo();
cargarPendientes().catch((e) => mostrarMensaje(errorAmigable(e), 'error'));
