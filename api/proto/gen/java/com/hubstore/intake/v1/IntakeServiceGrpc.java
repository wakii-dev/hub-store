package com.hubstore.intake.v1;

import static io.grpc.MethodDescriptor.generateFullMethodName;

/**
 * <pre>
 * IntakeService — SF-13 (Java fulfillment-service :50051, CÙNG DB orders).
 * </pre>
 */
@javax.annotation.Generated(
    value = "by gRPC proto compiler (version 1.64.0)",
    comments = "Source: hubstore/intake/v1/intake.proto")
@io.grpc.stub.annotations.GrpcGenerated
public final class IntakeServiceGrpc {

  private IntakeServiceGrpc() {}

  public static final java.lang.String SERVICE_NAME = "hubstore.intake.v1.IntakeService";

  // Static method descriptors that strictly reflect the proto.
  private static volatile io.grpc.MethodDescriptor<com.hubstore.intake.v1.ValidateImportOrdersRequest,
      com.hubstore.intake.v1.ValidateImportOrdersResponse> getValidateImportOrdersMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ValidateImportOrders",
      requestType = com.hubstore.intake.v1.ValidateImportOrdersRequest.class,
      responseType = com.hubstore.intake.v1.ValidateImportOrdersResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.hubstore.intake.v1.ValidateImportOrdersRequest,
      com.hubstore.intake.v1.ValidateImportOrdersResponse> getValidateImportOrdersMethod() {
    io.grpc.MethodDescriptor<com.hubstore.intake.v1.ValidateImportOrdersRequest, com.hubstore.intake.v1.ValidateImportOrdersResponse> getValidateImportOrdersMethod;
    if ((getValidateImportOrdersMethod = IntakeServiceGrpc.getValidateImportOrdersMethod) == null) {
      synchronized (IntakeServiceGrpc.class) {
        if ((getValidateImportOrdersMethod = IntakeServiceGrpc.getValidateImportOrdersMethod) == null) {
          IntakeServiceGrpc.getValidateImportOrdersMethod = getValidateImportOrdersMethod =
              io.grpc.MethodDescriptor.<com.hubstore.intake.v1.ValidateImportOrdersRequest, com.hubstore.intake.v1.ValidateImportOrdersResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ValidateImportOrders"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.intake.v1.ValidateImportOrdersRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.intake.v1.ValidateImportOrdersResponse.getDefaultInstance()))
              .setSchemaDescriptor(new IntakeServiceMethodDescriptorSupplier("ValidateImportOrders"))
              .build();
        }
      }
    }
    return getValidateImportOrdersMethod;
  }

  private static volatile io.grpc.MethodDescriptor<com.hubstore.intake.v1.ConfirmImportOrdersRequest,
      com.hubstore.intake.v1.ConfirmImportOrdersResponse> getConfirmImportOrdersMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ConfirmImportOrders",
      requestType = com.hubstore.intake.v1.ConfirmImportOrdersRequest.class,
      responseType = com.hubstore.intake.v1.ConfirmImportOrdersResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.hubstore.intake.v1.ConfirmImportOrdersRequest,
      com.hubstore.intake.v1.ConfirmImportOrdersResponse> getConfirmImportOrdersMethod() {
    io.grpc.MethodDescriptor<com.hubstore.intake.v1.ConfirmImportOrdersRequest, com.hubstore.intake.v1.ConfirmImportOrdersResponse> getConfirmImportOrdersMethod;
    if ((getConfirmImportOrdersMethod = IntakeServiceGrpc.getConfirmImportOrdersMethod) == null) {
      synchronized (IntakeServiceGrpc.class) {
        if ((getConfirmImportOrdersMethod = IntakeServiceGrpc.getConfirmImportOrdersMethod) == null) {
          IntakeServiceGrpc.getConfirmImportOrdersMethod = getConfirmImportOrdersMethod =
              io.grpc.MethodDescriptor.<com.hubstore.intake.v1.ConfirmImportOrdersRequest, com.hubstore.intake.v1.ConfirmImportOrdersResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ConfirmImportOrders"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.intake.v1.ConfirmImportOrdersRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.intake.v1.ConfirmImportOrdersResponse.getDefaultInstance()))
              .setSchemaDescriptor(new IntakeServiceMethodDescriptorSupplier("ConfirmImportOrders"))
              .build();
        }
      }
    }
    return getConfirmImportOrdersMethod;
  }

