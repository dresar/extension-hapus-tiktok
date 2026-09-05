// Extension Popup Controller v1.4.0 (Video & Photo Support)

document.addEventListener('DOMContentLoaded', async () => {
  const pulseDot = document.getElementById('pulseDot');
  const statusText = document.getElementById('statusText');
  const detectedVideoId = document.getElementById('detectedVideoId');
  const statSession = document.getElementById('statSession');
  const statTotal = document.getElementById('statTotal');
  const delayInput = document.getElementById('delayInput');
  const limitInput = document.getElementById('limitInput');
  const btnDeleteSingle = document.getElementById('btnDeleteSingle');
  const btnToggleLoop = document.getElementById('btnToggleLoop');
  const btnResetStats = document.getElementById('btnResetStats');
  const btnOpenDocs = document.getElementById('btnOpenDocs');
  const popupToast = document.getElementById('popupToast');

  let activeTabId = null;
  let isRunning = false;

  function showToast(msg, duration = 2500) {
    popupToast.textContent = msg;
    popupToast.classList.add('show');
    setTimeout(() => {
      popupToast.classList.remove('show');
    }, duration);
  }

  // Load saved settings
  const stored = await chrome.storage.local.get(['deletedCount', 'delaySeconds', 'maxDeleteLimit', 'isRunning', 'lastLog']);
  if (stored) {
    statTotal.textContent = stored.deletedCount || 0;
    delayInput.value = stored.delaySeconds || 2;
    limitInput.value = stored.maxDeleteLimit || 0;
    if (stored.isRunning) {
      updateLoopButtonState(true);
    }
  }

  delayInput.addEventListener('change', async (e) => {
    const val = Math.max(1, parseInt(e.target.value, 10) || 2);
    await chrome.storage.local.set({ delaySeconds: val });
  });

  limitInput.addEventListener('change', async (e) => {
    const val = Math.max(0, parseInt(e.target.value, 10) || 0);
    await chrome.storage.local.set({ maxDeleteLimit: val });
  });

  // Query Active Tab
  async function refreshTabInfo() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id) {
        activeTabId = tab.id;
        const url = tab.url || '';

        if (url.includes('tiktok.com')) {
          const match = url.match(/\/(?:video|photo)\/(\d+)/i);
          const type = url.includes('/photo/') ? 'Foto' : 'Video';
          
          if (match) {
            detectedVideoId.textContent = `${type} ID: ${match[1]}`;
            detectedVideoId.style.color = '#25F4EE';
          } else {
            detectedVideoId.textContent = 'Buka video / foto TikTok';
            detectedVideoId.style.color = '#FFAA00';
          }

          chrome.tabs.sendMessage(activeTabId, { action: 'GET_PAGE_STATUS' }, (res) => {
            if (chrome.runtime.lastError) return;
            if (res && res.success) {
              isRunning = res.isRunning;
              statSession.textContent = res.deletedThisSession || 0;
              updateLoopButtonState(isRunning);
            }
          });
        } else {
          detectedVideoId.textContent = 'Bukan halaman TikTok!';
          detectedVideoId.style.color = '#FF5555';
          btnDeleteSingle.disabled = true;
          btnToggleLoop.disabled = true;
        }
      }
    } catch (_) {}
  }

  await refreshTabInfo();
  setInterval(refreshTabInfo, 1200);

  function updateLoopButtonState(running) {
    isRunning = running;
    if (running) {
      pulseDot.className = 'pulse-dot running';
      statusText.className = 'status-text running';
      statusText.textContent = 'RUNNING';
      btnToggleLoop.textContent = '⏹️ HENTIKAN AUTO LOOP';
      btnToggleLoop.className = 'btn btn-stop';
      btnDeleteSingle.disabled = true;
    } else {
      pulseDot.className = 'pulse-dot';
      statusText.className = 'status-text';
      statusText.textContent = 'IDLE';
      btnToggleLoop.textContent = '▶️ Mulai Auto Loop Hapus';
      btnToggleLoop.className = 'btn btn-primary';
      btnDeleteSingle.disabled = false;
    }
  }

  // Delete Single Button
  btnDeleteSingle.addEventListener('click', async () => {
    if (!activeTabId) return;
    btnDeleteSingle.disabled = true;
    showToast('Memproses hapus postingan saat ini...');

    chrome.tabs.sendMessage(activeTabId, { action: 'DELETE_SINGLE' }, (res) => {
      btnDeleteSingle.disabled = false;
      if (chrome.runtime.lastError) {
        showToast('Refresh halaman TikTok terlebih dahulu!');
        return;
      }
      if (res && res.success) {
        showToast(`Sukses! Postingan ${res.oldId} berhasil dihapus.`);
        statSession.textContent = parseInt(statSession.textContent, 10) + 1;
        statTotal.textContent = parseInt(statTotal.textContent, 10) + 1;
      } else {
        showToast(`Gagal: ${res ? res.reason : 'Gagal mengeksekusi'}`);
      }
    });
  });

  // Toggle Loop Button
  btnToggleLoop.addEventListener('click', async () => {
    if (!activeTabId) return;

    if (isRunning) {
      chrome.tabs.sendMessage(activeTabId, { action: 'STOP_LOOP' }, () => {
        updateLoopButtonState(false);
        showToast('Auto Loop dihentikan.');
      });
    } else {
      const delay = Math.max(1, parseInt(delayInput.value, 10) || 2);
      const limit = Math.max(0, parseInt(limitInput.value, 10) || 0);

      chrome.tabs.sendMessage(activeTabId, {
        action: 'START_LOOP',
        delay,
        limit
      }, () => {
        if (chrome.runtime.lastError) {
          showToast('Refresh halaman TikTok terlebih dahulu!');
          return;
        }
        updateLoopButtonState(true);
        showToast('Auto Loop Hapus dimulai!');
      });
    }
  });

  // Reset Stats Button
  btnResetStats.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ action: 'RESET_STATS' });
    statSession.textContent = '0';
    statTotal.textContent = '0';
    showToast('Counter berhasil di-reset.');
  });

  // Open Docs
  btnOpenDocs.addEventListener('click', () => {
    alert(
      'PANDUAN TIKTOK AUTO DELETER (VIDEO & FOTO/SLIDE):\n\n' +
      '1. Buka postingan Video atau Foto/Slide di akun TikTok Anda.\n' +
      '2. Klik icon ekstensi di toolbar Chrome.\n' +
      '3. Klik [Hapus 1 Video/Foto Ini] untuk menghapus 1 postingan saat ini.\n' +
      '4. Klik [Mulai Auto Loop Hapus] untuk menghapus semua postingan (Video & Foto) secara beruntun otomatis.\n' +
      '5. Klik [HENTIKAN AUTO LOOP] kapan saja untuk berhenti.'
    );
  });
});
