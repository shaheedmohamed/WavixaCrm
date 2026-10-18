<template>
  <div class="h-full overflow-y-auto p-4 md:p-8 space-y-6" dir="rtl">
    <div>
      <h1 class="text-2xl md:text-3xl font-black text-white">سجلات النشاط</h1>
      <p class="text-slate-400 text-sm mt-1">مراقبة كل اللي بيحصل على المنصة — الإجراءات ومحاولات الدخول</p>
    </div>

    <!-- Tabs -->
    <div class="flex items-center gap-2 border-b border-slate-800 pb-px">
      <button v-for="t in tabs" :key="t.key" @click="tab = t.key"
        class="px-5 py-2.5 text-sm font-bold rounded-t-xl transition-colors"
        :class="tab === t.key ? 'bg-slate-800 text-emerald-400 border-x border-t border-slate-700' : 'text-slate-400 hover:text-white'">
        {{ t.label }}
        <span v-if="t.key === 'logins' && failed24h > 0" class="mr-1 px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 text-[10px]">{{ failed24h }}</span>
      </button>
    </div>

    <!-- Audit Logs Tab -->
    <template v-if="tab === 'audit'">
      <div class="flex flex-wrap items-center gap-3">
        <div class="relative flex-1 min-w-[200px] max-w-sm">
          <input v-model="auditSearch" @input="debouncedAudit" type="text" placeholder="بحث باسم الفاعل..."
            class="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-2.5 pr-10 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500" />
          <svg class="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
        </div>
        <select v-model="auditAction" @change="loadAudit(1)" class="bg-slate-800/80 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white">
          <option value="">كل الإجراءات</option>
          <option v-for="a in actions" :key="a" :value="a">{{ a }}</option>
        </select>
        <select v-model="auditCustomer" @change="loadAudit(1)" class="bg-slate-800/80 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white">
          <option value="">كل العملاء</option>
          <option v-for="c in customers" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
      </div>

      <div v-if="auditLoading" class="p-16 text-center text-slate-400 text-sm">جاري تحميل السجل...</div>
      <div v-else-if="auditLogs.length === 0" class="p-12 text-center bg-slate-800/40 rounded-3xl border border-dashed border-slate-700">
        <p class="text-sm text-slate-400">لا توجد سجلات.</p>
      </div>
      <div v-else class="bg-slate-800/80 border border-slate-700/80 rounded-3xl overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm min-w-[800px]">
            <thead>
              <tr class="border-b border-slate-700/80 text-slate-400 text-[11px]">
                <th class="text-right font-bold px-5 py-4">الفاعل</th>
                <th class="text-right font-bold px-4 py-4">الإجراء</th>
                <th class="text-center font-bold px-4 py-4">محادثة</th>
                <th class="text-center font-bold px-4 py-4">رسالة</th>
                <th class="text-center font-bold px-4 py-4">IP</th>
                <th class="text-center font-bold px-4 py-4">الوقت</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="l in auditLogs" :key="l.id" class="border-b border-slate-800/60 hover:bg-slate-800/40">
                <td class="px-5 py-3.5 font-bold text-white text-xs">{{ l.actor_name || '—' }}</td>
                <td class="px-4 py-3.5">
                  <span class="px-2.5 py-1 rounded-full bg-slate-700/60 text-slate-300 text-[10px] font-bold" dir="ltr">{{ l.action }}</span>
                </td>
                <td class="px-4 py-3.5 text-center text-slate-400 text-xs" dir="ltr">{{ l.conversation_id || '—' }}</td>
                <td class="px-4 py-3.5 text-center text-slate-400 text-xs" dir="ltr">{{ l.message_id || '—' }}</td>
                <td class="px-4 py-3.5 text-center text-slate-500 text-[10px]" dir="ltr">{{ l.ip || '—' }}</td>
                <td class="px-4 py-3.5 text-center text-slate-400 text-[11px]" dir="ltr">{{ formatDate(l.created_at) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div v-if="auditPagination.last_page > 1" class="flex items-center justify-center gap-2">
        <button :disabled="auditPagination.current_page <= 1" @click="loadAudit(auditPagination.current_page - 1)"
          class="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold disabled:opacity-40">السابق</button>
        <span class="text-xs text-slate-400">{{ auditPagination.current_page }} / {{ auditPagination.last_page }}</span>
        <button :disabled="auditPagination.current_page >= auditPagination.last_page" @click="loadAudit(auditPagination.current_page + 1)"
          class="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold disabled:opacity-40">التالي</button>
      </div>
    </template>

    <!-- Login History Tab -->
    <template v-else>
      <div class="flex flex-wrap items-center gap-3">
        <div class="relative flex-1 min-w-[200px] max-w-sm">
          <input v-model="loginSearch" @input="debouncedLogins" type="text" placeholder="بحث بالبريد..."
            class="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-2.5 pr-10 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500" />
          <svg class="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
        </div>
        <select v-model="loginSuccess" @change="loadLogins(1)" class="bg-slate-800/80 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white">
          <option value="">الكل</option>
          <option value="1">ناجحة</option>
          <option value="0">فاشلة</option>
        </select>
        <div v-if="failed24h > 0" class="px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-bold">
          {{ failed24h }} محاولة فاشلة آخر ٢٤ ساعة
        </div>
      </div>

      <div v-if="loginLoading" class="p-16 text-center text-slate-400 text-sm">جاري تحميل السجل...</div>
      <div v-else-if="loginLogs.length === 0" class="p-12 text-center bg-slate-800/40 rounded-3xl border border-dashed border-slate-700">
        <p class="text-sm text-slate-400">لا توجد سجلات دخول.</p>
      </div>
      <div v-else class="bg-slate-800/80 border border-slate-700/80 rounded-3xl overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm min-w-[900px]">
            <thead>
              <tr class="border-b border-slate-700/80 text-slate-400 text-[11px]">
                <th class="text-right font-bold px-5 py-4">البريد</th>
                <th class="text-center font-bold px-4 py-4">النتيجة</th>
                <th class="text-center font-bold px-4 py-4">السبب</th>
                <th class="text-right font-bold px-4 py-4">الجهاز</th>
                <th class="text-center font-bold px-4 py-4">IP</th>
                <th class="text-center font-bold px-4 py-4">الوقت</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="l in loginLogs" :key="l.id" class="border-b border-slate-800/60 hover:bg-slate-800/40">
                <td class="px-5 py-3.5 font-bold text-white text-xs" dir="ltr">{{ l.attempted_email }}</td>
                <td class="px-4 py-3.5 text-center">
                  <span class="px-2.5 py-1 rounded-full text-[10px] font-bold"
                    :class="l.success ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'">
                    {{ l.success ? 'ناجح' : 'فاشل' }}
                  </span>
                </td>
                <td class="px-4 py-3.5 text-center text-slate-400 text-[10px]" dir="ltr">{{ l.failure_reason || '—' }}</td>
                <td class="px-4 py-3.5 text-slate-400 text-[10px]">
                  {{ l.browser || '' }} {{ l.os ? '· ' + l.os : '' }}
                </td>
                <td class="px-4 py-3.5 text-center text-slate-500 text-[10px]" dir="ltr">{{ l.ip_address || '—' }}</td>
                <td class="px-4 py-3.5 text-center text-slate-400 text-[11px]" dir="ltr">{{ formatDate(l.login_at) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div v-if="loginPagination.last_page > 1" class="flex items-center justify-center gap-2">
        <button :disabled="loginPagination.current_page <= 1" @click="loadLogins(loginPagination.current_page - 1)"
          class="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold disabled:opacity-40">السابق</button>
        <span class="text-xs text-slate-400">{{ loginPagination.current_page }} / {{ loginPagination.last_page }}</span>
        <button :disabled="loginPagination.current_page >= loginPagination.last_page" @click="loadLogins(loginPagination.current_page + 1)"
          class="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold disabled:opacity-40">التالي</button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue';
import crm from '@/services/crm';

const tab = ref('audit');
const tabs = [
  { key: 'audit', label: 'سجل الإجراءات' },
  { key: 'logins', label: 'سجل الدخول' },
];

const customers = ref([]);
const actions = ref([]);
const failed24h = ref(0);

const auditLoading = ref(false);
const auditLogs = ref([]);
const auditSearch = ref('');
const auditAction = ref('');
const auditCustomer = ref('');
const auditPagination = ref({ current_page: 1, last_page: 1 });
let auditDebounce = null;

const loginLoading = ref(false);
const loginLogs = ref([]);
const loginSearch = ref('');
const loginSuccess = ref('');
const loginPagination = ref({ current_page: 1, last_page: 1 });
let loginDebounce = null;
let loginsLoaded = false;

const loadAudit = async (page = 1) => {
  auditLoading.value = true;
  try {
    const res = await crm.client().get('/admin/audit-logs', {
      params: { q: auditSearch.value || undefined, action: auditAction.value || undefined, customer_id: auditCustomer.value || undefined, page },
    });
    if (res.data?.success) {
      auditLogs.value = res.data.logs?.data || [];
      actions.value = res.data.actions || [];
      auditPagination.value = { current_page: res.data.logs?.current_page, last_page: res.data.logs?.last_page };
    }
  } catch (e) { console.error(e); }
  finally { auditLoading.value = false; }
};

const loadLogins = async (page = 1) => {
  loginLoading.value = true;
  try {
    const res = await crm.client().get('/admin/login-history', {
      params: { q: loginSearch.value || undefined, success: loginSuccess.value === '' ? undefined : loginSuccess.value, page },
    });
    if (res.data?.success) {
      loginLogs.value = res.data.logs?.data || [];
      failed24h.value = res.data.failed_24h || 0;
      loginPagination.value = { current_page: res.data.logs?.current_page, last_page: res.data.logs?.last_page };
    }
  } catch (e) { console.error(e); }
  finally { loginLoading.value = false; }
};

const debouncedAudit = () => { clearTimeout(auditDebounce); auditDebounce = setTimeout(() => loadAudit(1), 350); };
const debouncedLogins = () => { clearTimeout(loginDebounce); loginDebounce = setTimeout(() => loadLogins(1), 350); };

watch(tab, (t) => {
  if (t === 'logins' && !loginsLoaded) { loginsLoaded = true; loadLogins(); }
});

const formatDate = (v) => {
  if (!v) return '—';
  return new Date(v).toLocaleString('ar-EG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

onMounted(async () => {
  loadAudit();
  try {
    const res = await crm.client().get('/admin/customers');
    customers.value = res.data?.customers || [];
  } catch (e) { /* filter stays empty */ }
});
</script>
