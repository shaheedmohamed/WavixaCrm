<template>
  <div class="h-full flex flex-col bg-[#111b21] text-[#e9edef] overflow-hidden" dir="rtl">
    <!-- Header -->
    <div class="shrink-0 px-5 py-4 bg-[#202c33] border-b border-[#2a3942] flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-full bg-[#00a884]/15 text-[#00a884] flex items-center justify-center">
          <svg class="w-5.5 h-5.5 w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9 9 0 100-18 9 9 0 000 18z" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 17a5 5 0 100-10 5 5 0 000 10z" stroke-dasharray="3 2.5" />
          </svg>
        </div>
        <div>
          <h1 class="text-lg font-bold">الحالات</h1>
          <p class="text-xs text-[#8696a0]">{{ totalContacts }} جهة اتصال · {{ totalItems }} حالة</p>
        </div>
      </div>
      <button @click="load(true)" class="w-9 h-9 rounded-full hover:bg-[#374248] text-[#aebac1] flex items-center justify-center transition-colors" :class="{ 'animate-spin': loading }" title="تحديث">
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h5M20 20v-5h-5M5 9a8 8 0 0114-3M19 15a8 8 0 01-14 3"/></svg>
      </button>
    </div>

    <div class="flex-1 overflow-y-auto">
      <div class="max-w-2xl mx-auto py-3">
        <div v-if="loading && !loaded" class="py-16 text-center text-[#8696a0] text-sm">جارٍ تحميل الحالات…</div>

        <template v-else>
          <!-- My status -->
          <div class="px-4">
            <button
              @click="mine.length ? openViewer(mineGroup) : null"
              class="w-full flex items-center gap-3.5 px-2 py-3 rounded-xl hover:bg-[#202c33] transition-colors text-right"
              :disabled="!mine.length"
            >
              <div class="relative shrink-0">
                <div class="w-14 h-14 rounded-full overflow-hidden bg-[#374248] flex items-center justify-center text-xl font-bold text-[#aebac1] ring-2 ring-[#00a884] ring-offset-2 ring-offset-[#111b21]">
                  <img v-if="myAvatar" :src="myAvatar" class="w-full h-full object-cover" />
                  <span v-else>أنا</span>
                </div>
                <div class="absolute -bottom-0.5 -left-0.5 w-5 h-5 rounded-full bg-[#00a884] border-2 border-[#111b21] flex items-center justify-center text-[#111b21] text-xs font-black">+</div>
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-bold text-[15px]">حالاتي</div>
                <div class="text-xs text-[#8696a0] mt-0.5">
                  <template v-if="mine.length">{{ mine.length }} {{ mine.length === 1 ? 'حالة' : 'حالة' }} · آخر تحديث {{ relTime(mine[0].posted_at) }}</template>
                  <template v-else>لا توجد حالات خلال آخر 24 ساعة</template>
                </div>
              </div>
              <span v-if="mineDeletedCount" class="text-[11px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 font-bold">{{ mineDeletedCount }} محذوفة</span>
            </button>
          </div>

          <!-- Recent -->
          <div v-if="recent.length" class="mt-2">
            <div class="px-6 py-2 text-xs font-bold text-[#8696a0]">الأخيرة</div>
            <button
              v-for="g in recent" :key="'r-' + g.poster_phone"
              @click="openViewer(g)"
              class="w-full flex items-center gap-3.5 px-6 py-2.5 hover:bg-[#202c33] transition-colors text-right"
            >
              <StatusRing :count="g.count" :avatar="g.poster_avatar" :name="g.poster_name" :seen="false" />
              <div class="flex-1 min-w-0">
                <div class="font-bold text-[15px] truncate">{{ g.poster_name }}</div>
                <div class="text-xs text-[#8696a0] mt-0.5">
                  {{ relTime(g.latest_at) }} · {{ g.count }} {{ g.count === 1 ? 'حالة' : 'حالات' }}
                  <span v-if="g.items.some(i => i.deleted_at)" class="text-red-400/80">· فيها محذوفة</span>
                </div>
              </div>
            </button>
          </div>

          <!-- Viewed -->
          <div v-if="viewed.length" class="mt-2">
            <div class="px-6 py-2 text-xs font-bold text-[#8696a0]">تمت مشاهدتها</div>
            <button
              v-for="g in viewed" :key="'v-' + g.poster_phone"
              @click="openViewer(g)"
              class="w-full flex items-center gap-3.5 px-6 py-2.5 hover:bg-[#202c33] transition-colors text-right"
            >
              <StatusRing :count="g.count" :avatar="g.poster_avatar" :name="g.poster_name" :seen="true" />
              <div class="flex-1 min-w-0">
                <div class="font-medium text-[15px] text-[#d1d7db] truncate">{{ g.poster_name }}</div>
                <div class="text-xs text-[#8696a0] mt-0.5">
                  {{ relTime(g.latest_at) }} · {{ g.count }} {{ g.count === 1 ? 'حالة' : 'حالات' }}
                  <span v-if="g.items.some(i => i.deleted_at)" class="text-red-400/80">· فيها محذوفة</span>
                </div>
              </div>
            </button>
          </div>

          <!-- Empty state -->
          <div v-if="!mine.length && !recent.length && !viewed.length" class="py-20 text-center">
            <div class="w-24 h-24 mx-auto rounded-full bg-[#202c33] flex items-center justify-center mb-4">
              <svg class="w-10 h-10 text-[#374248]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" stroke-dasharray="2.5 2" />
              </svg>
            </div>
            <p class="text-[#8696a0] text-sm font-medium">لا توجد حالات حديثة</p>
            <p class="text-[#667781] text-xs mt-1.5">أول ما جهة اتصال تنزل حالة هتظهر هنا فوراً — وبتتخزن عندنا حتى لو اتمسحت</p>
          </div>
        </template>
      </div>
    </div>

    <!-- ═══════════ Viewer overlay ═══════════ -->
    <Teleport to="body">
      <div v-if="viewer.group" class="fixed inset-0 z-[90] bg-black/95 flex flex-col" dir="rtl" @click.self="closeViewer">
        <!-- progress segments -->
        <div class="absolute top-0 inset-x-0 z-10 px-3 pt-2.5 flex gap-1" dir="ltr">
          <div v-for="(it, i) in viewer.group.items" :key="it.id" class="flex-1 h-[3px] rounded-full bg-white/25 overflow-hidden">
            <div
              class="h-full bg-white rounded-full"
              :class="{ 'transition-none': i !== viewer.idx }"
              :style="{ width: i < viewer.idx ? '100%' : i === viewer.idx ? segProgress + '%' : '0%' }"
            ></div>
          </div>
        </div>

        <!-- header -->
        <div class="absolute top-0 inset-x-0 z-10 pt-6 pb-10 bg-gradient-to-b from-black/70 to-transparent">
          <div class="flex items-center gap-3 px-4">
            <div class="w-10 h-10 rounded-full overflow-hidden bg-[#374248] flex items-center justify-center font-bold text-[#aebac1] shrink-0">
              <img v-if="viewer.group.poster_avatar" :src="viewer.group.poster_avatar" class="w-full h-full object-cover" />
              <span v-else>{{ (viewer.group.poster_name || '?')[0] }}</span>
            </div>
            <div class="flex-1 min-w-0">
              <div class="font-bold text-[15px] truncate">{{ viewer.group.poster_name }}</div>
              <div class="text-xs text-[#aebac1]">{{ relTime(currentItem?.posted_at) }}</div>
            </div>
            <span v-if="currentItem?.deleted_at" class="text-[11px] px-2.5 py-1 rounded-full bg-red-500/20 text-red-300 font-bold shrink-0">حذفها صاحبها — محفوظة عندنا</span>
            <button @click="closeViewer" class="w-9 h-9 rounded-full hover:bg-white/10 text-white flex items-center justify-center shrink-0">
              <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
        </div>

        <!-- content -->
        <div class="flex-1 flex items-center justify-center relative overflow-hidden" @click="onContentClick">
          <button class="absolute inset-y-0 right-0 w-1/3 z-[5]" @click.stop="prevItem" aria-label="prev"></button>
          <button class="absolute inset-y-0 left-0 w-1/3 z-[5]" @click.stop="nextItem" aria-label="next"></button>

          <template v-if="currentItem">
            <img v-if="currentItem.type === 'image' && itemSrc(currentItem)" :src="itemSrc(currentItem)" class="max-h-[82vh] max-w-[92vw] object-contain rounded-lg" @load="itemLoaded" />
            <video v-else-if="currentItem.type === 'video' && itemSrc(currentItem)" :src="itemSrc(currentItem)" class="max-h-[82vh] max-w-[92vw] rounded-lg" controls autoplay @ended="nextItem" @loadeddata="pauseTimer"></video>
            <div v-else-if="(currentItem.type === 'audio' || currentItem.type === 'voice') && itemSrc(currentItem)" class="bg-[#202c33] rounded-2xl p-6 flex flex-col items-center gap-4">
              <div class="w-16 h-16 rounded-full bg-[#00a884] flex items-center justify-center">
                <svg class="w-8 h-8 text-[#111b21]" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
              </div>
              <audio :src="itemSrc(currentItem)" controls autoplay @ended="nextItem" @play="pauseTimer"></audio>
            </div>
            <div v-else-if="currentItem.type === 'text' || (!itemSrc(currentItem) && currentItem.body)" class="max-w-lg px-8 py-10 rounded-3xl bg-gradient-to-br from-[#0b5e4b] via-[#075e54] to-[#128c7e] text-center">
              <p class="text-2xl leading-relaxed font-medium whitespace-pre-wrap">{{ currentItem.body }}</p>
            </div>
            <div v-else class="text-center text-[#8696a0]">
              <svg class="w-10 h-10 mx-auto mb-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>
              <p class="text-sm">جارٍ تحميل الحالة…</p>
            </div>
            <p v-if="currentItem.body && currentItem.type !== 'text' && !['audio','voice'].includes(currentItem.type)" class="absolute bottom-16 inset-x-0 text-center text-white text-sm bg-black/40 backdrop-blur-sm py-2 px-4 mx-auto max-w-xl rounded-xl">{{ currentItem.body }}</p>
          </template>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, h } from 'vue';
