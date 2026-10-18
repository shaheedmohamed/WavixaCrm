<template>
  <div class="h-full overflow-y-auto p-4 md:p-8 space-y-6" dir="rtl">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 class="text-2xl md:text-3xl font-black text-white">فريق خدمة العملاء</h1>
        <p class="text-slate-400 text-sm mt-1">أضف أعضاء فريقك وحدد الأجهزة وأرقام الواتساب المتاحة لكل عضو للرد على العملاء</p>
      </div>

      <button
        @click="openAddModal"
        class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-600/20 transition-all self-start sm:self-auto"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/></svg>
        <span>إضافة عضو جديد للفريق</span>
      </button>
    </div>

    <!-- Info Banner -->
    <div class="p-4 rounded-2xl bg-slate-800/80 border border-slate-700/80 flex items-start gap-3">
      <div class="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center shrink-0 mt-0.5">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
      </div>
      <div class="text-xs text-slate-300 space-y-1">
        <p class="font-bold text-white text-sm">كيف يسجل أعضاء الفريق دخولهم؟</p>
        <p>يسجل الموظف دخوله مباشرة من نفس صفحة تسجيل الدخول <span class="text-emerald-400 font-mono font-bold" dir="ltr">/crm</span> بالبريد وكلمة المرور التي تحددها له هنا. وسيفتح له نظام الشات مباشرة بالأجهزة المخصصة له.</p>
      </div>
    </div>

    <!-- Groups Section -->
    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-bold text-white">المجموعات</h2>
        <button
          @click="openGroupModal()"
          class="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs transition-all"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
          <span>مجموعة جديدة</span>
        </button>
      </div>

      <div v-if="groups.length === 0" class="p-5 rounded-2xl bg-slate-800/40 border border-dashed border-slate-700 text-sm text-slate-400">
        مفيش مجموعات لسه — أنشئ مجموعة (مثلاً "محل المهندسين") وعيّن لها أجهزة، وبعدها ضيف الموظفين ليها من نموذج الموظف. كل موظفين المجموعة بيشوفوا نفس الشاتات.
      </div>

      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div
          v-for="g in groups"
          :key="g.id"
          class="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 flex flex-col justify-between hover:border-slate-600 transition-all"
        >
          <div>
            <div class="flex items-center justify-between mb-2">
              <h3 class="text-sm font-bold text-white flex items-center gap-2">
                <span class="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                </span>
                {{ g.name }}
              </h3>
              <span class="px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 text-[10px] font-bold">
                {{ g.agents_count }} موظف
              </span>
            </div>
            <div class="flex flex-wrap gap-1.5 mt-2">
              <template v-if="!g.session_ids || g.session_ids.length === 0">
                <span class="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold">كل الأجهزة</span>
              </template>
              <template v-else>
                <span
                  v-for="sid in g.session_ids"
                  :key="sid"
                  class="px-2 py-0.5 rounded-md bg-slate-700 text-slate-200 text-xs font-bold"
                >
                  {{ getDeviceName(sid) }}
                </span>
              </template>
            </div>
          </div>
          <div class="pt-3 mt-3 border-t border-slate-700/60 flex items-center justify-between">
            <button
              @click="openGroupModal(g)"
              class="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold transition-colors"
            >
              تعديل
            </button>
            <button
              @click="removeGroup(g.id)"
              class="text-rose-400 hover:text-rose-300 p-1.5 rounded-lg hover:bg-rose-500/10 transition-colors"
              title="حذف المجموعة"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Agents Table / Grid -->
    <div v-if="loading" class="p-12 text-center text-slate-400 text-sm">
      جاري تحميل فريق العمل...
    </div>

    <div v-else-if="agents.length === 0" class="p-12 text-center bg-slate-800/40 rounded-3xl border border-dashed border-slate-700">
      <div class="w-16 h-16 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mx-auto mb-4">
        <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
      </div>
      <h3 class="text-lg font-bold text-white">لم تقم بإضافة أي أعضاء بعد</h3>
      <p class="text-sm text-slate-400 max-w-sm mx-auto mt-1">أضف موظفي خدمة العملاء للبدء في إدارة وتوزيع المحادثات والرد السريع على العملاء</p>
      <button
        @click="openAddModal"
        class="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-600/20 transition-all"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
        <span>إضافة أول موظف الآن</span>
      </button>
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <div
        v-for="a in agents"
        :key="a.id"
        class="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-5 flex flex-col justify-between hover:border-slate-600 transition-all"
      >
        <div>
          <!-- Top Row -->
          <div class="flex items-center justify-between mb-3">
            <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-sky-500 text-white font-bold flex items-center justify-center text-sm shadow-md">
              {{ a.name ? a.name.trim().charAt(0) : 'A' }}
            </div>

            <span
              class="px-2.5 py-1 rounded-full text-[11px] font-bold"
              :class="a.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'"
            >
              {{ a.status === 'active' ? 'نشط' : 'معطل' }}
            </span>
          </div>

          <!-- Name & Email -->
          <div class="space-y-1 mb-4">
            <h3 class="text-base font-bold text-white">{{ a.name }}</h3>
            <p class="text-xs text-slate-400 font-mono" dir="ltr">{{ a.email }}</p>
            <p v-if="a.group_name" class="text-[11px] text-emerald-400 font-bold flex items-center gap-1">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
              {{ a.group_name }}
            </p>
          </div>

          <!-- Assigned Devices -->
          <div class="mb-4">
            <span class="text-[11px] font-semibold text-slate-400 block mb-1.5">الأجهزة المصرح بها:</span>
            <div class="flex flex-wrap gap-1.5">
              <template v-if="a.group_name">
                <span class="px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 text-xs font-bold">
                  أجهزة المجموعة
                </span>
              </template>
              <template v-else-if="!a.assigned_sessions || a.assigned_sessions.length === 0">
                <span class="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold">
                  كل الأجهزة
                </span>
              </template>
              <template v-else>
                <span
                  v-for="sid in a.assigned_sessions"
                  :key="sid"
                  class="px-2 py-0.5 rounded-md bg-slate-700 text-slate-200 text-xs font-bold"
                >
                  {{ getDeviceName(sid) }}
                </span>
              </template>
            </div>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="pt-4 border-t border-slate-700/60 flex items-center justify-between">
          <button
            @click="openEditModal(a)"
            class="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold transition-colors flex items-center gap-1.5"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
            <span>تعديل</span>
          </button>

          <button
            @click="deleteAgent(a.id)"
            class="text-rose-400 hover:text-rose-300 p-1.5 rounded-lg hover:bg-rose-500/10 transition-colors"
            title="حذف الموظف"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Modal: Add / Edit Agent -->
    <div
      v-if="showModal"
      class="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
      <div class="bg-slate-900 border border-slate-700/80 rounded-3xl w-full max-w-md p-6 shadow-2xl relative text-right">
        <!-- Close Button -->
        <button
          @click="showModal = false"
          class="absolute top-5 left-5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>

        <h2 class="text-xl font-bold text-white mb-1">{{ isEditing ? 'تعديل بيانات الموظف' : 'إضافة عضو جديد لفريق خدمة العملاء' }}</h2>
        <p class="text-xs text-slate-400 mb-5">أدخل بيانات تسجيل الدخول والأجهزة المصرح بها</p>

        <form @submit.prevent="saveAgent" class="space-y-4">
          <!-- Name -->
          <div>
            <label class="block text-xs font-semibold text-slate-300 mb-1.5">اسم الموظف</label>
            <input
              v-model="form.name"
              type="text"
              required
              placeholder="مثال: أحمد محمد"
              class="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <!-- Email -->
          <div>
            <label class="block text-xs font-semibold text-slate-300 mb-1.5">البريد الإلكتروني لتسجيل الدخول</label>
            <input
              v-model="form.email"
              type="email"
              required
              placeholder="agent@company.com"
              dir="ltr"
              class="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono"
            />
          </div>

          <!-- Password -->
          <div>
            <label class="block text-xs font-semibold text-slate-300 mb-1.5">
              كلمة المرور
              <span v-if="isEditing" class="text-slate-500 font-normal">(اتركه فارغاً للإبقاء على الحالية)</span>
            </label>
            <input
              v-model="form.password"
              :required="!isEditing"
              type="text"
              placeholder="كلمة مرور الدخول"
              dir="ltr"
              class="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono"
            />
          </div>

          <!-- Group select -->
          <div v-if="groups.length > 0">
            <label class="block text-xs font-semibold text-slate-300 mb-1.5">المجموعة</label>
            <select
              v-model="form.group_id"
              class="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
            >
              <option :value="null">بدون مجموعة — خدمة العملاء</option>
              <option v-for="g in groups" :key="g.id" :value="g.id">{{ g.name }}</option>
            </select>
            <p v-if="form.group_id" class="text-[10px] text-emerald-400 mt-1">
              الأجهزة هتتبع مجموعة "{{ groupName(form.group_id) }}" — الموظف هيتعامل على أجهزتها كلها.
            </p>
          </div>

          <!-- Assigned Devices (Multi-select) -->
          <div v-if="!form.group_id">
            <label class="block text-xs font-semibold text-slate-300 mb-1.5">الأجهزة وأرقام الواتساب المخصصة</label>
            <p class="text-[11px] text-slate-500 mb-2">اختر الأجهزة التي يستطيع هذا الموظف استقبال رسائلها والرد عليها:</p>
            <div class="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto p-1 bg-slate-950/40 rounded-xl border border-slate-800">
              <label
                v-for="d in devices"
                :key="d.id"
                class="flex items-center gap-2 p-2 rounded-lg bg-slate-800/80 border border-slate-700/60 cursor-pointer hover:border-emerald-500/50 transition-colors"
                :class="{ 'border-emerald-500 bg-emerald-500/10': form.assigned_sessions.includes(d.id) }"
              >
                <input
                  type="checkbox"
                  :value="d.id"
                  v-model="form.assigned_sessions"
                  class="rounded bg-slate-900 border-slate-600 text-emerald-500 focus:ring-0"
                />
                <span class="text-xs font-bold text-white">{{ d.device_name }}</span>
              </label>
            </div>
            <span class="text-[10px] text-slate-500 block mt-1">
              إذا لم تختر أي جهاز، سيتمكن الموظف من الوصول لكل الأجهزة تلقائياً.
            </span>
          </div>

          <!-- Status toggle (Edit mode) -->
          <div v-if="isEditing" class="flex items-center justify-between p-3 rounded-xl bg-slate-800/60 border border-slate-700">
            <span class="text-xs font-semibold text-slate-300">حالة الحساب</span>
            <select v-model="form.status" class="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1 text-xs text-white">
              <option value="active">نشط (مسموح بالدخول)</option>
              <option value="inactive">معطل</option>
            </select>
          </div>

          <!-- Submit Button -->
          <button
            type="submit"
            :disabled="saving"
            class="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm rounded-xl transition-all shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <svg v-if="saving" class="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>{{ saving ? 'جاري الحفظ...' : (isEditing ? 'حفظ التعديلات' : 'إضافة الموظف') }}</span>
          </button>
        </form>
      </div>
    </div>

    <!-- Modal: Add / Edit Group -->
    <div
      v-if="showGroupModal"
      class="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
      <div class="bg-slate-900 border border-slate-700/80 rounded-3xl w-full max-w-md p-6 shadow-2xl relative text-right">
        <button
          @click="showGroupModal = false"
          class="absolute top-5 left-5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>

        <h2 class="text-xl font-bold text-white mb-1">{{ isEditingGroup ? 'تعديل المجموعة' : 'مجموعة جديدة' }}</h2>
        <p class="text-xs text-slate-400 mb-5">اسم المجموعة والأجهزة اللي بيشوفها أعضاؤها</p>

        <form @submit.prevent="saveGroup" class="space-y-4">
          <div>
            <label class="block text-xs font-semibold text-slate-300 mb-1.5">اسم المجموعة</label>
            <input
              v-model="groupForm.name"
              type="text"
              required
              placeholder="مثال: محل المهندسين"
              class="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-300 mb-1.5">أجهزة المجموعة</label>
            <p class="text-[11px] text-slate-500 mb-2">كل موظف في المجموعة دي بيشوف شاتات الأجهزة دي بس:</p>
            <div class="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-1 bg-slate-950/40 rounded-xl border border-slate-800">
              <label
                v-for="d in devices"
                :key="d.id"
                class="flex items-center gap-2 p-2 rounded-lg bg-slate-800/80 border border-slate-700/60 cursor-pointer hover:border-emerald-500/50 transition-colors"
                :class="{ 'border-emerald-500 bg-emerald-500/10': groupForm.session_ids.includes(d.id) }"
              >
                <input
                  type="checkbox"
                  :value="d.id"
                  v-model="groupForm.session_ids"
                  class="rounded bg-slate-900 border-slate-600 text-emerald-500 focus:ring-0"
                />
                <span class="text-xs font-bold text-white">{{ d.device_name }}</span>
              </label>
            </div>
            <span class="text-[10px] text-slate-500 block mt-1">
              لو مفيش جهاز متعلّم، أعضاء المجموعة هيشوفوا كل الأجهزة.
            </span>
          </div>

          <button
            type="submit"
            :disabled="savingGroup"
            class="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm rounded-xl transition-all shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <svg v-if="savingGroup" class="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>{{ savingGroup ? 'جاري الحفظ...' : (isEditingGroup ? 'حفظ التعديلات' : 'إنشاء المجموعة') }}</span>
          </button>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import crm from '@/services/crm';

