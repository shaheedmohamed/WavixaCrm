<template>
  <div class="h-full overflow-y-auto p-4 md:p-8 space-y-6" dir="rtl">
    <!-- Header -->
    <div class="flex items-center gap-4">
      <button @click="$router.push('/crm/admin')" class="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors" title="رجوع">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
      </button>
      <div v-if="customer" class="flex items-center gap-3 min-w-0">
        <div class="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white font-black flex items-center justify-center text-lg shrink-0">
          {{ customer.name ? customer.name.trim().charAt(0) : 'C' }}
        </div>
        <div class="min-w-0">
          <h1 class="text-xl md:text-2xl font-black text-white truncate">{{ customer.name }}</h1>
          <p class="text-xs text-slate-400 font-mono" dir="ltr">{{ customer.email }}</p>
        </div>
        <span
          class="px-2.5 py-1 rounded-full text-[10px] font-bold shrink-0"
          :class="customer.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'"
        >{{ statusLabel(customer.status) }}</span>
      </div>
    </div>

    <!-- Tabs -->
    <div class="flex items-center gap-1.5 bg-slate-800/80 border border-slate-700 rounded-xl p-1 w-fit">
      <button v-for="t in tabs" :key="t.key" @click="tab = t.key"
        class="px-4 py-2 rounded-lg text-xs font-bold transition-all"
        :class="tab === t.key ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-300 hover:text-white hover:bg-slate-700'">
        {{ t.label }}
      </button>
    </div>

    <div v-if="loading" class="p-16 text-center text-slate-400 text-sm">جاري التحميل...</div>

    <template v-else-if="customer">
      <!-- Overview Tab -->
      <div v-if="tab === 'overview'" class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div v-for="s in statCards" :key="s.label" class="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4">
          <p class="text-[11px] font-bold text-slate-400 mb-1.5">{{ s.label }}</p>
          <p class="text-2xl font-black" :class="s.color || 'text-white'" dir="ltr">{{ s.value }}</p>
        </div>
      </div>

      <!-- Devices Tab -->
      <div v-if="tab === 'devices'">
        <div v-if="devices.length === 0" class="p-12 text-center bg-slate-800/40 rounded-3xl border border-dashed border-slate-700 text-sm text-slate-400">
          العميل لسه مربطش أي جهاز.
        </div>
        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div v-for="d in devices" :key="d.id" class="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-5 space-y-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
                </div>
                <div>
                  <p class="font-bold text-white text-sm">{{ d.device_name }}</p>
                  <p class="text-[11px] text-slate-400 font-mono" dir="ltr">{{ d.phone_number || '—' }}</p>
                </div>
              </div>
              <span
                class="px-2.5 py-1 rounded-full text-[10px] font-bold"
                :class="d.status === 'connected' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-700/60 text-slate-300 border border-slate-600/40'"
              >{{ d.status === 'connected' ? 'متصل' : d.status }}</span>
            </div>
            <div class="grid grid-cols-2 gap-2 text-center">
              <div class="bg-slate-900/60 rounded-xl p-2.5">
                <p class="text-[10px] text-slate-500 font-bold">محادثات</p>
                <p class="text-lg font-black text-white" dir="ltr">{{ d.conversations }}</p>
              </div>
              <div class="bg-slate-900/60 rounded-xl p-2.5">
                <p class="text-[10px] text-slate-500 font-bold">رسائل مرسلة</p>
                <p class="text-lg font-black text-emerald-400" dir="ltr">{{ d.messages_sent }}</p>
              </div>
            </div>
            <p class="text-[10px] text-slate-500">آخر نشاط: <span dir="ltr">{{ formatDate(d.last_activity_at) }}</span></p>
          </div>
        </div>
      </div>

      <!-- Agents Tab -->
      <div v-if="tab === 'agents'">
        <div v-if="agents.length === 0" class="p-12 text-center bg-slate-800/40 rounded-3xl border border-dashed border-slate-700 text-sm text-slate-400">
          مفيش موظفين عند العميل ده.
        </div>
        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div v-for="a in agents" :key="a.id" class="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-sky-500 text-white font-bold flex items-center justify-center text-sm">
              {{ a.name ? a.name.trim().charAt(0) : 'A' }}
            </div>
            <div class="flex-1 min-w-0">
              <p class="font-bold text-white text-sm truncate">{{ a.name }}</p>
              <p class="text-[10px] text-slate-500 font-mono truncate" dir="ltr">{{ a.email }}</p>
            </div>
            <span
              class="px-2 py-0.5 rounded-full text-[10px] font-bold"
              :class="a.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'"
            >{{ statusLabel(a.status) }}</span>
          </div>
        </div>
      </div>

      <!-- Conversations Tab -->
      <div v-if="tab === 'chats'" class="space-y-4">
        <div class="flex items-center gap-3">
          <div class="relative flex-1 max-w-sm">
            <input v-model="convSearch" @input="debouncedConvs" type="text" placeholder="بحث بالاسم أو الرقم..."
              class="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-2.5 pr-10 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500" />
            <svg class="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          </div>
          <select v-model="convStatus" @change="loadConversations" class="bg-slate-800/80 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white">
            <option value="">الكل</option>
            <option value="open">مفتوحة</option>
            <option value="resolved">منجزة</option>
          </select>
        </div>

        <div v-if="convs.length === 0" class="p-12 text-center bg-slate-800/40 rounded-3xl border border-dashed border-slate-700 text-sm text-slate-400">
          لا توجد محادثات.
        </div>

        <div v-else class="bg-slate-800/80 border border-slate-700/80 rounded-3xl divide-y divide-slate-800/60 overflow-hidden">
          <button
            v-for="c in convs" :key="c.id"
            @click="openChat(c)"
            class="w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-800/40 transition-colors text-right"
          >
            <div class="w-10 h-10 rounded-full bg-slate-700 text-slate-200 font-bold flex items-center justify-center text-sm shrink-0">
              {{ (c.contact_name || c.contact_phone || '?').trim().charAt(0) }}
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <p class="font-bold text-white text-sm truncate">{{ c.contact_name || c.contact_phone }}</p>
                <span v-if="c.resolved_at" class="px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-300 text-[9px] font-bold">منجزة</span>
                <span v-if="c.rating" class="text-yellow-400 text-[10px] font-bold" dir="ltr">★{{ c.rating }}</span>
              </div>
              <p class="text-xs text-slate-400 truncate mt-0.5" dir="auto">{{ c.last_message || '—' }}</p>
              <p class="text-[10px] text-slate-500 mt-0.5">
                {{ c.device?.device_name }} · <span dir="ltr">{{ c.contact_phone }}</span> · {{ c.messages_count }} رسالة
                <template v-if="c.assigned_agent"> · {{ c.assigned_agent }}</template>
              </p>
            </div>
            <div class="text-left shrink-0">
              <p class="text-[10px] text-slate-500" dir="ltr">{{ formatDate(c.last_message_at) }}</p>
              <span v-if="c.unread_count > 0" class="inline-block mt-1 px-2 py-0.5 rounded-full bg-emerald-500 text-slate-950 font-bold text-[10px]" dir="ltr">{{ c.unread_count }}</span>
            </div>
          </button>
        </div>

        <div v-if="pagination.last_page > 1" class="flex items-center justify-center gap-2">
          <button @click="loadConversations(pagination.current_page - 1)" :disabled="pagination.current_page <= 1"
            class="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold disabled:opacity-40">السابق</button>
          <span class="text-xs text-slate-400" dir="ltr">{{ pagination.current_page }} / {{ pagination.last_page }}</span>
          <button @click="loadConversations(pagination.current_page + 1)" :disabled="pagination.current_page >= pagination.last_page"
            class="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold disabled:opacity-40">التالي</button>
        </div>
      </div>
    </template>

    <!-- Chat Viewer Modal (read-only) -->
    <div v-if="chatOpen" class="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div class="bg-slate-900 border border-slate-700/80 rounded-3xl w-full max-w-2xl h-[80vh] shadow-2xl flex flex-col overflow-hidden">
        <!-- Chat Header -->
        <div class="px-5 py-4 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-9 h-9 rounded-full bg-slate-700 text-slate-200 font-bold flex items-center justify-center text-xs shrink-0">
              {{ (chat?.contact_name || chat?.contact_phone || '?').trim().charAt(0) }}
            </div>
            <div class="min-w-0">
              <p class="font-bold text-white text-sm truncate">{{ chat?.contact_name || chat?.contact_phone }}</p>
              <p class="text-[10px] text-slate-500" dir="ltr">{{ chat?.contact_phone }} · {{ chat?.device?.device_name }}</p>
            </div>
          </div>
          <button @click="chatOpen = false" class="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <!-- Messages -->
        <div ref="msgBox" class="flex-1 overflow-y-auto p-4 space-y-2.5 bg-slate-950/40">
          <div v-if="chatLoading" class="p-8 text-center text-slate-500 text-xs">جاري تحميل الرسائل...</div>
          <button v-if="hasMore && !chatLoading" @click="loadMoreMessages"
            class="w-full py-1.5 text-center text-[11px] text-emerald-400 hover:text-emerald-300 font-bold">
            تحميل رسائل أقدم
          </button>
          <div
            v-for="m in messages" :key="m.id"
            class="max-w-[75%] rounded-2xl px-3.5 py-2 text-sm"
            :class="m.direction === 'outgoing'
              ? 'bg-emerald-700/80 text-white mr-auto rounded-tl-sm'
              : 'bg-slate-800 text-slate-100 ml-auto rounded-tr-sm'"
          >
            <p v-if="m.media_url || m.media_meta" class="text-[10px] text-emerald-300 font-bold mb-1">📎 ميديا ({{ m.message_type }})</p>
            <p class="whitespace-pre-wrap break-words" dir="auto">{{ m.message || m.media_caption || '' }}</p>
            <p class="text-[9px] mt-1 opacity-60" dir="ltr">{{ formatTime(m.created_at) }}</p>
          </div>
          <p v-if="!chatLoading && messages.length === 0" class="p-8 text-center text-slate-500 text-xs">لا توجد رسائل.</p>
        </div>

        <div class="px-5 py-3 border-t border-slate-800 text-center text-[10px] text-slate-500 shrink-0">
          عرض للقراءة فقط — وضع الأدمن
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import crm from '@/services/crm';

