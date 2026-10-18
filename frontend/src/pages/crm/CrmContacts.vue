<template>
  <div class="h-full overflow-y-auto p-4 md:p-8 space-y-6" dir="rtl">
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 class="text-2xl md:text-3xl font-black text-white">جهات الاتصال</h1>
        <p class="text-slate-400 text-sm mt-1">ارفع ملف CSV بأسماء وأرقام جهاتك — أي محادثة برقم منها هتظهر باسمها المسجل عندك</p>
      </div>
      <div class="flex items-center gap-2 self-start sm:self-auto">
        <input ref="fileInput" type="file" accept=".csv,.txt,.vcf" class="hidden" @change="uploadCsv" />
        <button @click="fileInput?.click()" :disabled="importing"
          class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-600/20 transition-all disabled:opacity-50">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
          <span>{{ importing ? 'جاري الرفع...' : 'رفع ملف جهات الاتصال' }}</span>
        </button>
      </div>
    </div>

    <!-- Import result banner -->
    <div v-if="importMsg" class="px-5 py-3.5 rounded-2xl border text-sm font-bold"
      :class="importOk ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'">
      {{ importMsg }}
    </div>

    <!-- CSV format hint + add single contact -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div class="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-5">
        <h2 class="font-black text-white text-sm mb-2">صيغ الملف المدعومة</h2>
        <p class="text-xs text-slate-400 leading-relaxed">
          <span class="text-emerald-400 font-bold">VCF (vCard)</span> — ملف جهات الاتصال اللي بيطلع من الموبايل أو Google Contacts مباشرة. كل رقم في البطاقة بيتسجل باسمها.<br/>
          <span class="text-emerald-400 font-bold">CSV</span> — عمود الاسم وعمود الرقم بأي ترتيب، النظام بيكتشف الرقم تلقائياً.
        </p>
        <p class="text-[10px] text-slate-500 mt-2">الأرقام المصرية بالصيغة المحلية (010xxxxxxxx) أو الدولية (2010xxxxxxxx) مدعومة.</p>
      </div>

      <div class="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-5">
        <h2 class="font-black text-white text-sm mb-3">إضافة جهة يدوياً</h2>
        <div class="flex flex-col sm:flex-row gap-2">
          <input v-model="newName" type="text" placeholder="الاسم"
            class="flex-1 bg-slate-900/80 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500" />
          <input v-model="newPhone" type="text" placeholder="رقم الهاتف" dir="ltr"
            class="flex-1 bg-slate-900/80 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500" />
          <button @click="addContact" :disabled="adding || !newName.trim() || !newPhone.trim()"
            class="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-sm transition-colors disabled:opacity-50">
            إضافة
          </button>
        </div>
      </div>
    </div>

    <!-- Search -->
    <div class="relative max-w-sm">
      <input v-model="search" @input="debouncedLoad" type="text" placeholder="بحث بالاسم أو الرقم..."
        class="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-2.5 pr-10 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500" />
      <svg class="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
    </div>

    <div v-if="loading" class="p-16 text-center text-slate-400 text-sm">جاري تحميل جهات الاتصال...</div>

    <div v-else-if="contacts.length === 0" class="p-12 text-center bg-slate-800/40 rounded-3xl border border-dashed border-slate-700">
      <p class="text-sm text-slate-400">لا توجد جهات اتصال بعد — ارفع ملف CSV أو أضف جهة يدوياً.</p>
    </div>

    <div v-else class="bg-slate-800/80 border border-slate-700/80 rounded-3xl overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm min-w-[600px]">
          <thead>
            <tr class="border-b border-slate-700/80 text-slate-400 text-[11px]">
              <th class="text-right font-bold px-5 py-4">الاسم</th>
              <th class="text-center font-bold px-4 py-4">رقم الهاتف</th>
              <th class="text-center font-bold px-4 py-4">أضيفت</th>
              <th class="text-center font-bold px-4 py-4">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in contacts" :key="c.id" class="border-b border-slate-800/60 hover:bg-slate-800/40 transition-colors">
              <td class="px-5 py-4">
                <div class="flex items-center gap-3">
                  <div class="w-9 h-9 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-500 text-white font-bold flex items-center justify-center text-xs shrink-0">
                    {{ c.name.trim().charAt(0) }}
                  </div>
                  <template v-if="editingId === c.id">
                    <input v-model="editName" type="text" class="bg-slate-900 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500" />
                  </template>
                  <p v-else class="font-bold text-white">{{ c.name }}</p>
                </div>
              </td>
              <td class="px-4 py-4 text-center text-slate-300 font-bold" dir="ltr">+{{ c.phone }}</td>
              <td class="px-4 py-4 text-center text-[11px] text-slate-400" dir="ltr">{{ formatDate(c.created_at) }}</td>
              <td class="px-4 py-4">
                <div class="flex items-center justify-center gap-2">
                  <template v-if="editingId === c.id">
                    <button @click="saveEdit(c)" class="px-2.5 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-[10px] font-bold text-emerald-400">حفظ</button>
                    <button @click="editingId = null" class="px-2.5 py-1.5 rounded-lg bg-slate-700/70 text-[10px] font-bold text-slate-300">إلغاء</button>
                  </template>
                  <template v-else>
                    <button @click="startEdit(c)" class="px-2.5 py-1.5 rounded-lg bg-slate-700/70 hover:bg-slate-700 text-[10px] font-bold text-slate-300">تعديل</button>
                    <button @click="removeContact(c)" class="px-2.5 py-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 text-[10px] font-bold text-red-400">حذف</button>
                  </template>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="pagination.last_page > 1" class="flex items-center justify-center gap-2">
      <button :disabled="pagination.current_page <= 1" @click="load(pagination.current_page - 1)"
        class="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold disabled:opacity-40">السابق</button>
      <span class="text-xs text-slate-400">{{ pagination.current_page }} / {{ pagination.last_page }}</span>
      <button :disabled="pagination.current_page >= pagination.last_page" @click="load(pagination.current_page + 1)"
        class="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold disabled:opacity-40">التالي</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import crm from '@/services/crm';

