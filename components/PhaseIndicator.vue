<template>
  <span class="phase-pill">
    <span :class="['pip', status]" />
    <span class="label">{{ label }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  phase: string
  verification: string
}>()

const labels: Record<string, string> = {
  VERIFY_ID: 'Verifying Identity',
  RESOLVE_INTENT: 'Resolving Intent',
  PROCESS_CASE: 'Processing Claim',
  POST_PROCESS: 'Wrapping Up',
}

const label = computed(() => labels[props.phase] || props.phase)
const status = computed(() => {
  if (props.phase === 'VERIFY_ID' && props.verification === 'verified') return 'done'
  if (props.phase === 'POST_PROCESS') return 'done'
  return 'active'
})
</script>

<style scoped>
.phase-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.pip {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
.pip.active {
  background: var(--phase-active);
  animation: pulse 2s infinite;
}
.pip.done {
  background: var(--phase-done);
}

.label {
  font-size: 11px;
  color: var(--text-secondary);
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
</style>
