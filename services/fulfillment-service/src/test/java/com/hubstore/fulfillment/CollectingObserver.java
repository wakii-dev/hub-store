package com.hubstore.fulfillment;

import io.grpc.stub.StreamObserver;

import java.util.ArrayList;
import java.util.List;

/** Observer gom kết quả — test gọi service method trực tiếp (không cần network). */
public final class CollectingObserver<T> implements StreamObserver<T> {

    public final List<T> values = new ArrayList<>();
    public Throwable error;
    public boolean completed;

    @Override
    public void onNext(T value) {
        values.add(value);
    }

    @Override
    public void onError(Throwable t) {
        this.error = t;
    }

    @Override
    public void onCompleted() {
        this.completed = true;
    }
}
