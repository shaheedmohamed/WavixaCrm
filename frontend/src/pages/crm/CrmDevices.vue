<template>
  <div class="h-full overflow-y-auto p-4 md:p-8 space-y-6" dir="rtl">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 class="text-2xl md:text-3xl font-black text-white">ربط أرقام الواتساب (الأجهزة)</h1>
        <p class="text-slate-400 text-sm mt-1">اربط عدة أرقام واتساب عبر محرك Wavixa Engine لإدارة المحادثات وتوزيعها على الفريق</p>
      </div>

      <button
        @click="openAddModal"
        class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-600/20 transition-all self-start sm:self-auto"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
        <span>ربط رقم جديد (QR)</span>
      </button>
    </div>

    <!-- Alert / Info Banner -->
    <div class="p-4 rounded-2xl bg-slate-800/80 border border-slate-700/80 flex items-start gap-3">
      <div class="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
      </div>
      <div class="text-xs text-slate-300 space-y-1">
        <p class="font-bold text-white text-sm">كيفية ربط أرقامك بنظام CRM:</p>
        <p>1. اضغط على زر "ربط رقم جديد" واختر اسماً للجهاز (مثلاً "المبيعات" أو اتركه ليتم توليده تلقائياً كـ ج1، ج2...).</p>
        <p>2. افتح تطبيق واتساب على هاتفك &larr; الأجهزة المرتبطة &larr; ربط جهاز &larr; امسح رمز الـ QR الظاهر أمامك.</p>
        <p>3. فور الاتصال، سيظهر الرقم مباشرة ويمكن لفريقك البدء في الرد على العملاء.</p>
      </div>
    </div>

    <!-- Devices List -->
    <div v-if="loading" class="p-12 text-center text-slate-400 text-sm">
      جاري تحميل الأجهزة...
    </div>

    <div v-else-if="devices.length === 0" class="p-12 text-center bg-slate-800/40 rounded-3xl border border-dashed border-slate-700">
      <div class="w-16 h-16 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto mb-4">
        <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
      </div>
      <h3 class="text-lg font-bold text-white">لم تقم بربط أي رقم واتساب حتى الآن</h3>
      <p class="text-sm text-slate-400 max-w-sm mx-auto mt-1">ابدأ الآن بربط رقمك الأول لتتمكن من استقبال رسائل العملاء وتشغيل الشات</p>
      <button
        @click="openAddModal"
        class="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-600/20 transition-all"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
        <span>ربط أول رقم الآن</span>
      </button>
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <div
        v-for="d in devices"
        :key="d.id"
        class="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-5 flex flex-col justify-between hover:border-slate-600 transition-all"
      >
        <div>
          <!-- Top Row -->
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-2.5">
              <span class="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-black text-sm">
                {{ d.device_name }}
              </span>
              <button
                @click="openRenameModal(d)"
                class="text-slate-400 hover:text-white p-1"
                title="تعديل اسم الجهاز"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
              </button>
            </div>

            <!-- Status Pill -->
            <span
              class="px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center gap-1.5"
              :class="d.status === 'connected' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : (d.status === 'pending' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-slate-700/50 text-slate-400 border border-slate-700')"
            >
              <span class="w-1.5 h-1.5 rounded-full" :class="d.status === 'connected' ? 'bg-emerald-400 animate-pulse' : (d.status === 'pending' ? 'bg-amber-400 animate-ping' : 'bg-slate-500')"></span>
              {{ d.status === 'connected' ? 'متصل' : (d.status === 'pending' ? 'قيد الاقتران' : 'غير متصل') }}
            </span>
          </div>

          <!-- Phone Number & Details -->
          <div class="space-y-1.5 my-4">
            <div class="text-base font-bold text-white font-mono" dir="ltr">
              {{ d.phone_number ? '+' + d.phone_number : 'رقم غير معروف' }}
            </div>
            <div class="text-[11px] text-slate-400">
              تاريخ الإضافة: {{ formatDate(d.created_at) }}
            </div>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="pt-4 border-t border-slate-700/60 flex items-center justify-between gap-2">
          <div class="flex items-center gap-1.5">
            <button
              v-if="d.status !== 'connected'"
              @click="openReconnectModal(d)"
              class="px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 text-xs font-bold transition-colors"
            >
              مسح الـ QR للاتصال
            </button>
            <button
              v-else
              @click="disconnectDevice(d.id)"
              class="px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 text-xs font-bold transition-colors"
            >
              فصل
            </button>
            <button
              v-if="d.status === 'connected'"
              @click="syncHistory(d.id)"
              :disabled="syncingId === d.id"
              class="px-3 py-1.5 rounded-lg bg-sky-600/20 hover:bg-sky-600/30 text-sky-400 border border-sky-500/30 text-xs font-bold transition-colors disabled:opacity-50"
              title="طلب مزامنة المحادثات القديمة من الهاتف"
            >
              {{ syncingId === d.id ? 'جاري الطلب...' : 'مزامنة المحادثات' }}
            </button>
          </div>

          <button
            @click="deleteDevice(d.id)"
            class="text-rose-400 hover:text-rose-300 p-1.5 rounded-lg hover:bg-rose-500/10 transition-colors"
            title="حذف الجهاز نهائياً"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Modal: Add / Link Device -->
    <div
      v-if="showModal"
      class="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
      <div class="bg-slate-900 border border-slate-700/80 rounded-3xl w-full max-w-md p-6 shadow-2xl relative text-right">
        <!-- Close Button -->
        <button
          @click="closeModal"
          class="absolute top-5 left-5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>

        <h2 class="text-xl font-bold text-white mb-1">ربط رقم واتساب جديد</h2>
        <p class="text-xs text-slate-400 mb-5">قم بتسمية الجهاز وامسح رمز الاستجابة السريعة (QR Code)</p>

        <!-- Step 1: Device Name Input (if not yet initiated) -->
        <div v-if="!currentQr && !initLoading" class="space-y-4">
          <div>
            <label class="block text-xs font-semibold text-slate-300 mb-1.5">اسم الجهاز أو الرقم</label>
            <input
              v-model="newDeviceName"
              type="text"
              :placeholder="autoSuggestedName"
              class="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
            />
            <span class="text-[11px] text-slate-500 mt-1 block">
              إذا تركته فارغاً سيتم تعيين الاسم تلقائياً: {{ autoSuggestedName }}
            </span>
          </div>

          <button
            @click="startLinking"
            class="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm rounded-xl transition-all shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2"
          >
            <span>توليد كود الـ QR للربط</span>
          </button>
        </div>

        <!-- Step 2: Live QR Display & Polling -->
        <div v-else class="text-center space-y-4 py-2">
          <div v-if="initLoading" class="py-12 text-slate-400 text-sm flex flex-col items-center gap-3">
            <svg class="animate-spin h-8 w-8 text-emerald-500" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>جاري تهيئة جلسة الربط في المحرك...</span>
          </div>

          <div v-else-if="currentQr" class="space-y-4">
            <div class="inline-block p-4 bg-white rounded-2xl shadow-xl shadow-black/50 border-4 border-emerald-500/30 relative">
              <img :src="currentQr" alt="WhatsApp QR Code" class="w-56 h-56 mx-auto object-contain" />
              <!-- Scan line animation -->
              <div class="absolute inset-x-4 top-4 h-0.5 bg-emerald-500 shadow-md shadow-emerald-500 animate-bounce opacity-70"></div>
            </div>

            <div class="space-y-1">
              <p class="text-sm font-bold text-white flex items-center justify-center gap-2">
                <span class="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                <span>امسح الرمز من تطبيق الواتساب الآن</span>
              </p>
              <p class="text-xs text-slate-400">
                الجهاز: <span class="text-emerald-400 font-bold">{{ activeDeviceName }}</span>
              </p>
            </div>

            <!-- Polling Indicator -->
            <div class="text-[11px] text-slate-500 flex items-center justify-center gap-1.5">
              <svg class="w-3.5 h-3.5 animate-spin text-slate-400" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>بانتظار مسح الرمز وتأكيد الاتصال...</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal: Rename Device -->
    <div
      v-if="showRenameModal"
      class="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
      <div class="bg-slate-900 border border-slate-700/80 rounded-3xl w-full max-w-sm p-6 shadow-2xl relative text-right space-y-4">
        <h2 class="text-lg font-bold text-white">تعديل اسم الجهاز</h2>
        <div>
          <label class="block text-xs font-semibold text-slate-300 mb-1.5">الاسم الجديد</label>
          <input
            v-model="editDeviceName"
            type="text"
            class="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
          />
        </div>
        <div class="flex items-center justify-end gap-2 pt-2">
          <button @click="showRenameModal = false" class="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold hover:bg-slate-700">
            إلغاء
          </button>
          <button @click="saveRename" class="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-500">
            حفظ
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import crm from '@/services/crm';

