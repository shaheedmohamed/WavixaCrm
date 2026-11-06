<template>
  <div class="h-full overflow-y-auto p-4 md:p-8 space-y-6" dir="rtl">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 class="text-2xl md:text-3xl font-black text-white">API Keys</h1>
        <p class="text-slate-400 text-sm mt-1">أنشئ مفتاح API لأجهزتك المتصلة وابعت رسائل واتساب من أي نظام خارجي</p>
      </div>
      <div class="flex items-center gap-2 self-start sm:self-auto">
        <div class="flex bg-slate-800/80 border border-slate-700 rounded-xl p-1 text-xs font-bold">
          <button
            @click="tab = 'keys'"
            class="px-4 py-1.5 rounded-lg transition-colors"
            :class="tab === 'keys' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'"
          >المفاتيح</button>
          <button
            @click="tab = 'docs'"
            class="px-4 py-1.5 rounded-lg transition-colors"
            :class="tab === 'docs' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'"
          >API Docs</button>
        </div>
        <button
          v-if="tab === 'keys'"
          @click="openCreate"
          class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-600/20 transition-all"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
          مفتاح جديد
        </button>
      </div>
    </div>

    <!-- ============================== KEYS TAB ============================== -->
    <template v-if="tab === 'keys'">
      <div v-if="notice" class="px-5 py-3.5 rounded-2xl border text-sm font-bold"
        :class="noticeOk ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'">
        {{ notice }}
      </div>

      <div v-if="loading" class="p-16 text-center text-slate-400 text-sm">جاري تحميل المفاتيح...</div>

      <div v-else-if="!keys.length" class="p-12 text-center bg-slate-800/40 rounded-3xl border border-dashed border-slate-700 space-y-3">
        <svg class="w-12 h-12 mx-auto text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/></svg>
        <p class="text-sm text-slate-400">لسه مفيش مفاتيح — اعمل أول مفتاح وابدأ التكامل من تبويب API Docs.</p>
      </div>

      <div v-else class="bg-slate-800/80 border border-slate-700/80 rounded-3xl overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm min-w-[820px]">
            <thead>
              <tr class="border-b border-slate-700/80 text-slate-400 text-[11px]">
                <th class="text-right font-bold px-5 py-4">الاسم / المفتاح</th>
                <th class="text-center font-bold px-4 py-4">الجهاز</th>
                <th class="text-center font-bold px-4 py-4">الطلبات</th>
                <th class="text-center font-bold px-4 py-4">آخر استخدام</th>
                <th class="text-center font-bold px-4 py-4">الحالة</th>
                <th class="text-center font-bold px-4 py-4">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="k in keys" :key="k.id" class="border-b border-slate-800/60 hover:bg-slate-800/40 transition-colors">
                <td class="px-5 py-4">
                  <div class="font-bold text-white text-sm">{{ k.name }}</div>
                  <div class="text-[11px] text-slate-500 font-mono mt-0.5" dir="ltr">{{ k.prefix }}…</div>
                </td>
                <td class="px-4 py-4 text-center">
                  <span v-if="k.whatsapp_session" class="inline-flex items-center gap-1.5 text-[11px] text-slate-300" dir="ltr">
                    +{{ k.whatsapp_session.phone_number }}
                  </span>
                  <span v-else class="text-[11px] text-slate-500">أي جهاز متصل</span>
                </td>
                <td class="px-4 py-4 text-center font-mono text-slate-300" dir="ltr">{{ k.requests_count ?? 0 }}</td>
                <td class="px-4 py-4 text-center text-[11px] text-slate-400">
                  {{ k.last_used_at ? fmtDate(k.last_used_at) : '—' }}
                </td>
                <td class="px-4 py-4 text-center">
                  <button
                    @click="toggleKey(k)"
                    class="px-2.5 py-1 rounded-full text-[10px] font-black transition-colors"
                    :class="k.is_active ? 'bg-emerald-500/15 text-emerald-400 hover:bg-red-500/15 hover:text-red-400' : 'bg-slate-700/60 text-slate-400 hover:bg-emerald-500/15 hover:text-emerald-400'"
                    :title="k.is_active ? 'اضغط للتعطيل' : 'اضغط للتفعيل'"
                  >{{ k.is_active ? 'نشط' : 'معطل' }}</button>
                </td>
                <td class="px-4 py-4">
                  <div class="flex items-center justify-center gap-1.5">
                    <button @click="openLogs(k)" class="p-1.5 rounded-lg text-slate-400 hover:text-sky-400 hover:bg-slate-700/60 transition-colors" title="سجل الطلبات">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/></svg>
                    </button>
                    <button @click="regenerate(k)" class="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-700/60 transition-colors" title="تجديد المفتاح">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                    </button>
                    <button @click="removeKey(k)" class="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-700/60 transition-colors" title="حذف">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <!-- ============================== DOCS TAB ============================== -->
    <template v-else>
      <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
        <div class="space-y-4">
          <!-- Auth -->
          <div class="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-5">
            <h2 class="font-black text-white text-sm mb-3">المصادقة</h2>
            <p class="text-xs text-slate-400 leading-relaxed mb-3">
              كل الطلبات بتتبعت على الـ base URL ده مع المفتاح في الـ header:
            </p>
            <div class="flex items-center gap-2 bg-slate-900/80 border border-slate-700 rounded-xl px-3 py-2 mb-2">
              <code class="text-emerald-400 text-xs font-mono flex-1" dir="ltr">{{ baseUrl }}</code>
              <button @click="copy(baseUrl)" class="text-slate-400 hover:text-white" title="نسخ"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg></button>
            </div>
            <code class="block bg-slate-900/80 border border-slate-700 rounded-xl px-3 py-2 text-[11px] font-mono text-slate-300" dir="ltr">X-API-Key: wav_xxxxxxxxxxxx</code>
            <p class="text-[10px] text-slate-500 mt-2">أو <code dir="ltr">Authorization: Bearer wav_xxxxxxxxxxxx</code> — الاتنين شغالين.</p>
          </div>

          <!-- Endpoints -->
          <div
            v-for="ep in endpoints"
            :key="ep.path"
            class="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-5"
          >
            <div class="flex items-center gap-2 mb-2">
              <span class="px-2 py-0.5 rounded text-[10px] font-black"
                :class="ep.method === 'POST' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-sky-500/15 text-sky-400'">{{ ep.method }}</span>
              <code class="text-xs font-mono text-white" dir="ltr">{{ ep.path }}</code>
            </div>
            <p class="text-xs text-slate-400 mb-3">{{ ep.desc }}</p>
            <div v-if="ep.params?.length" class="mb-3">
              <div class="text-[10px] font-black text-slate-500 mb-1">Parameters</div>
              <div class="space-y-1">
                <div v-for="p in ep.params" :key="p.name" class="flex items-baseline gap-2 text-[11px] font-mono" dir="ltr">
                  <code class="text-emerald-400 shrink-0">{{ p.name }}</code>
                  <span class="text-slate-500">{{ p.req ? 'required' : 'optional' }} ·</span>
                  <span class="text-slate-400">{{ p.desc }}</span>
                </div>
              </div>
            </div>
            <div class="relative">
              <pre class="bg-slate-950/80 border border-slate-800 rounded-xl p-3 text-[10px] font-mono text-slate-300 overflow-x-auto whitespace-pre" dir="ltr">{{ ep.curl }}</pre>
              <button @click="copy(ep.curl)" class="absolute top-2 left-2 text-slate-500 hover:text-white" title="نسخ">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
              </button>
            </div>
          </div>
        </div>

        <!-- Test console -->
        <div class="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-5 xl:sticky xl:top-4 space-y-4">
          <h2 class="font-black text-white text-sm">جرّب الـ API من هنا</h2>
          <div>
            <label class="block text-[11px] font-bold text-slate-400 mb-1">API Key</label>
            <input v-model="testKey" type="text" placeholder="wav_xxxxxxxxxxxx" dir="ltr"
              class="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-3 py-2.5 text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500" />
          </div>
          <div>
            <label class="block text-[11px] font-bold text-slate-400 mb-1">Endpoint</label>
            <select v-model="testEndpoint" dir="ltr"
              class="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-3 py-2.5 text-xs font-mono text-white focus:outline-none focus:border-emerald-500">
              <option v-for="ep in endpoints" :key="ep.path" :value="ep">{{ ep.method }} {{ ep.path }}</option>
            </select>
          </div>
          <div v-if="testEndpoint?.needsTo">
            <label class="block text-[11px] font-bold text-slate-400 mb-1">إلى (رقم دولي)</label>
            <input v-model="testTo" type="text" placeholder="2010xxxxxxxx" dir="ltr"
              class="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-3 py-2.5 text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500" />
          </div>
          <div v-if="testEndpoint?.needsMessage">
            <label class="block text-[11px] font-bold text-slate-400 mb-1">الرسالة</label>
            <textarea v-model="testMessage" rows="3" placeholder="نص الرسالة…"
              class="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"></textarea>
          </div>
          <button
            @click="runTest"
            :disabled="testing || !testKey.trim() || !testEndpoint"
            class="w-full px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition-colors disabled:opacity-50"
          >{{ testing ? 'جاري الإرسال…' : 'إرسال الطلب' }}</button>
          <div v-if="testResult" class="space-y-2">
            <div class="flex items-center gap-2">
              <span class="text-[11px] font-bold text-slate-400">Response</span>
              <span class="px-2 py-0.5 rounded text-[10px] font-black"
                :class="testResult.status < 300 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'">{{ testResult.status }}</span>
            </div>
            <pre class="bg-slate-950/80 border border-slate-800 rounded-xl p-3 text-[10px] font-mono text-slate-300 overflow-x-auto max-h-72 overflow-y-auto whitespace-pre-wrap" dir="ltr">{{ JSON.stringify(testResult.data, null, 2) }}</pre>
          </div>
          <p class="text-[10px] text-slate-500 leading-relaxed">
            ملحوظة: send-message بيحط الرسالة في قائمة الإرسال — الحالة بتتأكد منها عبر
            <code dir="ltr">GET /public/whatsapp/message-status/{id}</code>.
          </p>
        </div>
      </div>
    </template>

    <!-- ============================== CREATE MODAL ============================== -->
    <div v-if="showCreate" class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" @click.self="showCreate = false">
      <div class="bg-slate-800 border border-slate-700 rounded-3xl w-full max-w-md p-6 space-y-4">
        <h3 class="font-black text-white text-lg">مفتاح API جديد</h3>
        <div>
          <label class="block text-[11px] font-bold text-slate-400 mb-1">اسم المفتاح *</label>
          <input v-model="form.name" type="text" placeholder="مثال: تكامل متجري / n8n"
            class="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500" />
        </div>
        <div>
          <label class="block text-[11px] font-bold text-slate-400 mb-1">الجهاز</label>
          <select v-model="form.whatsapp_session_id"
            class="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500">
            <option :value="null">أي جهاز متصل (تلقائي)</option>
            <option v-for="d in connectedDevices" :key="d.id" :value="d.id">
              {{ d.device_name || 'جهاز' }} — +{{ d.phone_number }}
            </option>
          </select>
          <p v-if="!connectedDevices.length" class="text-[10px] text-amber-400 mt-1">مفيش جهاز متصل دلوقتي — المفتاح هيفضل جاهز لما الجهاز يتصل.</p>
        </div>
        <div>
          <label class="block text-[11px] font-bold text-slate-400 mb-1">تاريخ الانتهاء (اختياري)</label>
          <input v-model="form.expires_at" type="datetime-local" dir="ltr"
            class="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500" />
        </div>
        <div v-if="createError" class="text-xs text-red-400 font-bold">{{ createError }}</div>
        <div class="flex gap-2 pt-1">
          <button @click="createKey" :disabled="creating || !form.name.trim()"
            class="flex-1 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition-colors disabled:opacity-50">
            {{ creating ? 'جاري الإنشاء…' : 'إنشاء المفتاح' }}
          </button>
          <button @click="showCreate = false" class="px-4 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-bold text-sm transition-colors">إلغاء</button>
        </div>
      </div>
    </div>

    <!-- ============================== KEY REVEAL MODAL ============================== -->
    <div v-if="revealedKey" class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div class="bg-slate-800 border border-slate-700 rounded-3xl w-full max-w-lg p-6 space-y-4">
        <h3 class="font-black text-white text-lg">احفظ المفتاح — بيظهر مرة واحدة بس</h3>
        <div class="flex items-center gap-2 bg-slate-950/80 border border-emerald-500/40 rounded-xl px-3 py-3">
          <code class="text-emerald-400 text-xs font-mono flex-1 break-all" dir="ltr">{{ revealedKey }}</code>
          <button @click="copy(revealedKey)" class="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-slate-800 transition-colors" title="نسخ">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
          </button>
        </div>
        <p class="text-[11px] text-amber-400 leading-relaxed">الصقه في تبويب API Docs تحت "جرّب الـ API" أو استخدمه في الـ header بتاع التكامل بتاعك. مش هتقدر تشوفه تاني — لو ضاع اعمل تجديد.</p>
        <button @click="revealedKey = null" class="w-full px-4 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-bold text-sm transition-colors">تمام، حفظته</button>
      </div>
    </div>

    <!-- ============================== LOGS MODAL ============================== -->
    <div v-if="logsFor" class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" @click.self="logsFor = null">
      <div class="bg-slate-800 border border-slate-700 rounded-3xl w-full max-w-2xl p-6 space-y-4">
        <div class="flex items-center justify-between">
          <h3 class="font-black text-white text-lg">سجل طلبات "{{ logsFor.name }}"</h3>
          <button @click="logsFor = null" class="text-slate-400 hover:text-white"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg></button>
        </div>
        <div v-if="loadingLogs" class="p-8 text-center text-slate-400 text-sm">جاري التحميل…</div>
        <div v-else-if="!logs.length" class="p-8 text-center text-slate-500 text-sm">مفيش طلبات مسجلة لسه.</div>
        <div v-else class="max-h-96 overflow-y-auto space-y-1">
          <div v-for="l in logs" :key="l.id" class="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-900/60 text-[11px]">
            <span class="px-1.5 py-0.5 rounded font-black shrink-0"
              :class="l.status_code < 300 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'">{{ l.status_code }}</span>
            <code class="font-mono text-slate-300 flex-1 truncate" dir="ltr">{{ l.method }} /{{ l.endpoint }}</code>
            <span class="text-slate-500 shrink-0">{{ fmtDate(l.created_at) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import crm from '@/services/crm';

const tab = ref('keys');
const keys = ref([]);
const loading = ref(true);
const notice = ref('');
const noticeOk = ref(true);

const devices = ref([]);
const connectedDevices = computed(() => devices.value.filter((d) => d.status === 'connected'));

const showCreate = ref(false);
const creating = ref(false);
const createError = ref('');
const form = ref({ name: '', whatsapp_session_id: null, expires_at: '' });
const revealedKey = ref('');

const logsFor = ref(null);
const logs = ref([]);
const loadingLogs = ref(false);

const testKey = ref('');
const testEndpoint = ref(null);
const testTo = ref('');
const testMessage = ref('');
const testing = ref(false);
const testResult = ref(null);

const baseUrl = computed(() => `${window.location.origin}/api/public`);

const endpoints = computed(() => {
  const base = baseUrl.value;
  return [
    {
      method: 'POST', path: '/whatsapp/send-message', needsTo: true, needsMessage: true,
      desc: 'إرسال رسالة نصية لرقم واتساب (بالصيغة الدولية من غير +).',
      params: [
        { name: 'to', req: true, desc: 'Recipient phone, e.g. 2010xxxxxxxx' },
        { name: 'message', req: true, desc: 'Message text (max 4000 chars)' },
        { name: 'device', req: false, desc: 'Session id / token / phone — overrides the key-bound device' },
        { name: 'scheduled_at', req: false, desc: 'ISO datetime — send later' },
      ],
      curl: `curl -X POST ${base}/whatsapp/send-message \\\n  -H "X-API-Key: wav_YOUR_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"to":"2010xxxxxxxx","message":"أهلاً من الـ API"}'`,
    },
    {
      method: 'POST', path: '/whatsapp/send-image',
      desc: 'إرسال صورة بالـ URL أو base64 مع caption اختياري.',
      params: [
        { name: 'to', req: true, desc: 'Recipient phone' },
        { name: 'image_url', req: true, desc: 'Public image URL (or "content" base64)' },
        { name: 'caption', req: false, desc: 'Caption text' },
      ],
      curl: `curl -X POST ${base}/whatsapp/send-image \\\n  -H "X-API-Key: wav_YOUR_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"to":"2010xxxxxxxx","image_url":"https://example.com/pic.jpg","caption":"شوف الصورة"}'`,
    },
    {
      method: 'POST', path: '/whatsapp/send-file',
      desc: 'إرسال ملف/مستند (PDF، Excel، إلخ) بالـ URL أو base64.',
      params: [
        { name: 'to', req: true, desc: 'Recipient phone' },
        { name: 'file_url', req: true, desc: 'Public file URL (or "content" base64)' },
        { name: 'file_name', req: false, desc: 'Filename shown to the recipient' },
      ],
      curl: `curl -X POST ${base}/whatsapp/send-file \\\n  -H "X-API-Key: wav_YOUR_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"to":"2010xxxxxxxx","file_url":"https://example.com/report.pdf","file_name":"report.pdf"}'`,
    },
    {
      method: 'GET', path: '/whatsapp/message-status/{id}',
      desc: 'حالة رسالة أرسلتها (queued → sent → delivered → read).',
      params: [{ name: 'id', req: true, desc: 'The message_id returned by the send endpoints' }],
      curl: `curl ${base}/whatsapp/message-status/123 \\\n  -H "X-API-Key: wav_YOUR_KEY"`,
    },
    {
      method: 'GET', path: '/whatsapp/queue-status',
      desc: 'عدد الرسائل في قائمة الإرسال بتاعتك دلوقتي.',
      params: [],
      curl: `curl ${base}/whatsapp/queue-status \\\n  -H "X-API-Key: wav_YOUR_KEY"`,
    },
    {
      method: 'GET', path: '/status',
      desc: 'تأكد إن المفتاح شغال وبيرجع بيانات الحساب.',
      params: [],
      curl: `curl ${base}/status \\\n  -H "X-API-Key: wav_YOUR_KEY"`,
    },
  ];
});

const fmtDate = (d) => {
  try { return new Date(d).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' }); }
  catch { return d; }
};

const flash = (msg, ok = true) => {
  notice.value = msg;
  noticeOk.value = ok;
  setTimeout(() => (notice.value = ''), 5000);
};

const load = async () => {
  loading.value = true;
  try {
    const res = await crm.getApiKeys();
    keys.value = res?.data?.data || [];
  } catch (e) {
    flash(e.response?.data?.message || 'تعذر تحميل المفاتيح', false);
  } finally {
    loading.value = false;
  }
};

const openCreate = async () => {
  createError.value = '';
  form.value = { name: '', whatsapp_session_id: null, expires_at: '' };
  showCreate.value = true;
  if (!devices.value.length) {
    try {
      const res = await crm.getDevices();
      devices.value = res?.devices || res?.data || [];
    } catch {}
  }
};

const createKey = async () => {
  creating.value = true;
  createError.value = '';
  try {
    const res = await crm.createApiKey({
      name: form.value.name.trim(),
      whatsapp_session_id: form.value.whatsapp_session_id,
      expires_at: form.value.expires_at || null,
      permissions: ['send_messages', 'read_message_status', 'read_sessions'],
    });
    if (res.success) {
      revealedKey.value = res.data.key;
      testKey.value = res.data.key;
      showCreate.value = false;
      await load();
      flash('اتعمل المفتاح بنجاح');
    } else {
      createError.value = res.message || 'فشل إنشاء المفتاح';
    }
  } catch (e) {
    const errs = e.response?.data?.errors;
    createError.value = errs ? Object.values(errs).flat()[0] : (e.response?.data?.message || 'فشل إنشاء المفتاح');
  } finally {
    creating.value = false;
  }
};

const toggleKey = async (k) => {
  try {
    await crm.updateApiKey(k.id, { is_active: !k.is_active });
    k.is_active = !k.is_active;
  } catch (e) {
    flash(e.response?.data?.message || 'فشل التحديث', false);
  }
};

const regenerate = async (k) => {
  if (!confirm(`تجديد مفتاح "${k.name}"؟ المفتاح القديم هيقف فورًا.`)) return;
  try {
    const res = await crm.regenerateApiKey(k.id);
    if (res.success) {
      revealedKey.value = res.data.key;
      testKey.value = res.data.key;
      await load();
    }
  } catch (e) {
    flash(e.response?.data?.message || 'فشل التجديد', false);
  }
};

const removeKey = async (k) => {
  if (!confirm(`حذف مفتاح "${k.name}" نهائيًا؟ أي تكامل بيستخدمه هيقف.`)) return;
  try {
    await crm.deleteApiKey(k.id);
    keys.value = keys.value.filter((x) => x.id !== k.id);
    flash('اتحذف المفتاح');
  } catch (e) {
    flash(e.response?.data?.message || 'فشل الحذف', false);
  }
};

const openLogs = async (k) => {
  logsFor.value = k;
  logs.value = [];
  loadingLogs.value = true;
  try {
    const res = await crm.getApiKeyLogs(k.id);
    logs.value = res?.data?.data || [];
  } catch {} finally {
    loadingLogs.value = false;
  }
};

const copy = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    flash('اتنسخ');
  } catch {}
};

const runTest = async () => {
  testing.value = true;
  testResult.value = null;
  try {
    const ep = testEndpoint.value;
    const payload = {};
    if (ep.needsTo) payload.to = testTo.value.trim();
    if (ep.needsMessage) payload.message = testMessage.value;
    const path = ep.path.replace('{id}', payload.to ? '' : '1');
    const res = await crm.publicApiRequest(path, testKey.value.trim(), payload, ep.method.toLowerCase());
    testResult.value = res;
  } catch (e) {
    testResult.value = { status: 0, data: { success: false, message: e.message } };
  } finally {
    testing.value = false;
  }
};

onMounted(load);
</script>
