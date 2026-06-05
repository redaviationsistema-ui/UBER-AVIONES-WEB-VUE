<script setup>
import RoleWorkspace from '../components/RoleWorkspace.vue'
import { roles } from '../data/platform'

const role = roles.find((item) => item.id === 'crew') || roles[0]
</script>

<template>
  <RoleWorkspace active-role="crew" :role="role" section="disponibilidad" />
</template>