  private static volatile io.grpc.MethodDescriptor<com.hubstore.intake.v1.CreateManualOrderRequest,
      com.hubstore.intake.v1.CreateManualOrderResponse> getCreateManualOrderMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "CreateManualOrder",
      requestType = com.hubstore.intake.v1.CreateManualOrderRequest.class,
      responseType = com.hubstore.intake.v1.CreateManualOrderResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.hubstore.intake.v1.CreateManualOrderRequest,
      com.hubstore.intake.v1.CreateManualOrderResponse> getCreateManualOrderMethod() {
    io.grpc.MethodDescriptor<com.hubstore.intake.v1.CreateManualOrderRequest, com.hubstore.intake.v1.CreateManualOrderResponse> getCreateManualOrderMethod;
    if ((getCreateManualOrderMethod = IntakeServiceGrpc.getCreateManualOrderMethod) == null) {
      synchronized (IntakeServiceGrpc.class) {
        if ((getCreateManualOrderMethod = IntakeServiceGrpc.getCreateManualOrderMethod) == null) {
          IntakeServiceGrpc.getCreateManualOrderMethod = getCreateManualOrderMethod =
              io.grpc.MethodDescriptor.<com.hubstore.intake.v1.CreateManualOrderRequest, com.hubstore.intake.v1.CreateManualOrderResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "CreateManualOrder"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.intake.v1.CreateManualOrderRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.intake.v1.CreateManualOrderResponse.getDefaultInstance()))
              .setSchemaDescriptor(new IntakeServiceMethodDescriptorSupplier("CreateManualOrder"))
              .build();
        }
      }
    }
    return getCreateManualOrderMethod;
  }

  private static volatile io.grpc.MethodDescriptor<com.hubstore.intake.v1.MarkOrderFailedRequest,
      com.hubstore.intake.v1.MarkOrderFailedResponse> getMarkOrderFailedMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "MarkOrderFailed",
      requestType = com.hubstore.intake.v1.MarkOrderFailedRequest.class,
      responseType = com.hubstore.intake.v1.MarkOrderFailedResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.hubstore.intake.v1.MarkOrderFailedRequest,
      com.hubstore.intake.v1.MarkOrderFailedResponse> getMarkOrderFailedMethod() {
    io.grpc.MethodDescriptor<com.hubstore.intake.v1.MarkOrderFailedRequest, com.hubstore.intake.v1.MarkOrderFailedResponse> getMarkOrderFailedMethod;
    if ((getMarkOrderFailedMethod = IntakeServiceGrpc.getMarkOrderFailedMethod) == null) {
      synchronized (IntakeServiceGrpc.class) {
        if ((getMarkOrderFailedMethod = IntakeServiceGrpc.getMarkOrderFailedMethod) == null) {
          IntakeServiceGrpc.getMarkOrderFailedMethod = getMarkOrderFailedMethod =
              io.grpc.MethodDescriptor.<com.hubstore.intake.v1.MarkOrderFailedRequest, com.hubstore.intake.v1.MarkOrderFailedResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "MarkOrderFailed"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.intake.v1.MarkOrderFailedRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.intake.v1.MarkOrderFailedResponse.getDefaultInstance()))
              .setSchemaDescriptor(new IntakeServiceMethodDescriptorSupplier("MarkOrderFailed"))
              .build();
        }
      }
    }
    return getMarkOrderFailedMethod;
  }

  private static volatile io.grpc.MethodDescriptor<com.hubstore.intake.v1.RedeliverOrderRequest,
      com.hubstore.intake.v1.RedeliverOrderResponse> getRedeliverOrderMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "RedeliverOrder",
      requestType = com.hubstore.intake.v1.RedeliverOrderRequest.class,
      responseType = com.hubstore.intake.v1.RedeliverOrderResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.hubstore.intake.v1.RedeliverOrderRequest,
      com.hubstore.intake.v1.RedeliverOrderResponse> getRedeliverOrderMethod() {
    io.grpc.MethodDescriptor<com.hubstore.intake.v1.RedeliverOrderRequest, com.hubstore.intake.v1.RedeliverOrderResponse> getRedeliverOrderMethod;
    if ((getRedeliverOrderMethod = IntakeServiceGrpc.getRedeliverOrderMethod) == null) {
      synchronized (IntakeServiceGrpc.class) {
        if ((getRedeliverOrderMethod = IntakeServiceGrpc.getRedeliverOrderMethod) == null) {
          IntakeServiceGrpc.getRedeliverOrderMethod = getRedeliverOrderMethod =
              io.grpc.MethodDescriptor.<com.hubstore.intake.v1.RedeliverOrderRequest, com.hubstore.intake.v1.RedeliverOrderResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "RedeliverOrder"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.intake.v1.RedeliverOrderRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.intake.v1.RedeliverOrderResponse.getDefaultInstance()))
              .setSchemaDescriptor(new IntakeServiceMethodDescriptorSupplier("RedeliverOrder"))
              .build();
        }
      }
    }
    return getRedeliverOrderMethod;
  }

  private static volatile io.grpc.MethodDescriptor<com.hubstore.intake.v1.GetOrderAuditRequest,
      com.hubstore.intake.v1.GetOrderAuditResponse> getGetOrderAuditMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "GetOrderAudit",
      requestType = com.hubstore.intake.v1.GetOrderAuditRequest.class,
      responseType = com.hubstore.intake.v1.GetOrderAuditResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.hubstore.intake.v1.GetOrderAuditRequest,
      com.hubstore.intake.v1.GetOrderAuditResponse> getGetOrderAuditMethod() {
    io.grpc.MethodDescriptor<com.hubstore.intake.v1.GetOrderAuditRequest, com.hubstore.intake.v1.GetOrderAuditResponse> getGetOrderAuditMethod;
    if ((getGetOrderAuditMethod = IntakeServiceGrpc.getGetOrderAuditMethod) == null) {
      synchronized (IntakeServiceGrpc.class) {
        if ((getGetOrderAuditMethod = IntakeServiceGrpc.getGetOrderAuditMethod) == null) {
          IntakeServiceGrpc.getGetOrderAuditMethod = getGetOrderAuditMethod =
              io.grpc.MethodDescriptor.<com.hubstore.intake.v1.GetOrderAuditRequest, com.hubstore.intake.v1.GetOrderAuditResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "GetOrderAudit"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.intake.v1.GetOrderAuditRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.intake.v1.GetOrderAuditResponse.getDefaultInstance()))
              .setSchemaDescriptor(new IntakeServiceMethodDescriptorSupplier("GetOrderAudit"))
              .build();
        }
      }
    }
    return getGetOrderAuditMethod;
  }

  private static volatile io.grpc.MethodDescriptor<com.hubstore.intake.v1.CreateWebhookOrderRequest,
      com.hubstore.intake.v1.CreateWebhookOrderResponse> getCreateWebhookOrderMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "CreateWebhookOrder",
      requestType = com.hubstore.intake.v1.CreateWebhookOrderRequest.class,
      responseType = com.hubstore.intake.v1.CreateWebhookOrderResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.hubstore.intake.v1.CreateWebhookOrderRequest,
      com.hubstore.intake.v1.CreateWebhookOrderResponse> getCreateWebhookOrderMethod() {
    io.grpc.MethodDescriptor<com.hubstore.intake.v1.CreateWebhookOrderRequest, com.hubstore.intake.v1.CreateWebhookOrderResponse> getCreateWebhookOrderMethod;
    if ((getCreateWebhookOrderMethod = IntakeServiceGrpc.getCreateWebhookOrderMethod) == null) {
      synchronized (IntakeServiceGrpc.class) {
        if ((getCreateWebhookOrderMethod = IntakeServiceGrpc.getCreateWebhookOrderMethod) == null) {
          IntakeServiceGrpc.getCreateWebhookOrderMethod = getCreateWebhookOrderMethod =
              io.grpc.MethodDescriptor.<com.hubstore.intake.v1.CreateWebhookOrderRequest, com.hubstore.intake.v1.CreateWebhookOrderResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "CreateWebhookOrder"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.intake.v1.CreateWebhookOrderRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.intake.v1.CreateWebhookOrderResponse.getDefaultInstance()))
              .setSchemaDescriptor(new IntakeServiceMethodDescriptorSupplier("CreateWebhookOrder"))
              .build();
        }
      }
    }
    return getCreateWebhookOrderMethod;
  }

  /**
   * Creates a new async stub that supports all call types for the service
   */
  public static IntakeServiceStub newStub(io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<IntakeServiceStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<IntakeServiceStub>() {
        @java.lang.Override
        public IntakeServiceStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new IntakeServiceStub(channel, callOptions);
        }
      };
    return IntakeServiceStub.newStub(factory, channel);
  }

  /**
   * Creates a new blocking-style stub that supports unary and streaming output calls on the service
   */
  public static IntakeServiceBlockingStub newBlockingStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<IntakeServiceBlockingStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<IntakeServiceBlockingStub>() {
        @java.lang.Override
        public IntakeServiceBlockingStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new IntakeServiceBlockingStub(channel, callOptions);
        }
      };
    return IntakeServiceBlockingStub.newStub(factory, channel);
  }

  /**
   * Creates a new ListenableFuture-style stub that supports unary calls on the service
   */
  public static IntakeServiceFutureStub newFutureStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<IntakeServiceFutureStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<IntakeServiceFutureStub>() {
        @java.lang.Override
        public IntakeServiceFutureStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new IntakeServiceFutureStub(channel, callOptions);
        }
      };
    return IntakeServiceFutureStub.newStub(factory, channel);
  }

  /**
   * <pre>
   * IntakeService — SF-13 (Java fulfillment-service :50051, CÙNG DB orders).
   * </pre>
   */
  public interface AsyncService {

    /**
     */
    default void validateImportOrders(com.hubstore.intake.v1.ValidateImportOrdersRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.intake.v1.ValidateImportOrdersResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getValidateImportOrdersMethod(), responseObserver);
    }

    /**
     */
    default void confirmImportOrders(com.hubstore.intake.v1.ConfirmImportOrdersRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.intake.v1.ConfirmImportOrdersResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getConfirmImportOrdersMethod(), responseObserver);
    }

    /**
     */
    default void createManualOrder(com.hubstore.intake.v1.CreateManualOrderRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.intake.v1.CreateManualOrderResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getCreateManualOrderMethod(), responseObserver);
    }

    /**
     */
    default void markOrderFailed(com.hubstore.intake.v1.MarkOrderFailedRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.intake.v1.MarkOrderFailedResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getMarkOrderFailedMethod(), responseObserver);
    }

    /**
     */
    default void redeliverOrder(com.hubstore.intake.v1.RedeliverOrderRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.intake.v1.RedeliverOrderResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getRedeliverOrderMethod(), responseObserver);
    }

    /**
     */
    default void getOrderAudit(com.hubstore.intake.v1.GetOrderAuditRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.intake.v1.GetOrderAuditResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getGetOrderAuditMethod(), responseObserver);
    }

    /**
     * <pre>
     * SF-26 — webhook nhận đơn từ sàn (FI-271). Additive-only.
     * </pre>
     */
    default void createWebhookOrder(com.hubstore.intake.v1.CreateWebhookOrderRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.intake.v1.CreateWebhookOrderResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getCreateWebhookOrderMethod(), responseObserver);
    }
  }

  /**
   * Base class for the server implementation of the service IntakeService.
   * <pre>
   * IntakeService — SF-13 (Java fulfillment-service :50051, CÙNG DB orders).
   * </pre>
   */
  public static abstract class IntakeServiceImplBase
      implements io.grpc.BindableService, AsyncService {

    @java.lang.Override public final io.grpc.ServerServiceDefinition bindService() {
      return IntakeServiceGrpc.bindService(this);
    }
  }

  /**
   * A stub to allow clients to do asynchronous rpc calls to service IntakeService.
   * <pre>
   * IntakeService — SF-13 (Java fulfillment-service :50051, CÙNG DB orders).
   * </pre>
   */
  public static final class IntakeServiceStub
      extends io.grpc.stub.AbstractAsyncStub<IntakeServiceStub> {
    private IntakeServiceStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected IntakeServiceStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new IntakeServiceStub(channel, callOptions);
    }

    /**
     */
    public void validateImportOrders(com.hubstore.intake.v1.ValidateImportOrdersRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.intake.v1.ValidateImportOrdersResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getValidateImportOrdersMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void confirmImportOrders(com.hubstore.intake.v1.ConfirmImportOrdersRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.intake.v1.ConfirmImportOrdersResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getConfirmImportOrdersMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void createManualOrder(com.hubstore.intake.v1.CreateManualOrderRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.intake.v1.CreateManualOrderResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getCreateManualOrderMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void markOrderFailed(com.hubstore.intake.v1.MarkOrderFailedRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.intake.v1.MarkOrderFailedResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getMarkOrderFailedMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void redeliverOrder(com.hubstore.intake.v1.RedeliverOrderRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.intake.v1.RedeliverOrderResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getRedeliverOrderMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void getOrderAudit(com.hubstore.intake.v1.GetOrderAuditRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.intake.v1.GetOrderAuditResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getGetOrderAuditMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * SF-26 — webhook nhận đơn từ sàn (FI-271). Additive-only.
     * </pre>
     */
    public void createWebhookOrder(com.hubstore.intake.v1.CreateWebhookOrderRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.intake.v1.CreateWebhookOrderResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getCreateWebhookOrderMethod(), getCallOptions()), request, responseObserver);
    }
  }

  /**
   * A stub to allow clients to do synchronous rpc calls to service IntakeService.
   * <pre>
   * IntakeService — SF-13 (Java fulfillment-service :50051, CÙNG DB orders).
   * </pre>
   */
  public static final class IntakeServiceBlockingStub
      extends io.grpc.stub.AbstractBlockingStub<IntakeServiceBlockingStub> {
    private IntakeServiceBlockingStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected IntakeServiceBlockingStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new IntakeServiceBlockingStub(channel, callOptions);
    }

    /**
     */
    public com.hubstore.intake.v1.ValidateImportOrdersResponse validateImportOrders(com.hubstore.intake.v1.ValidateImportOrdersRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getValidateImportOrdersMethod(), getCallOptions(), request);
    }

    /**
     */
    public com.hubstore.intake.v1.ConfirmImportOrdersResponse confirmImportOrders(com.hubstore.intake.v1.ConfirmImportOrdersRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getConfirmImportOrdersMethod(), getCallOptions(), request);
    }

    /**
     */
    public com.hubstore.intake.v1.CreateManualOrderResponse createManualOrder(com.hubstore.intake.v1.CreateManualOrderRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getCreateManualOrderMethod(), getCallOptions(), request);
    }

    /**
     */
    public com.hubstore.intake.v1.MarkOrderFailedResponse markOrderFailed(com.hubstore.intake.v1.MarkOrderFailedRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getMarkOrderFailedMethod(), getCallOptions(), request);
    }

    /**
     */
    public com.hubstore.intake.v1.RedeliverOrderResponse redeliverOrder(com.hubstore.intake.v1.RedeliverOrderRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getRedeliverOrderMethod(), getCallOptions(), request);
    }

    /**
     */
    public com.hubstore.intake.v1.GetOrderAuditResponse getOrderAudit(com.hubstore.intake.v1.GetOrderAuditRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGetOrderAuditMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * SF-26 — webhook nhận đơn từ sàn (FI-271). Additive-only.
     * </pre>
     */
    public com.hubstore.intake.v1.CreateWebhookOrderResponse createWebhookOrder(com.hubstore.intake.v1.CreateWebhookOrderRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getCreateWebhookOrderMethod(), getCallOptions(), request);
    }
  }

  /**
   * A stub to allow clients to do ListenableFuture-style rpc calls to service IntakeService.
   * <pre>
   * IntakeService — SF-13 (Java fulfillment-service :50051, CÙNG DB orders).
   * </pre>
   */
  public static final class IntakeServiceFutureStub
      extends io.grpc.stub.AbstractFutureStub<IntakeServiceFutureStub> {
    private IntakeServiceFutureStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected IntakeServiceFutureStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new IntakeServiceFutureStub(channel, callOptions);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<com.hubstore.intake.v1.ValidateImportOrdersResponse> validateImportOrders(
        com.hubstore.intake.v1.ValidateImportOrdersRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getValidateImportOrdersMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<com.hubstore.intake.v1.ConfirmImportOrdersResponse> confirmImportOrders(
        com.hubstore.intake.v1.ConfirmImportOrdersRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getConfirmImportOrdersMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<com.hubstore.intake.v1.CreateManualOrderResponse> createManualOrder(
        com.hubstore.intake.v1.CreateManualOrderRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getCreateManualOrderMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<com.hubstore.intake.v1.MarkOrderFailedResponse> markOrderFailed(
        com.hubstore.intake.v1.MarkOrderFailedRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getMarkOrderFailedMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<com.hubstore.intake.v1.RedeliverOrderResponse> redeliverOrder(
        com.hubstore.intake.v1.RedeliverOrderRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getRedeliverOrderMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<com.hubstore.intake.v1.GetOrderAuditResponse> getOrderAudit(
        com.hubstore.intake.v1.GetOrderAuditRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getGetOrderAuditMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * SF-26 — webhook nhận đơn từ sàn (FI-271). Additive-only.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<com.hubstore.intake.v1.CreateWebhookOrderResponse> createWebhookOrder(
        com.hubstore.intake.v1.CreateWebhookOrderRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getCreateWebhookOrderMethod(), getCallOptions()), request);
    }
  }

  private static final int METHODID_VALIDATE_IMPORT_ORDERS = 0;
  private static final int METHODID_CONFIRM_IMPORT_ORDERS = 1;
  private static final int METHODID_CREATE_MANUAL_ORDER = 2;
  private static final int METHODID_MARK_ORDER_FAILED = 3;
  private static final int METHODID_REDELIVER_ORDER = 4;
  private static final int METHODID_GET_ORDER_AUDIT = 5;
  private static final int METHODID_CREATE_WEBHOOK_ORDER = 6;

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
        case METHODID_VALIDATE_IMPORT_ORDERS:
          serviceImpl.validateImportOrders((com.hubstore.intake.v1.ValidateImportOrdersRequest) request,
              (io.grpc.stub.StreamObserver<com.hubstore.intake.v1.ValidateImportOrdersResponse>) responseObserver);
          break;
        case METHODID_CONFIRM_IMPORT_ORDERS:
          serviceImpl.confirmImportOrders((com.hubstore.intake.v1.ConfirmImportOrdersRequest) request,
              (io.grpc.stub.StreamObserver<com.hubstore.intake.v1.ConfirmImportOrdersResponse>) responseObserver);
          break;
        case METHODID_CREATE_MANUAL_ORDER:
          serviceImpl.createManualOrder((com.hubstore.intake.v1.CreateManualOrderRequest) request,
              (io.grpc.stub.StreamObserver<com.hubstore.intake.v1.CreateManualOrderResponse>) responseObserver);
          break;
        case METHODID_MARK_ORDER_FAILED:
          serviceImpl.markOrderFailed((com.hubstore.intake.v1.MarkOrderFailedRequest) request,
              (io.grpc.stub.StreamObserver<com.hubstore.intake.v1.MarkOrderFailedResponse>) responseObserver);
          break;
        case METHODID_REDELIVER_ORDER:
          serviceImpl.redeliverOrder((com.hubstore.intake.v1.RedeliverOrderRequest) request,
              (io.grpc.stub.StreamObserver<com.hubstore.intake.v1.RedeliverOrderResponse>) responseObserver);
          break;
        case METHODID_GET_ORDER_AUDIT:
          serviceImpl.getOrderAudit((com.hubstore.intake.v1.GetOrderAuditRequest) request,
              (io.grpc.stub.StreamObserver<com.hubstore.intake.v1.GetOrderAuditResponse>) responseObserver);
          break;
        case METHODID_CREATE_WEBHOOK_ORDER:
          serviceImpl.createWebhookOrder((com.hubstore.intake.v1.CreateWebhookOrderRequest) request,
              (io.grpc.stub.StreamObserver<com.hubstore.intake.v1.CreateWebhookOrderResponse>) responseObserver);
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
          getValidateImportOrdersMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.hubstore.intake.v1.ValidateImportOrdersRequest,
              com.hubstore.intake.v1.ValidateImportOrdersResponse>(
                service, METHODID_VALIDATE_IMPORT_ORDERS)))
        .addMethod(
          getConfirmImportOrdersMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.hubstore.intake.v1.ConfirmImportOrdersRequest,
              com.hubstore.intake.v1.ConfirmImportOrdersResponse>(
                service, METHODID_CONFIRM_IMPORT_ORDERS)))
        .addMethod(
          getCreateManualOrderMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.hubstore.intake.v1.CreateManualOrderRequest,
              com.hubstore.intake.v1.CreateManualOrderResponse>(
                service, METHODID_CREATE_MANUAL_ORDER)))
        .addMethod(
          getMarkOrderFailedMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.hubstore.intake.v1.MarkOrderFailedRequest,
              com.hubstore.intake.v1.MarkOrderFailedResponse>(
                service, METHODID_MARK_ORDER_FAILED)))
        .addMethod(
          getRedeliverOrderMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.hubstore.intake.v1.RedeliverOrderRequest,
              com.hubstore.intake.v1.RedeliverOrderResponse>(
                service, METHODID_REDELIVER_ORDER)))
        .addMethod(
          getGetOrderAuditMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.hubstore.intake.v1.GetOrderAuditRequest,
              com.hubstore.intake.v1.GetOrderAuditResponse>(
                service, METHODID_GET_ORDER_AUDIT)))
        .addMethod(
          getCreateWebhookOrderMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.hubstore.intake.v1.CreateWebhookOrderRequest,
              com.hubstore.intake.v1.CreateWebhookOrderResponse>(
                service, METHODID_CREATE_WEBHOOK_ORDER)))
        .build();
  }

  private static abstract class IntakeServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoFileDescriptorSupplier, io.grpc.protobuf.ProtoServiceDescriptorSupplier {
    IntakeServiceBaseDescriptorSupplier() {}

    @java.lang.Override
    public com.google.protobuf.Descriptors.FileDescriptor getFileDescriptor() {
      return com.hubstore.intake.v1.Intake.getDescriptor();
    }

    @java.lang.Override
    public com.google.protobuf.Descriptors.ServiceDescriptor getServiceDescriptor() {
      return getFileDescriptor().findServiceByName("IntakeService");
    }
  }

  private static final class IntakeServiceFileDescriptorSupplier
      extends IntakeServiceBaseDescriptorSupplier {
    IntakeServiceFileDescriptorSupplier() {}
  }

  private static final class IntakeServiceMethodDescriptorSupplier
      extends IntakeServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoMethodDescriptorSupplier {
    private final java.lang.String methodName;

    IntakeServiceMethodDescriptorSupplier(java.lang.String methodName) {
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
      synchronized (IntakeServiceGrpc.class) {
        result = serviceDescriptor;
        if (result == null) {
          serviceDescriptor = result = io.grpc.ServiceDescriptor.newBuilder(SERVICE_NAME)
              .setSchemaDescriptor(new IntakeServiceFileDescriptorSupplier())
              .addMethod(getValidateImportOrdersMethod())
              .addMethod(getConfirmImportOrdersMethod())
              .addMethod(getCreateManualOrderMethod())
              .addMethod(getMarkOrderFailedMethod())
              .addMethod(getRedeliverOrderMethod())
              .addMethod(getGetOrderAuditMethod())
              .addMethod(getCreateWebhookOrderMethod())
              .build();
        }
      }
    }
    return result;
  }
}
