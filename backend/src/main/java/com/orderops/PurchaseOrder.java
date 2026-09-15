package com.orderops;

import jakarta.persistence.*;

@Entity
@Table(name = "purchase_order")
public class PurchaseOrder {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  public Long id;

  public String supplier;
  public Long productId;
  public Long warehouseId;
  public int quantity;
  public String status;
  public java.time.Instant createdAt;
}
