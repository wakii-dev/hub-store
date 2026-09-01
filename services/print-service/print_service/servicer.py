"""PrintServiceServicer — impl print.proto (SF-2 authored, KHÔNG đổi proto).

ListPrinters: filter registry theo shopCode.
Print: parse fat payload → dispatch template → PDF bytes + job in-memory.
"""
from __future__ import annotations

import logging

import grpc

from ._proto import print_pb2, print_pb2_grpc
from . import templates
from .jobs import JobRegistry
from .printers import Printer, filter_by_shop
from .templates import base as payload_base

logger = logging.getLogger(__name__)


class PrintServicer(print_pb2_grpc.PrintServiceServicer):
    def __init__(self, printers: list[Printer], jobs: JobRegistry | None = None) -> None:
        self._printers = printers
        self._jobs = jobs if jobs is not None else JobRegistry()

    @property
    def jobs(self) -> JobRegistry:
        return self._jobs

    def ListPrinters(self, request, context):  # noqa: N802 (proto RPC name)
        matched = filter_by_shop(self._printers, request.shop_code)
        return print_pb2.ListPrintersResponse(
            printers=[
                print_pb2.Printer(
                    id=p.printer_id, name=p.name, shop_code=p.shop_code
                )
                for p in matched
            ]
        )

    def Print(self, request, context):  # noqa: N802
        print_type = request.print_type
        if print_type == print_pb2.PRINT_TYPE_UNSPECIFIED:
            context.abort(
                grpc.StatusCode.INVALID_ARGUMENT,
                "print_type là UNSPECIFIED — phải là 1 trong 5 loại phiếu "
                f"({sorted(templates.PRINT_TYPE_NAMES.values())}).",
            )

        # printer_id: BFF luôn truyền từ printers list; stateless service —
        # chỉ log warning nếu không khớp registry, KHÔNG chặn render.
        if request.printer_id and not any(
            p.printer_id == request.printer_id for p in self._printers
        ):
            logger.warning("printer_id %s không có trong registry", request.printer_id)

        try:
            batch = payload_base.parse_payload(request.batch_payload)
        except ValueError as exc:
            context.abort(grpc.StatusCode.INVALID_ARGUMENT, str(exc))

        job = self._jobs.create(
            print_type=templates.PRINT_TYPE_NAMES.get(print_type, str(print_type)),
            printer_id=request.printer_id,
            batch_code=batch.get("batchCode", ""),
        )
        try:
            pdf = templates.render_pdf(print_type, batch)
        except ValueError as exc:
            self._jobs.mark_failed(job)
            context.abort(grpc.StatusCode.INVALID_ARGUMENT, str(exc))
        except Exception:  # noqa: BLE001 — render lỗi bất kỳ → job FAILED + re-raise
            self._jobs.mark_failed(job)
            logger.exception("Render PDF lỗi (job %s)", job.job_id)
            context.abort(
                grpc.StatusCode.INTERNAL,
                f"Render PDF thất bại (job {job.job_id}) — xem log service.",
            )
        self._jobs.mark_rendered(job, len(pdf))
        logger.info("Job %s RENDERED: %s %s → %d bytes",
                    job.job_id, job.batch_code, job.print_type, len(pdf))
        return print_pb2.PrintResponse(pdf_content=pdf)