const devices = ref([]);
const loading = ref(true);

const showModal = ref(false);
const initLoading = ref(false);
const newDeviceName = ref('');
const activeDeviceName = ref('');
const currentQr = ref(null);
const currentSessionId = ref(null);
let pollTimer = null;

// Rename modal
const showRenameModal = ref(false);
const editDeviceName = ref('');
const editDeviceId = ref(null);

const autoSuggestedName = computed(() => {
  return 'ج' + (devices.value.length + 1);
});

const loadDevices = async () => {
  try {
    loading.value = true;
    const res = await crm.getDevices();
    if (res.success) {
      devices.value = res.devices || [];
    }
  } catch {} finally {
    loading.value = false;
  }
};

const openAddModal = () => {
  newDeviceName.value = '';
  currentQr.value = null;
  currentSessionId.value = null;
  showModal.value = true;
};

const startLinking = async () => {
  initLoading.value = true;
  const nameToUse = newDeviceName.value.trim() || autoSuggestedName.value;
  activeDeviceName.value = nameToUse;

  try {
    const res = await crm.initDevice({ device_name: nameToUse });
    if (res.success && res.device) {
      currentSessionId.value = res.device.id;
      currentQr.value = res.device.qr;
      startPolling(res.device.id);
    }
  } catch (err) {
    alert('فشل في بدء جلسة الربط');
  } finally {
    initLoading.value = false;
  }
};

