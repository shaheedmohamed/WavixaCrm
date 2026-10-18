<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed top-6 right-6 z-[9999] w-80 rounded-2xl bg-[#1f2c34] border border-[#2a3942] shadow-2xl overflow-hidden"
      dir="rtl"
    >
      <!-- header strip -->
      <div class="px-4 py-3 bg-[#111b21] flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span
            class="w-2.5 h-2.5 rounded-full"
            :class="{
              'bg-amber-400 animate-pulse': ['dialing', 'ringing', 'connecting'].includes(state),
              'bg-[#00a884]': state === 'active',
              'bg-red-400 animate-pulse': state === 'incoming',
              'bg-[#8696a0]': state === 'idle',
            }"
          ></span>
          <span class="text-[11px] text-[#8696a0] font-semibold">مكالمة واتساب</span>
        </div>
        <button @click="visible = false" class="text-[#8696a0] hover:text-white text-lg leading-none">✕</button>
      </div>

      <div class="p-5 flex flex-col items-center gap-3">
        <!-- video area -->
        <div v-if="video && state !== 'idle'" class="w-full rounded-xl overflow-hidden bg-black relative aspect-video" dir="ltr">
          <video ref="rv" autoplay playsinline class="w-full h-full object-cover"></video>
          <video ref="lv" autoplay playsinline muted class="absolute bottom-2 right-2 w-1/3 rounded-lg border border-[#2a3942] bg-[#111b21]"></video>
        </div>
        <!-- avatar -->
        <div class="w-16 h-16 rounded-full bg-[#2a3942] flex items-center justify-center text-2xl text-[#8696a0] font-bold" :class="video ? 'w-12 h-12 text-xl' : ''">
          {{ (peerName || peer || '?').toString().charAt(0) }}
        </div>
        <div class="text-center">
          <p class="text-[#e9edef] font-bold text-base">{{ peerName || ('+' + (peer || '')) }}</p>
          <p class="text-[#8696a0] text-xs mt-0.5" dir="ltr">{{ peer }}</p>
        </div>

        <!-- status -->
        <p class="text-sm font-semibold" :class="state === 'active' ? 'text-[#00a884]' : 'text-[#aebac1]'">
          {{ statusText }}<span v-if="video"> 📹</span>
        </p>
        <p v-if="state === 'active'" class="text-[#8696a0] text-xs font-mono" dir="ltr">{{ timerText }}</p>

        <!-- controls -->
        <div class="flex items-center gap-4 mt-1">
          <!-- incoming: answer + reject -->
          <template v-if="state === 'incoming'">
            <button
              @click="$emit('reject')"
              class="w-12 h-12 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center transition-colors"
              title="رفض"
            >
              <svg class="w-6 h-6 text-white rotate-[135deg]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.6.1.3 0 .7-.2 1l-2.3 2.2z"/>
              </svg>
            </button>
            <button
              @click="$emit('answer')"
              class="w-12 h-12 rounded-full bg-[#00a884] hover:bg-[#02bd9a] flex items-center justify-center animate-bounce transition-colors"
              title="رد"
            >
              <svg class="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.6.1.3 0 .7-.2 1l-2.3 2.2z"/>
              </svg>
            </button>
          </template>

          <!-- outgoing/active: mute + hangup -->
          <template v-else-if="state !== 'idle'">
            <button
              @click="$emit('toggle-mute')"
              class="w-11 h-11 rounded-full flex items-center justify-center transition-colors"
              :class="muted ? 'bg-white text-[#111b21]' : 'bg-[#2a3942] text-white hover:bg-[#374248]'"
              :title="muted ? 'إلغاء الكتم' : 'كتم'"
            >
              <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path v-if="!muted" d="M12 14a3 3 0 003-3V6a3 3 0 10-6 0v5a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 006 6.9V21h2v-3.1A7 7 0 0019 11h-2z"/>
                <path v-else d="M19 11h-1.7c0 .3-.03.55-.06.82l-1.24-1.24c.06-.14.1-.29.1-.44V6a4 4 0 10-8 0v.34l2 2V6a2 2 0 114 0v5c0 .11-.01.22-.02.33l1.94 1.94c.11-.2.18-.42.18-.65 0-.34-.03-.66-.1-.97zM4.3 3l15.7 15.7-1.4 1.4L4.3 4.4 4.3 3z" transform="translate(0 -1)"/>
              </svg>
            </button>
            <button
              v-if="video"
              @click="$emit('toggle-cam')"
              class="w-11 h-11 rounded-full flex items-center justify-center transition-colors"
              :class="camOn ? 'bg-[#2a3942] text-white hover:bg-[#374248]' : 'bg-white text-[#111b21]'"
              :title="camOn ? 'قفل الكاميرا' : 'فتح الكاميرا'"
            >
              <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path v-if="camOn" d="M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z"/>
                <path v-else d="M21 6.5l-4 4V7a1 1 0 00-1-1H7.8L21 19.2V6.5zM3.3 2.9l1.4-1.4 17 17-1.4 1.4L3.3 2.9zM4 6.8V17a1 1 0 001 1h9.2L4 6.8z"/>
              </svg>
            </button>
            <button
              @click="$emit('hangup')"
              class="w-12 h-12 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center transition-colors"
              title="إنهاء المكالمة"
            >
              <svg class="w-6 h-6 text-white rotate-[135deg]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.6.1.3 0 .7-.2 1l-2.3 2.2z"/>
              </svg>
            </button>
          </template>
        </div>

        <p v-if="error" class="text-red-400 text-xs text-center">{{ error }}</p>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onUnmounted, ref, watch } from 'vue';

