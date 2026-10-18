<template>
  <div class="h-full overflow-y-auto p-4 md:p-8 space-y-6" dir="rtl">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 class="text-2xl md:text-3xl font-black text-white">لوحة الأدمن</h1>
        <p class="text-slate-400 text-sm mt-1">إدارة عملاء المنصة — الحسابات، الأجهزة المتصلة، واستهلاك الرسائل</p>
      </div>
      <button
        @click="openCustomerModal()"
        class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-600/20 transition-all self-start sm:self-auto"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/></svg>
        <span>إضافة عميل جديد</span>
      </button>
    </div>

    <!-- KPI Cards -->
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      <div class="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4">
        <p class="text-[11px] font-bold text-slate-400 mb-1.5">العملاء</p>
        <p class="text-2xl font-black text-white" dir="ltr">{{ overview.customers ?? '—' }}</p>
      </div>
      <div class="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4">
        <p class="text-[11px] font-bold text-slate-400 mb-1.5">الأجهزة</p>
        <p class="text-2xl font-black text-white" dir="ltr">{{ overview.devices ?? '—' }}
          <span class="text-xs font-bold text-emerald-400">({{ overview.connected_devices ?? 0 }} متصل)</span>
        </p>
      </div>
      <div class="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4">
        <p class="text-[11px] font-bold text-slate-400 mb-1.5">رسائل اليوم</p>
        <p class="text-2xl font-black text-emerald-400" dir="ltr">{{ overview.messages_today ?? '—' }}</p>
      </div>
      <div class="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4">
        <p class="text-[11px] font-bold text-slate-400 mb-1.5">إجمالي الرسائل</p>
        <p class="text-2xl font-black text-white" dir="ltr">{{ overview.messages_total ?? '—' }}</p>
      </div>
      <div class="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 col-span-2 md:col-span-1">
        <p class="text-[11px] font-bold text-slate-400 mb-1.5">محادثات مفتوحة</p>
        <p class="text-2xl font-black text-amber-300" dir="ltr">{{ overview.open_conversations ?? '—' }}</p>
      </div>
    </div>

    <!-- Messages Chart -->
    <div class="bg-slate-800/80 border border-slate-700/80 rounded-3xl p-5">
      <div class="flex items-center justify-between mb-4">
        <h2 class="font-black text-white text-sm">نشاط الرسائل — آخر ١٤ يوم</h2>
        <div class="flex items-center gap-4 text-[10px] font-bold">
          <span class="flex items-center gap-1.5 text-emerald-400"><span class="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block"></span> صادر</span>
          <span class="flex items-center gap-1.5 text-sky-400"><span class="w-2.5 h-2.5 rounded-sm bg-sky-500 inline-block"></span> وارد</span>
        </div>
      </div>
      <div v-if="chart.length === 0" class="h-28 flex items-center justify-center text-slate-500 text-xs">جاري التحميل...</div>
      <div v-else class="flex items-end gap-1.5 h-28" dir="ltr">
        <div v-for="d in chart" :key="d.day" class="flex-1 flex flex-col items-center justify-end gap-0.5 h-full group relative">
          <div class="absolute -top-9 hidden group-hover:block bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-[9px] text-white whitespace-nowrap z-10" dir="rtl">
            {{ d.day }} — صادر {{ d.outgoing }} / وارد {{ d.incoming }}
          </div>
          <div class="w-full flex gap-0.5 items-end h-full">
            <div class="flex-1 bg-emerald-500/80 rounded-t-sm transition-all" :style="{ height: barH(d.outgoing) }"></div>
            <div class="flex-1 bg-sky-500/80 rounded-t-sm transition-all" :style="{ height: barH(d.incoming) }"></div>
          </div>
          <span class="text-[8px] text-slate-500 truncate w-full text-center">{{ d.day.slice(5) }}</span>
        </div>
      </div>
    </div>

    <!-- Search -->
    <div class="flex items-center gap-3">
      <div class="relative flex-1 max-w-sm">
        <input
          v-model="search"
          @input="debouncedLoad"
          type="text"
          placeholder="بحث بالاسم أو البريد..."
          class="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-2.5 pr-10 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
        />
        <svg class="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
      </div>
      <select v-model="statusFilter" @change="loadCustomers" class="bg-slate-800/80 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white">
        <option value="">كل الحالات</option>
        <option value="active">نشط</option>
        <option value="inactive">معطل</option>
        <option value="suspended">موقوف</option>
      </select>
    </div>

    <!-- Customers Table -->
    <div v-if="loading" class="p-16 text-center text-slate-400 text-sm">جاري تحميل العملاء...</div>

    <div v-else-if="customers.length === 0" class="p-12 text-center bg-slate-800/40 rounded-3xl border border-dashed border-slate-700">
      <p class="text-sm text-slate-400">لا يوجد عملاء بعد — أضف أول عميل من الزرار فوق.</p>
    </div>

    <div v-else class="bg-slate-800/80 border border-slate-700/80 rounded-3xl overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm min-w-[950px]">
          <thead>
            <tr class="border-b border-slate-700/80 text-slate-400 text-[11px]">
              <th class="text-right font-bold px-5 py-4">العميل</th>
              <th class="text-center font-bold px-4 py-4">الحالة</th>
              <th class="text-center font-bold px-4 py-4">الأجهزة</th>
              <th class="text-center font-bold px-4 py-4">الموظفون</th>
              <th class="text-center font-bold px-4 py-4">محادثات</th>
              <th class="text-center font-bold px-4 py-4">رسائل اليوم</th>
              <th class="text-center font-bold px-4 py-4">رسائل الشهر</th>
              <th class="text-center font-bold px-4 py-4">إجمالي المرسل</th>
              <th class="text-center font-bold px-4 py-4">آخر نشاط</th>
              <th class="text-center font-bold px-4 py-4">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="c in customers"
              :key="c.id"
              class="border-b border-slate-800/60 hover:bg-slate-800/40 transition-colors cursor-pointer"
              @click="$router.push(`/crm/admin/customers/${c.id}`)"
            >
              <td class="px-5 py-4">
                <div class="flex items-center gap-3">
                  <div class="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white font-bold flex items-center justify-center text-xs shrink-0">
                    {{ c.name ? c.name.trim().charAt(0) : 'C' }}
                  </div>
                  <div class="min-w-0">
                    <p class="font-bold text-white text-sm truncate">{{ c.name }}</p>
                    <p class="text-[10px] text-slate-500 font-mono truncate" dir="ltr">{{ c.email }}</p>
                  </div>
                </div>
              </td>
              <td class="px-4 py-4 text-center">
                <span
                  class="px-2.5 py-1 rounded-full text-[10px] font-bold"
                  :class="c.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'"
                >{{ statusLabel(c.status) }}</span>
              </td>
              <td class="px-4 py-4 text-center" dir="ltr">
                <span class="text-sm font-bold text-slate-200">{{ c.devices_connected }}</span>
                <span class="text-slate-500 text-xs">/{{ c.devices_total }}</span>
              </td>
              <td class="px-4 py-4 text-center text-sm font-bold text-slate-200" dir="ltr">{{ c.agents_count }}</td>
              <td class="px-4 py-4 text-center text-sm font-bold text-slate-200" dir="ltr">{{ c.conversations_total }}</td>
              <td class="px-4 py-4 text-center text-sm font-bold text-emerald-400" dir="ltr">{{ c.messages_sent_today }}</td>
              <td class="px-4 py-4 text-center text-sm font-bold text-sky-300" dir="ltr">{{ c.messages_sent_month }}</td>
              <td class="px-4 py-4 text-center text-sm font-black text-white" dir="ltr">{{ c.messages_sent_total }}</td>
              <td class="px-4 py-4 text-center"><span class="text-[11px] text-slate-400" dir="ltr">{{ formatDate(c.last_activity_at) }}</span></td>
              <td class="px-4 py-4 text-center" @click.stop>
                <div class="inline-flex items-center gap-1.5">
                  <button
                    @click="openCustomerModal(c)"
                    class="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold transition-colors"
                  >تعديل</button>
                  <button
                    @click="toggleStatus(c)"
                    class="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                    :class="c.status === 'active' ? 'bg-amber-500/10 text-amber-300 hover:bg-amber-500/20' : 'bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'"
                  >{{ c.status === 'active' ? 'تعطيل' : 'تفعيل' }}</button>
                  <button
                    @click="removeCustomer(c)"
                    class="text-rose-400 hover:text-rose-300 p-1.5 rounded-lg hover:bg-rose-500/10 transition-colors"
                    title="حذف العميل"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal: Add / Edit Customer -->
    <div v-if="showModal" class="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div class="bg-slate-900 border border-slate-700/80 rounded-3xl w-full max-w-md p-6 shadow-2xl relative text-right">
        <button @click="showModal = false" class="absolute top-5 left-5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>

        <h2 class="text-xl font-bold text-white mb-1">{{ isEditing ? 'تعديل بيانات العميل' : 'إضافة عميل جديد' }}</h2>
        <p class="text-xs text-slate-400 mb-5">العميل هيدخل من /crm/login بالبيانات دي ويربط أرقام الواتساب بتاعته</p>

        <form @submit.prevent="saveCustomer" class="space-y-4">
          <div>
            <label class="block text-xs font-semibold text-slate-300 mb-1.5">اسم العميل</label>
            <input v-model="form.name" type="text" required placeholder="مثال: شركة النور"
              class="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500" />
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-300 mb-1.5">البريد الإلكتروني</label>
            <input v-model="form.email" type="email" required placeholder="client@company.com" dir="ltr"
              class="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono" />
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-300 mb-1.5">
              كلمة المرور <span v-if="isEditing" class="text-slate-500 font-normal">(اتركها فاضية لو مش عايز تغيرها)</span>
            </label>
            <input v-model="form.password" :required="!isEditing" type="text" placeholder="كلمة مرور الدخول" dir="ltr"
              class="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono" />
          </div>

          <button type="submit" :disabled="saving"
            class="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm rounded-xl transition-all shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 disabled:opacity-50">
            <svg v-if="saving" class="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>{{ saving ? 'جاري الحفظ...' : (isEditing ? 'حفظ التعديلات' : 'إنشاء الحساب') }}</span>
          </button>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import crm from '@/services/crm';