const openReconnectModal = async (device) => {
  activeDeviceName.value = device.device_name;
  currentSessionId.value = device.id;
  currentQr.value = null;
  showModal.value = true;
  initLoading.value = true;

  try {
    const res = await crm.reconnectDevice(device.id);
    if (res.success && res.data) {
      currentQr.value = res.data.qr;
      startPolling(device.id);
    }
  } catch {
    alert('فشل في إعادة تشغيل الـ QR');
  } finally {
    initLoading.value = false;
  }
};

const startPolling = (sessionId) => {
  stopPolling();
  pollTimer = setInterval(async () => {
    try {
      const res = await crm.getDeviceStatus(sessionId);
      if (res.success && res.data) {
        // WhatsApp rotates the pairing QR every ~20s — always pick up the new
        // code, not just the first one, or the image goes stale and unscannable.
        if (res.data.qr && res.data.qr !== currentQr.value) {
          currentQr.value = res.data.qr;
        }
        if (res.data.status === 'connected') {
          stopPolling();
          closeModal();
          await loadDevices();
          alert(`تم ربط الرقم بنجاح! (+${res.data.phoneNumber || ''})`);
        }
      }
    } catch {}
  }, 2000);
};

const stopPolling = () => {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
};

const closeModal = () => {
  stopPolling();
  showModal.value = false;
  currentQr.value = null;
  currentSessionId.value = null;
};

const openRenameModal = (d) => {
  editDeviceId.value = d.id;
  editDeviceName.value = d.device_name;
  showRenameModal.value = true;
};

const saveRename = async () => {
  if (!editDeviceId.value || !editDeviceName.value.trim()) return;
  try {
    const res = await crm.updateDevice(editDeviceId.value, { device_name: editDeviceName.value.trim() });
    if (res.success) {
      showRenameModal.value = false;
      await loadDevices();
    }
  } catch {
    alert('فشل حفظ الاسم');
  }
};

const disconnectDevice = async (id) => {
  if (!confirm('هل أنت متأكد من فصل هذا الجهاز؟')) return;
  try {
    await crm.disconnectDevice(id);
    await loadDevices();
  } catch {
    alert('فشل فصل الجهاز');
  }
};

const deleteDevice = async (id) => {
  if (!confirm('هل أنت متأكد من حذف هذا الجهاز نهائياً؟')) return;
  try {
    await crm.deleteDevice(id);
    await loadDevices();
  } catch {
    alert('فشل حذف الجهاز');
  }
};

const syncingId = ref(null);
const syncHistory = async (id) => {
  syncingId.value = id;
  try {
    const res = await crm.syncDeviceHistory(id);
    alert(res.message || 'تم إرسال طلب المزامنة');
  } catch (e) {
    alert(e?.response?.data?.message || 'فشل طلب المزامنة');
  } finally {
    syncingId.value = null;
  }
};

const formatDate = (d) => {
  if (!d) return '-';
  try {
    return new Date(d).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return d;
  }
};

onMounted(() => {
  loadDevices();
});

onUnmounted(() => {
  stopPolling();
});
</script>
