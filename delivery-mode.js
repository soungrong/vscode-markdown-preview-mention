const DELIVERY_SETTING = 'markdownPreviewMention.delivery';

function chooseDelivery(mode, visibleChatCount) {
  if (mode === 'claude') return 'claude';
  if (mode === 'pasteWithFallback') return visibleChatCount === 1 ? 'paste' : 'claude';
  return 'paste';
}

module.exports = { DELIVERY_SETTING, chooseDelivery };
