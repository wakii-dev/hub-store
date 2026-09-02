# batching-service (Go gRPC :50052) — SF-11 compose mẫu.
# Build context = REPO ROOT (go.mod replace ../../api/proto/gen/go).
FROM golang:1.21-alpine AS build
WORKDIR /repo
COPY api/proto/gen/go api/proto/gen/go
COPY services/batching-service services/batching-service
WORKDIR /repo/services/batching-service
RUN CGO_ENABLED=0 go build -o /out/batching ./cmd/server

FROM alpine:3.19
WORKDIR /app
COPY --from=build /out/batching batching
ENV CANONICAL_SEED_PATH=/seed/canonical-seed.json \
    FULFILLMENT_ADDR=fulfillment-service:50051 \
    BATCHING_PORT=50052
EXPOSE 50052
ENTRYPOINT ["/app/batching"]
