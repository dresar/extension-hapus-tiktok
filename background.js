// Service Worker for TikTok Auto Video Deleter

chrome.runtime.onInstalled.addListener(async () => {
  console.log('[TikTok Deleter] Extension installed successfully.');
  const existing = await chrome.storage.local.get(['deletedCount', 'delaySeconds', 'maxDeleteLimit', 'isRunning']);
  
  await chrome.storage.local.set({
    deletedCount: existing.deletedCount || 0,
    delaySeconds: existing.delaySeconds || 2,
    maxDeleteLimit: existing.maxDeleteLimit || 0, // 0 = unlimited
    isRunning: false
  });
});

// Update badge counter
async function updateBadge(count) {
  if (count > 0) {
    await chrome.action.setBadgeText({ text: String(count) });
    await chrome.action.setBadgeBackgroundColor({ color: '#FE2C55' });
  } else {
    await chrome.action.setBadgeText({ text: '' });
  }
}

// Handle runtime messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (message.action === 'VIDEO_DELETED') {
        const { deletedCount = 0 } = await chrome.storage.local.get('deletedCount');
        const newCount = deletedCount + 1;
        await chrome.storage.local.set({ deletedCount: newCount });
        await updateBadge(newCount);
        sendResponse({ success: true, count: newCount });
      } else if (message.action === 'RESET_STATS') {
        await chrome.storage.local.set({ deletedCount: 0, isRunning: false });
        await updateBadge(0);
        sendResponse({ success: true });
      } else if (message.action === 'GET_STATUS') {
        const data = await chrome.storage.local.get(['deletedCount', 'delaySeconds', 'maxDeleteLimit', 'isRunning']);
        sendResponse({ success: true, data });
      } else {
        sendResponse({ success: true });
      }
    } catch (err) {
      console.error('[TikTok Deleter SW Error]', err);
      sendResponse({ success: false, error: err.message });
    }
  })();
  return true; // Keep message channel open for async response
});
