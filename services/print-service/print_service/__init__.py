"""print-service (Python) — gRPC :50053 — owned by SF-5 (FI-239).

Stateless PDF generator: nhận fat payload (batch JSON) từ BFF, render PDF
reportlab, trả bytes. KHÔNG gọi Go/Java (spec §3.7 P1 pin).
"""

__version__ = "1.0.0"
