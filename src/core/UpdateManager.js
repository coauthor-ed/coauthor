export const UpdateManager = {
  _waitingWorker: null,
  
  init() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'update-available') {
          console.log("[UpdateManager] Update available.");
          // Trigger custom event so UI (UpdateToast) can show prompt safely
          window.dispatchEvent(new CustomEvent('app-update-available'));
        }
      });

      // Get existing registration to attach update listeners
      navigator.serviceWorker.ready.then(reg => {
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              this._waitingWorker = newWorker;
              window.dispatchEvent(new CustomEvent('app-update-available'));
            }
          });
        });
      });
    }
  },

  applyUpdate() {
    if (this._waitingWorker) {
      this._waitingWorker.postMessage('skipWaiting');
    } else if (navigator.serviceWorker) {
      navigator.serviceWorker.getRegistration().then(reg => {
        if (reg && reg.waiting) {
          reg.waiting.postMessage('skipWaiting');
        }
      });
    }
    // Reload happens automatically when skipWaiting causes activate, 
    // but we can also just force reload if preferred.
    setTimeout(() => window.location.reload(), 500);
  }
};
