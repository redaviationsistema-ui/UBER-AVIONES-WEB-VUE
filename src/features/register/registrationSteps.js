export const roleLabels = {
  client: 'Cliente',
  provider: 'Operador',
  sobrecargo: 'Sobrecargo',
}

export const allowedRoles = Object.keys(roleLabels)

const baseSteps = {
  rol: {
    id: 'rol',
    title: 'Rol de acceso',
    description: 'Define a que vista entrara despues de iniciar sesion.',
  },
  perfil: {
    id: 'perfil',
    title: 'Datos del usuario / Identificacion',
    description: 'Captura los datos base y escanea la identificacion dentro de la misma pantalla.',
  },
  acceso: {
    id: 'acceso',
    title: 'Correo / Contrasena',
    description: 'Define el correo de acceso y crea la contrasena para iniciar sesion.',
  },
}

export function buildRegistrationSteps(role = 'client') {
  const normalizedRole = allowedRoles.includes(role) ? role : 'client'
  const stepOrder = normalizedRole ? ['rol', 'perfil', 'acceso'] : ['rol', 'perfil', 'acceso']

  return stepOrder.map((stepId, index) => ({
    ...baseSteps[stepId],
    eyebrow: `Paso ${index + 1}`,
  }))
}

export const registrationSteps = buildRegistrationSteps('client')

export const clientAccessPreview = [
  'Acceso inmediato al cotizador de vuelos como prueba.',
  'Ruta directa a reservar desde el portal del cliente.',
  'Membresia disponible por USD $115 para activar beneficios premium.',
]