const route = useRoute();
const customerId = route.params.id;

const loading = ref(true);
const customer = ref(null);
const devices = ref([]);
const agents = ref([]);
const tab = ref('overview');
const tabs = [
  { key: 'overview', label: 'نظرة عامة' },
  { key: 'devices', label: 'الأجهزة' },
  { key: 'agents', label: 'الموظفون' },
  { key: 'chats', label: 'المحادثات' },
];

const convs = ref([]);
const convSearch = ref('');
const convStatus = ref('');
const pagination = ref({ current_page: 1, last_page: 1, total: 0 });
let convDebounce = null;

const chatOpen = ref(false);
const chat = ref(null);
const messages = ref([]);
const chatLoading = ref(false);
const hasMore = ref(false);
const msgBox = ref(null);

const statusLabel = (s) => ({ active: 'نشط', inactive: 'معطل', suspended: 'موقوف' }[s] || s);

const statCards = computed(() => customer.value ? [
  { label: 'الأجهزة (متصل)', value: `${customer.value.devices_connected}/${customer.value.devices_total}` },
  { label: 'الموظفون', value: customer.value.agents_count },
  { label: 'المحادثات', value: customer.value.conversations_total },
  { label: 'غير مقروءة', value: customer.value.unread, color: 'text-amber-300' },
  { label: 'رسائل اليوم', value: customer.value.messages_sent_today, color: 'text-emerald-400' },
  { label: 'رسائل الشهر', value: customer.value.messages_sent_month, color: 'text-sky-300' },
  { label: 'إجمالي المرسل', value: customer.value.messages_sent_total },
  { label: 'عضو منذ', value: formatDate(customer.value.created_at) },
] : []);

