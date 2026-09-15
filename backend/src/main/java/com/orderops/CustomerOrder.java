package com.orderops;

import jakarta.persistence.*;

@Entity
@Table(name = "customer_order")
public class CustomerOrder {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  public Long id;

  @com.fasterxml.jackson.annotation.JsonIgnore public String requestKey;
  @com.fasterxml.jackson.annotation.JsonIgnore public String fingerprint;
  public String customer;
  public Long warehouseId;
  public String status;
  public java.time.Instant createdAt;
  public java.time.Instant fulfilledAt;
}
