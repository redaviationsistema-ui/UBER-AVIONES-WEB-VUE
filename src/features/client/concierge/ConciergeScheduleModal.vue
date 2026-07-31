<script setup>
import ConciergeIcon from './components/ConciergeIcon.vue'

defineProps({
  isOpen: { type: Boolean, required: true },
  config: { type: Object, required: true },
  form: { type: Object, required: true },
})

defineEmits(['close', 'submit'])
</script>

<template>
  <transition name="concierge-fade">
    <div v-if="isOpen" class="concierge-modal-backdrop" @click.self="$emit('close')">
      <section class="concierge-modal" role="dialog" :aria-label="config.aria.scheduleModal">
        <header class="concierge-modal__header">
          <div>
            <strong>{{ config.schedule.title }}</strong>
            <p>{{ config.schedule.subtitle }}</p>
          </div>
          <button type="button" class="concierge-modal__close" :aria-label="config.aria.close" @click="$emit('close')">
            <ConciergeIcon name="close" />
          </button>
        </header>
        <label>
          <span>{{ config.schedule.fields.date }}</span>
          <input v-model="form.date" type="date" />
        </label>
        <label>
          <span>{{ config.schedule.fields.time }}</span>
          <input v-model="form.time" type="time" />
        </label>
        <label>
          <span>{{ config.schedule.fields.topic }}</span>
          <select v-model="form.topic">
            <option v-for="item in config.schedule.topicOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
          </select>
        </label>
        <footer class="concierge-modal__actions">
          <button type="button" class="concierge-modal__ghost" @click="$emit('close')">{{ config.schedule.cancelLabel }}</button>
          <button type="button" class="concierge-modal__primary" @click="$emit('submit')">{{ config.schedule.submitLabel }}</button>
        </footer>
      </section>
    </div>
  </transition>
</template>

<style scoped>
.concierge-fade-enter-active,.concierge-fade-leave-active{transition:opacity .3s ease}.concierge-fade-enter-from,.concierge-fade-leave-to{opacity:0}
.concierge-modal-backdrop{position:fixed;inset:0;z-index:130;background:rgba(5,10,18,.56);backdrop-filter:blur(8px);display:grid;place-items:center;padding:1.25rem}
.concierge-modal{width:min(100%,28rem);display:grid;gap:1rem;padding:1.4rem;border-radius:24px;background:#fff;color:#142644;box-shadow:0 32px 80px rgba(7,16,31,.28)}
.concierge-modal__header{display:flex;justify-content:space-between;gap:1rem}.concierge-modal__header strong{display:block;font-size:1.3rem}.concierge-modal__header p{margin:.3rem 0 0;color:#5f6a7c}
.concierge-modal__close{display:grid;place-items:center;width:2.5rem;height:2.5rem;border-radius:999px;background:#f4f6f9;color:#142644}
label{display:grid;gap:.45rem}label span{font-weight:700;color:#23324f}
input,select{min-height:3.1rem;border:1px solid #d9e0ea;border-radius:16px;padding:0 .9rem;background:#fbfcfe;color:#142644;font:inherit}
.concierge-modal__actions{display:flex;justify-content:flex-end;gap:.75rem}
.concierge-modal__ghost{background:#eef2f7;color:#142644;border-radius:999px;padding:.9rem 1.15rem}
.concierge-modal__primary{background:#0f1e36;color:#fff;border-radius:999px;padding:.9rem 1.2rem}
</style>
