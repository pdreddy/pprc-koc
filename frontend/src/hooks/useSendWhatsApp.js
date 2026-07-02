import { useCallback } from 'react';
import { useNotifications } from './useNotifications';

export function useSendWhatsApp() {
  const { send, busy, error } = useNotifications();
  const sendWhatsApp = useCallback((request) => send({ ...request, channel: 'whatsapp' }), [send]);
  return { sendWhatsApp, busy, error };
}