const loading = ref(true);
const contacts = ref([]);
const search = ref('');
const pagination = ref({ current_page: 1, last_page: 1, total: 0 });
const fileInput = ref(null);
const importing = ref(false);
const importMsg = ref('');
const importOk = ref(true);
const newName = ref('');
const newPhone = ref('');
const adding = ref(false);
const editingId = ref(null);
const editName = ref('');
let debounce = null;

const load = async (page = 1) => {
  loading.value = true;
  try {
    const res = await crm.getContacts({ q: search.value || undefined, page });
    if (res.success) {
      contacts.value = res.contacts || [];
      pagination.value = res.pagination;
    }
  } catch (e) { console.error(e); }
  finally { loading.value = false; }
};

const debouncedLoad = () => {
  clearTimeout(debounce);
  debounce = setTimeout(() => load(1), 350);
};

const uploadCsv = async (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  importing.value = true;
  importMsg.value = '';
  try {
    const fd = new FormData();
    fd.append('file', file);
    const res = await crm.importContacts(fd);
    importOk.value = !!res.success;
    importMsg.value = res.message || (res.success ? 'تم الاستيراد' : 'فشل الاستيراد');
    load(1);
  } catch (err) {
    importOk.value = false;
    importMsg.value = err.response?.data?.message || 'فشل رفع الملف';
  } finally { importing.value = false; }
};

const addContact = async () => {
  adding.value = true;
  try {
    const res = await crm.addContact({ name: newName.value.trim(), phone: newPhone.value.trim() });
    if (res.success) {
      newName.value = '';
      newPhone.value = '';
      importOk.value = true;
      importMsg.value = res.conversations_renamed ? `تمت الإضافة وتحديث ${res.conversations_renamed} محادثة` : 'تمت الإضافة';
      load(1);
    }
  } catch (err) {
    importOk.value = false;
    importMsg.value = err.response?.data?.message || 'فشلت الإضافة';
  } finally { adding.value = false; }
};

const startEdit = (c) => { editingId.value = c.id; editName.value = c.name; };

const saveEdit = async (c) => {
  try {
    await crm.updateContact(c.id, { name: editName.value.trim() });
    editingId.value = null;
    load(pagination.value.current_page);
  } catch (e) { alert('فشل التعديل'); }
};

const removeContact = async (c) => {
  if (!confirm(`حذف "${c.name}" من جهات الاتصال؟`)) return;
  try {
    await crm.deleteContact(c.id);
    load(pagination.value.current_page);
  } catch (e) { alert('فشل الحذف'); }
};

const formatDate = (v) => {
  if (!v) return '—';
  return new Date(v).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' });
};

onMounted(() => load());
</script>
