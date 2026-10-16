const form = document.getElementById('form-consulta-partida');
const resultado = document.getElementById('resultado-consulta');
const resultadoCodigo = document.getElementById('resultado-codigo');
const resultadoDetalle = document.getElementById('resultado-detalle');
const btnNuevaConsulta = document.getElementById('btn-nueva-consulta');

const etiquetasTipo = {
  'propiedad-inmueble': 'Propiedad inmueble (predios)',
  'propiedad-vehicular': 'Propiedad vehicular',
  'personas-juridicas': 'Personas jurídicas',
  'personas-naturales': 'Personas naturales / mandatos y poderes',
  'bienes-muebles': 'Bienes muebles'
};

const etiquetasOficina = {
  lima: 'Zona Registral IX — Lima',
  arequipa: 'Zona Registral XII — Arequipa',
  trujillo: 'Zona Registral V — Trujillo',
  cusco: 'Zona Registral X — Cusco',
  huancayo: 'Zona Registral VII — Huancayo'
};

const etiquetasConsulta = {
  vigencia: 'Consulta preliminar de titularidad',
  'cargas-gravamenes': 'Cargas y gravámenes',
  'copia-literal': 'Copia literal completa'
};

const costos = {
  vigencia: 'S/ 4.00',
  'cargas-gravamenes': 'S/ 6.50',
  'copia-literal': 'S/ 12.00'
};

function escapar(texto) {
  return String(texto ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function generarCodigo() {
  const fecha = new Date();
  const parteFecha = [
    fecha.getFullYear(),
    String(fecha.getMonth() + 1).padStart(2, '0'),
    String(fecha.getDate()).padStart(2, '0')
  ].join('');
  const parteTiempo = Date.now().toString().slice(-6);
  return `CONS-${parteFecha}-${parteTiempo}`;
}

form.addEventListener('submit', (event) => {
  event.preventDefault();

  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const datos = new FormData(form);
  const tipo = datos.get('tipo-registro');
  const numero = String(datos.get('numero-partida') || '').trim();
  const oficina = datos.get('oficina-registral');
  const tipoConsulta = datos.get('tipo-consulta');
  const correo = String(datos.get('correo') || '').trim();
  const codigo = generarCodigo();

  resultadoCodigo.textContent = codigo;
  resultadoDetalle.replaceChildren();
  const lista = document.createElement('dl');
  lista.className = 'resultado-consulta__datos';
  const campos = [
    ['Tipo de registro', etiquetasTipo[tipo] || tipo],
    ['Número de partida', numero],
    ['Oficina registral', etiquetasOficina[oficina] || oficina],
    ['Tipo de consulta', etiquetasConsulta[tipoConsulta] || tipoConsulta],
    ['Costo referencial', costos[tipoConsulta] || '—'],
    ['Correo', correo]
  ];
  for (const [etiqueta, valor] of campos) {
    const grupo = document.createElement('div');
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = etiqueta;
    dd.textContent = valor;
    grupo.append(dt, dd);
    lista.append(grupo);
  }
  resultadoDetalle.append(lista);

  resultado.hidden = false;

  // Evita que los datos del formulario aparezcan en la URL.
  history.replaceState(null, '', `${window.location.pathname}#resultado-consulta`);
  resultado.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

btnNuevaConsulta.addEventListener('click', () => {
  form.reset();
  resultado.hidden = true;
  history.replaceState(null, '', window.location.pathname);
  document.getElementById('tipo-registro').focus();
});
