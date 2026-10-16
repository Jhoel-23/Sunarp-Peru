import { sql } from '../config/neon-config.js';

const CLAVE = 'usuario';
const ROLES = ['cliente', 'administrador', 'empleado', 'cajero'];

export function rutaInicioSegunRol(rol) {
  const rutas = {
    cliente: 'registro.html',
    administrador: 'panel.html',
    empleado: 'panel.html',
    cajero: 'caja.html'
  };
  return rutas[rol] ?? 'index.html';
}

export async function iniciarSesion(correo, contrasena) {
  const filas = await sql`
    SELECT id, nombre, correo, rol, turno, dni
    FROM usuarios
    WHERE LOWER(correo) = ${correo.trim().toLowerCase()}
      AND contrasena = ${contrasena}
    LIMIT 1;
  `;
  if (!filas.length || !ROLES.includes(filas[0].rol)) return null;
  sessionStorage.setItem(CLAVE, JSON.stringify(filas[0]));
  return filas[0];
}

export async function registrarUsuario(nombre, correo, contrasena) {
  nombre = nombre.trim();
  correo = correo.trim().toLowerCase();
  if (nombre.length < 3) throw new Error('Ingresa tu nombre completo.');
  const existentes = await sql`SELECT id FROM usuarios WHERE LOWER(correo) = ${correo}`;
  if (existentes.length) throw new Error('Ese correo ya está registrado.');
  const filas = await sql`
    INSERT INTO usuarios (nombre, correo, contrasena, rol)
    VALUES (${nombre}, ${correo}, ${contrasena}, 'cliente')
    RETURNING id;
  `;
  return filas[0];
}

export function obtenerSesion() {
  try {
    return JSON.parse(sessionStorage.getItem(CLAVE) || 'null');
  } catch {
    return null;
  }
}

export function exigirSesion(roles = []) {
  const usuario = obtenerSesion();
  if (!usuario || !ROLES.includes(usuario.rol)) {
    location.replace('login.html');
    return null;
  }
  if (roles.length && !roles.includes(usuario.rol)) {
    alert('Tu perfil no tiene acceso a esta página.');
    location.replace('index.html');
    return null;
  }
  return usuario;
}

export function exigirRol(...roles) {
  return exigirSesion(roles);
}

export function cerrarSesion() {
  sessionStorage.removeItem(CLAVE);
  location.href = 'login.html';
}
