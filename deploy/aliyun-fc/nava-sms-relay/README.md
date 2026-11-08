# NAVA Aliyun SMS relay

Alibaba Cloud Function Compute Web Function used as the signed Supabase Send SMS Hook endpoint.

## Function settings

- Region: `cn-hangzhou`
- Runtime: Custom Runtime / Debian 10 / Python 3.10
- Start command: `python3 app.py`
- Port: `9000`
- HTTP methods: `GET`, `POST`
- Trigger authentication: anonymous; the application verifies Standard Webhooks signatures
- Public URL: enabled

## Function role (recommended)

Attach a Function Compute execution role with this least-privilege policy:

```json
{
  "Version": "1",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "dysms:SendSms",
      "Resource": "*"
    }
  ]
}
```

Function Compute injects the role's temporary credentials as
`ALIBABA_CLOUD_ACCESS_KEY_ID`, `ALIBABA_CLOUD_ACCESS_KEY_SECRET`, and
`ALIBABA_CLOUD_SECURITY_TOKEN`. Do not manually configure or persist these
three variables.

## Server-only environment variables

Configure values only in Function Compute. Never commit or paste their values into documentation or chat.

- `SUPABASE_SEND_SMS_HOOK_SECRET`
- `ALIYUN_SMS_SIGN_NAME`
- `ALIYUN_SMS_TEMPLATE_CODE`
- `ALIYUN_SMS_TEMPLATE_PARAM_KEY` (defaults to `code`)

For development outside Function Compute, static credentials remain supported
through `ALIYUN_SMS_ACCESS_KEY_ID` / `ALIYUN_SMS_ACCESS_KEY_SECRET` (or the
legacy `ALIYUN_ACCESS_KEY_ID` / `ALIYUN_ACCESS_KEY_SECRET` fallbacks).

The handler logs only bounded error codes. It never logs raw phone numbers, OTPs, webhook bodies, or credentials.
