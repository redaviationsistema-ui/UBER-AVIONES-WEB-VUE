<script setup>
import ConciergeIcon from './ConciergeIcon.vue'

defineProps({
  footer: { type: Object, required: true },
})
</script>

<template>
  <footer class="concierge-footer">
    <article v-for="item in footer.items" :key="item.id" class="concierge-footer__card">
      <span class="concierge-footer__icon"><ConciergeIcon :name="item.icon" /></span>
      <div>
        <strong>{{ item.title }}</strong>
        <p v-if="item.subtitle">{{ item.subtitle }}</p>
        <div v-if="item.languages" class="concierge-footer__languages">
          <span v-for="language in item.languages" :key="language">{{ language }}</span>
        </div>
      </div>
    </article>
  </footer>
</template>

<style scoped>
.concierge-footer { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:.85rem; }
.concierge-footer__card { display:flex; gap:.85rem; align-items:flex-start; padding:1rem; border-radius:20px; border:1px solid rgba(255,255,255,.08); background:rgba(255,255,255,.05); color:#fff; }
.concierge-footer__icon { display:grid; place-items:center; width:2.8rem; height:2.8rem; border-radius:999px; background:rgba(255,255,255,.08); color:#fff; }
.concierge-footer__icon :deep(svg) { width:1.25rem; height:1.25rem; }
.concierge-footer__card strong { display:block; }
.concierge-footer__card p { margin:.25rem 0 0; color:rgba(255,255,255,.74); }
.concierge-footer__languages { display:flex; flex-wrap:wrap; gap:.4rem; margin-top:.45rem; }
.concierge-footer__languages span { min-width:2.2rem; padding:.28rem .55rem; border-radius:999px; background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.1); text-align:center; font-size:.82rem; font-weight:700; }
@media (max-width: 640px) { .concierge-footer { grid-template-columns:1fr; } }
</style>
