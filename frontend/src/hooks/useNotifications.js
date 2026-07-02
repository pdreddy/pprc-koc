import { useCallback, useState } from 'react';
import { NotificationService } from '../services/notifications/NotificationService';

export function useNotifications() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const send = useCallback(async (request) => {
    setBusy(true);
    setError('');
    try {
      const result = await NotificationService.send(request);
      if (!result.success) setError(result.error || 'Notification failed.');
      return result;
    } catch (err) {
      const message = err?.message || 'Notification failed.';
      setError(message);
      return { success: false, error: message };
    } finally {
      setBusy(false);
    }
  }, []);
  return { send, busy, error };
}
