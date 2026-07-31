import conciergeAvatar from '../../../assets/concierge-avatar.svg'

export function buildConciergeConfig({
  customerName = 'Cliente',
  conciergeName = 'Carlos',
} = {}) {
  return {
    aria: {
      close: 'Cerrar concierge',
      drawer: 'Panel concierge',
      scheduleModal: 'Agendar llamada con concierge',
      chatWidget: 'Chat concierge',
    },
    header: {
      badge: 'CONCIERGE 24/7',
      subtitle: 'Tu asistente de viaje personal',
      icon: 'concierge',
    },
    profile: {
      avatarUrl: conciergeAvatar,
      greeting: `Hola, ${customerName}`,
      assistantLabel: 'Estamos para ayudarte',
      availabilityLabel: 'Disponible ahora',
      responseLabel: 'Tiempo promedio de respuesta',
      responseValue: '< 2 minutos',
      conciergeName,
    },
    communication: {
      title: '¿CÓMO DESEAS COMUNICARTE?',
      options: [
        {
          id: 'chat',
          icon: 'chat',
          title: 'Chat en vivo',
          subtitle: 'Escríbenos',
          action: 'chat',
        },
        {
          id: 'whatsapp',
          icon: 'whatsapp',
          title: 'WhatsApp',
          subtitle: 'Respuesta inmediata',
          action: 'whatsapp',
        },
        {
          id: 'call',
          icon: 'phone',
          title: 'Llamar ahora',
          subtitle: 'Asesor inmediato',
          action: 'call',
        },
        {
          id: 'schedule',
          icon: 'calendar',
          title: 'Agendar llamada',
          subtitle: 'Te contactamos',
          action: 'schedule',
        },
      ],
    },
    services: {
      title: 'SERVICIOS CONCIERGE',
      items: [
        { id: 'flight', icon: 'plane', title: 'Reservar vuelo', subtitle: 'Cotización personalizada' },
        { id: 'modify', icon: 'refresh', title: 'Modificar reserva', subtitle: 'Cambios en itinerario' },
        { id: 'catering', icon: 'catering', title: 'Catering a bordo', subtitle: 'Menús gourmet' },
        { id: 'ground', icon: 'car', title: 'Transporte terrestre', subtitle: 'SUV, blindados y chofer' },
        { id: 'helicopter', icon: 'helicopter', title: 'Helicóptero', subtitle: 'Traslados rápidos' },
        { id: 'hotels', icon: 'hotel', title: 'Hoteles y Villas', subtitle: 'Hospedaje premium' },
        { id: 'vip', icon: 'vip', title: 'Experiencias VIP', subtitle: 'Eventos, golf y restaurantes' },
        { id: 'yachts', icon: 'yacht', title: 'Yates', subtitle: 'Renta y experiencias' },
      ],
    },
    footer: {
      items: [
        {
          id: 'global',
          icon: 'globe',
          title: 'Atención internacional',
          subtitle: '24 horas / 7 días',
        },
        {
          id: 'languages',
          icon: 'language',
          title: 'Idiomas disponibles',
          languages: ['ES', 'EN', 'FR'],
        },
      ],
    },
    channels: {
      whatsappNumber: '525500000000',
      whatsappMessage: 'Hola, necesito asistencia para un vuelo privado.',
      phoneNumber: '+525500000000',
    },
    chat: {
      title: 'Chat concierge',
      subtitle: 'Canal premium abierto',
      initialMessages: [
        {
          id: 'welcome',
          role: 'assistant',
          body: 'Hola, ya estoy listo para ayudarte con vuelos privados, catering, traslados o experiencias VIP.',
          timestamp: 'Ahora',
        },
      ],
      composerPlaceholder: 'Escribe tu solicitud al concierge',
      sendLabel: 'Enviar',
      responseTemplate:
        'Recibí tu solicitud. Estoy coordinando un concierge para darte seguimiento de inmediato.',
    },
    schedule: {
      title: 'Agendar llamada',
      subtitle: 'Selecciona una fecha para que te contactemos',
      fields: {
        date: 'Fecha',
        time: 'Hora',
        topic: 'Motivo',
      },
      topicOptions: [
        { value: 'flight', label: 'Reservar vuelo' },
        { value: 'modify', label: 'Modificar reserva' },
        { value: 'vip', label: 'Experiencias VIP' },
        { value: 'other', label: 'Otro servicio' },
      ],
      submitLabel: 'Confirmar llamada',
      cancelLabel: 'Cancelar',
      confirmationTitle: 'Llamada agendada',
      confirmationMessage: 'Tu concierge te contactará en el horario solicitado.',
    },
  }
}
