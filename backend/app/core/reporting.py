import io
import os
import smtplib
from email.message import EmailMessage

from app.core.analytics_store import get_analytics


def _pdf_escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _build_simple_pdf(lines: list[str]) -> bytes:
    y = 780
    parts = ["BT", "/F1 10 Tf", f"50 {y} Td"]
    for line in lines:
        safe = _pdf_escape(line)
        parts.append(f"({safe}) Tj")
        parts.append("T*")
    parts.append("ET")
    content = "\n".join(parts).encode("latin-1", errors="replace")

    objs = []
    objs.append(b"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n")
    objs.append(b"2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj\n")
    objs.append(
        b"3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj\n"
    )
    objs.append(b"4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n")
    objs.append(f"5 0 obj << /Length {len(content)} >> stream\n".encode("ascii") + content + b"\nendstream endobj\n")

    out = io.BytesIO()
    out.write(b"%PDF-1.4\n")
    offsets = [0]
    for obj in objs:
        offsets.append(out.tell())
        out.write(obj)

    xref_start = out.tell()
    out.write(f"xref\n0 {len(objs) + 1}\n".encode("ascii"))
    out.write(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        out.write(f"{offset:010d} 00000 n \n".encode("ascii"))

    out.write(
        f"trailer << /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref_start}\n%%EOF".encode("ascii")
    )
    return out.getvalue()


def _format_report_lines() -> list[str]:
    analytics = get_analytics(limit=500)
    summary = analytics["summary"]
    history = analytics["history"]

    lines = [
        "WasteAI - Rapport analytique",
        "",
        f"Analyses: {summary['total_analyses']}",
        f"Tonnes valorisees: {summary['tonnes_valorisees']}",
        f"Revenus generes (EUR): {summary['revenus_generes_eur']}",
        f"CO2 evite (kg): {summary['co2_evite_kg']}",
        "",
        "Historique recent:",
    ]

    for item in history[:20]:
        lines.append(
            f"{item.get('timestamp','')[:19]} | {item.get('nom','')} | {item.get('decision','')} | "
            f"{item.get('tonnes_valorisees',0)} t | {item.get('revenus_generes_eur',0)} EUR | {item.get('co2_evite_kg',0)} kgCO2"
        )

    if len(history) > 20:
        lines.append(f"... {len(history) - 20} lignes supplementaires non affichees")

    return lines


def build_analytics_pdf() -> bytes:
    return _build_simple_pdf(_format_report_lines())


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
    mail.set_content(
        message
        or "Bonjour,\n\nVeuillez trouver en piece jointe le rapport analytique WasteAI.\n\nCordialement,\nWasteAI"
    )
    mail.add_attachment(
        report_pdf,
        maintype="application",
        subtype="pdf",
        filename="wasteai-rapport-analytique.pdf",
    )

    with smtplib.SMTP(smtp_host, smtp_port, timeout=20) as smtp:
        if use_starttls:
            smtp.starttls()
        smtp.login(smtp_user, smtp_password)
        smtp.send_message(mail)

