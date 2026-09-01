"""Print jobs — in-memory registry (spec §3.3: job status in-memory).

Mỗi call Print tạo 1 job: QUEUED → RENDERED (hoặc FAILED nếu render lỗi).
Tiến trình thật của máy in ngoài scope — print-service chỉ track render.
"""
from __future__ import annotations

import itertools
import threading
import time
from dataclasses import dataclass, field

_STATUS_QUEUED = "QUEUED"
_STATUS_RENDERED = "RENDERED"
_STATUS_FAILED = "FAILED"


@dataclass
class PrintJob:
    job_id: str
    print_type: str
    printer_id: str
    batch_code: str
    status: str = _STATUS_QUEUED
    created_at: float = field(default_factory=time.time)
    pdf_size: int = 0


class JobRegistry:
    """Thread-safe in-memory job store (process lifetime — stateless service)."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._jobs: dict[str, PrintJob] = {}
        self._counter = itertools.count(1)

    def create(self, print_type: str, printer_id: str, batch_code: str) -> PrintJob:
        with self._lock:
            job = PrintJob(
                job_id=f"JOB-{next(self._counter):06d}",
                print_type=print_type,
                printer_id=printer_id,
                batch_code=batch_code,
            )
            self._jobs[job.job_id] = job
            return job

    def mark_rendered(self, job: PrintJob, pdf_size: int) -> None:
        with self._lock:
            job.status = _STATUS_RENDERED
            job.pdf_size = pdf_size

    def mark_failed(self, job: PrintJob) -> None:
        with self._lock:
            job.status = _STATUS_FAILED

    def get(self, job_id: str) -> PrintJob | None:
        with self._lock:
            return self._jobs.get(job_id)
