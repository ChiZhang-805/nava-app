import base64
import hashlib
import hmac
import json
import os
import re
import time
import uuid
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from flask import Flask, jsonify, request


app = Flask(__name__)

ALIYUN_ACTION = "SendSms"
ALIYUN_ALGORITHM = "ACS3-HMAC-SHA256"
ALIYUN_HOST = "dysmsapi.aliyuncs.com"
ALIYUN_VERSION = "2017-05-25"
WEBHOOK_TOLERANCE_SECONDS = 300


class RelayError(Exception):
    def __init__(self, code: str, status: int):
        super().__init__(code)
        self.code = code
        self.status = status


def required_env(name: str, *fallback_names: str) -> str:
    for candidate in (name, *fallback_names):
        value = os.environ.get(candidate, "").strip()
        if value:
            return value
    raise RelayError(f"MISSING_ENV_{name}", 500)


def webhook_key() -> bytes:
    configured = required_env("SUPABASE_SEND_SMS_HOOK_SECRET")
    if configured.startswith("v1,"):
        configured = configured[3:]
    if configured.startswith("whsec_"):
        configured = configured[6:]
    try:
        return base64.b64decode(configured, validate=True)
    except ValueError as error:
        raise RelayError("WEBHOOK_SECRET_INVALID", 500) from error


def verify_webhook(raw_body: bytes) -> None:
    message_id = request.headers.get("webhook-id", "")
    timestamp_value = request.headers.get("webhook-timestamp", "")
    signature_header = request.headers.get("webhook-signature", "")
    if not message_id or not timestamp_value or not signature_header:
        raise RelayError("WEBHOOK_HEADERS_MISSING", 401)
    try:
        timestamp = int(timestamp_value)
    except ValueError as error:
        raise RelayError("WEBHOOK_TIMESTAMP_INVALID", 401) from error
    if abs(int(time.time()) - timestamp) > WEBHOOK_TOLERANCE_SECONDS:
        raise RelayError("WEBHOOK_TIMESTAMP_EXPIRED", 401)

    signed_payload = f"{message_id}.{timestamp_value}.".encode("utf-8") + raw_body
    expected = base64.b64encode(hmac.new(webhook_key(), signed_payload, hashlib.sha256).digest()).decode("ascii")
    accepted = any(
        version == "v1" and hmac.compare_digest(signature, expected)
        for item in signature_header.split()
        for version, separator, signature in [item.partition(",")]
        if separator
    )
    if not accepted:
        raise RelayError("WEBHOOK_SIGNATURE_INVALID", 401)


def normalize_china_phone(value: object) -> str:
    raw = re.sub(r"[\s-]", "", value.strip()) if isinstance(value, str) else ""
    if raw.startswith("+86"):
        raw = raw[3:]
    elif raw.startswith("0086"):
        raw = raw[4:]
    elif re.fullmatch(r"861[3-9][0-9]{9}", raw):
        raw = raw[2:]
    if not re.fullmatch(r"1[3-9][0-9]{9}", raw):
        raise RelayError("PHONE_INVALID", 400)
    return raw


def parse_hook_payload(raw_body: bytes) -> tuple[str, str]:
    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise RelayError("PAYLOAD_INVALID", 400) from error
    if not isinstance(payload, dict):
        raise RelayError("PAYLOAD_INVALID", 400)
    user = payload.get("user")
    sms = payload.get("sms")
    if not isinstance(user, dict) or not isinstance(sms, dict):
        raise RelayError("PAYLOAD_INVALID", 400)
    phone = normalize_china_phone(user.get("phone"))
    code = sms.get("otp")
    if not isinstance(code, str) or not re.fullmatch(r"[0-9]{6}", code):
        raise RelayError("OTP_INVALID", 400)
    return phone, code


def percent_encode(value: object) -> str:
    return quote(str(value), safe="-_.~")


def canonical_query(parameters: dict[str, str]) -> str:
    return "&".join(
        f"{percent_encode(key)}={percent_encode(parameters[key])}"
        for key in sorted(parameters)
    )


