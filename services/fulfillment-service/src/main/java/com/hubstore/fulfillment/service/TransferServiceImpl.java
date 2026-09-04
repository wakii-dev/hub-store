package com.hubstore.fulfillment.service;

import com.hubstore.fulfillment.seed.SeedModels;
import com.hubstore.fulfillment.store.OrderRepository;
import com.hubstore.fulfillment.store.TransferTicketRepository;
import com.hubstore.fulfillment.store.TransferTicketRepository.TransferTicketRecord;
import com.hubstore.transfer.v1.CreateTransferTicketRequest;
import com.hubstore.transfer.v1.CreateTransferTicketResponse;
import com.hubstore.transfer.v1.ListTransferTicketsRequest;
import com.hubstore.transfer.v1.ListTransferTicketsResponse;
import com.hubstore.transfer.v1.TransferTicket;
import com.hubstore.transfer.v1.TransferServiceGrpc;
import io.grpc.Status;
import io.grpc.StatusRuntimeException;
import io.grpc.stub.StreamObserver;
import net.devh.boot.grpc.server.service.GrpcService;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.support.TransactionTemplate;

import java.sql.SQLException;
import java.time.Instant;
import java.util.List;

/**
 * TransferService SF-28 (plan Task 1, spec §3 Q6-Q7). Actor từ metadata
 * "x-user-name" (ActorInterceptor) — createdBy của ticket; audit row ghi
 * BFF-side (logActivity) nên Java KHÔNG append audit.
 * <p>
 * CreateTransferTicket gates (1 tx):
 * <ol>
 *   <li>order không tồn tại → NOT_FOUND (→404);</li>
 *   <li>đơn tách nợ → INVALID_ARGUMENT (pattern assignShopHub — BFF map 422;
 *       KHÔNG dùng FAILED_PRECONDITION vì mapper global = 409 sẽ trùng 409
 *       của trùng-PENDING);</li>
 *   <li>đã có ticket PENDING cùng order → ALREADY_EXISTS (BFF map 409).</li>
 * </ol>
 */
@GrpcService
public class TransferServiceImpl extends TransferServiceGrpc.TransferServiceImplBase {

    private final OrderRepository orders;
    private final TransferTicketRepository tickets;
    private final TransactionTemplate tx;

    public TransferServiceImpl(OrderRepository orders, TransferTicketRepository tickets,
                               TransactionTemplate tx) {
        this.orders = orders;
        this.tickets = tickets;
        this.tx = tx;
    }

    @Override
    public void createTransferTicket(CreateTransferTicketRequest request,
                                     StreamObserver<CreateTransferTicketResponse> responseObserver) {
        try {
            TransferTicket ticket = toProto(tx.execute(status -> createTicket(request)));
            responseObserver.onNext(CreateTransferTicketResponse.newBuilder()
                    .setTicket(ticket)
                    .build());
            responseObserver.onCompleted();
        } catch (StatusRuntimeException e) {
            responseObserver.onError(e);
        } catch (RuntimeException e) {
            responseObserver.onError(Status.INTERNAL.withDescription(e.getMessage()).asRuntimeException());
        }
    }

    @Override
    public void listTransferTickets(ListTransferTicketsRequest request,
                                    StreamObserver<ListTransferTicketsResponse> responseObserver) {
        try {
            ListTransferTicketsResponse.Builder resp = ListTransferTicketsResponse.newBuilder();
            String status = request.getStatus().isBlank() ? null : request.getStatus();
            for (TransferTicketRecord r : tickets.findByOrders(request.getOrderFulfillCodesList(), status)) {
                resp.addTickets(toProto(r));
            }
            responseObserver.onNext(resp.build());
            responseObserver.onCompleted();
        } catch (StatusRuntimeException e) {
            responseObserver.onError(e);
        } catch (RuntimeException e) {
            responseObserver.onError(Status.INTERNAL.withDescription(e.getMessage()).asRuntimeException());
        }
    }

    // ---------------- helpers ----------------

    private TransferTicketRecord createTicket(CreateTransferTicketRequest request) {
        String code = request.getOrderFulfillCode();
        if (code == null || code.isBlank()) {
            throw GrpcErrors.invalidArgument(List.of(new GrpcErrors.ErrorDetail(
                    "orderFulfillCode", "orderFulfillCode là bắt buộc.")));
        }
        if (request.getToHub() == null || request.getToHub().isBlank()) {
            throw GrpcErrors.invalidArgument(List.of(new GrpcErrors.ErrorDetail(
                    "toHub", "Kho đích (toHub) là bắt buộc.")));
        }
        SeedModels.OrderSeed order = orders.findByFulfillCode(code)
                .orElseThrow(() -> GrpcErrors.notFound("orderFulfillCode", code));
        // Tách nợ chặn server-side (spec Q7) — INVALID_ARGUMENT khớp assignShopHub.
        if (order.isDebtSplittingOrder()) {
            throw GrpcErrors.invalidArgument(List.of(new GrpcErrors.ErrorDetail(
                    "orderFulfillCode", "Đơn tách nợ không thể tạo yêu cầu chuyển kho.")));
        }
        if (tickets.existsPendingByOrder(code)) {
            throw pendingConflict(code);
        }
        try {
            return tickets.insert(code, blankToNull(request.getFromHub()), request.getToHub(),
                    blankToNull(request.getReason()), ActorInterceptor.currentActor());
        } catch (DataIntegrityViolationException e) {
            // Safety net: 2 request đồng thời cùng order đều pass existsPendingByOrder
            // (READ COMMITTED, không lock) — unique partial index
            // uq_transfer_tickets_one_pending (V9) chặn, map lại ALREADY_EXISTS.
            if (isPendingUniqueViolation(e)) {
                throw pendingConflict(code);
            }
            throw e;
        }
    }

    private static StatusRuntimeException pendingConflict(String code) {
        return GrpcErrors.withDetails(Status.ALREADY_EXISTS,
                "Order " + code + " already has a PENDING transfer ticket.",
                List.of(new GrpcErrors.ErrorDetail("orderFulfillCode",
                        "Đơn đã có yêu cầu chuyển kho đang chờ duyệt.")));
    }

    /** SQLState 23505 trên ĐÚNG index pending (ticket_code UNIQUE cũng 23505). */
    private static boolean isPendingUniqueViolation(Throwable e) {
        for (Throwable t = e; t != null; t = t.getCause() == t ? null : t.getCause()) {
            if (t instanceof SQLException sql
                    && "23505".equals(sql.getSQLState())
                    && String.valueOf(sql.getMessage())
                            .contains("uq_transfer_tickets_one_pending")) {
                return true;
            }
        }
        return false;
    }

    private static TransferTicket toProto(TransferTicketRecord r) {
        Instant createdAt = r.createdAt();
        return TransferTicket.newBuilder()
                .setTicketCode(orEmpty(r.ticketCode()))
                .setOrderFulfillCode(orEmpty(r.orderFulfillCode()))
                .setFromHub(orEmpty(r.fromHub()))
                .setToHub(orEmpty(r.toHub()))
                .setReason(orEmpty(r.reason()))
                .setStatus(orEmpty(r.status()))
                .setCreatedBy(orEmpty(r.createdBy()))
                .setCreatedAt(createdAt == null ? "" : createdAt.toString())
                // confirmed fields: null khi PENDING (scope SF-28 không confirm).
                .setConfirmedBy("")
                .setConfirmedAt("")
                .build();
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s;
    }

    private static String orEmpty(String s) {
        return s == null ? "" : s;
    }
}