const agents = ref([]);
const devices = ref([]);
const groups = ref([]);
const loading = ref(true);
const showModal = ref(false);
const isEditing = ref(false);
const editingId = ref(null);
const saving = ref(false);

const showGroupModal = ref(false);
const isEditingGroup = ref(false);
const editingGroupId = ref(null);
const savingGroup = ref(false);

const form = ref({
  name: '',
  email: '',
  password: '',
  assigned_sessions: [],
  group_id: null,
  status: 'active',
});

const groupForm = ref({
  name: '',
  session_ids: [],
});

const loadData = async () => {
  try {
    loading.value = true;
    const [agRes, devRes, grRes] = await Promise.all([
      crm.getAgents(),
      crm.getDevices(),
      crm.getGroups().catch(() => ({ success: false })),
    ]);
    if (agRes.success) agents.value = agRes.agents || [];
    if (devRes.success) devices.value = devRes.devices || [];
    if (grRes.success) groups.value = grRes.groups || [];
  } catch {} finally {
    loading.value = false;
  }
};

const getDeviceName = (sessionId) => {
  const dev = devices.value.find((d) => d.id === sessionId);
  return dev ? dev.device_name : `ج${sessionId}`;
};

const groupName = (id) => groups.value.find((g) => g.id === id)?.name || '';

