import { iniciarSesion, registrarUsuario } from './auth.js';

const $ = (id) => document.getElementById(id);
const msg = $('msg');

function aviso(texto = '', tipo = '') {
  msg.textContent = texto;
  msg.className = `msg ${tipo}`.trim();
}

function mostrarPestana(esLogin) {
  $('tab-login').classList.toggle('activo', esLogin);
  $('tab-registro').classList.toggle('activo', !esLogin);
  $('form-login').classList.toggle('activo', esLogin);
  $('form-registro').classList.toggle('activo', !esLogin);
  aviso();
}

$('tab-login').addEventListener('click', () => mostrarPestana(true));
$('tab-registro').addEventListener('click', () => mostrarPestana(false));

$('form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  aviso('Verificando datos...');

  try {
    const usuario = await iniciarSesion(
      $('correo-login').value,
      $('contrasena-login').value
    );

    if (!usuario) {
      aviso('Correo o contraseña incorrectos.', 'error');
      return;
    }

    aviso(`Bienvenido, ${usuario.nombre}.`, 'ok');
    window.location.href = usuario.rol === 'cliente' ? 'citas.html' : 'panel.html';
  } catch (error) {
    console.error(error);
    aviso('No se pudo conectar con la base de datos. Revisa Neon y la conexión.', 'error');
  }
});

$('form-registro').addEventListener('submit', async (e) => {
  e.preventDefault();

  const nombre = $('nombre-registro').value.trim();
  const correo = $('correo').value.trim();
  const c1 = $('contrasena').value;
  const c2 = $('contrasena2').value;

  if (c1 !== c2) {
    aviso('Las contraseñas no coinciden.', 'error');
    return;
  }

  aviso('Creando cuenta...');
  try {
    await registrarUsuario(nombre, correo, c1);
    $('form-registro').reset();
    mostrarPestana(true);
    $('correo-login').value = correo;
    aviso('Cuenta creada con rol cliente. Ya puedes iniciar sesión.', 'ok');
  } catch (error) {
    console.error(error);
    aviso(error.message || 'No se pudo crear la cuenta.', 'error');
  }
});