import crm from '@/services/crm';
import { getEcho, crmChannelName } from '@/services/realtime';

// Avatar + segmented progress ring — the WhatsApp status glyph.
const StatusRing = (props) => {
  const segs = Math.max(1, Math.min(props.count || 1, 10));
  const color = props.seen ? '#667781' : '#00a884';
  const stops = [];
  for (let i = 0; i < segs; i++) {
    const a = (360 / segs) * i + 2;
    const b = (360 / segs) * (i + 1) - 2;
    stops.push(`${color} ${a}deg ${b}deg`, `transparent ${b}deg ${b + 0.01}deg`);
  }
  const ring = { background: `conic-gradient(${stops.join(',')})` };
  return h('div', { class: 'relative w-14 h-14 rounded-full p-[3px] shrink-0', style: ring }, [
    h('div', { class: 'w-full h-full rounded-full overflow-hidden bg-[#374248] border-[3px] border-[#111b21] flex items-center justify-center text-lg font-bold text-[#aebac1]' }, [
      props.avatar ? h('img', { src: props.avatar, class: 'w-full h-full object-cover' }) : h('span', (props.name || '?')[0]),
    ]),
  ]);
};
StatusRing.props = ['count', 'avatar', 'name', 'seen'];

const loading = ref(false);
const loaded = ref(false);
const mine = ref([]);
const recent = ref([]);
const viewed = ref([]);

