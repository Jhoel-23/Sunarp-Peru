// Caso 24: expedición de vigencia de poder.
export function redondear(valor) {
  return Math.round(valor * 100) / 100;
}

export function formatearSoles(monto) {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN'
  }).format(Number(monto));
}

export function calcularMontoServicio(d) {
  const adicionales = Math.max(0, (Number(d.paginas) || 0) - 2);
  return redondear(24.00 + 6.00 * adicionales);
}

export function paginasValidas(valor) {
  const paginas = Number(valor);
  return String(valor).trim() !== '' && Number.isSafeInteger(paginas) && paginas >= 1;
}
