# batching-service (Go gRPC :50052) — FI-245 SF-3.
# Build context = REPO ROOT (go.mod replace ../../api/proto/gen/go).
# Entrypoint: wait-for-db → golang-migrate up → serve (pin migrate v4.17.1 —
# cùng version với compose batches-migrate SF-1; migrate idempotent qua
# schema_migrations nên chạy 2 phía không sao).
FROM golang:1.21-alpine AS build
WORKDIR /repo
COPY api/proto/gen/go api/proto/gen/go
COPY services/batching-service services/batching-service
WORKDIR /repo/services/batching-service
RUN CGO_ENABLED=0 go build -o /out/batching ./cmd/server

FROM migrate/migrate:v4.17.1 AS migrate

FROM alpine:3.19
WORKDIR /app
COPY --from=build /out/batching batching
COPY --from=migrate /migrate /usr/local/bin/migrate
COPY services/batching-service/migrations /app/migrations
COPY services/batching-service/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh
ENV BATCHING_DB_HOST=postgres \
    BATCHING_DB_PORT=5432 \
    BATCHING_DB_NAME=batching \
    FULFILLMENT_ADDR=fulfillment-service:50051 \
    BATCHING_PORT=50052
EXPOSE 50052
ENTRYPOINT ["/app/docker-entrypoint.sh"]
