import { ref } from 'vue'
import { defineStore } from 'pinia'

let toastId = 0

export const useUiStore = defineStore('ui', () => {
  const toasts = ref([])

  function pushToast(toast) {
    const id = ++toastId
    toasts.value.push({
      id,
      tone: toast.tone || 'info',
      title: toast.title || 'Aviso',
      message: toast.message || '',
    })

    setTimeout(() => dismissToast(id), 3200)
    return id
  }

  function dismissToast(id) {
    toasts.value = toasts.value.filter((toast) => toast.id !== id)
  }

  return {
    toasts,
    pushToast,
    dismissToast,
  }
})
