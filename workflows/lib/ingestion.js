function validateMessages(items, now = Date.now(), replyWindowHours = 24) {
  const messages = [];
  for (const item of items) {
    const payload = item.json || item;
    const values = Array.isArray(payload.entry)
      ? payload.entry.flatMap(entry => (entry.changes || []).map(change => change.value || {}))
      : [payload.value || payload];
    for (const value of values) {
      const metadata = value.metadata || {};
      const phoneNumberId = String(metadata.phone_number_id || '');
      const ownPhone = String(metadata.display_phone_number || '').replace(/\D/g, '');
      for (const message of value.messages || []) {
        const customerPhone = String(message.from || '').replace(/\D/g, '');
        const body = typeof message.text?.body === 'string' ? message.text.body.trim() : '';
        if (message.type !== 'text' || !body || !message.id || !phoneNumberId || !customerPhone || ownPhone === customerPhone) continue;
        const timestamp = Number(message.timestamp) * 1000;
        if (!Number.isFinite(timestamp) || timestamp <= 0 || timestamp > now + 300000) continue;
        const expired = now - timestamp > replyWindowHours * 3600000;
        const contact = (value.contacts || []).find(contact => String(contact.wa_id) === customerPhone);
        messages.push({
          phone_number_id: phoneNumberId,
          customer_phone: customerPhone,
          customer_name: String(contact?.profile?.name || ''),
          message_id: String(message.id),
          message_text: body,
          quoted_message_id: message.context?.id ? String(message.context.id) : null,
          message_timestamp: new Date(timestamp).toISOString(),
          session_id: `${phoneNumberId}:${customerPhone}`,
          reply_window_expired: expired,
        });
      }
    }
  }
  return messages;
}

module.exports = { validateMessages };
