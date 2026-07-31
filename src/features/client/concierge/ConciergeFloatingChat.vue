<script setup>
import ConciergeIcon from './components/ConciergeIcon.vue'

defineProps({
  config: { type: Object, required: true },
  draft: { type: String, required: true },
  isOpen: { type: Boolean, required: true },
  messages: { type: Array, required: true },
  selectedServiceTitle: { type: String, default: '' },
})

defineEmits(['close', 'send', 'update:draft'])
</script>

<template>
  <transition name="chat-float">
    <section v-if="isOpen" class="concierge-chat" :aria-label="config.aria.chatWidget">
      <header class="concierge-chat__header">
        <div>
          <strong>{{ config.chat.title }}</strong>
          <p>{{ selectedServiceTitle || config.chat.subtitle }}</p>
        </div>
        <button type="button" class="concierge-chat__close" :aria-label="config.aria.close" @click="$emit('close')">
          <ConciergeIcon name="close" />
        </button>
      </header>

      <div class="concierge-chat__messages">
        <article v-for="item in messages" :key="item.id" class="concierge-chat__message" :class="`concierge-chat__message--${item.role}`">
          <p>{{ item.body }}</p>
          <span>{{ item.timestamp }}</span>
        </article>
      </div>

      <footer class="concierge-chat__composer">
        <textarea :value="draft" :placeholder="config.chat.composerPlaceholder" @input="$emit('update:draft', $event.target.value)" />
        <button type="button" @click="$emit('send')">{{ config.chat.sendLabel }}</button>
      </footer>
    </section>
  </transition>
</template>

<style scoped>
.chat-float-enter-active,.chat-float-leave-active{transition:transform .3s ease,opacity .3s ease}.chat-float-enter-from,.chat-float-leave-to{transform:translateY(1rem);opacity:0}
.concierge-chat{position:fixed;right:1.25rem;bottom:1.25rem;z-index:125;width:min(100vw - 1.5rem,24rem);display:grid;gap:1rem;padding:1rem;border-radius:24px;background:#0f1e36;color:#fff;box-shadow:0 32px 80px rgba(7,16,31,.38)}
.concierge-chat__header{display:flex;justify-content:space-between;gap:.75rem}.concierge-chat__header strong{display:block}.concierge-chat__header p{margin:.2rem 0 0;color:rgba(255,255,255,.7)}
.concierge-chat__close{display:grid;place-items:center;width:2.25rem;height:2.25rem;border-radius:999px;background:rgba(255,255,255,.08);color:#fff}
.concierge-chat__messages{display:grid;gap:.75rem;max-height:18rem;overflow:auto;padding-right:.2rem}
.concierge-chat__message{max-width:88%;padding:.8rem .9rem;border-radius:18px;background:rgba(255,255,255,.08)}
.concierge-chat__message--user{justify-self:end;background:#c9a13b;color:#111}
.concierge-chat__message p{margin:0;line-height:1.45}.concierge-chat__message span{display:block;margin-top:.35rem;font-size:.75rem;opacity:.7}
.concierge-chat__composer{display:grid;gap:.75rem}
.concierge-chat__composer textarea{min-height:5.25rem;border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:.85rem;background:rgba(255,255,255,.06);color:#fff;resize:none;font:inherit}
.concierge-chat__composer button{justify-self:end;border-radius:999px;background:#c9a13b;color:#111;padding:.78rem 1rem;font-weight:800}
</style>
