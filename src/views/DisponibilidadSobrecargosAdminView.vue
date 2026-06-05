<script setup>
import RoleWorkspace from '../components/RoleWorkspace.vue'
import { roles } from '../data/platform'

const role = roles.find((item) => item.id === 'admin') || roles[0]
</script>

<template>
  <RoleWorkspace active-role="admin" :role="role" section="disponibilidad" />
</template>
