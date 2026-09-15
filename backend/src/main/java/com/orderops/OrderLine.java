package com.orderops;

import jakarta.persistence.*;

@Entity
@Table(name = "order_line")
public class OrderLine {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  public Long id;

  public Long orderId;
  public Long productId;
  public int quantity;
  public java.math.BigDecimal unitPrice;
}
