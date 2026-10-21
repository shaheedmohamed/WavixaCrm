<template>
  <div
    class="min-h-screen bg-[#070b14] text-slate-100 font-sans selection:bg-emerald-500/25 selection:text-emerald-300 overflow-x-hidden w-full max-w-[100vw]"
    :dir="isRTL ? 'rtl' : 'ltr'"
  >
    <!-- Top Bar / Navigation -->
    <header
      :class="[
        'sticky top-0 z-40 transition-all duration-200 border-b backdrop-blur-md',
        scrolled
          ? 'bg-[#070b14]/95 border-slate-800/90 py-2.5 shadow-xl shadow-black/40'
          : 'bg-[#070b14]/80 border-slate-800/50 py-3'
      ]"
    >
      <div class="max-w-6xl mx-auto px-3 sm:px-6 flex items-center justify-between gap-2">
        <!-- Brand / Return -->
        <div class="flex items-center gap-2.5 min-w-0">
          <router-link :to="crmAuth ? '/crm/dashboard' : '/crm/login'" class="flex items-center gap-2 group min-w-0">
            <div class="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center p-1.5 shrink-0 group-hover:border-emerald-500/60 transition-colors">
              <MessageSquare class="w-4 h-4 text-emerald-400" />
            </div>
            <div class="min-w-0 flex flex-col">
              <span class="text-sm sm:text-base font-black tracking-tight text-white leading-none truncate">
                Wavixa <span class="text-emerald-400">CRM</span>
              </span>
              <span class="text-[9px] text-slate-400 font-semibold truncate">باقات واتساب متعدد الوكلاء</span>
            </div>
          </router-link>
        </div>

        <!-- Quick actions -->
        <div class="flex items-center gap-2 shrink-0">
          <router-link
            v-if="crmAuth"
            to="/crm/dashboard"
            class="px-2.5 sm:px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-slate-200 transition-colors"
          >
            العودة للوحة التحكم
          </router-link>
          <router-link
            v-else
            to="/crm/login"
            class="px-2.5 sm:px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-slate-200 transition-colors"
          >
            تسجيل الدخول
          </router-link>

          <a
            href="https://wa.me/201024520482"
            target="_blank"
            rel="noopener"
            class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black transition-all shadow-md shadow-emerald-500/20 active:scale-95"
          >
            <Headphones class="w-3.5 h-3.5" />
            <span class="hidden xs:inline">المبيعات</span>
          </a>
        </div>
      </div>
    </header>

    <main class="max-w-6xl mx-auto px-3 sm:px-6 pt-5 pb-16 sm:pb-24">
      <!-- HERO -->
      <section class="text-center mb-6 sm:mb-8">
        <div class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[11px] font-black text-emerald-400 mb-2">
          <Sparkles class="w-3.5 h-3.5" />
          <span>باقات Multi-Agent WhatsApp CRM</span>
        </div>
        <h1 class="text-xl sm:text-3xl lg:text-4xl font-black text-white tracking-tight leading-tight mb-2">
          اختر الباقة المناسبة لفريق مبيعاتك وخدمة عملائك
        </h1>
        <p class="text-xs sm:text-sm text-slate-300 max-w-2xl mx-auto leading-relaxed">
          أدِر جميع أرقام الواتساب وموظفي خدمة العملاء من منصة سحابية واحدة. باقات مرنة تشمل الأجهزة والوكلاء والرسائل، مع إمكانية التوسّع الفوري بإضافات حسب احتياجك.
        </p>

        <!-- Current User Status Banner (if logged in) -->
        <div
          v-if="currentSubscription"
          class="mt-4 max-w-xl mx-auto p-3 rounded-xl bg-slate-900/90 border border-emerald-500/30 flex items-center justify-between text-xs text-right gap-3"
        >
          <div class="min-w-0">
            <div class="flex items-center gap-1.5 font-bold text-white mb-0.5">
              <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>باقتك الحالية: {{ currentSubscription.plan_name }}</span>
            </div>
            <p class="text-[11px] text-slate-400 truncate">
              الأجهزة: {{ currentSubscription.devices_used }}/{{ currentSubscription.devices_limit }} • الوكلاء: {{ currentSubscription.agents_used }}/{{ currentSubscription.agents_limit }} • الرسائل: {{ formatNumber(currentSubscription.messages_used_this_month) }}/{{ formatNumber(currentSubscription.monthly_messages_limit) }}
            </p>
          </div>
          <span class="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-[10px] font-black shrink-0">
            {{ currentSubscription.is_active ? 'نشطة' : 'منتهية' }}
          </span>
        </div>
      </section>

      <!-- BILLING INTERVAL TOGGLE (Monthly / Yearly) -->
      <section class="flex flex-col items-center justify-center mb-6 sm:mb-8">
        <div class="p-1 bg-slate-900/90 border border-slate-800 rounded-2xl flex items-center gap-1 shadow-lg max-w-xs w-full">
          <button
            type="button"
            @click="billingCycle = 'monthly'"
            :class="[
              'flex-1 py-2 px-3 rounded-xl text-xs font-black transition-all cursor-pointer text-center',
              billingCycle === 'monthly'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white'
            ]"
          >
            دفع شهري
          </button>
          <button
            type="button"
            @click="billingCycle = 'yearly'"
            :class="[
              'flex-1 py-2 px-3 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1',
              billingCycle === 'yearly'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white'
            ]"
          >
            <span>دفع سنوي</span>
            <span class="text-[9px] font-black px-1.5 py-0.2 rounded-full" :class="billingCycle === 'yearly' ? 'bg-slate-950/30 text-slate-950' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'">
              وفّر شهرين
            </span>
          </button>
        </div>
        <span class="text-[11px] text-emerald-400/90 font-semibold mt-2">
          {{ billingCycle === 'yearly' ? '⚡ الدفع السنوي يعادل 10 أشهر فقط (شهران مجاناً بالكامل)' : 'يمكنك التبديل إلى السنوي لتوفير شهرين مجاناً' }}
        </span>
      </section>

      <!-- PRICING CARDS -->
      <!-- Mobile: single column compact cards with uniform height and rhythm -->
      <!-- Desktop: 3 core cards + balanced Enterprise -->
      <section class="mb-10 sm:mb-14">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3.5 sm:gap-5 items-stretch mb-4">
          <!-- CARD 1: Starter -->
          <div class="pricing-card rounded-2xl p-4 sm:p-5 bg-slate-900/80 border border-slate-800 hover:border-slate-700 flex flex-col justify-between transition-all">
            <div>
              <div class="flex items-center justify-between mb-1">
                <h3 class="text-base sm:text-lg font-black text-white">Starter</h3>
                <span class="text-[10px] font-bold text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-md">للمشروعات الصغيرة</span>
              </div>
              <p class="text-xs text-slate-400 mb-3 leading-snug min-h-[32px]">
                مثالية للأفراد والصيدليات والمتاجر المبتدئة لإدارة محادثات الواتساب.
              </p>

              <!-- Price Box -->
              <div class="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 mb-3.5">
                <div class="flex items-baseline gap-1.5">
                  <span class="text-2xl sm:text-3xl font-black text-white font-mono">
                    {{ billingCycle === 'yearly' ? '$290' : '$29' }}
                  </span>
                  <span class="text-xs text-slate-400 font-semibold">
                    {{ billingCycle === 'yearly' ? '/ سنة' : '/ شهر' }}
                  </span>
                </div>
                <div class="text-[11px] text-emerald-400 font-semibold mt-0.5">
                  {{ billingCycle === 'yearly' ? 'ما يعادل $24.16 / شهر' : 'تجديد شهري مرن' }}
                </div>
              </div>

              <!-- Compact Limits Grid -->
              <div class="grid grid-cols-3 gap-1.5 p-2 rounded-xl bg-slate-800/40 border border-slate-800/60 mb-3.5 text-center">
                <div class="p-1">
                  <span class="block text-xs font-black text-white font-mono">1</span>
                  <span class="text-[10px] text-slate-400">جهاز واتساب</span>
                </div>
                <div class="p-1 border-x border-slate-700/50">
                  <span class="block text-xs font-black text-white font-mono">2</span>
                  <span class="text-[10px] text-slate-400">وكلاء CRM</span>
                </div>
                <div class="p-1">
                  <span class="block text-xs font-black text-white font-mono">5,000</span>
                  <span class="text-[10px] text-slate-400">رسالة / شهر</span>
                </div>
              </div>

              <!-- Feature bullet list -->
              <ul class="space-y-1.5 text-xs text-slate-300 mb-4">
                <li class="flex items-center gap-2">
                  <Check class="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>صندوق وارد موحد لمحادثات واتساب</span>
                </li>
                <li class="flex items-center gap-2">
                  <Check class="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>تحويل المحادثات بين الوكلاء</span>
                </li>
                <li class="flex items-center gap-2">
                  <Check class="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>ردود سريعة وملاحظات داخلية</span>
                </li>
                <li class="flex items-center gap-2">
                  <Check class="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>دعم فني عبر البريد والواتساب</span>
                </li>
              </ul>
            </div>

            <!-- Action -->
            <button
              type="button"
              :disabled="loadingPlan === 'crm-starter'"
              @click="handleSelectPlan('starter')"
              class="w-full py-2.5 rounded-xl text-xs font-black transition-all bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 active:scale-98 cursor-pointer text-center"
            >
              <span v-if="loadingPlan === 'crm-starter'">جاري المعالجة...</span>
              <span v-else>{{ isCurrentPlan('crm-starter') ? 'باقتك الحالية' : 'اختيار باقة Starter' }}</span>
            </button>
          </div>

          <!-- CARD 2: Growth (Recommended / Most Popular) -->
          <div class="pricing-card relative rounded-2xl p-4 sm:p-5 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border-2 border-emerald-500 shadow-xl shadow-emerald-500/10 flex flex-col justify-between transition-all">
            <!-- Badge -->
            <div class="absolute -top-3 right-1/2 translate-x-1/2 bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 text-[10px] font-black px-3 py-0.5 rounded-full uppercase shadow-md flex items-center gap-1 whitespace-nowrap">
              <Sparkles class="w-3 h-3 fill-slate-950" />
              <span>الأكثر طلباً • Most Popular</span>
            </div>

            <div>
              <div class="flex items-center justify-between mb-1 pt-1">
                <h3 class="text-base sm:text-lg font-black text-white">Growth</h3>
                <span class="text-[10px] font-extrabold text-emerald-400 bg-emerald-500/20 border border-emerald-500/30 px-2 py-0.5 rounded-md">موصى بها</span>
              </div>
              <p class="text-xs text-slate-300 mb-3 leading-snug min-h-[32px]">
                للمتاجر والشركات المتنامية لإدارة أرقام واتساب متعددة وفريق عمل متكامل.
              </p>

              <!-- Price Box -->
              <div class="p-3 rounded-xl bg-slate-950/80 border border-emerald-500/30 mb-3.5">
                <div class="flex items-baseline gap-1.5">
                  <span class="text-2xl sm:text-3xl font-black text-white font-mono">
                    {{ billingCycle === 'yearly' ? '$790' : '$79' }}
                  </span>
                  <span class="text-xs text-slate-400 font-semibold">
                    {{ billingCycle === 'yearly' ? '/ سنة' : '/ شهر' }}
                  </span>
                </div>
                <div class="text-[11px] text-emerald-400 font-semibold mt-0.5">
                  {{ billingCycle === 'yearly' ? 'ما يعادل $65.83 / شهر (وفّرت $158)' : 'الخيار الأفضل للفرق المتوسطة' }}
                </div>
              </div>

              <!-- Compact Limits Grid -->
              <div class="grid grid-cols-3 gap-1.5 p-2 rounded-xl bg-emerald-950/20 border border-emerald-500/30 mb-3.5 text-center">
                <div class="p-1">
                  <span class="block text-xs font-black text-emerald-300 font-mono">3</span>
                  <span class="text-[10px] text-slate-300">أجهزة واتساب</span>
                </div>
                <div class="p-1 border-x border-emerald-500/30">
                  <span class="block text-xs font-black text-emerald-300 font-mono">5</span>
                  <span class="text-[10px] text-slate-300">وكلاء CRM</span>
                </div>
                <div class="p-1">
                  <span class="block text-xs font-black text-emerald-300 font-mono">20,000</span>
                  <span class="text-[10px] text-slate-300">رسالة / شهر</span>
                </div>
              </div>

              <!-- Feature bullet list -->
              <ul class="space-y-1.5 text-xs text-slate-200 mb-4">
                <li class="flex items-center gap-2">
                  <Check class="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>3 أجهزة واتساب متزامنة لمختلف الأقسام</span>
                </li>
                <li class="flex items-center gap-2">
                  <Check class="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>5 وكلاء مع تقسيم المجموعات والأدوار</span>
                </li>
                <li class="flex items-center gap-2">
                  <Check class="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>تقارير أداء الوكلاء وسرعة الاستجابة</span>
                </li>
                <li class="flex items-center gap-2">
                  <Check class="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>الرد التلقائي الذكي وتوزيع المحادثات</span>
                </li>
                <li class="flex items-center gap-2">
                  <Check class="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>سجل تدقيق النشاط (Audit Log) ودعم 24/7</span>
                </li>
              </ul>
            </div>

            <!-- Action -->
            <button
              type="button"
              :disabled="loadingPlan === 'crm-growth'"
              @click="handleSelectPlan('growth')"
              class="w-full py-2.5 rounded-xl text-xs font-black transition-all bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 shadow-lg shadow-emerald-500/20 active:scale-98 cursor-pointer text-center"
            >
              <span v-if="loadingPlan === 'crm-growth'">جاري المعالجة...</span>
              <span v-else>{{ isCurrentPlan('crm-growth') ? 'باقتك الحالية' : 'ترقية إلى Growth' }}</span>
            </button>
          </div>

          <!-- CARD 3: Business -->
          <div class="pricing-card rounded-2xl p-4 sm:p-5 bg-slate-900/80 border border-slate-800 hover:border-slate-700 flex flex-col justify-between transition-all">
            <div>
              <div class="flex items-center justify-between mb-1">
                <h3 class="text-base sm:text-lg font-black text-white">Business</h3>
                <span class="text-[10px] font-bold text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-md">للشركات وسلاسل الفروع</span>
              </div>
              <p class="text-xs text-slate-400 mb-3 leading-snug min-h-[32px]">
                حل متكامل للشركات ذات حجم المحادثات الكبير وفرق الدعم الواسعة.
              </p>

              <!-- Price Box -->
              <div class="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 mb-3.5">
                <div class="flex items-baseline gap-1.5">
                  <span class="text-2xl sm:text-3xl font-black text-white font-mono">
                    {{ billingCycle === 'yearly' ? '$1,490' : '$149' }}
                  </span>
                  <span class="text-xs text-slate-400 font-semibold">
                    {{ billingCycle === 'yearly' ? '/ سنة' : '/ شهر' }}
                  </span>
                </div>
                <div class="text-[11px] text-emerald-400 font-semibold mt-0.5">
                  {{ billingCycle === 'yearly' ? 'ما يعادل $124.16 / شهر (وفّرت $298)' : 'حجم ضخم للمبيعات وخدمة العملاء' }}
                </div>
              </div>

              <!-- Compact Limits Grid -->
              <div class="grid grid-cols-3 gap-1.5 p-2 rounded-xl bg-slate-800/40 border border-slate-800/60 mb-3.5 text-center">
                <div class="p-1">
                  <span class="block text-xs font-black text-white font-mono">10</span>
                  <span class="text-[10px] text-slate-400">أجهزة واتساب</span>
                </div>
                <div class="p-1 border-x border-slate-700/50">
                  <span class="block text-xs font-black text-white font-mono">15</span>
                  <span class="text-[10px] text-slate-400">وكلاء CRM</span>
                </div>
                <div class="p-1">
                  <span class="block text-xs font-black text-white font-mono">60,000</span>
                  <span class="text-[10px] text-slate-400">رسالة / شهر</span>
                </div>
              </div>

              <!-- Feature bullet list -->
              <ul class="space-y-1.5 text-xs text-slate-300 mb-4">
                <li class="flex items-center gap-2">
                  <Check class="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>10 أجهزة واتساب متزامنة لكافة الفروع</span>
                </li>
                <li class="flex items-center gap-2">
                  <Check class="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>15 وكيل مع صلاحيات إدارية متقدمة</span>
                </li>
                <li class="flex items-center gap-2">
                  <Check class="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>توجيه ذكي حسب اللغة وتصنيف المحادثة</span>
                </li>
                <li class="flex items-center gap-2">
                  <Check class="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>API كامل وتكامل مع الـ Webhooks والـ CRM</span>
                </li>
                <li class="flex items-center gap-2">
                  <Check class="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>مدير حساب تنفيذي + دعم VIP بأولوية قصوى</span>
                </li>
              </ul>
            </div>

            <!-- Action -->
            <button
              type="button"
              :disabled="loadingPlan === 'crm-business'"
              @click="handleSelectPlan('business')"
              class="w-full py-2.5 rounded-xl text-xs font-black transition-all bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 active:scale-98 cursor-pointer text-center"
            >
              <span v-if="loadingPlan === 'crm-business'">جاري المعالجة...</span>
              <span v-else>{{ isCurrentPlan('crm-business') ? 'باقتك الحالية' : 'اختيار باقة Business' }}</span>
            </button>
          </div>
        </div>

        <!-- CARD 4: Enterprise (Balanced Wide Banner) -->
        <div class="rounded-2xl p-4 sm:p-6 bg-gradient-to-r from-slate-900 via-[#0c1427] to-slate-900 border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
          <div class="space-y-1 text-center md:text-right">
            <div class="flex items-center justify-center md:justify-start gap-2">
              <span class="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[10px] font-black border border-purple-500/30">Enterprise</span>
              <h4 class="text-base sm:text-lg font-black text-white">باقة المؤسسات المخصصة</h4>
            </div>
            <p class="text-xs text-slate-400 max-w-xl leading-relaxed">
              تحتاج أكثر من 10 أجهزة أو 15 وكيلاً أو خوادم معزولة بالكامل؟ نوفر لك حتى 100+ جهاز مع اتفاقية SLA مخصصة وتكامل خاص.
            </p>
            <div class="text-[11px] text-slate-300 font-semibold pt-1">
              يبدأ من <span class="text-emerald-400 font-black font-mono">{{ billingCycle === 'yearly' ? '$2,990 / سنة' : '$299 / شهر' }}</span> • عدد وكلاء وأجهزة حسب الاتفاق
            </div>
          </div>

          <a
            href="https://wa.me/201024520482?text=%D9%85%D8%B1%D8%AD%D8%A8%D8%A7%D9%8B%D8%8C%20%D8%A3%D8%B1%D8%BA%D8%A8%20%D9%81%D9%8A%20%D8%A7%D9%84%D8%A7%D8%B3%D8%AA%D9%81%D8%B3%D8%A7%D8%B1%20%D8%B9%D9%86%20%D8%A8%D8%A7%D9%82%D8%A9%20Enterprise%20%D9%84%D9%86%D8%B8%D8%A7%D9%85%20Wavixa%20CRM"
            target="_blank"
            rel="noopener"
            class="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 text-xs font-black transition-all flex items-center gap-2 shrink-0 active:scale-95"
          >
            <Headphones class="w-4 h-4 text-emerald-400" />
            <span>تواصل مع المبيعات</span>
          </a>
        </div>
      </section>

      <!-- SECTION 2: ADD-ONS (إضافات حسب احتياجك) -->
      <section class="mb-10 sm:mb-14">
        <div class="text-center mb-5">
          <div class="inline-flex items-center gap-1 text-[11px] font-black text-emerald-400 mb-1">
            <PlusCircle class="w-3.5 h-3.5" />
            <span>مرونة غير محدودة</span>
          </div>
          <h2 class="text-lg sm:text-2xl font-black text-white">إضافات حسب احتياجك (Add-ons)</h2>
          <p class="text-xs text-slate-400 max-w-lg mx-auto mt-1">
            لا داعي للترقية لباقة أعلى بالكامل إذا كنت تحتاج جهازاً أو وكيلاً واحداً فقط. يمكنك إضافة ما يلزمك فوراً.
          </p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          <!-- Addon 1: Device -->
          <div class="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 flex flex-col justify-between">
            <div>
              <div class="flex items-center justify-between mb-1.5">
                <span class="text-xs font-black text-white flex items-center gap-1.5">
                  <Smartphone class="w-4 h-4 text-emerald-400" />
                  جهاز واتساب إضافي
                </span>
                <span class="text-xs font-black text-emerald-400 font-mono">$12 / شهر</span>
              </div>
              <p class="text-[11px] text-slate-400 leading-relaxed mb-3">
                ربط رقم واتساب إضافي لنفس الحساب وتخصيصه لفرع أو قسم محدد.
              </p>
            </div>
            <button
              v-if="crmAuth"
              type="button"
              :disabled="loadingAddon === 'device'"
              @click="handleBuyAddon('extra_device', 1)"
              class="w-full py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
            >
              {{ loadingAddon === 'device' ? 'جاري الإضافة...' : '+ إضافة جهاز ($12)' }}
            </button>
            <span v-else class="text-[10px] text-slate-500 text-center block pt-1">متاح للشراء داخل الحساب</span>
          </div>

          <!-- Addon 2: Agent -->
          <div class="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 flex flex-col justify-between">
            <div>
              <div class="flex items-center justify-between mb-1.5">
                <span class="text-xs font-black text-white flex items-center gap-1.5">
                  <Users class="w-4 h-4 text-emerald-400" />
                  وكيل خدمة عملاء إضافي
                </span>
                <span class="text-xs font-black text-emerald-400 font-mono">$8 / شهر</span>
              </div>
              <p class="text-[11px] text-slate-400 leading-relaxed mb-3">
                إضافة موظف دعم إضافي بحساب مستقل وصلاحيات محددة لإدارة الشات.
              </p>
            </div>
            <button
              v-if="crmAuth"
              type="button"
              :disabled="loadingAddon === 'agent'"
              @click="handleBuyAddon('extra_agent', 1)"
              class="w-full py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
            >
              {{ loadingAddon === 'agent' ? 'جاري الإضافة...' : '+ إضافة وكيل ($8)' }}
            </button>
            <span v-else class="text-[10px] text-slate-500 text-center block pt-1">متاح للشراء داخل الحساب</span>
          </div>

          <!-- Addon 3: Messages packs -->
          <div class="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 flex flex-col justify-between">
            <div>
              <div class="flex items-center justify-between mb-1.5">
                <span class="text-xs font-black text-white flex items-center gap-1.5">
                  <Zap class="w-4 h-4 text-emerald-400" />
                  شحن رصيد رسائل إضافي
                </span>
                <span class="text-[10px] font-bold text-slate-400">خصم كميات</span>
              </div>
              <div class="space-y-1 mb-3 text-[11px]">
                <div class="flex justify-between items-center text-slate-300">
                  <span>1,000 رسالة</span>
                  <span class="font-mono text-white font-bold">$5</span>
                </div>
                <div class="flex justify-between items-center text-slate-300">
                  <span>10,000 رسالة</span>
                  <span class="font-mono text-emerald-400 font-bold">$40 <span class="text-[9px] text-slate-400">(وفر 20%)</span></span>
                </div>
                <div class="flex justify-between items-center text-slate-300">
                  <span>50,000 رسالة</span>
                  <span class="font-mono text-emerald-400 font-bold">$175 <span class="text-[9px] text-slate-400">(وفر 30%)</span></span>
                </div>
              </div>
            </div>
            <button
              v-if="crmAuth"
              type="button"
              :disabled="loadingAddon === 'messages'"
              @click="handleBuyAddon('extra_messages', 1, 'tier_10k')"
              class="w-full py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
            >
              {{ loadingAddon === 'messages' ? 'جاري الشحن...' : '+ شحن 10k رسالة ($40)' }}
            </button>
            <span v-else class="text-[10px] text-slate-500 text-center block pt-1">متاح للشراء داخل الحساب</span>
          </div>
        </div>
      </section>

      <!-- SECTION 3: INTERACTIVE PRICING CALCULATOR -->
      <section class="mb-10 sm:mb-14" id="calculator">
        <div class="text-center mb-5">
          <div class="inline-flex items-center gap-1 text-[11px] font-black text-emerald-400 mb-1">
            <Calculator class="w-3.5 h-3.5" />
            <span>حاسبة تفاعلية ذكية</span>
          </div>
          <h2 class="text-lg sm:text-2xl font-black text-white">احسب باقتك حسب احتياجك</h2>
          <p class="text-xs text-slate-400 max-w-lg mx-auto mt-1">
            حدد عدد الأجهزة والوكلاء والرسائل المطلوبة بدقة، وسنحسب لك أرخص تركيبة توفّر عليك وتغطي عملك بالكامل.
          </p>
        </div>

        <div class="p-4 sm:p-6 rounded-2xl bg-[#0a0f1d] border border-slate-800 grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
          <!-- Input Controls -->
          <div class="lg:col-span-7 space-y-4">
            <!-- Devices Slider -->
            <div>
              <div class="flex items-center justify-between text-xs mb-1.5">
                <span class="font-bold text-slate-300 flex items-center gap-1.5">
                  <Smartphone class="w-3.5 h-3.5 text-emerald-400" />
                  عدد أجهزة الواتساب (الأرقام)
                </span>
                <span class="font-mono text-emerald-400 font-black text-sm bg-slate-900 px-2.5 py-0.5 rounded-lg border border-slate-800">
                  {{ calcInput.devices }} {{ calcInput.devices === 1 ? 'جهاز' : 'أجهزة' }}
                </span>
              </div>
              <input
                type="range"
                v-model.number="calcInput.devices"
                min="1"
                max="25"
                class="w-full accent-emerald-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
              />
              <div class="flex justify-between text-[10px] text-slate-500 mt-1">
                <span>1 جهاز</span>
                <span>5</span>
                <span>10</span>
                <span>25 جهاز</span>
              </div>
            </div>

            <!-- Agents Slider -->
            <div>
              <div class="flex items-center justify-between text-xs mb-1.5">
                <span class="font-bold text-slate-300 flex items-center gap-1.5">
                  <Users class="w-3.5 h-3.5 text-emerald-400" />
                  عدد وكلاء وموظفي خدمة العملاء
                </span>
                <span class="font-mono text-emerald-400 font-black text-sm bg-slate-900 px-2.5 py-0.5 rounded-lg border border-slate-800">
                  {{ calcInput.agents }} {{ calcInput.agents === 1 ? 'وكيل' : 'وكلاء' }}
                </span>
              </div>
              <input
                type="range"
                v-model.number="calcInput.agents"
                min="1"
                max="40"
                class="w-full accent-emerald-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
              />
              <div class="flex justify-between text-[10px] text-slate-500 mt-1">
                <span>1 وكيل</span>
                <span>10</span>
                <span>20</span>
                <span>40 وكيل</span>
              </div>
            </div>

            <!-- Messages Slider / Selector -->
            <div>
              <div class="flex items-center justify-between text-xs mb-1.5">
                <span class="font-bold text-slate-300 flex items-center gap-1.5">
                  <MessageCircle class="w-3.5 h-3.5 text-emerald-400" />
                  الرسائل الشهرية المتوقعة
                </span>
                <span class="font-mono text-emerald-400 font-black text-sm bg-slate-900 px-2.5 py-0.5 rounded-lg border border-slate-800">
                  {{ formatNumber(calcInput.messages) }} رسالة
                </span>
              </div>
              <input
                type="range"
                v-model.number="calcInput.messages"
                min="1000"
                max="100000"
                step="1000"
                class="w-full accent-emerald-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
              />
              <div class="flex justify-between text-[10px] text-slate-500 mt-1">
                <span>1k</span>
                <span>20k</span>
                <span>60k</span>
                <span>100k رسالة</span>
              </div>
            </div>

            <!-- Quick Example Presets (Requirement 4 test case) -->
            <div class="pt-2 flex flex-wrap items-center gap-2">
              <span class="text-[10px] text-slate-400 font-semibold">أمثلة سريعة:</span>
              <button
                type="button"
                @click="setPreset(2, 10, 20000)"
                class="text-[10px] font-bold px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer transition-colors"
              >
                10 وكلاء + 2 جهاز + 20k رسالة (المثال المطلوب)
              </button>
              <button
                type="button"
                @click="setPreset(1, 2, 5000)"
                class="text-[10px] font-bold px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer transition-colors"
              >
                متجر صغير (1 جهاز / 2 وكيل)
              </button>
              <button
                type="button"
                @click="setPreset(10, 15, 60000)"
                class="text-[10px] font-bold px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer transition-colors"
              >
                شركة كبيرة (10 أجهزة / 15 وكيل)
              </button>
            </div>
          </div>

          <!-- Calculated Output Recommendation -->
          <div class="lg:col-span-5 p-4 sm:p-5 rounded-xl bg-slate-950 border border-emerald-500/40 relative">
            <div class="flex items-center justify-between mb-2">
              <span class="text-[10px] font-black uppercase text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                الخيار الأوفر لك • Best Match
              </span>
              <span class="text-xs text-slate-400 font-bold">
                {{ billingCycle === 'yearly' ? 'حساب سنوي (10 أشهر)' : 'حساب شهري' }}
              </span>
            </div>

            <div v-if="calculatedQuote" class="space-y-3">
              <div>
                <h3 class="text-sm font-black text-white">
                  باقة {{ calculatedQuote.tier_name }}
                  <span v-if="hasAddons(calculatedQuote)" class="text-xs text-emerald-400 font-semibold">+ إضافات</span>
                </h3>
                <p class="text-[11px] text-slate-400">
                  {{ calculatedQuote.tier_name === 'Growth' ? 'الباقة تغطي الأجهزة والرسائل، مع إضافة الوكلاء المطلوبين بأقل تكلفة.' : 'الباقة الأنسب لحجم أعمالك الحالي.' }}
                </p>
              </div>

              <!-- Cost breakdown -->
              <div class="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs space-y-1.5 font-medium">
                <div class="flex justify-between items-center text-slate-300">
                  <span>سعر الباقة الأساسي ({{ calculatedQuote.tier_name }})</span>
                  <span class="font-mono text-white font-bold">${{ calculatedQuote.base_price }}</span>
                </div>
                <div v-if="calculatedQuote.addons.devices.count > 0" class="flex justify-between items-center text-slate-300">
                  <span>{{ calculatedQuote.addons.devices.count }} جهاز إضافي (${{ calculatedQuote.addons.devices.unit_price }}/جهاز)</span>
                  <span class="font-mono text-white font-bold">+${{ calculatedQuote.addons.devices.total }}</span>
                </div>
                <div v-if="calculatedQuote.addons.agents.count > 0" class="flex justify-between items-center text-slate-300">
                  <span>{{ calculatedQuote.addons.agents.count }} وكيل إضافي (${{ calculatedQuote.addons.agents.unit_price }}/وكيل)</span>
                  <span class="font-mono text-white font-bold">+${{ calculatedQuote.addons.agents.total }}</span>
                </div>
                <div v-if="calculatedQuote.addons.messages.total > 0" class="flex justify-between items-center text-slate-300">
                  <span>رصيد رسائل إضافي ({{ formatNumber(calculatedQuote.addons.messages.needed) }})</span>
                  <span class="font-mono text-white font-bold">+${{ calculatedQuote.addons.messages.total }}</span>
                </div>
              </div>

              <!-- Total price hero -->
              <div class="pt-1 flex items-baseline justify-between border-t border-slate-800">
                <span class="text-xs font-bold text-slate-300">التكلفة الإجمالية:</span>
                <div class="text-left">
                  <span class="text-2xl sm:text-3xl font-black text-emerald-400 font-mono">
                    ${{ calculatedQuote.total_cost }}
                  </span>
                  <span class="text-xs text-slate-400 font-semibold">
                    {{ billingCycle === 'yearly' ? ' / سنة' : ' / شهر' }}
                  </span>
                </div>
              </div>

              <div v-if="billingCycle === 'yearly'" class="text-[11px] text-emerald-400/90 font-semibold text-right">
                يعادل <span class="font-mono font-bold">${{ calculatedQuote.monthly_equivalent }}</span> شهرياً (وفر شهرين كاملين)
              </div>

              <!-- Runner up compare -->
              <div v-if="runnerUpQuote" class="text-[10px] text-slate-400 border-t border-slate-900 pt-2 flex items-center justify-between">
                <span>البديل: باقة {{ runnerUpQuote.tier_name }}</span>
                <span class="font-mono text-slate-300 font-bold">${{ runnerUpQuote.total_cost }} {{ billingCycle === 'yearly' ? '/سنة' : '/شهر' }}</span>
              </div>

              <button
                type="button"
                @click="applyCalculatedQuote"
                class="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs transition-all shadow-md shadow-emerald-500/20 active:scale-98 cursor-pointer"
              >
                الاشتراك بهذا التخصيص (${{ calculatedQuote.total_cost }})
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- SECTION 4: DETAILED COMPARISON TABLE -->
      <!-- Desktop: Clean table | Mobile: collapsible or swipeable clean list -->
      <section class="mb-10 sm:mb-14">
        <div class="text-center mb-5">
          <h2 class="text-lg sm:text-2xl font-black text-white">مقارنة شاملة بين الباقات</h2>
          <p class="text-xs text-slate-400">نظرة سريعة على جميع الفروقات والميزات المتضمنة في كل باقة</p>
        </div>

        <div class="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-right text-xs">
              <thead class="bg-slate-950/80 border-b border-slate-800 text-slate-300">
                <tr>
                  <th class="p-3 sm:p-4 font-black">الميزة</th>
                  <th class="p-3 sm:p-4 font-black text-center">Starter</th>
                  <th class="p-3 sm:p-4 font-black text-center text-emerald-400 bg-emerald-500/5">Growth ⭐</th>
                  <th class="p-3 sm:p-4 font-black text-center">Business</th>
                  <th class="p-3 sm:p-4 font-black text-center">Enterprise</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-800/60 text-slate-300">
                <tr>
                  <td class="p-3 sm:p-4 font-bold text-white">السعر الشهري</td>
                  <td class="p-3 sm:p-4 text-center font-mono font-bold">$29</td>
                  <td class="p-3 sm:p-4 text-center font-mono font-bold text-emerald-400 bg-emerald-500/5">$79</td>
                  <td class="p-3 sm:p-4 text-center font-mono font-bold">$149</td>
                  <td class="p-3 sm:p-4 text-center font-mono font-bold">من $299</td>
                </tr>
                <tr>
                  <td class="p-3 sm:p-4 font-bold text-white">السعر السنوي (وفّر شهرين)</td>
                  <td class="p-3 sm:p-4 text-center font-mono">$290 / سنة</td>
                  <td class="p-3 sm:p-4 text-center font-mono text-emerald-400 bg-emerald-500/5">$790 / سنة</td>
                  <td class="p-3 sm:p-4 text-center font-mono">$1,490 / سنة</td>
                  <td class="p-3 sm:p-4 text-center font-mono">من $2,990</td>
                </tr>
                <tr>
                  <td class="p-3 sm:p-4 font-bold text-white">أجهزة WhatsApp</td>
                  <td class="p-3 sm:p-4 text-center font-mono">1</td>
                  <td class="p-3 sm:p-4 text-center font-mono text-emerald-400 bg-emerald-500/5 font-bold">3</td>
                  <td class="p-3 sm:p-4 text-center font-mono">10</td>
                  <td class="p-3 sm:p-4 text-center font-mono">حتى 100+</td>
                </tr>
                <tr>
                  <td class="p-3 sm:p-4 font-bold text-white">وكلاء خدمة العملاء</td>
                  <td class="p-3 sm:p-4 text-center font-mono">2</td>
                  <td class="p-3 sm:p-4 text-center font-mono text-emerald-400 bg-emerald-500/5 font-bold">5</td>
                  <td class="p-3 sm:p-4 text-center font-mono">15</td>
                  <td class="p-3 sm:p-4 text-center font-mono">مخصص</td>
                </tr>
                <tr>
                  <td class="p-3 sm:p-4 font-bold text-white">حد الرسائل الشهري</td>
                  <td class="p-3 sm:p-4 text-center font-mono">5,000</td>
                  <td class="p-3 sm:p-4 text-center font-mono text-emerald-400 bg-emerald-500/5 font-bold">20,000</td>
                  <td class="p-3 sm:p-4 text-center font-mono">60,000</td>
                  <td class="p-3 sm:p-4 text-center font-mono">250,000+</td>
                </tr>
                <tr>
                  <td class="p-3 sm:p-4 font-bold text-white">تحويل المحادثات والإسناد</td>
                  <td class="p-3 sm:p-4 text-center text-emerald-400">✓</td>
                  <td class="p-3 sm:p-4 text-center text-emerald-400 bg-emerald-500/5">✓</td>
                  <td class="p-3 sm:p-4 text-center text-emerald-400">✓</td>
                  <td class="p-3 sm:p-4 text-center text-emerald-400">✓</td>
                </tr>
                <tr>
                  <td class="p-3 sm:p-4 font-bold text-white">مجموعات الوكلاء (Teams)</td>
                  <td class="p-3 sm:p-4 text-center text-slate-600">—</td>
                  <td class="p-3 sm:p-4 text-center text-emerald-400 bg-emerald-500/5">✓</td>
                  <td class="p-3 sm:p-4 text-center text-emerald-400">✓</td>
                  <td class="p-3 sm:p-4 text-center text-emerald-400">✓</td>
                </tr>
                <tr>
                  <td class="p-3 sm:p-4 font-bold text-white">الرد التلقائي الذكي والـ AI</td>
                  <td class="p-3 sm:p-4 text-center text-slate-600">—</td>
                  <td class="p-3 sm:p-4 text-center text-emerald-400 bg-emerald-500/5">✓</td>
                  <td class="p-3 sm:p-4 text-center text-emerald-400">✓</td>
                  <td class="p-3 sm:p-4 text-center text-emerald-400">✓</td>
                </tr>
                <tr>
                  <td class="p-3 sm:p-4 font-bold text-white">تقارير الأداء وسرعة الرد</td>
                  <td class="p-3 sm:p-4 text-center text-slate-600">—</td>
                  <td class="p-3 sm:p-4 text-center text-emerald-400 bg-emerald-500/5">✓</td>
                  <td class="p-3 sm:p-4 text-center text-emerald-400">✓</td>
                  <td class="p-3 sm:p-4 text-center text-emerald-400">✓</td>
                </tr>
                <tr>
                  <td class="p-3 sm:p-4 font-bold text-white">سجل تدقيق النشاط (Audit Logs)</td>
                  <td class="p-3 sm:p-4 text-center text-slate-600">—</td>
                  <td class="p-3 sm:p-4 text-center text-emerald-400 bg-emerald-500/5">✓</td>
                  <td class="p-3 sm:p-4 text-center text-emerald-400">✓</td>
                  <td class="p-3 sm:p-4 text-center text-emerald-400">✓</td>
                </tr>
                <tr>
                  <td class="p-3 sm:p-4 font-bold text-white">دعم الأجهزة الإضافية ($12)</td>
                  <td class="p-3 sm:p-4 text-center text-emerald-400">✓</td>
                  <td class="p-3 sm:p-4 text-center text-emerald-400 bg-emerald-500/5">✓</td>
                  <td class="p-3 sm:p-4 text-center text-emerald-400">✓</td>
                  <td class="p-3 sm:p-4 text-center text-emerald-400">✓</td>
                </tr>
                <tr>
                  <td class="p-3 sm:p-4 font-bold text-white">دعم الوكلاء الإضافيين ($8)</td>
                  <td class="p-3 sm:p-4 text-center text-emerald-400">✓</td>
                  <td class="p-3 sm:p-4 text-center text-emerald-400 bg-emerald-500/5">✓</td>
                  <td class="p-3 sm:p-4 text-center text-emerald-400">✓</td>
                  <td class="p-3 sm:p-4 text-center text-emerald-400">✓</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- SECTION 5: FAQ -->
      <section class="max-w-3xl mx-auto mb-10 sm:mb-14">
        <div class="text-center mb-5">
          <h2 class="text-lg sm:text-2xl font-black text-white">الأسئلة الشائعة</h2>
          <p class="text-xs text-slate-400">كل ما تحتاج معرفته عن باقات ونظام Wavixa CRM</p>
        </div>

        <div class="space-y-2">
          <div
            v-for="(faq, index) in faqs"
            :key="index"
            class="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden"
          >
            <button
              type="button"
              @click="toggleFaq(index)"
              class="w-full px-4 py-3 text-right flex items-center justify-between text-xs sm:text-sm font-bold text-white hover:text-emerald-400 transition-colors cursor-pointer"
            >
              <span>{{ faq.q }}</span>
              <ChevronDown
                class="w-4 h-4 text-slate-400 transition-transform duration-200 shrink-0"
                :class="{ 'rotate-180 text-emerald-400': openFaq === index }"
              />
            </button>
            <div
              v-if="openFaq === index"
              class="px-4 pb-3 text-xs text-slate-300 leading-relaxed border-t border-slate-800/60 pt-2 font-medium bg-slate-950/30"
            >
              {{ faq.a }}
            </div>
          </div>
        </div>
      </section>

      <!-- SECTION 6: BOTTOM CTA BANNER -->
      <section class="rounded-3xl bg-gradient-to-r from-emerald-950/70 via-slate-900 to-teal-950/70 border border-emerald-500/30 p-6 sm:p-8 text-center max-w-4xl mx-auto">
        <h3 class="text-lg sm:text-2xl font-black text-white mb-2">جاهز لتنظيم محادثات واتساب ومضاعفة مبيعاتك؟</h3>
        <p class="text-xs sm:text-sm text-slate-300 max-w-lg mx-auto mb-5">
          ابدأ اليوم باشتراك شهر واحد، وقم بالترقية أو إضافة الأجهزة والوكلاء فوراً مع نمو فريقك.
        </p>
        <div class="flex flex-col sm:flex-row items-center justify-center gap-3">
          <router-link
            :to="crmAuth ? '/crm/dashboard' : '/crm/login'"
            class="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 text-xs font-black transition-all shadow-lg shadow-emerald-500/20 active:scale-95"
          >
            {{ crmAuth ? 'الدخول إلى لوحة التحكم' : 'تسجيل الدخول إلى CRM' }}
          </router-link>
          <a
            href="https://wa.me/201024520482"
            target="_blank"
            rel="noopener"
            class="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-white text-xs font-bold transition-all flex items-center justify-center gap-2"
          >
            <Headphones class="w-4 h-4 text-emerald-400" />
            <span>تواصل معنا عبر واتساب</span>
          </a>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  MessageSquare,
  Sparkles,
  Check,
  Headphones,
  PlusCircle,
  Smartphone,
  Users,
  Zap,
  Calculator,
  MessageCircle,
  ChevronDown,
} from 'lucide-vue-next';
import crm from '@/services/crm';
import { isRTL } from '@/i18n';

