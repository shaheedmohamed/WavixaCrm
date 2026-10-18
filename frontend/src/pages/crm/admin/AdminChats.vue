<template>
  <div class="h-full flex overflow-hidden bg-[#111b21] text-[#e9edef] font-sans antialiased relative" dir="rtl">
    <!-- LEFT PANEL: Conversation List -->
    <aside
      class="w-full md:w-[380px] lg:w-[420px] bg-[#111b21] border-l border-[#222e35] flex flex-col shrink-0 z-10 transition-all duration-200"
      :class="{ 'max-md:hidden': activeConv }"
    >
      <!-- List Header -->
      <div class="h-16 bg-[#202c33] px-4 flex items-center justify-between border-b border-[#222e35] shrink-0">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-10 h-10 rounded-full bg-gradient-to-tr from-sky-600 to-indigo-500 text-white font-bold flex items-center justify-center text-sm shadow shrink-0">
            A
          </div>
          <div class="min-w-0">
            <h2 class="text-sm font-bold text-[#e9edef] truncate">كل المحادثات</h2>
            <p class="text-[10px] text-[#8696a0]">عرض الأدمن — للقراءة فقط</p>
          </div>
        </div>
      </div>

      <!-- Filters -->
      <div class="px-3 pt-2.5 pb-1.5 space-y-2 shrink-0">
        <div class="relative">
          <input
            v-model="search"
            @input="debouncedLoad"
            type="text"
            placeholder="بحث باسم أو رقم جهة الاتصال..."
            class="w-full bg-[#202c33] text-[#d1d7db] placeholder-[#8696a0] text-xs rounded-lg pl-3 pr-9 py-2 focus:outline-none focus:ring-1 focus:ring-[#00a884]"
          />
          <div class="absolute inset-y-0 right-3 flex items-center pointer-events-none text-[#8696a0]">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          </div>
        </div>
        <div class="flex items-center gap-1.5">
          <select
            v-model="statusFilter"
            @change="load(1)"
            class="flex-1 bg-[#202c33] border border-[#2a3942] rounded-lg px-2 py-1.5 text-[11px] text-[#d1d7db] focus:outline-none focus:border-[#00a884]"
          >
            <option value="">الكل</option>
            <option value="open">مفتوحة</option>
            <option value="resolved">منجزة</option>
          </select>
          <select
            v-model="customerFilter"
            @change="load(1)"
            class="flex-[2] bg-[#202c33] border border-[#2a3942] rounded-lg px-2 py-1.5 text-[11px] text-[#d1d7db] focus:outline-none focus:border-[#00a884] min-w-0"
          >
            <option value="">كل العملاء</option>
            <option v-for="c in customers" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </div>
      </div>

      <!-- Conversation List -->
      <div class="flex-1 overflow-y-auto divide-y divide-[#202c33]/40">
        <div v-if="loadingConvs && !conversations.length" class="p-8 flex flex-col items-center gap-3 text-xs text-[#8696a0]">
          <svg class="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
          جاري تحميل المحادثات...
        </div>
        <div v-else-if="!conversations.length" class="p-8 text-center text-xs text-[#8696a0]">
          لا توجد محادثات مطابقة.
        </div>

        <button
          v-for="c in conversations"
          :key="c.id"
          @click="selectConversation(c)"
          class="w-full text-right p-3 transition-colors flex items-center gap-3 relative group"
          :class="activeConv?.id === c.id ? 'bg-[#2a3942]' : 'hover:bg-[#202c33]/70'"
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
            <span v-else class="text-base">{{ c.contact_name ? c.contact_name.trim().charAt(0) : 'U' }}</span>
            <span
              v-if="c.unread_count > 0"
              class="absolute bottom-0 right-0 w-3 h-3 bg-[#00a884] rounded-full ring-2 ring-[#111b21]"
            ></span>
          </div>

          <!-- Chat Meta -->
          <div class="flex-1 min-w-0">
            <!-- Row 1: Contact Name + Time -->
            <div class="flex items-center justify-between mb-1">
              <div class="flex items-center gap-1.5 min-w-0">
                <span class="font-bold text-sm text-[#e9edef] truncate">
                  {{ c.contact_name || c.contact_phone || 'مستخدم' }}
                </span>
                <span
                  v-if="c.rating"
                  class="text-[10px] text-amber-400 shrink-0 tracking-tighter"
                  :title="c.rating_note || 'تقييم العميل'"
                >{{ '★'.repeat(c.rating) }}</span>
                <!-- Device badge -->
                <span
                  class="px-1.5 py-0.5 rounded text-[10px] font-black tracking-wide shrink-0"
                  :class="c.session?.archived ? 'bg-slate-600/30 text-slate-400 border border-slate-600/40 line-through' : getDeviceBadgeClass(c.session_id)"
                  :title="c.session?.archived ? 'الجهاز اتمسح — المحادثة مؤرشفة' : ''"
                >
                  {{ c.session?.device_name || (c.session_id ? 'ج' + c.session_id : 'جهاز محذوف') }}
                </span>
                <!-- Group badge -->
                <span
                  v-if="isGroupJid(c.contact_jid)"
                  class="px-1.5 py-0.5 rounded text-[10px] font-black tracking-wide shrink-0 bg-violet-500/20 text-violet-300"
                >
                  جروب
                </span>
              </div>

              <span class="text-[11px] text-[#8696a0] shrink-0 font-medium">
                {{ formatChatTime(c.last_message_at) }}
              </span>
            </div>

            <!-- Row 2: Last message + unread pill -->
            <div class="flex items-center justify-between text-xs text-[#8696a0]">
              <div class="flex items-center gap-1 truncate max-w-[240px]">
                <!-- Outgoing ticks — same states as the in-chat bubble ticks -->
                <span v-if="c.last_message_direction === 'outgoing'" class="text-xs">
                  <span v-if="c.last_message_status === 'failed'" class="text-[#f15c6d] font-bold">✗</span>
                  <span v-else-if="c.last_message_status === 'read'" class="text-[#53bdeb] font-bold">✓✓</span>
                  <span v-else-if="c.last_message_status === 'delivered' || !c.last_message_status" class="text-[#8696a0]">✓✓</span>
                  <span v-else-if="c.last_message_status === 'sending' || c.last_message_status === 'queued'" class="text-[#8696a0]">🕐</span>
                  <span v-else class="text-[#8696a0]">✓</span>
                </span>
                <!-- Media icons -->
                <span v-if="c.last_message_type === 'image'" class="text-[#aebac1]">📷 صورة</span>
                <span v-else-if="c.last_message_type === 'video'" class="text-[#aebac1]">🎥 فيديو</span>
                <span v-else-if="c.last_message_type === 'voice' || c.last_message_type === 'audio'" class="text-[#aebac1]">🎤 مقطع صوتي</span>
                <span v-else-if="c.last_message_type === 'call'" class="text-[#aebac1]">📞 مكالمة صوتية</span>
                <span v-else class="truncate">{{ c.last_message || 'محادثة نشطة' }}</span>
              </div>

              <!-- Assignment / resolution + unread badges -->
              <div class="flex items-center gap-1 shrink-0">
                <span
                  v-if="c.assigned_agent_id"
                  class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-300 whitespace-nowrap"
                  :title="'المحادثة محجوزة لهذا الموظف'"
                >مع {{ c.assigned_agent }}</span>
                <span
                  v-else-if="c.resolved_at"
                  class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-300 whitespace-nowrap"
                >✓ مكتمل</span>
                <span
                  v-if="c.unread_count > 0"
                  class="min-w-[20px] h-5 px-1.5 rounded-full bg-[#00a884] text-[#111b21] font-black text-[11px] flex items-center justify-center shadow-sm"
                >
                  {{ c.unread_count }}
                </span>
              </div>
            </div>

            <!-- Row 3 (admin): which customer owns this conversation -->
            <div v-if="c.customer" class="mt-1 text-[10px] text-sky-400/80 truncate">
              {{ c.customer.name }}
            </div>
          </div>
        </button>

        <!-- Pagination: load more conversations -->
        <div v-if="pagination.current_page < pagination.last_page" class="p-3 text-center">
          <button
            @click="loadMoreConvs"
            :disabled="loadingConvs"
            class="px-4 py-1.5 rounded-lg bg-[#202c33] text-[#00a884] text-xs font-bold hover:bg-[#2a3942] transition-colors disabled:opacity-40"
          >
            {{ loadingConvs ? 'جاري التحميل…' : `تحميل المزيد (${pagination.current_page}/${pagination.last_page})` }}
          </button>
        </div>
      </div>
    </aside>

    <!-- RIGHT PANEL: Chat Area (read-only) -->
    <main class="flex-1 flex flex-col min-w-0 bg-[#0b141a] relative">
      <!-- Empty State -->
      <div v-if="!activeConv" class="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[#222e35]/30">
        <div class="w-20 h-20 rounded-3xl bg-[#202c33] text-[#00a884] flex items-center justify-center mb-6 shadow-xl shadow-black/30">
          <svg class="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
          </svg>
        </div>
        <h2 class="text-2xl font-bold text-[#e9edef] mb-2">كل محادثات العملاء</h2>
        <p class="text-sm text-[#8696a0] max-w-md leading-relaxed">
          اختر محادثة من القائمة لعرضها — وضع الأدمن للقراءة فقط.
        </p>
      </div>

      <template v-else>
        <!-- Chat Header -->
        <header class="h-16 bg-[#202c33] px-4 border-b border-[#222e35] flex items-center justify-between shrink-0 z-20">
          <div class="flex items-center gap-3 min-w-0">
            <button
              @click="activeConv = null"
              class="md:hidden text-[#aebac1] hover:text-white p-1 rounded-full"
            >
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
            </button>

            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-600 to-teal-500 text-white font-bold flex items-center justify-center shrink-0 text-sm shadow overflow-hidden relative">
              <img
                v-if="avatarSrc(activeConv)"
                :src="avatarSrc(activeConv)"
                alt=""
                class="absolute inset-0 w-full h-full object-cover"
                @error="markAvatarBroken(activeConv.contact_avatar)"
              />
              <span v-else>{{ activeConv.contact_name ? activeConv.contact_name.trim().charAt(0) : 'U' }}</span>
            </div>

            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <h3 class="text-sm font-bold text-[#e9edef] truncate">
                  {{ activeConv.contact_name || activeConv.contact_phone }}
                </h3>
                <span
                  class="px-2 py-0.5 rounded text-[10px] font-black"
                  :class="activeConv.session?.archived ? 'bg-slate-600/30 text-slate-400 border border-slate-600/40' : getDeviceBadgeClass(activeConv.session_id)"
                  :title="activeConv.session?.archived ? 'الجهاز اتمسح — المحادثة مؤرشفة' : ''"
                >
                  عبر: {{ activeConv.session?.device_name || (activeConv.session_id ? 'ج' + activeConv.session_id : 'جهاز محذوف') }}{{ activeConv.session?.archived ? ' (محذوف)' : '' }}
                </span>
                <span
                  v-if="isGroupConv"
                  class="px-2 py-0.5 rounded text-[10px] font-black bg-violet-500/20 text-violet-300"
                >
                  جروب
                </span>
                <span
                  v-if="activeConv.customer"
                  class="px-2 py-0.5 rounded text-[10px] font-black bg-sky-500/15 text-sky-300"
                >
                  {{ activeConv.customer.name }}
                </span>
              </div>
              <p class="text-[11px] text-[#8696a0] font-mono" dir="ltr">
                +{{ activeConv.contact_phone }}
              </p>
              <p v-if="activeConv.rating" class="text-[11px] text-amber-400 leading-tight">
                {{ '★'.repeat(activeConv.rating) }}<span v-if="activeConv.rating_note" class="text-[#8696a0]"> — {{ activeConv.rating_note }}</span>
              </p>
            </div>
          </div>

          <div class="flex items-center gap-2 shrink-0">
            <span
              v-if="activeConv.assigned_agent_id"
              class="px-2 py-1 rounded-lg bg-amber-500/15 text-amber-300 text-[11px] font-bold whitespace-nowrap"
            >مع {{ activeConv.assigned_agent }}</span>
            <span
              v-else-if="activeConv.resolved_at"
              class="px-2 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 text-[11px] font-bold whitespace-nowrap"
            >✓ مكتمل</span>
          </div>
        </header>

        <!-- Messages Area -->
        <div ref="msgBox" class="flex-1 overflow-y-auto px-4 md:px-12 py-4 space-y-1.5">
          <div v-if="chatLoading" class="p-8 text-center text-[#8696a0] text-xs">جاري تحميل الرسائل...</div>

          <template v-else>
            <button
              v-if="hasMore"
              @click="loadMoreMessages"
              class="w-full py-1.5 text-center text-[11px] text-[#00a884] hover:text-[#00c898] font-bold"
            >
              تحميل رسائل أقدم
            </button>
            <div v-else-if="messages.length" class="text-center pb-2">
              <span class="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#182229] text-[#ffd279] text-[11px] shadow">
                <svg width="11" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-1V6a5 5 0 0 0-5-5zm-3 8V6a3 3 0 1 1 6 0v3H9z"/></svg>
                الرسائل مشفرة تمامًا بين الطرفين
              </span>
            </div>

            <div v-if="!messages.length" class="text-center py-12">
              <span class="px-4 py-1.5 rounded-lg bg-[#182229] text-[#8696a0] text-xs shadow">
                لا توجد رسائل في هذه المحادثة.
              </span>
            </div>
          </template>

          <!-- Message Bubbles (grouped by day like WhatsApp) -->
          <template v-for="(m, i) in messages" :key="m.id">
            <!-- Day separator pill -->
            <div v-if="isNewDay(i)" class="flex justify-center py-1 sticky top-0 z-10">
              <span class="px-4 py-1.5 rounded-lg bg-[#182229] text-[#8696a0] text-[11px] shadow">
                {{ dayLabel(m.timestamp || m.created_at) }}
              </span>
            </div>
            <div
              class="flex flex-col group relative"
              :class="m.direction === 'outgoing' ? 'items-start' : 'items-end'"
            >
              <div
                class="max-w-[85%] md:max-w-[70%] lg:max-w-[60%] rounded-2xl p-2.5 shadow-md relative"
                :class="m.direction === 'outgoing' ? 'bg-[#005c4b] text-[#e9edef] rounded-tr-none' : 'bg-[#202c33] text-[#e9edef] rounded-tl-none'"
              >
                <!-- Group sender — which participant sent this message -->
                <div
                  v-if="isGroupConv && m.direction === 'incoming'"
                  class="text-[11px] font-bold mb-0.5 select-none"
                  :style="{ color: groupSenderColor(m.from) }"
                  dir="ltr"
                >
                  {{ groupSenderLabel(m) }}
                </div>

                <!-- Forwarded label -->
                <div v-if="m.is_forwarded" class="mb-1 flex items-center gap-1 text-[10px] italic text-[#8696a0] select-none">
                  <svg class="w-3.5 h-3.5 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M5 5l7 7-7 7"/></svg>
                  <span>مُعاد توجيهها</span>
                </div>

                <!-- Quoted / Reply To Message if any -->
                <div
                  v-if="m.reply_to_id"
                  class="mb-1.5 p-1.5 rounded-lg bg-black/20 border-r-2 border-[#00a884] text-[11px] text-[#8696a0]"
                >
                  <template v-if="quotedPreview(m.reply_to_id)">
                    <p class="font-bold text-[#00a884] text-[10px] mb-0.5">
                      {{ quotedPreview(m.reply_to_id).direction === 'outgoing' ? 'أنت' : (activeConv?.contact_name || activeConv?.contact_phone) }}
                    </p>
                    <p class="truncate max-w-[220px] text-[#d1d7db]">
                      {{ quotedPreview(m.reply_to_id).message || `[${quotedPreview(m.reply_to_id).message_type}]` }}
                    </p>
                  </template>
                  <span v-else>رد على رسالة</span>
                </div>

                <!-- Anti-delete badge — the row is kept, only flagged -->
                <div
                  v-if="m.revoked_at"
                  class="mb-1.5 flex items-center gap-1.5 w-fit rounded-lg bg-[#f15c6d]/10 border border-[#f15c6d]/25 px-2 py-1 text-[10px] italic text-[#f15c6d]"
                >
                  <span class="not-italic">🚫</span>
                  <span>{{ m.direction === 'outgoing' ? 'حُذفت هذه الرسالة لدى الجميع' : 'العميل حذف هذه الرسالة لدى الجميع — المحتوى محفوظ' }}</span>
                </div>

                <!-- Media Content: Image / Sticker -->
                <div v-if="(m.message_type === 'image' || m.message_type === 'sticker') && mediaSrc(m)" class="mb-1.5">
                  <img
                    :src="mediaSrc(m)"
                    alt="WhatsApp Image"
                    class="rounded-xl max-h-72 w-full object-cover"
                  />
                </div>

                <!-- Media Content: Video -->
                <div v-else-if="m.message_type === 'video' && mediaSrc(m)" class="mb-1.5">
                  <video
                    :src="mediaSrc(m)"
                    controls
                    class="rounded-xl max-h-72 w-full bg-black/60"
                  ></video>
                </div>

                <!-- Media Content: Audio / Voice Note -->
                <div v-else-if="(m.message_type === 'audio' || m.message_type === 'voice') && (!m.media_mime_type || m.media_mime_type.startsWith('audio/')) && mediaSrc(m)" class="mb-1.5">
                  <div class="flex items-center gap-3 p-2 bg-black/20 rounded-xl min-w-[220px]">
                    <div class="w-9 h-9 rounded-full bg-[#00a884] text-[#111b21] flex items-center justify-center font-bold shrink-0">
                      <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
                    </div>
                    <audio :src="mediaSrc(m)" controls class="h-8 max-w-[200px] flex-1"></audio>
                  </div>
                </div>

                <!-- Media Content: Document — WhatsApp-style file card -->
                <div v-else-if="isDocMessage(m)" class="mb-1.5">
                  <component
                    :is="mediaSrc(m) ? 'a' : 'div'"
                    :href="mediaSrc(m) || undefined"
                    target="_blank"
                    :download="docInfo(m).fileName"
                    class="flex items-center gap-3 p-2.5 bg-black/20 rounded-xl min-w-[230px] max-w-[320px] hover:bg-black/30 transition-colors"
                  >
                    <div class="w-11 h-12 rounded-lg flex flex-col items-center justify-center shrink-0 relative overflow-hidden"
                      :style="{ backgroundColor: docInfo(m).color }">
                      <svg class="w-6 h-6 text-white/95" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M6 2a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6H6zm7 1.5L18.5 9H13V3.5zM8 13h8v1.5H8V13zm0 3h8v1.5H8V16z"/>
                      </svg>
                      <span class="text-[7px] font-black text-white leading-none mt-0.5 px-0.5 truncate w-full text-center">{{ docInfo(m).ext }}</span>
                    </div>
                    <div class="flex-1 min-w-0" dir="ltr" style="text-align:left">
                      <p class="text-xs font-bold text-[#e9edef] truncate">{{ docInfo(m).fileName }}</p>
                      <p class="text-[10px] text-[#8696a0] mt-0.5">{{ docInfo(m).sub }}</p>
                    </div>
                  </component>
                </div>

                <!-- Media Content: Location / Contact / Call -->
                <div v-else-if="m.message_type === 'location'" class="mb-1.5">
                  <div class="flex items-center gap-2 p-2 bg-black/20 rounded-xl text-xs text-[#d1d7db]">
                    <span class="text-base">📍</span>
                    <span>{{ m.message || 'موقع' }}</span>
                  </div>
                </div>
                <div v-else-if="m.message_type === 'contact'" class="mb-1.5">
                  <div class="flex items-center gap-2 p-2 bg-black/20 rounded-xl text-xs text-[#d1d7db]">
                    <span class="text-base">👤</span>
                    <span>{{ m.message || 'جهة اتصال' }}</span>
                  </div>
                </div>
                <div v-else-if="m.message_type === 'call'" class="mb-1.5">
                  <div class="flex items-center gap-2 p-2 bg-black/20 rounded-xl text-xs text-[#d1d7db]">
                    <span class="text-base">{{ m.direction === 'incoming' ? '📲' : '📞' }}</span>
                    <span>{{ m.message || 'مكالمة صوتية' }}</span>
                  </div>
                </div>

                <!-- Text Message Content -->
                <p v-if="m.message && !['location', 'contact', 'call'].includes(m.message_type) && !isPlaceholderText(m)" class="text-sm whitespace-pre-wrap leading-relaxed break-words px-1">
                  {{ m.message }}
                </p>

                <!-- Footer: Time + Status Ticks -->
                <div class="flex items-center justify-end gap-1 text-[10px] text-[#8696a0] mt-1 select-none">
                  <span>{{ formatTime(m.timestamp || m.created_at) }}</span>
                  <span v-if="m.direction === 'outgoing'">
                    <span v-if="m.status === 'sending'" class="text-[#8696a0]">🕐</span>
                    <span v-else-if="m.status === 'failed'" class="text-[#f15c6d] font-bold" title="فشل الإرسال">✗</span>
                    <span v-else-if="m.status === 'read'" class="text-[#53bdeb] font-bold">✓✓</span>
                    <span v-else-if="m.status === 'delivered'" class="text-[#8696a0]">✓✓</span>
                    <span v-else class="text-[#8696a0]">✓</span>
                  </span>
                </div>

                <!-- Reactions Display Pills (read-only) -->
                <div
                  v-if="m.reactions && m.reactions.length > 0"
                  class="absolute -bottom-2.5 right-2 flex items-center gap-1 bg-[#182229] border border-[#2a3942] rounded-full px-1.5 py-0.5 shadow-md z-10"
                >
                  <span
                    v-for="(r, idx) in m.reactions"
                    :key="idx"
                    class="text-xs"
                    :title="r.from"
                  >
                    {{ r.emoji }}
                  </span>
                </div>
              </div>
            </div>
          </template>
        </div>

        <!-- Read-only footer -->
        <div class="bg-[#202c33] border-t border-[#222e35] px-4 py-3 text-center shrink-0">
          <span class="text-[11px] text-[#8696a0]">عرض للقراءة فقط — وضع الأدمن</span>
        </div>
      </template>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue';
