# Explain and demonstrate OrderOps

1. Start with the business invariant: available units equal on-hand minus reserved.
2. Show a product and its stock. Create an order, inspect its lines, and demonstrate the reservation.
3. Cancel the order and show the released stock. Create a second order and fulfill it.
4. Show `concurrentBuyersCannotOversell`: eight callers compete for one item, exactly one succeeds.
5. Explain the order idempotency key and why disabling a UI button alone cannot prevent duplicates.
6. Demonstrate a supplier purchase receipt and a second receipt request with no extra stock movement.
7. Show the audit trail and persisted notifications. Explain transaction boundaries and retry behavior.
8. Sign in as VIEWER and explain that the API also rejects writes, independently of the UI.
9. Import the attributed UCI CSV and run a forecast. Explain its historical dates, validation split,
   baseline, MAE and why the selected method is not always the machine-learning model.
10. Explain current limitations honestly using the README scope section.

Before presenting the project as a personal skill, read the service and tests, run the
workflows, and make a change you can explain. Development used AI assistance; repository
ownership should not be confused with unaided authorship or professional employment.
