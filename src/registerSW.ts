import { registerSW } from 'virtual:pwa-register';

// Register the service worker
const updateSW = registerSW({
  onNeedRefresh() {
    // Show a prompt to user to refresh
    if (confirm('تحديث جديد متاح. هل تريد تحديث التطبيق الآن؟')) {
      updateSW(true);
    }
  },
  onOfflineReady() {
    console.log('التطبيق جاهز للعمل بدون إنترنت');
  },
  immediate: true
});
