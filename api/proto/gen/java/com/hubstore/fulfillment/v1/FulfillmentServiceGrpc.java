package com.hubstore.fulfillment.v1;

import static io.grpc.MethodDescriptor.generateFullMethodName;

/**
 */
@javax.annotation.Generated(
    value = "by gRPC proto compiler (version 1.64.0)",
    comments = "Source: hubstore/fulfillment/v1/fulfillment.proto")
@io.grpc.stub.annotations.GrpcGenerated
public final class FulfillmentServiceGrpc {

  private FulfillmentServiceGrpc() {}

  public static final java.lang.String SERVICE_NAME = "hubstore.fulfillment.v1.FulfillmentService";

  // Static method descriptors that strictly reflect the proto.
  private static volatile io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.FilterOrdersRequest,
      com.hubstore.fulfillment.v1.FilterOrdersResponse> getFilterOrdersMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "FilterOrders",
      requestType = com.hubstore.fulfillment.v1.FilterOrdersRequest.class,
      responseType = com.hubstore.fulfillment.v1.FilterOrdersResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.FilterOrdersRequest,
      com.hubstore.fulfillment.v1.FilterOrdersResponse> getFilterOrdersMethod() {
    io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.FilterOrdersRequest, com.hubstore.fulfillment.v1.FilterOrdersResponse> getFilterOrdersMethod;
    if ((getFilterOrdersMethod = FulfillmentServiceGrpc.getFilterOrdersMethod) == null) {
      synchronized (FulfillmentServiceGrpc.class) {
        if ((getFilterOrdersMethod = FulfillmentServiceGrpc.getFilterOrdersMethod) == null) {
          FulfillmentServiceGrpc.getFilterOrdersMethod = getFilterOrdersMethod =
              io.grpc.MethodDescriptor.<com.hubstore.fulfillment.v1.FilterOrdersRequest, com.hubstore.fulfillment.v1.FilterOrdersResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "FilterOrders"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.fulfillment.v1.FilterOrdersRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.fulfillment.v1.FilterOrdersResponse.getDefaultInstance()))
              .setSchemaDescriptor(new FulfillmentServiceMethodDescriptorSupplier("FilterOrders"))
              .build();
        }
      }
    }
    return getFilterOrdersMethod;
  }

  private static volatile io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.GetOrderDetailRequest,
      com.hubstore.fulfillment.v1.GetOrderDetailResponse> getGetOrderDetailMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "GetOrderDetail",
      requestType = com.hubstore.fulfillment.v1.GetOrderDetailRequest.class,
      responseType = com.hubstore.fulfillment.v1.GetOrderDetailResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.GetOrderDetailRequest,
      com.hubstore.fulfillment.v1.GetOrderDetailResponse> getGetOrderDetailMethod() {
    io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.GetOrderDetailRequest, com.hubstore.fulfillment.v1.GetOrderDetailResponse> getGetOrderDetailMethod;
    if ((getGetOrderDetailMethod = FulfillmentServiceGrpc.getGetOrderDetailMethod) == null) {
      synchronized (FulfillmentServiceGrpc.class) {
        if ((getGetOrderDetailMethod = FulfillmentServiceGrpc.getGetOrderDetailMethod) == null) {
          FulfillmentServiceGrpc.getGetOrderDetailMethod = getGetOrderDetailMethod =
              io.grpc.MethodDescriptor.<com.hubstore.fulfillment.v1.GetOrderDetailRequest, com.hubstore.fulfillment.v1.GetOrderDetailResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "GetOrderDetail"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.fulfillment.v1.GetOrderDetailRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.fulfillment.v1.GetOrderDetailResponse.getDefaultInstance()))
              .setSchemaDescriptor(new FulfillmentServiceMethodDescriptorSupplier("GetOrderDetail"))
              .build();
        }
      }
    }
    return getGetOrderDetailMethod;
  }

  private static volatile io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.MutateOrderStatusRequest,
      com.hubstore.fulfillment.v1.MutateOrderStatusResponse> getMutateOrderStatusMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "MutateOrderStatus",
      requestType = com.hubstore.fulfillment.v1.MutateOrderStatusRequest.class,
      responseType = com.hubstore.fulfillment.v1.MutateOrderStatusResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.MutateOrderStatusRequest,
      com.hubstore.fulfillment.v1.MutateOrderStatusResponse> getMutateOrderStatusMethod() {
    io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.MutateOrderStatusRequest, com.hubstore.fulfillment.v1.MutateOrderStatusResponse> getMutateOrderStatusMethod;
    if ((getMutateOrderStatusMethod = FulfillmentServiceGrpc.getMutateOrderStatusMethod) == null) {
      synchronized (FulfillmentServiceGrpc.class) {
        if ((getMutateOrderStatusMethod = FulfillmentServiceGrpc.getMutateOrderStatusMethod) == null) {
          FulfillmentServiceGrpc.getMutateOrderStatusMethod = getMutateOrderStatusMethod =
              io.grpc.MethodDescriptor.<com.hubstore.fulfillment.v1.MutateOrderStatusRequest, com.hubstore.fulfillment.v1.MutateOrderStatusResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "MutateOrderStatus"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.fulfillment.v1.MutateOrderStatusRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.fulfillment.v1.MutateOrderStatusResponse.getDefaultInstance()))
              .setSchemaDescriptor(new FulfillmentServiceMethodDescriptorSupplier("MutateOrderStatus"))
              .build();
        }
      }
    }
    return getMutateOrderStatusMethod;
  }

  private static volatile io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.GetOrdersByCodesRequest,
      com.hubstore.fulfillment.v1.GetOrdersByCodesResponse> getGetOrdersByCodesMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "GetOrdersByCodes",
      requestType = com.hubstore.fulfillment.v1.GetOrdersByCodesRequest.class,
      responseType = com.hubstore.fulfillment.v1.GetOrdersByCodesResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.GetOrdersByCodesRequest,
      com.hubstore.fulfillment.v1.GetOrdersByCodesResponse> getGetOrdersByCodesMethod() {
    io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.GetOrdersByCodesRequest, com.hubstore.fulfillment.v1.GetOrdersByCodesResponse> getGetOrdersByCodesMethod;
    if ((getGetOrdersByCodesMethod = FulfillmentServiceGrpc.getGetOrdersByCodesMethod) == null) {
      synchronized (FulfillmentServiceGrpc.class) {
        if ((getGetOrdersByCodesMethod = FulfillmentServiceGrpc.getGetOrdersByCodesMethod) == null) {
          FulfillmentServiceGrpc.getGetOrdersByCodesMethod = getGetOrdersByCodesMethod =
              io.grpc.MethodDescriptor.<com.hubstore.fulfillment.v1.GetOrdersByCodesRequest, com.hubstore.fulfillment.v1.GetOrdersByCodesResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "GetOrdersByCodes"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.fulfillment.v1.GetOrdersByCodesRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.fulfillment.v1.GetOrdersByCodesResponse.getDefaultInstance()))
              .setSchemaDescriptor(new FulfillmentServiceMethodDescriptorSupplier("GetOrdersByCodes"))
              .build();
        }
      }
    }
    return getGetOrdersByCodesMethod;
  }

  private static volatile io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.AssignShopHubRequest,
      com.hubstore.fulfillment.v1.AssignShopHubResponse> getAssignShopHubMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "AssignShopHub",
      requestType = com.hubstore.fulfillment.v1.AssignShopHubRequest.class,
      responseType = com.hubstore.fulfillment.v1.AssignShopHubResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.AssignShopHubRequest,
      com.hubstore.fulfillment.v1.AssignShopHubResponse> getAssignShopHubMethod() {
    io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.AssignShopHubRequest, com.hubstore.fulfillment.v1.AssignShopHubResponse> getAssignShopHubMethod;
    if ((getAssignShopHubMethod = FulfillmentServiceGrpc.getAssignShopHubMethod) == null) {
      synchronized (FulfillmentServiceGrpc.class) {
        if ((getAssignShopHubMethod = FulfillmentServiceGrpc.getAssignShopHubMethod) == null) {
          FulfillmentServiceGrpc.getAssignShopHubMethod = getAssignShopHubMethod =
              io.grpc.MethodDescriptor.<com.hubstore.fulfillment.v1.AssignShopHubRequest, com.hubstore.fulfillment.v1.AssignShopHubResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "AssignShopHub"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.fulfillment.v1.AssignShopHubRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.fulfillment.v1.AssignShopHubResponse.getDefaultInstance()))
              .setSchemaDescriptor(new FulfillmentServiceMethodDescriptorSupplier("AssignShopHub"))
              .build();
        }
      }
    }
    return getAssignShopHubMethod;
  }

  private static volatile io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.GetAssignHistoryRequest,
      com.hubstore.fulfillment.v1.GetAssignHistoryResponse> getGetAssignHistoryMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "GetAssignHistory",
      requestType = com.hubstore.fulfillment.v1.GetAssignHistoryRequest.class,
      responseType = com.hubstore.fulfillment.v1.GetAssignHistoryResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.GetAssignHistoryRequest,
      com.hubstore.fulfillment.v1.GetAssignHistoryResponse> getGetAssignHistoryMethod() {
    io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.GetAssignHistoryRequest, com.hubstore.fulfillment.v1.GetAssignHistoryResponse> getGetAssignHistoryMethod;
    if ((getGetAssignHistoryMethod = FulfillmentServiceGrpc.getGetAssignHistoryMethod) == null) {
      synchronized (FulfillmentServiceGrpc.class) {
        if ((getGetAssignHistoryMethod = FulfillmentServiceGrpc.getGetAssignHistoryMethod) == null) {
          FulfillmentServiceGrpc.getGetAssignHistoryMethod = getGetAssignHistoryMethod =
              io.grpc.MethodDescriptor.<com.hubstore.fulfillment.v1.GetAssignHistoryRequest, com.hubstore.fulfillment.v1.GetAssignHistoryResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "GetAssignHistory"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.fulfillment.v1.GetAssignHistoryRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.fulfillment.v1.GetAssignHistoryResponse.getDefaultInstance()))
              .setSchemaDescriptor(new FulfillmentServiceMethodDescriptorSupplier("GetAssignHistory"))
              .build();
        }
      }
    }
    return getGetAssignHistoryMethod;
  }

  private static volatile io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.UpdateDeliveryTimeRequest,
      com.hubstore.fulfillment.v1.UpdateDeliveryTimeResponse> getUpdateDeliveryTimeMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "UpdateDeliveryTime",
      requestType = com.hubstore.fulfillment.v1.UpdateDeliveryTimeRequest.class,
      responseType = com.hubstore.fulfillment.v1.UpdateDeliveryTimeResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.UpdateDeliveryTimeRequest,
      com.hubstore.fulfillment.v1.UpdateDeliveryTimeResponse> getUpdateDeliveryTimeMethod() {
    io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.UpdateDeliveryTimeRequest, com.hubstore.fulfillment.v1.UpdateDeliveryTimeResponse> getUpdateDeliveryTimeMethod;
    if ((getUpdateDeliveryTimeMethod = FulfillmentServiceGrpc.getUpdateDeliveryTimeMethod) == null) {
      synchronized (FulfillmentServiceGrpc.class) {
        if ((getUpdateDeliveryTimeMethod = FulfillmentServiceGrpc.getUpdateDeliveryTimeMethod) == null) {
          FulfillmentServiceGrpc.getUpdateDeliveryTimeMethod = getUpdateDeliveryTimeMethod =
              io.grpc.MethodDescriptor.<com.hubstore.fulfillment.v1.UpdateDeliveryTimeRequest, com.hubstore.fulfillment.v1.UpdateDeliveryTimeResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "UpdateDeliveryTime"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.fulfillment.v1.UpdateDeliveryTimeRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.fulfillment.v1.UpdateDeliveryTimeResponse.getDefaultInstance()))
              .setSchemaDescriptor(new FulfillmentServiceMethodDescriptorSupplier("UpdateDeliveryTime"))
              .build();
        }
      }
    }
    return getUpdateDeliveryTimeMethod;
  }

  private static volatile io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.UpdateNoteRequest,
      com.hubstore.fulfillment.v1.UpdateNoteResponse> getUpdateNoteMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "UpdateNote",
      requestType = com.hubstore.fulfillment.v1.UpdateNoteRequest.class,
      responseType = com.hubstore.fulfillment.v1.UpdateNoteResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.UpdateNoteRequest,
      com.hubstore.fulfillment.v1.UpdateNoteResponse> getUpdateNoteMethod() {
    io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.UpdateNoteRequest, com.hubstore.fulfillment.v1.UpdateNoteResponse> getUpdateNoteMethod;
    if ((getUpdateNoteMethod = FulfillmentServiceGrpc.getUpdateNoteMethod) == null) {
      synchronized (FulfillmentServiceGrpc.class) {
        if ((getUpdateNoteMethod = FulfillmentServiceGrpc.getUpdateNoteMethod) == null) {
          FulfillmentServiceGrpc.getUpdateNoteMethod = getUpdateNoteMethod =
              io.grpc.MethodDescriptor.<com.hubstore.fulfillment.v1.UpdateNoteRequest, com.hubstore.fulfillment.v1.UpdateNoteResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "UpdateNote"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.fulfillment.v1.UpdateNoteRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.fulfillment.v1.UpdateNoteResponse.getDefaultInstance()))
              .setSchemaDescriptor(new FulfillmentServiceMethodDescriptorSupplier("UpdateNote"))
              .build();
        }
      }
    }
    return getUpdateNoteMethod;
  }

  private static volatile io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.ListRegionsRequest,
      com.hubstore.fulfillment.v1.ListRegionsResponse> getListRegionsMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ListRegions",
      requestType = com.hubstore.fulfillment.v1.ListRegionsRequest.class,
      responseType = com.hubstore.fulfillment.v1.ListRegionsResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.ListRegionsRequest,
      com.hubstore.fulfillment.v1.ListRegionsResponse> getListRegionsMethod() {
    io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.ListRegionsRequest, com.hubstore.fulfillment.v1.ListRegionsResponse> getListRegionsMethod;
    if ((getListRegionsMethod = FulfillmentServiceGrpc.getListRegionsMethod) == null) {
      synchronized (FulfillmentServiceGrpc.class) {
        if ((getListRegionsMethod = FulfillmentServiceGrpc.getListRegionsMethod) == null) {
          FulfillmentServiceGrpc.getListRegionsMethod = getListRegionsMethod =
              io.grpc.MethodDescriptor.<com.hubstore.fulfillment.v1.ListRegionsRequest, com.hubstore.fulfillment.v1.ListRegionsResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ListRegions"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.fulfillment.v1.ListRegionsRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.fulfillment.v1.ListRegionsResponse.getDefaultInstance()))
              .setSchemaDescriptor(new FulfillmentServiceMethodDescriptorSupplier("ListRegions"))
              .build();
        }
      }
    }
    return getListRegionsMethod;
  }

  private static volatile io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.ListDeliveryStaffRequest,
      com.hubstore.fulfillment.v1.ListDeliveryStaffResponse> getListDeliveryStaffMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ListDeliveryStaff",
      requestType = com.hubstore.fulfillment.v1.ListDeliveryStaffRequest.class,
      responseType = com.hubstore.fulfillment.v1.ListDeliveryStaffResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.ListDeliveryStaffRequest,
      com.hubstore.fulfillment.v1.ListDeliveryStaffResponse> getListDeliveryStaffMethod() {
    io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.ListDeliveryStaffRequest, com.hubstore.fulfillment.v1.ListDeliveryStaffResponse> getListDeliveryStaffMethod;
    if ((getListDeliveryStaffMethod = FulfillmentServiceGrpc.getListDeliveryStaffMethod) == null) {
      synchronized (FulfillmentServiceGrpc.class) {
        if ((getListDeliveryStaffMethod = FulfillmentServiceGrpc.getListDeliveryStaffMethod) == null) {
          FulfillmentServiceGrpc.getListDeliveryStaffMethod = getListDeliveryStaffMethod =
              io.grpc.MethodDescriptor.<com.hubstore.fulfillment.v1.ListDeliveryStaffRequest, com.hubstore.fulfillment.v1.ListDeliveryStaffResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ListDeliveryStaff"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.fulfillment.v1.ListDeliveryStaffRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.fulfillment.v1.ListDeliveryStaffResponse.getDefaultInstance()))
              .setSchemaDescriptor(new FulfillmentServiceMethodDescriptorSupplier("ListDeliveryStaff"))
              .build();
        }
      }
    }
    return getListDeliveryStaffMethod;
  }

  private static volatile io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.ListDistinctShopsRequest,
      com.hubstore.fulfillment.v1.ListDistinctShopsResponse> getListDistinctShopsMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ListDistinctShops",
      requestType = com.hubstore.fulfillment.v1.ListDistinctShopsRequest.class,
      responseType = com.hubstore.fulfillment.v1.ListDistinctShopsResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.ListDistinctShopsRequest,
      com.hubstore.fulfillment.v1.ListDistinctShopsResponse> getListDistinctShopsMethod() {
    io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.ListDistinctShopsRequest, com.hubstore.fulfillment.v1.ListDistinctShopsResponse> getListDistinctShopsMethod;
    if ((getListDistinctShopsMethod = FulfillmentServiceGrpc.getListDistinctShopsMethod) == null) {
      synchronized (FulfillmentServiceGrpc.class) {
        if ((getListDistinctShopsMethod = FulfillmentServiceGrpc.getListDistinctShopsMethod) == null) {
          FulfillmentServiceGrpc.getListDistinctShopsMethod = getListDistinctShopsMethod =
              io.grpc.MethodDescriptor.<com.hubstore.fulfillment.v1.ListDistinctShopsRequest, com.hubstore.fulfillment.v1.ListDistinctShopsResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ListDistinctShops"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.fulfillment.v1.ListDistinctShopsRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.fulfillment.v1.ListDistinctShopsResponse.getDefaultInstance()))
              .setSchemaDescriptor(new FulfillmentServiceMethodDescriptorSupplier("ListDistinctShops"))
              .build();
        }
      }
    }
    return getListDistinctShopsMethod;
  }

  private static volatile io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.GetTimeDeliveryRequest,
      com.hubstore.fulfillment.v1.GetTimeDeliveryResponse> getGetTimeDeliveryMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "GetTimeDelivery",
      requestType = com.hubstore.fulfillment.v1.GetTimeDeliveryRequest.class,
      responseType = com.hubstore.fulfillment.v1.GetTimeDeliveryResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.GetTimeDeliveryRequest,
      com.hubstore.fulfillment.v1.GetTimeDeliveryResponse> getGetTimeDeliveryMethod() {
    io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.GetTimeDeliveryRequest, com.hubstore.fulfillment.v1.GetTimeDeliveryResponse> getGetTimeDeliveryMethod;
    if ((getGetTimeDeliveryMethod = FulfillmentServiceGrpc.getGetTimeDeliveryMethod) == null) {
      synchronized (FulfillmentServiceGrpc.class) {
        if ((getGetTimeDeliveryMethod = FulfillmentServiceGrpc.getGetTimeDeliveryMethod) == null) {
          FulfillmentServiceGrpc.getGetTimeDeliveryMethod = getGetTimeDeliveryMethod =
              io.grpc.MethodDescriptor.<com.hubstore.fulfillment.v1.GetTimeDeliveryRequest, com.hubstore.fulfillment.v1.GetTimeDeliveryResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "GetTimeDelivery"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.fulfillment.v1.GetTimeDeliveryRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.fulfillment.v1.GetTimeDeliveryResponse.getDefaultInstance()))
              .setSchemaDescriptor(new FulfillmentServiceMethodDescriptorSupplier("GetTimeDelivery"))
              .build();
        }
      }
    }
    return getGetTimeDeliveryMethod;
  }

  private static volatile io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.GetDashboardStatsRequest,
      com.hubstore.fulfillment.v1.GetDashboardStatsResponse> getGetDashboardStatsMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "GetDashboardStats",
      requestType = com.hubstore.fulfillment.v1.GetDashboardStatsRequest.class,
      responseType = com.hubstore.fulfillment.v1.GetDashboardStatsResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.GetDashboardStatsRequest,
      com.hubstore.fulfillment.v1.GetDashboardStatsResponse> getGetDashboardStatsMethod() {
    io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.GetDashboardStatsRequest, com.hubstore.fulfillment.v1.GetDashboardStatsResponse> getGetDashboardStatsMethod;
    if ((getGetDashboardStatsMethod = FulfillmentServiceGrpc.getGetDashboardStatsMethod) == null) {
      synchronized (FulfillmentServiceGrpc.class) {
        if ((getGetDashboardStatsMethod = FulfillmentServiceGrpc.getGetDashboardStatsMethod) == null) {
          FulfillmentServiceGrpc.getGetDashboardStatsMethod = getGetDashboardStatsMethod =
              io.grpc.MethodDescriptor.<com.hubstore.fulfillment.v1.GetDashboardStatsRequest, com.hubstore.fulfillment.v1.GetDashboardStatsResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "GetDashboardStats"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.fulfillment.v1.GetDashboardStatsRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.fulfillment.v1.GetDashboardStatsResponse.getDefaultInstance()))
              .setSchemaDescriptor(new FulfillmentServiceMethodDescriptorSupplier("GetDashboardStats"))
              .build();
        }
      }
    }
    return getGetDashboardStatsMethod;
  }

  private static volatile io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.FilterD2cOrdersRequest,
      com.hubstore.fulfillment.v1.FilterD2cOrdersResponse> getFilterD2cOrdersMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "FilterD2cOrders",
      requestType = com.hubstore.fulfillment.v1.FilterD2cOrdersRequest.class,
      responseType = com.hubstore.fulfillment.v1.FilterD2cOrdersResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.FilterD2cOrdersRequest,
      com.hubstore.fulfillment.v1.FilterD2cOrdersResponse> getFilterD2cOrdersMethod() {
    io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.FilterD2cOrdersRequest, com.hubstore.fulfillment.v1.FilterD2cOrdersResponse> getFilterD2cOrdersMethod;
    if ((getFilterD2cOrdersMethod = FulfillmentServiceGrpc.getFilterD2cOrdersMethod) == null) {
      synchronized (FulfillmentServiceGrpc.class) {
        if ((getFilterD2cOrdersMethod = FulfillmentServiceGrpc.getFilterD2cOrdersMethod) == null) {
          FulfillmentServiceGrpc.getFilterD2cOrdersMethod = getFilterD2cOrdersMethod =
              io.grpc.MethodDescriptor.<com.hubstore.fulfillment.v1.FilterD2cOrdersRequest, com.hubstore.fulfillment.v1.FilterD2cOrdersResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "FilterD2cOrders"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.fulfillment.v1.FilterD2cOrdersRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.fulfillment.v1.FilterD2cOrdersResponse.getDefaultInstance()))
              .setSchemaDescriptor(new FulfillmentServiceMethodDescriptorSupplier("FilterD2cOrders"))
              .build();
        }
      }
    }
    return getFilterD2cOrdersMethod;
  }

  private static volatile io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.UpdateD2cOrderNoteRequest,
      com.hubstore.fulfillment.v1.UpdateD2cOrderNoteResponse> getUpdateD2cOrderNoteMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "UpdateD2cOrderNote",
      requestType = com.hubstore.fulfillment.v1.UpdateD2cOrderNoteRequest.class,
      responseType = com.hubstore.fulfillment.v1.UpdateD2cOrderNoteResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.UpdateD2cOrderNoteRequest,
      com.hubstore.fulfillment.v1.UpdateD2cOrderNoteResponse> getUpdateD2cOrderNoteMethod() {
    io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.UpdateD2cOrderNoteRequest, com.hubstore.fulfillment.v1.UpdateD2cOrderNoteResponse> getUpdateD2cOrderNoteMethod;
    if ((getUpdateD2cOrderNoteMethod = FulfillmentServiceGrpc.getUpdateD2cOrderNoteMethod) == null) {
      synchronized (FulfillmentServiceGrpc.class) {
        if ((getUpdateD2cOrderNoteMethod = FulfillmentServiceGrpc.getUpdateD2cOrderNoteMethod) == null) {
          FulfillmentServiceGrpc.getUpdateD2cOrderNoteMethod = getUpdateD2cOrderNoteMethod =
              io.grpc.MethodDescriptor.<com.hubstore.fulfillment.v1.UpdateD2cOrderNoteRequest, com.hubstore.fulfillment.v1.UpdateD2cOrderNoteResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "UpdateD2cOrderNote"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.fulfillment.v1.UpdateD2cOrderNoteRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.fulfillment.v1.UpdateD2cOrderNoteResponse.getDefaultInstance()))
              .setSchemaDescriptor(new FulfillmentServiceMethodDescriptorSupplier("UpdateD2cOrderNote"))
              .build();
        }
      }
    }
    return getUpdateD2cOrderNoteMethod;
  }

  /**
   * Creates a new async stub that supports all call types for the service
   */
  public static FulfillmentServiceStub newStub(io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<FulfillmentServiceStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<FulfillmentServiceStub>() {
        @java.lang.Override
        public FulfillmentServiceStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new FulfillmentServiceStub(channel, callOptions);
        }
      };
    return FulfillmentServiceStub.newStub(factory, channel);
  }

  /**
   * Creates a new blocking-style stub that supports unary and streaming output calls on the service
   */
  public static FulfillmentServiceBlockingStub newBlockingStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<FulfillmentServiceBlockingStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<FulfillmentServiceBlockingStub>() {
        @java.lang.Override
        public FulfillmentServiceBlockingStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new FulfillmentServiceBlockingStub(channel, callOptions);
        }
      };
    return FulfillmentServiceBlockingStub.newStub(factory, channel);
  }

  /**
   * Creates a new ListenableFuture-style stub that supports unary calls on the service
   */
  public static FulfillmentServiceFutureStub newFutureStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<FulfillmentServiceFutureStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<FulfillmentServiceFutureStub>() {
        @java.lang.Override
        public FulfillmentServiceFutureStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new FulfillmentServiceFutureStub(channel, callOptions);
        }
      };
    return FulfillmentServiceFutureStub.newStub(factory, channel);
  }

  /**
   */
  public interface AsyncService {

    /**
     * <pre>
     * D1 list — filter + pagination. exclude_fulfill_codes = extension pin v1.
     * </pre>
     */
    default void filterOrders(com.hubstore.fulfillment.v1.FilterOrdersRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.FilterOrdersResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getFilterOrdersMethod(), responseObserver);
    }

    /**
     * <pre>
     * GET /fulfillment/{fulfillCode} — sẵn sàng cho tương lai; D1 expand KHÔNG
     * gọi (waive tường minh, spec §3.8).
     * </pre>
     */
    default void getOrderDetail(com.hubstore.fulfillment.v1.GetOrderDetailRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.GetOrderDetailResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getGetOrderDetailMethod(), responseObserver);
    }

    /**
     * <pre>
     * Gọi bởi batching-service (Go): tạo/hủy/hoàn-tất phiếu → đổi batchStatus.
     * </pre>
     */
    default void mutateOrderStatus(com.hubstore.fulfillment.v1.MutateOrderStatusRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.MutateOrderStatusResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getMutateOrderStatusMethod(), responseObserver);
    }

    /**
     * <pre>
     * Hydration — Go gọi để validate rule 1 §3.6 (P0 fix: server-side thật).
     * </pre>
     */
    default void getOrdersByCodes(com.hubstore.fulfillment.v1.GetOrdersByCodesRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.GetOrdersByCodesResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getGetOrdersByCodesMethod(), responseObserver);
    }

    /**
     * <pre>
     * D1c chuyển kho.
     * </pre>
     */
    default void assignShopHub(com.hubstore.fulfillment.v1.AssignShopHubRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.AssignShopHubResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getAssignShopHubMethod(), responseObserver);
    }

    /**
     * <pre>
     * POST /fulfillment/{code}/history — semantics là ĐỌC, không mutate (§3.8).
     * </pre>
     */
    default void getAssignHistory(com.hubstore.fulfillment.v1.GetAssignHistoryRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.GetAssignHistoryResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getGetAssignHistoryMethod(), responseObserver);
    }

    /**
     * <pre>
     * Edit TG giao — chỉ hợp lệ khi batchStatus = 0 (validation rule 3 §3.6).
     * </pre>
     */
    default void updateDeliveryTime(com.hubstore.fulfillment.v1.UpdateDeliveryTimeRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.UpdateDeliveryTimeResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getUpdateDeliveryTimeMethod(), responseObserver);
    }

    /**
     * <pre>
     * PUT /fulfillment/{code}/note — không có FE screen (§3.8).
     * </pre>
     */
    default void updateNote(com.hubstore.fulfillment.v1.UpdateNoteRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.UpdateNoteResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getUpdateNoteMethod(), responseObserver);
    }

    /**
     * <pre>
     * GET /master-data/regions — D6 hierarchical.
     * </pre>
     */
    default void listRegions(com.hubstore.fulfillment.v1.ListRegionsRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.ListRegionsResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getListRegionsMethod(), responseObserver);
    }

    /**
     * <pre>
     * GET /master-data/delivery-staff — DeliveryStaffSelect (D1b).
     * </pre>
     */
    default void listDeliveryStaff(com.hubstore.fulfillment.v1.ListDeliveryStaffRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.ListDeliveryStaffResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getListDeliveryStaffMethod(), responseObserver);
    }

    /**
     * <pre>
     * GET /master-data/shops — options filter Kho CN (D1).
     * </pre>
     */
    default void listDistinctShops(com.hubstore.fulfillment.v1.ListDistinctShopsRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.ListDistinctShopsResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getListDistinctShopsMethod(), responseObserver);
    }

    /**
     * <pre>
     * GET /order-promising/time-delivery — hint TG giao cạnh DatePicker (D4, D1b).
     * </pre>
     */
    default void getTimeDelivery(com.hubstore.fulfillment.v1.GetTimeDeliveryRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.GetTimeDeliveryResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getGetTimeDeliveryMethod(), responseObserver);
    }

    /**
     * <pre>
     * GET /fulfillment/dashboard-stats (SF-9) — aggregate 30 ngày + hôm nay.
     * </pre>
     */
    default void getDashboardStats(com.hubstore.fulfillment.v1.GetDashboardStatsRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.GetDashboardStatsResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getGetDashboardStatsMethod(), responseObserver);
    }

    /**
     * <pre>
     * SF-18: D2C/Dropship list — filter đa chiều + pagination.
     * </pre>
     */
    default void filterD2cOrders(com.hubstore.fulfillment.v1.FilterD2cOrdersRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.FilterD2cOrdersResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getFilterD2cOrdersMethod(), responseObserver);
    }

    /**
     * <pre>
     * SF-18: PUT /d2c-orders/{orderCode}/note — note khóa order_code.
     * </pre>
     */
    default void updateD2cOrderNote(com.hubstore.fulfillment.v1.UpdateD2cOrderNoteRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.UpdateD2cOrderNoteResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getUpdateD2cOrderNoteMethod(), responseObserver);
    }
  }

  /**
   * Base class for the server implementation of the service FulfillmentService.
   */
  public static abstract class FulfillmentServiceImplBase
      implements io.grpc.BindableService, AsyncService {

    @java.lang.Override public final io.grpc.ServerServiceDefinition bindService() {
      return FulfillmentServiceGrpc.bindService(this);
    }
  }

  /**
   * A stub to allow clients to do asynchronous rpc calls to service FulfillmentService.
   */
  public static final class FulfillmentServiceStub
      extends io.grpc.stub.AbstractAsyncStub<FulfillmentServiceStub> {
    private FulfillmentServiceStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected FulfillmentServiceStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new FulfillmentServiceStub(channel, callOptions);
    }

    /**
     * <pre>
     * D1 list — filter + pagination. exclude_fulfill_codes = extension pin v1.
     * </pre>
     */
    public void filterOrders(com.hubstore.fulfillment.v1.FilterOrdersRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.FilterOrdersResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getFilterOrdersMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * GET /fulfillment/{fulfillCode} — sẵn sàng cho tương lai; D1 expand KHÔNG
     * gọi (waive tường minh, spec §3.8).
     * </pre>
     */
    public void getOrderDetail(com.hubstore.fulfillment.v1.GetOrderDetailRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.GetOrderDetailResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getGetOrderDetailMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Gọi bởi batching-service (Go): tạo/hủy/hoàn-tất phiếu → đổi batchStatus.
     * </pre>
     */
    public void mutateOrderStatus(com.hubstore.fulfillment.v1.MutateOrderStatusRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.MutateOrderStatusResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getMutateOrderStatusMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Hydration — Go gọi để validate rule 1 §3.6 (P0 fix: server-side thật).
     * </pre>
     */
    public void getOrdersByCodes(com.hubstore.fulfillment.v1.GetOrdersByCodesRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.GetOrdersByCodesResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getGetOrdersByCodesMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * D1c chuyển kho.
     * </pre>
     */
    public void assignShopHub(com.hubstore.fulfillment.v1.AssignShopHubRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.AssignShopHubResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getAssignShopHubMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * POST /fulfillment/{code}/history — semantics là ĐỌC, không mutate (§3.8).
     * </pre>
     */
    public void getAssignHistory(com.hubstore.fulfillment.v1.GetAssignHistoryRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.GetAssignHistoryResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getGetAssignHistoryMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Edit TG giao — chỉ hợp lệ khi batchStatus = 0 (validation rule 3 §3.6).
     * </pre>
     */
    public void updateDeliveryTime(com.hubstore.fulfillment.v1.UpdateDeliveryTimeRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.UpdateDeliveryTimeResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getUpdateDeliveryTimeMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * PUT /fulfillment/{code}/note — không có FE screen (§3.8).
     * </pre>
     */
    public void updateNote(com.hubstore.fulfillment.v1.UpdateNoteRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.UpdateNoteResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getUpdateNoteMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * GET /master-data/regions — D6 hierarchical.
     * </pre>
     */
    public void listRegions(com.hubstore.fulfillment.v1.ListRegionsRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.ListRegionsResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getListRegionsMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * GET /master-data/delivery-staff — DeliveryStaffSelect (D1b).
     * </pre>
     */
    public void listDeliveryStaff(com.hubstore.fulfillment.v1.ListDeliveryStaffRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.ListDeliveryStaffResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getListDeliveryStaffMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * GET /master-data/shops — options filter Kho CN (D1).
     * </pre>
     */
    public void listDistinctShops(com.hubstore.fulfillment.v1.ListDistinctShopsRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.ListDistinctShopsResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getListDistinctShopsMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * GET /order-promising/time-delivery — hint TG giao cạnh DatePicker (D4, D1b).
     * </pre>
     */
    public void getTimeDelivery(com.hubstore.fulfillment.v1.GetTimeDeliveryRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.GetTimeDeliveryResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getGetTimeDeliveryMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * GET /fulfillment/dashboard-stats (SF-9) — aggregate 30 ngày + hôm nay.
     * </pre>
     */
    public void getDashboardStats(com.hubstore.fulfillment.v1.GetDashboardStatsRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.GetDashboardStatsResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getGetDashboardStatsMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * SF-18: D2C/Dropship list — filter đa chiều + pagination.
     * </pre>
     */
    public void filterD2cOrders(com.hubstore.fulfillment.v1.FilterD2cOrdersRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.FilterD2cOrdersResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getFilterD2cOrdersMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * SF-18: PUT /d2c-orders/{orderCode}/note — note khóa order_code.
     * </pre>
     */
    public void updateD2cOrderNote(com.hubstore.fulfillment.v1.UpdateD2cOrderNoteRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.UpdateD2cOrderNoteResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getUpdateD2cOrderNoteMethod(), getCallOptions()), request, responseObserver);
    }
  }

  /**
   * A stub to allow clients to do synchronous rpc calls to service FulfillmentService.
   */
  public static final class FulfillmentServiceBlockingStub
      extends io.grpc.stub.AbstractBlockingStub<FulfillmentServiceBlockingStub> {
    private FulfillmentServiceBlockingStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected FulfillmentServiceBlockingStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new FulfillmentServiceBlockingStub(channel, callOptions);
    }

    /**
     * <pre>
     * D1 list — filter + pagination. exclude_fulfill_codes = extension pin v1.
     * </pre>
     */
    public com.hubstore.fulfillment.v1.FilterOrdersResponse filterOrders(com.hubstore.fulfillment.v1.FilterOrdersRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getFilterOrdersMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * GET /fulfillment/{fulfillCode} — sẵn sàng cho tương lai; D1 expand KHÔNG
     * gọi (waive tường minh, spec §3.8).
     * </pre>
     */
    public com.hubstore.fulfillment.v1.GetOrderDetailResponse getOrderDetail(com.hubstore.fulfillment.v1.GetOrderDetailRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGetOrderDetailMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Gọi bởi batching-service (Go): tạo/hủy/hoàn-tất phiếu → đổi batchStatus.
     * </pre>
     */
    public com.hubstore.fulfillment.v1.MutateOrderStatusResponse mutateOrderStatus(com.hubstore.fulfillment.v1.MutateOrderStatusRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getMutateOrderStatusMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Hydration — Go gọi để validate rule 1 §3.6 (P0 fix: server-side thật).
     * </pre>
     */
    public com.hubstore.fulfillment.v1.GetOrdersByCodesResponse getOrdersByCodes(com.hubstore.fulfillment.v1.GetOrdersByCodesRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGetOrdersByCodesMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * D1c chuyển kho.
     * </pre>
     */
    public com.hubstore.fulfillment.v1.AssignShopHubResponse assignShopHub(com.hubstore.fulfillment.v1.AssignShopHubRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getAssignShopHubMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * POST /fulfillment/{code}/history — semantics là ĐỌC, không mutate (§3.8).
     * </pre>
     */
    public com.hubstore.fulfillment.v1.GetAssignHistoryResponse getAssignHistory(com.hubstore.fulfillment.v1.GetAssignHistoryRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGetAssignHistoryMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Edit TG giao — chỉ hợp lệ khi batchStatus = 0 (validation rule 3 §3.6).
     * </pre>
     */
    public com.hubstore.fulfillment.v1.UpdateDeliveryTimeResponse updateDeliveryTime(com.hubstore.fulfillment.v1.UpdateDeliveryTimeRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getUpdateDeliveryTimeMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * PUT /fulfillment/{code}/note — không có FE screen (§3.8).
     * </pre>
     */
    public com.hubstore.fulfillment.v1.UpdateNoteResponse updateNote(com.hubstore.fulfillment.v1.UpdateNoteRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getUpdateNoteMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * GET /master-data/regions — D6 hierarchical.
     * </pre>
     */
    public com.hubstore.fulfillment.v1.ListRegionsResponse listRegions(com.hubstore.fulfillment.v1.ListRegionsRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListRegionsMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * GET /master-data/delivery-staff — DeliveryStaffSelect (D1b).
     * </pre>
     */
    public com.hubstore.fulfillment.v1.ListDeliveryStaffResponse listDeliveryStaff(com.hubstore.fulfillment.v1.ListDeliveryStaffRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListDeliveryStaffMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * GET /master-data/shops — options filter Kho CN (D1).
     * </pre>
     */
    public com.hubstore.fulfillment.v1.ListDistinctShopsResponse listDistinctShops(com.hubstore.fulfillment.v1.ListDistinctShopsRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListDistinctShopsMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * GET /order-promising/time-delivery — hint TG giao cạnh DatePicker (D4, D1b).
     * </pre>
     */
    public com.hubstore.fulfillment.v1.GetTimeDeliveryResponse getTimeDelivery(com.hubstore.fulfillment.v1.GetTimeDeliveryRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGetTimeDeliveryMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * GET /fulfillment/dashboard-stats (SF-9) — aggregate 30 ngày + hôm nay.
     * </pre>
     */
    public com.hubstore.fulfillment.v1.GetDashboardStatsResponse getDashboardStats(com.hubstore.fulfillment.v1.GetDashboardStatsRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGetDashboardStatsMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * SF-18: D2C/Dropship list — filter đa chiều + pagination.
     * </pre>
     */
    public com.hubstore.fulfillment.v1.FilterD2cOrdersResponse filterD2cOrders(com.hubstore.fulfillment.v1.FilterD2cOrdersRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getFilterD2cOrdersMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * SF-18: PUT /d2c-orders/{orderCode}/note — note khóa order_code.
     * </pre>
     */
    public com.hubstore.fulfillment.v1.UpdateD2cOrderNoteResponse updateD2cOrderNote(com.hubstore.fulfillment.v1.UpdateD2cOrderNoteRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getUpdateD2cOrderNoteMethod(), getCallOptions(), request);
    }
  }

  /**
   * A stub to allow clients to do ListenableFuture-style rpc calls to service FulfillmentService.
   */
  public static final class FulfillmentServiceFutureStub
      extends io.grpc.stub.AbstractFutureStub<FulfillmentServiceFutureStub> {
    private FulfillmentServiceFutureStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected FulfillmentServiceFutureStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new FulfillmentServiceFutureStub(channel, callOptions);
    }

    /**
     * <pre>
     * D1 list — filter + pagination. exclude_fulfill_codes = extension pin v1.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<com.hubstore.fulfillment.v1.FilterOrdersResponse> filterOrders(
        com.hubstore.fulfillment.v1.FilterOrdersRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getFilterOrdersMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * GET /fulfillment/{fulfillCode} — sẵn sàng cho tương lai; D1 expand KHÔNG
     * gọi (waive tường minh, spec §3.8).
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<com.hubstore.fulfillment.v1.GetOrderDetailResponse> getOrderDetail(
        com.hubstore.fulfillment.v1.GetOrderDetailRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getGetOrderDetailMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Gọi bởi batching-service (Go): tạo/hủy/hoàn-tất phiếu → đổi batchStatus.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<com.hubstore.fulfillment.v1.MutateOrderStatusResponse> mutateOrderStatus(
        com.hubstore.fulfillment.v1.MutateOrderStatusRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getMutateOrderStatusMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Hydration — Go gọi để validate rule 1 §3.6 (P0 fix: server-side thật).
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<com.hubstore.fulfillment.v1.GetOrdersByCodesResponse> getOrdersByCodes(
        com.hubstore.fulfillment.v1.GetOrdersByCodesRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getGetOrdersByCodesMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * D1c chuyển kho.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<com.hubstore.fulfillment.v1.AssignShopHubResponse> assignShopHub(
        com.hubstore.fulfillment.v1.AssignShopHubRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getAssignShopHubMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * POST /fulfillment/{code}/history — semantics là ĐỌC, không mutate (§3.8).
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<com.hubstore.fulfillment.v1.GetAssignHistoryResponse> getAssignHistory(
        com.hubstore.fulfillment.v1.GetAssignHistoryRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getGetAssignHistoryMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Edit TG giao — chỉ hợp lệ khi batchStatus = 0 (validation rule 3 §3.6).
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<com.hubstore.fulfillment.v1.UpdateDeliveryTimeResponse> updateDeliveryTime(
        com.hubstore.fulfillment.v1.UpdateDeliveryTimeRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getUpdateDeliveryTimeMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * PUT /fulfillment/{code}/note — không có FE screen (§3.8).
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<com.hubstore.fulfillment.v1.UpdateNoteResponse> updateNote(
        com.hubstore.fulfillment.v1.UpdateNoteRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getUpdateNoteMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * GET /master-data/regions — D6 hierarchical.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<com.hubstore.fulfillment.v1.ListRegionsResponse> listRegions(
        com.hubstore.fulfillment.v1.ListRegionsRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getListRegionsMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * GET /master-data/delivery-staff — DeliveryStaffSelect (D1b).
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<com.hubstore.fulfillment.v1.ListDeliveryStaffResponse> listDeliveryStaff(
        com.hubstore.fulfillment.v1.ListDeliveryStaffRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getListDeliveryStaffMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * GET /master-data/shops — options filter Kho CN (D1).
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<com.hubstore.fulfillment.v1.ListDistinctShopsResponse> listDistinctShops(
        com.hubstore.fulfillment.v1.ListDistinctShopsRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getListDistinctShopsMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * GET /order-promising/time-delivery — hint TG giao cạnh DatePicker (D4, D1b).
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<com.hubstore.fulfillment.v1.GetTimeDeliveryResponse> getTimeDelivery(
        com.hubstore.fulfillment.v1.GetTimeDeliveryRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getGetTimeDeliveryMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * GET /fulfillment/dashboard-stats (SF-9) — aggregate 30 ngày + hôm nay.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<com.hubstore.fulfillment.v1.GetDashboardStatsResponse> getDashboardStats(
        com.hubstore.fulfillment.v1.GetDashboardStatsRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getGetDashboardStatsMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * SF-18: D2C/Dropship list — filter đa chiều + pagination.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<com.hubstore.fulfillment.v1.FilterD2cOrdersResponse> filterD2cOrders(
        com.hubstore.fulfillment.v1.FilterD2cOrdersRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getFilterD2cOrdersMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * SF-18: PUT /d2c-orders/{orderCode}/note — note khóa order_code.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<com.hubstore.fulfillment.v1.UpdateD2cOrderNoteResponse> updateD2cOrderNote(
        com.hubstore.fulfillment.v1.UpdateD2cOrderNoteRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getUpdateD2cOrderNoteMethod(), getCallOptions()), request);
    }
  }

  private static final int METHODID_FILTER_ORDERS = 0;
  private static final int METHODID_GET_ORDER_DETAIL = 1;
  private static final int METHODID_MUTATE_ORDER_STATUS = 2;
  private static final int METHODID_GET_ORDERS_BY_CODES = 3;
  private static final int METHODID_ASSIGN_SHOP_HUB = 4;
  private static final int METHODID_GET_ASSIGN_HISTORY = 5;
  private static final int METHODID_UPDATE_DELIVERY_TIME = 6;
  private static final int METHODID_UPDATE_NOTE = 7;
  private static final int METHODID_LIST_REGIONS = 8;
  private static final int METHODID_LIST_DELIVERY_STAFF = 9;
  private static final int METHODID_LIST_DISTINCT_SHOPS = 10;
  private static final int METHODID_GET_TIME_DELIVERY = 11;
  private static final int METHODID_GET_DASHBOARD_STATS = 12;
  private static final int METHODID_FILTER_D2C_ORDERS = 13;
  private static final int METHODID_UPDATE_D2C_ORDER_NOTE = 14;

  private static final class MethodHandlers<Req, Resp> implements
      io.grpc.stub.ServerCalls.UnaryMethod<Req, Resp>,
      io.grpc.stub.ServerCalls.ServerStreamingMethod<Req, Resp>,
      io.grpc.stub.ServerCalls.ClientStreamingMethod<Req, Resp>,
      io.grpc.stub.ServerCalls.BidiStreamingMethod<Req, Resp> {
    private final AsyncService serviceImpl;
    private final int methodId;

    MethodHandlers(AsyncService serviceImpl, int methodId) {
      this.serviceImpl = serviceImpl;
      this.methodId = methodId;
    }

    @java.lang.Override
    @java.lang.SuppressWarnings("unchecked")
    public void invoke(Req request, io.grpc.stub.StreamObserver<Resp> responseObserver) {
      switch (methodId) {
        case METHODID_FILTER_ORDERS:
          serviceImpl.filterOrders((com.hubstore.fulfillment.v1.FilterOrdersRequest) request,
              (io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.FilterOrdersResponse>) responseObserver);
          break;
        case METHODID_GET_ORDER_DETAIL:
          serviceImpl.getOrderDetail((com.hubstore.fulfillment.v1.GetOrderDetailRequest) request,
              (io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.GetOrderDetailResponse>) responseObserver);
          break;
        case METHODID_MUTATE_ORDER_STATUS:
          serviceImpl.mutateOrderStatus((com.hubstore.fulfillment.v1.MutateOrderStatusRequest) request,
              (io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.MutateOrderStatusResponse>) responseObserver);
          break;
        case METHODID_GET_ORDERS_BY_CODES:
          serviceImpl.getOrdersByCodes((com.hubstore.fulfillment.v1.GetOrdersByCodesRequest) request,
              (io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.GetOrdersByCodesResponse>) responseObserver);
          break;
        case METHODID_ASSIGN_SHOP_HUB:
          serviceImpl.assignShopHub((com.hubstore.fulfillment.v1.AssignShopHubRequest) request,
              (io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.AssignShopHubResponse>) responseObserver);
          break;
        case METHODID_GET_ASSIGN_HISTORY:
          serviceImpl.getAssignHistory((com.hubstore.fulfillment.v1.GetAssignHistoryRequest) request,
              (io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.GetAssignHistoryResponse>) responseObserver);
          break;
        case METHODID_UPDATE_DELIVERY_TIME:
          serviceImpl.updateDeliveryTime((com.hubstore.fulfillment.v1.UpdateDeliveryTimeRequest) request,
              (io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.UpdateDeliveryTimeResponse>) responseObserver);
          break;
        case METHODID_UPDATE_NOTE:
          serviceImpl.updateNote((com.hubstore.fulfillment.v1.UpdateNoteRequest) request,
              (io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.UpdateNoteResponse>) responseObserver);
          break;
        case METHODID_LIST_REGIONS:
          serviceImpl.listRegions((com.hubstore.fulfillment.v1.ListRegionsRequest) request,
              (io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.ListRegionsResponse>) responseObserver);
          break;
        case METHODID_LIST_DELIVERY_STAFF:
          serviceImpl.listDeliveryStaff((com.hubstore.fulfillment.v1.ListDeliveryStaffRequest) request,
              (io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.ListDeliveryStaffResponse>) responseObserver);
          break;
        case METHODID_LIST_DISTINCT_SHOPS:
          serviceImpl.listDistinctShops((com.hubstore.fulfillment.v1.ListDistinctShopsRequest) request,
              (io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.ListDistinctShopsResponse>) responseObserver);
          break;
        case METHODID_GET_TIME_DELIVERY:
          serviceImpl.getTimeDelivery((com.hubstore.fulfillment.v1.GetTimeDeliveryRequest) request,
              (io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.GetTimeDeliveryResponse>) responseObserver);
          break;
        case METHODID_GET_DASHBOARD_STATS:
          serviceImpl.getDashboardStats((com.hubstore.fulfillment.v1.GetDashboardStatsRequest) request,
              (io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.GetDashboardStatsResponse>) responseObserver);
          break;
        case METHODID_FILTER_D2C_ORDERS:
          serviceImpl.filterD2cOrders((com.hubstore.fulfillment.v1.FilterD2cOrdersRequest) request,
              (io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.FilterD2cOrdersResponse>) responseObserver);
          break;
        case METHODID_UPDATE_D2C_ORDER_NOTE:
          serviceImpl.updateD2cOrderNote((com.hubstore.fulfillment.v1.UpdateD2cOrderNoteRequest) request,
              (io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.UpdateD2cOrderNoteResponse>) responseObserver);
          break;
        default:
          throw new AssertionError();
      }
    }

    @java.lang.Override
    @java.lang.SuppressWarnings("unchecked")
    public io.grpc.stub.StreamObserver<Req> invoke(
        io.grpc.stub.StreamObserver<Resp> responseObserver) {
      switch (methodId) {
        default:
          throw new AssertionError();
      }
    }
  }

  public static final io.grpc.ServerServiceDefinition bindService(AsyncService service) {
    return io.grpc.ServerServiceDefinition.builder(getServiceDescriptor())
        .addMethod(
          getFilterOrdersMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.hubstore.fulfillment.v1.FilterOrdersRequest,
              com.hubstore.fulfillment.v1.FilterOrdersResponse>(
                service, METHODID_FILTER_ORDERS)))
        .addMethod(
          getGetOrderDetailMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.hubstore.fulfillment.v1.GetOrderDetailRequest,
              com.hubstore.fulfillment.v1.GetOrderDetailResponse>(
                service, METHODID_GET_ORDER_DETAIL)))
        .addMethod(
          getMutateOrderStatusMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.hubstore.fulfillment.v1.MutateOrderStatusRequest,
              com.hubstore.fulfillment.v1.MutateOrderStatusResponse>(
                service, METHODID_MUTATE_ORDER_STATUS)))
        .addMethod(
          getGetOrdersByCodesMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.hubstore.fulfillment.v1.GetOrdersByCodesRequest,
              com.hubstore.fulfillment.v1.GetOrdersByCodesResponse>(
                service, METHODID_GET_ORDERS_BY_CODES)))
        .addMethod(
          getAssignShopHubMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.hubstore.fulfillment.v1.AssignShopHubRequest,
              com.hubstore.fulfillment.v1.AssignShopHubResponse>(
                service, METHODID_ASSIGN_SHOP_HUB)))
        .addMethod(
          getGetAssignHistoryMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.hubstore.fulfillment.v1.GetAssignHistoryRequest,
              com.hubstore.fulfillment.v1.GetAssignHistoryResponse>(
                service, METHODID_GET_ASSIGN_HISTORY)))
        .addMethod(
          getUpdateDeliveryTimeMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.hubstore.fulfillment.v1.UpdateDeliveryTimeRequest,
              com.hubstore.fulfillment.v1.UpdateDeliveryTimeResponse>(
                service, METHODID_UPDATE_DELIVERY_TIME)))
        .addMethod(
          getUpdateNoteMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.hubstore.fulfillment.v1.UpdateNoteRequest,
              com.hubstore.fulfillment.v1.UpdateNoteResponse>(
                service, METHODID_UPDATE_NOTE)))
        .addMethod(
          getListRegionsMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.hubstore.fulfillment.v1.ListRegionsRequest,
              com.hubstore.fulfillment.v1.ListRegionsResponse>(
                service, METHODID_LIST_REGIONS)))
        .addMethod(
          getListDeliveryStaffMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.hubstore.fulfillment.v1.ListDeliveryStaffRequest,
              com.hubstore.fulfillment.v1.ListDeliveryStaffResponse>(
                service, METHODID_LIST_DELIVERY_STAFF)))
        .addMethod(
          getListDistinctShopsMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.hubstore.fulfillment.v1.ListDistinctShopsRequest,
              com.hubstore.fulfillment.v1.ListDistinctShopsResponse>(
                service, METHODID_LIST_DISTINCT_SHOPS)))
        .addMethod(
          getGetTimeDeliveryMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.hubstore.fulfillment.v1.GetTimeDeliveryRequest,
              com.hubstore.fulfillment.v1.GetTimeDeliveryResponse>(
                service, METHODID_GET_TIME_DELIVERY)))
        .addMethod(
          getGetDashboardStatsMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.hubstore.fulfillment.v1.GetDashboardStatsRequest,
              com.hubstore.fulfillment.v1.GetDashboardStatsResponse>(
                service, METHODID_GET_DASHBOARD_STATS)))
        .addMethod(
          getFilterD2cOrdersMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.hubstore.fulfillment.v1.FilterD2cOrdersRequest,
              com.hubstore.fulfillment.v1.FilterD2cOrdersResponse>(
                service, METHODID_FILTER_D2C_ORDERS)))
        .addMethod(
          getUpdateD2cOrderNoteMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.hubstore.fulfillment.v1.UpdateD2cOrderNoteRequest,
              com.hubstore.fulfillment.v1.UpdateD2cOrderNoteResponse>(
                service, METHODID_UPDATE_D2C_ORDER_NOTE)))
        .build();
  }

  private static abstract class FulfillmentServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoFileDescriptorSupplier, io.grpc.protobuf.ProtoServiceDescriptorSupplier {
    FulfillmentServiceBaseDescriptorSupplier() {}

    @java.lang.Override
    public com.google.protobuf.Descriptors.FileDescriptor getFileDescriptor() {
      return com.hubstore.fulfillment.v1.Fulfillment.getDescriptor();
    }

    @java.lang.Override
    public com.google.protobuf.Descriptors.ServiceDescriptor getServiceDescriptor() {
      return getFileDescriptor().findServiceByName("FulfillmentService");
    }
  }

  private static final class FulfillmentServiceFileDescriptorSupplier
      extends FulfillmentServiceBaseDescriptorSupplier {
    FulfillmentServiceFileDescriptorSupplier() {}
  }

  private static final class FulfillmentServiceMethodDescriptorSupplier
      extends FulfillmentServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoMethodDescriptorSupplier {
    private final java.lang.String methodName;

    FulfillmentServiceMethodDescriptorSupplier(java.lang.String methodName) {
      this.methodName = methodName;
    }

    @java.lang.Override
    public com.google.protobuf.Descriptors.MethodDescriptor getMethodDescriptor() {
      return getServiceDescriptor().findMethodByName(methodName);
    }
  }

  private static volatile io.grpc.ServiceDescriptor serviceDescriptor;

  public static io.grpc.ServiceDescriptor getServiceDescriptor() {
    io.grpc.ServiceDescriptor result = serviceDescriptor;
    if (result == null) {
      synchronized (FulfillmentServiceGrpc.class) {
        result = serviceDescriptor;
        if (result == null) {
          serviceDescriptor = result = io.grpc.ServiceDescriptor.newBuilder(SERVICE_NAME)
              .setSchemaDescriptor(new FulfillmentServiceFileDescriptorSupplier())
              .addMethod(getFilterOrdersMethod())
              .addMethod(getGetOrderDetailMethod())
              .addMethod(getMutateOrderStatusMethod())
              .addMethod(getGetOrdersByCodesMethod())
              .addMethod(getAssignShopHubMethod())
              .addMethod(getGetAssignHistoryMethod())
              .addMethod(getUpdateDeliveryTimeMethod())
              .addMethod(getUpdateNoteMethod())
              .addMethod(getListRegionsMethod())
              .addMethod(getListDeliveryStaffMethod())
              .addMethod(getListDistinctShopsMethod())
              .addMethod(getGetTimeDeliveryMethod())
              .addMethod(getGetDashboardStatsMethod())
              .addMethod(getFilterD2cOrdersMethod())
              .addMethod(getUpdateD2cOrderNoteMethod())
              .build();
        }
      }
    }
    return result;
  }
}
