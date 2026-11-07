FROM python:3.12-slim-bookworm@sha256:935c3c5b12357a7e10caa9c1e6ca5692344d97cf229832ef584be2cec9fc03df
RUN apt-get update && apt-get install --no-install-recommends -y \
    clamav clamav-freshclam yara poppler-utils tesseract-ocr tesseract-ocr-eng util-linux \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --uid 10001 --no-create-home scanner
WORKDIR /app
COPY worker.py server.py rules.yar /app/
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
USER 10001:10001
EXPOSE 8080
CMD ["python", "/app/server.py"]
