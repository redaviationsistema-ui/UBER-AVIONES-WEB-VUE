export const roleLabels = {
  client: 'Cliente',
  provider: 'Operador',
  sobrecargo: 'Sobrecargo',
}

export const allowedRoles = Object.keys(roleLabels)

export const registrationSteps = [
  {
    id: 'identificacion',
    title: 'Identificacion',
    eyebrow: 'Paso 1',
    description: 'Escanea la INE para obtener datos y dejarlos listos para revision.',
  },
  {
    id: 'cliente',
    title: 'Datos del cliente',
    eyebrow: 'Paso 2',
    description: 'Revisa y modifica la informacion principal obtenida del documento.',
  },
  {
    id: 'pasajeros',
    title: 'Pasajeros',
    eyebrow: 'Paso 3',
    description: 'Agrega los datos de quienes podran viajar dentro de la cuenta.',
  },
  {
    id: 'facturacion',
    title: 'Facturacion',
    eyebrow: 'Paso 4',
    description: 'Registra datos fiscales y uso CFDI para que el sistema pueda facturar.',
  },
  {
    id: 'rol',
    title: 'Rol de acceso',
    eyebrow: 'Paso 5',
    description: 'Define a que vista entrara despues de iniciar sesion.',
  },
  {
    id: 'credenciales',
    title: 'Contrasena',
    eyebrow: 'Paso 6',
    description: 'Crea las credenciales con las que iniciara sesion.',
  },
]

export const clientAccessPreview = [
  'Acceso inmediato al cotizador de vuelos como prueba.',
  'Ruta directa a reservar desde el portal del cliente.',
  'Membresia disponible por USD $115 para activar beneficios premium.',
]
