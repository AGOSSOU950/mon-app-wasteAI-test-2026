import io
import os
import smtplib
import textwrap
import unicodedata
from email.message import EmailMessage

from app.core.analytics_store import get_analytics

PAGE_W = 595
PAGE_H = 842
BODY_FONT = 10
TOP_Y = 790
BODY_LINES_PER_PAGE = 42


def _normalize_pdf_text(text: str) -> str:
    value = unicodedata.normalize("NFC", str(text or ""))
    value = value.replace(chr(8217), "'").replace(chr(8216), "'")
    value = value.replace(chr(8220), '"').replace(chr(8221), '"')
    value = value.replace(chr(8211), "-").replace(chr(8212), "-")
    value = value.replace("\t", "    ")
    return value


def _pdf_escape(text: str) -> str:
    value = _normalize_pdf_text(text)
    return value.replace(chr(92), chr(92) + chr(92)).replace(chr(40), chr(92) + chr(40)).replace(chr(41), chr(92) + chr(41))


def _wrap_report_line(line: str, width: int = 92) -> list[str]:
    value = _normalize_pdf_text(line).strip()
    if not value:
        return [""]
    return textwrap.wrap(value, width=width, break_long_words=False, break_on_hyphens=False) or [value]


def _chunk_lines(lines: list[tuple[str, bool]], per_page: int) -> list[list[tuple[str, bool]]]:
    pages: list[list[tuple[str, bool]]] = []
    current: list[tuple[str, bool]] = []
    for text, bold in lines:
        wrapped = _wrap_report_line(text)
        for chunk in wrapped:
            current.append((chunk, bold))
            if len(current) >= per_page:
                pages.append(current)
                current = []
    if current:
        pages.append(current)
    return pages or [[("Aucune donnee disponible", False)]]


def _build_simple_pdf(pages: list[list[tuple[str, bool]]]) -> bytes:
    objects: list[bytes] = [
        b"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n",
        b"2 0 obj << /Type /Pages /Count 0 /Kids [] >> endobj\n",
        b"3 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n",
        b"4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj\n",
    ]
    page_ids: list[int] = []
    next_id = 5

    for page_number, lines in enumerate(pages, start=1):
        parts = ["BT"]
        parts.append("/F2 14 Tf")
        parts.append(f"50 {TOP_Y} Td")
        parts.append(f"({_pdf_escape('WasteAI - Rapport analytique')}) Tj")
        parts.append("T*")
        parts.append("/F1 9 Tf")
        parts.append(f"({_pdf_escape('Synthese economique et historique recent')}) Tj")
        parts.append("T*")
        parts.append("/F1 8 Tf")
        parts.append(f"({_pdf_escape(f'Page {page_number} / {{total}}')}) Tj")
        parts.append("T*")
        parts.append("T*")
        for text, bold in lines:
            parts.append(f"/{'F2' if bold else 'F1'} {10 if bold else BODY_FONT} Tf")
            if not text:
                parts.append("T*")
                continue
            parts.append(f"({_pdf_escape(text)}) Tj")
            parts.append("T*")
        parts.append("ET")
        content = "\n".join(parts).replace("{total}", str(len(pages))).encode("latin-1", errors="replace")

        content_id = next_id
        next_id += 1
        page_id = next_id
        next_id += 1
        page_ids.append(page_id)

        objects.append(f"{content_id} 0 obj << /Length {len(content)} >> stream\n".encode("ascii") + content + b"\nendstream endobj\n")
        objects.append(
            f"{page_id} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 {PAGE_W} {PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents {content_id} 0 R >> endobj\n".encode(
                "ascii"
            )
        )

    objects[1] = (
        b"2 0 obj << /Type /Pages /Count "
        + str(len(page_ids)).encode("ascii")
        + b" /Kids ["
        + b" ".join(f"{pid} 0 R".encode("ascii") for pid in page_ids)
        + b"] >> endobj\n"
    )

    out = io.BytesIO()
    out.write(b"%PDF-1.4\n")
    offsets = [0]
    for obj in objects:
        offsets.append(out.tell())
        out.write(obj)

    xref_start = out.tell()
    out.write(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    out.write(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        out.write(f"{offset:010d} 00000 n \n".encode("ascii"))

    out.write(f"trailer << /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_start}\n%%EOF".encode("ascii"))
    return out.getvalue()


def _format_report_lines() -> list[tuple[str, bool]]:
    analytics = get_analytics(limit=500)
    summary = analytics["summary"]
    history = analytics["history"]

    lines: list[tuple[str, bool]] = [
        ("Indicateurs", True),
        (f"Analyses: {summary['total_analyses']}", False),
        (f"Tonnes valorisees: {summary['tonnes_valorisees']}", False),
        (f"Revenus generes (EUR): {summary['revenus_generes_eur']}", False),
        (f"CO2 evite (kg): {summary['co2_evite_kg']}", False),
        ("", False),
        ("Historique recent", True),
    ]

    for item in history[:60]:
        lines.append(
            (
                f"{item.get('timestamp','')[:19]} | {item.get('nom','')} | {item.get('decision','')} | "
                f"{item.get('tonnes_valorisees',0)} t | {item.get('revenus_generes_eur',0)} EUR | {item.get('co2_evite_kg',0)} kgCO2",
                False,
            )
        )

    if len(history) > 60:
        lines.append((f"... {len(history) - 60} lignes supplementaires non affichees", False))

    return lines


def build_analytics_pdf() -> bytes:
    return _build_simple_pdf(_chunk_lines(_format_report_lines(), BODY_LINES_PER_PAGE))


def send_analytics_report_email(to_email: str, subject: str | None = None, message: str | None = None) -> None:
    smtp_host = os.getenv("SMTP_HOST")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER")
    smtp_password = os.getenv("SMTP_PASSWORD")
    smtp_from = os.getenv("SMTP_FROM") or smtp_user
    use_starttls = os.getenv("SMTP_STARTTLS", "true").lower() in {"1", "true", "yes"}

    if not smtp_host or not smtp_user or not smtp_password or not smtp_from:
        raise RuntimeError("Configuration SMTP incomplete. Definir SMTP_HOST, SMTP_USER, SMTP_PASSWORD, SMTP_FROM.")

    report_pdf = build_analytics_pdf()

    mail = EmailMessage()
    mail["From"] = smtp_from
    mail["To"] = to_email
    mail["Subject"] = subject or "WasteAI - Rapport analytique"
    mail.set_content(message or "Bonjour,\n\nVeuillez trouver en piece jointe le rapport analytique WasteAI.\n\nCordialement,\nWasteAI")
    mail.add_attachment(report_pdf, maintype="application", subtype="pdf", filename="wasteai-rapport-analytique.pdf")

    with smtplib.SMTP(smtp_host, smtp_port, timeout=20) as smtp:
        if use_starttls:
            smtp.starttls()
        smtp.login(smtp_user, smtp_password)
        smtp.send_message(mail)
