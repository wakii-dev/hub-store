package com.hubstore.fulfillment;

import com.hubstore.fulfillment.seed.SeedLoader;
import com.hubstore.fulfillment.seed.SeedModels;
import com.hubstore.fulfillment.service.TransferServiceImpl;
import com.hubstore.fulfillment.store.InMemoryOrderRepository;
import com.hubstore.fulfillment.store.TransferTicketRepository;
import com.hubstore.fulfillment.store.TransferTicketRepository.TransferTicketRecord;
import com.hubstore.transfer.v1.CreateTransferTicketRequest;
import com.hubstore.transfer.v1.ListTransferTicketsRequest;
import com.hubstore.transfer.v1.ListTransferTicketsResponse;
import io.grpc.Status;
import io.grpc.StatusRuntimeException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.SimpleTransactionStatus;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit TransferServiceImpl (SF-28 plan Task 1 Step 5, pattern TechGrpcValidationTest
 * — DB-skip: InMemoryOrderRepository + fake TransferTicketRepository, không DB).
 * Gates: tách nợ → INVALID_ARGUMENT; trùng PENDING → ALREADY_EXISTS; happy path
 * sinh TT-0001; list filter theo codes (+status).
 */
class TransferServiceImplTest {

    private InMemoryOrderRepository orders;
    private FakeTicketRepo tickets;
    private TransferServiceImpl service;

    /** Fake in-memory — sinh ticket_code TT-%04d (counter = sequence proxy). */
    private static class FakeTicketRepo implements TransferTicketRepository {
        final List<TransferTicketRecord> rows = new ArrayList<>();
        final AtomicLong seq = new AtomicLong(1);

        @Override
        public boolean existsPendingByOrder(String orderFulfillCode) {
            return rows.stream().anyMatch(r -> r.orderFulfillCode().equals(orderFulfillCode)
                    && "PENDING".equals(r.status()));
        }

        @Override
        public TransferTicketRecord insert(String orderFulfillCode, String fromHub, String toHub,
                                           String reason, String createdBy) {
            TransferTicketRecord r = new TransferTicketRecord(
                    String.format("TT-%04d", seq.getAndIncrement()), orderFulfillCode,
                    fromHub, toHub, reason, "PENDING", createdBy, Instant.now());
            rows.add(r);
            return r;
        }

        @Override
        public List<TransferTicketRecord> findByOrders(List<String> orderFulfillCodes, String status) {
            return rows.stream()
                    .filter(r -> orderFulfillCodes.contains(r.orderFulfillCode()))
                    .filter(r -> status == null || status.isBlank() || status.equals(r.status()))
                    .toList();
        }
    }

    @BeforeEach
    void setUp() {
        SeedModels.SeedFile seed = SeedLoader.load(Path.of("../../api/seed/canonical-seed.json"));
        orders = new InMemoryOrderRepository(seed);
        tickets = new FakeTicketRepo();
        PlatformTransactionManager noop = new PlatformTransactionManager() {
            @Override
            public TransactionStatus getTransaction(TransactionDefinition definition) {
                return new SimpleTransactionStatus();
            }

            @Override
            public void commit(TransactionStatus status) {
            }

            @Override
            public void rollback(TransactionStatus status) {
            }
        };
        service = new TransferServiceImpl(orders, tickets, new TransactionTemplate(noop));
    }

    /** Clone 1 đơn seed thành đơn tách nợ mới (seed không có đơn tách nợ sẵn). */
    private SeedModels.OrderSeed insertDebtSplittingClone(String sourceCode, String newCode) {
        SeedModels.OrderSeed base = orders.findByFulfillCode(sourceCode).orElseThrow();
        SeedModels.OrderSeed debt = new SeedModels.OrderSeed(
                newCode, null, base.statusCode(), base.batchStatus(), null,
                base.shopAssignment(), base.originalTime(), base.deliveryTime(),
                base.orderStatus(), base.items(), base.codAmount(), base.totalQuantity(),
                true, base.customerAddress(), base.distance(), base.note(), List.of(),
                base.customerName(), base.customerPhone(), null, null, null, null,
                Instant.now());
        orders.insertOrders(List.of(debt));
        return debt;
    }

    private StatusRuntimeException create(String code, String toHub) {
        CollectingObserver<com.hubstore.transfer.v1.CreateTransferTicketResponse> obs =
                new CollectingObserver<>();
        service.createTransferTicket(CreateTransferTicketRequest.newBuilder()
                .setOrderFulfillCode(code).setToHub(toHub).build(), obs);
        // Error path: service onError thay vì onCompleted — KHÔNG assert completed.
        return (StatusRuntimeException) obs.error;
    }

