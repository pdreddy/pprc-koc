import { WhatsAppProvider } from './WhatsAppProvider';

const providers = {
  whatsapp: new WhatsAppProvider()
};

export class NotificationService {
  static registerProvider(channel, provider) {
    providers[channel] = provider;
  }

  static async send(request) {
    const provider = providers[request.channel];
    if (!provider) return { success: false, error: `Notification channel is not configured: ${request.channel}` };
    return provider.send(request);
  }
}
