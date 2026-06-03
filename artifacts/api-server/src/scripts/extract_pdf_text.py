import sys

import pdfplumber


def extract_text(pdf_path: str) -> str:
    pages: list[str] = []

    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            if text.strip():
                pages.append(text.strip())

    return "\n\n".join(pages)


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: extract_pdf_text.py <pdf_path>", file=sys.stderr)
        return 2

    try:
        text = extract_text(sys.argv[1])
    except Exception as exc:
        print(f"Unable to extract PDF text: {exc}", file=sys.stderr)
        return 1

    if not text.strip():
        print(
            "No extractable text found in PDF. Scanned PDFs require OCR before analysis.",
            file=sys.stderr,
        )
        return 1

    sys.stdout.write(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
