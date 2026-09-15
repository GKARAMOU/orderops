package com.orderops;

import jakarta.persistence.*;

@Entity
@Table(name = "warehouse")
public class Warehouse {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  public Long id;

  public String name;
}
