from __future__ import annotations

import base64
import json
import os
import re
import urllib.error
import urllib.request
from typing import Any


def _normalize_base_url(value: str | None) -> str | None:
    if not value:
        return None
    text = value.strip()
    if not text:
        return None
    return text[:-1] if text.endswith("/") else text


def get_llm_api_key() -> str | None:
    key = os.getenv("OPENAI_API_KEY") or os.getenv("AFRI_API_KEY")
    if not key:
        return None
    k = key.strip()
    return k or None


def get_llm_base_url() -> str | None:
    return _normalize_base_url(os.getenv("OPENAI_BASE_URL") or os.getenv("DATABASE_URL"))


def get_llm_model(default: str = "gpt-5.4-mini") -> str:
    return (os.getenv("OPENAI_MODEL") or default).strip()


def is_llm_available() -> bool:
    return bool(get_llm_api_key() and get_llm_base_url())


def extract_json_block(text: str) -> dict[str, Any] | None:
    if not text:
        return None
    try:
        loaded = json.loads(text)
        if isinstance(loaded, dict):
            return loaded
    except Exception:
        pass

    match = re.search(r"\{[\s\S]*\}", text)
    if not match:
        return None

    try:
        loaded = json.loads(match.group(0))
        if isinstance(loaded, dict):
            return loaded
    except Exception:
        return None
    return None


def _chat_completions_url() -> str | None:
    base_url = get_llm_base_url()
    if not base_url:
        return None
    return f"{base_url}/chat/completions"


def _post_json(url: str, api_key: str, body: dict[str, Any], timeout_s: int = 25) -> dict[str, Any] | None:
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as response:
            payload = response.read().decode("utf-8")
        loaded = json.loads(payload)
        return loaded if isinstance(loaded, dict) else None
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError, json.JSONDecodeError):
        return None


def _extract_first_message_text(response_json: dict[str, Any]) -> str | None:
    choices = response_json.get("choices")
    if not isinstance(choices, list) or not choices:
        return None
    first = choices[0]
    if not isinstance(first, dict):
        return None
    message = first.get("message")
    if not isinstance(message, dict):
        return None
    content = message.get("content")

    if isinstance(content, str):
        text = content.strip()
        return text or None

    if isinstance(content, list):
        parts: list[str] = []
        for chunk in content:
            if not isinstance(chunk, dict):
                continue
            if chunk.get("type") in {"text", "output_text"} and isinstance(chunk.get("text"), str):
                value = chunk["text"].strip()
                if value:
                    parts.append(value)
        joined = "\n".join(parts).strip()
        return joined or None

    return None


def chat_completion_text(
    *,
    system_prompt: str,
    user_prompt: str,
    model: str | None = None,
    max_tokens: int = 500,
    temperature: float = 0.2,
    timeout_s: int = 25,
) -> str | None:
    api_key = get_llm_api_key()
    endpoint = _chat_completions_url()
    if not api_key or not endpoint:
        return None

    body = {
        "model": model or get_llm_model(),
        "max_tokens": max_tokens,
        "temperature": temperature,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    }
    raw = _post_json(endpoint, api_key, body, timeout_s=timeout_s)
    if not raw:
        return None
    return _extract_first_message_text(raw)


def chat_completion_json(
    *,
    system_prompt: str,
    user_prompt: str,
    model: str | None = None,
    max_tokens: int = 700,
    temperature: float = 0,
    timeout_s: int = 25,
) -> dict[str, Any] | None:
    text = chat_completion_text(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        model=model,
        max_tokens=max_tokens,
        temperature=temperature,
        timeout_s=timeout_s,
    )
    if not text:
        return None
    return extract_json_block(text)


def vision_completion_json(
    *,
    instruction: str,
    image_bytes: bytes,
    media_type: str,
    model: str | None = None,
    max_tokens: int = 320,
    timeout_s: int = 30,
) -> dict[str, Any] | None:
    api_key = get_llm_api_key()
    endpoint = _chat_completions_url()
    if not api_key or not endpoint:
        return None

    encoded = base64.b64encode(image_bytes).decode("utf-8")
    body = {
        "model": model or get_llm_model(default="gpt-4.1-mini"),
        "max_tokens": max_tokens,
        "temperature": 0,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": instruction},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:{media_type};base64,{encoded}",
                        },
                    },
                ],
            }
        ],
    }

    raw = _post_json(endpoint, api_key, body, timeout_s=timeout_s)
    if not raw:
        return None
    text = _extract_first_message_text(raw)
    if not text:
        return None
    return extract_json_block(text)
