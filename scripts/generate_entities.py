# Development helper retained for reproducibility; entity files are normal Java sources.
from pathlib import Path
base=Path(__file__).resolve().parents[1]/'backend/src/main/java/com/orderops'
entities={
'Product':('product','public String sku; public String name; public java.math.BigDecimal price;'),
'Warehouse':('warehouse','public String name;'),
'Inventory':('inventory','public Long productId; public Long warehouseId; public int onHand; public int reserved;'),
'CustomerOrder':('customer_order','@com.fasterxml.jackson.annotation.JsonIgnore public String requestKey; @com.fasterxml.jackson.annotation.JsonIgnore public String fingerprint; public String customer; public Long warehouseId; public String status; public java.time.Instant createdAt;'),
'OrderLine':('order_line','public Long orderId; public Long productId; public int quantity; public java.math.BigDecimal unitPrice;'),
'PurchaseOrder':('purchase_order','public String supplier; public Long productId; public Long warehouseId; public int quantity; public String status; public java.time.Instant createdAt;'),
}
for name,(table,fields) in entities.items():
 (base/f'{name}.java').write_text(f'package com.orderops;\nimport jakarta.persistence.*;\n@Entity @Table(name="{table}")\npublic class {name} {{\n @Id @GeneratedValue(strategy=GenerationType.IDENTITY) public Long id;\n {fields}\n}}\n')
