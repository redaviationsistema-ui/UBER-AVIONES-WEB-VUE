<script setup>
import ClientLoginView from './ClientLoginView.vue'
</script>

<template>
  <ClientLoginView
    login-role="provider"
    registration-role="client"
    post-login-redirect="/operador/dashboard"
  />
</template>
