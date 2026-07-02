import { httpsCallable } from 'firebase/functions';
import { firebaseFunctions } from '../../firebase';
import { renderNotificationTemplate, resolveNotificationTemplate } from './NotificationTemplates';

export class WhatsAppProvider {
  async send(request) {
    const phone = request.recipient?.phone;
    if (!phone) return { success: false, error: 'Recipient phone is required.' };
    const template = resolveNotificationTemplate(request.type, request.template);
    const message = request.message || renderNotificationTemplate(template, request.variables || {});
    const fn = httpsCallable(firebaseFunctions, 'sendWhatsAppMessage');
    const result = await fn({
      phone,
      message,
      type: request.type,
      template,
      variables: request.variables || {},
      recipient: request.recipient,
      tournamentId: request.tournamentId,
      clubId: request.clubId
    });
    return result.data;
  }
}
