<script setup>
defineProps({
  name: { type: String, required: true },
  size: { type: [Number, String], default: 18 },
})
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" aria-hidden="true" class="crew-ui-icon">
    <path v-if="name === 'dashboard'" d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10v7H4V5.5ZM12 4h6.5A1.5 1.5 0 0 1 20 5.5V9h-8V4ZM4 13h6v7H5.5A1.5 1.5 0 0 1 4 18.5V13Zm8 0h8v5.5a1.5 1.5 0 0 1-1.5 1.5H12v-7Z" fill="currentColor"/>
    <path v-else-if="name === 'status'" d="M12 3.5A8.5 8.5 0 1 1 3.5 12 8.5 8.5 0 0 1 12 3.5Zm1 3.2h-2v5.47l3.54 2.12 1.03-1.72L13 11.1V6.7Z" fill="currentColor"/>
    <path v-else-if="name === 'flight'" d="m21.8 11.4-8-3.4-3.4-6.2c-.3-.5-.9-.8-1.5-.6l-1 .3 2.2 7-4.6-1.9-2.2-2.6-.9.3 1.2 3.4-1.2 3.4.9.3 2.2-2.6 4.6-1.9-2.2 7 1 .3c.6.2 1.2-.1 1.5-.6l3.4-6.2 8-3.4c.7-.3 1.2-.9 1.2-1.7s-.5-1.4-1.2-1.7Z" fill="currentColor"/>
    <path v-else-if="name === 'route'" d="M6 6.5a2.5 2.5 0 1 1 2.45 3H20v2H8.45A2.5 2.5 0 1 1 6 6.5Zm10 8a2.5 2.5 0 1 1-.45 1.5H4v-2h11.55A2.5 2.5 0 0 1 16 14.5Z" fill="currentColor"/>
    <path v-else-if="name === 'time'" d="M12 3.5A8.5 8.5 0 1 1 3.5 12 8.5 8.5 0 0 1 12 3.5Zm1 3.2h-2v5.47l3.54 2.12 1.03-1.72L13 11.1V6.7Z" fill="currentColor"/>
    <path v-else-if="name === 'aircraft'" d="M5 19h14v1.5H5V19Zm7-15 2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5Z" fill="currentColor"/>
    <path v-else-if="name === 'service'" d="M12 2.8 14.3 7l4.7.7-3.4 3.3.8 4.7L12 13.5l-4.4 2.2.8-4.7L5 7.7 9.7 7 12 2.8Z" fill="currentColor"/>
    <path v-else-if="name === 'agenda'" d="M7 3h2v2h6V3h2v2h1.5A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-12A1.5 1.5 0 0 1 5.5 5H7V3Zm11 7H6v8h12v-8Z" fill="currentColor"/>
    <path v-else-if="name === 'block'" d="M12 3a9 9 0 1 1-9 9 9 9 0 0 1 9-9Zm0 2a6.96 6.96 0 0 0-4.95 2.05l9.9 9.9A7 7 0 0 0 12 5Zm-6.36 3.46A7 7 0 0 0 16.54 18.36l-10.9-10.9Z" fill="currentColor"/>
    <path v-else-if="name === 'checklist'" d="M9.55 18 5 13.45l1.41-1.41 3.14 3.13 8.04-8.03L19 8.55 9.55 18Z" fill="currentColor"/>
    <path v-else-if="name === 'cabin'" d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5V16h1v2h-1.5a2.5 2.5 0 0 1-5 0h-3a2.5 2.5 0 0 1-5 0H4v-2h1V6.5Z" fill="currentColor"/>
    <path v-else-if="name === 'report'" d="M7.5 3A2.5 2.5 0 0 0 5 5.5v13A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V8.12L13.88 3H7.5Z" fill="currentColor"/>
    <path v-else-if="name === 'assignment'" d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-3.3 0-6 1.8-6 4v2h12v-2c0-2.2-2.7-4-6-4Zm7.5-4.75h-1.75V7.5h-1.5v1.75H14.5v1.5h1.75v1.75h1.5v-1.75h1.75Z" fill="currentColor"/>
    <path v-else-if="name === 'briefing'" d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9A1.5 1.5 0 0 1 18.5 16H12l-4 4v-4H5.5A1.5 1.5 0 0 1 4 14.5v-9Z" fill="currentColor"/>
    <path v-else-if="name === 'incident'" d="M12 2.75 21 19H3l9-16.25Zm0 4.1L6.4 17h11.2L12 6.85Zm-1 3.15h2v4h-2v-4Zm0 5h2v2h-2v-2Z" fill="currentColor"/>
    <path v-else-if="name === 'history'" d="M12 5a7 7 0 1 1-6.93 8h2.05A5 5 0 1 0 12 7v3l4 2-1 1.73-5-3V5Z" fill="currentColor"/>
    <path v-else-if="name === 'payment'" d="M12 3c3.2 0 5 1.43 5 3.4h-2c0-.74-1.06-1.4-3-1.4s-3 .66-3 1.4c0 .9.96 1.28 3.42 1.82 2.65.58 4.58 1.28 4.58 3.78 0 1.88-1.43 3.1-4 3.44V18h-2v-2.04c-2.92-.3-4.5-1.85-4.5-3.96h2c0 1.12.97 2 3.5 2 2.02 0 3-.72 3-1.6 0-.92-.93-1.3-3.28-1.84C8.95 9.98 7 9.28 7 6.9 7 5.15 8.36 3.7 10.5 3.3V1h2v2Z" fill="currentColor"/>
    <path v-else-if="name === 'download'" d="M11 4h2v8.17l2.59-2.58L17 11l-5 5-5-5 1.41-1.41L11 12.17V4Zm-5 14h12v2H6v-2Z" fill="currentColor"/>
    <path v-else-if="name === 'profile'" d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-3.3 0-6 1.8-6 4v2h12v-2c0-2.2-2.7-4-6-4Z" fill="currentColor"/>
    <path v-else-if="name === 'language'" d="M12 3a9 9 0 1 0 9 9 9 9 0 0 0-9-9Z" fill="currentColor"/>
    <path v-else-if="name === 'certificate'" d="M12 2.5 14 6l4 .58-2.9 2.82.68 3.99L12 11.72l-3.78 1.67.68-4L6 6.58 10 6l2-3.5Zm-2 12.2 2 1.05 2-1.05v4.8l-2-1.06-2 1.06v-4.8Z" fill="currentColor"/>
    <path v-else-if="name === 'bank'" d="M12 3 3 7.5V9h18V7.5L12 3ZM5 11h2v6H5v-6Zm4 0h2v6H9v-6Zm4 0h2v6h-2v-6Zm4 0h2v6h-2v-6ZM3 19h18v2H3v-2Z" fill="currentColor"/>
  </svg>
</template>

<style scoped>
.crew-ui-icon {
  display: block;
  flex-shrink: 0;
}
</style>
