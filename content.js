// TikTok Auto Video & Photo Deleter - Automation Core Engine v1.4.0
(function () {
  'use strict';

  if (window.__TT_DELETER_INJECTED__) return;
  window.__TT_DELETER_INJECTED__ = true;

  console.log('[TikTok Deleter v1.4.0] Ready & active on:', window.location.href);

  const state = {
    isRunning: false,
    delaySeconds: 2,
    maxLimit: 0,
    deletedThisSession: 0,
    lastLog: ''
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Supports both /video/<id> and /photo/<id> (slides/carousels)
  function getPostIdFromUrl(url = window.location.href) {
    const match = url.match(/\/(?:video|photo)\/(\d+)/i);
    return match ? match[1] : null;
  }

  function getPostType(url = window.location.href) {
    if (url.includes('/photo/')) return 'Foto/Slide';
    if (url.includes('/video/')) return 'Video';
    return 'Post';
  }

  function isElementVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function getElementText(el) {
    return (el.innerText || el.textContent || '').trim().toLowerCase();
  }

  function setLog(msg, type = 'info') {
    state.lastLog = msg;
    console.log(`[TikTok Deleter v1.4.0] ${msg}`);
    try {
      chrome.storage.local.set({ lastLog: msg, lastLogType: type });
    } catch (_) {}
  }

  // Realistic pointer & mouse event simulation with coordinates + React fiber trigger
  function forceClickElement(el) {
    if (!el) return false;
    try {
      el.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
      const rect = el.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;

      const eventInit = {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window,
        clientX: x,
        clientY: y,
        screenX: x,
        screenY: y,
        pageX: x + window.scrollX,
        pageY: y + window.scrollY,
        buttons: 1,
        button: 0
      };

      // 1. Dispatch pointer events
      el.dispatchEvent(new PointerEvent('pointerover', eventInit));
      el.dispatchEvent(new PointerEvent('pointerenter', eventInit));
      el.dispatchEvent(new MouseEvent('mouseover', eventInit));
      el.dispatchEvent(new PointerEvent('pointerdown', { ...eventInit, isPrimary: true }));
      el.dispatchEvent(new MouseEvent('mousedown', eventInit));
      el.focus();
      el.dispatchEvent(new PointerEvent('pointerup', { ...eventInit, isPrimary: true }));
      el.dispatchEvent(new MouseEvent('mouseup', eventInit));
      el.dispatchEvent(new MouseEvent('click', eventInit));

      // 2. Native click
      if (typeof el.click === 'function') {
        el.click();
      }

      // 3. React Fiber Direct Event Trigger (if React synthetic handler is attached)
      try {
        const reactPropKey = Object.keys(el).find((k) => k.startsWith('__reactProps') || k.startsWith('__reactEvents') || k.startsWith('__reactEventHandlers'));
        if (reactPropKey && el[reactPropKey]) {
          const props = el[reactPropKey];
          if (typeof props.onClick === 'function') {
            props.onClick({ stopPropagation: () => {}, preventDefault: () => {}, target: el, currentTarget: el });
          }
          if (typeof props.onPointerDown === 'function') {
            props.onPointerDown({ stopPropagation: () => {}, preventDefault: () => {}, target: el, currentTarget: el });
          }
        }
      } catch (err) {
        console.debug('React props trigger notice:', err);
      }

      // 4. Also trigger on parent if wrapped
      if (el.parentElement && el.parentElement !== document.body) {
        el.parentElement.dispatchEvent(new MouseEvent('click', eventInit));
      }

      return true;
    } catch (e) {
      console.warn('[TikTok Deleter] Force click fallback', e);
      try { el.click(); } catch (_) {}
      return true;
    }
  }

  // 1. Locate 3-Dots (...) Button for both Video & Photo posts
  function findMoreOptionsButton() {
    const exactSvgSelectors = [
      'svg.e16hh9sl1',
      'svg[class*="StyledEllipsisHorizontal"]',
      'svg[class*="EllipsisHorizontal"]',
      'svg[class*="StyledEllipsis"]',
      'svg[viewBox="0 0 48 48"][data-e2e]',
      '[data-e2e="more-button"]',
      '[data-e2e="video-more-button"]',
      '[data-e2e="photo-more-button"]',
      '[data-e2e="action-more"]'
    ];

    for (const sel of exactSvgSelectors) {
      const elements = Array.from(document.querySelectorAll(sel));
      for (const el of elements) {
        if (!isElementVisible(el)) continue;
        const btn = el.closest('button') || el.closest('div[role="button"]') || el.parentElement || el;
        if (btn && isElementVisible(btn)) return btn;
      }
    }

    const candidates = Array.from(document.querySelectorAll('button, div[role="button"], span[role="button"]'));
    for (const btn of candidates) {
      if (!isElementVisible(btn)) continue;

      const label = (btn.getAttribute('aria-label') || btn.getAttribute('title') || '').toLowerCase();
      if (label.includes('more') || label.includes('lainnya') || label.includes('opsi') || label.includes('option')) {
        return btn;
      }

      const svg = btn.querySelector('svg');
      if (svg) {
        const svgContent = (svg.innerHTML || '').toLowerCase();
        if (svgContent.includes('circle') || svgContent.includes('ellipse') || svg.querySelectorAll('circle').length === 3) {
          return btn;
        }
      }

      const text = getElementText(btn);
      if (text === '...' || text === '•••' || text === '⋯' || text === '…') {
        return btn;
      }
    }

    return null;
  }

  // 2. Poll for "Hapus" / "Delete" item in opened menu
  async function waitForDeleteMenuItem(timeoutMs = 2500) {
    const deleteKeywords = ['hapus', 'delete', 'supprimer', 'eliminar', 'löschen', 'remover', 'excluir'];
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const candidates = Array.from(document.querySelectorAll('[role="menuitem"], [role="option"], li, button, div, span, p, a'));
      
      for (const el of candidates) {
        if (!isElementVisible(el)) continue;
        const text = getElementText(el);
        if (deleteKeywords.includes(text) || (deleteKeywords.some((kw) => text === kw || text.startsWith(kw)) && text.length < 15)) {
          return el;
        }
      }
      await sleep(100);
    }
    return null;
  }

  // 3. Exact Locator for Modal Confirm "Hapus" Button (both video & photo)
  async function waitForConfirmModalButton(timeoutMs = 3500) {
    const exactModalDeleteSelectors = [
      'button[data-e2e="video-modal-delete"]',
      'button[data-e2e="photo-modal-delete"]',
      'button[data-e2e*="modal-delete"]',
      'button.e1ag0nih1',
      'button[class*="ButtonConfirm"]',
      '[data-e2e*="modal-delete"]'
    ];

    const deleteKeywords = ['hapus', 'delete', 'supprimer', 'eliminar', 'löschen', 'remover', 'excluir'];
    const cancelKeywords = ['batal', 'cancel', 'annuler', 'cancelar', 'tidak', 'no'];
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      // Priority 1: Exact data-e2e or classes
      for (const sel of exactModalDeleteSelectors) {
        const el = document.querySelector(sel);
        if (el && isElementVisible(el)) {
          return el;
        }
      }

      // Priority 2: Find modal dialog and locate its confirm button
      const dialogs = Array.from(document.querySelectorAll('[role="dialog"], [aria-modal="true"], div[class*="modal" i], div[class*="popup" i], div[class*="confirm" i]'));
      for (const dialog of dialogs) {
        if (!isElementVisible(dialog)) continue;
        const btns = Array.from(dialog.querySelectorAll('button, div[role="button"], span[role="button"], div, span'));
        for (const btn of btns) {
          if (!isElementVisible(btn)) continue;
          const text = getElementText(btn);
          if (cancelKeywords.some((ck) => text === ck || text.includes(ck))) continue;
          if (deleteKeywords.some((dk) => text === dk || text.startsWith(dk))) {
            return btn;
          }
        }
      }

      // Priority 3: Fallback search text
      const allButtons = Array.from(document.querySelectorAll('button, div[role="button"]'));
      for (const btn of allButtons) {
        if (!isElementVisible(btn)) continue;
        const text = getElementText(btn);
        if (deleteKeywords.some((dk) => text === dk)) {
          return btn;
        }
      }

      await sleep(100);
    }
    return null;
  }

  // Next Post Navigation Trigger (Video or Photo)
  function navigateToNextPost() {
    const nextBtns = Array.from(document.querySelectorAll('button[aria-label*="next" i], button[aria-label*="berikut" i], [data-e2e="arrow-right"], [data-e2e="arrow-down"]'));
    for (const btn of nextBtns) {
      if (isElementVisible(btn)) {
        forceClickElement(btn);
        return;
      }
    }
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, which: 40, bubbles: true }));
  }

  // Single Deletion Sequence
  async function executeSingleDeletion() {
    const currentId = getPostIdFromUrl();
    const postType = getPostType();

    if (!currentId) {
      setLog('Bukan halaman Video atau Foto TikTok yang valid!', 'error');
      return { success: false, reason: 'NOT_A_VALID_POST_PAGE' };
    }

    setLog(`Memproses ${postType} ID: ${currentId}...`, 'info');

    // 1. Click 3-Dots (...) Button
    let moreBtn = findMoreOptionsButton();
    if (!moreBtn) {
      setLog('Mencari tombol [...] opsi postingan...', 'warn');
      await sleep(400);
      moreBtn = findMoreOptionsButton();
    }

    if (!moreBtn) {
      setLog('Tombol [...] opsi tidak ditemukan. Pastikan postingan milik akun Anda.', 'error');
      return { success: false, reason: 'MORE_BUTTON_NOT_FOUND' };
    }

    setLog('Menekan tombol [...] opsi...', 'info');
    forceClickElement(moreBtn);

    // 2. Click "Hapus" in Dropdown
    setLog('Mencari menu [Hapus]...', 'info');
    let deleteMenuItem = await waitForDeleteMenuItem(2000);

    if (!deleteMenuItem) {
      forceClickElement(moreBtn);
      deleteMenuItem = await waitForDeleteMenuItem(1500);
      if (!deleteMenuItem) {
        setLog('Menu [Hapus] tidak muncul di dropdown.', 'error');
        return { success: false, reason: 'DELETE_MENU_NOT_FOUND' };
      }
    }

    setLog('Menekan menu [Hapus]...', 'info');
    forceClickElement(deleteMenuItem);

    // 3. Click Confirm "Hapus" on Modal Dialog
    setLog('Mencari tombol konfirmasi [Hapus] di modal...', 'info');
    await sleep(400);
    const confirmBtn = await waitForConfirmModalButton(3500);

    if (!confirmBtn) {
      setLog('Tombol [Hapus] di modal dialog tidak ditemukan.', 'error');
      return { success: false, reason: 'CONFIRM_BUTTON_NOT_FOUND' };
    }

    setLog('Menekan tombol konfirmasi [Hapus]...', 'info');
    forceClickElement(confirmBtn);
    await sleep(350);

    // Check if modal still open, retry clicking
    const retryModalBtn = document.querySelector('button[data-e2e="video-modal-delete"], button[data-e2e="photo-modal-delete"], button[data-e2e*="modal-delete"]');
    if (retryModalBtn && isElementVisible(retryModalBtn)) {
      forceClickElement(retryModalBtn);
    }

    // 4. Wait for Deletion & Next Post URL
    setLog(`Menunggu ${postType} terhapus & transisi URL...`, 'info');
    const startTime = Date.now();
    let isChanged = false;
    let newPostId = null;

    while (Date.now() - startTime < 8000) {
      await sleep(400);
      const newUrl = window.location.href;
      newPostId = getPostIdFromUrl(newUrl);

      if (newPostId && newPostId !== currentId) {
        isChanged = true;
        break;
      } else if (!newUrl.includes('/video/') && !newUrl.includes('/photo/')) {
        isChanged = true;
        break;
      }

      const toast = Array.from(document.querySelectorAll('div, span')).find((el) => {
        const t = getElementText(el);
        return isElementVisible(el) && (t === 'dihapus' || t === 'deleted' || t.includes('dihapus'));
      });
      if (toast) {
        isChanged = true;
        setLog('Notifikasi [Dihapus] terdeteksi!', 'success');
        break;
      }
    }

    if (isChanged && (!newPostId || newPostId === currentId)) {
      await sleep(1000);
      navigateToNextPost();
      await sleep(1000);
      newPostId = getPostIdFromUrl();
    }

    if (isChanged || (newPostId && newPostId !== currentId)) {
      state.deletedThisSession++;
      
      try {
        chrome.runtime.sendMessage({ action: 'VIDEO_DELETED' });
      } catch (_) {}

      setLog(`Sukses! ${postType} ${currentId} berhasil dihapus.`, 'success');
      return { success: true, oldId: currentId, newId: newPostId };
    } else {
      setLog(`Timeout konfirmasi hapus ${currentId}.`, 'warn');
      return { success: false, reason: 'TIMEOUT_WAITING_URL_CHANGE' };
    }
  }

  // Automation Loop
  async function runBatchLoop() {
    if (state.isRunning) return;
    state.isRunning = true;
    await chrome.storage.local.set({ isRunning: true });
    setLog('=== AUTO LOOP HAPUS DIMULAI ===', 'success');

    while (state.isRunning) {
      const currentId = getPostIdFromUrl();
      if (!currentId) {
        setLog('Bukan halaman postingan video/foto. Menghentikan loop.', 'warn');
        break;
      }

      if (state.maxLimit > 0 && state.deletedThisSession >= state.maxLimit) {
        setLog(`Batas kuota ${state.maxLimit} postingan tercapai. Selesai!`, 'success');
        break;
      }

      const result = await executeSingleDeletion();
      if (!result.success) {
        setLog(`Gagal menghapus (${result.reason}). Jeda 3 detik...`, 'warn');
        await sleep(3000);
        
        if (!state.isRunning) break;
        const checkId = getPostIdFromUrl();
        if (checkId === currentId) {
          setLog('Postingan tidak dapat dihapus. Menghentikan loop.', 'error');
          break;
        }
      }

      if (!state.isRunning) break;

      const delayMs = Math.max(1000, (state.delaySeconds || 2) * 1000);
      setLog(`Jeda ${state.delaySeconds || 2}s sebelum postingan berikutnya...`, 'info');
      await sleep(delayMs);
    }

    state.isRunning = false;
    await chrome.storage.local.set({ isRunning: false });
    setLog('=== PROSES AUTO LOOP BERHENTI ===', 'warn');
  }

  function stopLoop() {
    if (state.isRunning) {
      state.isRunning = false;
      chrome.storage.local.set({ isRunning: false });
      setLog('Menghentikan auto loop...', 'warn');
    }
  }

  // Message Handler from Popup & Background
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'START_LOOP') {
      if (request.delay) state.delaySeconds = request.delay;
      if (request.limit !== undefined) state.maxLimit = request.limit;
      runBatchLoop();
      sendResponse({ success: true, isRunning: true });
    } else if (request.action === 'STOP_LOOP') {
      stopLoop();
      sendResponse({ success: true, isRunning: false });
    } else if (request.action === 'DELETE_SINGLE') {
      executeSingleDeletion().then((res) => {
        sendResponse(res);
      });
      return true;
    } else if (request.action === 'GET_PAGE_STATUS') {
      sendResponse({
        success: true,
        postId: getPostIdFromUrl(),
        postType: getPostType(),
        isRunning: state.isRunning,
        deletedThisSession: state.deletedThisSession,
        delaySeconds: state.delaySeconds,
        maxLimit: state.maxLimit,
        lastLog: state.lastLog
      });
    }
  });

})();
