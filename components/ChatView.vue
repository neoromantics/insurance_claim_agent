<template>
  <div class="chat">
    <!-- Header -->
    <header class="chat-header">
      <div class="header-content">
        <div class="avatar">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 21V5a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v16"/>
            <path d="M3 21h18"/>
            <path d="M9 7h6"/>
            <path d="M9 11h6"/>
            <path d="M9 15h4"/>
          </svg>
        </div>
        <div class="header-text">
          <span class="header-name">Claims Support</span>
        </div>
      </div>
      <button class="new-btn" @click="resetChat" title="New conversation">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
        </svg>
      </button>
    </header>

    <!-- Messages -->
    <div class="messages" ref="messagesRef">
      <!-- Phase banner on transition -->
      <TransitionGroup name="msg">
        <div v-for="(msg, i) in messages" :key="i"
             :class="['msg-row', msg.role]">

          <!-- Phase transition marker -->
          <div v-if="msg.phaseBanner" class="phase-banner">
            <span class="phase-dot-inline" />
            {{ msg.phaseBanner }}
          </div>

          <!-- Bubble -->
          <div v-else class="bubble-wrap">
            <div :class="['bubble', msg.role]">
              <span class="bubble-text">{{ msg.content }}</span>
            </div>
            <span class="timestamp">{{ msg.time }}</span>
          </div>
        </div>
      </TransitionGroup>

      <!-- Typing indicator -->
      <div v-if="loading" class="msg-row assistant">
        <div class="bubble-wrap">
          <div class="bubble assistant typing-bubble">
            <span class="dot" /><span class="dot" /><span class="dot" />
          </div>
        </div>
      </div>
    </div>

    <!-- Input -->
    <div class="input-bar">
      <div class="input-wrap">
        <textarea
          ref="inputRef"
          v-model="input"
          class="input"
          placeholder="iMessage"
          rows="1"
          :disabled="loading"
          @keydown.enter.exact.prevent="send"
          @input="autoGrow"
        />
        <button class="send-btn" :disabled="!input.trim() || loading" @click="send">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z"/>
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted } from 'vue'

interface Msg {
  role: 'user' | 'assistant'
  content: string
  time: string
  phaseBanner?: string
}

const phaseLabels: Record<string, string> = {
  VERIFY_ID: 'Identity Verification',
  RESOLVE_INTENT: 'Resolving Intent',
  PROCESS_CASE: 'Processing Claim',
  POST_PROCESS: 'Wrapping Up',
}

const INITIAL_GREETING = "Hello! I'm your claims support assistant. To protect your privacy, could you please verify your identity by providing three of the following: Full name, Date of birth, Phone number, Email, Policy number, or the last four digits of your SSN?"

const messages = ref<Msg[]>([])
const input = ref('')
const loading = ref(false)
const sessionId = ref<string | null>(null)
const phase = ref('VERIFY_ID')
const verificationStatus = ref('pending')
const messagesRef = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLTextAreaElement | null>(null)

function formatTime(isoStr?: string): string {
  const d = isoStr ? new Date(isoStr) : new Date()
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function scrollBottom() {
  nextTick(() => {
    const el = messagesRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

function autoGrow() {
  const el = inputRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 120) + 'px'
}

async function send() {
  const text = input.value.trim()
  if (!text || loading.value) return

  input.value = ''
  nextTick(autoGrow)

  messages.value.push({ role: 'user', content: text, time: formatTime() })
  scrollBottom()
  loading.value = true

  const config = useRuntimeConfig()
  const base = config.app.baseURL === '/' ? '' : config.app.baseURL.replace(/\/$/, '')

  try {
    const response = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: sessionId.value, message: text }),
    })

    if (!response.body) throw new Error('No body')

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    
    let currentPhase = phase.value
    let doneReading = false

    while (!doneReading) {
      const { value, done } = await reader.read()
      if (done) break
      
      const chunkString = decoder.decode(value, { stream: true })
      const lines = chunkString.split('\n')
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const dataStr = line.slice(6)
          if (!dataStr) continue
          
          try {
            const data = JSON.parse(dataStr)
            
            if (data.chunk) {
              loading.value = false // hide dots once text starts
              const lastMsg = messages.value[messages.value.length - 1]
              // If we don't have an active assistant text bubble, create one
              if (lastMsg.role === 'user' || lastMsg.phaseBanner) {
                messages.value.push({ role: 'assistant', content: '', time: formatTime() })
              }
              
              const targetMsg = messages.value[messages.value.length - 1]
              // If this is the start of the message, trim any leading newlines/spaces from the AI
              if (targetMsg.content.length === 0) {
                targetMsg.content += data.chunk.trimStart()
              } else {
                targetMsg.content += data.chunk
              }
              
              scrollBottom()
            }
            
            if (data.phase_transition && data.phase_transition !== currentPhase) {
              messages.value.push({
                role: 'assistant', content: '', time: '',
                phaseBanner: phaseLabels[data.phase_transition] || data.phase_transition,
              })
              currentPhase = data.phase_transition
              phase.value = currentPhase
            }
            
            if (data.done) {
              doneReading = true
              sessionId.value = data.sessionId
              localStorage.setItem('sop_session_id', data.sessionId)
              phase.value = data.phase
              verificationStatus.value = data.verificationStatus
            }
          } catch (e) {
            console.error('SSE JSON error', e)
          }
        }
      }
    }
  } catch (e: any) {
    messages.value.push({
      role: 'assistant',
      content: 'Something went wrong. Please try again.',
      time: formatTime(),
    })
  } finally {
    loading.value = false
    scrollBottom()
    nextTick(() => inputRef.value?.focus())
  }
}

