# Plan — FI-245 SF-2: Orders Java → Postgres (Linear FI-247)

Spec: docs/superpowers/contexts/fi245-sf-2.md (context pack = spec slice; epic spec §3.2).
Worktree branch: VuHoi/sf-2-orders-postgres → merge về story/fi245-postgres-production.

## Phase 0 (mini impact)

- Problem: `InMemoryOrderRepository` load seed JSON vào RAM — mất state khi restart, không production-grade. SF-2 thay persistence layer bằng Postgres GIỮ NGUYÊN `OrderRepository` interface + semantics (gRPC impl không đổi).
- Touch map: đúng như context pack §Touch map (repo mới, config mới, migration mới, pom/run.sh/application.yml, tests). READ-ONLY: proto, FulfillmentServiceImpl, Go, BFF, seed JSON, compose, seed-db.sh.
- Second-order: (1) seed-db.sh SF-1 ĐÃ chốt column contract — schema V1 phải khớp 100% (deliverable list trong header script); (2) boot không được tự seed (emptiness-gate thuộc pipeline SF-1); (3) filter ordering phải khớp in-memory = thứ tự seed insertion → ORDER BY surrogate id (id BIGSERIAL insert theo seed order; seed hiện sort theo fulfillCode nên id-order ≡ fulfill_code-order); (4) `@Component` bỏ khỏi InMemory → 3 file test hiện construct trực tiếp, không vỡ.
- Directions: (A) JdbcTemplate + SQL tay (chọn — module nhỏ, 11 method, kiểm soát SQL window function/CASE ordering tường minh) vs (B) JPA/Hibernate (over-engineering: entity mapping + để tránh lazy-transaction traps, không cần). Chọn A.
- Risks: psql seed nạp `timestamptz` — Java đọc ra OffsetDateTime → map về String ISO để khớp proto; LIKE escape %/_ cho region heuristic; race total dùng COUNT(*) OVER() 1 query.

## Tasks

### Task 1 — flyway-orders-schema + datasource env (bracket: flyway-orders-schema, datasource-config-env, flyway-wiring-boot phần pom)
- `src/main/resources/db/migration/V1__orders_schema.sql`: 4 bảng theo column contract seed-db.sh:
  - `orders`: id BIGSERIAL PK, fulfill_code UNIQUE NOT NULL, order_code, status_code INT, batch_status INT, batch_code, shop_code/shop_name/shop_address, original_time_from/to TIMESTAMPTZ, delivery_time_from/to TIMESTAMPTZ, order_status INT, items JSONB, cod_amount BIGINT, total_quantity INT, is_debt_splitting_order BOOL, customer_address, distance DOUBLE PRECISION, note
  - `shop_assignment_history`: id BIGSERIAL PK, fulfill_code NOT NULL (FK→orders ON DELETE CASCADE), occurred_at TIMESTAMPTZ, action, note
  - `regions`: code PK, name, type, parent_code
  - `delivery_staff`: staff_id PK, name, shop_code, phone
- pom.xml: flyway-core + flyway-database-postgresql (Flyway 10 cần), spring-boot-starter-jdbc, org.postgresql:postgresql (runtime).
- application.yml: spring.datasource qua env FULFILLMENT_DB_HOST/PORT/NAME/USER/PASSWORD (default localhost dev), spring.flyway enabled.

### Task 2 — PostgresOrderRepository (bracket: postgres-repo-impl, filter-window-count-escape, findbycodes-ordering, dual-code-match, mutate-transaction, history-table-mapping, distinctshops-sql)
- `store/PostgresOrderRepository.java` implements OrderRepository, JdbcTemplate:
  - `filter`: 1 query `SELECT ..., COUNT(*) OVER() AS total` + WHERE động (fulfill_code ILIKE substring, batch_status IN, order_status IN, shop_code IN, region substring heuristic qua EXISTS regions + escape %/_, time overlap, exclude NOT IN) + ORDER BY id, fulfill_code + OFFSET/FETCH.
  - `findByFulfillCode`: `WHERE fulfill_code = ? OR order_code = ?` (dual ORD/RSA).
  - `findByCodes`: query IN + post-sort theo thứ tự codes yêu cầu, bỏ lạ.
  - `mutateBatchStatus`: 1 transaction (@Transactional) — UPDATE từng code, lạ skip; target=0 SET batch_code=NULL.
  - `assignShopHub`: UPDATE + INSERT history (1 transaction).
  - `getHistory`: SELECT theo fulfill_code ORDER BY occurred_at, id (tie-breaker ổn định) → map proto entry.
  - `distinctShops`: `SELECT DISTINCT shop_code, first_value... ` — dùng DISTINCT ON (shop_code) ORDER BY shop_code, id (first-seen) — sort theo shop_code.
  - `regions()/deliveryStaff()`: SELECT * giữ thứ tự insertion (ORDER BY id/insertion).
  - Row → `SeedModels.OrderSeed` mapping (times format ISO_OFFSET).

### Task 3 — impl-selection + seed-verify boot + run.sh (bracket: impl-selection-conditional, seed-verify-boot, runsh-wait-db)
- `config/OrderRepositoryConfig`: @Bean postgres `@ConditionalOnProperty(name="fulfillment.store", havingValue="postgres", matchIfMissing=true)`; inmemory bean khi `fulfillment.store=inmemory` (test-only). Bỏ @Component khỏi InMemoryOrderRepository.
- Seed-verify boot: ApplicationRunner khi store=postgres — orders rỗng → WARN log hướng dẫn chạy seed pipeline SF-1 (`bash scripts/seed-db.sh`); `STRICT_SEED=1` → throw fail-loud. KHÔNG tự seed.
- run.sh: wait-db (pg TCP check qua bash /dev/tcp hoặc pg_isready nếu có) trước `spring-boot:run`.
- Thieu datasource khi store=postgres → Spring Boot tự fail-loud (không fallback in-memory).

### Task 4 — tests (bracket: unit-tests-inmemory, integration-test-db)
- Giữ 3 file unit test chạy không DB (InMemory construct trực tiếp — đã không vỡ).
- Integration test `PostgresOrderRepositoryIT`: skip qua Assumptions khi FULFILLMENT_DB_* không kết nối được; khi có DB: parity filter in-memory vs postgres (cùng seed, cùng kết quả + total), mutate persist, history append + ordering, findByCodes ordering, LIKE escape region.

## Acceptance (từ context pack)
1. `docker compose up -d postgres orders-migrate` + `bash scripts/seed-db.sh` → psql thấy ORD-3001 + regions + staff + history.
2. Service lên với Postgres: filter parity in-memory, paginate + total khớp (window count).
3. Mutate qua repo → psql thấy, restart còn.
4. History append + getHistory đúng thứ tự.
5. `mvn test` pass không DB; integration tự skip khi không DB.
