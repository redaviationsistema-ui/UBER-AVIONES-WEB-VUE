<script setup>
defineProps({
  steps: { type: Array, default: () => [] },
})
</script>

<template>
  <div class="reservation-timeline">
    <div class="reservation-timeline__track" aria-hidden="true">
      <span
        v-for="step in steps"
        :key="step.id"
        class="reservation-timeline__node"
        :class="`reservation-timeline__node--${step.state}`"
      >
        {{ step.index }}
      </span>
    </div>

    <div class="reservation-timeline__labels">
      <span
        v-for="step in steps"
        :key="`${step.id}-label`"
        :class="`reservation-timeline__label reservation-timeline__label--${step.state}`"
      >
        {{ step.label }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.reservation-timeline {
  display: grid;
  gap: 0.7rem;
}

.reservation-timeline__track,
.reservation-timeline__labels {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 0.55rem;
  align-items: center;
}

.reservation-timeline__track {
  position: relative;
}

.reservation-timeline__track::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 3px;
  border-radius: 999px;
  background: #dde3ed;
  transform: translateY(-50%);
}

.reservation-timeline__node {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  margin: 0 auto;
  border-radius: 50%;
  background: #eef2f8;
  color: #7d8798;
  font-size: 0.82rem;
  font-weight: 800;
  transition: all 180ms ease;
}

.reservation-timeline__node--done {
  background: #1f9f43;
  color: #ffffff;
}

.reservation-timeline__node--current {
  background: #f3a315;
  color: #ffffff;
  box-shadow: 0 10px 24px rgba(243, 163, 21, 0.24);
}

.reservation-timeline__label {
  text-align: center;
  color: #6f7b8f;
  font-size: 0.8rem;
  font-weight: 700;
}

.reservation-timeline__label--done,
.reservation-timeline__label--current {
  color: #111111;
}

@media (max-width: 720px) {
  .reservation-timeline__labels {
    gap: 0.35rem;
  }

  .reservation-timeline__label {
    font-size: 0.72rem;
  }
}
</style>
