# Verification record

Local verification completed on 15 September 2026 using macOS ARM64, Java 21.0.4,
PostgreSQL 17.11, Python 3.12 and Chromium via Playwright. The database was real
PostgreSQL, not an in-memory replacement.

| Suite | Result | Scope |
| --- | --- | --- |
| Backend integration | 18 passed, 0 skipped | Transactions, contention, idempotency, rollback, order/purchase transitions, authentication, authorization, validation, outbox and insufficient-history behavior |
| Forecast service | 5 passed | Seven-day inference, baseline selection, gaps, duplicates, insufficient history and zero demand |
| Browser workflows | 5 passed | Catalog/stock/order fulfillment, purchase receipt persistence after reload, live model inference, read-only role and mobile layout |
| Frontend production build | Passed | TypeScript compilation and Vite bundle |

The contention scenario starts eight concurrent buyers for one available unit and
asserts exactly one successful reservation. A separate six-request concurrent replay
scenario asserts one order ID and one reservation. These are correctness scenarios,
not a throughput benchmark or evidence of production scale.

The browser receipt test verifies persistence after browser reload. PostgreSQL is configured
with a durable local directory or Docker volume. No disaster recovery or power-loss test
has been performed.

## Reproducible public-data experiment

UCI Online Retail, stock 22423: 374 consecutive daily observations, 360 days before
validation and 14 held-out days. Random Forest MAE: **29.448 units/day**. Seasonal-naive
MAE: **32.857 units/day**. The lower-error method is selected for subsequent predictions.
See `forecast-evaluation.json`, `uci-provenance.json` and `DATA_SOURCES.md`.

The holdout is also used for method selection; this is a validation comparison for one
series, not an independent test estimate or business-impact measurement.

## CI boundary

GitHub Actions separately runs Testcontainers-based backend verification, forecast tests
and a full Docker Compose build plus browser tests. The workflow badge and run logs are
the authoritative record for container/CI status; local checks alone do not establish it.
