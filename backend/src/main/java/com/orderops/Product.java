package com.orderops;

import jakarta.persistence.*;

@Entity
@Table(name = "product")
public class Product {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  public Long id;

  public String sku;
  public String name;
  public java.math.BigDecimal price;
}