import crm from '@/services/crm';

const loadingConvs = ref(true);
const conversations = ref([]);
const customers = ref([]);
const search = ref('');
const statusFilter = ref('');
const customerFilter = ref('');
const pagination = ref({ current_page: 1, last_page: 1, total: 0 });
let debounce = null;

const activeConv = ref(null);
const messages = ref([]);
const chatLoading = ref(false);
const hasMore = ref(false);
const msgBox = ref(null);

const load = async (page = 1, append = false) => {
  loadingConvs.value = true;
  try {
    const res = await crm.client().get('/admin/conversations', {
      params: {
        q: search.value || undefined,
        status: statusFilter.value || undefined,
        customer_id: customerFilter.value || undefined,
        page,
      },
    });
    if (res.data?.success) {
      const list = res.data.conversations || [];
      conversations.value = append ? [...conversations.value, ...list] : list;
      pagination.value = res.data.pagination;
    }
  } catch (e) { console.error(e); }
  finally { loadingConvs.value = false; }
};

const loadMoreConvs = () => load(pagination.value.current_page + 1, true);

const debouncedLoad = () => {
  clearTimeout(debounce);
  debounce = setTimeout(() => load(1), 350);
};

const selectConversation = async (c) => {
  activeConv.value = c;
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
    const res = await crm.client().get(`/admin/conversations/${activeConv.value.id}/messages`, {
      params: { before_id: oldest },
    });
    if (res.data?.success) {
      messages.value = [...(res.data.messages || []), ...messages.value];
      hasMore.value = res.data.has_more;
    }
  } catch (e) { console.error(e); }
};

