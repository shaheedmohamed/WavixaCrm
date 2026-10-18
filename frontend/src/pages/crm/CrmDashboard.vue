<template>
  <div class="h-full overflow-y-auto p-4 md:p-8 space-y-6" dir="rtl">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 class="text-2xl md:text-3xl font-black text-white">لوحة تحكم CRM</h1>
        <p class="text-slate-400 text-sm mt-1">مرحباً بك في نظام إدارة ومراسلات الواتساب متعدد الأرقام</p>
      </div>

      <!-- Quick Action Buttons -->
      <div class="flex items-center gap-2.5">
        <router-link
          to="/crm/chat"
          class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-600/20 transition-all"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
          <span>فتح المحادثات</span>
        </router-link>

        <router-link
          v-if="isOwner"
          to="/crm/devices"
          class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-sm transition-all"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
          <span>ربط رقم جديد</span>
        </router-link>
      </div>
    </div>

    <!-- Stats Grid -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <!-- Connected Devices -->
      <div class="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-5 relative overflow-hidden group hover:border-emerald-500/40 transition-all">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold text-slate-400">الأجهزة المتصلة</span>
          <div class="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
          </div>
        </div>
        <div class="mt-4 flex items-baseline gap-2">
          <span class="text-3xl font-black text-white">{{ stats.connected_devices ?? 0 }}</span>
          <span class="text-xs text-slate-500 font-medium">من إجمالي {{ stats.total_devices ?? 0 }} أجهزة</span>
        </div>
      </div>

      <!-- Customer Service Team -->
      <div class="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-5 relative overflow-hidden group hover:border-indigo-500/40 transition-all">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold text-slate-400">فريق خدمة العملاء</span>
          <div class="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
          </div>
        </div>
        <div class="mt-4 flex items-baseline gap-2">
          <span class="text-3xl font-black text-white">{{ stats.total_agents ?? 0 }}</span>
          <span class="text-xs text-slate-500 font-medium">أعضاء نشطين</span>
        </div>
      </div>

      <!-- Total Conversations -->
      <div class="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-5 relative overflow-hidden group hover:border-teal-500/40 transition-all">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold text-slate-400">إجمالي المحادثات</span>
          <div class="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-400 flex items-center justify-center">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
          </div>
        </div>
        <div class="mt-4 flex items-baseline gap-2">
          <span class="text-3xl font-black text-white">{{ stats.total_conversations ?? 0 }}</span>
          <span v-if="stats.unread_conversations > 0" class="text-xs font-bold text-amber-400">
            ({{ stats.unread_conversations }} غير مقروءة)
          </span>
          <span v-else class="text-xs text-slate-500 font-medium">محادثة</span>
        </div>
      </div>

      <!-- Messages Today -->
      <div class="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-5 relative overflow-hidden group hover:border-sky-500/40 transition-all">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold text-slate-400">رسائل اليوم</span>
          <div class="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>
          </div>
        </div>
        <div class="mt-4 flex items-baseline gap-2">
          <span class="text-3xl font-black text-white">{{ (stats.messages_sent_today ?? 0) + (stats.messages_received_today ?? 0) }}</span>
          <span class="text-xs text-slate-500 font-medium">
            (↑{{ stats.messages_sent_today ?? 0 }} / ↓{{ stats.messages_received_today ?? 0 }})
          </span>
        </div>
      </div>
    </div>

    <!-- Linked Devices Overview -->
    <div class="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-5">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="text-lg font-bold text-white">الأجهزة المرتبطة (أرقام الواتساب)</h2>
          <p class="text-xs text-slate-400">الأرقام المتصلة بالـ Engine لإرسال واستقبال المحادثات</p>
        </div>
        <router-link
          v-if="isOwner"
          to="/crm/devices"
          class="text-xs text-emerald-400 hover:text-emerald-300 font-bold transition-colors"
        >
          إدارة الأجهزة &larr;
        </router-link>
      </div>

      <div v-if="loadingDevices" class="p-8 text-center text-slate-400 text-sm">
        جاري تحميل الأجهزة...
      </div>

      <div v-else-if="devices.length === 0" class="p-8 text-center bg-slate-900/40 rounded-xl border border-dashed border-slate-700">
        <svg class="w-12 h-12 text-slate-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
        <p class="text-sm font-semibold text-slate-300">لم يتم ربط أي أرقام حتى الآن</p>
        <p class="text-xs text-slate-500 mt-1">ابدأ الآن بربط رقم واتساب الأول لتشغيل CRM</p>
        <router-link
          v-if="isOwner"
          to="/crm/devices"
          class="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all"
        >
          <span>ربط رقم عبر QR Code</span>
        </router-link>
      </div>

      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        <div
          v-for="d in devices"
          :key="d.id"
          class="p-4 rounded-xl bg-slate-900/70 border border-slate-800 hover:border-slate-700 transition-all flex items-center justify-between"
        >
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 font-black flex items-center justify-center text-sm border border-emerald-500/20">
              {{ d.device_name }}
            </div>
            <div>
              <h3 class="text-sm font-bold text-white">{{ d.device_name }}</h3>
              <p class="text-xs text-slate-400 font-mono" dir="ltr">{{ d.phone_number ? '+' + d.phone_number : 'قيد الربط...' }}</p>
            </div>
          </div>
          <span
            class="px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center gap-1.5"
            :class="d.status === 'connected' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-slate-400 border border-slate-700'"
          >
            <span class="w-1.5 h-1.5 rounded-full" :class="d.status === 'connected' ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'"></span>
            {{ d.status === 'connected' ? 'متصل' : (d.status === 'pending' ? 'قيد الربط' : 'غير متصل') }}
          </span>
        </div>
      </div>
    </div>

    <!-- Recent Active Chats -->
    <div class="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-5">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="text-lg font-bold text-white">أحدث المحادثات</h2>
          <p class="text-xs text-slate-400">آخر رسائل وتفاعلات العملاء الواردة والصادرة</p>
        </div>
        <router-link
          to="/crm/chat"
          class="text-xs text-emerald-400 hover:text-emerald-300 font-bold transition-colors"
        >
          عرض كل المحادثات &larr;
        </router-link>
      </div>

      <div v-if="loadingChats" class="p-8 text-center text-slate-400 text-sm">
        جاري تحميل المحادثات...
      </div>

      <div v-else-if="recentChats.length === 0" class="p-8 text-center text-slate-500 text-sm">
        لا توجد محادثات مسجلة بعد.
      </div>

      <div v-else class="divide-y divide-slate-800/60">
        <router-link
          v-for="c in recentChats"
          :key="c.id"
          :to="'/crm/chat?id=' + c.id"
          class="p-3.5 hover:bg-slate-800/40 rounded-xl transition-all flex items-center justify-between group"
        >
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-10 h-10 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-500 text-white font-bold flex items-center justify-center shrink-0">
              {{ c.contact_name ? c.contact_name.trim().charAt(0) : 'U' }}
            </div>
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-sm font-bold text-white truncate">{{ c.contact_name || c.contact_phone }}</span>
                <span class="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold">
                  {{ c.session?.device_name || ('ج' + c.session_id) }}
                </span>
              </div>
              <p class="text-xs text-slate-400 truncate mt-0.5 max-w-md">
                {{ c.last_message || 'محادثة نشطة' }}
              </p>
            </div>
          </div>
          <div class="text-left shrink-0">
            <span v-if="c.unread_count > 0" class="px-2 py-0.5 rounded-full bg-emerald-500 text-slate-950 font-black text-xs">
              {{ c.unread_count }}
            </span>
          </div>
        </router-link>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import crm from '@/services/crm';

const stats = ref({});
const devices = ref([]);
const recentChats = ref([]);
const loadingDevices = ref(true);
const loadingChats = ref(true);

const isOwner = computed(() => crm.isOwner());

const loadData = async () => {
  try {
    const s = await crm.getStats();
    if (s.success) stats.value = s.stats;
  } catch {}

  try {
    loadingDevices.value = true;
    const d = await crm.getDevices();
    if (d.success) devices.value = d.devices;
  } catch {} finally {
    loadingDevices.value = false;
  }

  try {
    loadingChats.value = true;
    const c = await crm.getConversations({ per_page: 6 });
    if (c.success) recentChats.value = c.conversations || [];
  } catch {} finally {
    loadingChats.value = false;
  }
};

onMounted(() => {
  loadData();
});
</script>
