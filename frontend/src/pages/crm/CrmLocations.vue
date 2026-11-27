<template>
  <div class="h-full overflow-y-auto p-4 md:p-8 space-y-6" dir="rtl">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 class="text-2xl md:text-3xl font-black text-white">مصادر الرسائل</h1>
        <p class="text-slate-400 text-sm mt-1">
          جرد الرسائل الواردة حسب المكان — البلد من كود التليفون، والعناوين الدقيقة من حسابات الأعمال والمواقع المشاركة
        </p>
      </div>

      <!-- Period Filter -->
      <div class="flex items-center gap-1.5 bg-slate-800/80 border border-slate-700 rounded-xl p-1 self-start sm:self-auto">
        <button
          v-for="p in periods"
          :key="p.key"
          @click="period = p.key; load()"
          class="px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all"
          :class="period === p.key ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-300 hover:text-white hover:bg-slate-700'"
        >
          {{ p.label }}
        </button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="p-16 text-center text-slate-400 text-sm">
      جاري تحميل مصادر الرسائل...
    </div>

    <template v-else>
      <!-- Summary Cards -->
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <div class="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4">
          <div class="flex items-center gap-2 text-emerald-400 mb-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/></svg>
            <span class="text-[11px] font-bold">رسائل واردة</span>
          </div>
          <p class="text-2xl font-black text-white" dir="ltr">{{ totals.incoming_messages }}</p>
        </div>

        <div class="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4">
          <div class="flex items-center gap-2 text-sky-400 mb-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            <span class="text-[11px] font-bold">معروفة البلد</span>
          </div>
          <p class="text-2xl font-black text-white" dir="ltr">
            {{ totals.with_country }}
            <span class="text-xs text-slate-500 font-bold">{{ coveragePercent }}%</span>
          </p>
        </div>

        <div class="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4">
          <div class="flex items-center gap-2 text-rose-400 mb-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
            <span class="text-[11px] font-bold">مواقع مشاركة (دبابيس)</span>
          </div>
          <p class="text-2xl font-black text-white" dir="ltr">{{ totals.shared_pins }}</p>
        </div>

        <div class="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4">
          <div class="flex items-center gap-2 text-amber-400 mb-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
            <span class="text-[11px] font-bold">جهات بعنوان مسجل</span>
          </div>
          <p class="text-2xl font-black text-white" dir="ltr">{{ totals.located_contacts }}</p>
        </div>

        <div class="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 col-span-2 md:col-span-1">
          <div class="flex items-center gap-2 text-teal-400 mb-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
            <span class="text-[11px] font-bold">بروفايلات تم فحصها</span>
          </div>
          <p class="text-2xl font-black text-white" dir="ltr">{{ totals.business_profiles }}</p>
        </div>
      </div>

      <!-- By Country -->
      <div class="bg-slate-800/80 border border-slate-700/80 rounded-3xl overflow-hidden">
        <div class="px-5 py-4 border-b border-slate-700/80 flex items-center justify-between">
          <h2 class="font-black text-white text-sm">الرسائل حسب الدولة</h2>
          <span class="text-[10px] text-slate-500">مستنتجة تلقائياً من مفتاح التليفون الدولي</span>
        </div>
        <div v-if="byCountry.length === 0" class="p-12 text-center text-slate-500 text-sm">
          لا توجد رسائل واردة ببلد معروف في هذه الفترة — البلد يُستنتج من كود تليفون المرسل ويملأ تلقائياً مع وصول الرسائل.
        </div>
        <div v-else class="divide-y divide-slate-800/60">
          <div v-for="row in byCountry" :key="row.sender_country" class="px-5 py-3.5 flex items-center gap-4">
            <span class="text-2xl leading-none" :title="row.sender_country">{{ flagOf(row.sender_country) }}</span>
            <div class="w-32 shrink-0">
              <p class="font-bold text-white text-sm">{{ countryName(row.sender_country) }}</p>
              <p class="text-[10px] text-slate-500" dir="ltr">{{ row.sender_country }}</p>
            </div>
            <div class="flex-1 min-w-0">
              <div class="h-2 rounded-full bg-slate-700/60 overflow-hidden">
                <div class="h-full rounded-full bg-gradient-to-l from-emerald-500 to-teal-400" :style="{ width: barWidth(row.messages) + '%' }"></div>
              </div>
            </div>
            <div class="text-left shrink-0">
              <p class="font-black text-white text-sm" dir="ltr">{{ row.messages }}</p>
              <p class="text-[10px] text-slate-500">{{ percent(row.messages) }}%</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Precise locations (business profiles + shared pins) -->
      <div class="bg-slate-800/80 border border-slate-700/80 rounded-3xl overflow-hidden">
        <div class="px-5 py-4 border-b border-slate-700/80 flex items-center justify-between">
          <h2 class="font-black text-white text-sm">عناوين دقيقة معروفة</h2>
          <span class="text-[10px] text-slate-500">من بروفايل واتساب أعمال للجهة</span>
        </div>
        <div v-if="located.length === 0" class="p-12 text-center text-slate-500 text-sm">
          لا توجد عناوين مسجلة بعد — تُسحب تلقائياً من بروفايل واتساب أعمال للجهة عند وصول أول رسالة.
        </div>
        <div v-else class="overflow-x-auto">
          <table class="w-full text-sm min-w-[760px]">
            <thead>
              <tr class="border-b border-slate-700/80 text-slate-400 text-[11px]">
                <th class="text-right font-bold px-5 py-3.5">الجهة</th>
                <th class="text-center font-bold px-4 py-3.5">البلد</th>
                <th class="text-right font-bold px-4 py-3.5">العنوان المسجل</th>
                <th class="text-center font-bold px-4 py-3.5">الإحداثيات</th>
                <th class="text-center font-bold px-4 py-3.5"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in located" :key="c.id" class="border-b border-slate-800/60 hover:bg-slate-800/40 transition-colors">
                <td class="px-5 py-3.5">
                  <p class="font-bold text-white text-sm">{{ c.contact_name || '—' }}</p>
                  <p class="text-[10px] text-slate-500 font-mono" dir="ltr">+{{ c.contact_phone }}</p>
                </td>
                <td class="px-4 py-3.5 text-center">
                  <span v-if="c.contact_country">{{ flagOf(c.contact_country) }} {{ countryName(c.contact_country) }}</span>
                  <span v-else class="text-slate-600">—</span>
                </td>
                <td class="px-4 py-3.5 text-right text-slate-300 text-xs max-w-[280px] truncate" :title="c.business_address">
                  {{ c.business_address || '—' }}
                </td>
                <td class="px-4 py-3.5 text-center font-mono text-[11px] text-slate-400" dir="ltr">
                  <span v-if="c.business_latitude">{{ fmtCoord(c.business_latitude) }}, {{ fmtCoord(c.business_longitude) }}</span>
                  <span v-else class="text-slate-600">—</span>
                </td>
                <td class="px-4 py-3.5 text-center">
                  <div class="flex items-center justify-center gap-2">
                    <a
                      v-if="c.business_latitude"
                      :href="mapsUrl(c.business_latitude, c.business_longitude)"
                      target="_blank" rel="noopener"
                      class="px-2.5 py-1 rounded-lg bg-sky-600/20 text-sky-400 text-[11px] font-bold hover:bg-sky-600/40 transition-colors"
                    >خريطة</a>
                    <button
                      @click="refreshProfile(c)"
                      :disabled="refreshingId === c.id"
                      class="px-2.5 py-1 rounded-lg bg-slate-700/60 text-slate-300 text-[11px] font-bold hover:bg-slate-600/60 transition-colors disabled:opacity-40"
                    >{{ refreshingId === c.id ? '...' : 'تحديث' }}</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Shared pins -->
      <div v-if="pins.length > 0" class="bg-slate-800/80 border border-slate-700/80 rounded-3xl overflow-hidden">
        <div class="px-5 py-4 border-b border-slate-700/80 flex items-center justify-between">
          <h2 class="font-black text-white text-sm">مواقع شاركها العملاء</h2>
          <span class="text-[10px] text-slate-500">رسائل "مشاركة الموقع" الواردة — إحداثيات دقيقة</span>
        </div>
        <div class="divide-y divide-slate-800/60">
          <div v-for="p in pins" :key="p.id" class="px-5 py-3.5 flex items-center gap-4">
            <svg class="w-5 h-5 text-rose-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
            <div class="flex-1 min-w-0">
              <p class="font-bold text-white text-sm" dir="ltr">+{{ p.from }}</p>
              <p class="text-[10px] text-slate-500 truncate">{{ p.message }}</p>
            </div>
            <p class="text-[11px] text-slate-500 shrink-0" dir="ltr">{{ fmtDate(p.created_at) }}</p>
            <a
              :href="mapsUrl(p.latitude, p.longitude)"
              target="_blank" rel="noopener"
              class="px-2.5 py-1 rounded-lg bg-sky-600/20 text-sky-400 text-[11px] font-bold hover:bg-sky-600/40 transition-colors shrink-0"
            >خريطة</a>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import crm from '@/services/crm';

