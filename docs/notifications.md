# KOC Notification Module

## Folder structure

Frontend:

- `frontend/src/services/notifications/NotificationService.js` — provider-independent send facade.
- `frontend/src/services/notifications/WhatsAppProvider.js` — browser provider that calls the secure Firebase callable.
- `frontend/src/services/notifications/NotificationTypes.ts` — TypeScript interfaces for channels, recipients, requests, providers, and responses.
- `frontend/src/services/notifications/NotificationTemplates.js` — reusable `{{variable}}` template engine and default templates.
- `frontend/src/hooks/useNotifications.js` and `frontend/src/hooks/useSendWhatsApp.js` — reusable React hooks.

Cloud Functions:

- `functions/src/notifications/sendWhatsApp.js` — callable function and 15-minute scheduled sweep.
- `functions/src/notifications/NotificationQueue.js` — config, log, dedupe, phone normalization helpers.
- `functions/src/notifications/metaClient.js` — Meta WhatsApp Cloud API client with timeout and retry.
- `functions/src/notifications/axiosCompat.js` — axios-compatible `create().post()` wrapper built on Node fetch because this repo currently cannot fetch npm axios from the registry in CI.

## Firestore schema

### `notifications/config`

```json
{
  "enableWhatsApp": true,
  "enableEmail": false,
  "enablePush": false,
  "enableSMS": false,
  "clubId": "pprc",
  "tournamentId": "koc_s3",
  "retryAttempts": 3,
  "timeoutMs": 10000,
  "updatedAt": 1783010000000
}
```

Optional overrides are read from:

- `clubs/{clubId}/notifications/config`
- `clubs/{clubId}/tournaments/{tournamentId}/notifications/config`

### `notification_logs/{id}`

Fields:

- `id`
- `channel`
- `phone`
- `playerId`
- `tournamentId`
- `clubId`
- `template`
- `message`
- `status` (`queued`, `sent`, `failed`)
- `metaMessageId`
- `error`
- `dedupeKey`
- `createdAt`
- `sentAt`

## Callable function

`sendWhatsAppMessage`

Input:

```json
{
  "phone": "+15551234567",
  "message": "Hello from KOC",
  "type": "TEST_MESSAGE",
  "recipient": { "playerId": "p1", "name": "Player", "phone": "+15551234567" },
  "clubId": "pprc",
  "tournamentId": "koc_s3"
}
```

Output:

```json
{ "success": true, "metaMessageId": "wamid...", "error": null }
```

## Template variables

The engine supports `{{player}}`, `{{captain}}`, `{{team}}`, `{{opponent}}`, `{{court}}`, `{{date}}`, `{{time}}`, `{{deadline}}`, `{{club}}`, and any future key passed in `variables`.

## Deployment instructions

1. Set secrets:

```bash
firebase functions:secrets:set WHATSAPP_ACCESS_TOKEN
firebase functions:secrets:set WHATSAPP_PHONE_NUMBER_ID
```

2. Deploy functions:

```bash
firebase deploy --only functions:sendWhatsAppMessage,functions:scheduledNotificationSweep
```

3. In Admin → Notifications, enable WhatsApp and send a test message.

## Security review

- Meta tokens are read only inside Cloud Functions through Firebase Secret Manager.
- The frontend never receives or stores Meta access tokens or phone number IDs.
- The callable requires Firebase Authentication and writes an auditable Firestore log for each send attempt.
- Notification config supports global, club, and tournament override documents for future multi-club deployments.

## Error handling and retry strategy

- Phone numbers are normalized before send.
- Messages over WhatsApp text limits are rejected.
- Meta API calls have a configurable timeout.
- Retry uses exponential backoff for network, `429`, and `5xx` responses.
- Non-retryable Meta errors are logged immediately as failed.

## Production checklist

- Add admin-only callable authorization once Firebase custom claims mirror the app's role model.
- Add Firestore security rules so only admins can read `notification_logs` and write `notifications/config`.
- Add phone numbers to player/captain records.
- Create approved Meta template names for production-initiated reminders if the 24-hour customer-service window is not available.
- Configure per-club and per-tournament overrides before adding additional clubs.
