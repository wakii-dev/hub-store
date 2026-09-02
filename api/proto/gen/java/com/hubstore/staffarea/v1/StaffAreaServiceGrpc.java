package com.hubstore.staffarea.v1;

import static io.grpc.MethodDescriptor.generateFullMethodName;

/**
 */
@javax.annotation.Generated(
    value = "by gRPC proto compiler (version 1.64.0)",
    comments = "Source: hubstore/staffarea/v1/staffarea.proto")
@io.grpc.stub.annotations.GrpcGenerated
public final class StaffAreaServiceGrpc {

  private StaffAreaServiceGrpc() {}

  public static final java.lang.String SERVICE_NAME = "hubstore.staffarea.v1.StaffAreaService";

  // Static method descriptors that strictly reflect the proto.
  private static volatile io.grpc.MethodDescriptor<com.hubstore.staffarea.v1.ListServiceEmployeesRequest,
      com.hubstore.staffarea.v1.ListServiceEmployeesResponse> getListServiceEmployeesMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ListServiceEmployees",
      requestType = com.hubstore.staffarea.v1.ListServiceEmployeesRequest.class,
      responseType = com.hubstore.staffarea.v1.ListServiceEmployeesResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.hubstore.staffarea.v1.ListServiceEmployeesRequest,
      com.hubstore.staffarea.v1.ListServiceEmployeesResponse> getListServiceEmployeesMethod() {
    io.grpc.MethodDescriptor<com.hubstore.staffarea.v1.ListServiceEmployeesRequest, com.hubstore.staffarea.v1.ListServiceEmployeesResponse> getListServiceEmployeesMethod;
    if ((getListServiceEmployeesMethod = StaffAreaServiceGrpc.getListServiceEmployeesMethod) == null) {
      synchronized (StaffAreaServiceGrpc.class) {
        if ((getListServiceEmployeesMethod = StaffAreaServiceGrpc.getListServiceEmployeesMethod) == null) {
          StaffAreaServiceGrpc.getListServiceEmployeesMethod = getListServiceEmployeesMethod =
              io.grpc.MethodDescriptor.<com.hubstore.staffarea.v1.ListServiceEmployeesRequest, com.hubstore.staffarea.v1.ListServiceEmployeesResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ListServiceEmployees"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.staffarea.v1.ListServiceEmployeesRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.staffarea.v1.ListServiceEmployeesResponse.getDefaultInstance()))
              .setSchemaDescriptor(new StaffAreaServiceMethodDescriptorSupplier("ListServiceEmployees"))
              .build();
        }
      }
    }
    return getListServiceEmployeesMethod;
  }

