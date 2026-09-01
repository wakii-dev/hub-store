package com.hubstore.fulfillment.tools;

import com.hubstore.fulfillment.v1.BatchStatus;
import com.hubstore.fulfillment.v1.FilterOrdersRequest;
import com.hubstore.fulfillment.v1.FilterOrdersResponse;
import com.hubstore.fulfillment.v1.FulfillmentServiceGrpc;
import com.hubstore.fulfillment.v1.ListRegionsResponse;
import com.hubstore.fulfillment.v1.ListDistinctShopsRequest;
import com.hubstore.fulfillment.v1.ListDistinctShopsResponse;
import io.grpc.ManagedChannel;
import io.grpc.ManagedChannelBuilder;

/**
 * Smoke client — bằng chứng ACCEPTANCE (context pack SF-3):
 *   - filter trả ≥25 đơn,
 *   - shop 30201 ≥5 đơn Chưa soạn (batchStatus=0),
 *   - master-data regions/shops phản hồi.
 * Chạy: ./run.sh smoke  (server phải đang chạy ở terminal khác: ./run.sh)
 * grpcurl không có trên máy này — client Java là smoke path chính.
 */
public final class SmokeClient {

    private SmokeClient() {
    }

    public static void main(String[] args) {
        String target = args.length > 0 ? args[0] : "localhost:50051";
        String host = target.split(":")[0];
        int port = Integer.parseInt(target.split(":")[1]);
        ManagedChannel channel = ManagedChannelBuilder.forAddress(host, port)
                .usePlaintext()
                .build();
        try {
            FulfillmentServiceGrpc.FulfillmentServiceBlockingStub stub =
                    FulfillmentServiceGrpc.newBlockingStub(channel);

            FilterOrdersResponse all = stub.filterOrders(FilterOrdersRequest.newBuilder()
                    .setPage(1).setPageSize(100).build());
            System.out.println("[SMOKE] FilterOrders total = " + all.getTotal()
                    + (all.getTotal() >= 25 ? "  (PASS ≥25)" : "  (FAIL <25)"));

            FilterOrdersResponse shop30201 = stub.filterOrders(FilterOrdersRequest.newBuilder()
                    .addShopCodes("30201")
                    .addBatchStatuses(BatchStatus.BATCH_STATUS_NOT_PREPARED)
                    .setPage(1).setPageSize(100).build());
            System.out.println("[SMOKE] Shop 30201 Chưa soạn = " + shop30201.getTotal()
                    + (shop30201.getTotal() >= 5 ? "  (PASS ≥5)" : "  (FAIL <5)"));

            ListDistinctShopsResponse shops = stub.listDistinctShops(
                    ListDistinctShopsRequest.newBuilder().build());
            System.out.println("[SMOKE] Distinct shops = " + shops.getItemsCount()
                    + " " + shops.getItemsList().stream().map(s -> s.getCode()).toList());

            ListRegionsResponse regions = stub.listRegions(
                    com.hubstore.fulfillment.v1.ListRegionsRequest.newBuilder().build());
            System.out.println("[SMOKE] Regions = " + regions.getRegionsCount());

            // Deep item check — expand D1 đọc được từ filter response (spec §3.8).
            if (all.getItemsCount() > 0) {
                var first = all.getItems(0);
                System.out.println("[SMOKE] Sample " + first.getFulfillCode()
                        + " shop=" + first.getShopAssignment().getShopCode()
                        + " products=" + first.getItemsCount()
                        + " debt=" + first.getIsDebtSplittingOrder());
            }

            boolean pass = all.getTotal() >= 25 && shop30201.getTotal() >= 5;
            System.out.println("[SMOKE] " + (pass ? "SMOKE PASS" : "SMOKE FAIL"));
            if (!pass) {
                System.exit(1);
            }
        } finally {
            channel.shutdown();
        }
    }
}
