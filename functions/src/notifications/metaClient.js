const axios = require('./axiosCompat');
const { logger } = require('firebase-functions');

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

class MetaWhatsAppClient {
  constructor({ accessToken, phoneNumberId, timeoutMs = 10000, retryAttempts = 3 }) {
    if (!accessToken) throw new Error('WHATSAPP_ACCESS_TOKEN is not configured.');
    if (!phoneNumberId) throw new Error('WHATSAPP_PHONE_NUMBER_ID is not configured.');
    this.accessToken = accessToken;
    this.phoneNumberId = phoneNumberId;
    this.timeoutMs = timeoutMs;
    this.retryAttempts = retryAttempts;
    this.client = axios.create({
      baseURL: 'https://graph.facebook.com/v25.0',
      timeout: timeoutMs,
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
    });
  }

  async sendText({ phone, message }) {
    return this.sendPayload({ messaging_product: 'whatsapp', recipient_type: 'individual', to: phone, type: 'text', text: { preview_url: false, body: message } });
  }

  async sendTemplate({ phone, templateName, languageCode = 'en_US', components = [] }) {
    return this.sendPayload({ messaging_product: 'whatsapp', to: phone, type: 'template', template: { name: templateName, language: { code: languageCode }, components } });
  }

  async sendPayload(payload) {
    let lastError;
    for (let attempt = 1; attempt <= this.retryAttempts; attempt += 1) {
      try {
        const response = await this.client.post(`/${this.phoneNumberId}/messages`, payload);
        const metaMessageId = response.data?.messages?.[0]?.id || null;
        logger.info('WhatsApp message sent', { metaMessageId, attempt });
        return { success: true, metaMessageId, raw: response.data };
      } catch (err) {
        lastError = err;
        const status = err.response?.status;
        const retryable = !status || status === 429 || status >= 500;
        logger.warn('WhatsApp send attempt failed', { attempt, status, retryable, error: err.response?.data || err.message });
        if (!retryable || attempt === this.retryAttempts) break;
        await sleep(Math.min(1000 * (2 ** (attempt - 1)), 8000));
      }
    }
    const message = lastError?.response?.data?.error?.message || lastError?.message || 'WhatsApp send failed.';
    return { success: false, error: message };
  }
}

module.exports = { MetaWhatsAppClient };