const formatDate = (ts) => {
  if (!ts) return '—';
  const d = new Date(String(ts).replace(' ', 'T'));
  if (isNaN(d)) return ts;
  const diff = (Date.now() - d) / 1000;
  if (diff < 3600) return `منذ ${Math.max(1, Math.floor(diff / 60))} د`;
  if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} س`;
  return d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
};

const formatTime = (ts) => {
  if (!ts) return '';
  const d = new Date(String(ts).replace(' ', 'T'));
  if (isNaN(d)) return ts;
  return d.toLocaleString('ar-EG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const loadDetail = async () => {
  loading.value = true;
  try {
    const res = await crm.client().get(`/admin/customers/${customerId}`);
    if (res.data?.success) {
      customer.value = res.data.customer;
      devices.value = res.data.devices || [];
      agents.value = res.data.agents || [];
    }
  } catch (e) { console.error(e); }
  finally { loading.value = false; }
};

const loadConversations = async (page = 1) => {
  try {
    const res = await crm.client().get(`/admin/customers/${customerId}/conversations`, {
      params: { q: convSearch.value || undefined, status: convStatus.value || undefined, page },
    });
    if (res.data?.success) {
      convs.value = res.data.conversations || [];
      pagination.value = res.data.pagination;
    }
  } catch (e) { console.error(e); }
};

const debouncedConvs = () => {
  clearTimeout(convDebounce);
  convDebounce = setTimeout(() => loadConversations(1), 350);
};

const openChat = async (c) => {
  chat.value = c;
  chatOpen.value = true;
  chatLoading.value = true;
  messages.value = [];
  try {
    const res = await crm.client().get(`/admin/conversations/${c.id}/messages`);
    if (res.data?.success) {
      messages.value = res.data.messages || [];
      hasMore.value = res.data.has_more;
      await nextTick();
      msgBox.value?.scrollTo({ top: msgBox.value.scrollHeight });
    }
  } catch (e) { console.error(e); }
  finally { chatLoading.value = false; }
};

const loadMoreMessages = async () => {
  const oldest = messages.value[0]?.id;
  if (!oldest) return;
  try {
    const res = await crm.client().get(`/admin/conversations/${chat.value.id}/messages`, {
      params: { before_id: oldest },
    });
    if (res.data?.success) {
      messages.value = [...(res.data.messages || []), ...messages.value];
      hasMore.value = res.data.has_more;
    }
  } catch (e) { console.error(e); }
};

onMounted(() => { loadDetail(); loadConversations(); });
</script>
