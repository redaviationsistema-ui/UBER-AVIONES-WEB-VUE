<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import ClientLoginView from './ClientLoginView.vue'

const route = useRoute()

const loginMode = computed(() => {
  const requestedRole = String(route.query.role || '').trim().toLowerCase()

  if (requestedRole === 'admin') {
    return {
      loginRole: 'admin',
      postLoginRedirect: '/admin/ejecutivo',
    }
  }

  if (['sobrecargo', 'crew', 'cabina'].includes(requestedRole)) {
    return {
      loginRole: 'sobrecargo',
      postLoginRedirect: '/sobrecargo/dashboard',
    }
  }

  return {
    loginRole: 'provider',
    postLoginRedirect: '/operador/dashboard',
  }
})
</script>

<template>
  <ClientLoginView
    :login-role="loginMode.loginRole"
    registration-role="client"
    :post-login-redirect="loginMode.postLoginRedirect"
  />
</template>
