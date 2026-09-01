package com.hubstore.print.v1;

import static io.grpc.MethodDescriptor.generateFullMethodName;

/**
 */
@javax.annotation.Generated(
    value = "by gRPC proto compiler (version 1.64.0)",
    comments = "Source: hubstore/print/v1/print.proto")
@io.grpc.stub.annotations.GrpcGenerated
public final class PrintServiceGrpc {

  private PrintServiceGrpc() {}

  public static final java.lang.String SERVICE_NAME = "hubstore.print.v1.PrintService";

  // Static method descriptors that strictly reflect the proto.
  private static volatile io.grpc.MethodDescriptor<com.hubstore.print.v1.ListPrintersRequest,
      com.hubstore.print.v1.ListPrintersResponse> getListPrintersMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ListPrinters",
      requestType = com.hubstore.print.v1.ListPrintersRequest.class,
      responseType = com.hubstore.print.v1.ListPrintersResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.hubstore.print.v1.ListPrintersRequest,
      com.hubstore.print.v1.ListPrintersResponse> getListPrintersMethod() {
    io.grpc.MethodDescriptor<com.hubstore.print.v1.ListPrintersRequest, com.hubstore.print.v1.ListPrintersResponse> getListPrintersMethod;
    if ((getListPrintersMethod = PrintServiceGrpc.getListPrintersMethod) == null) {
      synchronized (PrintServiceGrpc.class) {
        if ((getListPrintersMethod = PrintServiceGrpc.getListPrintersMethod) == null) {
          PrintServiceGrpc.getListPrintersMethod = getListPrintersMethod =
              io.grpc.MethodDescriptor.<com.hubstore.print.v1.ListPrintersRequest, com.hubstore.print.v1.ListPrintersResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ListPrinters"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.print.v1.ListPrintersRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.print.v1.ListPrintersResponse.getDefaultInstance()))
              .setSchemaDescriptor(new PrintServiceMethodDescriptorSupplier("ListPrinters"))
              .build();
        }
      }
    }
    return getListPrintersMethod;
  }

