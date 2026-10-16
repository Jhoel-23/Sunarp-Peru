import {
  iniciarSesion,
  registrarUsuario,
  rutaInicioSegunRol
} from './auth.js';
const $ = (id) => document.getElementById(id);
const msg = $('msg');
let ocupado = false;
function espera(form, activo, texto) {
  ocupado = activo;
  document.querySelectorAll('.tabs button').forEach(b => b.disabled = activo);
  const b = form.querySelector('button[type="submit"]');
  b.disabled = activo;
  b.classList.toggle('cargando', activo);
  form.setAttribute('aria-busy', String(activo));
  b.textContent = texto;
}
$('ver-clave').addEventListener('click', () => {
  const ver = $('contrasena-login').type === 'password';
  $('contrasena-login').type = ver ? 'text' : 'password';
  $('ver-clave').textContent = ver ? 'Ocultar contraseña' : 'Mostrar contraseña';
  $('ver-clave').setAttribute('aria-pressed', String(ver));
});
function aviso(texto = '', tipo = '') {
  msg.textContent = texto;
  msg.className = `msg ${tipo}`.trim();
  if (tipo === 'error') {
    const main = document.querySelector('main');
    main.classList.remove('error-animado');
    void main.offsetWidth;
    main.classList.add('error-animado');
  }
}
function mostrarPestana(esLogin) {
  $('tab-login').classList.toggle('activo', esLogin);
  $('tab-registro').classList.toggle('activo', ! esLogin);
  $('form-login').classList.toggle('activo', esLogin);
  $('form-registro').classList.toggle('activo', ! esLogin);
  $('tab-login').setAttribute('aria-selected', String(esLogin));
  $('tab-registro').setAttribute('aria-selected', String(! esLogin));
  aviso();
}
$('tab-login').addEventListener('click', () => mostrarPestana(true));
$('tab-registro').addEventListener('click', () => mostrarPestana(false));
$('form-login').addEventListener('submit', async(e) => {
  e.preventDefault();
  if (ocupado) return;
  espera(e.currentTarget, true, 'Ingresando…');
  aviso('Verificando datos...');
  mostrarTransicion();
  let accesoCorrecto = false;
  try {
    const usuario = await iniciarSesion($('correo-login').value, $('contrasena-login').value);
    if (! usuario) {
      aviso('Correo o contraseña incorrectos.', 'error');
      return;
    }
    aviso(`Bienvenido, ${usuario.nombre}.`, 'ok');
    accesoCorrecto = true;
    $('transicion-login').classList.add('acceso-confirmado');
    $('titulo-transicion').textContent = `Bienvenido, ${usuario.nombre}`;
    $('detalle-transicion').textContent = 'Tu sesión está lista.';
    $('estado-transicion').textContent = usuario.rol === 'cliente'
      ? 'Abriendo tus solicitudes…' : usuario.rol === 'cajero'
      ? 'Abriendo Caja…' : 'Abriendo Gestión…';
    const reducir = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    await new Promise(resolve => setTimeout(resolve, reducir ? 150 : 1000));
    window.location.href = rutaInicioSegunRol(usuario.rol);
  } catch (error) {
    console.error(error);
    aviso('No se pudo conectar con la base de datos. Revisa Neon y la conexión.', 'error');
  } finally {
    if (!accesoCorrecto) {
      $('transicion-login').hidden = true;
      $('acceso').inert = false;
      espera($('form-login'), false, 'Entrar');
    }
  }
});
$('form-registro').addEventListener('submit', async(e) => {
  e.preventDefault();
  if (ocupado) return;
  const nombre = $('nombre-registro').value.trim();
  const correo = $('correo').value.trim();
  const c1 = $('contrasena').value;
  const c2 = $('contrasena2').value;
  if (! nombre) {
    aviso('Ingresa tu nombre completo.', 'error');
    return;
  }
  if (c1 !== c2) {
    aviso('Las contraseñas no coinciden.', 'error');
    return;
  }
  espera(e.currentTarget, true, 'Creando cuenta…');
  aviso('Creando cuenta...');
  try {
    await registrarUsuario(nombre, correo, c1);
    $('form-registro').reset();
    mostrarPestana(true);
    $('correo-login').value = correo;
    aviso('Cuenta creada con rol cliente. Ya puedes iniciar sesión.', 'ok');
    await window.SunarpUI.notificar('Cuenta creada', 'Tu cuenta de cliente se registró correctamente. Ya puedes iniciar sesión.');
  } catch (error) {
    console.error(error);
    aviso(error.message || 'No se pudo crear la cuenta.', 'error');
  } finally {
    espera($('form-registro'), false, 'Registrarme');
  }
});

function mostrarTransicion() {
  const capa = $('transicion-login');
  capa.classList.remove('acceso-confirmado');
  $('titulo-transicion').textContent = 'Verificando acceso';
  $('detalle-transicion').textContent = 'Estamos comprobando tus credenciales.';
  $('estado-transicion').textContent = 'Conectando con el sistema…';
  $('acceso').inert = true;
  capa.hidden = false;
}
