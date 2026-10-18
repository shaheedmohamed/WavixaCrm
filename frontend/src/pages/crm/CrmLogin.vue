<template>
  <div class="min-h-screen bg-slate-900 flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden font-sans" dir="rtl">
    <!-- Ambient background glow -->
    <div class="absolute top-1/4 -right-20 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>
    <div class="absolute bottom-1/4 -left-20 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>

    <div class="w-full max-w-md relative z-10">
      <!-- Logo & Header -->
      <div class="text-center mb-8">
        <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 shadow-xl shadow-emerald-500/20 mb-4 ring-8 ring-emerald-500/10">
          <svg class="w-9 h-9 text-white"   viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
          </svg>
        </div>
        <h1 class="text-3xl font-black text-white tracking-tight">Wavixa CRM</h1>
        <p class="text-slate-400 mt-2 text-sm font-medium">نظام إدارة محادثات الواتساب وخدمة العملاء</p>
      </div>

      <!-- Login Card -->
      <div class="bg-slate-800/90 backdrop-blur-xl border border-slate-700/70 rounded-3xl p-8 shadow-2xl shadow-black/40">
        <!-- Error Alert -->
        <div v-if="errorMsg" class="mb-6 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm flex items-start gap-3">
          <svg class="w-5 h-5 text-rose-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span class="flex-1">{{ errorMsg }}</span>
        </div>

        <form @submit.prevent="handleLogin" class="space-y-5">
          <!-- Email Input -->
          <div>
            <label class="block text-xs font-semibold text-slate-300 mb-2">البريد الإلكتروني</label>
            <div class="relative">
              <input
                v-model="email"
                type="email"
                required
                placeholder="name@company.com"
                dir="ltr"
                class="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all font-mono"
              />
              <div class="absolute inset-y-0 right-3 flex items-center pointer-events-none text-slate-500">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                </svg>
              </div>
            </div>
          </div>

          <!-- Password Input -->
          <div>
            <label class="block text-xs font-semibold text-slate-300 mb-2">كلمة المرور</label>
            <div class="relative">
              <input
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                required
                placeholder="••••••••"
                dir="ltr"
                class="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all font-mono"
              />
              <button
                type="button"
                @click="showPassword = !showPassword"
                class="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-white"
              >
                <svg v-if="!showPassword" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                </svg>
              </button>
            </div>
          </div>

          <!-- Submit Button -->
          <button
            type="submit"
            :disabled="loading"
            class="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold py-3.5 px-4 rounded-xl shadow-lg shadow-emerald-600/30 transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            <svg v-if="loading" class="animate-spin -ml-1 mr-2 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>{{ loading ? 'جاري التحقق...' : 'تسجيل الدخول إلى CRM' }}</span>
          </button>
        </form>
      </div>

      <!-- Footer Info -->
      <div class="text-center mt-6 text-xs text-slate-500">
        &copy; 2026 Wavixa Platform — نظام المحادثات وخدمة العملاء متعدد الأجهزة
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import crm from '@/services/crm';

const router = useRouter();

const email = ref('');
const password = ref('');
const showPassword = ref(false);
const loading = ref(false);
const errorMsg = ref('');

const handleLogin = async () => {
  errorMsg.value = '';
  loading.value = true;
  try {
    const res = await crm.login(email.value, password.value);
    if (res.success) {
      if (res.user?.crm_role === 'admin') {
        router.push('/crm/admin');
      } else if (res.user?.crm_role === 'agent') {
        router.push('/crm/chat');
      } else {
        router.push('/crm/dashboard');
      }
    } else {
      errorMsg.value = res.message || 'فشل تسجيل الدخول';
    }
  } catch (err) {
    errorMsg.value = err.response?.data?.message || 'حدث خطأ أثناء الاتصال بالخادم';
  } finally {
    loading.value = false;
  }
};
</script>