const openGroupModal = (g = null) => {
  isEditingGroup.value = Boolean(g);
  editingGroupId.value = g?.id ?? null;
  groupForm.value = {
    name: g?.name || '',
    session_ids: [...(g?.session_ids || [])],
  };
  showGroupModal.value = true;
};

const saveGroup = async () => {
  savingGroup.value = true;
  try {
    const payload = { name: groupForm.value.name, session_ids: groupForm.value.session_ids };
    const res = isEditingGroup.value
      ? await crm.updateGroup(editingGroupId.value, payload)
      : await crm.createGroup(payload);
    if (res.success) {
      showGroupModal.value = false;
      await loadData();
    }
  } catch (err) {
    alert(err.response?.data?.message || 'حدث خطأ أثناء حفظ المجموعة');
  } finally {
    savingGroup.value = false;
  }
};

const removeGroup = async (id) => {
  if (!confirm('حذف المجموعة؟ أعضاؤها هيرجعوا للوضع الافتراضي (خدمة العملاء / كل الأجهزة).')) return;
  try {
    await crm.deleteGroup(id);
    await loadData();
  } catch {
    alert('فشل حذف المجموعة');
  }
};

const openAddModal = () => {
  isEditing.value = false;
  editingId.value = null;
  form.value = {
    name: '',
    email: '',
    password: '',
    assigned_sessions: [],
    group_id: null,
    status: 'active',
  };
  showModal.value = true;
};

