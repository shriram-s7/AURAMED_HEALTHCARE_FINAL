"""Real Twilio SMS and approved-template WhatsApp delivery adapters."""
import base64
import json
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from app.core.config import settings


class SMSConfigurationError(RuntimeError):
    pass


class SMSDeliveryError(RuntimeError):
    def __init__(self, message: str, provider_code: int | None = None):
        super().__init__(message)
        self.provider_code = provider_code


def _send_twilio(parameters: dict[str, str]) -> str:
    sid = settings.twilio_account_sid
    api_key = settings.twilio_api_key_sid
    api_secret = settings.twilio_api_key_secret
    token = settings.twilio_auth_token
    username, password = (api_key, api_secret) if api_key and api_secret else (sid, token)
    if not sid or not username or not password:
        raise SMSConfigurationError(
            "Twilio credentials are missing. Set the Account SID and either an API Key SID/Secret or Auth Token in backend/.env."
        )

    credentials = base64.b64encode(f"{username}:{password}".encode("utf-8")).decode("ascii")
    body = urlencode(parameters).encode("utf-8")
    request = Request(
        f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json",
        data=body,
        headers={"Authorization": f"Basic {credentials}", "Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=15) as response:
            result = json.loads(response.read().decode("utf-8"))
        if not result.get("sid"):
            raise SMSDeliveryError("SMS provider did not return a message ID.")
        return result["sid"]
    except HTTPError as exc:
        # Twilio's error code is safe to surface and lets the UI explain sender,
        # trial-account, template, and destination failures without exposing the
        # provider response body or account details.
        provider_code = None
        try:
            provider_code = json.loads(exc.read().decode("utf-8")).get("code")
        except (ValueError, AttributeError):
            pass
        if provider_code == 21606:
            reason = "The configured SMS sender is not message-capable on this Twilio account."
        elif provider_code == 20003:
            reason = "Twilio rejected the configured API credentials."
        elif provider_code in (21608, 572002):
            reason = "This Twilio trial account can message only verified recipient numbers. Please add this number to your Twilio Verified Caller IDs."
        elif provider_code == 63007:
            reason = "The WhatsApp sender is not registered on this Twilio account."
        elif provider_code == 63016:
            reason = "WhatsApp requires an approved template for this message."
        elif provider_code == 21655:
            reason = "The WhatsApp Content SID is invalid or belongs to a different Twilio account. Set an approved HX template from this account."
        elif provider_code in (21211, 21614, 63003):
            reason = "Twilio rejected the destination number. Check its country code and channel eligibility."
        else:
            reason = f"Twilio rejected the request (HTTP {exc.code}{f', error {provider_code}' if provider_code else ''})."
        raise SMSDeliveryError(reason, provider_code=provider_code) from None
    except (URLError, TimeoutError, OSError) as exc:
        raise SMSDeliveryError("Could not connect to the SMS provider.") from None
    except (ValueError, KeyError) as exc:
        raise SMSDeliveryError("SMS provider returned an invalid response.") from None


def send_sms(to_number: str, message: str) -> tuple[str, bool]:
    """Send an SMS and return (provider message SID, used trial template)."""
    if settings.twilio_messaging_service_sid:
        sender = {"MessagingServiceSid": settings.twilio_messaging_service_sid}
    elif settings.twilio_phone_number or settings.twilio_from_number:
        sender = {"From": settings.twilio_phone_number or settings.twilio_from_number}
    else:
        raise SMSConfigurationError("Set TWILIO_PHONE_NUMBER or TWILIO_MESSAGING_SERVICE_SID in backend/.env.")
    if settings.twilio_sms_trial_mode:
        trial_sid = _send_twilio({
            "To": to_number,
            "Body": "sms_appointment_reminders",
            **sender,
        })
        return trial_sid, True
    try:
        return _send_twilio({"To": to_number, "Body": message, **sender}), False
    except SMSDeliveryError as exc:
        if exc.provider_code != 572006:
            raise
        # Trial accounts reject custom bodies. Retry only after Twilio confirms
        # that restriction, using its built-in appointment-reminder template.
        trial_sid = _send_twilio({
            "To": to_number,
            "Body": "sms_appointment_reminders",
            **sender,
        })
        return trial_sid, True


def send_whatsapp(to_number: str, patient_name: str, due_date: str) -> str:
    """Send an approved, business-initiated WhatsApp template via Twilio."""
    sender = settings.twilio_whatsapp_from
    content_sid = settings.twilio_whatsapp_content_sid
    if not sender or not content_sid:
        raise SMSConfigurationError(
            "Set TWILIO_WHATSAPP_FROM and an approved TWILIO_WHATSAPP_CONTENT_SID in backend/.env."
        )
    sender_address = sender if sender.startswith("whatsapp:") else f"whatsapp:{sender}"
    return _send_twilio(
        {
            "To": f"whatsapp:{to_number}",
            "From": sender_address,
            "ContentSid": content_sid,
            "ContentVariables": json.dumps({"1": patient_name, "2": due_date}),
        }
    )
