export const roles = [
  { id: 'client', label: 'Cliente', area: 'Experiencia Red Aviation', tone: 'Privado' },
  { id: 'operator', label: 'Proveedor', area: 'Panel de flota y disponibilidad', tone: 'Blindado' },
  { id: 'crew', label: 'Sobrecargo', area: 'Portal operativo', tone: 'Operacional' },
  { id: 'admin', label: 'Admin', area: 'Control Red Aviation', tone: 'Ejecutivo' },
]

export const packages = [
  {
    name: 'Essential',
    price: '$249',
    cycle: 'mensual',
    badge: 'Acceso inicial',
    cta: 'Elegir Essential',
    limits: '5 solicitudes protegidas',
    benefits: ['Buscador premium', 'Chat protegido', 'Tracking de operacion'],
    locked: ['Matching prioritario', 'Reportes avanzados'],
  },
  {
    name: 'Business',
    price: '$490',
    cycle: 'mensual',
    badge: 'Escalable',
    cta: 'Elegir Business',
    limits: '15 solicitudes al mes',
    benefits: ['Sky Group Verified', 'Facturacion', 'Historial de solicitudes'],
    locked: ['Concierge dedicado', 'SLA Enterprise'],
  },
  {
    name: 'Pro',
    price: '$690',
    cycle: 'mensual',
    badge: 'Popular',
    cta: 'Subir a Pro',
    limits: 'Operaciones ilimitadas razonables',
    benefits: ['Matching prioritario', 'Concierge Sky Group', 'Rutas internacionales'],
    locked: ['Multiempresa avanzado'],
  },
  {
    name: 'Elite / Enterprise',
    price: 'A medida',
    cycle: 'anual',
    badge: 'Corporativo',
    cta: 'Solicitar Elite',
    limits: 'Usuarios y reglas personalizadas',
    benefits: ['SLA premium', 'NDA digital', 'Auditoria y reportes ejecutivos'],
    locked: [],
  },
]

export const anonymizedAircraft = [
  {
    code: 'RA-VX01',
    category: 'Light Jet',
    capacity: '6 pax',
    range: '2,900 km',
    eta: '18 min',
    status: 'Sky Group Verified',
    image:
      'https://images.unsplash.com/photo-1540962351504-03099e0a754b?auto=format&fit=crop&w=1200&q=82',
  },
  {
    code: 'RA-MD24',
    category: 'Midsize Jet',
    capacity: '8 pax',
    range: '4,600 km',
    eta: '24 min',
    status: 'Operacion protegida',
    image:
      'https://images.unsplash.com/photo-1512289984044-071903207f5e?auto=format&fit=crop&w=1200&q=82',
  },
  {
    code: 'RA-LR77',
    category: 'Long Range',
    capacity: '12 pax',
    range: '7,200 km',
    eta: '32 min',
    status: 'Red certificada',
    image:
      'https://images.unsplash.com/photo-1521727857535-28d2047314ac?auto=format&fit=crop&w=1200&q=82',
  },
]

export const fallbackClientMetrics = {
  solicitudes: 3,
  operaciones_activas: 1,
}

export const fallbackClientRequests = [
  {
    id: 1048,
    origin: 'MTY',
    destination: 'TLC',
    departure_datetime: '2026-04-29 18:30',
    departure_date: '2026-04-29',
    passengers: 6,
    workflow_status: 'Matching en proceso',
  },
  {
    id: 1052,
    origin: 'CUN',
    destination: 'MIA',
    departure_datetime: '2026-04-30 09:00',
    departure_date: '2026-04-30',
    passengers: 8,
    workflow_status: 'Concierge asignado',
  },
  {
    id: 1060,
    origin: 'GDL',
    destination: 'SJD',
    departure_datetime: '2026-04-30 16:15',
    departure_date: '2026-04-30',
    passengers: 5,
    workflow_status: 'Operacion confirmada',
  },
]

export const fallbackOperatorMetrics = {
  aeronaves: 7,
  solicitudes_pendientes: 4,
}

export const fallbackOperatorRequests = [
  {
    id: 8841,
    origin: 'MTY',
    destination: 'TLC',
    departure_datetime: '2026-04-29 18:30',
    passengers: 6,
    workflow_status: 'Revision operativa',
  },
  {
    id: 8849,
    origin: 'CUN',
    destination: 'MIA',
    departure_datetime: '2026-04-30 09:00',
    passengers: 8,
    workflow_status: 'Slot internacional',
  },
  {
    id: 8855,
    origin: 'GDL',
    destination: 'SJD',
    departure_datetime: '2026-04-30 16:15',
    passengers: 5,
    workflow_status: 'Mascota autorizada',
  },
]

export const fallbackOperatorFleet = [
  { id: 201, model: 'Learjet 45XR', status: 'active' },
  { id: 204, model: 'Hawker 800XP', status: 'active' },
  { id: 217, model: 'Citation Latitude', status: 'maintenance' },
]

export const fallbackCrewMetrics = {
  asignaciones: 3,
  servicios_activos: 2,
}

export const fallbackCrewAssignments = [
  { id: 742, status: 'Briefing listo', created_at: 'Hoy 18:30' },
  { id: 755, status: 'Catering confirmado', created_at: 'Manana 09:00' },
  { id: 761, status: 'Checklist abierto', created_at: '30 Abr 16:15' },
]

export const fallbackAdminKpis = {
  mrr: '$128.6k',
  arr: '$1.54M',
  churn: '2.8%',
  conversion_a_pago: '38%',
  usuarios_activos: '1,284',
  riesgo_de_fuga: '7 alertas',
}

export const fallbackAdminFlags = [
  { id: 321, status: 'Intento de contacto externo detectado', created_at: '2026-04-29 09:10' },
  { id: 322, status: 'Validacion manual requerida', created_at: '2026-04-29 10:45' },
  { id: 323, status: 'Seguimiento prioritario', created_at: '2026-04-29 12:20' },
]

export const protectedRequests = [
  ['RAQ-1048', 'MTY -> TLC', 'Hoy 18:30', '6 pax', 'Matching en proceso'],
  ['RAQ-1052', 'CUN -> MIA', 'Manana 09:00', '8 pax', 'Concierge asignado'],
  ['RAQ-1060', 'GDL -> SJD', '30 Abr 16:15', '5 pax', 'Operacion confirmada'],
]

export const operatorBlindRequests = [
  ['BLIND-8841', 'MTY -> TLC', 'Hoy 18:30', '6 pax', 'Requisitos: catering ejecutivo'],
  ['BLIND-8849', 'CUN -> MIA', 'Manana 09:00', '8 pax', 'Requiere slot internacional'],
  ['BLIND-8855', 'GDL -> SJD', '30 Abr 16:15', '5 pax', 'Mascota autorizada'],
]

export const crewOperations = [
  ['OP-742', 'MTY -> TLC', '18:30', 'Briefing listo', 'Cabina pendiente'],
  ['OP-755', 'CUN -> MIA', '09:00', 'Catering confirmado', 'Documentos OK'],
  ['OP-761', 'GDL -> SJD', '16:15', 'VIP service', 'Checklist abierto'],
]

export const adminKpis = [
  ['MRR', '$128.6k', '+18%'],
  ['ARR', '$1.54M', '+22%'],
  ['Churn', '2.8%', '-0.7%'],
  ['Conversion a pago', '38%', '+9%'],
  ['Usuarios activos', '1,284', '+14%'],
  ['Riesgo de fuga', '7 alertas', 'Auditoria activa'],
]