const loading = ref(true);
const saving = ref(false);
const overview = ref({});
const chart = ref([]);
const chartMax = computed(() => Math.max(1, ...chart.value.map(d => d.incoming + d.outgoing)));
const barH = (v) => `${Math.max(v > 0 ? 4 : 1, (v / chartMax.value) * 100)}%`;
const customers = ref([]);
const search = ref('');
const statusFilter = ref('');
const showModal = ref(false);
const isEditing = ref(false);
const editingId = ref(null);
const form = ref({ name: '', email: '', password: '' });
let debounce = null;

const statusLabel = (s) => ({ active: 'نشط', inactive: 'معطل', suspended: 'موقوف' }[s] || s);

const formatDate = (ts) => {
  if (!ts) return '—';
  const d = new Date(String(ts).replace(' ', 'T'));
  if (isNaN(d)) return ts;
  const diff = (Date.now() - d) / 1000;
  if (diff < 3600) return `منذ ${Math.max(1, Math.floor(diff / 60))} د`;
  if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} س`;
  return d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
};

const loadOverview = async () => {
  try {
    const res = await crm.client().get('/admin/overview');
    if (res.data?.success) overview.value = res.data.overview;
  } catch (e) { console.error(e); }
};

const loadCustomers = async () => {
  loading.value = true;
  try {
    const res = await crm.client().get('/admin/customers', {
      params: { q: search.value || undefined, status: statusFilter.value || undefined },
    });
    if (res.data?.success) customers.value = res.data.customers || [];
  } catch (e) { console.error(e); }
  finally { loading.value = false; }
};

const debouncedLoad = () => {
  clearTimeout(debounce);
  debounce = setTimeout(loadCustomers, 350);
};

const openCustomerModal = (c = null) => {
  isEditing.value = !!c;
  editingId.value = c?.id || null;
  form.value = { name: c?.name || '', email: c?.email || '', password: '' };
  showModal.value = true;
};

const saveCustomer = async () => {
  saving.value = true;
  try {
    if (isEditing.value) {
      await crm.client().put(`/admin/customers/${editingId.value}`, form.value);
    } else {
      await crm.client().post('/admin/customers', form.value);
    }
    showModal.value = false;
    await Promise.all([loadCustomers(), loadOverview()]);
  } catch (e) {
    alert(e.response?.data?.message || 'فشل الحفظ');
  } finally { saving.value = false; }
};

const toggleStatus = async (c) => {
  const next = c.status === 'active' ? 'inactive' : 'active';
  try {
    await crm.client().put(`/admin/customers/${c.id}`, {
      name: c.name, email: c.email, status: next,
    });
    await loadCustomers();
  } catch (e) { alert(e.response?.data?.message || 'فشل التحديث'); }
};

const removeCustomer = async (c) => {
  if (!confirm(`حذف "${c.name}" مع كل أجهزته ومحادثاته وموظفيه؟ لا يمكن التراجع.`)) return;
  try {
    await crm.client().delete(`/admin/customers/${c.id}`);
    await Promise.all([loadCustomers(), loadOverview()]);
  } catch (e) { alert(e.response?.data?.message || 'فشل الحذف'); }
};

const loadChart = async () => {
  try {
    const res = await crm.client().get('/admin/messages-chart', { params: { days: 14 } });
    if (res.data?.success) chart.value = res.data.series || [];
  } catch (e) { console.error(e); }
};

onMounted(() => { loadOverview(); loadCustomers(); loadChart(); });
</script>
