FROM pyqlib/qlib_image_stable:stable

WORKDIR /app

COPY pyproject.toml ./
RUN pip install --no-cache-dir \
    "fastapi>=0.104.0,<0.110.0" \
    "uvicorn[standard]>=0.23.0,<0.28.0" \
    "pydantic-settings>=2.0.0,<2.3.0" \
    "pyyaml>=6.0.2" \
    "tushare>=1.4.0" \
    "httpx>=0.24.0,<0.28.0" \
    "fire>=0.5.0" \
    "tqdm>=4.66.0" \
    "loguru>=0.7.0"

COPY app/ ./app/
COPY scripts/ ./scripts/
COPY strategies/ ./strategies/
COPY config/ ./config/

ENV PYTHONPATH=/app
ENV QLIB_DATA_DIR=/root/.qlib/qlib_data/cn_data
ENV QLIB_SOURCE_DIR=/app/source
ENV QLIB_CONFIG_DIR=/app/config

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
