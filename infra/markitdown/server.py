"""Thin HTTP wrapper around microsoft/markitdown: POST /convert → markdown JSON."""

from __future__ import annotations

import tempfile
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from markitdown import MarkItDown
from pydantic import BaseModel

app = FastAPI(title="markitdown-convert", version="1.0.0")
converter = MarkItDown()


class ConvertResponse(BaseModel):
    markdown: str
    filename: str


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/convert", response_model=ConvertResponse)
async def convert(file: UploadFile = File(...)) -> ConvertResponse:
    if not file.filename:
        raise HTTPException(status_code=400, detail="filename required")

    suffix = Path(file.filename).suffix or ".bin"
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="empty file")

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(data)
        tmp_path = tmp.name

    try:
        result = converter.convert(tmp_path)
        markdown = (result.text_content or "").strip()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    return ConvertResponse(markdown=markdown, filename=file.filename)
