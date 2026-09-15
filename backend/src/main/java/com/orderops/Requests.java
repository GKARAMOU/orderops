package com.orderops;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.util.List;

public class Requests {
  public record ProductInput(
      @NotBlank @Size(max = 60) String sku,
      @NotBlank @Size(max = 160) String name,
      @NotNull @DecimalMin("0.00") @DecimalMax("9999999999.99") @Digits(integer = 10, fraction = 2)
          BigDecimal price) {}

  public record WarehouseInput(@NotBlank @Size(max = 120) String name) {}

  public record StockInput(
      @NotNull @Positive Long productId,
      @NotNull @Positive Long warehouseId,
      @Min(0) @Max(1000000) int onHand,
      @NotBlank @Size(max = 500) String reason) {}

  public record Item(@NotNull @Positive Long productId, @Min(1) @Max(100000) int quantity) {}

  public record OrderInput(
      @NotBlank @Size(max = 160) String customer,
      @NotNull @Positive Long warehouseId,
      @NotEmpty @Size(max = 50) List<@Valid Item> items) {}

  public record PurchaseInput(
      @NotBlank @Size(max = 160) String supplier,
      @NotNull @Positive Long productId,
      @NotNull @Positive Long warehouseId,
      @Min(1) @Max(100000) int quantity) {}

  public record Login(@NotBlank @Email String email, @NotBlank @Size(max = 72) String password) {}

  public record UserInput(
      @NotBlank @Email @Size(max = 254) String email,
      @Size(min = 12, max = 72) @NotNull String password,
      @Pattern(regexp = "ADMIN|OPERATOR|VIEWER") @NotNull String role) {}
}