const viewer = ref({ group: null, idx: 0 });
const segProgress = ref(0);
let segTimer = null;
let segStart = 0;
let crmChannel = null;
let pollTimer = null;

const totalItems = computed(() => mine.value.length + recent.value.reduce((n, g) => n + g.count, 0) + viewed.value.reduce((n, g) => n + g.count, 0));
const totalContacts = computed(() => recent.value.length + viewed.value.length + (mine.value.length ? 1 : 0));
const mineDeletedCount = computed(() => mine.value.filter((i) => i.deleted_at).length);
const mineGroup = computed(() => mine.value.length ? {
  poster_phone: 'me', poster_name: 'حالاتي', poster_avatar: myAvatar.value,
  count: mine.value.length, latest_at: mine.value[0].posted_at, items: mine.value,
} : null);
const myAvatar = computed(() => mine.value[0]?.poster_avatar || null);
const currentItem = computed(() => viewer.value.group?.items?.[viewer.value.idx] || null);

const itemSrc = (it) => {
  if (!it) return null;
  if (it.media_url) return it.media_url;
  if (it.has_lazy_media) return `/api/crm/status-media/${it.id}?token=${encodeURIComponent(crm.getToken() || '')}`;
  return null;
};

const relTime = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'الآن';
  if (mins < 60) return `منذ ${mins} دقيقة`;
  const hrs = Math.floor(mins / 60);
  const isToday = d.toDateString() === new Date().toDateString();
  const hm = d.toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' });
  if (isToday) return `اليوم ${hm}`;
  if (hrs < 24) return `أمس ${hm}`;
  return d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' }) + ' ' + hm;
};

