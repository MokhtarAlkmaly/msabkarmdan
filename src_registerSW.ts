import { Workbox } from 'workbox-window';

if ('serviceWorker' in navigator) {
  const wb = new Workbox('/sw.js');
  
  wb.addEventListener('controlling', () => {
    window.location.reload();
  });

  wb.addEventListener('installed', () => {
    console.log('Service Worker installed');
  });

  wb.addEventListener('waiting', () => {
    console.log('New Service Worker waiting to activate');
  });

  wb.register();
}