const loading = ref(true);
const byCountry = ref([]);
const located = ref([]);
const pins = ref([]);
const totals = ref({});
const period = ref('all');
const refreshingId = ref(null);

const periods = [
  { key: 'all', label: 'كل الفترات' },
  { key: '30', label: '٣٠ يوم' },
  { key: '7', label: '٧ أيام' },
  { key: '1', label: 'اليوم' },
];

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(['ar'], { type: 'region' });
  } catch {
    return null;
  }
})();

const maxMessages = computed(() => Math.max(1, ...byCountry.value.map((r) => r.messages)));
const coveragePercent = computed(() =>
  totals.value.incoming_messages
    ? Math.round((100 * (totals.value.with_country || 0)) / totals.value.incoming_messages)
    : 0
);

function countryName(code) {
  return regionNames?.of(code) || code;
}

function flagOf(code) {
  if (!code || code.length !== 2) return '🏳️';
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 127397 + c.charCodeAt(0)));
}

function barWidth(n) {
  return Math.max(3, Math.round((100 * n) / maxMessages.value));
}

function percent(n) {
  return totals.value.incoming_messages ? Math.round((100 * n) / totals.value.incoming_messages) : 0;
}

function fmtCoord(v) {
  return Number(v).toFixed(5);
}

function mapsUrl(lat, lng) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toLocaleDateString('ar-EG') + ' ' + dt.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
}

async function refreshProfile(c) {
  refreshingId.value = c.id;
  try {
    await crm.client().post(`/conversations/${c.id}/refresh-business-profile`);
    setTimeout(load, 4000);
  } finally {
    refreshingId.value = null;
  }
}

async function load() {
  loading.value = true;
  try {
    const days = period.value === 'all' ? 0 : Number(period.value);
    const res = await crm.client().get('/message-origins', { params: { days } });
    if (res.data?.success) {
      totals.value = res.data.totals || {};
      byCountry.value = res.data.by_country || [];
      located.value = res.data.located || [];
      pins.value = res.data.pins || [];
    }
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>
