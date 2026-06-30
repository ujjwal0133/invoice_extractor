from __future__ import annotations

import inspect
import importlib
import importlib.metadata
import json
import logging
import os
import shutil
import tempfile
from pathlib import Path
from typing import Any, Iterable

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("pdf-table-extractor")

app = FastAPI(title="PDF Table Extractor", version="1.0.0")

PDF_MAX_BYTES = 100 * 1024 * 1024


class CamelotRuntime:
    def __init__(self) -> None:
        self.module: Any | None = None
        self.version = "unknown"
        self.read_pdf: Any | None = None
        self.signature: inspect.Signature | None = None
        self.parameters: set[str] = set()
        self.accepts_kwargs = False
        self.supports_auto = False
        self.backend_status: dict[str, Any] = {}
        self.ready = False
        self.error: str | None = None
        self.inspect()

    def inspect(self) -> None:
        try:
            camelot = importlib.import_module("camelot")
            read_pdf = getattr(camelot, "read_pdf", None)
            if not callable(read_pdf):
                raise RuntimeError("Installed camelot package does not expose callable read_pdf")

            try:
                self.version = importlib.metadata.version("camelot-py")
            except importlib.metadata.PackageNotFoundError:
                self.version = str(getattr(camelot, "__version__", "unknown"))

            signature = inspect.signature(read_pdf)
            self.module = camelot
            self.read_pdf = read_pdf
            self.signature = signature
            self.parameters = set(signature.parameters)
            self.accepts_kwargs = any(
                parameter.kind is inspect.Parameter.VAR_KEYWORD
                for parameter in signature.parameters.values()
            )
            self.supports_auto = self._detect_auto_flavor_support()
            self.backend_status = self._inspect_backends()
            self.ready = True

            logger.info("Camelot version: %s", self.version)
            logger.info("Camelot read_pdf signature: %s", signature)
            logger.info("Camelot supports flavor='auto': %s", self.supports_auto)
            logger.info("Camelot backend status: %s", json.dumps(self.backend_status, sort_keys=True))
        except Exception as exc:
            self.ready = False
            self.error = str(exc)
            logger.exception("Camelot inspection failed")

    def _detect_auto_flavor_support(self) -> bool:
        if self.read_pdf is None:
            return False

        try:
            source = inspect.getsource(self.read_pdf)
        except (OSError, TypeError):
            source = ""

        if "\"auto\"" in source or "'auto'" in source:
            return True

        doc = inspect.getdoc(self.read_pdf) or ""
        return "auto" in doc.lower()

    def _inspect_backends(self) -> dict[str, Any]:
        backend_status: dict[str, Any] = {
            "python_modules": {},
            "executables": {},
        }

        for module_name in ("pypdfium2", "cv2", "ghostscript"):
            spec = importlib.util.find_spec(module_name)
            backend_status["python_modules"][module_name] = spec is not None

        for executable in ("gswin64c", "gswin32c", "gs", "pdftoppm"):
            backend_status["executables"][executable] = shutil.which(executable)

        if backend_status["python_modules"].get("pypdfium2"):
            try:
                backend_status["versions"] = {
                    "pypdfium2": importlib.metadata.version("pypdfium2"),
                    "opencv-python-headless": importlib.metadata.version("opencv-python-headless"),
                }
            except importlib.metadata.PackageNotFoundError:
                backend_status["versions"] = {}

        return backend_status

    def call_read_pdf(self, filepath: Path, *, flavor: str) -> Any:
        if self.read_pdf is None:
            raise RuntimeError("Camelot is not initialized")

        kwargs = self._build_kwargs(flavor=flavor)
        return self.read_pdf(str(filepath), **kwargs)

    def _build_kwargs(self, *, flavor: str) -> dict[str, Any]:
        kwargs: dict[str, Any] = {}
        self._set_kwarg(kwargs, "pages", "all")
        self._set_kwarg(kwargs, "flavor", flavor)
        self._set_kwarg(kwargs, "suppress_stdout", True)

        if flavor in {"lattice", "auto", "hybrid"}:
            if self.backend_status.get("python_modules", {}).get("pypdfium2"):
                self._set_kwarg(kwargs, "backend", "pdfium")
            self._set_kwarg(kwargs, "use_fallback", True)

        return kwargs

    def _set_kwarg(self, kwargs: dict[str, Any], name: str, value: Any) -> None:
        if name in self.parameters or self.accepts_kwargs:
            kwargs[name] = value


