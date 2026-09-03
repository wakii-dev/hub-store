# fulfillment-service (Java 17 gRPC :50051) — SF-11 compose mẫu.
# Build context = REPO ROOT (pom build-helper wires ../../api/proto/gen/java).
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /repo
COPY api/proto/gen/java api/proto/gen/java
COPY services/fulfillment-service services/fulfillment-service
WORKDIR /repo/services/fulfillment-service
RUN mvn -q -B dependency:go-offline
RUN mvn -q -B package -DskipTests

FROM eclipse-temurin:17-jre
# SF-12 — curl cho compose healthcheck probe (base temurin KHÔNG có curl/wget).
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /repo/services/fulfillment-service/target/*.jar app.jar
ENV SEED_PATH=/seed/canonical-seed.json
EXPOSE 50051
ENTRYPOINT ["java", "-jar", "app.jar"]
