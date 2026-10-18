<template>
  <div class="h-full overflow-y-auto p-4 md:p-8 space-y-6" dir="rtl">
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 class="text-2xl md:text-3xl font-black text-white">كل الأجهزة</h1>
        <p class="text-slate-400 text-sm mt-1">أجهزة الواتساب المتصلة عند كل العملاء — الحالة والاستهلاك</p>
      </div>
      <button @click="load" class="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-bold transition-colors self-start sm:self-auto">
        تحديث
      </button>
    </div>

    <!-- Filters -->
    <div class="flex flex-wrap items-center gap-3">
      <div class="relative flex-1 min-w-[200px] max-w-sm">
        <input v-model="search" @input="debouncedLoad" type="text" placeholder="بحث باسم الجهاز أو الرقم..."
          class="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-2.5 pr-10 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500" />
        <svg class="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
      </div>
      <select v-model="statusFilter" @change="load(1)" class="bg-slate-800/80 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white">
        <option value="">كل الحالات</option>
        <option value="connected">متصل</option>
        <option value="pending">بانتظار الربط</option>
        <option value="disconnected">مفصول</option>
      </select>
      <select v-model="customerFilter" @change="load(1)" class="bg-slate-800/80 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white">
        <option value="">كل العملاء</option>
        <option v-for="c in customers" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>
    </div>

    <div v-if="loading" class="p-16 text-center text-slate-400 text-sm">جاري تحميل الأجهزة...</div>

    <div v-else-if="devices.length === 0" class="p-12 text-center bg-slate-800/40 rounded-3xl border border-dashed border-slate-700">
      <p class="text-sm text-slate-400">لا توجد أجهزة مطابقة.</p>
    </div>

    <div v-else class="bg-slate-800/80 border border-slate-700/80 rounded-3xl overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm min-w-[900px]">
          <thead>
            <tr class="border-b border-slate-700/80 text-slate-400 text-[11px]">
              <th class="text-right font-bold px-5 py-4">الجهاز</th>
              <th class="text-right font-bold px-4 py-4">العميل</th>
              <th class="text-center font-bold px-4 py-4">الحالة</th>
              <th class="text-center font-bold px-4 py-4">محادثات</th>
              <th class="text-center font-bold px-4 py-4">رسائل اليوم</th>
              <th class="text-center font-bold px-4 py-4">إجمالي المرسل</th>
              <th class="text-center font-bold px-4 py-4">آخر نشاط</th>
              <th class="text-center font-bold px-4 py-4">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in devices" :key="d.id" class="border-b border-slate-800/60 hover:bg-slate-800/40 transition-colors">
              <td class="px-5 py-4">
                <div class="flex items-center gap-3">
                  <div class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    :class="d.status === 'connected' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-700/60 text-slate-400'">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
                  </div>
                  <div class="min-w-0">
                    <p class="font-bold text-white truncate">{{ d.device_name || 'جهاز ' + d.id }}</p>
                    <p class="text-[10px] text-slate-500" dir="ltr">{{ d.phone_number || 'لم يرتبط بعد' }}</p>
                  </div>
                </div>
              </td>
              <td class="px-4 py-4">
                <p v-if="d.customer" class="text-slate-300 text-xs font-bold">{{ d.customer.name }}</p>
                <p v-if="d.customer" class="text-[10px] text-slate-500" dir="ltr">{{ d.customer.email }}</p>
                <p v-else class="text-slate-500 text-xs">—</p>
              </td>
              <td class="px-4 py-4 text-center">
                <span class="px-2.5 py-1 rounded-full text-[10px] font-bold"
                  :class="d.status === 'connected' ? 'bg-emerald-500/15 text-emerald-400' : d.status === 'pending' ? 'bg-amber-500/15 text-amber-300' : 'bg-slate-700/60 text-slate-400'">
                  {{ d.status === 'connected' ? 'متصل' : d.status === 'pending' ? 'بانتظار الربط' : 'مفصول' }}
                </span>
              </td>
              <td class="px-4 py-4 text-center text-slate-300 font-bold" dir="ltr">{{ d.conversations }}</td>
              <td class="px-4 py-4 text-center text-emerald-400 font-bold" dir="ltr">{{ d.messages_sent_today }}</td>
              <td class="px-4 py-4 text-center text-slate-300 font-bold" dir="ltr">{{ d.messages_sent_total }}</td>
              <td class="px-4 py-4 text-center text-[11px] text-slate-400" dir="ltr">{{ formatDate(d.last_activity_at) }}</td>
              <td class="px-4 py-4">
                <div class="flex items-center justify-center gap-2">
                  <button v-if="d.customer" @click="$router.push(`/crm/admin/customers/${d.customer.id}`)"
                    class="px-2.5 py-1.5 rounded-lg bg-slate-700/70 hover:bg-slate-700 text-[10px] font-bold text-slate-300 transition-colors">
                    العميل
                  </button>
                  <button v-if="d.status === 'connected'" @click="disconnect(d)"
                    class="px-2.5 py-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 text-[10px] font-bold text-red-400 transition-colors">
                    فصل
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Pagination -->
    <div v-if="pagination.last_page > 1" class="flex items-center justify-center gap-2">
      <button :disabled="pagination.current_page <= 1" @click="load(pagination.current_page - 1)"
        class="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold disabled:opacity-40">السابق</button>
      <span class="text-xs text-slate-400">{{ pagination.current_page }} / {{ pagination.last_page }}</span>
      <button :disabled="pagination.current_page >= pagination.last_page" @click="load(pagination.current_page + 1)"
        class="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold disabled:opacity-40">التالي</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import crm from '@/services/crm';

const loading = ref(true);
const devices = ref([]);
const customers = ref([]);
const search = ref('');
const statusFilter = ref('');
const customerFilter = ref('');
const pagination = ref({ current_page: 1, last_page: 1, total: 0 });
let debounce = null;

const load = async (page = 1) => {
  loading.value = true;
  try {
    const res = await crm.client().get('/admin/devices', {
      params: { q: search.value || undefined, status: statusFilter.value || undefined, customer_id: customerFilter.value || undefined, page },
    });
    if (res.data?.success) {
      devices.value = res.data.devices || [];
      pagination.value = res.data.pagination;
    }
  } catch (e) { console.error(e); }
  finally { loading.value = false; }
};

const debouncedLoad = () => {
  clearTimeout(debounce);
  debounce = setTimeout(() => load(1), 350);
};

const disconnect = async (d) => {
  if (!confirm(`فصل الجهاز "${d.device_name || d.phone_number}" عن واتساب؟`)) return;
  try {
    await crm.client().post(`/admin/devices/${d.id}/disconnect`);
    load(pagination.value.current_page);
  } catch (e) { alert('فشل فصل الجهاز'); }
};

const formatDate = (v) => {
  if (!v) return '—';
  return new Date(v).toLocaleString('ar-EG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

onMounted(async () => {
  load();
  try {
    const res = await crm.client().get('/admin/customers');
    customers.value = res.data?.customers || [];
  } catch (e) { /* filter stays empty */ }
});
</script>
