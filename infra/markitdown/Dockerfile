FROM python:3.12-slim

RUN pip install --no-cache-dir markitdown[all] fastapi uvicorn python-multipart

WORKDIR /app
COPY server.py .

EXPOSE 8200

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8200"]