camelot_runtime = CamelotRuntime()


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": camelot_runtime.ready,
        "camelot_version": camelot_runtime.version,
        "read_pdf_signature": str(camelot_runtime.signature),
        "supports_auto_flavor": camelot_runtime.supports_auto,
        "backend_status": camelot_runtime.backend_status,
        "error": camelot_runtime.error,
    }


@app.post("/extract")
async def extract(file: UploadFile = File(...)) -> JSONResponse:
    if not camelot_runtime.ready:
        raise HTTPException(
            status_code=500,
            detail=f"Camelot is not available: {camelot_runtime.error}",
        )

    validate_upload(file)
    temp_path: Path | None = None

    try:
        temp_path = await save_upload_to_temp_pdf(file)
        tables = extract_tables(temp_path)
        print_tables(tables)
        return JSONResponse(content={"tables": tables})
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("PDF table extraction failed")
        raise HTTPException(status_code=422, detail=f"Failed to extract tables: {exc}") from exc
    finally:
        await file.close()
        if temp_path is not None:
            try:
                temp_path.unlink(missing_ok=True)
            except OSError:
                logger.warning("Could not delete temporary file: %s", temp_path)


def validate_upload(file: UploadFile) -> None:
    filename = file.filename or ""
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Uploaded file must have a .pdf filename")

    allowed_content_types = {
        "application/pdf",
        "application/octet-stream",
        "binary/octet-stream",
        "application/x-pdf",
    }
    if file.content_type and file.content_type.lower() not in allowed_content_types:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported content type {file.content_type!r}; expected a PDF upload",
        )


async def save_upload_to_temp_pdf(file: UploadFile) -> Path:
    fd, name = tempfile.mkstemp(prefix="camelot_upload_", suffix=".pdf")
    temp_path = Path(name)
    total_bytes = 0

    try:
        with os.fdopen(fd, "wb") as output:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break

                total_bytes += len(chunk)
                if total_bytes > PDF_MAX_BYTES:
                    raise HTTPException(status_code=413, detail="Uploaded PDF is larger than 100 MB")

                output.write(chunk)

        if total_bytes == 0:
            raise HTTPException(status_code=400, detail="Uploaded PDF is empty")

        return temp_path
    except Exception:
        temp_path.unlink(missing_ok=True)
        raise


def extract_tables(pdf_path: Path) -> list[list[list[str]]]:
    errors: list[str] = []
    attempted_flavors = 0

    if camelot_runtime.supports_auto:
        attempted_flavors += 1
        try:
            logger.info("Extracting tables with Camelot flavor=auto from %s", pdf_path)
            camelot_tables = camelot_runtime.call_read_pdf(pdf_path, flavor="auto")
            tables = tables_to_json_ready_lists(camelot_tables)
            logger.info("Camelot flavor=auto returned %d table(s)", len(tables))
            return tables
        except Exception as exc:
            errors.append(f"auto: {exc}")
            logger.warning("Camelot flavor=auto failed; retrying lattice and stream: %s", exc)

    merged_tables: list[list[list[str]]] = []
    seen_tables: set[str] = set()

    for flavor in ("lattice", "stream"):
        attempted_flavors += 1
        try:
            logger.info("Extracting tables with Camelot flavor=%s from %s", flavor, pdf_path)
            camelot_tables = camelot_runtime.call_read_pdf(pdf_path, flavor=flavor)
            tables = tables_to_json_ready_lists(camelot_tables)
            logger.info("Camelot flavor=%s returned %d table(s)", flavor, len(tables))

            for table in tables:
                table_key = json.dumps(table, ensure_ascii=False, separators=(",", ":"))
                if table_key not in seen_tables:
                    seen_tables.add(table_key)
                    merged_tables.append(table)
        except Exception as exc:
            errors.append(f"{flavor}: {exc}")
            logger.warning("Camelot flavor=%s failed: %s", flavor, exc)

    if merged_tables:
        return merged_tables

    if errors and len(errors) == attempted_flavors:
        raise RuntimeError("; ".join(errors))

    return []


def tables_to_json_ready_lists(camelot_tables: Iterable[Any]) -> list[list[list[str]]]:
    tables: list[list[list[str]]] = []

    for table in camelot_tables:
        dataframe = getattr(table, "df", None)
        if dataframe is None:
            continue

        dataframe = dataframe.fillna("")
        rows = [
            ["" if value is None else str(value).strip() for value in row]
            for row in dataframe.astype(str).values.tolist()
        ]

        if rows:
            tables.append(rows)

    return tables


def print_tables(tables: list[list[list[str]]]) -> None:
    print("Extracted tables:")
    print(json.dumps(tables, ensure_ascii=False, indent=2))