const router = useRouter();

const scrolled = ref(false);
const billingCycle = ref('monthly'); // 'monthly' | 'yearly'
const loadingPlan = ref(null);
const loadingAddon = ref(null);
const openFaq = ref(0);

const crmAuth = computed(() => crm.isAuthenticated());
const currentSubscription = ref(null);

// Interactive Calculator Inputs
const calcInput = ref({
  devices: 2,
  agents: 10,
  messages: 20000,
});

const calculatedQuote = ref(null);
const runnerUpQuote = ref(null);

const faqs = [
  {
    q: 'ماذا يحدث إذا تجاوزت حد الأجهزة أو الوكلاء في باقتي؟',
    a: 'لن يتم حذف أي جهاز أو وكيل مسجل حالياً. سيقوم النظام فقط بمنع إضافة أجهزة أو وكلاء جدد حتى تقوم بترقية باقتك أو شراء إضافات (+جهاز بـ $12/شهر أو +وكيل بـ $8/شهر).'
  },
  {
    q: 'كيف يتم احتساب الخصم السنوي؟',
    a: 'الاشتراك السنوي يعادل 10 أشهر فقط، أي أنك تحصل على شهرين مجاناً بالكامل مقارنة بالدفع الشهري المتكرر، كما ينطبق نفس التوفير عند حساب باقتك المخصصة.'
  },
  {
    q: 'ماذا يحدث عند نفاد رصيد الرسائل الشهري؟',
    a: 'المحادثات الواردة تستمر في الوصول دون أي انقطاع. لإرسال ردود جديدة بعد استنفاد الحد الشهري للباقة، يمكنك شحن رصيد رسائل إضافي فوري (يبدأ من $5 لـ 1,000 رسالة، مع خصومات تصل إلى 30% للكميات).'
  },
  {
    q: 'هل يمكنني تغيير الباقة في أي وقت؟',
    a: 'نعم، الترقية فورية. عند الترقية إلى باقة أعلى، يتم تحديث حدود الأجهزة والوكلاء والرسائل مباشرة، مع الحفاظ على كافة المحادثات وسجلات العملاء.'
  },
  {
    q: 'هل تختلف باقات CRM عن باقات WhatsApp API؟',
    a: 'نعم، باقات CRM مخصصة لإدارة خدمة العملاء والوكلاء ومحادثات الـ Webhooks المتعددة، بينما باقات API مخصصة لمطوري البرمجيات والربط الآلي مع المواقع والأنظمة.'
  },
];

