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
    title: 'Datos del usuario / Biometria',
    description: 'Captura tus datos, abre camara, valida el rostro en backend y registra la selfie.',
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
  'Acceso inmediato a una cotizacion gratis al terminar el registro.',
  'La selfie biometrica queda lista para que el backend guarde foto o plantilla.',
  'Despues puedes activar la membresia mensual de USD $115 para operar la cuenta.',
]