const openEditModal = (a) => {
  isEditing.value = true;
  editingId.value = a.id;
  form.value = {
    name: a.name,
    email: a.email,
    password: '',
    assigned_sessions: a.assigned_sessions || [],
    group_id: a.group_id ?? null,
    status: a.status || 'active',
  };
  showModal.value = true;
};

const saveAgent = async () => {
  saving.value = true;
  try {
    if (isEditing.value) {
      const payload = { ...form.value };
      if (!payload.password) delete payload.password;
      const res = await crm.updateAgent(editingId.value, payload);
      if (res.success) {
        showModal.value = false;
        await loadData();
      }
    } else {
      const res = await crm.createAgent(form.value);
      if (res.success) {
        showModal.value = false;
        await loadData();
      }
    }
  } catch (err) {
    alert(err.response?.data?.message || 'حدث خطأ أثناء حفظ بيانات الموظف');
  } finally {
    saving.value = false;
  }
};

const deleteAgent = async (id) => {
  if (!confirm('هل أنت متأكد من حذف هذا الموظف؟ لن يتمكن من تسجيل الدخول بعد الآن.')) return;
  try {
    await crm.deleteAgent(id);
    await loadData();
  } catch {
    alert('فشل حذف الموظف');
  }
};

onMounted(() => {
  loadData();
});
</script>
