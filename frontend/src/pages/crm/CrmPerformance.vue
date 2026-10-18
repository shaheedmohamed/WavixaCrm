<template>
  <div class="h-full overflow-y-auto p-4 md:p-8 space-y-6" dir="rtl">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 class="text-2xl md:text-3xl font-black text-white">تقييمات الموظفين</h1>
        <p class="text-slate-400 text-sm mt-1">أداء فريق خدمة العملاء — عدد الرسائل، سرعة الرد، والمحادثات المنجزة والمفتوحة</p>
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
      جاري تحميل تقرير الأداء...
    </div>

    <template v-else>
      <!-- Summary Cards -->
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <div class="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4">
          <div class="flex items-center gap-2 text-emerald-400 mb-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>
            <span class="text-[11px] font-bold">رسائل مرسلة</span>
          </div>
          <p class="text-2xl font-black text-white" dir="ltr">{{ totals.messages_sent }}</p>
        </div>

        <div class="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4">
          <div class="flex items-center gap-2 text-sky-400 mb-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            <span class="text-[11px] font-bold">متوسط سرعة الرد</span>
          </div>
          <p class="text-2xl font-black text-white" dir="ltr">{{ formatDuration(totals.avg_response_seconds) }}</p>
        </div>

        <div class="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4">
          <div class="flex items-center gap-2 text-teal-400 mb-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            <span class="text-[11px] font-bold">محادثات منجزة</span>
          </div>
          <p class="text-2xl font-black text-white" dir="ltr">{{ totals.conversations_resolved }}</p>
        </div>

        <div class="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4">
          <div class="flex items-center gap-2 text-amber-400 mb-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z"/></svg>
            <span class="text-[11px] font-bold">بانتظار رد</span>
          </div>
          <p class="text-2xl font-black text-white" dir="ltr">{{ totals.awaiting_reply }}</p>
        </div>

        <div class="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 col-span-2 md:col-span-1">
          <div class="flex items-center gap-2 text-yellow-400 mb-2">
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
            <span class="text-[11px] font-bold">متوسط التقييم</span>
          </div>
          <p class="text-2xl font-black text-white" dir="ltr">{{ totals.avg_rating !== null ? totals.avg_rating + ' / 5' : '—' }}</p>
        </div>
      </div>

      <!-- Empty state -->
      <div v-if="members.length === 0" class="p-12 text-center bg-slate-800/40 rounded-3xl border border-dashed border-slate-700">
        <p class="text-sm text-slate-400">لا يوجد أعضاء في الفريق بعد.</p>
      </div>

      <!-- Members Table -->
      <div v-else class="bg-slate-800/80 border border-slate-700/80 rounded-3xl overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm min-w-[900px]">
            <thead>
              <tr class="border-b border-slate-700/80 text-slate-400 text-[11px]">
                <th class="text-right font-bold px-5 py-4">الموظف</th>
                <th class="text-center font-bold px-4 py-4">الرتبة</th>
                <th class="text-center font-bold px-4 py-4">رسائل مرسلة</th>
                <th class="text-center font-bold px-4 py-4">محادثات تفاعل معها</th>
                <th class="text-center font-bold px-4 py-4">منجزة</th>
                <th class="text-center font-bold px-4 py-4">مفتوحة (ناقصة)</th>
                <th class="text-center font-bold px-4 py-4">بانتظار رده</th>
                <th class="text-center font-bold px-4 py-4">متوسط سرعة الرد</th>
                <th class="text-center font-bold px-4 py-4">التقييم</th>
                <th class="text-center font-bold px-4 py-4">آخر نشاط</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(m, i) in members"
                :key="m.id"
                class="border-b border-slate-800/60 hover:bg-slate-800/40 transition-colors"
              >
                <!-- Member -->
                <td class="px-5 py-4">
                  <div class="flex items-center gap-3">
                    <div class="relative shrink-0">
                      <div class="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-sky-500 text-white font-bold flex items-center justify-center text-xs">
                        {{ m.name ? m.name.trim().charAt(0) : 'A' }}
                      </div>
                      <span
                        v-if="i === 0 && m.messages_sent > 0"
                        class="absolute -top-1.5 -right-1.5 text-[11px]"
                        title="الأكثر نشاطاً"
                      >👑</span>
                    </div>
                    <div class="min-w-0">
                      <p class="font-bold text-white text-sm truncate">{{ m.name }}</p>
                      <p class="text-[10px] text-slate-500 font-mono truncate" dir="ltr">{{ m.email }}</p>
                      <p v-if="m.group_name" class="text-[10px] text-emerald-400 font-bold">{{ m.group_name }}</p>
                    </div>
                  </div>
                </td>

                <!-- Role -->
                <td class="px-4 py-4 text-center">
                  <span
                    class="px-2.5 py-1 rounded-full text-[10px] font-bold"
                    :class="m.role === 'owner' ? 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/20' : 'bg-slate-700/60 text-slate-300 border border-slate-600/40'"
                  >
                    {{ m.role === 'owner' ? 'مسؤول' : 'موظف' }}
                  </span>
                </td>

                <!-- Messages sent -->
                <td class="px-4 py-4 text-center">
                  <span class="text-lg font-black text-emerald-400" dir="ltr">{{ m.messages_sent }}</span>
                </td>

                <!-- Conversations touched -->
                <td class="px-4 py-4 text-center">
                  <span class="text-sm font-bold text-slate-200" dir="ltr">{{ m.conversations_touched }}</span>
                </td>

                <!-- Resolved -->
                <td class="px-4 py-4 text-center">
                  <span class="inline-flex items-center gap-1 text-sm font-bold text-teal-300" dir="ltr">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                    {{ m.conversations_resolved }}
                  </span>
                </td>

                <!-- Open (incomplete) -->
                <td class="px-4 py-4 text-center">
                  <span class="text-sm font-bold text-amber-300" dir="ltr">{{ m.conversations_open }}</span>
                </td>

                <!-- Awaiting reply -->
                <td class="px-4 py-4 text-center">
                  <span
                    class="px-2 py-0.5 rounded-full text-xs font-bold"
                    :class="m.awaiting_reply > 0 ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'text-slate-500'"
                    dir="ltr"
                  >
                    {{ m.awaiting_reply }}
                  </span>
                </td>

                <!-- Avg response -->
                <td class="px-4 py-4 text-center">
                  <span
                    class="text-sm font-bold"
                    :class="responseClass(m.avg_response_seconds)"
                    dir="ltr"
                  >
                    {{ formatDuration(m.avg_response_seconds) }}
                  </span>
                  <p v-if="m.response_samples" class="text-[9px] text-slate-500 mt-0.5" dir="ltr">{{ m.response_samples }} رد</p>
                </td>

                <!-- Rating -->
                <td class="px-4 py-4 text-center">
                  <div v-if="m.avg_rating !== null" class="inline-flex items-center gap-1">
                    <svg class="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
                    <span class="text-sm font-black text-white" dir="ltr">{{ m.avg_rating }}</span>
                  </div>
                  <span v-else class="text-slate-600 text-xs">—</span>
                </td>

                <!-- Last activity -->
                <td class="px-4 py-4 text-center">
                  <span class="text-[11px] text-slate-400" dir="ltr">{{ formatDate(m.last_activity_at) }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Note -->
      <p class="text-[11px] text-slate-500 flex items-center gap-2">
        <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        سرعة الرد = الفرق بين آخر رسالة من العميل وأول رد من الموظف — بتتحسب على آخر ٣٠٠ رد داخل الفترة. "بانتظار رده" محادثات مفتوحة آخر رسالة فيها من العميل.
      </p>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import crm from '@/services/crm';

const loading = ref(true);
const members = ref([]);
const totals = ref({});
const period = ref('30d');

const periods = [
  { key: 'today', label: 'اليوم' },
  { key: '7d', label: '٧ أيام' },
  { key: '30d', label: '٣٠ يوم' },
  { key: 'all', label: 'كل الفترات' },
];

const formatDuration = (seconds) => {
  if (seconds === null || seconds === undefined) return '—';
  if (seconds < 60) return `${seconds} ث`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} د`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return m ? `${h} س ${m} د` : `${h} س`;
};

const responseClass = (seconds) => {
  if (seconds === null || seconds === undefined) return 'text-slate-500';
  if (seconds <= 120) return 'text-emerald-400';
  if (seconds <= 600) return 'text-amber-300';
  return 'text-rose-400';
};

const formatDate = (ts) => {
  if (!ts) return '—';
  const d = new Date(String(ts).replace(' ', 'T'));
  if (isNaN(d)) return ts;
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return 'الآن';
  if (diff < 3600) return `منذ ${Math.floor(diff / 60)} د`;
  if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} س`;
  return d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
};

const load = async () => {
  loading.value = true;
  try {
    const res = await crm.client().get('/agent-performance', { params: { period: period.value } });
    if (res.data?.success) {
      members.value = res.data.members || [];
      totals.value = res.data.totals || {};
    }
  } catch (e) {
    console.error('Failed to load agent performance', e);
  } finally {
    loading.value = false;
  }
};

onMounted(load);
</script>