const quotedPreview = (id) => messages.value.find((x) => x.id === id || x.message_id === id);

// ---------- helpers mirrored from CrmChat.vue ----------
const isGroupJid = (jid) => String(jid || '').endsWith('@g.us');
const isGroupConv = computed(() => isGroupJid(activeConv.value?.contact_jid));
const senderPalette = ['#35cd96', '#ffa349', '#6bcbef', '#ff6e6e', '#e542a3', '#91ab01', '#d97cd0', '#b3c94b', '#53bdeb', '#ff9d00'];
const groupSenderColor = (from) => {
  let h = 0;
  for (const ch of String(from || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return senderPalette[h % senderPalette.length];
};
const groupSenderLabel = (m) => {
  const n = String(m.from || '').split('@')[0];
  return n ? '+' + n : 'مشارك';
};

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
  return badgeColors[sessionId % badgeColors.length];
};

const mediaSrc = (m) => {
  if (!m) return null;
  if (m.media_url) return m.media_url;
  if (m.media_meta && m.media_meta.mediaKey) {
    return `/api/crm/media/${m.id}?token=${encodeURIComponent(crm.getToken() || '')}`;
  }
  return null;
};

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

const brokenAvatars = new Set();
const avatarSrc = (c) => {
  const url = c?.contact_avatar;
  return url && !brokenAvatars.has(url) ? url : null;
};
const markAvatarBroken = (url) => {
  if (url) brokenAvatars.add(url);
};

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

onMounted(async () => {
  load();
  try {
    const res = await crm.client().get('/admin/customers');
    customers.value = res.data?.customers || [];
  } catch (e) { /* filter stays empty */ }
});
</script>