const props = defineProps({
  state: { type: String, default: 'idle' }, // idle|dialing|ringing|connecting|active|incoming
  peer: { type: String, default: '' },
  peerName: { type: String, default: '' },
  muted: { type: Boolean, default: false },
  error: { type: String, default: '' },
  video: { type: Boolean, default: false },
  camOn: { type: Boolean, default: true },
  getRemoteStream: { type: Function, default: null },
  getLocalStream: { type: Function, default: null },
});
defineEmits(['hangup', 'answer', 'reject', 'toggle-mute', 'toggle-cam']);

const visible = ref(false);
const activeSince = ref(null);
const now = ref(Date.now());
const rv = ref(null);
const lv = ref(null);
let t = null;
let streamPoll = null;

// the MediaStream objects live inside callAudio (non-reactive) — poll and
// attach once they exist / change
watch(() => props.video, (v) => {
  if (v) {
    streamPoll = setInterval(() => {
      const rs = props.getRemoteStream && props.getRemoteStream();
      if (rs && rv.value && rv.value.srcObject !== rs) rv.value.srcObject = rs;
      const ls = props.getLocalStream && props.getLocalStream();
      if (ls && lv.value && lv.value.srcObject !== ls) lv.value.srcObject = ls;
    }, 600);
  } else {
    clearInterval(streamPoll); streamPoll = null;
  }
}, { immediate: true });
onUnmounted(() => streamPoll && clearInterval(streamPoll));

watch(() => props.state, (s) => {
  if (s === 'idle') { activeSince.value = null; return; }
  visible.value = true;
  if (s === 'active' && !activeSince.value) activeSince.value = Date.now();
  if (!t) t = setInterval(() => (now.value = Date.now()), 1000);
});
onUnmounted(() => t && clearInterval(t));

const timerText = computed(() => {
  if (!activeSince.value) return '0:00';
  const s = Math.floor((now.value - activeSince.value) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
});

const statusText = computed(() => ({
  idle: '',
  dialing: 'جارِ الاتصال بالرقم...',
  ringing: 'الرقم بيرن... 📳',
  connecting: 'رد — جارِ التوصيل...',
  active: 'في مكالمة',
  incoming: 'مكالمة واردة — بيرن عندك',
}[props.state] || props.state));
</script>
