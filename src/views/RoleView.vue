<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import RoleWorkspace from '../components/RoleWorkspace.vue'
import { roles } from '../data/platform'
import { resolveSection } from '../data/roleFlows'

const route = useRoute()

const routeToRole = {
  cliente: 'client',
  'cliente-detalle': 'client',
  'cliente-subdetalle': 'client',
  operador: 'operator',
  crew: 'crew',
  admin: 'admin',
}

const activeRole = computed(() => routeToRole[route.name] ?? 'client')
const role = computed(() => roles.find((item) => item.id === activeRole.value) ?? roles[0])
const section = computed(() => {
  const rawSection = String(route.params.section || '')

  if (activeRole.value === 'admin' && rawSection === 'dashboard') {
    return 'ejecutivo'
  }

  return resolveSection(activeRole.value, rawSection)
})
</script>

<template>
  <RoleWorkspace :active-role="activeRole" :role="role" :section="section" />
</template>
