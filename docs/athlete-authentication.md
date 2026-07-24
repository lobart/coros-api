# Athlete Authentication

## Supported Flow

Local headed authentication works through the `auth-browser` command:

```bash
pnpm start -- auth-browser --account-id example-athlete --region eu
```

The command opens `https://t.coros.com/` in a visible Playwright Chromium
window. The athlete enters credentials, CAPTCHA, and any 2FA challenge directly
in COROS. The application does not collect those credentials.

After login, the browser integration captures only the Training Hub
`accessToken` and the `userId` carried by `YFHeader`. It validates that session
with the selected region's read-only `/account/query` route before saving it.
The browser closes after validation.

Supported region values are `us`, `eu`, and `cn`; the default is `eu`. Use an
application-owned account alias for `--account-id`. Do not use an email address
or a provider user ID.

## Remote Authentication

Remote interactive authentication is unavailable until an
`InteractiveAuthProvider` for a remote browser is configured. The public
`POST /api/v1/coros/accounts/{accountId}/auth-sessions` route currently returns
`COROS_WRITE_CAPABILITY_UNAVAILABLE`, including when
`COROS_REMOTE_BROWSER_AUTH_ENABLED=true`.

Do not expose a hosted login button or claim remote auth support based only on
that feature flag.

## Session Status

Service-to-service callers can inspect local state:

```http
GET /api/v1/coros/accounts/example-athlete/status
Authorization: Bearer <service token>
```

A missing session returns:

```json
{ "status": "disconnected" }
```

A stored session returns only safe metadata:

```json
{
  "status": "connected",
  "region": "eu",
  "validated_at": "2030-01-15T10:00:00.000Z",
  "protocol_version": "training-hub-web-v1"
}
```

Disconnect with
`DELETE /api/v1/coros/accounts/{accountId}/session`. This removes the local
session; it does not claim to revoke the session at COROS.

## Storage

Sessions are stored in an AES-256-GCM encrypted local file. A 32-byte
`COROS_SESSION_ENCRYPTION_KEY`, encoded as base64 or 64 hexadecimal characters,
is mandatory; plaintext fallback is prohibited. The store file and temporary
files are written with mode `0600`, and the parent directory is created with
mode `0700`.

The status API and session-list metadata never include the access token.
