package com.hubstore.fulfillment.v1;

import static io.grpc.MethodDescriptor.generateFullMethodName;

/**
 */
@javax.annotation.Generated(
    value = "by gRPC proto compiler (version 1.64.0)",
    comments = "Source: hubstore/fulfillment/v1/tech_service.proto")
@io.grpc.stub.annotations.GrpcGenerated
public final class TechServiceGrpc {

  private TechServiceGrpc() {}

  public static final java.lang.String SERVICE_NAME = "hubstore.fulfillment.v1.TechService";

  // Static method descriptors that strictly reflect the proto.
  private static volatile io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.FilterDeliveryOrdersRequest,
      com.hubstore.fulfillment.v1.FilterDeliveryOrdersResponse> getFilterDeliveryOrdersMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "FilterDeliveryOrders",
      requestType = com.hubstore.fulfillment.v1.FilterDeliveryOrdersRequest.class,
      responseType = com.hubstore.fulfillment.v1.FilterDeliveryOrdersResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.FilterDeliveryOrdersRequest,
      com.hubstore.fulfillment.v1.FilterDeliveryOrdersResponse> getFilterDeliveryOrdersMethod() {
    io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.FilterDeliveryOrdersRequest, com.hubstore.fulfillment.v1.FilterDeliveryOrdersResponse> getFilterDeliveryOrdersMethod;
    if ((getFilterDeliveryOrdersMethod = TechServiceGrpc.getFilterDeliveryOrdersMethod) == null) {
      synchronized (TechServiceGrpc.class) {
        if ((getFilterDeliveryOrdersMethod = TechServiceGrpc.getFilterDeliveryOrdersMethod) == null) {
          TechServiceGrpc.getFilterDeliveryOrdersMethod = getFilterDeliveryOrdersMethod =
              io.grpc.MethodDescriptor.<com.hubstore.fulfillment.v1.FilterDeliveryOrdersRequest, com.hubstore.fulfillment.v1.FilterDeliveryOrdersResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "FilterDeliveryOrders"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.fulfillment.v1.FilterDeliveryOrdersRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.fulfillment.v1.FilterDeliveryOrdersResponse.getDefaultInstance()))
              .setSchemaDescriptor(new TechServiceMethodDescriptorSupplier("FilterDeliveryOrders"))
              .build();
        }
      }
    }
    return getFilterDeliveryOrdersMethod;
  }

  private static volatile io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.FilterInstallationOrdersRequest,
      com.hubstore.fulfillment.v1.FilterInstallationOrdersResponse> getFilterInstallationOrdersMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "FilterInstallationOrders",
      requestType = com.hubstore.fulfillment.v1.FilterInstallationOrdersRequest.class,
      responseType = com.hubstore.fulfillment.v1.FilterInstallationOrdersResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.FilterInstallationOrdersRequest,
      com.hubstore.fulfillment.v1.FilterInstallationOrdersResponse> getFilterInstallationOrdersMethod() {
    io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.FilterInstallationOrdersRequest, com.hubstore.fulfillment.v1.FilterInstallationOrdersResponse> getFilterInstallationOrdersMethod;
    if ((getFilterInstallationOrdersMethod = TechServiceGrpc.getFilterInstallationOrdersMethod) == null) {
      synchronized (TechServiceGrpc.class) {
        if ((getFilterInstallationOrdersMethod = TechServiceGrpc.getFilterInstallationOrdersMethod) == null) {
          TechServiceGrpc.getFilterInstallationOrdersMethod = getFilterInstallationOrdersMethod =
              io.grpc.MethodDescriptor.<com.hubstore.fulfillment.v1.FilterInstallationOrdersRequest, com.hubstore.fulfillment.v1.FilterInstallationOrdersResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "FilterInstallationOrders"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.fulfillment.v1.FilterInstallationOrdersRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.fulfillment.v1.FilterInstallationOrdersResponse.getDefaultInstance()))
              .setSchemaDescriptor(new TechServiceMethodDescriptorSupplier("FilterInstallationOrders"))
              .build();
        }
      }
    }
    return getFilterInstallationOrdersMethod;
  }

  private static volatile io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.AssignTechnicianRequest,
      com.hubstore.fulfillment.v1.AssignTechnicianResponse> getAssignTechnicianMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "AssignTechnician",
      requestType = com.hubstore.fulfillment.v1.AssignTechnicianRequest.class,
      responseType = com.hubstore.fulfillment.v1.AssignTechnicianResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.AssignTechnicianRequest,
      com.hubstore.fulfillment.v1.AssignTechnicianResponse> getAssignTechnicianMethod() {
    io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.AssignTechnicianRequest, com.hubstore.fulfillment.v1.AssignTechnicianResponse> getAssignTechnicianMethod;
    if ((getAssignTechnicianMethod = TechServiceGrpc.getAssignTechnicianMethod) == null) {
      synchronized (TechServiceGrpc.class) {
        if ((getAssignTechnicianMethod = TechServiceGrpc.getAssignTechnicianMethod) == null) {
          TechServiceGrpc.getAssignTechnicianMethod = getAssignTechnicianMethod =
              io.grpc.MethodDescriptor.<com.hubstore.fulfillment.v1.AssignTechnicianRequest, com.hubstore.fulfillment.v1.AssignTechnicianResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "AssignTechnician"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.fulfillment.v1.AssignTechnicianRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.fulfillment.v1.AssignTechnicianResponse.getDefaultInstance()))
              .setSchemaDescriptor(new TechServiceMethodDescriptorSupplier("AssignTechnician"))
              .build();
        }
      }
    }
    return getAssignTechnicianMethod;
  }

  private static volatile io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.SuggestTechniciansRequest,
      com.hubstore.fulfillment.v1.SuggestTechniciansResponse> getSuggestTechniciansMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "SuggestTechnicians",
      requestType = com.hubstore.fulfillment.v1.SuggestTechniciansRequest.class,
      responseType = com.hubstore.fulfillment.v1.SuggestTechniciansResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.SuggestTechniciansRequest,
      com.hubstore.fulfillment.v1.SuggestTechniciansResponse> getSuggestTechniciansMethod() {
    io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.SuggestTechniciansRequest, com.hubstore.fulfillment.v1.SuggestTechniciansResponse> getSuggestTechniciansMethod;
    if ((getSuggestTechniciansMethod = TechServiceGrpc.getSuggestTechniciansMethod) == null) {
      synchronized (TechServiceGrpc.class) {
        if ((getSuggestTechniciansMethod = TechServiceGrpc.getSuggestTechniciansMethod) == null) {
          TechServiceGrpc.getSuggestTechniciansMethod = getSuggestTechniciansMethod =
              io.grpc.MethodDescriptor.<com.hubstore.fulfillment.v1.SuggestTechniciansRequest, com.hubstore.fulfillment.v1.SuggestTechniciansResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "SuggestTechnicians"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.fulfillment.v1.SuggestTechniciansRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.fulfillment.v1.SuggestTechniciansResponse.getDefaultInstance()))
              .setSchemaDescriptor(new TechServiceMethodDescriptorSupplier("SuggestTechnicians"))
              .build();
        }
      }
    }
    return getSuggestTechniciansMethod;
  }

  private static volatile io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.AcceptOrderRequest,
      com.hubstore.fulfillment.v1.MutateTechOrderResponse> getAcceptOrderMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "AcceptOrder",
      requestType = com.hubstore.fulfillment.v1.AcceptOrderRequest.class,
      responseType = com.hubstore.fulfillment.v1.MutateTechOrderResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.AcceptOrderRequest,
      com.hubstore.fulfillment.v1.MutateTechOrderResponse> getAcceptOrderMethod() {
    io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.AcceptOrderRequest, com.hubstore.fulfillment.v1.MutateTechOrderResponse> getAcceptOrderMethod;
    if ((getAcceptOrderMethod = TechServiceGrpc.getAcceptOrderMethod) == null) {
      synchronized (TechServiceGrpc.class) {
        if ((getAcceptOrderMethod = TechServiceGrpc.getAcceptOrderMethod) == null) {
          TechServiceGrpc.getAcceptOrderMethod = getAcceptOrderMethod =
              io.grpc.MethodDescriptor.<com.hubstore.fulfillment.v1.AcceptOrderRequest, com.hubstore.fulfillment.v1.MutateTechOrderResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "AcceptOrder"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.fulfillment.v1.AcceptOrderRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.fulfillment.v1.MutateTechOrderResponse.getDefaultInstance()))
              .setSchemaDescriptor(new TechServiceMethodDescriptorSupplier("AcceptOrder"))
              .build();
        }
      }
    }
    return getAcceptOrderMethod;
  }

  private static volatile io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.CompleteOrderRequest,
      com.hubstore.fulfillment.v1.MutateTechOrderResponse> getCompleteOrderMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "CompleteOrder",
      requestType = com.hubstore.fulfillment.v1.CompleteOrderRequest.class,
      responseType = com.hubstore.fulfillment.v1.MutateTechOrderResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.CompleteOrderRequest,
      com.hubstore.fulfillment.v1.MutateTechOrderResponse> getCompleteOrderMethod() {
    io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.CompleteOrderRequest, com.hubstore.fulfillment.v1.MutateTechOrderResponse> getCompleteOrderMethod;
    if ((getCompleteOrderMethod = TechServiceGrpc.getCompleteOrderMethod) == null) {
      synchronized (TechServiceGrpc.class) {
        if ((getCompleteOrderMethod = TechServiceGrpc.getCompleteOrderMethod) == null) {
          TechServiceGrpc.getCompleteOrderMethod = getCompleteOrderMethod =
              io.grpc.MethodDescriptor.<com.hubstore.fulfillment.v1.CompleteOrderRequest, com.hubstore.fulfillment.v1.MutateTechOrderResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "CompleteOrder"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.fulfillment.v1.CompleteOrderRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.fulfillment.v1.MutateTechOrderResponse.getDefaultInstance()))
              .setSchemaDescriptor(new TechServiceMethodDescriptorSupplier("CompleteOrder"))
              .build();
        }
      }
    }
    return getCompleteOrderMethod;
  }

  private static volatile io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.RescheduleOrderRequest,
      com.hubstore.fulfillment.v1.MutateTechOrderResponse> getRescheduleOrderMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "RescheduleOrder",
      requestType = com.hubstore.fulfillment.v1.RescheduleOrderRequest.class,
      responseType = com.hubstore.fulfillment.v1.MutateTechOrderResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.RescheduleOrderRequest,
      com.hubstore.fulfillment.v1.MutateTechOrderResponse> getRescheduleOrderMethod() {
    io.grpc.MethodDescriptor<com.hubstore.fulfillment.v1.RescheduleOrderRequest, com.hubstore.fulfillment.v1.MutateTechOrderResponse> getRescheduleOrderMethod;
    if ((getRescheduleOrderMethod = TechServiceGrpc.getRescheduleOrderMethod) == null) {
      synchronized (TechServiceGrpc.class) {
        if ((getRescheduleOrderMethod = TechServiceGrpc.getRescheduleOrderMethod) == null) {
          TechServiceGrpc.getRescheduleOrderMethod = getRescheduleOrderMethod =
              io.grpc.MethodDescriptor.<com.hubstore.fulfillment.v1.RescheduleOrderRequest, com.hubstore.fulfillment.v1.MutateTechOrderResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "RescheduleOrder"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.fulfillment.v1.RescheduleOrderRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.fulfillment.v1.MutateTechOrderResponse.getDefaultInstance()))
              .setSchemaDescriptor(new TechServiceMethodDescriptorSupplier("RescheduleOrder"))
              .build();
        }
      }
    }
    return getRescheduleOrderMethod;
  }

  /**
   * Creates a new async stub that supports all call types for the service
   */
  public static TechServiceStub newStub(io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<TechServiceStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<TechServiceStub>() {
        @java.lang.Override
        public TechServiceStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new TechServiceStub(channel, callOptions);
        }
      };
    return TechServiceStub.newStub(factory, channel);
  }

  /**
   * Creates a new blocking-style stub that supports unary and streaming output calls on the service
   */
  public static TechServiceBlockingStub newBlockingStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<TechServiceBlockingStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<TechServiceBlockingStub>() {
        @java.lang.Override
        public TechServiceBlockingStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new TechServiceBlockingStub(channel, callOptions);
        }
      };
    return TechServiceBlockingStub.newStub(factory, channel);
  }

  /**
   * Creates a new ListenableFuture-style stub that supports unary calls on the service
   */
  public static TechServiceFutureStub newFutureStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<TechServiceFutureStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<TechServiceFutureStub>() {
        @java.lang.Override
        public TechServiceFutureStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new TechServiceFutureStub(channel, callOptions);
        }
      };
    return TechServiceFutureStub.newStub(factory, channel);
  }

  /**
   */
  public interface AsyncService {

    /**
     */
    default void filterDeliveryOrders(com.hubstore.fulfillment.v1.FilterDeliveryOrdersRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.FilterDeliveryOrdersResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getFilterDeliveryOrdersMethod(), responseObserver);
    }

    /**
     */
    default void filterInstallationOrders(com.hubstore.fulfillment.v1.FilterInstallationOrdersRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.FilterInstallationOrdersResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getFilterInstallationOrdersMethod(), responseObserver);
    }

    /**
     */
    default void assignTechnician(com.hubstore.fulfillment.v1.AssignTechnicianRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.AssignTechnicianResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getAssignTechnicianMethod(), responseObserver);
    }

    /**
     */
    default void suggestTechnicians(com.hubstore.fulfillment.v1.SuggestTechniciansRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.SuggestTechniciansResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getSuggestTechniciansMethod(), responseObserver);
    }

    /**
     * <pre>
     * SF-25 — accept/complete/reschedule KTV mobile (spec §4.2)
     * </pre>
     */
    default void acceptOrder(com.hubstore.fulfillment.v1.AcceptOrderRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.MutateTechOrderResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getAcceptOrderMethod(), responseObserver);
    }

    /**
     */
    default void completeOrder(com.hubstore.fulfillment.v1.CompleteOrderRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.MutateTechOrderResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getCompleteOrderMethod(), responseObserver);
    }

    /**
     */
    default void rescheduleOrder(com.hubstore.fulfillment.v1.RescheduleOrderRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.MutateTechOrderResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getRescheduleOrderMethod(), responseObserver);
    }
  }

  /**
   * Base class for the server implementation of the service TechService.
   */
  public static abstract class TechServiceImplBase
      implements io.grpc.BindableService, AsyncService {

    @java.lang.Override public final io.grpc.ServerServiceDefinition bindService() {
      return TechServiceGrpc.bindService(this);
    }
  }

  /**
   * A stub to allow clients to do asynchronous rpc calls to service TechService.
   */
  public static final class TechServiceStub
      extends io.grpc.stub.AbstractAsyncStub<TechServiceStub> {
    private TechServiceStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected TechServiceStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new TechServiceStub(channel, callOptions);
    }

    /**
     */
    public void filterDeliveryOrders(com.hubstore.fulfillment.v1.FilterDeliveryOrdersRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.FilterDeliveryOrdersResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getFilterDeliveryOrdersMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void filterInstallationOrders(com.hubstore.fulfillment.v1.FilterInstallationOrdersRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.FilterInstallationOrdersResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getFilterInstallationOrdersMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void assignTechnician(com.hubstore.fulfillment.v1.AssignTechnicianRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.AssignTechnicianResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getAssignTechnicianMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void suggestTechnicians(com.hubstore.fulfillment.v1.SuggestTechniciansRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.SuggestTechniciansResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getSuggestTechniciansMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * SF-25 — accept/complete/reschedule KTV mobile (spec §4.2)
     * </pre>
     */
    public void acceptOrder(com.hubstore.fulfillment.v1.AcceptOrderRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.MutateTechOrderResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getAcceptOrderMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void completeOrder(com.hubstore.fulfillment.v1.CompleteOrderRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.MutateTechOrderResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getCompleteOrderMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void rescheduleOrder(com.hubstore.fulfillment.v1.RescheduleOrderRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.MutateTechOrderResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getRescheduleOrderMethod(), getCallOptions()), request, responseObserver);
    }
  }

  /**
   * A stub to allow clients to do synchronous rpc calls to service TechService.
   */
  public static final class TechServiceBlockingStub
      extends io.grpc.stub.AbstractBlockingStub<TechServiceBlockingStub> {
    private TechServiceBlockingStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected TechServiceBlockingStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new TechServiceBlockingStub(channel, callOptions);
    }

    /**
     */
    public com.hubstore.fulfillment.v1.FilterDeliveryOrdersResponse filterDeliveryOrders(com.hubstore.fulfillment.v1.FilterDeliveryOrdersRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getFilterDeliveryOrdersMethod(), getCallOptions(), request);
    }

    /**
     */
    public com.hubstore.fulfillment.v1.FilterInstallationOrdersResponse filterInstallationOrders(com.hubstore.fulfillment.v1.FilterInstallationOrdersRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getFilterInstallationOrdersMethod(), getCallOptions(), request);
    }

    /**
     */
    public com.hubstore.fulfillment.v1.AssignTechnicianResponse assignTechnician(com.hubstore.fulfillment.v1.AssignTechnicianRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getAssignTechnicianMethod(), getCallOptions(), request);
    }

    /**
     */
    public com.hubstore.fulfillment.v1.SuggestTechniciansResponse suggestTechnicians(com.hubstore.fulfillment.v1.SuggestTechniciansRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getSuggestTechniciansMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * SF-25 — accept/complete/reschedule KTV mobile (spec §4.2)
     * </pre>
     */
    public com.hubstore.fulfillment.v1.MutateTechOrderResponse acceptOrder(com.hubstore.fulfillment.v1.AcceptOrderRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getAcceptOrderMethod(), getCallOptions(), request);
    }

    /**
     */
    public com.hubstore.fulfillment.v1.MutateTechOrderResponse completeOrder(com.hubstore.fulfillment.v1.CompleteOrderRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getCompleteOrderMethod(), getCallOptions(), request);
    }

    /**
     */
    public com.hubstore.fulfillment.v1.MutateTechOrderResponse rescheduleOrder(com.hubstore.fulfillment.v1.RescheduleOrderRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getRescheduleOrderMethod(), getCallOptions(), request);
    }
  }

  /**
   * A stub to allow clients to do ListenableFuture-style rpc calls to service TechService.
   */
  public static final class TechServiceFutureStub
      extends io.grpc.stub.AbstractFutureStub<TechServiceFutureStub> {
    private TechServiceFutureStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected TechServiceFutureStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new TechServiceFutureStub(channel, callOptions);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<com.hubstore.fulfillment.v1.FilterDeliveryOrdersResponse> filterDeliveryOrders(
        com.hubstore.fulfillment.v1.FilterDeliveryOrdersRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getFilterDeliveryOrdersMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<com.hubstore.fulfillment.v1.FilterInstallationOrdersResponse> filterInstallationOrders(
        com.hubstore.fulfillment.v1.FilterInstallationOrdersRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getFilterInstallationOrdersMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<com.hubstore.fulfillment.v1.AssignTechnicianResponse> assignTechnician(
        com.hubstore.fulfillment.v1.AssignTechnicianRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getAssignTechnicianMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<com.hubstore.fulfillment.v1.SuggestTechniciansResponse> suggestTechnicians(
        com.hubstore.fulfillment.v1.SuggestTechniciansRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getSuggestTechniciansMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * SF-25 — accept/complete/reschedule KTV mobile (spec §4.2)
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<com.hubstore.fulfillment.v1.MutateTechOrderResponse> acceptOrder(
        com.hubstore.fulfillment.v1.AcceptOrderRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getAcceptOrderMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<com.hubstore.fulfillment.v1.MutateTechOrderResponse> completeOrder(
        com.hubstore.fulfillment.v1.CompleteOrderRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getCompleteOrderMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<com.hubstore.fulfillment.v1.MutateTechOrderResponse> rescheduleOrder(
        com.hubstore.fulfillment.v1.RescheduleOrderRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getRescheduleOrderMethod(), getCallOptions()), request);
    }
  }

  private static final int METHODID_FILTER_DELIVERY_ORDERS = 0;
  private static final int METHODID_FILTER_INSTALLATION_ORDERS = 1;
  private static final int METHODID_ASSIGN_TECHNICIAN = 2;
  private static final int METHODID_SUGGEST_TECHNICIANS = 3;
  private static final int METHODID_ACCEPT_ORDER = 4;
  private static final int METHODID_COMPLETE_ORDER = 5;
  private static final int METHODID_RESCHEDULE_ORDER = 6;

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
        case METHODID_FILTER_DELIVERY_ORDERS:
          serviceImpl.filterDeliveryOrders((com.hubstore.fulfillment.v1.FilterDeliveryOrdersRequest) request,
              (io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.FilterDeliveryOrdersResponse>) responseObserver);
          break;
        case METHODID_FILTER_INSTALLATION_ORDERS:
          serviceImpl.filterInstallationOrders((com.hubstore.fulfillment.v1.FilterInstallationOrdersRequest) request,
              (io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.FilterInstallationOrdersResponse>) responseObserver);
          break;
        case METHODID_ASSIGN_TECHNICIAN:
          serviceImpl.assignTechnician((com.hubstore.fulfillment.v1.AssignTechnicianRequest) request,
              (io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.AssignTechnicianResponse>) responseObserver);
          break;
        case METHODID_SUGGEST_TECHNICIANS:
          serviceImpl.suggestTechnicians((com.hubstore.fulfillment.v1.SuggestTechniciansRequest) request,
              (io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.SuggestTechniciansResponse>) responseObserver);
          break;
        case METHODID_ACCEPT_ORDER:
          serviceImpl.acceptOrder((com.hubstore.fulfillment.v1.AcceptOrderRequest) request,
              (io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.MutateTechOrderResponse>) responseObserver);
          break;
        case METHODID_COMPLETE_ORDER:
          serviceImpl.completeOrder((com.hubstore.fulfillment.v1.CompleteOrderRequest) request,
              (io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.MutateTechOrderResponse>) responseObserver);
          break;
        case METHODID_RESCHEDULE_ORDER:
          serviceImpl.rescheduleOrder((com.hubstore.fulfillment.v1.RescheduleOrderRequest) request,
              (io.grpc.stub.StreamObserver<com.hubstore.fulfillment.v1.MutateTechOrderResponse>) responseObserver);
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
          getFilterDeliveryOrdersMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.hubstore.fulfillment.v1.FilterDeliveryOrdersRequest,
              com.hubstore.fulfillment.v1.FilterDeliveryOrdersResponse>(
                service, METHODID_FILTER_DELIVERY_ORDERS)))
        .addMethod(
          getFilterInstallationOrdersMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.hubstore.fulfillment.v1.FilterInstallationOrdersRequest,
              com.hubstore.fulfillment.v1.FilterInstallationOrdersResponse>(
                service, METHODID_FILTER_INSTALLATION_ORDERS)))
        .addMethod(
          getAssignTechnicianMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.hubstore.fulfillment.v1.AssignTechnicianRequest,
              com.hubstore.fulfillment.v1.AssignTechnicianResponse>(
                service, METHODID_ASSIGN_TECHNICIAN)))
        .addMethod(
          getSuggestTechniciansMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.hubstore.fulfillment.v1.SuggestTechniciansRequest,
              com.hubstore.fulfillment.v1.SuggestTechniciansResponse>(
                service, METHODID_SUGGEST_TECHNICIANS)))
        .addMethod(
          getAcceptOrderMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.hubstore.fulfillment.v1.AcceptOrderRequest,
              com.hubstore.fulfillment.v1.MutateTechOrderResponse>(
                service, METHODID_ACCEPT_ORDER)))
        .addMethod(
          getCompleteOrderMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.hubstore.fulfillment.v1.CompleteOrderRequest,
              com.hubstore.fulfillment.v1.MutateTechOrderResponse>(
                service, METHODID_COMPLETE_ORDER)))
        .addMethod(
          getRescheduleOrderMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.hubstore.fulfillment.v1.RescheduleOrderRequest,
              com.hubstore.fulfillment.v1.MutateTechOrderResponse>(
                service, METHODID_RESCHEDULE_ORDER)))
        .build();
  }

  private static abstract class TechServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoFileDescriptorSupplier, io.grpc.protobuf.ProtoServiceDescriptorSupplier {
    TechServiceBaseDescriptorSupplier() {}

    @java.lang.Override
    public com.google.protobuf.Descriptors.FileDescriptor getFileDescriptor() {
      return com.hubstore.fulfillment.v1.TechServiceOuterClass.getDescriptor();
    }

    @java.lang.Override
    public com.google.protobuf.Descriptors.ServiceDescriptor getServiceDescriptor() {
      return getFileDescriptor().findServiceByName("TechService");
    }
  }

  private static final class TechServiceFileDescriptorSupplier
      extends TechServiceBaseDescriptorSupplier {
    TechServiceFileDescriptorSupplier() {}
  }

  private static final class TechServiceMethodDescriptorSupplier
      extends TechServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoMethodDescriptorSupplier {
    private final java.lang.String methodName;

    TechServiceMethodDescriptorSupplier(java.lang.String methodName) {
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
      synchronized (TechServiceGrpc.class) {
        result = serviceDescriptor;
        if (result == null) {
          serviceDescriptor = result = io.grpc.ServiceDescriptor.newBuilder(SERVICE_NAME)
              .setSchemaDescriptor(new TechServiceFileDescriptorSupplier())
              .addMethod(getFilterDeliveryOrdersMethod())
              .addMethod(getFilterInstallationOrdersMethod())
              .addMethod(getAssignTechnicianMethod())
              .addMethod(getSuggestTechniciansMethod())
              .addMethod(getAcceptOrderMethod())
              .addMethod(getCompleteOrderMethod())
              .addMethod(getRescheduleOrderMethod())
              .build();
        }
      }
    }
    return result;
  }
}