function resetChat() {
  sessionId.value = null
  messages.value = [{ role: 'assistant', content: INITIAL_GREETING, time: formatTime() }]
  phase.value = 'VERIFY_ID'
  verificationStatus.value = 'pending'
  localStorage.removeItem('sop_session_id')
  nextTick(() => inputRef.value?.focus())
}

onMounted(async () => {
  inputRef.value?.focus()
  const savedId = localStorage.getItem('sop_session_id')
  
  const config = useRuntimeConfig()
  const base = config.app.baseURL === '/' ? '' : config.app.baseURL.replace(/\/$/, '')

  if (savedId) {
    try {
      const res = await $fetch<any>(`${base}/api/session/${savedId}`)
      sessionId.value = res.sessionId
      phase.value = res.phase
      verificationStatus.value = res.verificationStatus
      
      let lastPhase = 'VERIFY_ID'
      for (const msg of res.history) {
        if (msg.phase !== lastPhase) {
          messages.value.push({
            role: 'assistant', content: '', time: '',
            phaseBanner: phaseLabels[msg.phase] || msg.phase,
          })
          lastPhase = msg.phase
        }
        messages.value.push({
          role: msg.role as any,
          content: msg.content,
          time: formatTime(msg.timestamp)
        })
      }
      scrollBottom()
    } catch (e) {
      localStorage.removeItem('sop_session_id')
      messages.value = [{ role: 'assistant', content: INITIAL_GREETING, time: formatTime() }]
    }
  } else {
    messages.value = [{ role: 'assistant', content: INITIAL_GREETING, time: formatTime() }]
  }
})
</script>

<style scoped>
/* ======================= Layout ======================= */
.chat {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg);
}

/* ======================= Header ======================= */
.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 0.5px solid var(--border);
  background: var(--bg);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  position: sticky;
  top: 0;
  z-index: 10;
}

.header-content {
  display: flex;
  align-items: center;
  gap: 10px;
}

.avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--phase-active);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
}

.header-text {
  display: flex;
  flex-direction: column;
}

.header-name {
  font-size: 15px;
  font-weight: 600;
}

.new-btn {
  background: none;
  border: none;
  color: var(--phase-active);
  cursor: pointer;
  padding: 6px;
  border-radius: 8px;
  display: flex;
  align-items: center;
}
.new-btn:hover { background: var(--bg-secondary); }

/* ======================= Messages ======================= */
.messages {
  flex: 1;
  overflow-y: auto;
  padding: 8px 16px 16px;
  -webkit-overflow-scrolling: touch;
}

.msg-row {
  display: flex;
  flex-direction: column;
  margin-top: 4px;
}
.msg-row.user { align-items: flex-end; }
.msg-row.assistant { align-items: flex-start; }

.bubble-wrap {
  max-width: 75%;
  display: flex;
  flex-direction: column;
}
.msg-row.user .bubble-wrap { align-items: flex-end; }
.msg-row.assistant .bubble-wrap { align-items: flex-start; }

.bubble {
  padding: 8px 14px;
  border-radius: 18px;
  font-size: 15px;
  line-height: 1.38;
  word-break: break-word;
  white-space: pre-wrap;
}

.bubble.user {
  background: var(--bubble-user);
  color: var(--text-on-blue);
  border-bottom-right-radius: 4px;
}

.bubble.assistant {
  background: var(--bubble-agent);
  color: var(--text-on-grey);
  border-bottom-left-radius: 4px;
}

.timestamp {
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 2px;
  padding: 0 4px;
}

/* ======================= Typing dots ======================= */
.typing-bubble {
  display: flex;
  gap: 4px;
  align-items: center;
  padding: 12px 18px;
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--text-secondary);
  animation: bounce 1.4s infinite ease-in-out;
}
.dot:nth-child(1) { animation-delay: 0s; }
.dot:nth-child(2) { animation-delay: 0.2s; }
.dot:nth-child(3) { animation-delay: 0.4s; }

@keyframes bounce {
  0%, 80%, 100% { transform: scale(0.5); opacity: 0.4; }
  40% { transform: scale(1); opacity: 1; }
}

/* ======================= Phase banner ======================= */
.phase-banner {
  text-align: center;
  font-size: 12px;
  color: var(--text-secondary);
  padding: 10px 0 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.phase-dot-inline {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--phase-done);
  display: inline-block;
}

/* ======================= Input bar ======================= */
.input-bar {
  padding: 8px 12px;
  padding-bottom: max(8px, env(safe-area-inset-bottom));
  border-top: 0.5px solid var(--border);
  background: var(--bg);
}

.input-wrap {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  background: var(--input-bg);
  border-radius: 20px;
  padding: 4px 4px 4px 14px;
  border: 0.5px solid var(--border);
}

.input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 15px;
  font-family: inherit;
  color: var(--text-primary);
  resize: none;
  outline: none;
  padding: 6px 0;
  min-height: 24px;
  max-height: 120px;
  line-height: 1.38;
}
.input::placeholder {
  color: var(--text-secondary);
}

.send-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: var(--phase-active);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: opacity 0.15s;
}
.send-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

/* ======================= Transitions ======================= */
.msg-enter-active { animation: fadeUp 0.25s ease; }
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
