package com.hubstore.fulfillment.service;

import io.grpc.Context;
import io.grpc.Contexts;
import io.grpc.Metadata;
import io.grpc.ServerCall;
import io.grpc.ServerCallHandler;
import io.grpc.ServerInterceptor;
import net.devh.boot.grpc.server.interceptor.GrpcGlobalServerInterceptor;

/**
 * Đọc actor từ metadata "x-user-name" (BFF gửi) vào io.grpc.Context — RPC đọc
 * qua {@link #currentActor()}. Metadata trống/thiếu → "unknown" (audit vẫn có
 * dòng, không NPE). gRPC metadata chỉ ASCII-lowercase nên key "x-user-name"
 * khớp ASCII_STRING_MARSHALLER.
 */
@GrpcGlobalServerInterceptor
public class ActorInterceptor implements ServerInterceptor {

    public static final Metadata.Key<String> USER_NAME_METADATA =
            Metadata.Key.of("x-user-name", Metadata.ASCII_STRING_MARSHALLER);

    private static final Context.Key<String> ACTOR_CONTEXT_KEY = Context.key("x-actor");

    @Override
    public <ReqT, RespT> ServerCall.Listener<ReqT> interceptCall(ServerCall<ReqT, RespT> call,
                                                                 Metadata headers,
                                                                 ServerCallHandler<ReqT, RespT> next) {
        String actor = headers.get(USER_NAME_METADATA);
        Context ctx = Context.current().withValue(ACTOR_CONTEXT_KEY,
                actor == null || actor.isBlank() ? "unknown" : actor.trim());
        return Contexts.interceptCall(ctx, call, headers, next);
    }

    /** Actor của RPC đang chạy; ngoài gRPC context (unit test) → "unknown". */
    public static String currentActor() {
        String actor = ACTOR_CONTEXT_KEY.get();
        return actor == null || actor.isBlank() ? "unknown" : actor;
    }
}