    // ---------------- createTransferTicket ----------------

    @Test
    void debtSplittingOrder_invalidArgument() {
        insertDebtSplittingClone("ORD-3001", "ORD-DEBT-1");
        StatusRuntimeException e = create("ORD-DEBT-1", "Hub Đà Nẵng");
        assertThat(e.getStatus().getCode()).isEqualTo(Status.Code.INVALID_ARGUMENT);
        assertThat(e.getStatus().getDescription()).contains("Validation failed");
        // Không sinh ticket.
        assertThat(tickets.rows).isEmpty();
    }

    @Test
    void duplicatePendingOrder_alreadyExists() {
        assertThat(create("ORD-3001", "Hub Đà Nẵng")).isNull();
        StatusRuntimeException e = create("ORD-3001", "Hub Huế");
        assertThat(e.getStatus().getCode()).isEqualTo(Status.Code.ALREADY_EXISTS);
        // Chỉ 1 ticket PENDING tồn tại.
        assertThat(tickets.rows).hasSize(1);
    }

    @Test
    void approvedTicketAllowsNewPending() {
        assertThat(create("ORD-3001", "Hub Đà Nẵng")).isNull();
        // Epic duyệt ticket (ngoài scope) sẽ set APPROVED — fake trực tiếp để test
        // lifecycle: order có ticket APPROVED được tạo ticket PENDING mới.
        TransferTicketRecord old = tickets.rows.get(0);
        tickets.rows.set(0, new TransferTicketRecord(old.ticketCode(), old.orderFulfillCode(),
                old.fromHub(), old.toHub(), old.reason(), "APPROVED", old.createdBy(),
                old.createdAt()));
        assertThat(create("ORD-3001", "Hub Huế")).isNull();
        assertThat(tickets.rows).hasSize(2);
    }

    @Test
    void unknownOrder_notFound() {
        StatusRuntimeException e = create("ORD-9999", "Hub Đà Nẵng");
        assertThat(e.getStatus().getCode()).isEqualTo(Status.Code.NOT_FOUND);
    }

    @Test
    void happyPath_ticketCodeSequence_tt0001() {
        assertThat(create("ORD-3001", "Hub Đà Nẵng")).isNull();
        assertThat(tickets.rows.get(0).ticketCode()).isEqualTo("TT-0001");
        assertThat(tickets.rows.get(0).status()).isEqualTo("PENDING");
        assertThat(create("ORD-3002", "Hub Huế")).isNull();
        assertThat(tickets.rows.get(1).ticketCode()).isEqualTo("TT-0002");
    }

    @Test
    void blankToHub_invalidArgument() {
        StatusRuntimeException e = create("ORD-3001", "");
        assertThat(e.getStatus().getCode()).isEqualTo(Status.Code.INVALID_ARGUMENT);
    }

    // ---------------- listTransferTickets ----------------

    @Test
    void listFilter_byCodes_onlyMatchingReturned() {
        assertThat(create("ORD-3001", "Hub Đà Nẵng")).isNull();
        assertThat(create("ORD-3002", "Hub Huế")).isNull();
        CollectingObserver<ListTransferTicketsResponse> obs = new CollectingObserver<>();
        service.listTransferTickets(ListTransferTicketsRequest.newBuilder()
                .addOrderFulfillCodes("ORD-3001").build(), obs);
        assertThat(obs.error).isNull();
        ListTransferTicketsResponse resp = obs.values.get(0);
        assertThat(resp.getTicketsCount()).isEqualTo(1);
        assertThat(resp.getTickets(0).getOrderFulfillCode()).isEqualTo("ORD-3001");
        assertThat(resp.getTickets(0).getTicketCode()).isEqualTo("TT-0001");
        assertThat(resp.getTickets(0).getStatus()).isEqualTo("PENDING");
    }

    @Test
    void listFilter_byStatus_excludesOtherStatus() {
        assertThat(create("ORD-3001", "Hub Đà Nẵng")).isNull();
        // ORD-3002 không có ticket → filter theo codes=3001, status=APPROVED → rỗng.
        CollectingObserver<ListTransferTicketsResponse> obs = new CollectingObserver<>();
        service.listTransferTickets(ListTransferTicketsRequest.newBuilder()
                .addOrderFulfillCodes("ORD-3001").setStatus("APPROVED").build(), obs);
        assertThat(obs.error).isNull();
        assertThat(obs.values.get(0).getTicketsCount()).isZero();
    }
}
