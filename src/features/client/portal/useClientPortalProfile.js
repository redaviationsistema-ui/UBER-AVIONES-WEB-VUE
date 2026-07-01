import { computed } from 'vue'

function readProfileCandidate(...candidates) {
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined) continue

    if (Array.isArray(candidate)) {
      const normalized = candidate
        .map((item) => String(item || '').trim())
        .filter(Boolean)
      if (normalized.length) return normalized.join(', ')
      continue
    }

    if (typeof candidate === 'object') {
      continue
    }

    const normalized = String(candidate || '').trim()
    if (normalized) return normalized
  }

  return ''
}

export function useClientPortalProfile({ auth, hasActiveClientAccess, reservations, searchForm }) {
  const userFirstName = computed(() => {
    const rawName = auth.user?.name || auth.user?.company_name || auth.userName || ''
    const firstName = String(rawName).trim().split(/\s+/)[0] || ''
    return firstName ? firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase() : ''
  })

  const profileDisplayName = computed(
    () => auth.user?.name || auth.user?.company_name || auth.userName || 'Cliente privado',
  )

  const profileInitials = computed(() =>
    String(profileDisplayName.value || '')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0] || '')
      .join('')
      .toUpperCase() || 'CP',
  )

  const clientProfileRecord = computed(() => ({
    ...(auth.access?.profile || {}),
    ...(auth.user?.profile || {}),
    ...(auth.user || {}),
  }))

  const profilePhone = computed(() =>
    readProfileCandidate(
      clientProfileRecord.value.phone,
      clientProfileRecord.value.telefono,
      auth.access?.phone,
    ) || 'Por completar',
  )

  const profileEmail = computed(() =>
    readProfileCandidate(clientProfileRecord.value.email, auth.access?.email) || 'Por completar',
  )

  const otherSectionCardCopy = computed(() => ({
    primaryEyebrow: 'Reserva activa',
    primaryTitle: 'Tu cuenta ya puede buscar y cotizar',
    primaryText:
      'Centraliza rutas, preferencias y seguimiento sin depender de una vista adicional.',
    secondaryEyebrow: 'Siguiente paso',
    secondaryTitle: 'Vuelve al cotizador',
    secondaryText:
      'Usa el flujo de reserva para crear nuevas solicitudes y revisar tus vuelos vigentes.',
  }))

  const profileStats = computed(() => [
    {
      label: 'Vuelos',
      value: String(reservations.value.length || 0),
      caption: reservations.value.length ? 'Historial total' : 'Sin vuelos registrados',
    },
    {
      label: 'Viajeros',
      value: String(Math.max(1, Number(auth.user?.traveler_count || searchForm.passengers || 1))),
      caption:
        Math.max(1, Number(auth.user?.traveler_count || searchForm.passengers || 1)) === 1
          ? 'Viajero frecuente'
          : 'Viajeros frecuentes',
    },
    {
      label: 'Facturación',
      value: auth.user?.billing_email ? 'Configurada' : 'Pendiente',
      caption: auth.user?.billing_email ? 'Cuenta comercial' : 'Datos por completar',
    },
    {
      label: 'Concierge',
      value: hasActiveClientAccess.value ? 'Activo' : 'Disponible',
      caption: 'Atención premium',
    },
  ])

  return {
    otherSectionCardCopy,
    profileDisplayName,
    profileEmail,
    profileInitials,
    profilePhone,
    profileStats,
    userFirstName,
  }
}