  private static volatile io.grpc.MethodDescriptor<com.hubstore.staffarea.v1.GetServiceEmployeeRequest,
      com.hubstore.staffarea.v1.GetServiceEmployeeResponse> getGetServiceEmployeeMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "GetServiceEmployee",
      requestType = com.hubstore.staffarea.v1.GetServiceEmployeeRequest.class,
      responseType = com.hubstore.staffarea.v1.GetServiceEmployeeResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.hubstore.staffarea.v1.GetServiceEmployeeRequest,
      com.hubstore.staffarea.v1.GetServiceEmployeeResponse> getGetServiceEmployeeMethod() {
    io.grpc.MethodDescriptor<com.hubstore.staffarea.v1.GetServiceEmployeeRequest, com.hubstore.staffarea.v1.GetServiceEmployeeResponse> getGetServiceEmployeeMethod;
    if ((getGetServiceEmployeeMethod = StaffAreaServiceGrpc.getGetServiceEmployeeMethod) == null) {
      synchronized (StaffAreaServiceGrpc.class) {
        if ((getGetServiceEmployeeMethod = StaffAreaServiceGrpc.getGetServiceEmployeeMethod) == null) {
          StaffAreaServiceGrpc.getGetServiceEmployeeMethod = getGetServiceEmployeeMethod =
              io.grpc.MethodDescriptor.<com.hubstore.staffarea.v1.GetServiceEmployeeRequest, com.hubstore.staffarea.v1.GetServiceEmployeeResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "GetServiceEmployee"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.staffarea.v1.GetServiceEmployeeRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.staffarea.v1.GetServiceEmployeeResponse.getDefaultInstance()))
              .setSchemaDescriptor(new StaffAreaServiceMethodDescriptorSupplier("GetServiceEmployee"))
              .build();
        }
      }
    }
    return getGetServiceEmployeeMethod;
  }

  private static volatile io.grpc.MethodDescriptor<com.hubstore.staffarea.v1.CreateServiceEmployeeRequest,
      com.hubstore.staffarea.v1.CreateServiceEmployeeResponse> getCreateServiceEmployeeMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "CreateServiceEmployee",
      requestType = com.hubstore.staffarea.v1.CreateServiceEmployeeRequest.class,
      responseType = com.hubstore.staffarea.v1.CreateServiceEmployeeResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.hubstore.staffarea.v1.CreateServiceEmployeeRequest,
      com.hubstore.staffarea.v1.CreateServiceEmployeeResponse> getCreateServiceEmployeeMethod() {
    io.grpc.MethodDescriptor<com.hubstore.staffarea.v1.CreateServiceEmployeeRequest, com.hubstore.staffarea.v1.CreateServiceEmployeeResponse> getCreateServiceEmployeeMethod;
    if ((getCreateServiceEmployeeMethod = StaffAreaServiceGrpc.getCreateServiceEmployeeMethod) == null) {
      synchronized (StaffAreaServiceGrpc.class) {
        if ((getCreateServiceEmployeeMethod = StaffAreaServiceGrpc.getCreateServiceEmployeeMethod) == null) {
          StaffAreaServiceGrpc.getCreateServiceEmployeeMethod = getCreateServiceEmployeeMethod =
              io.grpc.MethodDescriptor.<com.hubstore.staffarea.v1.CreateServiceEmployeeRequest, com.hubstore.staffarea.v1.CreateServiceEmployeeResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "CreateServiceEmployee"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.staffarea.v1.CreateServiceEmployeeRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.staffarea.v1.CreateServiceEmployeeResponse.getDefaultInstance()))
              .setSchemaDescriptor(new StaffAreaServiceMethodDescriptorSupplier("CreateServiceEmployee"))
              .build();
        }
      }
    }
    return getCreateServiceEmployeeMethod;
  }

  private static volatile io.grpc.MethodDescriptor<com.hubstore.staffarea.v1.UpdateServiceEmployeeRequest,
      com.hubstore.staffarea.v1.UpdateServiceEmployeeResponse> getUpdateServiceEmployeeMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "UpdateServiceEmployee",
      requestType = com.hubstore.staffarea.v1.UpdateServiceEmployeeRequest.class,
      responseType = com.hubstore.staffarea.v1.UpdateServiceEmployeeResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.hubstore.staffarea.v1.UpdateServiceEmployeeRequest,
      com.hubstore.staffarea.v1.UpdateServiceEmployeeResponse> getUpdateServiceEmployeeMethod() {
    io.grpc.MethodDescriptor<com.hubstore.staffarea.v1.UpdateServiceEmployeeRequest, com.hubstore.staffarea.v1.UpdateServiceEmployeeResponse> getUpdateServiceEmployeeMethod;
    if ((getUpdateServiceEmployeeMethod = StaffAreaServiceGrpc.getUpdateServiceEmployeeMethod) == null) {
      synchronized (StaffAreaServiceGrpc.class) {
        if ((getUpdateServiceEmployeeMethod = StaffAreaServiceGrpc.getUpdateServiceEmployeeMethod) == null) {
          StaffAreaServiceGrpc.getUpdateServiceEmployeeMethod = getUpdateServiceEmployeeMethod =
              io.grpc.MethodDescriptor.<com.hubstore.staffarea.v1.UpdateServiceEmployeeRequest, com.hubstore.staffarea.v1.UpdateServiceEmployeeResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "UpdateServiceEmployee"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.staffarea.v1.UpdateServiceEmployeeRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.staffarea.v1.UpdateServiceEmployeeResponse.getDefaultInstance()))
              .setSchemaDescriptor(new StaffAreaServiceMethodDescriptorSupplier("UpdateServiceEmployee"))
              .build();
        }
      }
    }
    return getUpdateServiceEmployeeMethod;
  }

  private static volatile io.grpc.MethodDescriptor<com.hubstore.staffarea.v1.SetServiceEmployeeActiveRequest,
      com.hubstore.staffarea.v1.SetServiceEmployeeActiveResponse> getSetServiceEmployeeActiveMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "SetServiceEmployeeActive",
      requestType = com.hubstore.staffarea.v1.SetServiceEmployeeActiveRequest.class,
      responseType = com.hubstore.staffarea.v1.SetServiceEmployeeActiveResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.hubstore.staffarea.v1.SetServiceEmployeeActiveRequest,
      com.hubstore.staffarea.v1.SetServiceEmployeeActiveResponse> getSetServiceEmployeeActiveMethod() {
    io.grpc.MethodDescriptor<com.hubstore.staffarea.v1.SetServiceEmployeeActiveRequest, com.hubstore.staffarea.v1.SetServiceEmployeeActiveResponse> getSetServiceEmployeeActiveMethod;
    if ((getSetServiceEmployeeActiveMethod = StaffAreaServiceGrpc.getSetServiceEmployeeActiveMethod) == null) {
      synchronized (StaffAreaServiceGrpc.class) {
        if ((getSetServiceEmployeeActiveMethod = StaffAreaServiceGrpc.getSetServiceEmployeeActiveMethod) == null) {
          StaffAreaServiceGrpc.getSetServiceEmployeeActiveMethod = getSetServiceEmployeeActiveMethod =
              io.grpc.MethodDescriptor.<com.hubstore.staffarea.v1.SetServiceEmployeeActiveRequest, com.hubstore.staffarea.v1.SetServiceEmployeeActiveResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "SetServiceEmployeeActive"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.staffarea.v1.SetServiceEmployeeActiveRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.staffarea.v1.SetServiceEmployeeActiveResponse.getDefaultInstance()))
              .setSchemaDescriptor(new StaffAreaServiceMethodDescriptorSupplier("SetServiceEmployeeActive"))
              .build();
        }
      }
    }
    return getSetServiceEmployeeActiveMethod;
  }

  private static volatile io.grpc.MethodDescriptor<com.hubstore.staffarea.v1.VerifyPaymentAccountRequest,
      com.hubstore.staffarea.v1.VerifyPaymentAccountResponse> getVerifyPaymentAccountMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "VerifyPaymentAccount",
      requestType = com.hubstore.staffarea.v1.VerifyPaymentAccountRequest.class,
      responseType = com.hubstore.staffarea.v1.VerifyPaymentAccountResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.hubstore.staffarea.v1.VerifyPaymentAccountRequest,
      com.hubstore.staffarea.v1.VerifyPaymentAccountResponse> getVerifyPaymentAccountMethod() {
    io.grpc.MethodDescriptor<com.hubstore.staffarea.v1.VerifyPaymentAccountRequest, com.hubstore.staffarea.v1.VerifyPaymentAccountResponse> getVerifyPaymentAccountMethod;
    if ((getVerifyPaymentAccountMethod = StaffAreaServiceGrpc.getVerifyPaymentAccountMethod) == null) {
      synchronized (StaffAreaServiceGrpc.class) {
        if ((getVerifyPaymentAccountMethod = StaffAreaServiceGrpc.getVerifyPaymentAccountMethod) == null) {
          StaffAreaServiceGrpc.getVerifyPaymentAccountMethod = getVerifyPaymentAccountMethod =
              io.grpc.MethodDescriptor.<com.hubstore.staffarea.v1.VerifyPaymentAccountRequest, com.hubstore.staffarea.v1.VerifyPaymentAccountResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "VerifyPaymentAccount"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.staffarea.v1.VerifyPaymentAccountRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.staffarea.v1.VerifyPaymentAccountResponse.getDefaultInstance()))
              .setSchemaDescriptor(new StaffAreaServiceMethodDescriptorSupplier("VerifyPaymentAccount"))
              .build();
        }
      }
    }
    return getVerifyPaymentAccountMethod;
  }

  /**
   * Creates a new async stub that supports all call types for the service
   */
  public static StaffAreaServiceStub newStub(io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<StaffAreaServiceStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<StaffAreaServiceStub>() {
        @java.lang.Override
        public StaffAreaServiceStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new StaffAreaServiceStub(channel, callOptions);
        }
      };
    return StaffAreaServiceStub.newStub(factory, channel);
  }

  /**
   * Creates a new blocking-style stub that supports unary and streaming output calls on the service
   */
  public static StaffAreaServiceBlockingStub newBlockingStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<StaffAreaServiceBlockingStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<StaffAreaServiceBlockingStub>() {
        @java.lang.Override
        public StaffAreaServiceBlockingStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new StaffAreaServiceBlockingStub(channel, callOptions);
        }
      };
    return StaffAreaServiceBlockingStub.newStub(factory, channel);
  }

  /**
   * Creates a new ListenableFuture-style stub that supports unary calls on the service
   */
  public static StaffAreaServiceFutureStub newFutureStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<StaffAreaServiceFutureStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<StaffAreaServiceFutureStub>() {
        @java.lang.Override
        public StaffAreaServiceFutureStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new StaffAreaServiceFutureStub(channel, callOptions);
        }
      };
    return StaffAreaServiceFutureStub.newStub(factory, channel);
  }

  /**
   */
  public interface AsyncService {

    /**
     */
    default void listServiceEmployees(com.hubstore.staffarea.v1.ListServiceEmployeesRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.staffarea.v1.ListServiceEmployeesResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getListServiceEmployeesMethod(), responseObserver);
    }

    /**
     */
    default void getServiceEmployee(com.hubstore.staffarea.v1.GetServiceEmployeeRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.staffarea.v1.GetServiceEmployeeResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getGetServiceEmployeeMethod(), responseObserver);
    }

    /**
     */
    default void createServiceEmployee(com.hubstore.staffarea.v1.CreateServiceEmployeeRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.staffarea.v1.CreateServiceEmployeeResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getCreateServiceEmployeeMethod(), responseObserver);
    }

    /**
     */
    default void updateServiceEmployee(com.hubstore.staffarea.v1.UpdateServiceEmployeeRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.staffarea.v1.UpdateServiceEmployeeResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getUpdateServiceEmployeeMethod(), responseObserver);
    }

    /**
     */
    default void setServiceEmployeeActive(com.hubstore.staffarea.v1.SetServiceEmployeeActiveRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.staffarea.v1.SetServiceEmployeeActiveResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getSetServiceEmployeeActiveMethod(), responseObserver);
    }

    /**
     */
    default void verifyPaymentAccount(com.hubstore.staffarea.v1.VerifyPaymentAccountRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.staffarea.v1.VerifyPaymentAccountResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getVerifyPaymentAccountMethod(), responseObserver);
    }
  }

  /**
   * Base class for the server implementation of the service StaffAreaService.
   */
  public static abstract class StaffAreaServiceImplBase
      implements io.grpc.BindableService, AsyncService {

    @java.lang.Override public final io.grpc.ServerServiceDefinition bindService() {
      return StaffAreaServiceGrpc.bindService(this);
    }
  }

  /**
   * A stub to allow clients to do asynchronous rpc calls to service StaffAreaService.
   */
  public static final class StaffAreaServiceStub
      extends io.grpc.stub.AbstractAsyncStub<StaffAreaServiceStub> {
    private StaffAreaServiceStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected StaffAreaServiceStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new StaffAreaServiceStub(channel, callOptions);
    }

    /**
     */
    public void listServiceEmployees(com.hubstore.staffarea.v1.ListServiceEmployeesRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.staffarea.v1.ListServiceEmployeesResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getListServiceEmployeesMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void getServiceEmployee(com.hubstore.staffarea.v1.GetServiceEmployeeRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.staffarea.v1.GetServiceEmployeeResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getGetServiceEmployeeMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void createServiceEmployee(com.hubstore.staffarea.v1.CreateServiceEmployeeRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.staffarea.v1.CreateServiceEmployeeResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getCreateServiceEmployeeMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void updateServiceEmployee(com.hubstore.staffarea.v1.UpdateServiceEmployeeRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.staffarea.v1.UpdateServiceEmployeeResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getUpdateServiceEmployeeMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void setServiceEmployeeActive(com.hubstore.staffarea.v1.SetServiceEmployeeActiveRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.staffarea.v1.SetServiceEmployeeActiveResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getSetServiceEmployeeActiveMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void verifyPaymentAccount(com.hubstore.staffarea.v1.VerifyPaymentAccountRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.staffarea.v1.VerifyPaymentAccountResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getVerifyPaymentAccountMethod(), getCallOptions()), request, responseObserver);
    }
  }

  /**
   * A stub to allow clients to do synchronous rpc calls to service StaffAreaService.
   */
  public static final class StaffAreaServiceBlockingStub
      extends io.grpc.stub.AbstractBlockingStub<StaffAreaServiceBlockingStub> {
    private StaffAreaServiceBlockingStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected StaffAreaServiceBlockingStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new StaffAreaServiceBlockingStub(channel, callOptions);
    }

    /**
     */
    public com.hubstore.staffarea.v1.ListServiceEmployeesResponse listServiceEmployees(com.hubstore.staffarea.v1.ListServiceEmployeesRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListServiceEmployeesMethod(), getCallOptions(), request);
    }

    /**
     */
    public com.hubstore.staffarea.v1.GetServiceEmployeeResponse getServiceEmployee(com.hubstore.staffarea.v1.GetServiceEmployeeRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGetServiceEmployeeMethod(), getCallOptions(), request);
    }

    /**
     */
    public com.hubstore.staffarea.v1.CreateServiceEmployeeResponse createServiceEmployee(com.hubstore.staffarea.v1.CreateServiceEmployeeRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getCreateServiceEmployeeMethod(), getCallOptions(), request);
    }

    /**
     */
    public com.hubstore.staffarea.v1.UpdateServiceEmployeeResponse updateServiceEmployee(com.hubstore.staffarea.v1.UpdateServiceEmployeeRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getUpdateServiceEmployeeMethod(), getCallOptions(), request);
    }

    /**
     */
    public com.hubstore.staffarea.v1.SetServiceEmployeeActiveResponse setServiceEmployeeActive(com.hubstore.staffarea.v1.SetServiceEmployeeActiveRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getSetServiceEmployeeActiveMethod(), getCallOptions(), request);
    }

    /**
     */
    public com.hubstore.staffarea.v1.VerifyPaymentAccountResponse verifyPaymentAccount(com.hubstore.staffarea.v1.VerifyPaymentAccountRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getVerifyPaymentAccountMethod(), getCallOptions(), request);
    }
  }

  /**
   * A stub to allow clients to do ListenableFuture-style rpc calls to service StaffAreaService.
   */
  public static final class StaffAreaServiceFutureStub
      extends io.grpc.stub.AbstractFutureStub<StaffAreaServiceFutureStub> {
    private StaffAreaServiceFutureStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected StaffAreaServiceFutureStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new StaffAreaServiceFutureStub(channel, callOptions);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<com.hubstore.staffarea.v1.ListServiceEmployeesResponse> listServiceEmployees(
        com.hubstore.staffarea.v1.ListServiceEmployeesRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getListServiceEmployeesMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<com.hubstore.staffarea.v1.GetServiceEmployeeResponse> getServiceEmployee(
        com.hubstore.staffarea.v1.GetServiceEmployeeRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getGetServiceEmployeeMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<com.hubstore.staffarea.v1.CreateServiceEmployeeResponse> createServiceEmployee(
        com.hubstore.staffarea.v1.CreateServiceEmployeeRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getCreateServiceEmployeeMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<com.hubstore.staffarea.v1.UpdateServiceEmployeeResponse> updateServiceEmployee(
        com.hubstore.staffarea.v1.UpdateServiceEmployeeRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getUpdateServiceEmployeeMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<com.hubstore.staffarea.v1.SetServiceEmployeeActiveResponse> setServiceEmployeeActive(
        com.hubstore.staffarea.v1.SetServiceEmployeeActiveRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getSetServiceEmployeeActiveMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<com.hubstore.staffarea.v1.VerifyPaymentAccountResponse> verifyPaymentAccount(
        com.hubstore.staffarea.v1.VerifyPaymentAccountRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getVerifyPaymentAccountMethod(), getCallOptions()), request);
    }
  }

  private static final int METHODID_LIST_SERVICE_EMPLOYEES = 0;
  private static final int METHODID_GET_SERVICE_EMPLOYEE = 1;
  private static final int METHODID_CREATE_SERVICE_EMPLOYEE = 2;
  private static final int METHODID_UPDATE_SERVICE_EMPLOYEE = 3;
  private static final int METHODID_SET_SERVICE_EMPLOYEE_ACTIVE = 4;
  private static final int METHODID_VERIFY_PAYMENT_ACCOUNT = 5;

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
        case METHODID_LIST_SERVICE_EMPLOYEES:
          serviceImpl.listServiceEmployees((com.hubstore.staffarea.v1.ListServiceEmployeesRequest) request,
              (io.grpc.stub.StreamObserver<com.hubstore.staffarea.v1.ListServiceEmployeesResponse>) responseObserver);
          break;
        case METHODID_GET_SERVICE_EMPLOYEE:
          serviceImpl.getServiceEmployee((com.hubstore.staffarea.v1.GetServiceEmployeeRequest) request,
              (io.grpc.stub.StreamObserver<com.hubstore.staffarea.v1.GetServiceEmployeeResponse>) responseObserver);
          break;
        case METHODID_CREATE_SERVICE_EMPLOYEE:
          serviceImpl.createServiceEmployee((com.hubstore.staffarea.v1.CreateServiceEmployeeRequest) request,
              (io.grpc.stub.StreamObserver<com.hubstore.staffarea.v1.CreateServiceEmployeeResponse>) responseObserver);
          break;
        case METHODID_UPDATE_SERVICE_EMPLOYEE:
          serviceImpl.updateServiceEmployee((com.hubstore.staffarea.v1.UpdateServiceEmployeeRequest) request,
              (io.grpc.stub.StreamObserver<com.hubstore.staffarea.v1.UpdateServiceEmployeeResponse>) responseObserver);
          break;
        case METHODID_SET_SERVICE_EMPLOYEE_ACTIVE:
          serviceImpl.setServiceEmployeeActive((com.hubstore.staffarea.v1.SetServiceEmployeeActiveRequest) request,
              (io.grpc.stub.StreamObserver<com.hubstore.staffarea.v1.SetServiceEmployeeActiveResponse>) responseObserver);
          break;
        case METHODID_VERIFY_PAYMENT_ACCOUNT:
          serviceImpl.verifyPaymentAccount((com.hubstore.staffarea.v1.VerifyPaymentAccountRequest) request,
              (io.grpc.stub.StreamObserver<com.hubstore.staffarea.v1.VerifyPaymentAccountResponse>) responseObserver);
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
          getListServiceEmployeesMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.hubstore.staffarea.v1.ListServiceEmployeesRequest,
              com.hubstore.staffarea.v1.ListServiceEmployeesResponse>(
                service, METHODID_LIST_SERVICE_EMPLOYEES)))
        .addMethod(
          getGetServiceEmployeeMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.hubstore.staffarea.v1.GetServiceEmployeeRequest,
              com.hubstore.staffarea.v1.GetServiceEmployeeResponse>(
                service, METHODID_GET_SERVICE_EMPLOYEE)))
        .addMethod(
          getCreateServiceEmployeeMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.hubstore.staffarea.v1.CreateServiceEmployeeRequest,
              com.hubstore.staffarea.v1.CreateServiceEmployeeResponse>(
                service, METHODID_CREATE_SERVICE_EMPLOYEE)))
        .addMethod(
          getUpdateServiceEmployeeMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.hubstore.staffarea.v1.UpdateServiceEmployeeRequest,
              com.hubstore.staffarea.v1.UpdateServiceEmployeeResponse>(
                service, METHODID_UPDATE_SERVICE_EMPLOYEE)))
        .addMethod(
          getSetServiceEmployeeActiveMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.hubstore.staffarea.v1.SetServiceEmployeeActiveRequest,
              com.hubstore.staffarea.v1.SetServiceEmployeeActiveResponse>(
                service, METHODID_SET_SERVICE_EMPLOYEE_ACTIVE)))
        .addMethod(
          getVerifyPaymentAccountMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.hubstore.staffarea.v1.VerifyPaymentAccountRequest,
              com.hubstore.staffarea.v1.VerifyPaymentAccountResponse>(
                service, METHODID_VERIFY_PAYMENT_ACCOUNT)))
        .build();
  }

  private static abstract class StaffAreaServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoFileDescriptorSupplier, io.grpc.protobuf.ProtoServiceDescriptorSupplier {
    StaffAreaServiceBaseDescriptorSupplier() {}

    @java.lang.Override
    public com.google.protobuf.Descriptors.FileDescriptor getFileDescriptor() {
      return com.hubstore.staffarea.v1.Staffarea.getDescriptor();
    }

    @java.lang.Override
    public com.google.protobuf.Descriptors.ServiceDescriptor getServiceDescriptor() {
      return getFileDescriptor().findServiceByName("StaffAreaService");
    }
  }

  private static final class StaffAreaServiceFileDescriptorSupplier
      extends StaffAreaServiceBaseDescriptorSupplier {
    StaffAreaServiceFileDescriptorSupplier() {}
  }

  private static final class StaffAreaServiceMethodDescriptorSupplier
      extends StaffAreaServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoMethodDescriptorSupplier {
    private final java.lang.String methodName;

    StaffAreaServiceMethodDescriptorSupplier(java.lang.String methodName) {
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
      synchronized (StaffAreaServiceGrpc.class) {
        result = serviceDescriptor;
        if (result == null) {
          serviceDescriptor = result = io.grpc.ServiceDescriptor.newBuilder(SERVICE_NAME)
              .setSchemaDescriptor(new StaffAreaServiceFileDescriptorSupplier())
              .addMethod(getListServiceEmployeesMethod())
              .addMethod(getGetServiceEmployeeMethod())
              .addMethod(getCreateServiceEmployeeMethod())
              .addMethod(getUpdateServiceEmployeeMethod())
              .addMethod(getSetServiceEmployeeActiveMethod())
              .addMethod(getVerifyPaymentAccountMethod())
              .build();
        }
      }
    }
    return result;
  }
}