  private static volatile io.grpc.MethodDescriptor<com.hubstore.print.v1.PrintRequest,
      com.hubstore.print.v1.PrintResponse> getPrintMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "Print",
      requestType = com.hubstore.print.v1.PrintRequest.class,
      responseType = com.hubstore.print.v1.PrintResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<com.hubstore.print.v1.PrintRequest,
      com.hubstore.print.v1.PrintResponse> getPrintMethod() {
    io.grpc.MethodDescriptor<com.hubstore.print.v1.PrintRequest, com.hubstore.print.v1.PrintResponse> getPrintMethod;
    if ((getPrintMethod = PrintServiceGrpc.getPrintMethod) == null) {
      synchronized (PrintServiceGrpc.class) {
        if ((getPrintMethod = PrintServiceGrpc.getPrintMethod) == null) {
          PrintServiceGrpc.getPrintMethod = getPrintMethod =
              io.grpc.MethodDescriptor.<com.hubstore.print.v1.PrintRequest, com.hubstore.print.v1.PrintResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "Print"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.print.v1.PrintRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  com.hubstore.print.v1.PrintResponse.getDefaultInstance()))
              .setSchemaDescriptor(new PrintServiceMethodDescriptorSupplier("Print"))
              .build();
        }
      }
    }
    return getPrintMethod;
  }

  /**
   * Creates a new async stub that supports all call types for the service
   */
  public static PrintServiceStub newStub(io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<PrintServiceStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<PrintServiceStub>() {
        @java.lang.Override
        public PrintServiceStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new PrintServiceStub(channel, callOptions);
        }
      };
    return PrintServiceStub.newStub(factory, channel);
  }

  /**
   * Creates a new blocking-style stub that supports unary and streaming output calls on the service
   */
  public static PrintServiceBlockingStub newBlockingStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<PrintServiceBlockingStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<PrintServiceBlockingStub>() {
        @java.lang.Override
        public PrintServiceBlockingStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new PrintServiceBlockingStub(channel, callOptions);
        }
      };
    return PrintServiceBlockingStub.newStub(factory, channel);
  }

  /**
   * Creates a new ListenableFuture-style stub that supports unary calls on the service
   */
  public static PrintServiceFutureStub newFutureStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<PrintServiceFutureStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<PrintServiceFutureStub>() {
        @java.lang.Override
        public PrintServiceFutureStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new PrintServiceFutureStub(channel, callOptions);
        }
      };
    return PrintServiceFutureStub.newStub(factory, channel);
  }

  /**
   */
  public interface AsyncService {

    /**
     * <pre>
     * GET /fulfillment/print/printers?shopCode= — BFF lọc theo shop.
     * </pre>
     */
    default void listPrinters(com.hubstore.print.v1.ListPrintersRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.print.v1.ListPrintersResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getListPrintersMethod(), responseObserver);
    }

    /**
     * <pre>
     * POST /fulfillment/print — trả PDF bytes (application/pdf) qua BFF stream.
     * </pre>
     */
    default void print(com.hubstore.print.v1.PrintRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.print.v1.PrintResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getPrintMethod(), responseObserver);
    }
  }

  /**
   * Base class for the server implementation of the service PrintService.
   */
  public static abstract class PrintServiceImplBase
      implements io.grpc.BindableService, AsyncService {

    @java.lang.Override public final io.grpc.ServerServiceDefinition bindService() {
      return PrintServiceGrpc.bindService(this);
    }
  }

  /**
   * A stub to allow clients to do asynchronous rpc calls to service PrintService.
   */
  public static final class PrintServiceStub
      extends io.grpc.stub.AbstractAsyncStub<PrintServiceStub> {
    private PrintServiceStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected PrintServiceStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new PrintServiceStub(channel, callOptions);
    }

    /**
     * <pre>
     * GET /fulfillment/print/printers?shopCode= — BFF lọc theo shop.
     * </pre>
     */
    public void listPrinters(com.hubstore.print.v1.ListPrintersRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.print.v1.ListPrintersResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getListPrintersMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * POST /fulfillment/print — trả PDF bytes (application/pdf) qua BFF stream.
     * </pre>
     */
    public void print(com.hubstore.print.v1.PrintRequest request,
        io.grpc.stub.StreamObserver<com.hubstore.print.v1.PrintResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getPrintMethod(), getCallOptions()), request, responseObserver);
    }
  }

  /**
   * A stub to allow clients to do synchronous rpc calls to service PrintService.
   */
  public static final class PrintServiceBlockingStub
      extends io.grpc.stub.AbstractBlockingStub<PrintServiceBlockingStub> {
    private PrintServiceBlockingStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected PrintServiceBlockingStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new PrintServiceBlockingStub(channel, callOptions);
    }

    /**
     * <pre>
     * GET /fulfillment/print/printers?shopCode= — BFF lọc theo shop.
     * </pre>
     */
    public com.hubstore.print.v1.ListPrintersResponse listPrinters(com.hubstore.print.v1.ListPrintersRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListPrintersMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * POST /fulfillment/print — trả PDF bytes (application/pdf) qua BFF stream.
     * </pre>
     */
    public com.hubstore.print.v1.PrintResponse print(com.hubstore.print.v1.PrintRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getPrintMethod(), getCallOptions(), request);
    }
  }

  /**
   * A stub to allow clients to do ListenableFuture-style rpc calls to service PrintService.
   */
  public static final class PrintServiceFutureStub
      extends io.grpc.stub.AbstractFutureStub<PrintServiceFutureStub> {
    private PrintServiceFutureStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected PrintServiceFutureStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new PrintServiceFutureStub(channel, callOptions);
    }

    /**
     * <pre>
     * GET /fulfillment/print/printers?shopCode= — BFF lọc theo shop.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<com.hubstore.print.v1.ListPrintersResponse> listPrinters(
        com.hubstore.print.v1.ListPrintersRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getListPrintersMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * POST /fulfillment/print — trả PDF bytes (application/pdf) qua BFF stream.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<com.hubstore.print.v1.PrintResponse> print(
        com.hubstore.print.v1.PrintRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getPrintMethod(), getCallOptions()), request);
    }
  }

  private static final int METHODID_LIST_PRINTERS = 0;
  private static final int METHODID_PRINT = 1;

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
        case METHODID_LIST_PRINTERS:
          serviceImpl.listPrinters((com.hubstore.print.v1.ListPrintersRequest) request,
              (io.grpc.stub.StreamObserver<com.hubstore.print.v1.ListPrintersResponse>) responseObserver);
          break;
        case METHODID_PRINT:
          serviceImpl.print((com.hubstore.print.v1.PrintRequest) request,
              (io.grpc.stub.StreamObserver<com.hubstore.print.v1.PrintResponse>) responseObserver);
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
          getListPrintersMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.hubstore.print.v1.ListPrintersRequest,
              com.hubstore.print.v1.ListPrintersResponse>(
                service, METHODID_LIST_PRINTERS)))
        .addMethod(
          getPrintMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              com.hubstore.print.v1.PrintRequest,
              com.hubstore.print.v1.PrintResponse>(
                service, METHODID_PRINT)))
        .build();
  }

  private static abstract class PrintServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoFileDescriptorSupplier, io.grpc.protobuf.ProtoServiceDescriptorSupplier {
    PrintServiceBaseDescriptorSupplier() {}

    @java.lang.Override
    public com.google.protobuf.Descriptors.FileDescriptor getFileDescriptor() {
      return com.hubstore.print.v1.Print.getDescriptor();
    }

    @java.lang.Override
    public com.google.protobuf.Descriptors.ServiceDescriptor getServiceDescriptor() {
      return getFileDescriptor().findServiceByName("PrintService");
    }
  }

  private static final class PrintServiceFileDescriptorSupplier
      extends PrintServiceBaseDescriptorSupplier {
    PrintServiceFileDescriptorSupplier() {}
  }

  private static final class PrintServiceMethodDescriptorSupplier
      extends PrintServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoMethodDescriptorSupplier {
    private final java.lang.String methodName;

    PrintServiceMethodDescriptorSupplier(java.lang.String methodName) {
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
      synchronized (PrintServiceGrpc.class) {
        result = serviceDescriptor;
        if (result == null) {
          serviceDescriptor = result = io.grpc.ServiceDescriptor.newBuilder(SERVICE_NAME)
              .setSchemaDescriptor(new PrintServiceFileDescriptorSupplier())
              .addMethod(getListPrintersMethod())
              .addMethod(getPrintMethod())
              .build();
        }
      }
    }
    return result;
  }
}
