package com.hubstore.fulfillment;

import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.SimpleTransactionStatus;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * TransactionTemplate no-op cho unit tests construct FulfillmentServiceImpl bằng
 * tay (inmemory — mirror noopTransactionManager trong CodRepositoryConfig:
 * getTransaction trả status mới, commit/rollback không làm gì).
 */
public final class TestTx {

    private TestTx() {
    }

    public static TransactionTemplate noop() {
        return new TransactionTemplate(new PlatformTransactionManager() {
            @Override
            public TransactionStatus getTransaction(TransactionDefinition definition) {
                return new SimpleTransactionStatus();
            }

            @Override
            public void commit(TransactionStatus status) {
                // no-op
            }

            @Override
            public void rollback(TransactionStatus status) {
                // no-op
            }
        });
    }
}
