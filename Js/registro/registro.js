import { sql } from '../config/neon-config.js';
import { exigirRol } from '../auth/auth.js';
import { $, iniciarInterfaz, mensaje, errorAmigable } from '../comun/ui.js';
import { calcularMontoServicio } from './tarifario.js';
import { leerFormulario, validarDatos, conectarCotizador } from './formulario.js';

const usuario = exigirRol('cliente');
if (!usuario) throw new Error('Acceso denegado');
iniciarInterfaz(usuario);
const form = $('form-registro');
conectarCotizador(form, $('registro-monto'));
form.elements.nombre.value = usuario.nombre;
form.elements.dni.value = usuario.dni ?? '';
let ocupado = false;

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (ocupado) return;
  const d = leerFormulario(form);
  if (!validarDatos(form, d)) {
    mensaje('mensaje-registro', 'Completa los datos y usa un número entero de páginas mayor o igual a 1.', 'error');
    return;
  }
  const monto = calcularMontoServicio(d);
  const codigo = 'SUN24-' + crypto.randomUUID().slice(0, 13).toUpperCase();
  ocupado = true;
  const b = form.querySelector('button[type="submit"]');
  b.disabled = true;
  mensaje('mensaje-registro', 'Guardando solicitud…');
  try {
    const filas = await sql`
      INSERT INTO citas_sunarp (
        codigo_seguimiento, nombre_usuario, dni, tipo_tramite, oficina,
        fecha_cita, horario, celular, id_usuario, estado, paginas, monto_calculado, estado_pago
      ) VALUES (
        ${codigo}, ${d.nombre}, ${d.dni}, 'Expedición de vigencia de poder', ${d.oficina},
        ${d.fecha}, ${d.hora}, ${d.celular}, ${usuario.id}, 'registrado',
        ${Number(d.paginas)}, ${monto}, 'pendiente'
      ) RETURNING id;
    `;
    await window.SunarpUI.notificar('Solicitud registrada', `Código ${codigo}. Tu solicitud se guardó correctamente. Ahora puedes elegir cómo pagar.`);
    location.href = `pago.html?id=${filas[0].id}`;
  } catch (error) {
    mensaje('mensaje-registro', errorAmigable(error), 'error');
    ocupado = false;
    b.disabled = false;
  }
});
