<template>
  <div class="h-full flex overflow-hidden bg-[#18242b] text-[#f0f2f5] font-sans antialiased relative" dir="rtl">
    <!-- Boot splash — stays up until devices + conversations resolve once -->
    <Transition name="wx-fade">
      <div v-if="initialLoading" class="absolute inset-0 z-50 bg-[#18242b] flex flex-col items-center justify-center">
        <img src="/logo.png" alt="Wavixa" class="w-20 h-20 object-contain" />
        <div class="text-3xl font-light text-[#f0f2f5] mt-3 tracking-wide">Wavixa</div>
        <div class="w-56 h-[3px] rounded-full bg-[#96a4ad]/20 overflow-hidden mt-14">
          <span class="wx-progress"></span>
        </div>
        <div class="flex items-center gap-1.5 text-[#96a4ad] text-xs mt-5">
          <svg width="12" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-1V6a5 5 0 0 0-5-5zm-3 8V6a3 3 0 1 1 6 0v3H9z"/></svg>
          مشفرة تمامًا بين الطرفين
        </div>
      </div>
    </Transition>

    <!-- LEFT PANEL: Conversation List -->
    <aside
      class="w-full md:w-[380px] lg:w-[420px] bg-[#18242b] border-l border-[#2c3c45] flex flex-col shrink-0 z-10 transition-all duration-200"
      :class="{ 'max-md:hidden': activeConv && !showListOnMobile }"
    >
      <!-- WhatsApp List Header -->
      <div class="h-16 bg-[#25343d] px-4 flex items-center justify-between border-b border-[#2c3c45] shrink-0">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-500 text-white font-bold flex items-center justify-center text-sm shadow">
            {{ userInitial }}
          </div>
          <div>
            <h2 class="text-sm font-bold text-[#f0f2f5] leading-tight">{{ user?.name || 'مستخدم CRM' }}</h2>
            <p class="text-[11px] text-[#96a4ad]">
              {{ isOwner ? 'مسؤول النظام' : (user?.group_name || 'خدمة العملاء') }}
              <span
                v-if="isAgent"
                class="font-bold"
                :class="isAtCapacity ? 'text-rose-400' : 'text-[#00a884]'"
                title="عدد المحادثات المفتوحة اللي معاك دلوقتي"
              > · شواغلي {{ user?.active_chats ?? 0 }}/{{ user?.max_active_chats || 5 }}</span>
            </p>
          </div>
        </div>

        <div class="flex items-center gap-1">
          <!-- Start New Chat -->
          <button
            @click="showNewChatModal = true"
            class="p-2 text-[#aebac1] hover:text-[#00a884] rounded-full hover:bg-[#3d505c] transition-colors"
            title="محادثة جديدة"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
            </svg>
          </button>

          <!-- Refresh button -->
          <button
            @click="loadConversations"
            class="p-2 text-[#aebac1] hover:text-[#00a884] rounded-full hover:bg-[#3d505c] transition-colors"
            :class="{ 'animate-spin': loadingConvs }"
            title="تحديث المحادثات"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Search & Filters -->
      <div class="p-2.5 bg-[#18242b] border-b border-[#2c3c45] space-y-2 shrink-0">
        <!-- Search Input -->
        <div class="relative">
          <input
            v-model="searchQuery"
            @input="debouncedSearch"
            type="text"
            placeholder="بحث في المحادثات أو الأرقام..."
            class="w-full bg-[#25343d] text-[#dfe5e8] placeholder-[#96a4ad] text-xs rounded-lg pl-3 pr-9 py-2 focus:outline-none focus:ring-1 focus:ring-[#00a884]"
          />
          <div class="absolute inset-y-0 right-3 flex items-center pointer-events-none text-[#96a4ad]">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          </div>
        </div>

        <!-- Filter Chips & Device Selector -->
        <div class="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          <!-- Agents work a shared queue: pool → claimed-by-me → done -->
          <template v-if="isAgent">
            <button @click="setFilter('available')" class="px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors" :class="chipClass('available')">
              متاحة
            </button>
            <button @click="setFilter('mine')" class="px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors" :class="chipClass('mine')">
              محادثاتي
            </button>
            <button @click="setFilter('resolved')" class="px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors" :class="chipClass('resolved')">
              مكتملة
            </button>
          </template>
          <template v-else>
            <button @click="setFilter('all')" class="px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors" :class="chipClass('all')">
              الكل
            </button>
            <button @click="setFilter('unread')" class="px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors" :class="chipClass('unread')">
              غير مقروءة
            </button>
            <button @click="setFilter('available')" class="px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors" :class="chipClass('available')">
              بدون موظف
            </button>
            <button @click="setFilter('resolved')" class="px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors" :class="chipClass('resolved')">
              مكتملة
            </button>
          </template>

          <!-- Devices Filter Dropdown -->
          <div class="relative shrink-0">
            <select
              v-model="filterSessionId"
              @change="loadConversations"
              class="bg-[#25343d] text-xs text-[#aebac1] font-semibold rounded-full px-3 py-1 pr-6 border-0 focus:outline-none focus:ring-1 focus:ring-[#00a884] cursor-pointer"
            >
              <option :value="null">كل الأجهزة</option>
              <option v-for="d in devices" :key="d.id" :value="d.id">
                {{ d.device_name }}
              </option>
            </select>
          </div>
        </div>
      </div>

      <!-- History sync progress — chats being pulled from WhatsApp -->
      <div v-if="syncingDevices.length" class="px-3 py-2.5 border-b border-[#25343d] bg-[#18242b] space-y-2.5 shrink-0">
        <div v-for="d in syncingDevices" :key="d.id">
          <div class="flex items-center justify-between text-[11px] mb-1.5">
            <span class="text-[#00a884] font-bold flex items-center gap-1.5">
              <span class="wx-spinner w-3 h-3"></span>
              جاري سحب المحادثات من واتساب — {{ d.device_name }}
            </span>
            <!-- WhatsApp sends no % on full/recent sync chunks — show the
                 real imported counts instead of a bar frozen at 1%. -->
            <span class="text-[#96a4ad] font-bold">
              <template v-if="d.progress > 1"><span dir="ltr">{{ d.progress }}% · </span></template>
              <span dir="ltr">{{ d.synced_conversations || 0 }}</span> محادثة<template v-if="d.synced_messages"> · <span dir="ltr">{{ d.synced_messages }}</span> رسالة</template>
            </span>
          </div>
          <div class="h-1.5 rounded-full bg-[#25343d] overflow-hidden">
            <div v-if="d.progress > 1" class="h-full bg-[#00a884] rounded-full transition-all duration-700" :style="{ width: Math.min(d.progress, 100) + '%' }"></div>
            <span v-else class="wx-progress"></span>
          </div>
        </div>
      </div>

      <!-- Conversations Scroll List -->
      <div class="flex-1 overflow-y-auto divide-y divide-[#25343d]/40">
        <div v-if="loadingConvs && !conversations.length" class="p-8 flex flex-col items-center gap-3 text-xs text-[#96a4ad]">
          <span class="wx-spinner w-6 h-6"></span>
          جاري تحميل المحادثات...
        </div>

        <div v-else-if="!conversations.length" class="p-8 text-center text-xs text-[#96a4ad]">
          لا توجد محادثات تطابق بحثك.
        </div>

        <button
          v-for="c in uniqueConversations"
          :key="c.id"
          @click="selectConversation(c)"
          class="w-full text-right p-3 transition-colors flex items-center gap-3 relative group"
          :class="activeConv?.id === c.id ? 'bg-[#30424c]' : 'hover:bg-[#25343d]/70'"
        >
          <!-- Contact Avatar -->
          <div class="w-12 h-12 rounded-full bg-gradient-to-br from-slate-600 to-slate-800 text-white font-bold flex items-center justify-center shrink-0 shadow-inner relative overflow-hidden">
            <img
              v-if="avatarSrc(c)"
              :src="avatarSrc(c)"
              alt=""
              class="absolute inset-0 w-full h-full object-cover"
              @error="markAvatarBroken(c.contact_avatar)"
            />
            <span v-else class="text-base">{{ convInitial(c) }}</span>
            <!-- Online / connected indicator dot if recent -->
            <span
              v-if="c.unread_count > 0"
              class="absolute bottom-0 right-0 w-3 h-3 bg-[#00a884] rounded-full ring-2 ring-[#18242b]"
            ></span>
          </div>

          <!-- Chat Meta -->
          <div class="flex-1 min-w-0">
            <!-- Row 1: Contact Name + Time -->
            <div class="flex items-center justify-between mb-1">
              <div class="flex items-center gap-1.5 min-w-0">
                <span class="font-bold text-sm text-[#f0f2f5] truncate">
                  {{ convTitle(c) || 'مستخدم' }}
                </span>
                <!-- Customer star rating, set when a chat is resolved -->
                <span
                  v-if="c.rating"
                  class="text-[10px] text-amber-400 shrink-0 tracking-tighter"
                  :title="c.rating_note || 'تقييم العميل'"
                >{{ '★'.repeat(c.rating) }}</span>
                <!-- DEVICE BADGE: e.g. [ج1] or [المبيعات] -->
                <span
                  class="px-1.5 py-0.5 rounded text-[10px] font-black tracking-wide shrink-0"
                  :class="getDeviceBadgeClass(c.session_id)"
                >
                  {{ c.session?.device_name || ('ج' + c.session_id) }}
                </span>
                <!-- GROUP BADGE -->
                <span
                  v-if="isGroupJid(c.contact_jid)"
                  class="px-1.5 py-0.5 rounded text-[10px] font-black tracking-wide shrink-0 bg-violet-500/20 text-violet-300"
                >
                  جروب
                </span>
              </div>

              <span class="text-[11px] text-[#96a4ad] shrink-0 font-medium">
                {{ formatChatTime(c.last_message_at) }}
              </span>
            </div>

            <!-- Row 2: Last message + unread pill -->
            <div class="flex items-center justify-between text-xs text-[#96a4ad]">
              <div class="flex items-center gap-1 truncate max-w-[240px]">
                <span v-if="typingConvs[c.id]" class="text-[#00a884] font-semibold animate-pulse">
                  يكتب الآن…
                </span>
                <template v-else>
                <!-- Outgoing ticks — same states as the in-chat bubble ticks -->
                <span v-if="c.last_message_direction === 'outgoing'" class="text-xs">
                  <span v-if="c.last_message_status === 'failed'" class="text-[#f15c6d] font-bold">✗</span>
                  <span v-else-if="c.last_message_status === 'read'" class="text-[#53bdeb] font-bold">✓✓</span>
                  <span v-else-if="c.last_message_status === 'delivered' || !c.last_message_status" class="text-[#96a4ad]">✓✓</span>
                  <span v-else-if="c.last_message_status === 'sending' || c.last_message_status === 'queued'" class="text-[#96a4ad]">🕐</span>
                  <span v-else class="text-[#96a4ad]">✓</span>
                </span>
                <!-- Media icons -->
                <span v-if="c.last_message_type === 'image'" class="text-[#aebac1]">📷 صورة</span>
                <span v-else-if="c.last_message_type === 'video'" class="text-[#aebac1]">🎥 فيديو</span>
                <span v-else-if="c.last_message_type === 'voice' || c.last_message_type === 'audio'" class="text-[#aebac1]">🎤 مقطع صوتي</span>
                <span v-else-if="c.last_message_type === 'call'" class="text-[#aebac1]">📞 مكالمة صوتية</span>
                <span v-else class="truncate">{{ c.last_message || 'محادثة نشطة' }}</span>
                </template>
              </div>

              <!-- Assignment / resolution + unread badges -->
              <div class="flex items-center gap-1 shrink-0">
                <span
                  v-if="c.transferred_by && c.assigned_agent_id === user?.id"
                  class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-violet-500/20 text-violet-300 whitespace-nowrap"
                  :title="'زميلك حوّل المحادثة دي لك'"
                >↩ محولة من {{ transferredName(c) }}</span>
                <span
                  v-else-if="c.assigned_agent_id"
                  class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-300 whitespace-nowrap"
                  :title="'المحادثة محجوزة لهذا الموظف'"
                >مع {{ assignedName(c) }}</span>
                <span
                  v-else-if="c.last_outgoing_user_id"
                  class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-500/15 text-sky-300 whitespace-nowrap"
                  :title="'آخر موظف رد على هذه المحادثة'"
                >رد: {{ lastSenderName(c) }}</span>
                <span
                  v-else-if="c.resolved_at"
                  class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-300 whitespace-nowrap"
                >✓ مكتمل</span>
                <span
                  v-if="c.unread_count > 0"
                  class="min-w-[20px] h-5 px-1.5 rounded-full bg-[#00a884] text-[#18242b] font-black text-[11px] flex items-center justify-center shadow-sm"
                >
                  {{ c.unread_count }}
                </span>
              </div>
            </div>
          </div>
        </button>
      </div>
    </aside>

    <!-- RIGHT PANEL: Active WhatsApp Chat Area -->
    <main class="flex-1 flex flex-col min-w-0 bg-[#131f26] relative">
      <!-- Empty State when no conversation selected -->
      <div v-if="!activeConv" class="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[#2c3c45]/30">
        <div class="w-20 h-20 rounded-3xl bg-[#25343d] text-[#00a884] flex items-center justify-center mb-6 shadow-xl shadow-black/30">
          <svg class="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
          </svg>
        </div>
        <h2 class="text-2xl font-bold text-[#f0f2f5] mb-2">Wavixa WhatsApp CRM</h2>
        <p class="text-sm text-[#96a4ad] max-w-md mb-6 leading-relaxed">
          نظام محادثات احترافي متعدد الأجهزة. اختر محادثة من القائمة للبدء في الرد أو ابدأ محادثة جديدة مع عميل.
        </p>
        <button
          @click="showNewChatModal = true"
          class="px-5 py-2.5 rounded-xl bg-[#00a884] hover:bg-[#02906f] text-[#18242b] font-bold text-sm transition-all shadow-lg shadow-[#00a884]/20"
        >
          بدء محادثة جديدة
        </button>
      </div>

      <!-- Active Chat Window -->
      <template v-else>
        <!-- Chat Header -->
        <header class="h-16 bg-[#25343d] px-4 border-b border-[#2c3c45] flex items-center justify-between shrink-0 z-20">
          <!-- Multi-select action bar — replaces the normal header -->
          <template v-if="selectMode">
            <div class="flex items-center gap-3 w-full">
              <button @click="exitSelectMode" class="p-1.5 text-[#aebac1] hover:text-white rounded-full hover:bg-[#3d505c] transition-colors">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
              <span class="text-sm font-bold text-[#f0f2f5]">{{ selectedIds.length }} محددة</span>
              <div class="flex-1"></div>
              <button
                :disabled="!selectedIds.length"
                @click="shareSelected"
                class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600/20 text-sky-300 hover:bg-sky-600/40 text-xs font-bold transition-colors disabled:opacity-40"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/></svg>
                مشاركة
              </button>
              <button
                :disabled="!selectedIds.length"
                @click="forwardSelectedMsgs"
                class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/40 text-xs font-bold transition-colors disabled:opacity-40"
              >
                <svg class="w-4 h-4 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M5 5l7 7-7 7"/></svg>
                تحويل
              </button>
              <button
                :disabled="!selectedIds.length"
                @click="deleteSelectedMsgs"
                class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#f15c6d]/15 text-[#f15c6d] hover:bg-[#f15c6d]/30 text-xs font-bold transition-colors disabled:opacity-40"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                حذف
              </button>
            </div>
          </template>
          <template v-else>
          <div class="flex items-center gap-3 min-w-0">
            <!-- Back button for mobile -->
            <button
              @click="backToList"
              class="md:hidden text-[#aebac1] hover:text-white p-1 rounded-full"
            >
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
            </button>

            <!-- Contact Avatar — click opens the contact-info panel -->
            <div
              class="flex items-center gap-3 cursor-pointer group/header min-w-0"
              @click="openContactInfo"
              title="معلومات جهة الاتصال"
            >
            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-600 to-teal-500 text-white font-bold flex items-center justify-center shrink-0 text-sm shadow overflow-hidden relative">
              <img
                v-if="avatarSrc(activeConv)"
                :src="avatarSrc(activeConv)"
                alt=""
                class="absolute inset-0 w-full h-full object-cover"
                @error="markAvatarBroken(activeConv.contact_avatar)"
              />
              <span v-else>{{ convInitial(activeConv) }}</span>
            </div>

            <!-- Contact details & device indicator -->
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <h3 class="text-sm font-bold text-[#f0f2f5] truncate">
                  {{ convTitle(activeConv) }}
                </h3>
                <!-- Device badge in header -->
                <span
                  class="px-2 py-0.5 rounded text-[10px] font-black"
                  :class="getDeviceBadgeClass(activeConv.session_id)"
                >
                  عبر: {{ activeConv.session?.device_name || ('ج' + activeConv.session_id) }}
                </span>
                <span
                  v-if="isGroupConv"
                  class="px-2 py-0.5 rounded text-[10px] font-black bg-violet-500/20 text-violet-300"
                >
                  جروب
                </span>
              </div>
              <p v-if="typingConvs[activeConv.id]" class="text-[11px] text-[#00a884] font-semibold animate-pulse">
                يكتب الآن…
              </p>
              <p v-else class="text-[11px] text-[#96a4ad] font-mono" dir="ltr">
                +{{ activeConv.contact_phone }}<template v-if="activeConv.contact_username && convTitle(activeConv) !== '@' + activeConv.contact_username"> · @{{ activeConv.contact_username }}</template>
              </p>
              <p v-if="activeConv.rating" class="text-[11px] text-amber-400 leading-tight">
                {{ '★'.repeat(activeConv.rating) }}<span v-if="activeConv.rating_note" class="text-[#96a4ad]"> — {{ activeConv.rating_note }}</span>
              </p>
            </div>
            </div>
          </div>

          <!-- Header Right Actions -->
          <div class="flex items-center gap-2">
            <!-- Voice call -->
            <button
              v-if="activeConv && !lockedByOther"
              @click="startCall(false)"
              :disabled="callBusy"
              class="p-2 rounded-full transition-colors"
              :class="callState !== 'idle' ? 'text-[#00a884] bg-[#00a884]/15' : 'text-[#aebac1] hover:text-[#00a884] hover:bg-[#3d505c] disabled:opacity-40'"
              title="مكالمة صوتية واتساب"
            >
              <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.6.1.3 0 .7-.2 1l-2.3 2.2z"/>
              </svg>
            </button>
            <!-- Video call -->
            <button
              v-if="activeConv && !lockedByOther"
              @click="startCall(true)"
              :disabled="callBusy"
              class="p-2 rounded-full transition-colors"
              :class="callState !== 'idle' ? 'text-[#00a884] bg-[#00a884]/15' : 'text-[#aebac1] hover:text-[#00a884] hover:bg-[#3d505c] disabled:opacity-40'"
              title="مكالمة فيديو واتساب"
            >
              <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z"/>
              </svg>
            </button>
            <!-- Who's holding this chat -->
            <span
              v-if="activeConv.transferred_by && activeConv.assigned_agent_id === user?.id"
              class="px-2 py-1 rounded-lg bg-violet-500/15 text-violet-300 text-[11px] font-bold whitespace-nowrap"
            >حوّلها لك {{ transferredName(activeConv) }}</span>
            <span
              v-else-if="activeConv.assigned_agent_id"
              class="px-2 py-1 rounded-lg bg-amber-500/15 text-amber-300 text-[11px] font-bold whitespace-nowrap"
            >مع {{ assignedName(activeConv) }}</span>
            <span
              v-else-if="activeConv.last_outgoing_user_id"
              class="px-2 py-1 rounded-lg bg-sky-500/15 text-sky-300 text-[11px] font-bold whitespace-nowrap"
              :title="'آخر موظف رد على هذه المحادثة'"
            >آخر رد: {{ lastSenderName(activeConv) }}</span>
            <span
              v-if="activeConv.resolved_at"
              class="px-2 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 text-[11px] font-bold whitespace-nowrap"
            >✓ مكتمل</span>

            <!-- Reopen: owner, or the agent who closed it -->
            <button
              v-if="canReopen"
              @click="submitReopen"
              class="px-3 py-1.5 rounded-lg bg-sky-600/20 text-sky-300 hover:bg-sky-600/40 text-[11px] font-bold transition-colors whitespace-nowrap"
              title="إرجاع المحادثة لقائمة الشاتات المتاحة"
            >
              إعادة فتح
            </button>

            <!-- Transfer chat to another agent -->
            <button
              v-if="canTransfer"
              @click="openTransferModal"
              class="px-3 py-1.5 rounded-lg bg-violet-600/20 text-violet-300 hover:bg-violet-600/40 text-[11px] font-bold transition-colors whitespace-nowrap"
              title="تحويل المحادثة لموظف تاني"
            >
              تحويل
            </button>

            <!-- End chat: assigned agent or owner -->
            <button
              v-if="!lockedByOther && !activeConv.resolved_at"
              @click="openResolveModal"
              class="px-3 py-1.5 rounded-lg bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/40 text-[11px] font-bold transition-colors whitespace-nowrap"
              title="إنهاء المحادثة وإتاحتها لأي موظف"
            >
              إنهاء الشات
            </button>

            <!-- Jump to date (WhatsApp calendar search) -->
            <div class="relative">
              <button
                @click="showDateJump = !showDateJump"
                class="p-2 text-[#aebac1] hover:text-[#00a884] rounded-full hover:bg-[#3d505c] transition-colors"
                title="الذهاب إلى تاريخ"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
                  <rect x="3" y="4" width="18" height="18" rx="3"/>
                  <path stroke-linecap="round" d="M16 2v4M8 2v4M3 10h18"/>
                </svg>
              </button>
              <div
                v-if="showDateJump"
                class="absolute top-11 left-0 z-40 bg-[#2c3b44] border border-[#30424c] rounded-xl shadow-2xl p-3 w-56"
              >
                <p class="text-[11px] text-[#96a4ad] mb-2 font-semibold">اذهب إلى يوم معين</p>
                <input
                  type="date"
                  v-model="jumpDate"
                  :max="todayStr"
                  dir="ltr"
                  class="w-full bg-[#18242b] border border-[#30424c] rounded-lg px-2.5 py-1.5 text-sm text-[#f0f2f5] focus:outline-none focus:border-[#00a884] [color-scheme:dark]"
                />
                <button
                  @click="jumpToDate"
                  :disabled="!jumpDate"
                  class="mt-2 w-full py-1.5 rounded-lg bg-[#00a884] hover:bg-[#02906f] text-[#18242b] text-xs font-bold disabled:opacity-40 transition-colors"
                >
                  اذهب
                </button>
              </div>
            </div>

            <!-- Outgoing device selector (which phone sends) -->
            <div class="hidden sm:flex items-center gap-1.5 bg-[#18242b] px-2.5 py-1 rounded-lg border border-[#30424c]">
              <span class="text-[11px] text-[#96a4ad]">الإرسال من:</span>
              <select
                v-model="sendSessionId"
                class="bg-transparent text-xs text-[#00a884] font-bold focus:outline-none cursor-pointer"
              >
                <option v-for="d in connectedDevices" :key="d.id" :value="d.id" class="bg-[#18242b] text-white">
                  {{ d.device_name }}
                </option>
              </select>
            </div>
          </div>
          </template>
        </header>

        <!-- Messages Area with WhatsApp Doodle Wallpaper -->
        <div
          ref="messagesContainer"
          @scroll.passive="onMessagesScroll"
          class="flex-1 overflow-y-auto p-4 space-y-2 relative z-10 bg-transparent"
        >
          <!-- Loading spinner while the page of messages resolves -->
          <div v-if="loadingMessages" class="flex flex-col items-center justify-center gap-3 p-12 text-xs text-[#96a4ad]">
            <span class="wx-spinner w-7 h-7"></span>
            جاري تحميل الرسائل...
          </div>

          <template v-else>
            <!-- Older-messages paging: spinner while fetching, E2E pill at the top -->
            <div v-if="loadingOlder" class="flex justify-center py-1">
              <span class="wx-spinner w-5 h-5"></span>
            </div>
            <div v-else-if="!hasMoreMessages && messages.length" class="text-center pb-2">
              <span class="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#202d35] text-[#ffd279] text-[11px] shadow">
                <svg width="11" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-1V6a5 5 0 0 0-5-5zm-3 8V6a3 3 0 1 1 6 0v3H9z"/></svg>
                الرسائل مشفرة تمامًا بين الطرفين
              </span>
            </div>
          </template>

          <div v-if="!loadingMessages && !messages.length" class="text-center py-12">
            <span class="px-4 py-1.5 rounded-lg bg-[#202d35] text-[#96a4ad] text-xs shadow">
              لا توجد رسائل سابقة. ابدأ المحادثة الآن!
            </span>
          </div>

          <!-- Message Bubbles (grouped by day like WhatsApp) -->
          <template v-for="(m, i) in messages" :key="m.id">
            <!-- Day separator pill -->
            <div v-if="isNewDay(i)" class="flex justify-center py-1 sticky top-0 z-10">
              <span class="px-4 py-1.5 rounded-lg bg-[#202d35] text-[#96a4ad] text-[11px] shadow">
                {{ dayLabel(m.timestamp || m.created_at) }}
              </span>
            </div>
            <div
              :id="'msg-' + (m.message_id || m.id)"
              class="flex flex-col group relative mb-1"
              :class="m.direction === 'outgoing' ? 'items-start' : 'items-end'"
              @contextmenu.prevent="openContextMenu(m, $event)"
            >
              <!-- Multi-select overlay: captures all clicks while selecting -->
              <div
                v-if="selectMode"
                class="absolute -inset-x-4 inset-y-0 z-30 cursor-pointer rounded-lg"
                :class="selectedIds.includes(m.id) ? 'bg-[#00a884]/10' : 'hover:bg-white/5'"
                @click="toggleSelect(m)"
              ></div>
            <div
              class="max-w-[85%] md:max-w-[70%] lg:max-w-[65%] rounded-lg p-1.5 px-2.5 shadow-sm relative transition-all"
              :class="[
                m.direction === 'outgoing' ? 'bg-[#006d5b] text-[#f0f2f5] rounded-tr-none ml-2' : 'bg-[#25343d] text-[#f0f2f5] rounded-tl-none mr-2',
                selectedIds.includes(m.id) ? 'ring-2 ring-[#00a884] ring-offset-1 ring-offset-[#131f26]' : '',
              ]"
            >
              <!-- WhatsApp Bubble Corner Tails -->
              <svg
                v-if="m.direction === 'outgoing'"
                viewBox="0 0 8 13"
                height="13"
                width="8"
                class="absolute top-0 -right-2 text-[#006d5b] fill-current pointer-events-none"
              >
                <path d="M5.188 0H0v12.19l6.467-8.622C7.526 1.156 6.958 0 5.188 0z"/>
              </svg>
              <svg
                v-if="m.direction === 'incoming'"
                viewBox="0 0 8 13"
                height="13"
                width="8"
                class="absolute top-0 -left-2 text-[#25343d] fill-current pointer-events-none"
              >
                <path d="M1.533 3.568L8 12.19V0H2.812C1.042 0 .474 1.156 1.533 3.568z"/>
              </svg>

              <!-- Multi-select checkbox — pinned to the bubble's outer edge -->
              <span
                v-if="selectMode"
                class="absolute top-1/2 -translate-y-1/2 z-40 w-5 h-5 rounded-full border-2 flex items-center justify-center pointer-events-none"
                :class="[selectedIds.includes(m.id) ? 'bg-[#00a884] border-[#00a884]' : 'border-[#96a4ad]', m.direction === 'outgoing' ? '-left-8' : '-right-8']"
              >
                <svg v-if="selectedIds.includes(m.id)" class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>
              </span>

              <!-- Group sender — which participant sent this message -->
              <div
                v-if="isGroupConv && m.direction === 'incoming'"
                class="text-[12px] font-semibold mb-0.5 select-none"
                :style="{ color: groupSenderColor(m.from) }"
                dir="ltr"
              >
                {{ groupSenderLabel(m) }}
              </div>

              <!-- Forwarded label — like WhatsApp's "Forwarded" tag -->
              <div v-if="m.is_forwarded" class="mb-1 flex items-center gap-1 text-[10px] italic text-[#96a4ad] select-none">
                <svg class="w-3.5 h-3.5 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7"/></svg>
                <span>مُعاد توجيهها</span>
              </div>

              <!-- Quoted / Reply To Message if any -->
              <div
                v-if="m.reply_to_id"
                class="mb-1 p-1.5 rounded-md bg-black/20 border-r-4 border-[#00a884] text-[11px] text-[#96a4ad] cursor-pointer"
                @click="scrollToMessage(m.reply_to_id)"
              >
                <template v-if="quotedPreview(m.reply_to_id)">
                  <p class="font-bold text-[#00a884] text-[10px] mb-0.5">
                    {{ quotedPreview(m.reply_to_id).direction === 'outgoing' ? 'أنت' : convTitle(activeConv) }}
                  </p>
                  <p class="truncate max-w-[220px] text-[#dfe5e8]">
                    {{ quotedPreview(m.reply_to_id).message || `[${quotedPreview(m.reply_to_id).message_type}]` }}
                  </p>
                </template>
                <span v-else>رد على رسالة</span>
              </div>

              <!-- Anti-delete badge — the row is kept, only flagged -->
              <div
                v-if="m.revoked_at"
                class="mb-1 flex items-center gap-1.5 w-fit rounded-lg bg-[#f15c6d]/10 border border-[#f15c6d]/25 px-2 py-1 text-[10px] italic text-[#f15c6d]"
              >
                <span class="not-italic">🚫</span>
                <span>{{ m.direction === 'outgoing' ? 'حذفتَ هذه الرسالة لدى الجميع' : 'العميل حذف هذه الرسالة لدى الجميع — المحتوى محفوظ' }}</span>
              </div>

              <!-- Media Content: Image / Sticker -->
              <div v-if="(m.message_type === 'image' || m.message_type === 'sticker') && mediaSrc(m)" class="mb-1">
                <img
                  :src="mediaSrc(m)"
                  alt="WhatsApp Image"
                  class="rounded-lg max-h-72 w-full object-cover cursor-pointer hover:opacity-95 transition-opacity"
                  @click="openLightbox(m)"
                />
              </div>

              <!-- Media Content: Video — click opens the viewer (like WhatsApp);
                   the first frame shows via preload=metadata -->
              <div
                v-else-if="m.message_type === 'video' && mediaSrc(m)"
                class="mb-1 relative cursor-pointer group/vid"
                @click="openLightbox(m)"
              >
                <video
                  :src="mediaSrc(m)"
                  preload="metadata"
                  muted
                  class="rounded-lg max-h-72 w-full bg-black/60 pointer-events-none"
                ></video>
                <div class="absolute inset-0 flex items-center justify-center">
                  <span class="w-12 h-12 rounded-full bg-black/55 flex items-center justify-center transition-transform group-hover/vid:scale-110">
                    <svg class="w-6 h-6 text-white mr-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                  </span>
                </div>
              </div>

              <!-- Media Content: Audio / Voice Note (Official WhatsApp Web Style) -->
              <div v-else-if="(m.message_type === 'audio' || m.message_type === 'voice') && (!m.media_mime_type || m.media_mime_type.startsWith('audio/'))" class="mb-1">
                <div class="flex items-center gap-2.5 p-1 min-w-[260px] max-w-[330px]" dir="ltr">
                  <!-- Play / Pause Button -->
                  <button
                    type="button"
                    @click.stop="togglePlayAudio(m)"
                    class="w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-95"
                    :class="m.direction === 'outgoing' ? 'text-white hover:text-white/80' : 'text-[#00a884] hover:text-[#00a884]/80'"
                    :title="activeAudioId === m.id && audioPlaying ? 'إيقاف مؤقت' : 'تشغيل'"
                  >
                    <!-- Pause Icon -->
                    <svg v-if="activeAudioId === m.id && audioPlaying" class="w-7 h-7 fill-current" viewBox="0 0 24 24">
                      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                    </svg>
                    <!-- Play Icon -->
                    <svg v-else class="w-7 h-7 fill-current ml-0.5" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  </button>

                  <!-- Waveform track -->
                  <div class="flex-1 flex flex-col justify-center min-w-0">
                    <div
                      class="h-7 flex items-center gap-[2.5px] cursor-pointer relative py-1"
                      @click="seekAudio(m, $event)"
                    >
                      <span
                        v-for="(bh, bi) in getWaveformBars(m.id || m.message_id)"
                        :key="bi"
                        class="w-[2.5px] rounded-full transition-colors"
                        :style="{ height: bh + 'px' }"
                        :class="activeAudioId === m.id && ((audioCurrentTime / (audioDurations[m.id] || m.media?.seconds || 1)) >= (bi / 28)) ? (m.direction === 'outgoing' ? 'bg-[#53bdeb]' : 'bg-[#00a884]') : 'bg-[#96a4ad]/40'"
                      ></span>
                    </div>
                    <!-- Duration -->
                    <div class="flex items-center justify-between text-[11px] text-[#96a4ad] -mt-0.5">
                      <span>{{ activeAudioId === m.id && audioPlaying ? formatAudioSeconds(audioCurrentTime) : getAudioDuration(m) }}</span>
                    </div>
                  </div>

                  <!-- Profile Avatar with Mic Badge -->
                  <div class="relative shrink-0">
                    <div class="w-10 h-10 rounded-full overflow-hidden bg-[#30424c] flex items-center justify-center text-xs font-bold text-[#f0f2f5]">
                      <img
                        v-if="m.direction === 'outgoing' ? user?.avatar : avatarSrc(activeConv)"
                        :src="m.direction === 'outgoing' ? user?.avatar : avatarSrc(activeConv)"
                        alt=""
                        class="w-full h-full object-cover"
                      />
                      <span v-else>{{ m.direction === 'outgoing' ? 'U' : convInitial(activeConv) }}</span>
                    </div>
                    <!-- Cyan mic badge -->
                    <span class="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#131f26] flex items-center justify-center shadow-sm">
                      <svg class="w-2.5 h-2.5 text-[#53bdeb]" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                      </svg>
                    </span>
                  </div>
                </div>
              </div>

              <!-- Media Content: Document — WhatsApp-style file card -->
              <div v-else-if="isDocMessage(m)" class="mb-1">
                <component
                  :is="mediaSrc(m) ? 'a' : 'div'"
                  :href="mediaSrc(m) || undefined"
                  target="_blank"
                  :download="docInfo(m).fileName"
                  class="flex items-center gap-3 p-2 bg-black/20 rounded-lg min-w-[230px] max-w-[320px] hover:bg-black/30 transition-colors"
                >
                  <!-- File icon colored by extension -->
                  <div class="w-11 h-12 rounded-lg flex flex-col items-center justify-center shrink-0 relative overflow-hidden"
                    :style="{ backgroundColor: docInfo(m).color }">
                    <svg class="w-6 h-6 text-white/95" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M6 2a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6H6zm7 1.5L18.5 9H13V3.5zM8 13h8v1.5H8V13zm0 3h8v1.5H8V16z"/>
                    </svg>
                    <span class="text-[7px] font-black text-white leading-none mt-0.5 px-0.5 truncate w-full text-center">{{ docInfo(m).ext }}</span>
                  </div>
                  <div class="flex-1 min-w-0" dir="ltr" style="text-align:left">
                    <p class="text-xs font-bold text-[#f0f2f5] truncate">{{ docInfo(m).fileName }}</p>
                    <p class="text-[10px] text-[#96a4ad] mt-0.5">{{ docInfo(m).sub }}</p>
                  </div>
                </component>
              </div>

              <!-- Media Content: Location / Contact -->
              <div v-else-if="m.message_type === 'location'" class="mb-1">
                <div class="flex items-center gap-2 p-2 bg-black/20 rounded-lg text-xs text-[#dfe5e8]">
                  <span class="text-base">📍</span>
                  <span>{{ m.message || 'موقع' }}</span>
                </div>
              </div>
              <div v-else-if="m.message_type === 'contact'" class="mb-1">
                <div class="flex items-center gap-2 p-2 bg-black/20 rounded-lg text-xs text-[#dfe5e8]">
                  <span class="text-base">👤</span>
                  <span>{{ m.message || 'جهة اتصال' }}</span>
                </div>
              </div>
              <div v-else-if="m.message_type === 'call'" class="mb-1">
                <div class="flex items-center gap-2 p-2 bg-black/20 rounded-lg text-xs text-[#dfe5e8]">
                  <span class="text-base">{{ m.direction === 'incoming' ? '📲' : '📞' }}</span>
                  <span>{{ m.message || 'مكالمة صوتية' }}</span>
                </div>
              </div>

              <!-- Text Message Content (caption or plain text; hides [placeholder] labels on media) -->
              <p v-if="m.message && !['location', 'contact', 'call'].includes(m.message_type) && !isPlaceholderText(m)" class="text-[14.2px] whitespace-pre-wrap leading-[19px] break-words px-0.5 text-[#f0f2f5]">
                <template v-for="(part, pi) in msgParts(m)" :key="pi"><a
                    v-if="part.t === 'link'"
                    :href="part.href"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-[#53bdeb] hover:underline"
                    dir="ltr"
                    @click.stop
                  >{{ part.v }}</a><span
                    v-else-if="part.t === 'mention'"
                    class="text-[#53bdeb] font-semibold"
                  >{{ part.v }}</span><template v-else>{{ part.v }}</template></template>
              </p>

              <!-- Footer: Time + Status Ticks -->
              <div class="flex items-center justify-end gap-1 text-[11px] text-[#96a4ad] mt-0.5 select-none pl-1" dir="ltr">
                <span>{{ formatTime(m.timestamp || m.created_at) }}</span>
                <span v-if="m.direction === 'outgoing'">
                  <span v-if="m.status === 'sending'" class="text-[#96a4ad]">🕐</span>
                  <span v-else-if="m.status === 'failed'" class="text-[#f15c6d] font-bold" title="فشل الإرسال">✗</span>
                  <span v-else-if="m.status === 'read'" class="text-[#53bdeb] font-bold">✓✓</span>
                  <span v-else-if="m.status === 'delivered'" class="text-[#96a4ad]">✓✓</span>
                  <span v-else class="text-[#96a4ad]">✓</span>
                </span>
              </div>

              <!-- Reactions Display Pills (e.g. ❤️ 1, 👍 2) -->
              <div
                v-if="m.reactions && m.reactions.length > 0"
                class="absolute -bottom-2.5 right-2 flex items-center gap-1 bg-[#202d35] border border-[#30424c] rounded-full px-1.5 py-0.5 shadow-md z-10"
              >
                <span
                  v-for="(r, idx) in m.reactions"
                  :key="idx"
                  class="text-xs cursor-pointer hover:scale-125 transition-transform"
                  :title="r.from"
                  @click="removeReaction(m, r.emoji)"
                >
                  {{ r.emoji }}
                </span>
              </div>

              <!-- Hover Reaction Trigger Button (+ 😀) -->
              <div
                class="opacity-0 group-hover:opacity-100 transition-opacity absolute top-1"
                :class="m.direction === 'outgoing' ? '-left-8' : '-right-8'"
              >
                <button
                  @click="toggleReactionPicker(m.id)"
                  class="w-6 h-6 rounded-full bg-[#25343d] text-[#aebac1] hover:text-white flex items-center justify-center text-xs shadow"
                  title="إضافة تفاعل"
                >
                  😀
                </button>
              </div>

              <!-- Reaction Picker Popover -->
              <div
                v-if="activeReactionMessageId === m.id"
                class="absolute -top-10 z-30 bg-[#25343d] border border-[#30424c] rounded-full px-2 py-1 shadow-2xl flex items-center gap-1.5"
                :class="m.direction === 'outgoing' ? 'left-0' : 'right-0'"
              >
                <button
                  v-for="emoji in popularEmojis"
                  :key="emoji"
                  @click="addReaction(m, emoji)"
                  class="text-base hover:scale-125 transition-transform p-0.5"
                >
                  {{ emoji }}
                </button>
                <button
                  @click="activeReactionMessageId = null"
                  class="text-xs text-[#96a4ad] hover:text-white px-1"
                >
                  ✕
                </button>
              </div>
            </div>
            </div>
          </template>

          <!-- Spinner while paging forward after a date jump -->
          <div v-if="loadingNewer" class="flex justify-center py-1">
            <span class="wx-spinner w-5 h-5"></span>
          </div>
        </div>

        <!-- Floating pill: jump back to the live edge while browsing history -->
        <button
          v-if="hasNewerMessages"
          @click="loadMessages(activeConv.id)"
          class="absolute bottom-24 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-4 py-2 rounded-full bg-[#00a884] text-[#18242b] text-xs font-bold shadow-lg hover:bg-[#02906f] transition-colors"
        >
          ↓ الرجوع لأحدث الرسائل
        </button>

        <!-- Floating scroll-to-bottom arrow (WhatsApp style) — appears when
             the user scrolls up, carries the unread counter as a badge. -->
        <button
          v-if="showScrollDown"
          @click="onScrollDownClick"
          class="absolute bottom-24 left-5 z-20 w-11 h-11 rounded-full bg-[#2c3b44] border border-[#30424c] shadow-xl flex items-center justify-center text-[#aebac1] hover:text-white hover:bg-[#30424c] transition-all"
          title="الذهاب لآخر رسالة"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 14l-7 7m0 0l-7-7m7 7V3"/></svg>
          <span
            v-if="scrollDownCount"
            class="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#00a884] text-[#18242b] text-[10px] font-black flex items-center justify-center"
          >{{ scrollDownCount }}</span>
        </button>

        <!-- Chat Input Area -->
        <footer class="bg-[#25343d] p-3 border-t border-[#2c3c45] shrink-0 z-20">
          <!-- Locked by another agent — read-only for everyone else -->
          <div
            v-if="lockedByOther"
            class="flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-500/10 text-amber-300 text-sm font-bold"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"/></svg>
            {{ assignedName(activeConv) }} بيتعامل مع هذه المحادثة حالياً — مش هتقدر ترد لحد ما يخلصها
          </div>

          <template v-else>
          <!-- Reply preview bar -->
          <div v-if="replyTarget" class="mb-2 flex items-center gap-2 bg-[#18242b] border-r-2 border-[#00a884] rounded-xl px-3 py-2">
            <div class="flex-1 min-w-0">
              <p class="text-[11px] font-bold text-[#00a884]">
                رد على {{ replyTarget.direction === 'outgoing' ? 'نفسك' : convTitle(activeConv) }}
              </p>
              <p class="text-xs text-[#96a4ad] truncate">
                {{ replyTarget.message || `[${replyTarget.message_type}]` }}
              </p>
            </div>
            <button @click="replyTarget = null" class="text-[#96a4ad] hover:text-white p-1 shrink-0">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>

          <!-- Voice Recording Bar Mode -->
          <div v-if="isRecording" class="flex items-center justify-between bg-[#18242b] p-3 rounded-2xl border border-rose-500/30">
            <div class="flex items-center gap-3">
              <span class="w-3 h-3 rounded-full bg-rose-500 animate-ping"></span>
              <span class="text-rose-400 font-bold text-sm">جاري تسجيل مقطع صوتي...</span>
              <span class="font-mono text-xs text-white">{{ formatRecordingTime(recordingSeconds) }}</span>
            </div>
            <div class="flex items-center gap-2">
              <button
                @click="cancelRecording"
                class="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 hover:text-rose-400 text-xs font-bold transition-colors"
              >
                إلغاء
              </button>
              <button
                @click="stopAndSendRecording"
                class="px-4 py-1.5 rounded-xl bg-[#00a884] text-[#18242b] font-black text-xs hover:bg-[#02906f] transition-colors"
              >
                إرسال الصوت
              </button>
            </div>
          </div>

          <!-- Normal Message Input Mode -->
          <div v-else class="flex items-end gap-2">
            <!-- Unified composer: the bordered box IS the input — attach/emoji
                 live inside it so the typing area runs edge to edge -->
            <div class="flex-1 flex items-end gap-1 bg-[#30424c] rounded-lg px-2 border border-transparent focus-within:border-[#00a884]/40">
            <!-- Attachment Button & Popup -->
            <div class="relative">
              <button
                @click="showAttachMenu = !showAttachMenu"
                class="p-2.5 text-[#96a4ad] hover:text-[#00a884] rounded-full hover:bg-[#3d505c] transition-colors"
                title="إرفاق ملف أو وسائط"
              >
                <svg class="w-6 h-6 rotate-45" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
              </button>

              <!-- Attachment Popup -->
              <div
                v-if="showAttachMenu"
                class="absolute bottom-14 right-0 w-48 bg-[#25343d] border border-[#30424c] rounded-2xl p-2 shadow-2xl z-40 space-y-1 text-xs"
              >
                <!-- Image attachment -->
                <button
                  @click="triggerFileInput('image')"
                  class="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-[#3d505c] text-[#dfe5e8] transition-colors"
                >
                  <span class="w-8 h-8 rounded-lg bg-pink-500/20 text-pink-400 flex items-center justify-center font-bold">📷</span>
                  <span class="font-bold">صور (Image)</span>
                </button>
                <!-- Video attachment -->
                <button
                  @click="triggerFileInput('video')"
                  class="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-[#3d505c] text-[#dfe5e8] transition-colors"
                >
                  <span class="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold">🎥</span>
                  <span class="font-bold">فيديو (Video)</span>
                </button>
                <!-- Audio attachment -->
                <button
                  @click="triggerFileInput('audio')"
                  class="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-[#3d505c] text-[#dfe5e8] transition-colors"
                >
                  <span class="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">🎵</span>
                  <span class="font-bold">ملف صوتي (Audio)</span>
                </button>
                <!-- Document attachment -->
                <button
                  @click="triggerFileInput('document')"
                  class="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-[#3d505c] text-[#dfe5e8] transition-colors"
                >
                  <span class="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold">📄</span>
                  <span class="font-bold">مستند (Document)</span>
                </button>
              </div>

              <!-- Hidden file inputs -->
              <input ref="imageInput" type="file" accept="image/*" class="hidden" @change="handleFileSelected('image', $event)" />
              <input ref="videoInput" type="file" accept="video/*" class="hidden" @change="handleFileSelected('video', $event)" />
              <input ref="audioInput" type="file" accept="audio/*" class="hidden" @change="handleFileSelected('audio', $event)" />
              <input ref="documentInput" type="file" class="hidden" @change="handleFileSelected('document', $event)" />
            </div>

            <!-- Emoji Picker Trigger -->
            <button
              @click="showEmojiMenu = !showEmojiMenu"
              class="p-2.5 text-[#96a4ad] hover:text-[#00a884] rounded-full hover:bg-[#3d505c] transition-colors"
              title="إيموجي"
            >
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </button>

            <!-- @mention member picker (groups only) -->
            <div v-if="mentionMenu.show" class="absolute bottom-full left-0 mb-1 w-72 max-h-64 overflow-y-auto rounded-xl bg-[#25343d] border border-[#30424c] shadow-2xl z-30">
              <button
                v-for="m in mentionMenu.items"
                :key="m.jid"
                @mousedown.prevent="pickMention(m)"
                class="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[#30424c] text-right transition-colors"
              >
                <div class="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-600 to-teal-500 text-white text-[10px] font-bold flex items-center justify-center shrink-0">{{ memberLabel(m)[0] }}</div>
                <div class="min-w-0">
                  <div class="text-xs text-[#dfe5e8] truncate">{{ m.name || '—' }}</div>
                  <div class="text-[10px] text-[#96a4ad] font-mono" dir="ltr">{{ m.phone ? '+' + m.phone : (m.lid ? 'LID ' + m.lid : m.jid) }}</div>
                </div>
              </button>
            </div>

            <!-- Text Input Area — flush with the composer box edges -->
            <textarea
              v-model="messageText"
              @input="onTypingInput"
              @keydown.enter.exact.prevent="sendTextMessage"
              @paste="handlePaste"
              placeholder="اكتب رسالة... (Enter للإرسال)"
              rows="1"
              class="flex-1 min-w-0 bg-transparent py-2.5 px-1 text-sm text-[#dfe5e8] placeholder-[#96a4ad] focus:outline-none resize-none max-h-32"
            ></textarea>
            </div>

            <!-- Record Voice Note Button (when text is empty) -->
            <button
              v-if="!messageText.trim()"
              @click="startVoiceRecording"
              class="p-2.5 text-[#96a4ad] hover:text-[#00a884] rounded-full hover:bg-[#3d505c] transition-colors shrink-0"
              title="تسجيل رسالة صوتية"
            >
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/></svg>
            </button>

            <!-- Send Button (when text is present) -->
            <button
              v-else
              @click="sendTextMessage"
              class="p-2.5 bg-[#00a884] hover:bg-[#02906f] text-[#18242b] rounded-full transition-all shadow-md shrink-0 disabled:opacity-50"
              title="إرسال"
            >
              <span v-if="sending" class="wx-spinner w-5 h-5 block" style="border-top-color:#18242b;border-color:rgba(17,27,33,0.3);border-top-color:#18242b"></span>
              <svg v-else class="w-5 h-5 rotate-180" fill="currentColor" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
            </button>
          </div>

          <!-- Emoji Menu Drawer -->
          <div
            v-if="showEmojiMenu"
            class="mt-2 p-3 bg-[#18242b] border border-[#30424c] rounded-2xl grid grid-cols-8 gap-2 text-xl max-h-40 overflow-y-auto"
          >
            <button
              v-for="e in commonEmojis"
              :key="e"
              @click="appendEmoji(e)"
              class="hover:scale-125 transition-transform"
            >
              {{ e }}
            </button>
          </div>
          </template>
        </footer>
      </template>
    </main>

    <!-- Modal: Resolve chat + rate the customer -->
    <div
      v-if="showResolveModal"
      class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      @click.self="showResolveModal = false"
    >
      <div class="bg-[#25343d] border border-[#30424c] rounded-3xl w-full max-w-md p-6 shadow-2xl text-right relative">
        <button
          @click="showResolveModal = false"
          class="absolute top-5 left-5 text-[#96a4ad] hover:text-white p-1"
        >✕</button>
        <h3 class="text-lg font-bold text-white mb-1">إنهاء المحادثة</h3>
        <p class="text-xs text-[#96a4ad] mb-4">
          الشات هيتقفل ببادج «مكتمل» وهيتاح لأي موظف يرد عليه تاني. لو العميل بعت رسالة جديدة الشات هيتفتح تلقائياً.
        </p>

        <p class="text-xs font-semibold text-[#dfe5e8] mb-2">تقييم العميل (اختياري)</p>
        <div class="flex justify-center gap-1 mb-3" dir="ltr">
          <button
            v-for="s in 5"
            :key="s"
            @click="resolveRating = s"
            class="text-3xl transition-colors"
            :class="s <= resolveRating ? 'text-amber-400' : 'text-[#3b4a54] hover:text-amber-400/60'"
          >★</button>
        </div>

        <textarea
          v-model="resolveNote"
          rows="3"
          placeholder="ملاحظة عن العميل — هتظهر جنب رقمه دايماً (اختياري)…"
          class="w-full bg-[#18242b] border border-[#30424c] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#00a884] resize-none"
        ></textarea>

        <div class="flex gap-2 mt-4">
          <button
            @click="submitResolve"
            :disabled="resolving"
            class="flex-1 py-2.5 rounded-xl bg-[#00a884] hover:bg-[#02906f] text-[#18242b] font-black text-sm disabled:opacity-50 transition-colors"
          >
            {{ resolving ? 'جاري الإنهاء…' : 'إنهاء الشات' }}
          </button>
          <button
            @click="showResolveModal = false"
            class="px-5 py-2.5 rounded-xl bg-[#30424c] text-[#dfe5e8] text-sm font-bold hover:bg-[#3d505c] transition-colors"
          >
            إلغاء
          </button>
        </div>
      </div>
    </div>

    <!-- Modal: Transfer chat to another team member -->
    <div
      v-if="showTransferModal"
      class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      @click.self="showTransferModal = false"
    >
      <div class="bg-[#25343d] border border-[#30424c] rounded-3xl w-full max-w-md p-6 shadow-2xl text-right relative">
        <button
          @click="showTransferModal = false"
          class="absolute top-5 left-5 text-[#96a4ad] hover:text-white p-1"
        >✕</button>
        <h3 class="text-lg font-bold text-white mb-1">تحويل المحادثة</h3>
        <p class="text-xs text-[#96a4ad] mb-4">
          اختار الموظف اللي هيستلم الشات — هيظهرله إشعار إنك حولتهاله وهيتحط في أول قايمته.
        </p>

        <div class="max-h-72 overflow-y-auto space-y-1.5">
          <button
            v-for="a in transferTargets"
            :key="a.id"
            @click="submitTransfer(a)"
            :disabled="transferring || (a.is_full && !isOwner)"
            class="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-[#18242b] border border-[#30424c] hover:border-[#00a884] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span class="flex items-center gap-2.5 min-w-0">
              <span class="w-9 h-9 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-500 text-white font-bold flex items-center justify-center text-xs shrink-0">
                {{ (a.name || '?').charAt(0) }}
              </span>
              <span class="text-right min-w-0">
                <p class="text-sm font-bold text-[#f0f2f5] truncate">{{ a.name }}</p>
                <p class="text-[10px] text-[#96a4ad] truncate">{{ a.group_name || 'خدمة العملاء' }}</p>
              </span>
            </span>
            <span class="text-[11px] font-bold whitespace-nowrap" :class="a.is_full ? 'text-rose-400' : 'text-[#00a884]'">
              {{ a.active_chats }}/{{ a.max_active_chats || 5 }}<template v-if="a.is_full"> · ممتلئ</template>
            </span>
          </button>
          <div v-if="!transferTargets.length" class="text-center text-xs text-[#96a4ad] py-6">
            {{ loadingTransferTargets ? 'جاري تحميل الموظفين…' : 'مفيش موظفين متاحين للتحويل' }}
          </div>
        </div>

        <button
          @click="showTransferModal = false"
          class="mt-4 w-full py-2.5 rounded-xl bg-[#30424c] text-[#dfe5e8] text-sm font-bold hover:bg-[#3d505c] transition-colors"
        >
          إلغاء
        </button>
      </div>
    </div>

    <!-- Toast: a teammate handed a chat to you -->
    <Transition name="wx-fade">
      <div
        v-if="transferToast"
        class="fixed bottom-6 left-6 z-[60] bg-[#2c3b44] border border-violet-500/50 rounded-2xl px-4 py-3 shadow-2xl flex items-center gap-3 max-w-sm"
      >
        <span class="w-9 h-9 rounded-full bg-violet-500/20 text-violet-300 flex items-center justify-center shrink-0">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M7 16l-4-4m0 0l4-4m-4 4h18M17 8l4 4m0 0l-4 4m4-4H3"/></svg>
        </span>
        <div class="min-w-0">
          <p class="text-sm font-bold text-white">محادثة محولة إليك</p>
          <p class="text-xs text-[#aebac1]">قام {{ transferToast.from }} بتحويل محادثة إليك — هتلاقيها في «محادثاتي»</p>
        </div>
        <button @click="transferToast = null" class="text-[#96a4ad] hover:text-white p-1 shrink-0">✕</button>
      </div>
    </Transition>

    <!-- Modal: Start New Chat -->
    <div
      v-if="showNewChatModal"
      class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
      <div class="bg-[#25343d] border border-[#30424c] rounded-3xl w-full max-w-md p-6 shadow-2xl relative text-right">
        <button
          @click="showNewChatModal = false"
          class="absolute top-5 left-5 text-[#96a4ad] hover:text-white p-1"
        >
          ✕
        </button>
        <h3 class="text-lg font-bold text-white mb-1">بدء محادثة واتساب جديدة</h3>
        <p class="text-xs text-[#96a4ad] mb-4">أدخل رقم هاتف العميل بالصيغة الدولية</p>

        <form @submit.prevent="handleStartChat" class="space-y-4">
          <div>
            <label class="block text-xs font-semibold text-[#96a4ad] mb-1">رقم الهاتف (مع كود الدولة)</label>
            <input
              v-model="newChatPhone"
              type="text"
              required
              placeholder="مثال: 201012345678"
              dir="ltr"
              class="w-full bg-[#18242b] border border-[#30424c] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#00a884] font-mono"
            />
          </div>

          <div>
            <label class="block text-xs font-semibold text-[#96a4ad] mb-1">اسم العميل (اختياري)</label>
            <input
              v-model="newChatName"
              type="text"
              placeholder="اسم العميل أو النشاط"
              class="w-full bg-[#18242b] border border-[#30424c] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#00a884]"
            />
          </div>

          <div>
            <label class="block text-xs font-semibold text-[#96a4ad] mb-1">إرسال عبر الجهاز</label>
            <select
              v-model="newChatSessionId"
              class="w-full bg-[#18242b] border border-[#30424c] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#00a884]"
            >
              <option v-for="d in connectedDevices" :key="d.id" :value="d.id">
                {{ d.device_name }} (+{{ d.phone_number }})
              </option>
            </select>
          </div>

          <button
            type="submit"
            :disabled="creatingChat"
            class="w-full py-3 bg-[#00a884] hover:bg-[#02906f] text-[#18242b] font-bold text-sm rounded-xl transition-all shadow-lg"
          >
            <span>{{ creatingChat ? 'جاري فتح المحادثة...' : 'فتح الشات' }}</span>
          </button>
        </form>
      </div>
    </div>

    <!-- Media viewer — WhatsApp-style: image/video stage + filmstrip of all chat media -->
    <div
      v-if="viewerItem"
      @click="closeViewer"
      class="fixed inset-0 bg-black/95 z-50 flex flex-col"
    >
      <!-- Top bar: sender + time + download + close -->
      <div class="flex items-center justify-between gap-3 px-4 py-3 shrink-0" @click.stop>
        <div class="min-w-0">
          <div class="text-sm font-bold text-[#dfe5e8] truncate">{{ viewerItem.sender }}</div>
          <div class="text-[11px] text-[#96a4ad]">{{ formatChatTime(viewerItem.timestamp) }}</div>
        </div>
        <div class="flex items-center gap-1 shrink-0">
          <a
            :href="viewerItem.src"
            target="_blank"
            download
            class="p-2 rounded-lg text-[#96a4ad] hover:text-white hover:bg-white/10 transition-colors"
            title="تحميل"
            @click.stop
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
          </a>
          <button
            @click="closeViewer"
            class="p-2 rounded-lg text-[#96a4ad] hover:text-white hover:bg-white/10 transition-colors"
            title="إغلاق"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
      </div>

      <!-- Stage: media centered between prev/next arrows -->
      <div class="flex-1 min-h-0 relative flex items-center justify-center">
        <button
          v-if="viewerIndex > 0"
          @click.stop="viewerPrev"
          class="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 text-[#dfe5e8] flex items-center justify-center transition-colors"
          title="السابق"
        >
          <svg class="w-6 h-6 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
        </button>

        <img
          v-if="viewerItem.type === 'image'"
          :src="viewerItem.src"
          alt=""
          class="max-h-full max-w-full object-contain px-14"
          @click.stop
        />
        <video
          v-else
          ref="viewerVideoEl"
          :src="viewerItem.src"
          controls
          autoplay
          class="max-h-full max-w-full px-14"
          @click.stop
          @play="pauseActiveAudio"
        ></video>

        <button
          v-if="viewerIndex < viewer.items.length - 1"
          @click.stop="viewerNext"
          class="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 text-[#dfe5e8] flex items-center justify-center transition-colors"
          title="التالي"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
        </button>
      </div>

      <!-- Caption -->
      <div
        v-if="viewerItem.caption"
        class="shrink-0 text-center text-sm text-[#dfe5e8] px-8 pb-1.5 whitespace-pre-wrap break-words"
        @click.stop
      >{{ viewerItem.caption }}</div>

      <!-- Filmstrip: every image/video in this chat, current centered -->
      <div
        v-if="viewer.items.length > 1"
        ref="viewerStripEl"
        class="shrink-0 flex gap-1.5 px-3 py-2.5 overflow-x-auto"
        dir="ltr"
        @click.stop
      >
        <button
          v-for="(it, i) in viewer.items"
          :key="it.key"
          :data-current="i === viewerIndex ? '1' : null"
          @click.stop="viewer.index = i"
          class="relative w-14 h-14 rounded-lg overflow-hidden shrink-0 border-2 transition-all"
          :class="i === viewerIndex ? 'border-[#00a884]' : 'border-transparent opacity-55 hover:opacity-100'"
        >
          <video
            v-if="it.type === 'video'"
            :src="it.src"
            preload="metadata"
            muted
            class="w-full h-full object-cover bg-black pointer-events-none"
          ></video>
          <img v-else :src="it.src" alt="" class="w-full h-full object-cover" />
          <span
            v-if="it.type === 'video'"
            class="absolute inset-0 flex items-center justify-center bg-black/25"
          >
            <svg class="w-5 h-5 text-white drop-shadow" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </span>
        </button>
      </div>
    </div>

    <!-- Right-click Context Menu (WhatsApp style) -->
    <div
      v-if="ctxMenu.show"
      class="fixed inset-0 z-50"
      @click="ctxMenu.show = false"
      @contextmenu.prevent="ctxMenu.show = false"
    >
      <div
        ref="ctxMenuEl"
        class="absolute bg-[#2c3b44] border border-[#30424c] rounded-xl shadow-2xl py-1.5 w-44 text-sm max-h-[calc(100vh-16px)] overflow-y-auto"
        :style="{ top: ctxMenu.y + 'px', left: ctxMenu.x + 'px' }"
        @click.stop
      >
        <!-- Emoji reaction row -->
        <div class="flex items-center justify-around px-2 py-1.5 border-b border-[#30424c]">
          <button
            v-for="emoji in popularEmojis"
            :key="emoji"
            @click="addReaction(ctxMenu.msg, emoji); ctxMenu.show = false"
            class="text-lg hover:scale-125 transition-transform"
          >{{ emoji }}</button>
          <button
            @click="activeReactionMessageId = ctxMenu.msg.id; ctxMenu.show = false"
            class="text-[#96a4ad] hover:text-white text-xs p-1"
            title="المزيد"
          >+</button>
        </div>

        <button
          @click="setReplyTarget(ctxMenu.msg)"
          class="w-full flex items-center gap-3 px-4 py-2.5 text-[#dfe5e8] hover:bg-[#202d35] transition-colors"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a5 5 0 015 5v1M3 10l6-6m-6 6l6 6"/></svg>
          رد
        </button>
        <button
          @click="openForwardModal(ctxMenu.msg)"
          class="w-full flex items-center gap-3 px-4 py-2.5 text-[#dfe5e8] hover:bg-[#202d35] transition-colors"
        >
          <svg class="w-4 h-4 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M5 5l7 7-7 7"/></svg>
          تحويل
        </button>
        <button
          v-if="ctxMenu.msg?.message"
          @click="copyMessageText(ctxMenu.msg)"
          class="w-full flex items-center gap-3 px-4 py-2.5 text-[#dfe5e8] hover:bg-[#202d35] transition-colors"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
          نسخ النص
        </button>
        <button
          @click="enterSelectMode(ctxMenu.msg)"
          class="w-full flex items-center gap-3 px-4 py-2.5 text-[#dfe5e8] hover:bg-[#202d35] transition-colors"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          تحديد
        </button>
        <div class="border-t border-[#30424c] my-1"></div>
        <button
          @click="deleteMsg(ctxMenu.msg, false)"
          class="w-full flex items-center gap-3 px-4 py-2.5 text-[#f15c6d] hover:bg-[#202d35] transition-colors"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          حذف عندي
        </button>
        <button
          v-if="ctxMenu.msg?.direction === 'outgoing' && !ctxMenu.msg?.revoked_at"
          @click="deleteMsg(ctxMenu.msg, true)"
          class="w-full flex items-center gap-3 px-4 py-2.5 text-[#f15c6d] hover:bg-[#202d35] transition-colors"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          حذف عند الجميع
        </button>
        <button
          @click="ctxMenu.show = false"
          class="w-full flex items-center gap-3 px-4 py-2.5 text-[#96a4ad] hover:bg-[#202d35] transition-colors"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          إغلاق
        </button>
      </div>
    </div>

    <!-- Forward Modal -->
    <div
      v-if="showForwardModal"
      class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      @click.self="showForwardModal = false"
    >
      <div class="bg-[#25343d] border border-[#30424c] rounded-3xl w-full max-w-md p-5 shadow-2xl text-right max-h-[80vh] flex flex-col">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-bold text-white">تحويل إلى</h3>
          <button @click="showForwardModal = false" class="text-[#96a4ad] hover:text-white p-1">✕</button>
        </div>
        <p class="text-xs text-[#96a4ad] mb-3 truncate">
          <template v-if="forwardIds.length > 1">{{ forwardIds.length }} رسالة محددة</template>
          <template v-else>{{ forwardMsg?.message || `[${forwardMsg?.message_type}]` }}</template>
        </p>
        <input
          v-model="forwardSearch"
          type="text"
          placeholder="ابحث في المحادثات..."
          class="w-full bg-[#18242b] border border-[#30424c] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#00a884] mb-3"
        />
        <div class="flex-1 overflow-y-auto space-y-1">
          <button
            v-for="c in forwardTargets"
            :key="c.id"
            @click="toggleForwardTarget(c.id)"
            class="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-[#30424c] transition-colors text-right"
            :class="{ 'bg-[#00a884]/10 border border-[#00a884]/40': forwardSelected.includes(c.id) }"
          >
            <div class="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-600 to-teal-500 text-white font-bold flex items-center justify-center text-xs shrink-0 overflow-hidden relative">
              <img v-if="avatarSrc(c)" :src="avatarSrc(c)" class="absolute inset-0 w-full h-full object-cover" @error="markAvatarBroken(c.contact_avatar)" alt="" />
              <span v-else>{{ convInitial(c) }}</span>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-bold text-[#f0f2f5] truncate">{{ convTitle(c) }}</p>
              <p class="text-[10px] text-[#96a4ad] font-mono" dir="ltr">+{{ c.contact_phone }}</p>
            </div>
            <span v-if="forwardSelected.includes(c.id)" class="text-[#00a884] font-bold">✓</span>
          </button>
        </div>
        <button
          @click="doForward"
          :disabled="!forwardSelected.length || forwarding"
          class="mt-4 w-full py-2.5 bg-[#00a884] hover:bg-[#02906f] text-[#18242b] font-bold text-sm rounded-xl disabled:opacity-40 transition-all flex items-center justify-center gap-2"
        >
          <span v-if="forwarding" class="wx-spinner w-4 h-4 block" style="border-top-color:#18242b;border-color:rgba(17,27,33,0.3);border-top-color:#18242b"></span>
          {{ forwarding ? 'جاري التحويل...' : `تحويل${forwardSelected.length ? ' (' + forwardSelected.length + ')' : ''}` }}
        </button>
      </div>
    </div>

    <!-- Contact Info Side Panel (WhatsApp "Contact info") -->
    <Transition name="slide-left">
      <aside
        v-if="showContactInfo && activeConv"
        class="absolute inset-y-0 left-0 w-full sm:w-[380px] bg-[#18242b] border-r border-[#30424c] z-40 flex flex-col shadow-2xl"
      >
        <header class="bg-[#25343d] px-4 py-3 flex items-center gap-4 shrink-0">
          <button @click="showContactInfo = false" class="text-[#aebac1] hover:text-white p-1">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
          <h3 class="text-[#f0f2f5] font-bold text-sm">معلومات جهة الاتصال</h3>
        </header>

        <div class="flex-1 overflow-y-auto">
          <!-- Avatar + name -->
          <div class="p-6 flex flex-col items-center gap-3 border-b border-[#2c3c45]">
            <div class="w-36 h-36 rounded-full bg-gradient-to-br from-emerald-600 to-teal-500 text-white font-bold flex items-center justify-center text-5xl shadow-lg overflow-hidden relative">
              <img
                v-if="avatarSrc(activeConv)"
                :src="avatarSrc(activeConv)"
                alt=""
                class="absolute inset-0 w-full h-full object-cover"
                @error="markAvatarBroken(activeConv.contact_avatar)"
              />
              <span v-else>{{ convInitial(activeConv) }}</span>
            </div>

            <!-- Editable name -->
            <div v-if="!editingContactName" class="flex items-center gap-2">
              <h2 class="text-lg font-bold text-[#f0f2f5]">{{ convTitle(activeConv) }}</h2>
              <button
                @click="startEditContactName"
                class="text-[#96a4ad] hover:text-[#00a884] p-1"
                title="تعديل الاسم"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
              </button>
            </div>
            <div v-else class="flex items-center gap-2 w-full max-w-[260px]">
              <input
                v-model="contactNameDraft"
                type="text"
                class="flex-1 bg-[#25343d] border border-[#30424c] rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[#00a884]"
                @keydown.enter.prevent="saveContactName"
                @keydown.esc.prevent="editingContactName = false"
              />
              <button @click="saveContactName" :disabled="savingContactName" class="text-[#00a884] p-1 font-bold text-lg disabled:opacity-40">✓</button>
              <button @click="editingContactName = false" class="text-[#96a4ad] hover:text-white p-1">✕</button>
            </div>

            <p class="text-[#96a4ad] font-mono text-sm" dir="ltr">+{{ activeConv.contact_phone }}<template v-if="activeConv.contact_username && convTitle(activeConv) !== '@' + activeConv.contact_username"> · @{{ activeConv.contact_username }}</template></p>
            <span class="px-2.5 py-1 rounded-lg text-[11px] font-bold" :class="getDeviceBadgeClass(activeConv.session_id)">
              عبر: {{ activeConv.session?.device_name || ('ج' + activeConv.session_id) }}
            </span>
          </div>

          <!-- Media / links / docs -->
          <div class="p-4 border-b border-[#2c3c45]">
            <div class="flex items-center justify-between mb-3">
              <h4 class="text-xs font-bold text-[#96a4ad]">الوسائط والمستندات</h4>
              <span class="text-[10px] text-[#96a4ad]">{{ contactMedia.length }}</span>
            </div>
            <div v-if="loadingContactMedia" class="flex justify-center py-6">
              <span class="wx-spinner w-5 h-5"></span>
            </div>
            <div v-else-if="!contactMedia.length" class="text-center text-xs text-[#96a4ad] py-6">
              لا توجد وسائط مشتركة بعد
            </div>
            <div v-else class="grid grid-cols-3 gap-1.5">
              <template v-for="mm in contactMedia" :key="mm.id">
                <button
                  v-if="['image','sticker','video'].includes(mm.message_type) && mediaSrc(mm)"
                  @click="openLightbox(mm)"
                  class="aspect-square rounded-lg overflow-hidden bg-[#25343d] block relative"
                >
                  <video
                    v-if="mm.message_type === 'video'"
                    :src="mediaSrc(mm)"
                    preload="metadata"
                    muted
                    class="w-full h-full object-cover pointer-events-none"
                  ></video>
                  <img v-else :src="mediaSrc(mm)" class="w-full h-full object-cover" loading="lazy" alt="" />
                  <span v-if="mm.message_type === 'video'" class="absolute inset-0 flex items-center justify-center bg-black/30">
                    <svg class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                  </span>
                </button>
                <a
                  v-else
                  :href="mediaSrc(mm) || '#'"
                  target="_blank"
                  class="aspect-square rounded-lg bg-[#25343d] flex flex-col items-center justify-center gap-1 text-[#96a4ad] hover:text-[#00a884] transition-colors"
                >
                  <span class="text-xl">
                    {{ mm.message_type === 'video' ? '🎥' : (mm.message_type === 'document' ? '📄' : '🎵') }}
                  </span>
                  <span class="text-[9px] truncate w-full text-center px-1">{{ mm.media_meta?.fileName || mm.message_type }}</span>
                </a>
              </template>
            </div>
          </div>

          <!-- Group members — live roster for @g.us chats -->
          <div v-if="isGroupConv" class="p-4 border-b border-[#2c3c45]">
            <div class="flex items-center justify-between mb-3">
              <h4 class="text-xs font-bold text-[#96a4ad]">أعضاء الجروب</h4>
              <div class="flex items-center gap-2">
                <span v-if="groupMembers?.members" class="text-[10px] text-[#96a4ad]">{{ groupMembers.members.length }}</span>
                <button
                  v-if="groupMembers"
                  @click="loadGroupMembers(true)"
                  class="text-[10px] text-[#00a884] hover:underline"
                >تحديث</button>
              </div>
            </div>

            <div v-if="loadingMembers" class="flex justify-center py-6">
              <span class="wx-spinner w-5 h-5"></span>
            </div>
            <div v-else-if="groupMembers?.error" class="text-center text-xs text-[#f15c6d] py-4">
              {{ groupMembers.error }}
            </div>
            <template v-else-if="groupMembers?.members">
              <div class="max-h-72 overflow-y-auto space-y-0.5">
                <div
                  v-for="m in groupMembers.members"
                  :key="m.jid"
                  class="flex items-center gap-2.5 py-1.5"
                >
                  <div class="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-600 to-teal-500 text-white text-xs font-bold flex items-center justify-center shrink-0">
                    {{ memberLabel(m)[0] }}
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="text-xs text-[#dfe5e8] truncate">{{ m.name || '—' }}</div>
                    <div class="text-[10px] text-[#96a4ad] font-mono" dir="ltr">{{ m.phone ? '+' + m.phone : (m.lid ? 'LID ' + m.lid : m.jid) }}</div>
                  </div>
                  <span v-if="m.superadmin" class="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 font-bold shrink-0">المالك</span>
                  <span v-else-if="m.admin" class="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-bold shrink-0">مشرف</span>
                </div>
              </div>

              <!-- Past members (history sync, ~60 days) -->
              <template v-if="groupMembers.past?.length">
                <button
                  @click="showPastMembers = !showPastMembers"
                  class="w-full flex items-center justify-between mt-3 text-[11px] text-[#96a4ad] hover:text-[#dfe5e8] transition-colors"
                >
                  <span>الأعضاء السابقين ({{ groupMembers.past.length }})</span>
                  <span>{{ showPastMembers ? '▲' : '▼' }}</span>
                </button>
                <div v-if="showPastMembers" class="max-h-44 overflow-y-auto space-y-0.5 mt-1">
                  <div
                    v-for="(p, i) in groupMembers.past"
                    :key="'past-' + i"
                    class="flex items-center gap-2.5 py-1.5 opacity-70"
                  >
                    <div class="w-8 h-8 rounded-full bg-[#25343d] text-[#96a4ad] text-xs font-bold flex items-center justify-center shrink-0">
                      {{ memberLabel(p)[0] }}
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="text-xs text-[#96a4ad] truncate">{{ p.name || '—' }}</div>
                      <div class="text-[10px] text-[#96a4ad] font-mono" dir="ltr">{{ p.phone ? '+' + p.phone : (p.lid ? 'LID ' + p.lid : p.jid) }}</div>
                    </div>
                    <span class="text-[9px] px-1.5 py-0.5 rounded bg-[#f15c6d]/10 text-[#f15c6d] font-bold shrink-0">
                      {{ p.leave_reason === 1 ? 'أُزيل' : 'غادر' }}
                    </span>
                  </div>
                </div>
              </template>

              <div class="flex gap-2 mt-3">
                <button
                  @click="exportGroupCsv"
                  class="flex-1 px-3 py-1.5 rounded-lg bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/40 text-[11px] font-bold transition-colors"
                >تصدير Excel</button>
                <button
                  @click="exportGroupVcf"
                  class="flex-1 px-3 py-1.5 rounded-lg bg-sky-600/20 text-sky-300 hover:bg-sky-600/40 text-[11px] font-bold transition-colors"
                >تصدير جهات اتصال</button>
              </div>
            </template>
            <div v-else class="text-center py-3">
              <button @click="loadGroupMembers()" class="text-xs text-[#00a884] hover:underline">عرض الأعضاء</button>
            </div>
          </div>

          <!-- Details -->
          <div class="p-4 space-y-3">
            <div class="flex items-center justify-between text-xs">
              <span class="text-[#96a4ad]">معرّف واتساب</span>
              <span class="text-[#dfe5e8] font-mono" dir="ltr">{{ activeConv.contact_jid }}</span>
            </div>
            <div class="flex items-center justify-between text-xs">
              <span class="text-[#96a4ad]">آخر رسالة</span>
              <span class="text-[#dfe5e8]">{{ formatTime(activeConv.last_message_at) }}</span>
            </div>
            <div class="flex items-center justify-between text-xs">
              <span class="text-[#96a4ad]">مثبّتة</span>
              <span class="text-[#dfe5e8]">{{ activeConv.is_pinned ? 'نعم' : 'لا' }}</span>
            </div>
          </div>
        </div>
      </aside>
    </Transition>

    <CallPanel
      :state="callState"
      :peer="callPeer"
      :peer-name="callPeerName"
      :muted="callMuted"
      :error="callError"
      :video="callVideo"
      :cam-on="camOn"
      :get-remote-stream="() => callAudio.remoteStream"
      :get-local-stream="() => callAudio.camStream"
      @hangup="hangupCall"
      @answer="answerCall"
      @reject="rejectCall"
      @toggle-mute="toggleMute"
      @toggle-cam="toggleCam"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import crm from '@/services/crm';
import { getEcho, crmChannelName } from '@/services/realtime';
import { playIncomingMessage } from '@/services/notifySound';
import { callApi, callAudio, callTones } from '@/services/call';
import CallPanel from '@/components/crm/CallPanel.vue';

const route = useRoute();
const router = useRouter();

const user = ref(crm.getUser());
const isOwner = computed(() => user.value?.crm_role === 'owner');
const isAgent = computed(() => user.value?.crm_role === 'agent');
const isAtCapacity = computed(() =>
  isAgent.value && (user.value?.active_chats ?? 0) >= (user.value?.max_active_chats || 5)
);
const userInitial = computed(() => user.value?.name?.charAt(0)?.toUpperCase() || 'C');

// Refresh the stored profile (role/group/active-chat counter may change).
const refreshMe = () => crm.me().then(() => { user.value = crm.getUser(); }).catch(() => {});

const devices = ref([]);
const conversations = ref([]);
// One row per contact: twin rows for the same number (e.g. a PN/LID pair
// that hasn't merged yet, or a leftover from a deleted device) collapse to
// the newest — the list is ordered last_message_at desc.
const uniqueConversations = computed(() => {
  const seen = new Set();
  return conversations.value.filter((c) => {
    const digits = String(c.contact_phone || String(c.contact_jid || '').split('@')[0] || '').replace(/\D/g, '');
    const key = digits || c.contact_jid || c.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
});
const activeConv = ref(null);
const messages = ref([]);

// Group chats: jid ends with @g.us. Inside a group thread each incoming
// bubble carries the sender's number (m.from), tinted like WhatsApp.
const isGroupJid = (jid) => String(jid || '').endsWith('@g.us');
const isGroupConv = computed(() => isGroupJid(activeConv.value?.contact_jid));

// WhatsApp @username takes the place of the bare phone number wherever the
// chat would otherwise render "+20…" — real names still win.
const isPhonePlaceholder = (s) => /^\+?\d{5,}$/.test(String(s || '').trim());
const convTitle = (c) => {
  const name = String(c?.contact_name || '').trim();
  if (c?.contact_username && (!name || isPhonePlaceholder(name))) return '@' + c.contact_username;
  const phone = String(c?.contact_phone || '').trim();
  return name || (phone ? '+' + phone : '');
};
const convInitial = (c) => (convTitle(c) || 'U').replace(/^@/, '').charAt(0).toUpperCase();

// Message body rendering: split text into link/mention/plain parts so URLs
// become real anchors and @<digits> mentions render as readable handles.
// No v-html anywhere — zero injection surface.
const MSG_PART_RE = /@(\d{5,15})|(https?:\/\/[^\s<>"'`]+|www\.[^\s<>"'`]+)/g;
const phoneNameMap = computed(() => {
  const map = new Map();
  for (const c of conversations.value) {
    const title = convTitle(c);
    for (const src of [c.contact_phone, String(c.contact_jid || '').split('@')[0]]) {
      const digits = String(src || '').replace(/\D/g, '');
      if (digits.length >= 5 && !map.has(digits)) map.set(digits, title);
    }
  }
  return map;
});
const msgParts = (m) => {
  const text = String(m?.message || '');
  if (!text) return [];
  const parts = [];
  let last = 0;
  let match;
  MSG_PART_RE.lastIndex = 0;
  while ((match = MSG_PART_RE.exec(text)) !== null) {
    if (match.index > last) parts.push({ t: 'text', v: text.slice(last, match.index) });
    if (match[1] !== undefined) {
      // Backend-resolved mentionedJid list wins (LID→PN + contact names);
      // fall back to the conversations phone→name map, then raw digits.
      const hit = (m.mentions || []).find(
        (x) => String(x.jid || '').split('@')[0] === match[1],
      );
      const title = hit?.name || phoneNameMap.value.get(match[1]);
      const label = hit?.phone && !title ? '+' + hit.phone : (title && !title.startsWith('+') ? title : match[1]);
      parts.push({ t: 'mention', v: '@' + label.replace(/^@/, '') });
    } else {
      const raw = match[2];
      const url = raw.replace(/[.,!?;:)\]]+$/, '');
      const trail = raw.slice(url.length);
      parts.push({ t: 'link', v: url, href: /^https?:\/\//i.test(url) ? url : 'https://' + url });
      if (trail) parts.push({ t: 'text', v: trail });
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ t: 'text', v: text.slice(last) });
  return parts;
};
const senderPalette = ['#35cd96', '#ffa349', '#6bcbef', '#ff6e6e', '#e542a3', '#91ab01', '#d97cd0', '#b3c94b', '#53bdeb', '#ff9d00'];
const groupSenderColor = (from) => {
  let h = 0;
  for (const ch of String(from || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return senderPalette[h % senderPalette.length];
};
const groupSenderLabel = (m) => {
  // Resolved on the backend: saved contact name > pushname > phone.
  if (m.sender_name) return m.sender_name;
  const n = String(m.sender_phone || m.from || '').split('@')[0];
  return n ? '+' + n : 'مشارك';
};

// Authentic WhatsApp Web Audio Player State
const activeAudioId = ref(null);
const audioPlaying = ref(false);
const audioCurrentTime = ref(0);
const audioDurations = ref({});
let activeAudioEl = null;

const formatAudioSeconds = (sec) => {
  if (!sec || isNaN(sec)) return '0:00';
  const mins = Math.floor(sec / 60);
  const secs = Math.floor(sec % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

const getAudioDuration = (m) => {
  if (m.media?.seconds) return formatAudioSeconds(m.media.seconds);
  if (audioDurations.value[m.id]) return formatAudioSeconds(audioDurations.value[m.id]);
  return '0:00';
};

// One media element at a time — a video starting kills the voice note that
// was playing, and a voice note starting kills the video in the viewer.
const pauseActiveAudio = () => {
  if (activeAudioEl) activeAudioEl.pause();
  audioPlaying.value = false;
};

const togglePlayAudio = (m) => {
  const url = mediaSrc(m);
  if (!url) return;

  if (activeAudioId.value === m.id) {
    if (audioPlaying.value) {
      activeAudioEl?.pause();
      audioPlaying.value = false;
    } else {
      viewerVideoEl.value?.pause();
      activeAudioEl?.play();
      audioPlaying.value = true;
    }
    return;
  }

  viewerVideoEl.value?.pause();
  if (activeAudioEl) {
    activeAudioEl.pause();
    activeAudioEl = null;
  }

  activeAudioId.value = m.id;
  activeAudioEl = new Audio(url);
  audioPlaying.value = true;
  activeAudioEl.play().catch(() => {
    audioPlaying.value = false;
  });

  activeAudioEl.onloadedmetadata = () => {
    if (activeAudioEl?.duration) {
      audioDurations.value[m.id] = activeAudioEl.duration;
    }
  };

  activeAudioEl.ontimeupdate = () => {
    if (activeAudioId.value === m.id) {
      audioCurrentTime.value = activeAudioEl?.currentTime || 0;
    }
  };

  activeAudioEl.onended = () => {
    audioPlaying.value = false;
    audioCurrentTime.value = 0;
  };
};

const seekAudio = (m, event) => {
  if (!activeAudioEl || activeAudioId.value !== m.id) {
    togglePlayAudio(m);
    return;
  }
  const rect = event.currentTarget.getBoundingClientRect();
  const clickX = event.clientX - rect.left;
  const ratio = Math.max(0, Math.min(1, clickX / rect.width));
  if (activeAudioEl.duration) {
    activeAudioEl.currentTime = ratio * activeAudioEl.duration;
    audioCurrentTime.value = activeAudioEl.currentTime;
  }
};

const getWaveformBars = (msgId) => {
  const bars = [];
  let seed = 0;
  const str = String(msgId || '0');
  for (let i = 0; i < str.length; i++) seed = (seed * 31 + str.charCodeAt(i)) >>> 0;
  for (let i = 0; i < 28; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const h = 4 + (seed % 19);
    bars.push(h);
  }
  return bars;
};
const messageText = ref('');
const searchQuery = ref('');
// Agents land on the shared queue ("متاحة"); the owner lands on everything.
const selectedFilter = ref(isAgent.value ? 'available' : 'all');
const filterSessionId = ref(null);
const sendSessionId = ref(null);

const loadingConvs = ref(true);
const loadingMessages = ref(false);
const sending = ref(false);
const showListOnMobile = ref(true);

// Boot splash + WhatsApp-style windowed paging of the open thread
const initialLoading = ref(true);
const PAGE_SIZE = 20;
const hasMoreMessages = ref(false);
const loadingOlder = ref(false);
const hasNewerMessages = ref(false); // true while browsing a jumped mid-history window
const loadingNewer = ref(false);
const showDateJump = ref(false);
const jumpDate = ref('');
const todayStr = new Date().toISOString().slice(0, 10);
let olderScrollLock = 0;
let newerScrollLock = 0;

// Popups & Inputs
const showAttachMenu = ref(false);
const showEmojiMenu = ref(false);
const showNewChatModal = ref(false);
const creatingChat = ref(false);
const newChatPhone = ref('');
const newChatName = ref('');
const newChatSessionId = ref(null);
// WhatsApp-style media viewer: items = every image/video in the open chat,
// index = the visible one. Opens instantly on the loaded window, then the
// backend media endpoint back-fills the full filmstrip.
const viewer = ref({ items: [], index: -1 });
const viewerStripEl = ref(null);
const viewerVideoEl = ref(null);

// Reactions
const activeReactionMessageId = ref(null);
const popularEmojis = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const commonEmojis = ['😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😍', '😘', '😋', '😎', '👍', '👎', '❤️', '🔥', '👏', '🎉', '💯', '🙏', '🤝', '⭐', '✨', '☕'];

// Chat assignment / resolution (agent locking + customer rating)
const showResolveModal = ref(false);
const resolveRating = ref(0);
const resolveNote = ref('');
const resolving = ref(false);
const lockedByOther = computed(() => {
  const c = activeConv.value;
  if (!c?.assigned_agent_id) return false;
  if (isOwner.value) return false; // admins always keep write access
  if (isGroupJid(c.contact_jid)) return false; // groups are never locked
  return c.assigned_agent_id !== user.value?.id;
});
const assignedName = (c) => c?.assigned_agent?.name || (c?.assigned_agent_id === user.value?.id ? user.value?.name : 'موظف');
const lastSenderName = (c) => c?.last_outgoing_user?.name || (c?.last_outgoing_user_id === user.value?.id ? user.value?.name : 'موظف');
const transferredName = (c) => c?.transferred_by_agent?.name || 'موظف';

const chipClass = (f) => selectedFilter.value === f
  ? 'bg-[#00a884] text-[#18242b] font-bold'
  : 'bg-[#25343d] text-[#96a4ad] hover:text-[#dfe5e8]';

// ---- Agent-to-agent handoff ("تحويل") ------------------------------------
const showTransferModal = ref(false);
const transferAgents = ref([]);
const loadingTransferTargets = ref(false);
const transferring = ref(false);
const transferToast = ref(null);
let transferToastTimer = null;

// Owner may move any chat; an agent may only hand off a chat they hold.
const canTransfer = computed(() => {
  const c = activeConv.value;
  if (!c || lockedByOther.value) return false;
  if (isOwner.value) return true;
  return c.assigned_agent_id === user.value?.id;
});

// Owner reopens anything; an agent may reopen only what they closed.
const canReopen = computed(() => {
  const c = activeConv.value;
  return !!c?.resolved_at && (isOwner.value || c.resolved_by === user.value?.id);
});

// Colleagues eligible to receive — not me, not the current holder, active.
const transferTargets = computed(() =>
  transferAgents.value.filter(
    (a) => a.id !== user.value?.id
      && a.id !== activeConv.value?.assigned_agent_id
      && a.status !== 'inactive'
  )
);

const openTransferModal = async () => {
  showTransferModal.value = true;
  loadingTransferTargets.value = true;
  try {
    const res = await crm.getAgents();
    transferAgents.value = res.agents || [];
  } catch {
    transferAgents.value = [];
  } finally {
    loadingTransferTargets.value = false;
  }
};

const submitTransfer = async (agent) => {
  if (!activeConv.value || transferring.value) return;
  transferring.value = true;
  try {
    const res = await crm.transferConversation(activeConv.value.id, agent.id);
    if (res.success && res.conversation) {
      mergeConversation(res.conversation);
      showTransferModal.value = false;
      refreshMe();
      // Handed off — it left my queue, so close the thread for agents.
      if (!isOwner.value) {
        activeConv.value = null;
        backToList();
      } else {
        Object.assign(activeConv.value, res.conversation);
      }
    }
  } catch (err) {
    alert(err.response?.data?.message || 'فشل تحويل المحادثة');
  } finally {
    transferring.value = false;
  }
};

const submitReopen = async () => {
  if (!activeConv.value) return;
  try {
    const res = await crm.reopenConversation(activeConv.value.id);
    if (res.success && res.conversation) {
      mergeConversation(res.conversation);
      Object.assign(activeConv.value, res.conversation);
    }
  } catch (err) {
    alert(err.response?.data?.message || 'فشل إعادة فتح المحادثة');
  }
};

const openResolveModal = () => {
  resolveRating.value = activeConv.value?.rating || 0;
  resolveNote.value = '';
  showResolveModal.value = true;
};

const submitResolve = async () => {
  if (!activeConv.value || resolving.value) return;
  resolving.value = true;
  try {
    const res = await crm.resolveConversation(
      activeConv.value.id,
      resolveRating.value || null,
      resolveNote.value || null,
    );
    if (res.success && res.conversation) {
      mergeConversation(res.conversation);
      Object.assign(activeConv.value, res.conversation);
      refreshMe(); // freeing the slot lets the agent claim a new chat
    }
    showResolveModal.value = false;
  } catch (err) {
    alert(err.response?.data?.message || 'فشل إنهاء المحادثة');
  } finally {
    resolving.value = false;
  }
};

// Audio Recording
const isRecording = ref(false);
const recordingSeconds = ref(0);
let mediaRecorder = null;
let audioChunks = [];
let recordingTimer = null;

// Refs
const messagesContainer = ref(null);
const imageInput = ref(null);
const videoInput = ref(null);
const audioInput = ref(null);
const documentInput = ref(null);
let pollTimer = null;

// Realtime state
const realtimeConnected = ref(false);
const typingConvs = ref({}); // conversation_id -> true while contact is typing
const typingTimers = {};
let crmChannel = null;
let typingDebounce = null;
let lastTypingSentAt = 0;

const connectedDevices = computed(() => {
  return devices.value.filter((d) => d.status === 'connected');
});

// Color classes for device badges so each device is distinctly recognizable
const badgeColors = [
  'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
  'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30',
  'bg-amber-500/20 text-amber-400 border border-amber-500/30',
  'bg-purple-500/20 text-purple-400 border border-purple-500/30',
  'bg-sky-500/20 text-sky-400 border border-sky-500/30',
  'bg-rose-500/20 text-rose-400 border border-rose-500/30',
];

const getDeviceBadgeClass = (sessionId) => {
  if (!sessionId) return badgeColors[0];
  const idx = sessionId % badgeColors.length;
  return badgeColors[idx];
};

// Resolve a message's playable/displayable media URL. Live messages carry a
// ready media_url; history-synced media is decrypted lazily through the
// backend resolver (token passed as a query param since <img>/<audio> tags
// cannot send Authorization headers).
const mediaSrc = (m) => {
  if (!m) return null;
  if (m.media_url) return m.media_url;
  if (m.media_meta && m.media_meta.mediaKey) {
    return `/api/crm/media/${m.id}?token=${encodeURIComponent(crm.getToken() || '')}`;
  }
  return null;
};

// Documents sent before the type fix were stored as 'audio' with a non-audio mime
const isDocMessage = (m) =>
  m.message_type === 'document' ||
  (m.message_type === 'audio' && m.media_mime_type && !m.media_mime_type.startsWith('audio/'));

const DOC_COLORS = {
  pdf: '#e53935', doc: '#2196f3', docx: '#2196f3', txt: '#607d8b',
  xls: '#43a047', xlsx: '#43a047', csv: '#43a047',
  ppt: '#fb8c00', pptx: '#fb8c00',
  zip: '#8e24aa', rar: '#8e24aa', '7z': '#8e24aa',
};

const MIME_EXT = {
  'application/pdf': 'PDF',
  'application/msword': 'DOC',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/vnd.ms-excel': 'XLS',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
  'application/zip': 'ZIP',
  'text/plain': 'TXT',
  'text/csv': 'CSV',
};

const isPlaceholderText = (m) =>
  ['image', 'video', 'audio', 'voice', 'document'].includes(m.message_type) &&
  /^\[.+\]$/.test((m.message || '').trim());

const formatBytes = (bytes) => {
  const n = Number(bytes);
  if (!n || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} kB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

const docInfo = (m) => {
  let fileName = m.media_meta?.fileName;
  if (!fileName && m.media_url) {
    try { fileName = decodeURIComponent(m.media_url.split('/').pop().split('?')[0]); } catch (e) {}
  }
  if (!fileName || fileName === m.message) fileName = 'مستند';
  const extFromName = fileName.includes('.') ? fileName.split('.').pop().toUpperCase() : '';
  const ext = extFromName || MIME_EXT[m.media_mime_type] || 'FILE';
  const size = m.media_size ? formatBytes(m.media_size) : '';
  return {
    fileName,
    ext,
    color: DOC_COLORS[ext.toLowerCase()] || '#00a884',
    sub: size ? `${ext} • ${size}` : ext,
  };
};

// Expired WhatsApp CDN avatar URLs must not flicker: remember broken URLs so
// the merge can keep writing the DB value without the <img> retry loop.
const brokenAvatars = new Set();
const avatarSrc = (c) => {
  const url = c?.contact_avatar;
  if (!url || brokenAvatars.has(url)) return null;
  // Locally-stored avatars ride the token-query auth like /crm/media.
  if (url.startsWith('/api/crm/')) {
    return url + (url.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(crm.getToken() || '');
  }
  return url;
};
const markAvatarBroken = (url) => {
  if (url) brokenAvatars.add(url);
};

const loadDevices = async () => {
  try {
    const res = await crm.getDevices();
    if (res.success) {
      devices.value = res.devices || [];
      if (!sendSessionId.value && connectedDevices.value.length > 0) {
        sendSessionId.value = connectedDevices.value[0].id;
        newChatSessionId.value = connectedDevices.value[0].id;
      }
    }
  } catch {}
};

// In-place merge helpers — the poll replaces nothing wholesale. Only fields
// that actually changed are written, so untouched rows never re-render and
// the list never flickers.
const sameVal = (a, b) => {
  if (a === b) return true;
  if (a == null || b == null || typeof a !== 'object' || typeof b !== 'object')
    return a === b;
  return JSON.stringify(a) === JSON.stringify(b);
};

const patchRow = (target, source) => {
  let changed = false;
  for (const k of Object.keys(source)) {
    if (!sameVal(target[k], source[k])) {
      target[k] = source[k];
      changed = true;
    }
  }
  return changed;
};

const mergeConversations = (list) => {
  const byId = new Map(conversations.value.map((c) => [c.id, c]));
  const merged = list.map((c) => {
    const ex = byId.get(c.id);
    if (!ex) return c;
    patchRow(ex, c);
    return ex;
  });
  const kept = new Set(list.map((c) => c.id));
  const membershipChanged =
    merged.length !== conversations.value.length ||
    conversations.value.some((c) => !kept.has(c.id));
  const orderChanged = merged.some((c, i) => conversations.value[i] !== c);
  if (membershipChanged || orderChanged) conversations.value = merged;
};

// Append a server row unless an identical one (same row id or WhatsApp
// message_id) is already rendered. Realtime echoes can beat the HTTP
// response that produced the row, and the poll can race both — every
// append path must go through this.
const appendMessageDedup = (m) => {
  const exists = messages.value.some(
    (x) => x.id === m.id || (m.message_id && x.message_id === m.message_id)
  );
  if (!exists) messages.value.push(m);
  return !exists;
};

const mergeMessagesWindow = (incoming) => {
  const byId = new Map(messages.value.map((m) => [m.id, m]));
  let changed = false;
  const merged = incoming.map((m) => {
    const ex = byId.get(m.id);
    if (!ex) {
      changed = true;
      return m;
    }
    if (patchRow(ex, m)) changed = true;
    return ex;
  });
  // Keep optimistic temp rows only while the server hasn't persisted them.
  const incomingExt = new Set(incoming.map((m) => m.message_id).filter(Boolean));
  const temps = messages.value.filter(
    (m) => typeof m.id !== 'number' && !incomingExt.has(m.message_id),
  );
  const incomingIds = new Set(incoming.map((m) => m.id));
  const dropped = messages.value.filter(
    (m) => typeof m.id === 'number' && !incomingIds.has(m.id),
  );
  if (dropped.length) changed = true;
  if (!changed && merged.length === messages.value.length && merged.every((m, i) => messages.value[i] === m) && !temps.length)
    return false;
  messages.value = [...merged, ...temps];
  return true;
};

// WhatsApp history-sync progress — populated by polling /crm/sync-status.
const syncingDevices = ref([]);
const activeSyncCount = ref(0);
const checkSyncStatus = async () => {
  try {
    const res = await crm.getSyncStatus();
    const nowSyncing = (res?.devices || []).filter((d) => d.syncing);
    // Sync just finished → pull the freshly imported conversations once.
    if (activeSyncCount.value && !nowSyncing.length) loadConversations();
    activeSyncCount.value = nowSyncing.length;
    // Show the banner only while the first 100 chats are being pulled; the
    // long tail keeps importing silently in the background.
    syncingDevices.value = nowSyncing.filter((d) => (d.synced_conversations || 0) < 100);
  } catch {}
};

const loadConversations = async () => {
  try {
    const params = {};
    if (selectedFilter.value === 'unread') params.unread_only = 1;
    else if (['available', 'mine', 'resolved'].includes(selectedFilter.value)) {
      params.scope = selectedFilter.value;
    }
    if (filterSessionId.value) params.session_id = filterSessionId.value;
    if (searchQuery.value.trim()) params.search = searchQuery.value.trim();

    const res = await crm.getConversations(params);
    if (res.success) {
      mergeConversations(res.conversations || []);
      // If active conversation exists, update its local copy
      if (activeConv.value) {
        const found = conversations.value.find((c) => c.id === activeConv.value.id);
        if (found) patchRow(activeConv.value, found);
      }
    }
  } catch {} finally {
    loadingConvs.value = false;
  }
};

// Stale-response guard: every full load bumps this; any in-flight fetch that
// resolves afterwards (slower conv A racing a click to conv B) is dropped
// instead of painting another chat's messages into the open one.
let msgLoadSeq = 0;

const selectConversation = async (conv) => {
  msgLoadSeq++;
  activeConv.value = conv;
  showListOnMobile.value = false;
  selectMode.value = false;
  selectedIds.value = [];
  messages.value = [];
  hasMoreMessages.value = false;
  hasNewerMessages.value = false;
  loadingOlder.value = false;
  loadingNewer.value = false;
  showDateJump.value = false;
  jumpDate.value = '';
  replyTarget.value = null;
  showContactInfo.value = false;
  ctxMenu.value.show = false;
  showScrollDown.value = false;
  sendSessionId.value = conv.session_id;
  // Keep the open chat in the URL so a page refresh restores it.
  if (String(route.query.id) !== String(conv.id)) {
    router.replace({ query: { ...route.query, id: conv.id } });
  }
  await loadMessages(conv.id);
  // Agents pick the chat up the moment they open it — the atomic backend
  // claim decides who wins the race; everyone else's list updates via push.
  // Group chats are shared workspaces — never claimed or locked.
  if (isAgent.value && !conv.assigned_agent_id && !conv.resolved_at && !isGroupJid(conv.contact_jid)) {
    claimConversationForAgent(conv.id);
  }
};

// Claim on open. A 423 means a colleague won the race — the patched row
// flips the thread into its locked read-only state by itself.
const claimConversationForAgent = async (convId) => {
  try {
    const res = await crm.claimConversation(convId);
    if (res.success && res.conversation) {
      mergeConversation(res.conversation);
      if (activeConv.value?.id === convId) Object.assign(activeConv.value, res.conversation);
      refreshMe();
    }
  } catch (err) {
    const d = err.response?.data;
    if (d?.conversation) {
      mergeConversation(d.conversation);
      if (activeConv.value?.id === convId) Object.assign(activeConv.value, d.conversation);
    }
    if (d?.code === 'MAX_ACTIVE_CHATS') alert(d.message);
  }
};

const backToList = () => {
  showListOnMobile.value = true;
  if (route.query.id) {
    const q = { ...route.query };
    delete q.id;
    router.replace({ query: q });
  }
};

// ---- Right-click context menu / reply / forward / contact info ----
const ctxMenu = ref({ show: false, x: 0, y: 0, msg: null });
const replyTarget = ref(null);
const showForwardModal = ref(false);
const forwardMsg = ref(null);
const forwardSearch = ref('');
const forwardSelected = ref([]);
const forwarding = ref(false);
const showContactInfo = ref(false);
const contactMedia = ref([]);
const loadingContactMedia = ref(false);
const editingContactName = ref(false);
const contactNameDraft = ref('');
const savingContactName = ref(false);

const selectMode = ref(false);
const selectedIds = ref([]);

const enterSelectMode = (m) => {
  selectMode.value = true;
  selectedIds.value = m ? [m.id] : [];
  ctxMenu.value.show = false;
};

const toggleSelect = (m) => {
  const i = selectedIds.value.indexOf(m.id);
  if (i === -1) selectedIds.value.push(m.id);
  else selectedIds.value.splice(i, 1);
  if (!selectedIds.value.length) selectMode.value = false;
};

const exitSelectMode = () => {
  selectMode.value = false;
  selectedIds.value = [];
};

const selectedMessages = computed(() =>
  messages.value.filter((m) => selectedIds.value.includes(m.id))
);

const ctxMenuEl = ref(null);
const openContextMenu = (m, e) => {
  if (selectMode.value) {
    toggleSelect(m);
    return;
  }
  activeReactionMessageId.value = null;
  const menuW = 190;
  // Rough estimate to pre-place the menu; the real height is measured after
  // render below — items vary per message (copy / delete-for-all are
  // conditional), so a fixed guess slides the menu under the viewport edge.
  const menuH = 340;
  const x = Math.min(Math.max(8, e.clientX - menuW / 2), window.innerWidth - menuW - 8);
  const y = Math.min(Math.max(8, e.clientY), window.innerHeight - menuH - 8);
  ctxMenu.value = { show: true, x, y, msg: m };
  nextTick(() => {
    const el = ctxMenuEl.value;
    if (!el || !ctxMenu.value.show) return;
    const h = el.offsetHeight;
    ctxMenu.value.y = Math.max(8, Math.min(ctxMenu.value.y, window.innerHeight - h - 8));
  });
};

const setReplyTarget = (m) => {
  replyTarget.value = m;
  ctxMenu.value.show = false;
};

const quotedPreview = (replyToId) => {
  return messages.value.find(
    (x) => x.message_id === replyToId || String(x.id) === String(replyToId),
  ) || null;
};

const highlightMessageEl = (m) => {
  const el = document.getElementById('msg-' + (m.message_id || m.id));
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const bubble = el.firstElementChild;
  bubble?.classList.add('ring-2', 'ring-[#00a884]');
  setTimeout(() => bubble?.classList.remove('ring-2', 'ring-[#00a884]'), 1600);
};

const scrollToMessage = async (replyToId) => {
  // Fast path: the quoted row is already in the loaded window.
  const m = quotedPreview(replyToId);
  if (m) {
    highlightMessageEl(m);
    return;
  }
  // Otherwise pull a window centered on it — same mechanic as the date jump.
  const conv = activeConv.value;
  if (!conv) return;
  const seq = ++msgLoadSeq;
  loadingMessages.value = true;
  try {
    const res = await crm.getMessages(conv.id, { around_id: replyToId, limit: PAGE_SIZE * 2 });
    if (seq !== msgLoadSeq || activeConv.value?.id !== conv.id) return;
    if (res.success && res.messages?.length) {
      messages.value = res.messages;
      hasMoreMessages.value = !!res.has_more;
      hasNewerMessages.value = !!res.has_newer;
      const target = quotedPreview(replyToId);
      if (target) nextTick(() => highlightMessageEl(target));
    }
  } catch {} finally {
    loadingMessages.value = false;
  }
};

const copyMessageText = async (m) => {
  try { await navigator.clipboard.writeText(m.message || ''); } catch {}
  ctxMenu.value.show = false;
};

const deleteMsg = async (m, forEveryone) => {
  ctxMenu.value.show = false;
  if (!m) return;
  const question = forEveryone
    ? 'حذف الرسالة عند الجميع؟ هتتمسح من واتساب عند الطرف التاني.'
    : 'حذف الرسالة عندك بس؟';
  if (!window.confirm(question)) return;
  try {
    const res = await crm.deleteMessage({
      message_id: m.message_id || m.id,
      conversation_id: activeConv.value.id,
      for_everyone: forEveryone,
    });
    if (res && res.success === false) {
      alert(res.message || 'فشل حذف الرسالة');
      return;
    }
    if (forEveryone) {
      const target = messages.value.find((x) => x.id === m.id);
      if (target) target.revoked_at = new Date().toISOString();
    } else {
      messages.value = messages.value.filter((x) => x.id !== m.id);
    }
  } catch (err) {
    alert(err.response?.data?.message || 'فشل حذف الرسالة');
  }
};

const forwardTargets = computed(() => {
  const q = forwardSearch.value.trim().toLowerCase();
  const list = conversations.value || [];
  if (!q) return list;
  return list.filter((c) =>
    (c.contact_name || '').toLowerCase().includes(q) ||
    (c.contact_username || '').toLowerCase().includes(q) ||
    String(c.contact_phone || '').includes(q),
  );
});

const forwardIds = ref([]);

const openForwardModal = (m) => {
  forwardMsg.value = m;
  forwardIds.value = [m.id];
  forwardSearch.value = '';
  forwardSelected.value = [];
  showForwardModal.value = true;
  ctxMenu.value.show = false;
};

const forwardSelectedMsgs = () => {
  const sel = selectedMessages.value;
  if (!sel.length) return;
  forwardMsg.value = sel.length === 1 ? sel[0] : null;
  forwardIds.value = sel.map((m) => m.id);
  forwardSearch.value = '';
  forwardSelected.value = [];
  showForwardModal.value = true;
  exitSelectMode();
};

// Native share — Web Share API with file support, text/links fallback.
const shareSelected = async () => {
  const sel = selectedMessages.value;
  if (!sel.length) return;
  const texts = sel.filter((m) => m.message && !isPlaceholderText(m)).map((m) => m.message);
  const absUrl = (m) => new URL(mediaSrc(m), location.origin).href;

  try {
    // Try sharing the first media file as a real attachment (WhatsApp-style).
    const mediaMsg = sel.find((m) => mediaSrc(m));
    if (mediaMsg && navigator.canShare) {
      try {
        const resp = await fetch(mediaSrc(mediaMsg));
        const blob = await resp.blob();
        const name = mediaMsg.media_meta?.fileName ||
          `file.${(mediaMsg.media_mime_type || 'application/octet-stream').split('/')[1] || 'bin'}`;
        const file = new File([blob], name, { type: mediaMsg.media_mime_type || blob.type });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], text: texts.join('\n') || undefined });
          exitSelectMode();
          return;
        }
      } catch (e) {
        if (e.name === 'AbortError') return; // user cancelled
      }
    }

    const mediaLinks = sel.filter((m) => mediaSrc(m)).map(absUrl);
    const shareText = [...texts, ...mediaLinks].join('\n\n');
    if (navigator.share) {
      await navigator.share({ text: shareText || ' ' });
    } else {
      await navigator.clipboard.writeText(shareText);
      alert('اتنسخت — الصقها في أي تطبيق');
    }
  } catch (e) {
    if (e.name !== 'AbortError') console.error('share failed', e);
  } finally {
    exitSelectMode();
  }
};

const deleteSelectedMsgs = async () => {
  const sel = selectedMessages.value;
  if (!sel.length || !window.confirm(`حذف ${sel.length} رسالة عندك؟`)) return;
  const ids = selectedIds.value.slice();
  exitSelectMode();
  for (const m of sel) {
    try {
      await crm.deleteMessage({
        message_id: m.message_id || m.id,
        conversation_id: activeConv.value.id,
        for_everyone: false,
      });
    } catch {}
  }
  messages.value = messages.value.filter((x) => !ids.includes(x.id));
};

const toggleForwardTarget = (id) => {
  const i = forwardSelected.value.indexOf(id);
  if (i === -1) forwardSelected.value.push(id);
  else forwardSelected.value.splice(i, 1);
};

const doForward = async () => {
  if (!forwardIds.value.length || !forwardSelected.value.length || forwarding.value) return;
  forwarding.value = true;
  try {
    const res = await crm.forwardMessage({
      message_ids: forwardIds.value,
      target_conversation_ids: forwardSelected.value,
    });
    const failed = (res.results || []).filter((r) => !r.success);
    if (failed.length) {
      // One reason per failed target conversation — the API returns the
      // per-target error (locked chat, device offline, not on WhatsApp…).
      const byConv = new Map();
      for (const f of failed) {
        if (!byConv.has(f.conversation_id)) byConv.set(f.conversation_id, f.error || 'خطأ غير معروف');
      }
      const lines = [...byConv.entries()].map(([cid, err]) => {
        const conv = conversations.value.find((c) => c.id === cid);
        return `• ${conv ? convTitle(conv) : cid}: ${err}`;
      });
      alert('فشل التحويل إلى:\n' + lines.join('\n'));
    }
    showForwardModal.value = false;
    await loadConversations();
    // If the active chat was a target, refresh its window
    if (activeConv.value && forwardSelected.value.includes(activeConv.value.id)) {
      await loadMessages(activeConv.value.id);
    }
  } catch (err) {
    alert(err.response?.data?.message || 'فشل التحويل');
  } finally {
    forwarding.value = false;
  }
};

const openContactInfo = async () => {
  if (!activeConv.value) return;
  showContactInfo.value = true;
  editingContactName.value = false;
  loadingContactMedia.value = true;
  contactMedia.value = [];
  loadGroupMembers();
  try {
    const res = await crm.getConversationMedia(activeConv.value.id);
    if (res.success) contactMedia.value = res.media || [];
  } catch {} finally {
    loadingContactMedia.value = false;
  }
};

// ---- Group roster (group-info panel) -----------------------------------
const groupMembers = ref(null);
const loadingMembers = ref(false);
const showPastMembers = ref(false);

const loadGroupMembers = async (force = false) => {
  if (!isGroupConv.value || !activeConv.value) { groupMembers.value = null; return; }
  if (groupMembers.value && !force) return;
  loadingMembers.value = true;
  try {
    const res = await crm.getGroupMembers(activeConv.value.id);
    groupMembers.value = res?.success ? res : { error: res?.message || 'تعذر جلب الأعضاء' };
  } catch (e) {
    groupMembers.value = { error: e.response?.data?.message || 'تعذر جلب الأعضاء' };
  } finally {
    loadingMembers.value = false;
  }
};

const memberLabel = (m) => m.name || (m.phone ? '+' + m.phone : (m.lid ? 'ID ' + m.lid : m.jid));

const downloadBlob = (blob, name) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
};

const exportGroupCsv = () => {
  const rows = [['الاسم', 'الرقم', 'الدور', 'الحالة']];
  for (const m of groupMembers.value?.members || []) {
    rows.push([
      m.name || '',
      m.phone ? '+' + m.phone : (m.lid ? 'LID ' + m.lid : m.jid),
      m.superadmin ? 'مالك' : (m.admin ? 'مشرف' : 'عضو'),
      'حالي',
    ]);
  }
  for (const p of groupMembers.value?.past || []) {
    rows.push([
      p.name || '',
      p.phone ? '+' + p.phone : (p.lid ? 'LID ' + p.lid : p.jid),
      '',
      p.leave_reason === 1 ? 'أُزيل' : 'غادر',
    ]);
  }
  const csv = '\uFEFF' + rows
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\r\n');
  downloadBlob(
    new Blob([csv], { type: 'text/csv;charset=utf-8' }),
    `group-${activeConv.value.id}-members.csv`,
  );
};

const exportGroupVcf = () => {
  const cards = [];
  const add = (m, suffix) => {
    if (!m.phone) return; // vcf needs a dialable number — LID-only members skip
    const tel = `+${m.phone}`;
    cards.push([
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${(m.name || tel) + suffix}`,
      `TEL;TYPE=CELL:${tel}`,
      'END:VCARD',
    ].join('\r\n'));
  };
  (groupMembers.value?.members || []).forEach((m) => add(m, ''));
  (groupMembers.value?.past || []).forEach((p) => add(p, ' (سابق)'));
  if (!cards.length) { alert('مفيش أرقام قابلة للتصدير — الأعضاء بـ LID بس'); return; }
  downloadBlob(
    new Blob([cards.join('\r\n')], { type: 'text/vcard;charset=utf-8' }),
    `group-${activeConv.value.id}-members.vcf`,
  );
};

const startEditContactName = () => {
  contactNameDraft.value = activeConv.value?.contact_name || '';
  editingContactName.value = true;
};

const saveContactName = async () => {
  const name = contactNameDraft.value.trim();
  if (!name || !activeConv.value || savingContactName.value) return;
  savingContactName.value = true;
  try {
    const res = await crm.renameConversation(activeConv.value.id, name);
    if (res.success) {
      activeConv.value.contact_name = name;
      const row = conversations.value.find((c) => c.id === activeConv.value.id);
      if (row) row.contact_name = name;
      editingContactName.value = false;
    }
  } catch (err) {
    alert(err.response?.data?.message || 'فشل حفظ الاسم');
  } finally {
    savingContactName.value = false;
  }
};

const closeTopLayer = () => {
  if (viewerIndex.value >= 0) { closeViewer(); return true; }
  if (ctxMenu.value.show) { ctxMenu.value.show = false; return true; }
  if (activeReactionMessageId.value) { activeReactionMessageId.value = null; return true; }
  if (showForwardModal.value) { showForwardModal.value = false; return true; }
  if (showAttachMenu.value) { showAttachMenu.value = false; return true; }
  if (showEmojiMenu.value) { showEmojiMenu.value = false; return true; }
  if (showDateJump.value) { showDateJump.value = false; return true; }
  if (showContactInfo.value) { showContactInfo.value = false; return true; }
  if (replyTarget.value) { replyTarget.value = null; return true; }
  return false;
};

const onGlobalKeydown = (e) => {
  // Media viewer open → arrows flip through the filmstrip, Esc closes.
  if (viewerIndex.value >= 0) {
    if (e.key === 'ArrowLeft') { viewerPrev(); return; }
    if (e.key === 'ArrowRight') { viewerNext(); return; }
    if (e.key !== 'Escape') return;
  } else if (e.key !== 'Escape') {
    return;
  }
  if (e.key !== 'Escape') return;
  if (closeTopLayer()) return;
  // Nothing layered — Esc leaves the open chat, like WhatsApp Web's panel collapse.
  if (activeConv.value) {
    activeConv.value = null;
    messages.value = [];
    showListOnMobile.value = true;
    if (route.query.id) {
      const q = { ...route.query };
      delete q.id;
      router.replace({ query: q });
    }
  }
};

const loadMessages = async (convId) => {
  const seq = ++msgLoadSeq;
  loadingMessages.value = true;
  try {
    const res = await crm.getMessages(convId, { limit: PAGE_SIZE });
    if (seq !== msgLoadSeq || activeConv.value?.id !== convId) return;
    if (res.success) {
      messages.value = res.messages || [];
      hasMoreMessages.value = !!res.has_more;
      hasNewerMessages.value = !!res.has_newer;
      if (activeConv.value) {
        activeConv.value.unread_count = 0;
      }
      scrollToBottom();
    }
  } catch {} finally {
    loadingMessages.value = false;
  }
};

// Fetch the next older page when the user scrolls to the top — keeps the
// scroll anchored on the same bubble like WhatsApp does.
const loadOlderMessages = async () => {
  const conv = activeConv.value;
  const seq = msgLoadSeq;
  const oldest = messages.value.find((m) => typeof m.id === 'number');
  if (!conv || !oldest || loadingOlder.value) return;

  loadingOlder.value = true;
  const el = messagesContainer.value;
  const prevHeight = el ? el.scrollHeight : 0;
  const prevTop = el ? el.scrollTop : 0;

  try {
    const res = await crm.getMessages(conv.id, { before_id: oldest.id, limit: PAGE_SIZE });
    if (seq !== msgLoadSeq || activeConv.value?.id !== conv.id) return;
    if (res.success) {
      hasMoreMessages.value = !!res.has_more;
      const existing = new Set(messages.value.map((m) => m.id));
      const older = (res.messages || []).filter((m) => !existing.has(m.id));
      if (older.length) {
        messages.value = [...older, ...messages.value];
        nextTick(() => {
          if (el) el.scrollTop = el.scrollHeight - prevHeight + prevTop;
        });
      }
    }
  } catch {} finally {
    loadingOlder.value = false;
  }
};

// Forward paging — only reachable after a date jump left us mid-history.
const loadNewerMessages = async () => {
  const conv = activeConv.value;
  const seq = msgLoadSeq;
  const newest = [...messages.value].reverse().find((m) => typeof m.id === 'number');
  if (!conv || !newest || loadingNewer.value) return;

  loadingNewer.value = true;
  try {
    const res = await crm.getMessages(conv.id, { after_id: newest.id, limit: PAGE_SIZE });
    if (seq !== msgLoadSeq || activeConv.value?.id !== conv.id) return;
    if (res.success) {
      hasNewerMessages.value = !!res.has_newer;
      const existing = new Set(messages.value.map((m) => m.id));
      const newer = (res.messages || []).filter((m) => !existing.has(m.id));
      if (newer.length) messages.value.push(...newer);
    }
  } catch {} finally {
    loadingNewer.value = false;
  }
};

// WhatsApp "search by date": land on the first message of the picked day.
const jumpToDate = async () => {
  const conv = activeConv.value;
  if (!conv || !jumpDate.value) return;
  const seq = ++msgLoadSeq;
  showDateJump.value = false;
  loadingMessages.value = true;
  messages.value = [];
  try {
    const res = await crm.getMessages(conv.id, { date: jumpDate.value, limit: PAGE_SIZE });
    if (seq !== msgLoadSeq || activeConv.value?.id !== conv.id) return;
    if (res.success) {
      messages.value = res.messages || [];
      hasMoreMessages.value = !!res.has_more;
      hasNewerMessages.value = !!res.has_newer;
      // The window starts at the target day — pin it to the top like WhatsApp.
      nextTick(() => {
        if (messagesContainer.value) messagesContainer.value.scrollTop = 0;
      });
    }
  } catch {} finally {
    loadingMessages.value = false;
  }
};

const onMessagesScroll = () => {
  const el = messagesContainer.value;
  if (!el || loadingMessages.value) return;
  // WhatsApp's floating down-arrow: appears once you're a few screens up.
  showScrollDown.value = el.scrollHeight - el.scrollTop - el.clientHeight > 400;
  if (hasMoreMessages.value && !loadingOlder.value
      && el.scrollTop <= 60 && Date.now() - olderScrollLock > 800) {
    olderScrollLock = Date.now();
    loadOlderMessages();
  }
  if (hasNewerMessages.value && !loadingNewer.value
      && el.scrollHeight - el.scrollTop - el.clientHeight <= 60
      && Date.now() - newerScrollLock > 800) {
    newerScrollLock = Date.now();
    loadNewerMessages();
  }
};

// Day separators between message groups (اليوم / أمس / التاريخ)
const dayKey = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};
const isNewDay = (i) => {
  if (i === 0) return true;
  const cur = messages.value[i];
  const prev = messages.value[i - 1];
  return dayKey(cur.timestamp || cur.created_at) !== dayKey(prev.timestamp || prev.created_at);
};
const dayLabel = (t) => {
  try {
    const d = new Date(t);
    const today = new Date();
    const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((startOf(today) - startOf(d)) / 86400000);
    if (diff === 0) return 'اليوم';
    if (diff === 1) return 'أمس';
    return d.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return '';
  }
};

const isNearBottom = () => {
  const el = messagesContainer.value;
  if (!el) return true;
  return el.scrollHeight - el.scrollTop - el.clientHeight < 150;
};

const scrollToBottom = (smooth = false) => {
  nextTick(() => {
    const el = messagesContainer.value;
    if (!el) return;
    if (smooth) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    else el.scrollTop = el.scrollHeight;
    showScrollDown.value = false;
  });
};

// Down-arrow button: mid-history jump reloads the live window, otherwise a
// smooth glide to the newest message — same as WhatsApp.
const showScrollDown = ref(false);
const scrollDownCount = computed(() => activeConv.value?.unread_count || 0);
const onScrollDownClick = () => {
  if (hasNewerMessages.value && activeConv.value) {
    loadMessages(activeConv.value.id);
  } else {
    scrollToBottom(true);
  }
};

const setFilter = (type) => {
  selectedFilter.value = type;
  loadConversations();
};

let searchTimeout = null;
const debouncedSearch = () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(loadConversations, 300);
};

// Send Text Message — optimistic: render immediately, confirm when the API responds.
// FIFO outbox: Enter enqueues immediately (the input clears at once) and a
// single drainer sends queued messages one-by-one in order, so a slow send
// never blocks the next one. Items keep their conversation/session captured
// at enqueue time, so the order holds even if the agent switches chats.
const sendQueue = ref([]);

const sendTextMessage = () => {
  const text = messageText.value.trim();
  if (!text || !activeConv.value) return;

  const replyToId = replyTarget.value?.message_id || null;
  const conversationId = activeConv.value.id;
  const sessionId = sendSessionId.value;
  messageText.value = '';
  replyTarget.value = null;

  // Fat-finger guard: an identical text+reply enqueued <1.5s ago is a
  // duplicate (double Enter / double click), not an intentional resend.
  const dupe = sendQueue.value.some(
    (it) => it.text === text && it.replyToId === replyToId
      && it.conversationId === conversationId
      && Date.now() - it.enqueuedAt < 1500
  );
  if (dupe) return;

  const tempId = 'tmp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  // Mentions picked from the @ dropdown whose "@digits" token survived in
  // the final text — the engine lists their JIDs in contextInfo.
  const mentionJids = Object.entries(pendingMentions.value)
    .filter(([digits]) => text.includes('@' + digits))
    .map(([, jid]) => jid);
  sendQueue.value.push({
    tempId, text, replyToId, conversationId, sessionId,
    mentions: mentionJids.length ? mentionJids : undefined,
    enqueuedAt: Date.now(), done: false,
  });
  pendingMentions.value = {};
  mentionMenu.value.show = false;
  messages.value.push({
    id: tempId,
    direction: 'outgoing',
    message: text,
    message_type: 'text',
    status: 'sending',
    reply_to_id: replyToId,
    timestamp: new Date().toISOString(),
  });
  scrollToBottom();
  void drainSendQueue();
};

const drainSendQueue = async () => {
  if (sending.value) return; // a drainer is already working through the queue
  sending.value = true;
  try {
    for (;;) {
      const item = sendQueue.value.find((it) => !it.done);
      if (!item) {
        sendQueue.value = [];
        break;
      }
      item.done = true;
      try {
        const res = await crm.sendMessage({
          conversation_id: item.conversationId,
          session_id: item.sessionId,
          message: item.text,
          reply_to_id: item.replyToId || undefined,
          mentions: item.mentions,
        });
        const idx = messages.value.findIndex((m) => m.id === item.tempId);
        if (res.success && res.message) {
          // Temp bubble is only patched while its conversation is on screen;
          // a reloaded list already contains the real row from the server.
          if (idx !== -1) {
            messages.value.splice(idx, 1, res.message);
          } else if (activeConv.value?.id === item.conversationId) {
            appendMessageDedup(res.message);
          }
          // The realtime echo may already have appended the same row —
          // collapse any duplicate of it down to one.
          const rid = res.message.id;
          const rext = res.message.message_id;
          let seen = false;
          messages.value = messages.value.filter((x) => {
            if (!(x.id === rid || (rext && x.message_id === rext))) return true;
            if (seen) return false;
            seen = true;
            return true;
          });
          scrollToBottom();
          if (activeConv.value?.id === item.conversationId) {
            activeConv.value.last_message = item.text;
            activeConv.value.last_message_direction = 'outgoing';
            activeConv.value.last_message_status = res.message.status || 'sent';
            activeConv.value.last_message_at = new Date().toISOString();
            // First reply claims the chat — reflect the lock instantly; the
            // conversation.update broadcast confirms it for other agents.
            if (!activeConv.value.assigned_agent_id && user.value && !isOwner.value) {
              activeConv.value.assigned_agent_id = user.value.id;
              activeConv.value.assigned_agent = { id: user.value.id, name: user.value.name };
            }
          } else {
            await loadConversations();
          }
        } else if (idx !== -1) {
          messages.value[idx].status = 'failed';
        }
      } catch (err) {
        // One dead message must not stall the rest of the queue.
        const idx = messages.value.findIndex((m) => m.id === item.tempId);
        if (idx !== -1) messages.value[idx].status = 'failed';
        alert(err.response?.data?.message || 'فشل إرسال الرسالة');
      }
    }
  } finally {
    sending.value = false;
  }
};

// Trigger File Input for Attachments
const triggerFileInput = (type) => {
  showAttachMenu.value = false;
  if (type === 'image') imageInput.value?.click();
  else if (type === 'video') videoInput.value?.click();
  else if (type === 'audio') audioInput.value?.click();
  else if (type === 'document') documentInput.value?.click();
};

const handleFileSelected = async (type, event) => {
  const file = event.target.files?.[0];
  if (!file || !activeConv.value) return;

  // Files picked under a narrow accept (e.g. an audio input fed a PDF)
  // are promoted to 'document' so the backend/engine get the right type.
  let sendType = type;
  if (type === 'audio' && !(file.type || '').startsWith('audio/')) sendType = 'document';
  if (type === 'image' && !(file.type || '').startsWith('image/')) sendType = 'document';
  if (type === 'video' && !(file.type || '').startsWith('video/')) sendType = 'document';

  const caption = prompt('أدخل تعليقاً على الملف (اختياري):', '') || '';

  const formData = new FormData();
  formData.append('conversation_id', activeConv.value.id);
  formData.append('session_id', sendSessionId.value);
  formData.append('type', sendType);
  formData.append('file', file);
  if (caption) formData.append('caption', caption);
  if (replyTarget.value?.message_id) {
    formData.append('reply_to_id', replyTarget.value.message_id);
    replyTarget.value = null;
  }

  try {
    const res = await crm.sendMedia(formData);
    if (res.success && res.message) {
      appendMessageDedup(res.message);
      scrollToBottom();
      if (activeConv.value && !activeConv.value.assigned_agent_id && user.value && !isOwner.value) {
        activeConv.value.assigned_agent_id = user.value.id;
        activeConv.value.assigned_agent = { id: user.value.id, name: user.value.name };
      }
      await loadConversations();
    }
  } catch (err) {
    alert(err.response?.data?.message || 'فشل إرسال الملف');
  } finally {
    event.target.value = '';
  }
};

// Paste-to-send: a copied image/file pasted into the composer is sent as
// media through the same pipeline as the attach button (WhatsApp-style).
// Text typed in the input is attached as the media caption.
const handlePaste = (event) => {
  const items = event.clipboardData?.items;
  if (!items) return;
  const files = [];
  for (const item of items) {
    if (item.kind === 'file') {
      const f = item.getAsFile();
      if (f) files.push(f);
    }
  }
  if (!files.length) return; // plain-text paste — let the default insert it
  event.preventDefault();
  for (const f of files) sendPastedFile(f);
};

const sendPastedFile = async (file) => {
  if (!activeConv.value) return;
  const mime = file.type || '';
  const sendType = mime.startsWith('image/')
    ? 'image'
    : mime.startsWith('video/')
      ? 'video'
      : mime.startsWith('audio/')
        ? 'audio'
        : 'document';
  // Clipboard blobs usually carry a generic/empty name — give one.
  const ext = (mime.split('/')[1] || 'bin').split(';')[0];
  const named = file.name && !/^image\.(png|jpe?g)$/i.test(file.name)
    ? file
    : new File([file], `pasted_${Date.now()}.${ext}`, { type: mime });
  const caption = messageText.value.trim();

  const formData = new FormData();
  formData.append('conversation_id', activeConv.value.id);
  formData.append('session_id', sendSessionId.value);
  formData.append('type', sendType);
  formData.append('file', named);
  if (caption) formData.append('caption', caption);
  if (replyTarget.value?.message_id) {
    formData.append('reply_to_id', replyTarget.value.message_id);
    replyTarget.value = null;
  }

  try {
    const res = await crm.sendMedia(formData);
    if (res.success && res.message) {
      appendMessageDedup(res.message);
      messageText.value = '';
      scrollToBottom();
      if (activeConv.value && !activeConv.value.assigned_agent_id && user.value && !isOwner.value) {
        activeConv.value.assigned_agent_id = user.value.id;
        activeConv.value.assigned_agent = { id: user.value.id, name: user.value.name };
      }
      await loadConversations();
    }
  } catch (err) {
    alert(err.response?.data?.message || 'فشل إرسال الملف الملصوق');
  }
};

// Audio Voice Recording
const startVoiceRecording = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.start();
    isRecording.value = true;
    recordingSeconds.value = 0;
    recordingTimer = setInterval(() => {
      recordingSeconds.value += 1;
    }, 1000);
  } catch (err) {
    alert('تعذر الوصول إلى الميكروفون: ' + err.message);
  }
};

const cancelRecording = () => {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  clearInterval(recordingTimer);
  isRecording.value = false;
  audioChunks = [];
};

const stopAndSendRecording = () => {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') return;

  mediaRecorder.onstop = async () => {
    const audioBlob = new Blob(audioChunks, { type: 'audio/ogg; codecs=opus' });
    const audioFile = new File([audioBlob], `voice_${Date.now()}.ogg`, { type: 'audio/ogg' });

    const formData = new FormData();
    formData.append('conversation_id', activeConv.value.id);
    formData.append('session_id', sendSessionId.value);
    formData.append('type', 'voice');
    formData.append('file', audioFile);

    try {
      const res = await crm.sendMedia(formData);
      if (res.success && res.message) {
        appendMessageDedup(res.message);
        scrollToBottom();
        await loadConversations();
      }
    } catch (err) {
      alert('فشل إرسال التسجيل الصوتي');
    }
  };

  mediaRecorder.stop();
  clearInterval(recordingTimer);
  isRecording.value = false;
};

const formatRecordingTime = (sec) => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
};

// Reactions
const toggleReactionPicker = (msgId) => {
  activeReactionMessageId.value = activeReactionMessageId.value === msgId ? null : msgId;
};

const addReaction = async (msg, emoji) => {
  activeReactionMessageId.value = null;
  try {
    const res = await crm.sendReaction({
      conversation_id: activeConv.value.id,
      message_id: msg.message_id || msg.id,
      emoji,
    });
    if (res.success && res.message) {
      msg.reactions = res.message.reactions;
    }
  } catch {}
};

const removeReaction = async (msg, emoji) => {
  try {
    const res = await crm.sendReaction({
      conversation_id: activeConv.value.id,
      message_id: msg.message_id || msg.id,
      emoji: '', // remove
    });
    if (res.success && res.message) {
      msg.reactions = res.message.reactions;
    }
  } catch {}
};

// Start New Chat
const handleStartChat = async () => {
  creatingChat.value = true;
  try {
    const res = await crm.startConversation({
      phone: newChatPhone.value,
      name: newChatName.value,
      session_id: newChatSessionId.value,
    });
    if (res.success && res.conversation) {
      showNewChatModal.value = false;
      newChatPhone.value = '';
      newChatName.value = '';
      await loadConversations();
      selectConversation(res.conversation);
    }
  } catch (err) {
    alert(err.response?.data?.message || 'فشل بدء المحادثة');
  } finally {
    creatingChat.value = false;
  }
};

const appendEmoji = (e) => {
  messageText.value += e;
  showEmojiMenu.value = false;
};

// ---- WhatsApp-style media viewer ----------------------------------------
const viewerIndex = computed(() => viewer.value.index);
const viewerItem = computed(() => viewer.value.items[viewer.value.index] || null);

const VIEWER_TYPES = ['image', 'sticker', 'video'];
const toViewerItem = (m) => {
  const src = mediaSrc(m);
  if (!src) return null;
  return {
    key: m.id ?? m.message_id,
    type: m.message_type === 'video' ? 'video' : 'image',
    src,
    caption: isPlaceholderText(m) ? '' : (m.message || ''),
    timestamp: m.timestamp,
    direction: m.direction,
    sender: m.direction === 'outgoing'
      ? 'أنت'
      : (isGroupConv.value ? groupSenderLabel(m) : convTitle(activeConv.value)),
  };
};
const viewerItemsFrom = (list) =>
  (list || [])
    .filter((m) => VIEWER_TYPES.includes(m.message_type))
    .map(toViewerItem)
    .filter(Boolean)
    .sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));

const openLightbox = (m) => {
  const items = viewerItemsFrom(messages.value);
  const key = m.id ?? m.message_id;
  let idx = items.findIndex((x) => x.key === key);
  if (idx === -1) {
    const self = toViewerItem(m);
    if (!self) return;
    items.push(self);
    idx = items.length - 1;
  }
  viewer.value = { items, index: idx };
  if (activeConv.value) loadViewerGallery(activeConv.value);
};

// The strip covers the whole conversation, not just the loaded window —
// the backend ships the last N media rows and the current item is kept.
const loadViewerGallery = async (conv) => {
  try {
    const res = await crm.getConversationMedia(conv.id, { limit: 300 });
    if (!viewer.value.items.length || activeConv.value?.id !== conv.id) return;
    const items = viewerItemsFrom(res.media || []);
    if (!items.length) return;
    const cur = viewer.value.items[viewer.value.index];
    const idx = items.findIndex((x) => x.key === cur?.key);
    viewer.value = { items, index: idx >= 0 ? idx : items.length - 1 };
  } catch {}
};

const closeViewer = () => { viewer.value = { items: [], index: -1 }; };
const viewerPrev = () => { if (viewer.value.index > 0) viewer.value.index--; };
const viewerNext = () => {
  if (viewer.value.index < viewer.value.items.length - 1) viewer.value.index++;
};

// Keep the current thumbnail centered in the filmstrip.
watch(viewerIndex, () => {
  nextTick(() => {
    viewerStripEl.value
      ?.querySelector('[data-current="1"]')
      ?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  });
});

// Time formatting helpers
const formatChatTime = (t) => {
  if (!t) return '';
  try {
    const d = new Date(t);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString('ar-EG', { month: 'numeric', day: 'numeric' });
  } catch {
    return '';
  }
};

const formatTime = (t) => {
  if (!t) return '';
  try {
    return new Date(t).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

// Poller to update messages in background.
// Messages: incremental fetch (after_id) every 2s — only new rows are shipped.
// Every 4th tick a full refresh catches receipt/reaction updates on old rows.
// Conversation list refreshes every ~10s.
let pollTick = 0;
const startBackgroundPoller = () => {
  pollTimer = setInterval(async () => {
    pollTick++;
    // History-sync progress check every ~7.5s (tick ≈ 2.5s).
    if (pollTick % 3 === 0) checkSyncStatus();
    // While browsing a jumped mid-history window, don't drag in newer rows.
    const pollConv = activeConv.value;
    const pollSeq = msgLoadSeq;
    if (pollConv && !hasNewerMessages.value) {
      try {
        const lastReal = [...messages.value].reverse().find((m) => typeof m.id === 'number');
        const incremental = lastReal && pollTick % 4 !== 0;
        // The periodic full refresh must cover every loaded page or it would
        // collapse the thread back to the latest window.
        const refreshLimit = Math.max(
          messages.value.filter((m) => typeof m.id === 'number').length,
          PAGE_SIZE,
        );
        const res = await crm.getMessages(
          pollConv.id,
          incremental ? { after_id: lastReal.id } : { limit: refreshLimit },
        );
        // The user may have switched chats mid-flight — a stale poll must
        // never paint the previous chat's rows into the open one.
        if (pollSeq !== msgLoadSeq || activeConv.value?.id !== pollConv.id) return;
        if (res.success && res.messages) {
          if (incremental) {
            if (res.messages.length) {
              const stick = isNearBottom();
              const have = new Set();
              for (const x of messages.value) {
                have.add(x.id);
                if (x.message_id) have.add(x.message_id);
              }
              const fresh = res.messages.filter(
                (m) => !have.has(m.id) && !(m.message_id && have.has(m.message_id))
              );
              if (fresh.length) {
                messages.value.push(...fresh);
                if (stick) scrollToBottom();
              }
            }
          } else {
            // Refreshing the window mid-scroll must not yank the user back
            // down — anchor on the same bubble like the older-page logic.
            const el = messagesContainer.value;
            const prevHeight = el ? el.scrollHeight : 0;
            const prevTop = el ? el.scrollTop : 0;
            const stick = isNearBottom();
            const changed = mergeMessagesWindow(res.messages);
            hasMoreMessages.value = !!res.has_more;
            if (changed) {
              nextTick(() => {
                if (!el) return;
                el.scrollTop = stick
                  ? el.scrollHeight
                  : el.scrollHeight - prevHeight + prevTop;
              });
            }
          }
        }
      } catch {}
    }
    // Realtime push covers the fast path — polling is only a fallback now,
    // so run it at a calmer cadence.
    if (pollTick === 1 || pollTick % 8 === 0) await loadConversations();
  }, 2500);
};

// ---- Realtime (Reverb) -----------------------------------------------------
// Instant updates pushed over WebSocket; the poll below is only a fallback.
const handleRealtimeEvent = (evt) => {
  const { type, data } = evt || {};
  if (!type || !data) return;

  if (type === 'message.new' && data.message) {
    const m = data.message;
    if (activeConv.value && data.conversation_id === activeConv.value.id) {
      const dup = messages.value.some(
        (x) => x.id === m.id || (m.message_id && x.message_id === m.message_id)
      );
      if (!dup && !hasNewerMessages.value) {
        const stick = isNearBottom();
        // An outgoing echo can beat our own HTTP response — claim the
        // pending optimistic bubble (same text) instead of appending a
        // second row.
        const tempIdx = m.direction === 'outgoing'
          ? messages.value.findIndex(
              (x) => typeof x.id !== 'number' && x.direction === 'outgoing' && x.message === m.message
            )
          : -1;
        if (tempIdx !== -1) messages.value.splice(tempIdx, 1, m);
        else messages.value.push(m);
        if (stick) scrollToBottom();
      }
      if (activeConv.value.unread_count) activeConv.value.unread_count = 0;
    }
    if (data.conversation) mergeConversation(data.conversation);
  } else if (type === 'message.status') {
    // Receipts may arrive batched (one event carrying many ids).
    const items = Array.isArray(data.items)
      ? data.items
      : [{
          message_id: data.message_id,
          external_message_id: data.external_message_id,
          conversation_id: data.conversation_id,
          status: data.status,
          conversation_last_status: data.conversation_last_status,
        }];
    const order = { sending: 0, sent: 1, delivered: 2, read: 3 };
    for (const it of items) {
      const idx = messages.value.findIndex(
        (x) => x.id === it.message_id || x.message_id === it.external_message_id
      );
      if (idx !== -1 && (order[it.status] ?? 0) >= (order[messages.value[idx].status] ?? 0)) {
        messages.value[idx].status = it.status;
      }
      // Backend flags the receipt that hit the conversation's latest message —
      // that alone may move the list tick (sent → delivered → read).
      if (it.conversation_last_status && it.conversation_id) {
        const cv = conversations.value.find((c) => c.id === it.conversation_id);
        if (cv) cv.last_message_status = it.conversation_last_status;
      }
    }
  } else if (type === 'message.media') {
    const msg = messages.value.find((x) => x.id === data.message_id);
    if (msg) msg.media_url = data.media_url;
  } else if (type === 'message.revoked') {
    // Anti-delete: keep the bubble, just stamp it.
    const msg = messages.value.find(
      (x) => x.id === data.message_id ||
        (data.external_message_id && x.message_id === data.external_message_id)
    );
    if (msg && !msg.revoked_at) {
      msg.revoked_at = data.revoked_at || new Date().toISOString();
    }
  } else if (type === 'message.deleted') {
    // Local "delete for me" from another tab/agent — drop the bubble.
    messages.value = messages.value.filter((x) => x.id !== data.message_id);
  } else if (type === 'typing') {
    if (data.conversation_id) {
      if (data.state === 'composing') {
        typingConvs.value[data.conversation_id] = true;
        clearTimeout(typingTimers[data.conversation_id]);
        typingTimers[data.conversation_id] = setTimeout(() => {
          delete typingConvs.value[data.conversation_id];
        }, 6000);
      } else {
        delete typingConvs.value[data.conversation_id];
      }
    }
  } else if (type === 'device.status') {
    const d = devices.value.find((x) => x.id === data.session_id);
    if (d) d.status = data.status;
    else loadDevices();
  } else if (type === 'conversation.update' && data.conversation) {
    mergeConversation(data.conversation);
    if (activeConv.value && data.conversation.id === activeConv.value.id) {
      Object.assign(activeConv.value, data.conversation);
    }
  } else if (type === 'conversations.renamed') {
    // Pushnames landed after the chats imported — swap "+number" titles for
    // the resolved names in place, without waiting for the next list poll.
    for (const it of Array.isArray(data.items) ? data.items : []) {
      const cv = conversations.value.find((c) => c.id === it.id);
      if (cv && it.contact_name) cv.contact_name = it.contact_name;
      if (activeConv.value && activeConv.value.id === it.id && it.contact_name) {
        activeConv.value.contact_name = it.contact_name;
      }
    }
  } else if (type === 'conversation.transferred') {
    // A teammate pushed a chat to me — toast + ding + counter refresh; the
    // row itself arrives via the conversation.update event that precedes it.
    if (data.to_agent?.id === user.value?.id) {
      transferToast.value = { from: data.from_agent?.name || 'زميلك' };
      try { playIncomingMessage(); } catch {}
      clearTimeout(transferToastTimer);
      transferToastTimer = setTimeout(() => (transferToast.value = null), 8000);
      refreshMe();
      loadConversations();
    }
  } else if (type === 'call.event') {
    // incoming-call / state events pushed by the call bridge → show the panel
    if (data.event === 'incoming') {
      callState.value = 'incoming';
      callPeer.value = data.peer || '';
    } else if (data.event === 'state' && data.callState) {
      callState.value = data.callState;
      if (data.video === true) callVideo.value = true;
      if (data.callState === 'idle') { callMuted.value = false; callVideo.value = false; camOn.value = true; }
    }
  }
};

// Does a conversation still belong in the list under the current tab?
// Base rule for agents: the pool + what they hold — a chat a colleague just
// claimed drops out the moment the update lands. Owners see everything;
// the tab filters then apply on top.
const inScope = (c) => {
  // Group chats stay visible to every teammate — nobody owns a group.
  const groupExempt = isGroupJid(c.contact_jid);
  if (!isOwner.value && !groupExempt && c.assigned_agent_id && c.assigned_agent_id !== user.value?.id) return false;
  switch (selectedFilter.value) {
    // For agents "متاحة" = the pool + their own open chats + all groups.
    case 'available': return isOwner.value
      ? (!c.assigned_agent_id && !c.resolved_at)
      : (!c.resolved_at && (!c.assigned_agent_id || c.assigned_agent_id === user.value?.id || groupExempt));
    case 'mine': return c.assigned_agent_id === user.value?.id && !c.resolved_at;
    case 'resolved': return !!c.resolved_at;
    case 'unread': return c.unread_count > 0;
    default: return true;
  }
};

const mergeConversation = (conv) => {
  const idx = conversations.value.findIndex((c) => c.id === conv.id);
  // Patch first, then evaluate the tab filter on the merged row — partial
  // pushes (a message.new echo carrying no assignment fields) can't evict
  // a row they know nothing about.
  if (idx !== -1) patchRow(conversations.value[idx], conv);
  const row = idx !== -1 ? conversations.value[idx] : conv;
  if (!inScope(row)) {
    if (idx !== -1) conversations.value.splice(idx, 1);
    return;
  }
  if (idx === -1) conversations.value.unshift(conv);
  // Match the backend ordering exactly (pinned first, then latest activity) —
  // a different comparator makes the list flip-flop between poll and push.
  const sorted = [...conversations.value].sort(
    (a, b) =>
      (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0) ||
      new Date(b.last_message_at) - new Date(a.last_message_at),
  );
  if (sorted.some((c, i) => c !== conversations.value[i])) conversations.value = sorted;
};

// ---------------------------------------------------------------------------
// WhatsApp voice calls — bridged through the local whatsapp-callbridge service.
// Control flows over REST (/api/crm/call/*); live PCM audio rides the
// dedicated WebSocket opened via callAudio.connect().
// ---------------------------------------------------------------------------
const callState = ref('idle'); // idle|dialing|ringing|connecting|active|incoming
const callPeer = ref('');
const callPeerName = ref('');
const callMuted = ref(false);
const callError = ref('');
const callBusy = ref(false);
const callVideo = ref(false);
const camOn = ref(true);
let callWsReady = false;

const onCallWsEvent = (m) => {
  if (m.type === 'state' || (m.type === 'event' && m.event === 'state')) {
    if (m.callState) callState.value = m.callState;
    if (m.peer) callPeer.value = m.peer;
    if (m.video === true) callVideo.value = true;
    if (m.callState === 'idle') {
      callMuted.value = false;
      callVideo.value = false;
      camOn.value = true;
      // surface why the call ended (missed / unreachable / terminated)
      if (m.reason === 'terminated' && !callError.value) callError.value = 'المكالمة انتهت';
    }
  } else if (m.type === 'event' && m.event === 'video') {
    // remote video track appeared (incoming video call / upgraded call)
    callVideo.value = true;
    if (callState.value === 'active' && !callAudio.camStream) callAudio.startVideo().catch(() => {});
  } else if (m.type === 'event' && m.event === 'incoming') {
    callState.value = 'incoming';
    if (m.peer) callPeer.value = m.peer;
  } else if (m.type === 'event' && m.event === 'mute') {
    callMuted.value = !!m.muted;
  } else if (m.type === 'ack' && m.r && m.r.ok === false) {
    callError.value = m.r.err || 'تعذر تنفيذ العملية';
    if (callState.value === 'dialing') callState.value = 'idle';
  }
};

// call-state → audible cue: ringback while dialling/connecting (the real
// ringback arrives over downlink once it's ringing), ringtone on incoming
watch(callState, (s) => {
  if (s === 'dialing' || s === 'connecting') callTones.ringback();
  else if (s === 'incoming') callTones.ringtone();
  else callTones.stop();
  if (s === 'idle') callAudio.stopMedia();
  // incoming video call answered → camera starts once the call is live
  if (s === 'active' && callVideo.value && !callAudio.camStream) callAudio.startVideo().catch(() => {});
});

const ensureCallWs = async () => {
  if (callWsReady && callAudio.ws && callAudio.ws.readyState === 1) return;
  callAudio.onEvent = onCallWsEvent;
  await callAudio.connect();
  callWsReady = true;
};

const startCall = async (video = false) => {
  const conv = activeConv.value;
  // groups have no contact_phone — send the full @g.us JID so the bridge
  // opens the group chat and rings its members
  const to = conv?.contact_phone || (isGroupJid(conv?.contact_jid) ? conv.contact_jid : '');
  if (!to) { callError.value = 'مفيش رقم متاح للشات ده'; return; }
  callBusy.value = true;
  callError.value = '';
  callVideo.value = !!video;
  try {
    await ensureCallWs();
    callPeer.value = to;
    callPeerName.value = conv.contact_name || '';
    callState.value = 'dialing';
    const r = await callApi.dial(to, video);
    if (!r || r.ok === false) {
      callError.value = (r && r.err) || 'فشل الاتصال';
      callState.value = 'idle';
      return;
    }
    await callAudio.startMedia();
    if (video) await callAudio.startVideo().catch(() => {});
  } catch (e) {
    callError.value = 'تعذر بدء المكالمة';
    callState.value = 'idle';
  } finally {
    callBusy.value = false;
  }
};

const hangupCall = async () => {
  try { await callApi.hangup(); } catch {}
  callState.value = 'idle';
  callMuted.value = false;
  callAudio.stopMedia();
};

const answerCall = async () => {
  try {
    await ensureCallWs();
    await callAudio.startMedia();
    const r = await callApi.answer();
    if (r && r.ok === false) callError.value = r.err || 'فشل الرد';
  } catch (e) { callError.value = 'تعذر الرد على المكالمة'; }
};

const rejectCall = async () => {
  try { await callApi.reject(); } catch {}
  callState.value = 'idle';
};

const toggleMute = async () => {
  callMuted.value = !callMuted.value;
  callAudio.setMuted(callMuted.value);
  try { await callApi.mute(callMuted.value); } catch {}
};

const toggleCam = () => {
  camOn.value = !camOn.value;
  callAudio.setCamOn(camOn.value);
};

const startRealtime = () => {
  const echo = getEcho();
  const channel = crmChannelName();
  if (!echo || !channel) return;
  crmChannel = echo.private(channel).listen('.crm.event', handleRealtimeEvent);
  echo.connector.pusher.connection.bind('connected', () => (realtimeConnected.value = true));
  echo.connector.pusher.connection.bind('disconnected', () => (realtimeConnected.value = false));
};

// Send "composing" while the agent types (throttled server-side too).
// ---- @mention picker (group composer) -----------------------------------
const pendingMentions = ref({}); // digits -> jid for tokens picked below
const mentionMenu = ref({ show: false, items: [], idx: 0, start: -1 });
const memberCache = {};

const ensureMemberList = async (convId) => {
  if (memberCache[convId]) return memberCache[convId];
  let members = [];
  try {
    const res = await crm.getGroupMembers(convId);
    if (res?.success) members = res.members || [];
  } catch { /* engine metadata unavailable — use fallbacks */ }

  if (!members.length) {
    // Fallback: senders already seen in this thread + stored past members —
    // better a partial roster than a dead @ key.
    const seen = new Map();
    for (const m of messages.value || []) {
      const raw = String(m?.from || '');
      const digits = raw.replace(/\D/g, '');
      if (digits.length >= 6 && !seen.has(digits)) {
        seen.set(digits, {
          jid: raw.includes('@') ? raw : digits + '@s.whatsapp.net',
          phone: digits.length <= 14 ? digits : null,
          name: m.sender_name || null,
        });
      }
    }
    for (const m of activeConv.value?.group_past_participants || []) {
      const d = String(m.phone || m.jid || '').replace(/\D/g, '');
      if (d && !seen.has(d)) {
        seen.set(d, { jid: m.jid || d + '@lid', phone: m.phone || null, name: m.name || null });
      }
    }
    members = [...seen.values()];
  }
  memberCache[convId] = members;
  return members;
};

const mentionDigits = (m) => m.phone || m.lid || String(m.jid || '').split('@')[0];

const refreshMentionMenu = async () => {
  const menu = mentionMenu.value;
  if (!isGroupConv.value || menu.start === -1) { menu.show = false; return; }
  const tail = messageText.value.slice(menu.start + 1);
  if (/\s/.test(tail)) { menu.show = false; return; }
  const q = tail.toLowerCase();
  const members = await ensureMemberList(activeConv.value.id);
  menu.items = members
    .filter((m) => !q || (m.name || '').toLowerCase().includes(q) || mentionDigits(m).startsWith(q))
    .slice(0, 8);
  menu.show = menu.items.length > 0;
  menu.idx = 0;
};

const pickMention = (m) => {
  const menu = mentionMenu.value;
  const digits = mentionDigits(m);
  const jid = m.jid || (m.phone ? m.phone + '@s.whatsapp.net' : (m.lid ? m.lid + '@lid' : ''));
  if (digits && jid) pendingMentions.value[digits] = jid;
  messageText.value =
    messageText.value.slice(0, menu.start) + '@' + digits + ' ' +
    messageText.value.slice(menu.start + 1).replace(/^\S*/, '');
  menu.show = false;
};

const onTypingInput = () => {
  if (!activeConv.value) return;
  // Track the last "@" the caret sits after — opens the member picker.
  const el = document.activeElement;
  const pos = el && el.selectionStart != null ? el.selectionStart : messageText.value.length;
  const upto = messageText.value.slice(0, pos);
  const at = upto.lastIndexOf('@');
  // Open when the caret sits inside an @token that started at a word
  // boundary — letters/digits after the @ filter the list, not close it.
  if (at !== -1 && (at === 0 || /[\s\n]/.test(upto[at - 1])) && !/[\s\n]/.test(upto.slice(at + 1))) {
    mentionMenu.value.start = at;
    void refreshMentionMenu();
  } else {
    mentionMenu.value.start = -1;
    mentionMenu.value.show = false;
  }
  const now = Date.now();
  if (now - lastTypingSentAt < 3000) return;
  lastTypingSentAt = now;
  crm.sendTyping(activeConv.value.id, 'composing').catch(() => {});
};

onMounted(async () => {
  try {
    try {
      await crm.me();
      user.value = crm.getUser();
      if (isAgent.value && selectedFilter.value === 'all') {
        selectedFilter.value = 'available';
      }
    } catch {}
    await loadDevices();
    await loadConversations();
  } finally {
    initialLoading.value = false;
  }

  // If query param id is passed (deep link or page refresh mid-chat),
  // reopen that conversation — fall back to a direct fetch when it is past
  // the first page of the list.
  if (route.query.id) {
    const conv = conversations.value.find((c) => String(c.id) === String(route.query.id));
    if (conv) {
      selectConversation(conv);
    } else {
      try {
        const r = await crm.getMessages(route.query.id, { limit: 1 });
        if (r.success && r.conversation) await selectConversation(r.conversation);
      } catch {}
    }
  }

  startRealtime();
  startBackgroundPoller();
  checkSyncStatus();

  document.addEventListener('keydown', onGlobalKeydown);
});

onUnmounted(() => {
  document.removeEventListener('keydown', onGlobalKeydown);
  if (pollTimer) clearInterval(pollTimer);
  if (crmChannel) {
    // Detach only this page's listener — the channel subscription is shared
    // with CrmLayout (message-sound), so leave() would mute it session-wide.
    try { crmChannel.stopListening('.crm.event', handleRealtimeEvent); } catch {}
    crmChannel = null;
  }
  Object.values(typingTimers).forEach(clearTimeout);
  clearTimeout(transferToastTimer);
});
</script>

<style scoped>
/* Authentic WhatsApp Web Wallpaper Doodle */
.whatsapp-doodle-bg {
  background-image: url('/whatsapp-doodle.png');
  background-repeat: repeat;
  background-size: 420px auto;
}

.whatsapp-wallpaper {
  background-color: transparent;
}

.slide-left-enter-active,
.slide-left-leave-active {
  transition: transform 0.22s ease, opacity 0.22s ease;
}
.slide-left-enter-from,
.slide-left-leave-to {
  transform: translateX(-30px);
  opacity: 0;
}

.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

/* Wavixa spinner (WhatsApp-green ring) */
.wx-spinner {
  display: inline-block;
  border: 2.5px solid rgba(0, 168, 132, 0.25);
  border-top-color: #00a884;
  border-radius: 50%;
  animation: wx-rotate 0.8s linear infinite;
}
@keyframes wx-rotate {
  to { transform: rotate(360deg); }
}

/* Indeterminate progress bar for the boot splash */
.wx-progress {
  display: block;
  height: 100%;
  width: 38%;
  background: #00a884;
  border-radius: 99px;
  animation: wx-slide 1.1s ease-in-out infinite;
}
@keyframes wx-slide {
  0% { margin-inline-start: -38%; }
  100% { margin-inline-start: 100%; }
}

.wx-fade-leave-active {
  transition: opacity 0.35s ease;
}
.wx-fade-leave-to {
  opacity: 0;
}
</style>
