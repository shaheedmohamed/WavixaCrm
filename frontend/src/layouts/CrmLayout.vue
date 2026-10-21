<template>
  <div class="h-screen w-screen flex bg-slate-900 text-slate-100 overflow-hidden font-sans" dir="rtl">
    <!-- Sidebar -->
    <aside
      class="w-64 bg-slate-950 border-l border-slate-800 flex flex-col shrink-0 transition-transform duration-300 z-30 h-full max-md:fixed max-md:inset-y-0 max-md:right-0 md:relative md:translate-x-0"
      :class="{ 'max-md:translate-x-full': !mobileOpen, 'max-md:translate-x-0': mobileOpen }"
    >
      <!-- Brand Header -->
      <div class="p-4 border-b border-slate-800 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20 text-white font-black text-lg">
            W
          </div>
          <div>
            <h2 class="font-bold text-white text-base leading-tight">Wavixa CRM</h2>
            <p class="text-[11px] text-emerald-400 font-medium">إدارة واتساب متعددة</p>
          </div>
        </div>
        <button @click="mobileOpen = false" class="md:hidden text-slate-400 hover:text-white p-1">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>

      <!-- Navigation Links -->
      <nav class="flex-1 p-3 space-y-1.5 overflow-y-auto">
        <!-- Platform Admin (admin role only) -->
        <template v-if="isAdmin">
          <router-link
            v-for="item in adminNav"
            :key="item.to"
            :to="item.to"
            class="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all group"
            :class="item.exact ? ($route.path === item.to ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold' : 'text-slate-300 hover:bg-slate-800/60 hover:text-white') : ($route.path.startsWith(item.to) ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold' : 'text-slate-300 hover:bg-slate-800/60 hover:text-white')"
          >
            <span v-html="item.icon" class="w-5 h-5 shrink-0 [&>svg]:w-5 [&>svg]:h-5"></span>
            <span>{{ item.label }}</span>
          </router-link>
        </template>

        <!-- Dashboard (Owner only) -->
        <router-link
          v-if="isOwner"
          to="/crm/dashboard"
          class="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all group"
          :class="$route.path === '/crm/dashboard' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold' : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'"
        >
          <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
          </svg>
          <span>الداشبورد</span>
        </router-link>

        <!-- WhatsApp Chat (owner + agents; admin uses لوحة الأدمن) -->
        <router-link
          v-if="!isAdmin"
          to="/crm/chat"
          class="flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all group"
          :class="$route.path === '/crm/chat' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold' : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'"
        >
          <div class="flex items-center gap-3">
            <svg class="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
            </svg>
            <span>محادثات الواتساب</span>
          </div>
          <span v-if="unreadTotal > 0" class="px-2 py-0.5 rounded-full bg-emerald-500 text-slate-950 font-bold text-xs">
            {{ unreadTotal }}
          </span>
        </router-link>

        <!-- Link Devices / Numbers (Owner only) -->
        <router-link
          v-if="isOwner"
          to="/crm/devices"
          class="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all group"
          :class="$route.path === '/crm/devices' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold' : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'"
        >
          <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"/>
          </svg>
          <span>ربط الأرقام (الأجهزة)</span>
        </router-link>

        <!-- Customer Service Team (Owner only) -->
        <router-link
          v-if="isOwner"
          to="/crm/agents"
          class="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all group"
          :class="$route.path === '/crm/agents' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold' : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'"
        >
          <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
          </svg>
          <span>خدمة العملاء (الفريق)</span>
        </router-link>

        <!-- Contacts / Address book (Owner only) -->
        <router-link
          v-if="isOwner"
          to="/crm/contacts"
          class="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all group"
          :class="$route.path === '/crm/contacts' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold' : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'"
        >
          <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
          </svg>
          <span>جهات الاتصال</span>
        </router-link>

        <!-- Agent Performance (Owner only) -->
        <router-link
          v-if="isOwner"
          to="/crm/performance"
          class="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all group"
          :class="$route.path === '/crm/performance' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold' : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'"
        >
          <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
          </svg>
          <span>تقييمات الموظفين</span>
        </router-link>

        <!-- Auto Reply / WhatsApp chatbot (Owner only) -->
        <router-link
          v-if="isOwner"
          to="/crm/auto-reply"
          class="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all group"
          :class="$route.path === '/crm/auto-reply' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold' : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'"
        >
          <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/>
          </svg>
          <span>الرد التلقائي</span>
        </router-link>

        <!-- CRM Plans & Pricing (Owner only) -->
        <router-link
          v-if="isOwner"
          to="/crm/pricing"
          class="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all group"
          :class="$route.path.includes('/crm/pricing') || $route.path.includes('/crm/plans') ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold' : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'"
        >
          <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div class="flex items-center justify-between flex-1">
            <span>الباقات والاشتراك</span>
            <span class="text-[10px] font-black px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400">جديد</span>
          </div>
        </router-link>
      </nav>

      <!-- Bottom User Section -->
      <div class="p-3 border-t border-slate-800 bg-slate-900/60">
        <div class="flex items-center gap-3 px-2 py-2">
          <div class="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center font-bold text-sm text-slate-200">
            {{ userInitial }}
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-semibold text-white truncate">{{ user?.name || 'مستخدم CRM' }}</p>
            <p class="text-[11px] text-slate-400 truncate">
              {{ isAdmin ? 'أدمن المنصة' : (isOwner ? 'مسؤول النظام (Owner)' : 'وكيل خدمة العملاء') }}
            </p>
          </div>
          <button
            v-if="!isAdmin"
            @click="toggleSound"
            class="p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
            :class="soundEnabled ? 'text-emerald-400 hover:text-emerald-300' : 'text-slate-500 hover:text-slate-300'"
            :title="soundEnabled ? 'كتم صوت الرسائل الجديدة' : 'تشغيل صوت الرسائل الجديدة'"
          >
            <svg v-if="soundEnabled" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
            </svg>
            <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"/>
            </svg>
          </button>
          <button
            @click="handleLogout"
            class="text-slate-400 hover:text-rose-400 p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
            title="تسجيل الخروج"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
            </svg>
          </button>
        </div>
      </div>
    </aside>

    <!-- Mobile Backdrop -->
    <div
      v-if="mobileOpen"
      @click="mobileOpen = false"
      class="fixed inset-0 bg-black/60 backdrop-blur-sm z-20 md:hidden"
    ></div>

    <!-- Main Content Area -->
    <div class="flex-1 flex flex-col min-w-0 overflow-hidden">
      <!-- Mobile Top Bar -->
      <header class="md:hidden h-14 bg-slate-950 border-b border-slate-800 flex items-center justify-between px-4 shrink-0 z-10">
        <button @click="mobileOpen = true" class="text-slate-300 hover:text-white p-1">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
        </button>
        <span class="font-bold text-white text-sm">Wavixa CRM</span>
        <button @click="handleLogout" class="text-slate-400 hover:text-rose-400 p-1">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
        </button>
      </header>

      <!-- Routed Page Container -->
      <main class="flex-1 overflow-hidden relative">
        <router-view />
      </main>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import crm from '@/services/crm';
