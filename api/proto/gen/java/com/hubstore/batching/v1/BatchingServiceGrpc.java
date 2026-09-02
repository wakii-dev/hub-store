package com.hubstore.batching.v1;

import static io.grpc.MethodDescriptor.generateFullMethodName;

/**
 */
@javax.annotation.Generated(
    value = "by gRPC proto compiler (version 1.64.0)",
    comments = "Source: hubstore/batching/v1/batching.proto")
@io.grpc.stub.annotations.GrpcGenerated
public final class BatchingServiceGrpc {

  private BatchingServiceGrpc() {}

  public static final java.lang.String SERVICE_NAME = "hubstore.batching.v1.BatchingService";

  // Static method descriptors that strictly reflect the proto.
  private static volatile io.grpc.MethodDescriptor<com.hubstore.batching.v1.CreateBatchRequest,
      com.hubstore.batching.v1.CreateBatchResponse> getCreateBatchMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "CreateBatch",
      requestType = com.hubstore.batching.v1.CreateBatchRequest.class,
      responseType = com.hubstore.batching.v1.CreateBatchResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.hubstore.batching.v1.CreateBatchRequest,
      com.hubstore.batching.v1.CreateBatchResponse> getCreateBatchMethod() {
    io.grpc.MethodDescriptor<com.hubstore.batching.v1.CreateBatchRequest, com.hubstore.batching.v1.CreateBatchResponse> getCreateBatchMethod;
    if ((getCreateBatchMethod = BatchingServiceGrpc.getCreateBatchMethod) == null) {
      synchronized (BatchingServiceGrpc.class) {
        if ((getCreateBatchMethod = BatchingServiceGrpc.getCreateBatchMethod) == null) {
          BatchingServiceGrpc.getCreateBatchMethod = getCreateBatchMethod =
              io.grpc.MethodDescriptor.<com.hubstore.batching.v1.CreateBatchRequest, com.hubstore.batching.v1.CreateBatchResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "CreateBatch"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.batching.v1.CreateBatchRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.batching.v1.CreateBatchResponse.getDefaultInstance()))
              .setSchemaDescriptor(new BatchingServiceMethodDescriptorSupplier("CreateBatch"))
              .build();
        }
      }
    }
    return getCreateBatchMethod;
  }

  private static volatile io.grpc.MethodDescriptor<com.hubstore.batching.v1.FilterBatchesRequest,
      com.hubstore.batching.v1.FilterBatchesResponse> getFilterBatchesMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "FilterBatches",
      requestType = com.hubstore.batching.v1.FilterBatchesRequest.class,
      responseType = com.hubstore.batching.v1.FilterBatchesResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.hubstore.batching.v1.FilterBatchesRequest,
      com.hubstore.batching.v1.FilterBatchesResponse> getFilterBatchesMethod() {
    io.grpc.MethodDescriptor<com.hubstore.batching.v1.FilterBatchesRequest, com.hubstore.batching.v1.FilterBatchesResponse> getFilterBatchesMethod;
    if ((getFilterBatchesMethod = BatchingServiceGrpc.getFilterBatchesMethod) == null) {
      synchronized (BatchingServiceGrpc.class) {
        if ((getFilterBatchesMethod = BatchingServiceGrpc.getFilterBatchesMethod) == null) {
          BatchingServiceGrpc.getFilterBatchesMethod = getFilterBatchesMethod =
              io.grpc.MethodDescriptor.<com.hubstore.batching.v1.FilterBatchesRequest, com.hubstore.batching.v1.FilterBatchesResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "FilterBatches"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.batching.v1.FilterBatchesRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.batching.v1.FilterBatchesResponse.getDefaultInstance()))
              .setSchemaDescriptor(new BatchingServiceMethodDescriptorSupplier("FilterBatches"))
              .build();
        }
      }
    }
    return getFilterBatchesMethod;
  }

  private static volatile io.grpc.MethodDescriptor<com.hubstore.batching.v1.GetBatchDetailRequest,
      com.hubstore.batching.v1.GetBatchDetailResponse> getGetBatchDetailMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "GetBatchDetail",
      requestType = com.hubstore.batching.v1.GetBatchDetailRequest.class,
      responseType = com.hubstore.batching.v1.GetBatchDetailResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.hubstore.batching.v1.GetBatchDetailRequest,
      com.hubstore.batching.v1.GetBatchDetailResponse> getGetBatchDetailMethod() {
    io.grpc.MethodDescriptor<com.hubstore.batching.v1.GetBatchDetailRequest, com.hubstore.batching.v1.GetBatchDetailResponse> getGetBatchDetailMethod;
    if ((getGetBatchDetailMethod = BatchingServiceGrpc.getGetBatchDetailMethod) == null) {
      synchronized (BatchingServiceGrpc.class) {
        if ((getGetBatchDetailMethod = BatchingServiceGrpc.getGetBatchDetailMethod) == null) {
          BatchingServiceGrpc.getGetBatchDetailMethod = getGetBatchDetailMethod =
              io.grpc.MethodDescriptor.<com.hubstore.batching.v1.GetBatchDetailRequest, com.hubstore.batching.v1.GetBatchDetailResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "GetBatchDetail"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.batching.v1.GetBatchDetailRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.batching.v1.GetBatchDetailResponse.getDefaultInstance()))
              .setSchemaDescriptor(new BatchingServiceMethodDescriptorSupplier("GetBatchDetail"))
              .build();
        }
      }
    }
    return getGetBatchDetailMethod;
  }

  private static volatile io.grpc.MethodDescriptor<com.hubstore.batching.v1.CancelBatchRequest,
      com.hubstore.batching.v1.CancelBatchResponse> getCancelBatchMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "CancelBatch",
      requestType = com.hubstore.batching.v1.CancelBatchRequest.class,
      responseType = com.hubstore.batching.v1.CancelBatchResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.hubstore.batching.v1.CancelBatchRequest,
      com.hubstore.batching.v1.CancelBatchResponse> getCancelBatchMethod() {
    io.grpc.MethodDescriptor<com.hubstore.batching.v1.CancelBatchRequest, com.hubstore.batching.v1.CancelBatchResponse> getCancelBatchMethod;
    if ((getCancelBatchMethod = BatchingServiceGrpc.getCancelBatchMethod) == null) {
      synchronized (BatchingServiceGrpc.class) {
        if ((getCancelBatchMethod = BatchingServiceGrpc.getCancelBatchMethod) == null) {
          BatchingServiceGrpc.getCancelBatchMethod = getCancelBatchMethod =
              io.grpc.MethodDescriptor.<com.hubstore.batching.v1.CancelBatchRequest, com.hubstore.batching.v1.CancelBatchResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "CancelBatch"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.batching.v1.CancelBatchRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.batching.v1.CancelBatchResponse.getDefaultInstance()))
              .setSchemaDescriptor(new BatchingServiceMethodDescriptorSupplier("CancelBatch"))
              .build();
        }
      }
    }
    return getCancelBatchMethod;
  }

  private static volatile io.grpc.MethodDescriptor<com.hubstore.batching.v1.GetBatchCriteriaRequest,
      com.hubstore.batching.v1.GetBatchCriteriaResponse> getGetBatchCriteriaMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "GetBatchCriteria",
      requestType = com.hubstore.batching.v1.GetBatchCriteriaRequest.class,
      responseType = com.hubstore.batching.v1.GetBatchCriteriaResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.hubstore.batching.v1.GetBatchCriteriaRequest,
      com.hubstore.batching.v1.GetBatchCriteriaResponse> getGetBatchCriteriaMethod() {
    io.grpc.MethodDescriptor<com.hubstore.batching.v1.GetBatchCriteriaRequest, com.hubstore.batching.v1.GetBatchCriteriaResponse> getGetBatchCriteriaMethod;
    if ((getGetBatchCriteriaMethod = BatchingServiceGrpc.getGetBatchCriteriaMethod) == null) {
      synchronized (BatchingServiceGrpc.class) {
        if ((getGetBatchCriteriaMethod = BatchingServiceGrpc.getGetBatchCriteriaMethod) == null) {
          BatchingServiceGrpc.getGetBatchCriteriaMethod = getGetBatchCriteriaMethod =
              io.grpc.MethodDescriptor.<com.hubstore.batching.v1.GetBatchCriteriaRequest, com.hubstore.batching.v1.GetBatchCriteriaResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "GetBatchCriteria"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.batching.v1.GetBatchCriteriaRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.batching.v1.GetBatchCriteriaResponse.getDefaultInstance()))
              .setSchemaDescriptor(new BatchingServiceMethodDescriptorSupplier("GetBatchCriteria"))
              .build();
        }
      }
    }
    return getGetBatchCriteriaMethod;
  }

  private static volatile io.grpc.MethodDescriptor<com.hubstore.batching.v1.CompletePickingRequest,
      com.hubstore.batching.v1.CompletePickingResponse> getCompletePickingMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "CompletePicking",
      requestType = com.hubstore.batching.v1.CompletePickingRequest.class,
      responseType = com.hubstore.batching.v1.CompletePickingResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.hubstore.batching.v1.CompletePickingRequest,
      com.hubstore.batching.v1.CompletePickingResponse> getCompletePickingMethod() {
    io.grpc.MethodDescriptor<com.hubstore.batching.v1.CompletePickingRequest, com.hubstore.batching.v1.CompletePickingResponse> getCompletePickingMethod;
    if ((getCompletePickingMethod = BatchingServiceGrpc.getCompletePickingMethod) == null) {
      synchronized (BatchingServiceGrpc.class) {
        if ((getCompletePickingMethod = BatchingServiceGrpc.getCompletePickingMethod) == null) {
          BatchingServiceGrpc.getCompletePickingMethod = getCompletePickingMethod =
              io.grpc.MethodDescriptor.<com.hubstore.batching.v1.CompletePickingRequest, com.hubstore.batching.v1.CompletePickingResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "CompletePicking"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.batching.v1.CompletePickingRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.batching.v1.CompletePickingResponse.getDefaultInstance()))
              .setSchemaDescriptor(new BatchingServiceMethodDescriptorSupplier("CompletePicking"))
              .build();
        }
      }
    }
    return getCompletePickingMethod;
  }

  private static volatile io.grpc.MethodDescriptor<com.hubstore.batching.v1.PackingSuggestRequest,
      com.hubstore.batching.v1.PackingSuggestResponse> getPackingSuggestMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "PackingSuggest",
      requestType = com.hubstore.batching.v1.PackingSuggestRequest.class,
      responseType = com.hubstore.batching.v1.PackingSuggestResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.hubstore.batching.v1.PackingSuggestRequest,
      com.hubstore.batching.v1.PackingSuggestResponse> getPackingSuggestMethod() {
    io.grpc.MethodDescriptor<com.hubstore.batching.v1.PackingSuggestRequest, com.hubstore.batching.v1.PackingSuggestResponse> getPackingSuggestMethod;
    if ((getPackingSuggestMethod = BatchingServiceGrpc.getPackingSuggestMethod) == null) {
      synchronized (BatchingServiceGrpc.class) {
        if ((getPackingSuggestMethod = BatchingServiceGrpc.getPackingSuggestMethod) == null) {
          BatchingServiceGrpc.getPackingSuggestMethod = getPackingSuggestMethod =
              io.grpc.MethodDescriptor.<com.hubstore.batching.v1.PackingSuggestRequest, com.hubstore.batching.v1.PackingSuggestResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "PackingSuggest"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.batching.v1.PackingSuggestRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.batching.v1.PackingSuggestResponse.getDefaultInstance()))
              .setSchemaDescriptor(new BatchingServiceMethodDescriptorSupplier("PackingSuggest"))
              .build();
        }
      }
    }
    return getPackingSuggestMethod;
  }

  private static volatile io.grpc.MethodDescriptor<com.hubstore.batching.v1.RecalculateDistanceRequest,
      com.hubstore.batching.v1.RecalculateDistanceResponse> getRecalculateDistanceMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "RecalculateDistance",
      requestType = com.hubstore.batching.v1.RecalculateDistanceRequest.class,
      responseType = com.hubstore.batching.v1.RecalculateDistanceResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.hubstore.batching.v1.RecalculateDistanceRequest,
      com.hubstore.batching.v1.RecalculateDistanceResponse> getRecalculateDistanceMethod() {
    io.grpc.MethodDescriptor<com.hubstore.batching.v1.RecalculateDistanceRequest, com.hubstore.batching.v1.RecalculateDistanceResponse> getRecalculateDistanceMethod;
    if ((getRecalculateDistanceMethod = BatchingServiceGrpc.getRecalculateDistanceMethod) == null) {
      synchronized (BatchingServiceGrpc.class) {
        if ((getRecalculateDistanceMethod = BatchingServiceGrpc.getRecalculateDistanceMethod) == null) {
          BatchingServiceGrpc.getRecalculateDistanceMethod = getRecalculateDistanceMethod =
              io.grpc.MethodDescriptor.<com.hubstore.batching.v1.RecalculateDistanceRequest, com.hubstore.batching.v1.RecalculateDistanceResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "RecalculateDistance"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.batching.v1.RecalculateDistanceRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.batching.v1.RecalculateDistanceResponse.getDefaultInstance()))
              .setSchemaDescriptor(new BatchingServiceMethodDescriptorSupplier("RecalculateDistance"))
              .build();
        }
      }
    }
    return getRecalculateDistanceMethod;
  }

  /**
   * Creates a new async stub that supports all call types for the service
   */
  public static BatchingServiceStub newStub(io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<BatchingServiceStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<BatchingServiceStub>() {
        @java.lang.Override
        public BatchingServiceStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new BatchingServiceStub(channel, callOptions);
        }
      };
    return BatchingServiceStub.newStub(factory, channel);
  }

  /**
   * Creates a new blocking-style stub that supports unary and streaming output calls on the service
   */
  public static BatchingServiceBlockingStub newBlockingStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<BatchingServiceBlockingStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<BatchingServiceBlockingStub>() {
        @java.lang.Override
        public BatchingServiceBlockingStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new BatchingServiceBlockingStub(channel, callOptions);
        }
      };
    return BatchingServiceBlockingStub.newStub(factory, channel);
  }

  /**
   * Creates a new ListenableFuture-style stub that supports unary calls on the service
   */
  public static BatchingServiceFutureStub newFutureStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<BatchingServiceFutureStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<BatchingServiceFutureStub>() {
        @java.lang.Override
        public BatchingServiceFutureStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new BatchingServiceFutureStub(channel, callOptions);
        }
      };
    return BatchingServiceFutureStub.newStub(factory, channel);
  }

  /**
   */
  public interface AsyncService {

    /**
     * <pre>
     * D1b tạo phiếu: Go sinh batchCode + stopOrder, store batch, rồi gRPC→Java
     * MutateOrderStatus (đơn batchStatus NOT_PREPARED→PREPARING) — spec §3.3.
     * </pre>
     */
    default void createBatch(com.hubstore.batching.v1.CreateBatchRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.batching.v1.CreateBatchResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getCreateBatchMethod(), responseObserver);
    }

    /**
     * <pre>
     * D2 list.
     * </pre>
     */
    default void filterBatches(com.hubstore.batching.v1.FilterBatchesRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.batching.v1.FilterBatchesResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getFilterBatchesMethod(), responseObserver);
    }

    /**
     * <pre>
     * D2 detail / expand.
     * </pre>
     */
    default void getBatchDetail(com.hubstore.batching.v1.GetBatchDetailRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.batching.v1.GetBatchDetailResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getGetBatchDetailMethod(), responseObserver);
    }

    /**
     * <pre>
     * Chỉ batch ACTIVE được hủy (rule 4 §3.6); đơn revert về NOT_PREPARED qua Java.
     * </pre>
     */
    default void cancelBatch(com.hubstore.batching.v1.CancelBatchRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.batching.v1.CancelBatchResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getCancelBatchMethod(), responseObserver);
    }

    /**
     * <pre>
     * Config trạng thái cho phép hủy = [ACTIVE] (spec §3.4).
     * </pre>
     */
    default void getBatchCriteria(com.hubstore.batching.v1.GetBatchCriteriaRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.batching.v1.GetBatchCriteriaResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getGetBatchCriteriaMethod(), responseObserver);
    }

    /**
     * <pre>
     * "Hoàn tất soạn" D2: batch COMPLETED + đơn PREPARING→PREPARED qua Java (D11).
     * </pre>
     */
    default void completePicking(com.hubstore.batching.v1.CompletePickingRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.batching.v1.CompletePickingResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getCompletePickingMethod(), responseObserver);
    }

    /**
     * <pre>
     * Gợi ý nhóm đơn theo khoảng cách (D1b).
     * </pre>
     */
    default void packingSuggest(com.hubstore.batching.v1.PackingSuggestRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.batching.v1.PackingSuggestResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getPackingSuggestMethod(), responseObserver);
    }

    /**
     * <pre>
     * Tính lại km cho các đơn (D1b).
     * </pre>
     */
    default void recalculateDistance(com.hubstore.batching.v1.RecalculateDistanceRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.batching.v1.RecalculateDistanceResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getRecalculateDistanceMethod(), responseObserver);
    }
  }

  /**
   * Base class for the server implementation of the service BatchingService.
   */
  public static abstract class BatchingServiceImplBase
      implements io.grpc.BindableService, AsyncService {

    @java.lang.Override public final io.grpc.ServerServiceDefinition bindService() {
      return BatchingServiceGrpc.bindService(this);
    }
  }

  /**
   * A stub to allow clients to do asynchronous rpc calls to service BatchingService.
   */
  public static final class BatchingServiceStub
      extends io.grpc.stub.AbstractAsyncStub<BatchingServiceStub> {
    private BatchingServiceStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected BatchingServiceStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new BatchingServiceStub(channel, callOptions);
    }

    /**
     * <pre>
     * D1b tạo phiếu: Go sinh batchCode + stopOrder, store batch, rồi gRPC→Java
     * MutateOrderStatus (đơn batchStatus NOT_PREPARED→PREPARING) — spec §3.3.
     * </pre>
     */
    public void createBatch(com.hubstore.batching.v1.CreateBatchRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.batching.v1.CreateBatchResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getCreateBatchMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * D2 list.
     * </pre>
     */
    public void filterBatches(com.hubstore.batching.v1.FilterBatchesRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.batching.v1.FilterBatchesResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getFilterBatchesMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * D2 detail / expand.
     * </pre>
     */
    public void getBatchDetail(com.hubstore.batching.v1.GetBatchDetailRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.batching.v1.GetBatchDetailResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getGetBatchDetailMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Chỉ batch ACTIVE được hủy (rule 4 §3.6); đơn revert về NOT_PREPARED qua Java.
     * </pre>
     */
    public void cancelBatch(com.hubstore.batching.v1.CancelBatchRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.batching.v1.CancelBatchResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getCancelBatchMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Config trạng thái cho phép hủy = [ACTIVE] (spec §3.4).
     * </pre>
     */
    public void getBatchCriteria(com.hubstore.batching.v1.GetBatchCriteriaRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.batching.v1.GetBatchCriteriaResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getGetBatchCriteriaMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * "Hoàn tất soạn" D2: batch COMPLETED + đơn PREPARING→PREPARED qua Java (D11).
     * </pre>
     */
    public void completePicking(com.hubstore.batching.v1.CompletePickingRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.batching.v1.CompletePickingResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getCompletePickingMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Gợi ý nhóm đơn theo khoảng cách (D1b).
     * </pre>
     */
    public void packingSuggest(com.hubstore.batching.v1.PackingSuggestRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.batching.v1.PackingSuggestResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getPackingSuggestMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Tính lại km cho các đơn (D1b).
     * </pre>
     */
    public void recalculateDistance(com.hubstore.batching.v1.RecalculateDistanceRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.batching.v1.RecalculateDistanceResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getRecalculateDistanceMethod(), getCallOptions()), request, responseObserver);
    }
  }

  /**
   * A stub to allow clients to do synchronous rpc calls to service BatchingService.
   */
  public static final class BatchingServiceBlockingStub
      extends io.grpc.stub.AbstractBlockingStub<BatchingServiceBlockingStub> {
    private BatchingServiceBlockingStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected BatchingServiceBlockingStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new BatchingServiceBlockingStub(channel, callOptions);
    }

    /**
     * <pre>
     * D1b tạo phiếu: Go sinh batchCode + stopOrder, store batch, rồi gRPC→Java
     * MutateOrderStatus (đơn batchStatus NOT_PREPARED→PREPARING) — spec §3.3.
     * </pre>
     */
    public com.hubstore.batching.v1.CreateBatchResponse createBatch(com.hubstore.batching.v1.CreateBatchRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getCreateBatchMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * D2 list.
     * </pre>
     */
    public com.hubstore.batching.v1.FilterBatchesResponse filterBatches(com.hubstore.batching.v1.FilterBatchesRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getFilterBatchesMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * D2 detail / expand.
     * </pre>
     */
    public com.hubstore.batching.v1.GetBatchDetailResponse getBatchDetail(com.hubstore.batching.v1.GetBatchDetailRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGetBatchDetailMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Chỉ batch ACTIVE được hủy (rule 4 §3.6); đơn revert về NOT_PREPARED qua Java.
     * </pre>
     */
    public com.hubstore.batching.v1.CancelBatchResponse cancelBatch(com.hubstore.batching.v1.CancelBatchRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getCancelBatchMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Config trạng thái cho phép hủy = [ACTIVE] (spec §3.4).
     * </pre>
     */
    public com.hubstore.batching.v1.GetBatchCriteriaResponse getBatchCriteria(com.hubstore.batching.v1.GetBatchCriteriaRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGetBatchCriteriaMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * "Hoàn tất soạn" D2: batch COMPLETED + đơn PREPARING→PREPARED qua Java (D11).
     * </pre>
     */
    public com.hubstore.batching.v1.CompletePickingResponse completePicking(com.hubstore.batching.v1.CompletePickingRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getCompletePickingMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Gợi ý nhóm đơn theo khoảng cách (D1b).
     * </pre>
     */
    public com.hubstore.batching.v1.PackingSuggestResponse packingSuggest(com.hubstore.batching.v1.PackingSuggestRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getPackingSuggestMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Tính lại km cho các đơn (D1b).
     * </pre>
     */
    public com.hubstore.batching.v1.RecalculateDistanceResponse recalculateDistance(com.hubstore.batching.v1.RecalculateDistanceRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getRecalculateDistanceMethod(), getCallOptions(), request);
    }
  }

  /**
   * A stub to allow clients to do ListenableFuture-style rpc calls to service BatchingService.
   */
  public static final class BatchingServiceFutureStub
      extends io.grpc.stub.AbstractFutureStub<BatchingServiceFutureStub> {
    private BatchingServiceFutureStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected BatchingServiceFutureStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new BatchingServiceFutureStub(channel, callOptions);
    }

    /**
     * <pre>
     * D1b tạo phiếu: Go sinh batchCode + stopOrder, store batch, rồi gRPC→Java
     * MutateOrderStatus (đơn batchStatus NOT_PREPARED→PREPARING) — spec §3.3.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<com.hubstore.batching.v1.CreateBatchResponse> createBatch(
        com.hubstore.batching.v1.CreateBatchRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getCreateBatchMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * D2 list.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<com.hubstore.batching.v1.FilterBatchesResponse> filterBatches(
        com.hubstore.batching.v1.FilterBatchesRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getFilterBatchesMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * D2 detail / expand.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<com.hubstore.batching.v1.GetBatchDetailResponse> getBatchDetail(
        com.hubstore.batching.v1.GetBatchDetailRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getGetBatchDetailMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Chỉ batch ACTIVE được hủy (rule 4 §3.6); đơn revert về NOT_PREPARED qua Java.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<com.hubstore.batching.v1.CancelBatchResponse> cancelBatch(
        com.hubstore.batching.v1.CancelBatchRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getCancelBatchMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Config trạng thái cho phép hủy = [ACTIVE] (spec §3.4).
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<com.hubstore.batching.v1.GetBatchCriteriaResponse> getBatchCriteria(
        com.hubstore.batching.v1.GetBatchCriteriaRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getGetBatchCriteriaMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * "Hoàn tất soạn" D2: batch COMPLETED + đơn PREPARING→PREPARED qua Java (D11).
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<com.hubstore.batching.v1.CompletePickingResponse> completePicking(
        com.hubstore.batching.v1.CompletePickingRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getCompletePickingMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Gợi ý nhóm đơn theo khoảng cách (D1b).
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<com.hubstore.batching.v1.PackingSuggestResponse> packingSuggest(
        com.hubstore.batching.v1.PackingSuggestRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getPackingSuggestMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Tính lại km cho các đơn (D1b).
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<com.hubstore.batching.v1.RecalculateDistanceResponse> recalculateDistance(
        com.hubstore.batching.v1.RecalculateDistanceRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getRecalculateDistanceMethod(), getCallOptions()), request);
    }
  }

  private static final int METHODID_CREATE_BATCH = 0;
  private static final int METHODID_FILTER_BATCHES = 1;
  private static final int METHODID_GET_BATCH_DETAIL = 2;
  private static final int METHODID_CANCEL_BATCH = 3;
  private static final int METHODID_GET_BATCH_CRITERIA = 4;
  private static final int METHODID_COMPLETE_PICKING = 5;
  private static final int METHODID_PACKING_SUGGEST = 6;
  private static final int METHODID_RECALCULATE_DISTANCE = 7;

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
        case METHODID_CREATE_BATCH:
          serviceImpl.createBatch((com.hubstore.batching.v1.CreateBatchRequest) request,
              (io.grpc.stub.StreamObserver<com.hubstore.batching.v1.CreateBatchResponse>) responseObserver);
          break;
        case METHODID_FILTER_BATCHES:
          serviceImpl.filterBatches((com.hubstore.batching.v1.FilterBatchesRequest) request,
              (io.grpc.stub.StreamObserver<com.hubstore.batching.v1.FilterBatchesResponse>) responseObserver);
          break;
        case METHODID_GET_BATCH_DETAIL:
          serviceImpl.getBatchDetail((com.hubstore.batching.v1.GetBatchDetailRequest) request,
              (io.grpc.stub.StreamObserver<com.hubstore.batching.v1.GetBatchDetailResponse>) responseObserver);
          break;
        case METHODID_CANCEL_BATCH:
          serviceImpl.cancelBatch((com.hubstore.batching.v1.CancelBatchRequest) request,
              (io.grpc.stub.StreamObserver<com.hubstore.batching.v1.CancelBatchResponse>) responseObserver);
          break;
        case METHODID_GET_BATCH_CRITERIA:
          serviceImpl.getBatchCriteria((com.hubstore.batching.v1.GetBatchCriteriaRequest) request,
              (io.grpc.stub.StreamObserver<com.hubstore.batching.v1.GetBatchCriteriaResponse>) responseObserver);
          break;
        case METHODID_COMPLETE_PICKING:
          serviceImpl.completePicking((com.hubstore.batching.v1.CompletePickingRequest) request,
              (io.grpc.stub.StreamObserver<com.hubstore.batching.v1.CompletePickingResponse>) responseObserver);
          break;
        case METHODID_PACKING_SUGGEST:
          serviceImpl.packingSuggest((com.hubstore.batching.v1.PackingSuggestRequest) request,
              (io.grpc.stub.StreamObserver<com.hubstore.batching.v1.PackingSuggestResponse>) responseObserver);
          break;
        case METHODID_RECALCULATE_DISTANCE:
          serviceImpl.recalculateDistance((com.hubstore.batching.v1.RecalculateDistanceRequest) request,
              (io.grpc.stub.StreamObserver<com.hubstore.batching.v1.RecalculateDistanceResponse>) responseObserver);
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
          getCreateBatchMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.hubstore.batching.v1.CreateBatchRequest,
              com.hubstore.batching.v1.CreateBatchResponse>(
                service, METHODID_CREATE_BATCH)))
        .addMethod(
          getFilterBatchesMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.hubstore.batching.v1.FilterBatchesRequest,
              com.hubstore.batching.v1.FilterBatchesResponse>(
                service, METHODID_FILTER_BATCHES)))
        .addMethod(
          getGetBatchDetailMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.hubstore.batching.v1.GetBatchDetailRequest,
              com.hubstore.batching.v1.GetBatchDetailResponse>(
                service, METHODID_GET_BATCH_DETAIL)))
        .addMethod(
          getCancelBatchMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.hubstore.batching.v1.CancelBatchRequest,
              com.hubstore.batching.v1.CancelBatchResponse>(
                service, METHODID_CANCEL_BATCH)))
        .addMethod(
          getGetBatchCriteriaMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.hubstore.batching.v1.GetBatchCriteriaRequest,
              com.hubstore.batching.v1.GetBatchCriteriaResponse>(
                service, METHODID_GET_BATCH_CRITERIA)))
        .addMethod(
          getCompletePickingMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.hubstore.batching.v1.CompletePickingRequest,
              com.hubstore.batching.v1.CompletePickingResponse>(
                service, METHODID_COMPLETE_PICKING)))
        .addMethod(
          getPackingSuggestMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.hubstore.batching.v1.PackingSuggestRequest,
              com.hubstore.batching.v1.PackingSuggestResponse>(
                service, METHODID_PACKING_SUGGEST)))
        .addMethod(
          getRecalculateDistanceMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.hubstore.batching.v1.RecalculateDistanceRequest,
              com.hubstore.batching.v1.RecalculateDistanceResponse>(
                service, METHODID_RECALCULATE_DISTANCE)))
        .build();
  }

  private static abstract class BatchingServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoFileDescriptorSupplier, io.grpc.protobuf.ProtoServiceDescriptorSupplier {
    BatchingServiceBaseDescriptorSupplier() {}

    @java.lang.Override
    public com.google.protobuf.Descriptors.FileDescriptor getFileDescriptor() {
      return com.hubstore.batching.v1.Batching.getDescriptor();
    }

    @java.lang.Override
    public com.google.protobuf.Descriptors.ServiceDescriptor getServiceDescriptor() {
      return getFileDescriptor().findServiceByName("BatchingService");
    }
  }

  private static final class BatchingServiceFileDescriptorSupplier
      extends BatchingServiceBaseDescriptorSupplier {
    BatchingServiceFileDescriptorSupplier() {}
  }

  private static final class BatchingServiceMethodDescriptorSupplier
      extends BatchingServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoMethodDescriptorSupplier {
    private final java.lang.String methodName;

    BatchingServiceMethodDescriptorSupplier(java.lang.String methodName) {
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
      synchronized (BatchingServiceGrpc.class) {
        result = serviceDescriptor;
        if (result == null) {
          serviceDescriptor = result = io.grpc.ServiceDescriptor.newBuilder(SERVICE_NAME)
              .setSchemaDescriptor(new BatchingServiceFileDescriptorSupplier())
              .addMethod(getCreateBatchMethod())
              .addMethod(getFilterBatchesMethod())
              .addMethod(getGetBatchDetailMethod())
              .addMethod(getCancelBatchMethod())
              .addMethod(getGetBatchCriteriaMethod())
              .addMethod(getCompletePickingMethod())
              .addMethod(getPackingSuggestMethod())
              .addMethod(getRecalculateDistanceMethod())
              .build();
        }
      }
    }
    return result;
  }
}
