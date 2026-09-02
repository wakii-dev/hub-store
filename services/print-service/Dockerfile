# print-service (Python gRPC :50053) — SF-11 compose mẫu.
# Giữ layout repo (/repo/services/print-service) — _proto.py tính
# _REPO_ROOT = parents[3] rồi nối api/proto/gen/python (SF-2 authored).
FROM python:3.12-slim
# Font Unicode cho PDF render — code fallback DejaVu (/usr/share/fonts/truetype/dejavu)
RUN apt-get update && apt-get install -y --no-install-recommends fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
WORKDIR /repo/services/print-service
COPY api/proto/gen/python /repo/api/proto/gen/python
COPY services/print-service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY services/print-service/print_service ./print_service
ENV PRINT_SERVICE_SEED_PATH=/seed/canonical-seed.json
EXPOSE 50053
CMD ["python", "-m", "print_service"]