def aliyun_credentials() -> tuple[str, str, str]:
    access_key_id = required_env(
        "ALIBABA_CLOUD_ACCESS_KEY_ID",
        "ALIYUN_SMS_ACCESS_KEY_ID",
        "ALIYUN_ACCESS_KEY_ID",
    )
    access_key_secret = required_env(
        "ALIBABA_CLOUD_ACCESS_KEY_SECRET",
        "ALIYUN_SMS_ACCESS_KEY_SECRET",
        "ALIYUN_ACCESS_KEY_SECRET",
    )
    security_token = os.environ.get("ALIBABA_CLOUD_SECURITY_TOKEN", "").strip()
    return access_key_id, access_key_secret, security_token


def aliyun_headers(
    query: str,
    access_key_id: str,
    access_key_secret: str,
    security_token: str,
) -> dict[str, str]:
    payload_hash = hashlib.sha256(b"").hexdigest()
    headers = {
        "host": ALIYUN_HOST,
        "x-acs-action": ALIYUN_ACTION,
        "x-acs-content-sha256": payload_hash,
        "x-acs-date": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "x-acs-signature-nonce": str(uuid.uuid4()),
        "x-acs-version": ALIYUN_VERSION,
    }
    if security_token:
        headers["x-acs-security-token"] = security_token
    signed_names = sorted(headers)
    signed_headers = ";".join(signed_names)
    canonical_headers = "".join(f"{name}:{headers[name].strip()}\n" for name in signed_names)
    canonical_request = "\n".join([
        "POST",
        "/",
        query,
        canonical_headers,
        signed_headers,
        payload_hash,
    ])
    string_to_sign = f"{ALIYUN_ALGORITHM}\n{hashlib.sha256(canonical_request.encode('utf-8')).hexdigest()}"
    signature = hmac.new(
        access_key_secret.encode("utf-8"),
        string_to_sign.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    headers["authorization"] = (
        f"{ALIYUN_ALGORITHM} Credential={access_key_id},"
        f"SignedHeaders={signed_headers},Signature={signature}"
    )
    return headers


def send_sms(phone: str, code: str) -> None:
    access_key_id, access_key_secret, security_token = aliyun_credentials()
    sign_name = required_env("ALIYUN_SMS_SIGN_NAME")
    template_code = required_env("ALIYUN_SMS_TEMPLATE_CODE")
    template_key = os.environ.get("ALIYUN_SMS_TEMPLATE_PARAM_KEY", "code").strip() or "code"
    query = canonical_query({
        "PhoneNumbers": phone,
        "SignName": sign_name,
        "TemplateCode": template_code,
        "TemplateParam": json.dumps({template_key: code}, ensure_ascii=False, separators=(",", ":")),
    })
    headers = aliyun_headers(query, access_key_id, access_key_secret, security_token)
    outgoing = Request(
        f"https://{ALIYUN_HOST}/?{query}",
        data=b"",
        method="POST",
        headers={name: value for name, value in headers.items() if name != "host"},
    )
    try:
        with urlopen(outgoing, timeout=10) as response:
            provider = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        raise RelayError(f"ALIYUN_HTTP_{error.code}", 502) from error
    except (URLError, TimeoutError) as error:
        raise RelayError("ALIYUN_NETWORK_ERROR", 502) from error
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise RelayError("ALIYUN_RESPONSE_INVALID", 502) from error
    if provider.get("Code") != "OK":
        provider_code = re.sub(r"[^A-Za-z0-9_.-]", "_", str(provider.get("Code") or "UNKNOWN"))
        raise RelayError(f"ALIYUN_{provider_code}", 502)


@app.get("/")
def health():
    return jsonify({"ok": True, "service": "nava-sms-relay"})


@app.post("/")
def relay():
    try:
        raw_body = request.get_data(cache=True, as_text=False)
        verify_webhook(raw_body)
        phone, code = parse_hook_payload(raw_body)
        send_sms(phone, code)
        return jsonify({})
    except RelayError as error:
        app.logger.error("SMS relay failed: %s", error.code)
        return jsonify({"error": {"http_code": error.status, "message": error.code}}), error.status
    except Exception:
        app.logger.exception("SMS relay failed: INTERNAL_ERROR")
        return jsonify({"error": {"http_code": 500, "message": "INTERNAL_ERROR"}}), 500


if __name__ == "__main__":
    port = int(os.environ.get("FC_SERVER_PORT", os.environ.get("PORT", "9000")))
    app.run(host="0.0.0.0", port=port)
