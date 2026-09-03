package com.hubstore.transfer.v1;

import static io.grpc.MethodDescriptor.generateFullMethodName;

/**
 * <pre>
 * TransferService — SF-28 (Java fulfillment-service :50051, CÙNG DB orders).
 * </pre>
 */
@javax.annotation.Generated(
    value = "by gRPC proto compiler (version 1.64.0)",
    comments = "Source: hubstore/transfer/v1/transfer.proto")
@io.grpc.stub.annotations.GrpcGenerated
public final class TransferServiceGrpc {

  private TransferServiceGrpc() {}

  public static final java.lang.String SERVICE_NAME = "hubstore.transfer.v1.TransferService";

  // Static method descriptors that strictly reflect the proto.
  private static volatile io.grpc.MethodDescriptor<com.hubstore.transfer.v1.CreateTransferTicketRequest,
      com.hubstore.transfer.v1.CreateTransferTicketResponse> getCreateTransferTicketMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "CreateTransferTicket",
      requestType = com.hubstore.transfer.v1.CreateTransferTicketRequest.class,
      responseType = com.hubstore.transfer.v1.CreateTransferTicketResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.hubstore.transfer.v1.CreateTransferTicketRequest,
      com.hubstore.transfer.v1.CreateTransferTicketResponse> getCreateTransferTicketMethod() {
    io.grpc.MethodDescriptor<com.hubstore.transfer.v1.CreateTransferTicketRequest, com.hubstore.transfer.v1.CreateTransferTicketResponse> getCreateTransferTicketMethod;
    if ((getCreateTransferTicketMethod = TransferServiceGrpc.getCreateTransferTicketMethod) == null) {
      synchronized (TransferServiceGrpc.class) {
        if ((getCreateTransferTicketMethod = TransferServiceGrpc.getCreateTransferTicketMethod) == null) {
          TransferServiceGrpc.getCreateTransferTicketMethod = getCreateTransferTicketMethod =
              io.grpc.MethodDescriptor.<com.hubstore.transfer.v1.CreateTransferTicketRequest, com.hubstore.transfer.v1.CreateTransferTicketResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "CreateTransferTicket"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.transfer.v1.CreateTransferTicketRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.transfer.v1.CreateTransferTicketResponse.getDefaultInstance()))
              .setSchemaDescriptor(new TransferServiceMethodDescriptorSupplier("CreateTransferTicket"))
              .build();
        }
      }
    }
    return getCreateTransferTicketMethod;
  }

  private static volatile io.grpc.MethodDescriptor<com.hubstore.transfer.v1.ListTransferTicketsRequest,
      com.hubstore.transfer.v1.ListTransferTicketsResponse> getListTransferTicketsMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ListTransferTickets",
      requestType = com.hubstore.transfer.v1.ListTransferTicketsRequest.class,
      responseType = com.hubstore.transfer.v1.ListTransferTicketsResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.hubstore.transfer.v1.ListTransferTicketsRequest,
      com.hubstore.transfer.v1.ListTransferTicketsResponse> getListTransferTicketsMethod() {
    io.grpc.MethodDescriptor<com.hubstore.transfer.v1.ListTransferTicketsRequest, com.hubstore.transfer.v1.ListTransferTicketsResponse> getListTransferTicketsMethod;
    if ((getListTransferTicketsMethod = TransferServiceGrpc.getListTransferTicketsMethod) == null) {
      synchronized (TransferServiceGrpc.class) {
        if ((getListTransferTicketsMethod = TransferServiceGrpc.getListTransferTicketsMethod) == null) {
          TransferServiceGrpc.getListTransferTicketsMethod = getListTransferTicketsMethod =
              io.grpc.MethodDescriptor.<com.hubstore.transfer.v1.ListTransferTicketsRequest, com.hubstore.transfer.v1.ListTransferTicketsResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ListTransferTickets"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.transfer.v1.ListTransferTicketsRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.transfer.v1.ListTransferTicketsResponse.getDefaultInstance()))
              .setSchemaDescriptor(new TransferServiceMethodDescriptorSupplier("ListTransferTickets"))
              .build();
        }
      }
    }
    return getListTransferTicketsMethod;
  }

  /**
   * Creates a new async stub that supports all call types for the service
   */
  public static TransferServiceStub newStub(io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<TransferServiceStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<TransferServiceStub>() {
        @java.lang.Override
        public TransferServiceStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new TransferServiceStub(channel, callOptions);
        }
      };
    return TransferServiceStub.newStub(factory, channel);
  }

  /**
   * Creates a new blocking-style stub that supports unary and streaming output calls on the service
   */
  public static TransferServiceBlockingStub newBlockingStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<TransferServiceBlockingStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<TransferServiceBlockingStub>() {
        @java.lang.Override
        public TransferServiceBlockingStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new TransferServiceBlockingStub(channel, callOptions);
        }
      };
    return TransferServiceBlockingStub.newStub(factory, channel);
  }

  /**
   * Creates a new ListenableFuture-style stub that supports unary calls on the service
   */
  public static TransferServiceFutureStub newFutureStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<TransferServiceFutureStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<TransferServiceFutureStub>() {
        @java.lang.Override
        public TransferServiceFutureStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new TransferServiceFutureStub(channel, callOptions);
        }
      };
    return TransferServiceFutureStub.newStub(factory, channel);
  }

  /**
   * <pre>
   * TransferService — SF-28 (Java fulfillment-service :50051, CÙNG DB orders).
   * </pre>
   */
  public interface AsyncService {

    /**
     */
    default void createTransferTicket(com.hubstore.transfer.v1.CreateTransferTicketRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.transfer.v1.CreateTransferTicketResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getCreateTransferTicketMethod(), responseObserver);
    }

    /**
     */
    default void listTransferTickets(com.hubstore.transfer.v1.ListTransferTicketsRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.transfer.v1.ListTransferTicketsResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getListTransferTicketsMethod(), responseObserver);
    }
  }

  /**
   * Base class for the server implementation of the service TransferService.
   * <pre>
   * TransferService — SF-28 (Java fulfillment-service :50051, CÙNG DB orders).
   * </pre>
   */
  public static abstract class TransferServiceImplBase
      implements io.grpc.BindableService, AsyncService {

    @java.lang.Override public final io.grpc.ServerServiceDefinition bindService() {
      return TransferServiceGrpc.bindService(this);
    }
  }

  /**
   * A stub to allow clients to do asynchronous rpc calls to service TransferService.
   * <pre>
   * TransferService — SF-28 (Java fulfillment-service :50051, CÙNG DB orders).
   * </pre>
   */
  public static final class TransferServiceStub
      extends io.grpc.stub.AbstractAsyncStub<TransferServiceStub> {
    private TransferServiceStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected TransferServiceStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new TransferServiceStub(channel, callOptions);
    }

    /**
     */
    public void createTransferTicket(com.hubstore.transfer.v1.CreateTransferTicketRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.transfer.v1.CreateTransferTicketResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getCreateTransferTicketMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void listTransferTickets(com.hubstore.transfer.v1.ListTransferTicketsRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.transfer.v1.ListTransferTicketsResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getListTransferTicketsMethod(), getCallOptions()), request, responseObserver);
    }
  }

  /**
   * A stub to allow clients to do synchronous rpc calls to service TransferService.
   * <pre>
   * TransferService — SF-28 (Java fulfillment-service :50051, CÙNG DB orders).
   * </pre>
   */
  public static final class TransferServiceBlockingStub
      extends io.grpc.stub.AbstractBlockingStub<TransferServiceBlockingStub> {
    private TransferServiceBlockingStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected TransferServiceBlockingStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new TransferServiceBlockingStub(channel, callOptions);
    }

    /**
     */
    public com.hubstore.transfer.v1.CreateTransferTicketResponse createTransferTicket(com.hubstore.transfer.v1.CreateTransferTicketRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getCreateTransferTicketMethod(), getCallOptions(), request);
    }

    /**
     */
    public com.hubstore.transfer.v1.ListTransferTicketsResponse listTransferTickets(com.hubstore.transfer.v1.ListTransferTicketsRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListTransferTicketsMethod(), getCallOptions(), request);
    }
  }

  /**
   * A stub to allow clients to do ListenableFuture-style rpc calls to service TransferService.
   * <pre>
   * TransferService — SF-28 (Java fulfillment-service :50051, CÙNG DB orders).
   * </pre>
   */
  public static final class TransferServiceFutureStub
      extends io.grpc.stub.AbstractFutureStub<TransferServiceFutureStub> {
    private TransferServiceFutureStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected TransferServiceFutureStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new TransferServiceFutureStub(channel, callOptions);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<com.hubstore.transfer.v1.CreateTransferTicketResponse> createTransferTicket(
        com.hubstore.transfer.v1.CreateTransferTicketRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getCreateTransferTicketMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<com.hubstore.transfer.v1.ListTransferTicketsResponse> listTransferTickets(
        com.hubstore.transfer.v1.ListTransferTicketsRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getListTransferTicketsMethod(), getCallOptions()), request);
    }
  }

  private static final int METHODID_CREATE_TRANSFER_TICKET = 0;
  private static final int METHODID_LIST_TRANSFER_TICKETS = 1;

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
        case METHODID_CREATE_TRANSFER_TICKET:
          serviceImpl.createTransferTicket((com.hubstore.transfer.v1.CreateTransferTicketRequest) request,
              (io.grpc.stub.StreamObserver<com.hubstore.transfer.v1.CreateTransferTicketResponse>) responseObserver);
          break;
        case METHODID_LIST_TRANSFER_TICKETS:
          serviceImpl.listTransferTickets((com.hubstore.transfer.v1.ListTransferTicketsRequest) request,
              (io.grpc.stub.StreamObserver<com.hubstore.transfer.v1.ListTransferTicketsResponse>) responseObserver);
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
          getCreateTransferTicketMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.hubstore.transfer.v1.CreateTransferTicketRequest,
              com.hubstore.transfer.v1.CreateTransferTicketResponse>(
                service, METHODID_CREATE_TRANSFER_TICKET)))
        .addMethod(
          getListTransferTicketsMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.hubstore.transfer.v1.ListTransferTicketsRequest,
              com.hubstore.transfer.v1.ListTransferTicketsResponse>(
                service, METHODID_LIST_TRANSFER_TICKETS)))
        .build();
  }

  private static abstract class TransferServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoFileDescriptorSupplier, io.grpc.protobuf.ProtoServiceDescriptorSupplier {
    TransferServiceBaseDescriptorSupplier() {}

    @java.lang.Override
    public com.google.protobuf.Descriptors.FileDescriptor getFileDescriptor() {
      return com.hubstore.transfer.v1.Transfer.getDescriptor();
    }

    @java.lang.Override
    public com.google.protobuf.Descriptors.ServiceDescriptor getServiceDescriptor() {
      return getFileDescriptor().findServiceByName("TransferService");
    }
  }

  private static final class TransferServiceFileDescriptorSupplier
      extends TransferServiceBaseDescriptorSupplier {
    TransferServiceFileDescriptorSupplier() {}
  }

  private static final class TransferServiceMethodDescriptorSupplier
      extends TransferServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoMethodDescriptorSupplier {
    private final java.lang.String methodName;

    TransferServiceMethodDescriptorSupplier(java.lang.String methodName) {
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
      synchronized (TransferServiceGrpc.class) {
        result = serviceDescriptor;
        if (result == null) {
          serviceDescriptor = result = io.grpc.ServiceDescriptor.newBuilder(SERVICE_NAME)
              .setSchemaDescriptor(new TransferServiceFileDescriptorSupplier())
              .addMethod(getCreateTransferTicketMethod())
              .addMethod(getListTransferTicketsMethod())
              .build();
        }
      }
    }
    return result;
  }
}
