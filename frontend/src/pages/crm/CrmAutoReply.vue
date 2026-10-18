<template>
  <div class="h-full overflow-y-auto p-4 md:p-8 space-y-6 pb-32" dir="rtl">
    <!-- Header + Master switch -->
    <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
      <div class="flex items-center gap-3">
        <div class="w-11 h-11 rounded-2xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/></svg>
        </div>
        <div>
          <h1 class="text-2xl md:text-3xl font-black text-white flex items-center gap-3">
            الرد التلقائي
            <span v-if="form.is_enabled" class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> مفعّل
            </span>
            <span v-else class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-700/60 text-slate-400 border border-slate-600/60">
              متوقف
            </span>
          </h1>
          <p class="text-slate-400 text-sm mt-1">شات بوت واتساب — رد فوري على العملاء بالذكاء الاصطناعي أو برسالة ثابتة</p>
        </div>
      </div>

      <div class="flex items-center gap-4">
        <div v-if="stats.total_replies > 0 || stats.ai_total_replies > 0" class="flex items-center gap-3 bg-slate-800/60 border border-slate-700/80 rounded-2xl px-4 py-2.5">
          <div class="flex flex-col">
            <span class="text-[10px] font-bold text-slate-500">إجمالي الردود</span>
            <span class="text-base font-black text-white font-mono">{{ Number(form.mode === 'ai' ? stats.ai_total_replies : stats.total_replies).toLocaleString() }}</span>
          </div>
        </div>
        <div class="flex items-center gap-3 bg-slate-800/60 border border-slate-700/80 rounded-2xl px-4 py-2.5">
          <div class="text-right">
            <span class="text-xs font-black text-white block">حالة الرد التلقائي</span>
            <span class="text-[10px] font-bold" :class="form.is_enabled ? 'text-emerald-400' : 'text-slate-500'">
              {{ form.is_enabled ? 'مفعّل ويعمل الآن' : 'متوقف حالياً' }}
            </span>
          </div>
          <button type="button" @click="toggleAutoReply"
            class="relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none"
            :class="form.is_enabled ? 'bg-emerald-500' : 'bg-slate-600'" role="switch" :aria-checked="form.is_enabled">
            <span class="pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md transition duration-200"
              :class="form.is_enabled ? '-translate-x-7' : 'translate-x-0'" />
          </button>
        </div>
      </div>
    </div>

    <!-- Alerts -->
    <div v-if="successMessage" class="px-5 py-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm font-bold flex items-center justify-between">
      <span>{{ successMessage }}</span>
      <button @click="successMessage = ''" class="text-emerald-500 hover:text-emerald-300 p-1"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg></button>
    </div>
    <div v-if="errorMessage" class="px-5 py-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-bold flex items-center justify-between">
      <span>{{ errorMessage }}</span>
      <button @click="errorMessage = ''" class="text-red-500 hover:text-red-300 p-1"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg></button>
    </div>

    <div v-if="isLoading" class="p-16 text-center text-slate-400 text-sm">جاري التحميل...</div>

    <template v-else>
      <!-- Step 1: Device -->
      <div class="bg-slate-800/60 border border-slate-700/80 rounded-3xl p-5 md:p-7 space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-700/60 pb-4">
          <div>
            <h2 class="text-base font-black text-white flex items-center gap-2">
              <span class="w-6 h-6 rounded-lg bg-emerald-500/15 text-emerald-400 text-xs flex items-center justify-center font-black">1</span>
              اختر جهاز الواتساب
              <span class="text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md">{{ connectedSessions.length }} متصل</span>
            </h2>
            <p class="text-xs text-slate-500 mt-1">الرد التلقائي هيشتغل على الرسايل الواردة للجهاز المحدد</p>
          </div>
          <router-link to="/crm/devices" class="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-xl transition-colors self-start">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            ربط جهاز جديد
          </router-link>
        </div>

        <div v-if="sessions.length > 0" class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div v-for="s in sessions" :key="s.id" @click="s.status === 'connected' ? selectSession(s.id) : null"
            class="relative rounded-2xl p-4 border-2 transition-all flex items-center justify-between gap-3"
            :class="[
              form.session_id === s.id ? 'border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-500/10' : '',
              s.status === 'connected' ? (form.session_id !== s.id ? 'border-slate-700 hover:border-slate-500 bg-slate-800/40 cursor-pointer' : 'cursor-pointer') : 'border-slate-800 bg-slate-900/40 opacity-50 cursor-not-allowed'
            ]">
            <div class="flex items-center gap-3 min-w-0">
              <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                :class="s.status === 'connected' ? (form.session_id === s.id ? 'bg-emerald-500 text-white' : 'bg-emerald-500/15 text-emerald-400') : 'bg-slate-700 text-slate-500'">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
              </div>
              <div class="min-w-0">
                <div class="flex items-center gap-1.5">
                  <span class="text-sm font-black text-white truncate">{{ s.device_name || 'WhatsApp Device' }}</span>
                  <span v-if="s.status === 'connected'" class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0"></span>
                </div>
                <span class="text-xs font-bold text-slate-400 font-mono block" dir="ltr">{{ s.phone_number ? (s.phone_number.startsWith('+') ? s.phone_number : `+${s.phone_number}`) : '—' }}</span>
              </div>
            </div>
            <div class="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all"
              :class="form.session_id === s.id ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-600'">
              <svg v-if="form.session_id === s.id" class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>
            </div>
          </div>
        </div>
        <div v-else class="text-center py-8 px-4 bg-slate-900/40 rounded-2xl border border-dashed border-slate-700">
          <h3 class="text-sm font-black text-white mb-1">لا يوجد جهاز واتساب مربوط</h3>
          <p class="text-xs text-slate-500 mb-4">اربط جهازك أولاً من صفحة الأجهزة</p>
          <router-link to="/crm/devices" class="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-all">
            ربط جهاز الآن
          </router-link>
        </div>
      </div>

      <!-- Step 2: Mode -->
      <div class="bg-slate-800/60 border border-slate-700/80 rounded-3xl p-5 md:p-7 space-y-6">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-700/60 pb-5">
          <div>
            <h2 class="text-base font-black text-white flex items-center gap-2">
              <span class="w-6 h-6 rounded-lg bg-emerald-500/15 text-emerald-400 text-xs flex items-center justify-center font-black">2</span>
              طريقة الرد
            </h2>
            <p class="text-xs text-slate-500 mt-1">اختر بين الرد الذكي المخصص أو الرد الثابت السريع</p>
          </div>
          <div class="flex p-1 bg-slate-900/80 rounded-2xl self-start border border-slate-700/60">
            <button type="button" @click="form.mode = 'ai'"
              class="py-2 px-4 sm:px-6 rounded-xl text-xs font-black transition-all flex items-center gap-2"
              :class="form.mode === 'ai' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'">
              <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l2.4 7.2h7.6l-6 4.8 2.4 7.2-6-4.8-6 4.8 2.4-7.2-6-4.8h7.6z"/></svg>
              الرد بالذكاء الاصطناعي
            </button>
            <button type="button" @click="form.mode = 'static'"
              class="py-2 px-4 sm:px-6 rounded-xl text-xs font-black transition-all"
              :class="form.mode === 'static' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-white'">
              الرد الثابت
            </button>
          </div>
        </div>

        <!-- AI MODE -->
        <div v-if="form.mode === 'ai'" class="space-y-6">
          <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div class="lg:col-span-7 space-y-5">
              <div class="space-y-2">
                <div class="flex items-center justify-between">
                  <label class="text-xs font-black text-white flex items-center gap-1.5">
                    <svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                    تعليمات الذكاء الاصطناعي (System Prompt)
                  </label>
                  <span class="text-[11px] font-mono text-slate-500">{{ form.ai_system_prompt.length }} / 8000</span>
                </div>
                <textarea v-model="form.ai_system_prompt" rows="6"
                  placeholder="مثال: أنت موظف خدمة عملاء في شركتنا. رد على استفسارات العملاء بشكل ودود ومختصر..."
                  class="w-full bg-slate-900/80 border border-slate-700 rounded-2xl p-4 text-white font-medium text-xs sm:text-sm placeholder-slate-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all outline-none resize-none leading-relaxed"></textarea>
                <div class="flex items-center gap-2 flex-wrap pt-1">
                  <span class="text-[11px] font-bold text-slate-500">نماذج سريعة:</span>
                  <button type="button" @click="applyTemplate('support')" class="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors">خدمة عملاء</button>
                  <button type="button" @click="applyTemplate('sales')" class="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-slate-700/60 text-slate-300 hover:bg-slate-700 transition-colors">مبيعات</button>
                  <button type="button" @click="applyTemplate('brief')" class="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-slate-700/60 text-slate-300 hover:bg-slate-700 transition-colors">مختصر</button>
                </div>
              </div>

              <div class="space-y-2">
                <div class="flex items-center justify-between">
                  <label class="text-xs font-black text-white flex items-center gap-1.5">
                    <svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"/></svg>
                    معلومات النشاط التجاري (Business Info)
                  </label>
                  <span class="text-[11px] font-mono text-slate-500">{{ form.ai_business_info.length }} / 8000</span>
                </div>
                <textarea v-model="form.ai_business_info" rows="6"
                  placeholder="اكتب هنا كل المعلومات عن منتجاتك وخدماتك وأسعارك عشان الـ AI يستخدمها في الرد..."
                  class="w-full bg-slate-900/80 border border-slate-700 rounded-2xl p-4 text-white font-medium text-xs sm:text-sm placeholder-slate-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all outline-none resize-none leading-relaxed"></textarea>
              </div>
            </div>

            <div class="lg:col-span-5 space-y-4">
              <div class="bg-slate-900/60 border border-slate-700/60 rounded-2xl p-5 space-y-4">
                <h3 class="text-xs font-black text-white flex items-center gap-2 border-b border-slate-700/60 pb-3">
                  <svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"/></svg>
                  تخصيص الذكاء الاصطناعي
                </h3>

                <div class="space-y-1.5">
                  <label class="text-[11px] font-black text-slate-300 block">نموذج الـ AI</label>
                  <select v-model="form.ai_model" class="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-xs font-bold text-white focus:border-emerald-500 outline-none">
                    <option value="google/gemini-2.5-flash">Gemini 2.5 Flash (موصى به — سريع)</option>
                    <option value="google/gemma-4-31b-it:free">Gemma 4 31B IT (مجاني)</option>
                    <option value="google/gemma-4-26b-a4b-it:free">Gemma 4 26B A4B IT (مجاني)</option>
                    <option value="nvidia/nemotron-3-super-120b-a12b:free">Nemotron 3 Super 120B (مجاني)</option>
                    <option value="nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free">Nemotron 3 Nano (مجاني)</option>
                  </select>
                </div>

                <div class="grid grid-cols-2 gap-3">
                  <div class="space-y-1.5">
                    <label class="text-[11px] font-black text-slate-300 block">نبرة الرد</label>
                    <select v-model="form.ai_tone" class="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-xs font-bold text-white focus:border-emerald-500 outline-none">
                      <option value="friendly">ودود</option>
                      <option value="professional">احترافي</option>
                      <option value="brief">مختصر</option>
                      <option value="formal">رسمي</option>
                    </select>
                  </div>
                  <div class="space-y-1.5">
                    <label class="text-[11px] font-black text-slate-300 block">لغة الرد</label>
                    <select v-model="form.ai_language" class="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-xs font-bold text-white focus:border-emerald-500 outline-none">
                      <option value="auto">تلقائي (نفس لغة العميل)</option>
                      <option value="arabic">عربي فصحى</option>
                      <option value="egyptian">عامية مصرية</option>
                      <option value="english">English</option>
                    </select>
                  </div>
                </div>

                <div class="grid grid-cols-2 gap-3">
                  <div class="space-y-1.5">
                    <label class="text-[11px] font-black text-slate-300 block">ذاكرة المحادثة</label>
                    <select v-model="form.ai_context_limit" class="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-xs font-bold text-white focus:border-emerald-500 outline-none">
                      <option :value="5">5 رسائل</option>
                      <option :value="10">10 رسائل</option>
                      <option :value="15">15 رسالة</option>
                      <option :value="20">20 رسالة</option>
                    </select>
                  </div>
                  <div class="space-y-1.5">
                    <label class="text-[11px] font-black text-slate-300 block">حد يومي (0 = بلا)</label>
                    <input v-model.number="form.ai_max_daily_replies" type="number" min="0" max="10000" class="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-xs font-bold text-white focus:border-emerald-500 outline-none" />
                  </div>
                </div>

                <div class="space-y-1.5">
                  <label class="text-[11px] font-black text-slate-300 block">إيقاف مؤقت بعد رد بشري (دقائق)</label>
                  <input v-model.number="form.ai_handoff_minutes" type="number" min="0" max="1440" placeholder="0" class="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-xs font-bold text-white focus:border-emerald-500 outline-none" />
                  <span class="text-[10px] text-slate-500 font-medium block">لما أنت أو وكيل تردوا يدوياً، الـ AI بيسكت في المحادثة دي للمدة دي (0 = معطّل)</span>
                </div>
              </div>

              <div class="bg-slate-900/60 border border-slate-700/60 rounded-2xl p-4 space-y-3">
                <label class="text-xs font-black text-white cursor-pointer flex items-center gap-2">
                  <input v-model="form.ai_business_hours_enabled" type="checkbox" class="w-4 h-4 rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500" />
                  مواعيد العمل
                  <span v-if="form.ai_business_hours_enabled" class="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md mr-auto">مفعّل</span>
                </label>
                <div v-if="form.ai_business_hours_enabled" class="grid grid-cols-2 gap-3 pt-1">
                  <div class="space-y-1">
                    <label class="text-[10px] font-bold text-slate-500">من</label>
                    <input v-model="form.ai_business_hours_from" type="time" class="w-full bg-slate-800 border border-slate-700 rounded-xl p-2 text-xs font-bold text-white focus:border-emerald-500 outline-none" />
                  </div>
                  <div class="space-y-1">
                    <label class="text-[10px] font-bold text-slate-500">إلى</label>
                    <input v-model="form.ai_business_hours_to" type="time" class="w-full bg-slate-800 border border-slate-700 rounded-xl p-2 text-xs font-bold text-white focus:border-emerald-500 outline-none" />
                  </div>
                </div>
              </div>

              <div class="bg-slate-900/60 border border-slate-700/60 rounded-2xl p-4 space-y-3">
                <label class="text-xs font-black text-white cursor-pointer flex items-center gap-2">
                  <input v-model="form.ai_fallback_enabled" type="checkbox" class="w-4 h-4 rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500" />
                  رد احتياطي عند فشل الـ AI
                  <span v-if="form.ai_fallback_enabled" class="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md mr-auto">مفعّل</span>
                </label>
                <div v-if="form.ai_fallback_enabled" class="pt-1">
                  <textarea v-model="form.ai_fallback_message" rows="2"
                    placeholder="مثال: حدث خطأ مؤقت — سيقوم فريقنا بالرد عليك قريباً."
                    class="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-xs font-medium text-white placeholder-slate-500 focus:border-emerald-500 outline-none resize-none"></textarea>
                </div>
              </div>
            </div>
          </div>

          <!-- AI Test -->
          <div class="bg-emerald-500/5 border border-emerald-500/20 rounded-3xl p-5 md:p-6 space-y-4">
            <h3 class="text-sm font-black text-emerald-300 flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              جرّب الـ AI قبل التفعيل
            </h3>
            <p class="text-xs text-emerald-200/60 -mt-2">اكتب رسالة كأنك عميل وشوف إزاي البوت هيرد</p>
            <div class="flex flex-col sm:flex-row gap-3">
              <input v-model="aiTestMessage" @keyup.enter="testAI" placeholder="مثال: ما هي أسعاركم؟"
                class="flex-1 bg-slate-900/80 border border-slate-700 rounded-2xl p-3.5 text-xs sm:text-sm font-bold text-white placeholder-slate-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 outline-none" />
              <button type="button" @click="testAI" :disabled="aiTestLoading || !aiTestMessage.trim()"
                class="px-6 py-3.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-black rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-2 shrink-0">
                <svg v-if="aiTestLoading" class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                {{ aiTestLoading ? 'جاري التوليد...' : 'اختبار الرد' }}
              </button>
            </div>
            <div v-if="aiTestResult" class="bg-slate-900/60 border border-slate-700/60 rounded-2xl p-4 space-y-2">
              <span class="text-[10px] font-black text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> رد الـ AI
              </span>
              <div class="bg-emerald-900/30 text-emerald-50 rounded-2xl rounded-tr-none p-4 text-xs sm:text-sm font-medium leading-relaxed max-w-xl border border-emerald-700/40 whitespace-pre-line">
                {{ aiTestResult }}
              </div>
            </div>
          </div>
        </div>

        <!-- STATIC MODE -->
        <div v-else class="space-y-5">
          <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div class="lg:col-span-7 space-y-3">
              <div class="flex items-center justify-between">
                <label class="text-xs font-black text-white block">رسالة الرد التلقائي</label>
                <button type="button" @click="applyDefaultTemplate" class="text-emerald-400 hover:text-emerald-300 text-xs font-black underline transition-colors">استخدم النموذج الجاهز</button>
              </div>
              <textarea v-model="form.reply_message" rows="8"
                placeholder="اكتب رسالة الرد اللي هتتبعت تلقائياً لأي حد بيكلمك..."
                class="w-full bg-slate-900/80 border border-slate-700 rounded-2xl p-4 text-white font-medium text-xs sm:text-sm placeholder-slate-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all outline-none resize-none leading-relaxed"></textarea>
              <div class="flex items-center justify-between text-[11px] font-bold text-slate-500 px-1">
                <span>{{ form.reply_message.length }} حرف</span>
                <span>هتتبعت حرفياً لكل رسالة واردة</span>
              </div>
            </div>
            <div class="lg:col-span-5 flex flex-col">
              <span class="text-xs font-black text-white mb-3 block">معاينة شكل الرسالة</span>
              <div class="flex-1 bg-slate-900/60 border border-slate-700/60 rounded-2xl p-4 flex flex-col justify-between min-h-[220px]">
                <div class="space-y-3">
                  <div class="bg-slate-700/60 rounded-2xl rounded-tl-none p-3 max-w-[80%] text-xs text-slate-200">
                    <p class="font-medium">رسالة العميل الواردة</p>
                    <span class="text-[9px] text-slate-400 block text-left mt-1 font-mono">10:30 ص</span>
                  </div>
                  <div class="bg-emerald-900/40 rounded-2xl rounded-tr-none p-3 max-w-[85%] text-xs text-emerald-50 mr-auto whitespace-pre-line border border-emerald-700/40">
                    <p class="font-medium">{{ form.reply_message || 'اكتب نص الرسالة في المربع ليظهر هنا...' }}</p>
                    <span class="text-[9px] text-slate-400 block text-left mt-1 font-mono">10:30 ص ✓✓</span>
                  </div>
                </div>
                <div class="text-center pt-2">
                  <span class="text-[10px] font-bold text-slate-500">معاينة حية على WhatsApp</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Shared: reply once + delay -->
        <div class="border-t border-slate-700/60 pt-6 space-y-4">
          <div class="bg-slate-900/60 border border-slate-700/60 rounded-2xl p-4 flex items-center justify-between gap-4">
            <div>
              <span class="text-xs font-black text-white block">رد مرة واحدة فقط لكل محادثة</span>
              <span class="text-[11px] text-slate-500 font-medium block leading-relaxed">لو مفعّل، البوت يرد على أول رسالة بس من كل عميل — وبعدها يسكت في المحادثة دي</span>
            </div>
            <button type="button" @click="form.reply_once = !form.reply_once"
              class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none"
              :class="form.reply_once ? 'bg-emerald-500' : 'bg-slate-600'" role="switch">
              <span class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition duration-200"
                :class="form.reply_once ? '-translate-x-5' : 'translate-x-0'" />
            </button>
          </div>

          <div class="bg-slate-900/60 border border-slate-700/60 rounded-2xl p-4 space-y-3">
            <div>
              <span class="text-xs font-black text-white block">تأخير الرد</span>
              <span class="text-[11px] text-slate-500 font-medium block">تأخير بسيط قبل الإرسال عشان الرد يبان طبيعي (الـ AI بياخد وقته في التوليد أصلاً)</span>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button v-for="d in [0, 5, 10, 30]" :key="d" type="button" @click="form.delay_seconds = d"
                class="py-2.5 px-3 rounded-xl text-xs font-black transition-all border text-center"
                :class="form.delay_seconds === d ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'">
                {{ delayLabel(d) }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Step 3: Logs -->
      <div class="bg-slate-800/60 border border-slate-700/80 rounded-3xl p-5 md:p-7 space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-700/60 pb-4">
          <div>
            <h2 class="text-base font-black text-white flex items-center gap-2">
              <span class="w-6 h-6 rounded-lg bg-emerald-500/15 text-emerald-400 text-xs flex items-center justify-center font-black">3</span>
              سجل النشاط
            </h2>
            <p class="text-xs text-slate-500 mt-1">آخر الردود التلقائية اللي اتعملت أو اتخطّت</p>
          </div>
          <button type="button" @click="loadLogs" :disabled="logsLoading"
            class="inline-flex items-center gap-2 px-4 py-2 bg-slate-700/60 hover:bg-slate-700 border border-slate-600 text-slate-200 text-xs font-bold rounded-xl transition-all self-start">
            <svg class="w-3.5 h-3.5" :class="{ 'animate-spin': logsLoading }" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
            تحديث
          </button>
        </div>

        <div v-if="logs.length > 0" class="overflow-x-auto border border-slate-700/60 rounded-2xl">
          <table class="w-full text-xs divide-y divide-slate-800">
            <thead class="bg-slate-900/60 text-slate-500 font-bold text-[10px]">
              <tr>
                <th class="px-5 py-3.5 text-right">المرسل</th>
                <th class="px-5 py-3.5 text-right">الرسالة الواردة</th>
                <th class="px-5 py-3.5 text-right">الرد التلقائي</th>
                <th class="px-5 py-3.5 text-right">الحالة</th>
                <th class="px-5 py-3.5 text-right">الوقت</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-800/60">
              <tr v-for="log in logs" :key="log.id" class="hover:bg-slate-800/40 transition-colors">
                <td class="px-5 py-4 whitespace-nowrap">
                  <div class="flex items-center gap-2">
                    <div class="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                    </div>
                    <div>
                      <span class="font-mono font-bold text-white block" dir="ltr">{{ formatPhone(log.sender_phone) }}</span>
                      <span v-if="log.sender_name" class="text-[10px] text-slate-500 block">{{ log.sender_name }}</span>
                    </div>
                  </div>
                </td>
                <td class="px-5 py-4 max-w-xs"><p class="text-slate-300 font-medium truncate" :title="log.incoming_message">{{ log.incoming_message || '—' }}</p></td>
                <td class="px-5 py-4 max-w-xs"><p class="text-slate-400 font-medium truncate" :title="log.reply_message">{{ log.reply_message || '—' }}</p></td>
                <td class="px-5 py-4 whitespace-nowrap">
                  <div class="space-y-0.5">
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-black" :class="getStatusBadgeClass(log.status)">
                      <span class="w-1.5 h-1.5 rounded-full" :class="getStatusDotClass(log.status)"></span>
                      {{ getStatusLabel(log.status) }}
                    </span>
                    <span v-if="log.status_reason" class="text-[10px] text-slate-500 block max-w-xs truncate" :title="log.status_reason">{{ log.status_reason }}</span>
                  </div>
                </td>
                <td class="px-5 py-4 whitespace-nowrap text-slate-500 font-mono text-[11px]" dir="ltr">{{ formatDate(log.created_at) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else-if="!logsLoading" class="text-center py-10 px-4 bg-slate-900/40 rounded-2xl border border-dashed border-slate-700">
          <h3 class="text-sm font-black text-white mb-1">لا يوجد نشاط بعد</h3>
          <p class="text-xs text-slate-500 max-w-md mx-auto">أول رد تلقائي هيظهر هنا — فعّل الميزة واستنى أول رسالة من عميل</p>
        </div>
      </div>
    </template>

    <!-- Sticky save bar -->
    <div class="fixed bottom-4 left-4 right-4 md:right-[280px] z-40 bg-slate-900/95 backdrop-blur-md border border-slate-700 rounded-2xl p-4 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
      <div class="flex items-center gap-3">
        <div class="w-3 h-3 rounded-full shrink-0" :class="form.is_enabled ? 'bg-emerald-400 animate-ping' : 'bg-slate-600'"></div>
        <div>
          <span class="text-xs font-black text-white block">
            {{ form.is_enabled ? `الرد ${form.mode === 'ai' ? 'بالذكاء الاصطناعي' : 'الثابت'} مفعّل` : 'الرد التلقائي غير مفعّل' }}
          </span>
          <span class="text-[11px] font-mono text-slate-500 block">
            الجهاز: {{ selectedSession?.phone_number || 'لم يتم تحديد جهاز' }}
          </span>
        </div>
      </div>
      <button type="button" @click="saveSettings" :disabled="isSaving"
        class="w-full sm:w-auto px-8 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black rounded-xl transition-all shadow-lg active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2">
        <svg v-if="isSaving" class="animate-spin h-4 w-4 text-slate-950" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>
        {{ isSaving ? 'جاري الحفظ...' : 'حفظ الإعدادات' }}
      </button>
    </div>
  </div>
</template>

<script>
import { ref, reactive, computed, onMounted } from 'vue';
import crm from '@/services/crm';

export default {
  name: 'CrmAutoReply',
  setup() {
    const isLoading = ref(true);
    const isSaving = ref(false);
    const logsLoading = ref(false);
    const successMessage = ref('');
    const errorMessage = ref('');
    const aiTestMessage = ref('');
    const aiTestLoading = ref(false);
    const aiTestResult = ref('');

    const sessions = ref([]);
    const logs = ref([]);
    const stats = reactive({
      total_replies: 0,
      last_reply_at: null,
      ai_total_replies: 0,
      ai_last_reply_at: null,
    });

    const form = reactive({
      is_enabled: false,
      session_id: null,
      mode: 'ai',
      reply_message: '',
      reply_once: false,
      delay_seconds: 0,
      ai_system_prompt: '',
      ai_business_info: '',
      ai_tone: 'friendly',
      ai_language: 'auto',
      ai_context_limit: 10,
      ai_fallback_enabled: false,
      ai_fallback_message: '',
      ai_max_daily_replies: 0,
      ai_business_hours_enabled: false,
      ai_business_hours_from: '09:00',
      ai_business_hours_to: '22:00',
      ai_model: 'google/gemini-2.5-flash',
      ai_handoff_minutes: 0,
    });

    const connectedSessions = computed(() => sessions.value.filter((s) => s.status === 'connected'));
    const selectedSession = computed(() => sessions.value.find((s) => s.id === form.session_id) || null);

    const defaultExample = `أهلاً بك 👋\nشكراً لتواصلك معنا.\nوصلتنا رسالتك وسنقوم بالرد عليك في أقرب وقت.`;

    const applyDefaultTemplate = () => {
      form.reply_message = defaultExample;
    };

    const applyTemplate = (type) => {
      if (type === 'support') {
        form.ai_system_prompt = `أنت موظف خدمة عملاء في شركتنا. مهمتك مساعدة العملاء عبر WhatsApp بإجابات واضحة ومختصرة وودودة.\n- رد دائمًا بنفس لغة العميل.\n- استخدم فقط المعلومات الموجودة في بيانات النشاط التجاري.\n- إذا تعذر عليك الإجابة، أخبر العميل أنه سيتم تحويله لموظف للمساعدة.`;
      } else if (type === 'sales') {
        form.ai_system_prompt = `أنت مسؤول المبيعات وخدمة العملاء. رحب بالعميل بحرارة، واعرض خدماتنا أو منتجاتنا بإيجاز، وشجعه على الشراء أو الاشتراك.`;
      } else if (type === 'brief') {
        form.ai_system_prompt = `أنت مساعد واتساب ذكي ومختصر جداً. قدم إجابات مباشرة بدون إطالة ولا تتعدى 2 إلى 3 جمل.`;
      }
    };

    const delayLabel = (d) => {
      return { 0: 'فوراً', 5: '5 ثواني', 10: '10 ثواني', 30: '30 ثانية' }[d] ?? `${d}`;
    };

    const selectSession = (id) => {
      form.session_id = id;
    };

    const toggleAutoReply = () => {
      form.is_enabled = !form.is_enabled;
      if (form.is_enabled && !form.session_id && connectedSessions.value.length > 0) {
        form.session_id = connectedSessions.value[0].id;
      }
      if (form.is_enabled && form.mode === 'static' && !form.reply_message.trim()) {
        form.reply_message = defaultExample;
      }
      if (form.is_enabled && form.mode === 'ai' && !form.ai_system_prompt.trim()) {
        applyTemplate('support');
      }
    };

    const loadSettings = async () => {
      try {
        isLoading.value = true;
        errorMessage.value = '';
        const response = (await crm.client().get('/auto-reply')).data;
        if (response.success && response.data) {
          sessions.value = response.data.sessions || [];
          const autoReply = response.data.auto_reply;

          if (autoReply) {
            form.is_enabled = Boolean(autoReply.is_enabled);
            form.session_id = autoReply.session_id;
            form.mode = autoReply.mode || 'ai';
            form.reply_message = autoReply.reply_message || '';
            form.reply_once = Boolean(autoReply.reply_once);
            form.delay_seconds = Number(autoReply.delay_seconds || 0);
            form.ai_system_prompt = autoReply.ai_system_prompt || '';
            form.ai_business_info = autoReply.ai_business_info || '';
            form.ai_tone = autoReply.ai_tone || 'friendly';
            form.ai_language = autoReply.ai_language || 'auto';
            form.ai_context_limit = Number(autoReply.ai_context_limit || 10);
            form.ai_fallback_enabled = Boolean(autoReply.ai_fallback_enabled);
            form.ai_fallback_message = autoReply.ai_fallback_message || '';
            form.ai_max_daily_replies = Number(autoReply.ai_max_daily_replies || 0);
            form.ai_business_hours_enabled = Boolean(autoReply.ai_business_hours_enabled);
            form.ai_business_hours_from = autoReply.ai_business_hours_from || '09:00';
            form.ai_business_hours_to = autoReply.ai_business_hours_to || '22:00';
            form.ai_model = autoReply.ai_model || 'google/gemini-2.5-flash';
            form.ai_handoff_minutes = Number(autoReply.ai_handoff_minutes || 0);

            stats.total_replies = autoReply.total_replies_sent || 0;
            stats.last_reply_at = autoReply.last_reply_at;
            stats.ai_total_replies = autoReply.ai_total_replies_sent || 0;
            stats.ai_last_reply_at = autoReply.ai_last_reply_at;
          } else if (connectedSessions.value.length > 0) {
            form.session_id = connectedSessions.value[0].id;
          }
        }
      } catch (err) {
        console.error('Failed to load auto reply settings:', err);
        errorMessage.value = err.response?.data?.message || 'فشل في تحميل إعدادات الرد التلقائي.';
      } finally {
        isLoading.value = false;
      }
    };

    const loadLogs = async () => {
      try {
        logsLoading.value = true;
        const response = (await crm.client().get('/auto-reply/logs')).data;
        if (response.success && response.data) {
          logs.value = response.data.data || [];
        }
      } catch (err) {
        console.error('Failed to load auto reply logs:', err);
      } finally {
        logsLoading.value = false;
      }
    };

    const saveSettings = async () => {
      try {
        errorMessage.value = '';
        successMessage.value = '';

        if (form.is_enabled) {
          if (!form.session_id) {
            errorMessage.value = 'يرجى اختيار جهاز WhatsApp متصل.';
            return;
          }
          const target = sessions.value.find((s) => s.id === form.session_id);
          if (!target || target.status !== 'connected') {
            errorMessage.value = 'لا يمكن التفعيل على جهاز غير متصل.';
            return;
          }
          if (form.mode === 'static' && !form.reply_message.trim()) {
            errorMessage.value = 'يرجى كتابة رسالة الرد الثابت.';
            return;
          }
          if (form.mode === 'ai' && !form.ai_system_prompt.trim()) {
            errorMessage.value = 'يرجى كتابة تعليمات AI.';
            return;
          }
        }

        isSaving.value = true;
        const response = (await crm.client().post('/auto-reply', { ...form })).data;
        if (response.success) {
          successMessage.value = 'تم حفظ إعدادات الرد التلقائي بنجاح.';
          if (response.data?.auto_reply) {
            stats.total_replies = response.data.auto_reply.total_replies_sent || 0;
            stats.ai_total_replies = response.data.auto_reply.ai_total_replies_sent || 0;
          }
          loadLogs();
        } else {
          errorMessage.value = response.message || 'حدث خطأ أثناء حفظ الإعدادات.';
        }
      } catch (err) {
        console.error('Failed to save auto reply settings:', err);
        errorMessage.value = err.response?.data?.message || 'حدث خطأ أثناء حفظ الإعدادات.';
      } finally {
        isSaving.value = false;
      }
    };

    const testAI = async () => {
      if (!aiTestMessage.value.trim()) return;
      try {
        aiTestLoading.value = true;
        aiTestResult.value = '';
        const response = (await crm.client().post('/auto-reply/test-ai', {
          test_message: aiTestMessage.value,
          session_id: form.session_id,
        })).data;
        if (response.success && response.data) {
          aiTestResult.value = response.data.reply;
        } else {
          errorMessage.value = response.message || 'فشل اختبار AI.';
        }
      } catch (err) {
        errorMessage.value = err.response?.data?.message || 'فشل اختبار AI.';
      } finally {
        aiTestLoading.value = false;
      }
    };

    const getStatusLabel = (status) => {
      const labels = {
        sent: 'تم الإرسال',
        queued: 'في الانتظار',
        failed: 'فشل',
        cooldown: 'فترة تهدئة',
        reply_once_skipped: 'اتخطّت (رد مرة واحدة)',
        disabled: 'معطّل',
        ai_pending: 'AI قيد الانتظار',
        processing: 'جاري المعالجة',
        blocked: 'محظور',
      };
      return labels[status] || status;
    };

    const getStatusBadgeClass = (status) => {
      switch (status) {
        case 'sent': return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30';
        case 'queued': return 'bg-blue-500/10 text-blue-400 border border-blue-500/30';
        case 'failed':
        case 'ai_failed': return 'bg-red-500/10 text-red-400 border border-red-500/30';
        case 'cooldown': return 'bg-amber-500/10 text-amber-400 border border-amber-500/30';
        case 'reply_once_skipped': return 'bg-purple-500/10 text-purple-400 border border-purple-500/30';
        case 'ai_pending':
        case 'processing': return 'bg-sky-500/10 text-sky-400 border border-sky-500/30';
        default: return 'bg-slate-700/60 text-slate-300 border border-slate-600';
      }
    };

    const getStatusDotClass = (status) => {
      switch (status) {
        case 'sent': return 'bg-emerald-400';
        case 'queued': return 'bg-blue-400 animate-pulse';
        case 'failed':
        case 'ai_failed': return 'bg-red-400';
        case 'cooldown': return 'bg-amber-400';
        case 'reply_once_skipped': return 'bg-purple-400';
        case 'ai_pending':
        case 'processing': return 'bg-sky-400 animate-pulse';
        default: return 'bg-slate-500';
      }
    };

    const formatDate = (dateStr) => {
      if (!dateStr) return '—';
      try {
        const d = new Date(dateStr);
        return d.toLocaleString('ar-EG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
      } catch (e) {
        return dateStr;
      }
    };

    const formatPhone = (phone) => {
      if (!phone) return '—';
      const digits = String(phone).replace(/\D/g, '');
      if (/^20\d{10,11}$/.test(digits)) {
        return '0' + digits.slice(2);
      }
      return phone;
    };

    onMounted(() => {
      loadSettings();
      loadLogs();
    });

    return {
      isLoading,
      isSaving,
      logsLoading,
      successMessage,
      errorMessage,
      sessions,
      connectedSessions,
      selectedSession,
      logs,
      stats,
      form,
      aiTestMessage,
      aiTestLoading,
      aiTestResult,
      selectSession,
      toggleAutoReply,
      applyDefaultTemplate,
      applyTemplate,
      delayLabel,
      saveSettings,
      loadLogs,
      testAI,
      getStatusLabel,
      getStatusBadgeClass,
      getStatusDotClass,
      formatDate,
      formatPhone,
    };
  },
};
</script>