function formatNumber(num) {
  if (num === null || num === undefined) return '0';
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  return Number(num).toLocaleString('en-US');
}

function isCurrentPlan(slug) {
  if (!currentSubscription.value) return false;
  return currentSubscription.value.plan_slug === slug;
}

function hasAddons(quote) {
  if (!quote?.addons) return false;
  return (
    quote.addons.devices.count > 0 ||
    quote.addons.agents.count > 0 ||
    quote.addons.messages.total > 0
  );
}

function setPreset(dev, ag, msg) {
  calcInput.value.devices = dev;
  calcInput.value.agents = ag;
  calcInput.value.messages = msg;
  updateCalculator();
}

async function updateCalculator() {
  try {
    const res = await crm.calculateQuote({
      devices: calcInput.value.devices,
      agents: calcInput.value.agents,
      messages: calcInput.value.messages,
      billing: billingCycle.value,
    });
    if (res?.success && res.quote) {
      calculatedQuote.value = res.quote.best_recommendation;
      runnerUpQuote.value = res.quote.runner_up;
    }
  } catch (err) {
    console.error('Failed to calculate quote:', err);
  }
}

watch([() => calcInput.value.devices, () => calcInput.value.agents, () => calcInput.value.messages, billingCycle], () => {
  updateCalculator();
});

