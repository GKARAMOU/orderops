# Architecture and engineering decisions

## 1. One transactional backend

Catalog, warehouse inventory, orders and purchasing share PostgreSQL. A service-level
transaction keeps their invariants together. Separating these into network services would
introduce distributed consistency without a requirement that justifies that cost.
The forecasting service is separate because its Python scientific runtime and read-only
computation have a different lifecycle.

Controllers validate request records and enforce roles. `OperationsService` owns mutations.
JPA maps domain records and obtains locks; explicit SQL supplies aggregate read models,
the outbox and audit records. Flyway owns the schema; Hibernate validates it at startup.

## 2. Reservation state machine

An order starts RESERVED and may transition to FULFILLED or CANCELLED. Fulfillment
subtracts the quantity from both on-hand and reserved. Cancellation only releases reserved.
Repeated requests for the current terminal state return the existing result. Switching
between terminal states is rejected. Inventory checks enforce `0 <= reserved <= on_hand`
in both business logic and PostgreSQL constraints.

Order creation sorts product IDs and locks inventory in that order. All lines commit
together. Missing inventory rows are inserted with `ON CONFLICT DO NOTHING` before locking.
A concurrent insert waits for the competing transaction, then the pessimistic read sees
the committed row. The integration tests exercise concurrent orders on an existing row.

## 3. Idempotency before the row exists

The server hashes actor identity plus request key to get a bounded stored key. A PostgreSQL
transaction-scoped advisory lock serializes matching keys before an order row exists.
The stored normalized payload fingerprint detects reuse with different content.
A unique database constraint is the final guard. A collision in the advisory hash could
serialize unrelated requests but would not merge them because their stored keys differ.
Keys are not expired in this version.

## 4. Durable internal events

Mutations append an outbox event in their transaction. A scheduled worker claims pending
rows with `FOR UPDATE SKIP LOCKED`, inserts an inbox notification, and acknowledges the
outbox row in one transaction. A unique `notification.event_id` prevents duplicate delivery.
A failed transaction leaves the event pending for the next poll. This implementation targets
an internal database consumer; it does not claim exactly-once network delivery.

## 5. Authentication boundary

Passwords use BCrypt. JWTs contain issuer, subject, issue/expiry time and a role claim.
Spring Security verifies signature, issuer and expiry. Each mutating controller method
checks roles on the server; hiding buttons is only a usability layer. The app is one shared
workspace: users see the same business records. There is no tenant isolation claim.

## 6. Forecast boundary and limitations

The Java API sends stored daily units to a Python service with connection and read timeouts.
Operations remain available if forecasting fails. The model needs consecutive daily data
and reports missing history instead of zero-filling unknown omissions silently.
Historical imports explicitly include zero-sale dates and source attribution.

A 14-day holdout compares recursive Random Forest inference against a seasonal-naive
baseline. Selection happens on the same holdout, so scores are validation metrics.
There is no independent final test set, multi-product benchmark, stockout adjustment or
confidence interval yet. The public benchmark is one old retail series and cannot establish
commercial performance.

## 7. Delivery

Docker builds React and bundles its static output into the Java app. Compose connects
that app to PostgreSQL and the Python service. GitHub Actions runs tests before repository
changes can be assessed as green. No automatic public hosting or cloud provisioning occurs.
