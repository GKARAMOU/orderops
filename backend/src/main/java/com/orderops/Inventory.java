package com.orderops;

import jakarta.persistence.*;

@Entity
@Table(name = "inventory")
public class Inventory {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  public Long id;

  public Long productId;
  public Long warehouseId;
  public int onHand;
  public int reserved;
}
