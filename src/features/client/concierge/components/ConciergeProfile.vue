<script setup>
defineProps({
  profile: { type: Object, required: true },
})
</script>

<template>
  <section class="concierge-profile">
    <img class="concierge-profile__avatar" :src="profile.avatarUrl" :alt="profile.conciergeName" />
    <div class="concierge-profile__copy">
      <h3>{{ profile.greeting }}</h3>
      <p>{{ profile.assistantLabel }}</p>
      <div class="concierge-profile__availability">
        <span class="concierge-profile__dot"></span>
        <strong>{{ profile.availabilityLabel }}</strong>
      </div>
      <small>{{ profile.responseLabel }}</small>
      <strong class="concierge-profile__response">{{ profile.responseValue }}</strong>
    </div>
  </section>
</template>

<style scoped>
.concierge-profile { display:grid; grid-template-columns:5.75rem 1fr; gap:1rem; padding:1.2rem; border-radius:24px; background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.08); box-shadow:0 18px 38px rgba(5,12,24,.22); }
.concierge-profile__avatar { width:5.75rem; height:5.75rem; border-radius:999px; object-fit:cover; border:2px solid rgba(255,255,255,.14); background:#dbe4f0; }
.concierge-profile__copy h3 { margin:0; color:#fff; font-size:1.65rem; }
.concierge-profile__copy p { margin:.3rem 0 .6rem; color:rgba(255,255,255,.82); }
.concierge-profile__availability { display:flex; align-items:center; gap:.45rem; margin-bottom:.55rem; color:#fff; }
.concierge-profile__dot { width:.7rem; height:.7rem; border-radius:999px; background:#63d471; box-shadow:0 0 0 6px rgba(99,212,113,.16); }
.concierge-profile__copy small { display:block; color:rgba(255,255,255,.66); font-size:.9rem; }
.concierge-profile__response { display:block; margin-top:.15rem; color:#7ce08a; font-size:1.15rem; }
</style>
