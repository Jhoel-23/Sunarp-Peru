import { sql } from '../config/neon-config.js';

const SESION_CLAVE = 'usuario';

export async function registrarUsuario(nombre, correo, contrasena) {
  correo = correo.trim().toLowerCase();
  nombre = nombre.trim();

  const existente = await sql`
    SELECT id FROM usuarios WHERE LOWER(correo) = ${correo} LIMIT 1;
  `;
  if (existente.length > 0) {
    throw new Error('Ese correo ya está registrado.');
  }

  const filas = await sql`
    INSERT INTO usuarios (nombre, correo, contrasena, rol)
    VALUES (${nombre}, ${correo}, ${contrasena}, 'cliente')
    RETURNING id, nombre, correo, rol, turno;
  `;
  return filas[0];
}

export async function iniciarSesion(correo, contrasena) {
  correo = correo.trim().toLowerCase();

  const filas = await sql`
    SELECT id, nombre, correo, rol, turno
    FROM usuarios
    WHERE LOWER(correo) = ${correo}
      AND contrasena = ${contrasena}
    LIMIT 1;
  `;

  if (filas.length === 0) return null;

  sessionStorage.setItem(SESION_CLAVE, JSON.stringify(filas[0]));
  return filas[0];
}

export function obtenerSesion() {
  try {
    const valor = sessionStorage.getItem(SESION_CLAVE);
    return valor ? JSON.parse(valor) : null;
  } catch {
    return null;
  }
}

export function exigirSesion(rolesPermitidos = []) {
  const usuario = obtenerSesion();
  if (!usuario) {
    window.location.href = 'login.html';
    return null;
  }

  if (rolesPermitidos.length > 0 && !rolesPermitidos.includes(usuario.rol)) {
    window.location.href = usuario.rol === 'cliente' ? 'citas.html' : 'panel.html';
    return null;
  }

  return usuario;
}

export function cerrarSesion() {
  sessionStorage.removeItem(SESION_CLAVE);
  window.location.href = 'login.html';
}
