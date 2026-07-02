export type NotificationChannel = 'whatsapp' | 'email' | 'push' | 'sms';
export type NotificationType = 'TEST_MESSAGE' | 'PLAYER_MESSAGE' | 'CAPTAIN_MESSAGE' | 'LINEUP_REMINDER' | 'SCORE_REMINDER' | 'MATCH_REMINDER';

export interface NotificationRecipient {
  id?: string;
  playerId?: string;
  teamId?: string;
  name?: string;
  phone?: string;
}

export interface NotificationSendRequest {
  channel: NotificationChannel;
  type: NotificationType | string;
  recipient: NotificationRecipient;
  template?: string;
  variables?: Record<string, string | number | null | undefined>;
  message?: string;
  tournamentId?: string;
  clubId?: string;
}

export interface NotificationSendResult {
  success: boolean;
  metaMessageId?: string;
  error?: string;
}

export interface INotificationProvider {
  send(request: NotificationSendRequest): Promise<NotificationSendResult>;
}
