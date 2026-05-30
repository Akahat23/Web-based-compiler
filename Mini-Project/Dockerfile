FROM python:3.11-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    default-jre \
    default-jdk \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install gunicorn

COPY backend/ ./backend/

RUN mkdir -p /app/backend/data /app/backend/temp

WORKDIR /app/backend

EXPOSE 5000

CMD ["gunicorn", "-w", "1", "--threads", "100", "-b", "0.0.0.0:5000", "server:app"]