import { getEcho, crmChannelName } from '@/services/realtime';
import { initNotifySound, isSoundEnabled, setSoundEnabled, playIncomingMessage } from '@/services/notifySound';

const router = useRouter();
const mobileOpen = ref(false);
const unreadTotal = ref(0);
const soundEnabled = ref(isSoundEnabled());

const user = computed(() => crm.getUser());
const isOwner = computed(() => crm.isOwner());
const isAdmin = computed(() => crm.isAdmin());

const svg = (p) => `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${p}"/></svg>`;
const adminNav = [
  { to: '/crm/admin', label: 'لوحة الأدمن', exact: true, icon: svg('M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z') },
  { to: '/crm/admin/devices', label: 'الأجهزة', icon: svg('M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z') },
  { to: '/crm/admin/chats', label: 'المحادثات', icon: svg('M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z') },
  { to: '/crm/admin/agents', label: 'الموظفون', icon: svg('M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z') },
  { to: '/crm/admin/activity', label: 'سجلات النشاط', icon: svg('M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01') },
];

const userInitial = computed(() => {
  const name = user.value?.name || 'CRM';
  return name.trim().charAt(0).toUpperCase();
});

const handleLogout = () => {
  crm.logout();
  router.push('/crm/login');
};

const toggleSound = () => {
  soundEnabled.value = !soundEnabled.value;
  setSoundEnabled(soundEnabled.value);
  if (soundEnabled.value) playIncomingMessage();
};

// New-message ding. Primary path: realtime `message.new` push. Fallback: the
// 15s unread poll — but only when Echo is disconnected, so a pushed event and
// the poll don't ding twice for the same message.
let pollTimer = null;
let crmChannel = null;
const realtimeOk = ref(false);

const onCrmEvent = (evt) => {
  if (evt?.type === 'message.new' && evt.data?.message?.direction === 'incoming') {
    playIncomingMessage();
  }
};

const startMessageSoundListener = () => {
  const echo = getEcho();
  const channel = crmChannelName();
  if (!echo || !channel) return;
  crmChannel = echo.private(channel).listen('.crm.event', onCrmEvent);
  const conn = echo.connector?.pusher?.connection;
  if (conn) {
    realtimeOk.value = conn.state === 'connected';
    conn.bind('connected', () => (realtimeOk.value = true));
    conn.bind('disconnected', () => (realtimeOk.value = false));
  }
};

let unreadBaselineSet = false;
const pollUnread = async () => {
  try {
    const stats = await crm.getStats();
    if (stats.success) {
      const n = stats.stats?.unread_conversations || 0;
      // First poll only sets the baseline — otherwise opening the CRM with
      // existing unread chats would ding for old messages.
      if (unreadBaselineSet && !isAdmin.value && n > unreadTotal.value && !realtimeOk.value) playIncomingMessage();
      unreadTotal.value = n;
      unreadBaselineSet = true;
    }
  } catch {}
};

onMounted(() => {
  initNotifySound();
  if (!isAdmin.value) startMessageSoundListener();
  pollUnread();
  pollTimer = setInterval(pollUnread, 15000);
});

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
  if (crmChannel) {
    try { getEcho()?.leave(crmChannelName()); } catch {}
    crmChannel = null;
  }
});
</script>
