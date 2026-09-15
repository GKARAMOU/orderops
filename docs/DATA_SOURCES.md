# Data provenance

## Public retail benchmark

**Chen, D. (2015). Online Retail [Dataset]. UCI Machine Learning Repository.**
DOI: https://doi.org/10.24432/C5BW33
Source: https://archive.ics.uci.edu/dataset/352/online+retail
License: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).

`uci-22423-daily.csv` is an adaptation of that dataset, not original OrderOps sales.
The script `scripts/prepare_uci_data.py` scans 541,909 source records, retains 2,017
positive-quantity, positive-price, non-cancelled invoice lines for stock code 22423
(REGENCY CAKESTAND 3 TIER), then aggregates units across countries into 374 consecutive
calendar days from 2010-12-01 to 2011-12-09. Dates without retained sales are filled with zero.
Customer identifiers, invoice identifiers and prices are not exported.
The original workbook and ZIP remain outside version control in `.local/`.
`uci-provenance.json` includes the downloaded ZIP checksum and transformations.

This series measures gross recorded sales, not latent demand. Returns are excluded;
stockouts are unobserved; the last calendar day may be incomplete. The dates are old.
Predictions following this series are historical demonstrations, not current forecasts.
The forecast API explicitly returns `staleHistory: true` for this benchmark.

## Synthetic walkthrough

`synthetic-sales-example.csv`, the optional `seed_demo.py` catalog, warehouse stock,
customer names and purchases are intentionally fabricated walkthrough inputs.
The data source is labeled **SYNTHETIC walkthrough data; not real business sales**
in the API and interface. Those inputs pass through the same PostgreSQL persistence,
transaction logic and forecasting pipeline as user-entered records.
They are not evidence of business impact, customer adoption or model generalization.

## User-entered data

The application starts empty except for its configured administrator. History uploads
must name their source and contain daily observations before today. Uploads replace
matching product/warehouse/date records and create an audit entry. Recorded fulfillment
units are added as current operational history; import dates cannot overlap fulfilled orders.