async function loadPlans() {
  try {
    const data = await crm.getPricingPlans();
    if (data?.current_user_subscription) {
      currentSubscription.value = data.current_user_subscription;
    }
  } catch (err) {
    console.error('Failed to load plans:', err);
  }
}

async function handleSelectPlan(tier) {
  const slug = `crm-${tier}${billingCycle.value === 'yearly' ? '-yearly' : ''}`;

  if (!crmAuth.value) {
    // Redirect to login or register with plan query
    router.push(`/crm/login?plan=${slug}`);
    return;
  }

  loadingPlan.value = `crm-${tier}`;
  try {
    const res = await crm.subscribePlan(slug);
    if (res?.success) {
      alert(res.message || 'تم تفعيل الباقة بنجاح!');
      await loadPlans();
      if (res.limits) {
        currentSubscription.value = res.limits;
      }
    } else {
      alert(res?.message || 'حدث خطأ أثناء الاشتراك');
    }
  } catch (err) {
    alert(err?.response?.data?.message || 'حدث خطأ أثناء ترقية الباقة');
  } finally {
    loadingPlan.value = null;
  }
}

async function handleBuyAddon(type, qty, tier = 'tier_1k') {
  if (!crmAuth.value) {
    router.push('/crm/login');
    return;
  }

  const map = { extra_device: 'device', extra_agent: 'agent', extra_messages: 'messages' };
  loadingAddon.value = map[type] || 'device';

  try {
    const res = await crm.purchaseAddon(type, qty, tier);
    if (res?.success) {
      alert(res.message || 'تمت إضافة العنصر بنجاح!');
      await loadPlans();
    } else {
      alert(res?.message || 'حدث خطأ');
    }
  } catch (err) {
    alert(err?.response?.data?.message || 'تعذر إتمام عملية الشراء');
  } finally {
    loadingAddon.value = null;
  }
}

function applyCalculatedQuote() {
  if (!calculatedQuote.value) return;
  const tierKey = calculatedQuote.value.tier_key;
  handleSelectPlan(tierKey);
}

function toggleFaq(index) {
  openFaq.value = openFaq.value === index ? null : index;
}

function onScroll() {
  scrolled.value = window.scrollY > 20;
}

onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true });
  loadPlans();
  updateCalculator();
});

onUnmounted(() => {
  window.removeEventListener('scroll', onScroll);
});
</script>

<style scoped>
/* Mobile-first compact pricing card styling */
.pricing-card {
  min-height: 100%;
}

@media (max-width: 640px) {
  .pricing-card {
    padding: 1rem;
  }
}
</style>