const load = async (manual = false) => {
  if (loading.value) return;
  loading.value = true;
  try {
    const res = await crm.client().get('/statuses');
    if (res.data?.success) {
      mine.value = res.data.mine || [];
      recent.value = res.data.recent || [];
      viewed.value = res.data.viewed || [];
      loaded.value = true;
      // keep the open viewer in sync with fresh data
      if (viewer.value.group) {
        const all = [...mine.value, ...recent.value.flatMap((g) => g.items), ...viewed.value.flatMap((g) => g.items)];
        const ids = new Set(viewer.value.group.items.map((i) => i.id));
        const fresh = all.filter((i) => ids.has(i.id));
        if (fresh.length) {
          const curId = currentItem.value?.id;
          viewer.value.group = { ...viewer.value.group, items: fresh };
          viewer.value.idx = Math.max(0, fresh.findIndex((i) => i.id === curId));
        } else {
          closeViewer();
        }
      }
    }
  } catch (e) {
    console.error('statuses load failed', e);
  } finally {
    loading.value = false;
  }
};

const markViewed = (it) => {
  if (!it || it.viewed_at || it.is_mine) return;
  it.viewed_at = new Date().toISOString();
  crm.client().post(`/statuses/${it.id}/view`).catch(() => {});
};

const startTimer = () => {
  clearInterval(segTimer);
  segProgress.value = 0;
  segStart = Date.now();
  // images/text auto-advance; audio/video drive their own progression
  const it = currentItem.value;
  if (!it || it.type === 'video' || it.type === 'audio' || it.type === 'voice') return;
  segTimer = setInterval(() => {
    segProgress.value = Math.min(100, ((Date.now() - segStart) / 6000) * 100);
    if (segProgress.value >= 100) nextItem();
  }, 100);
};
const pauseTimer = () => { clearInterval(segTimer); segProgress.value = 0; };
const itemLoaded = () => {};

const openViewer = (group) => {
  if (!group || !group.items?.length) return;
  viewer.value = { group, idx: 0 };
  markViewed(currentItem.value);
  startTimer();
};
const closeViewer = () => {
  clearInterval(segTimer);
  viewer.value = { group: null, idx: 0 };
  segProgress.value = 0;
  load(); // re-split recent/viewed
};
const nextItem = () => {
  if (!viewer.value.group) return;
  if (viewer.value.idx < viewer.value.group.items.length - 1) {
    viewer.value.idx++;
    markViewed(currentItem.value);
    startTimer();
  } else {
    closeViewer();
  }
};
const prevItem = () => {
  if (viewer.value.idx > 0) {
    viewer.value.idx--;
    markViewed(currentItem.value);
    startTimer();
  } else {
    startTimer();
  }
};
const onContentClick = () => {};

const handleRealtime = (ev) => {
  const type = ev?.type;
  const data = ev?.data || {};
  if (type === 'status.new' && data.status) {
    load(); // regroup — newest first ordering matters
    return;
  }
  if (type === 'status.deleted') {
    const all = [...mine.value, ...recent.value.flatMap((g) => g.items), ...viewed.value.flatMap((g) => g.items)];
    const it = all.find((i) => i.id === data.status_id);
    if (it) it.deleted_at = new Date().toISOString(); else load();
    return;
  }
  if (type === 'status.media') {
    const all = [...mine.value, ...recent.value.flatMap((g) => g.items), ...viewed.value.flatMap((g) => g.items)];
    const it = all.find((i) => i.id === data.status_id);
    if (it) it.media_url = data.media_url;
  }
};

const onKey = (e) => {
  if (!viewer.value.group) return;
  if (e.key === 'Escape') closeViewer();
  else if (e.key === 'ArrowLeft') nextItem();
  else if (e.key === 'ArrowRight') prevItem();
};

onMounted(async () => {
  await load();
  const echo = getEcho();
  const channel = crmChannelName();
  if (echo && channel) {
    crmChannel = echo.private(channel).listen('.crm.event', handleRealtime);
  }
  pollTimer = setInterval(() => { if (!viewer.value.group) load(); }, 30000);
  window.addEventListener('keydown', onKey);
});

onUnmounted(() => {
  clearInterval(segTimer);
  clearInterval(pollTimer);
  window.removeEventListener('keydown', onKey);
  if (crmChannel) {
    try { crmChannel.stopListening('.crm.event', handleRealtime); } catch {}
  }
});
</script>
