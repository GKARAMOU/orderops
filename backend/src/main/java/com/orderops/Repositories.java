package com.orderops;

import jakarta.persistence.LockModeType;
import java.util.*;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

interface ProductRepository extends JpaRepository<Product, Long> {}

interface WarehouseRepository extends JpaRepository<Warehouse, Long> {}

interface InventoryRepository extends JpaRepository<Inventory, Long> {
  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select i from Inventory i where i.productId=:p and i.warehouseId=:w")
  Optional<Inventory> lock(@Param("p") Long product, @Param("w") Long warehouse);
}

interface OrderRepository extends JpaRepository<CustomerOrder, Long> {
  Optional<CustomerOrder> findByRequestKey(String key);

  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select o from CustomerOrder o where o.id=:id")
  Optional<CustomerOrder> lock(@Param("id") Long id);
}

interface LineRepository extends JpaRepository<OrderLine, Long> {
  List<OrderLine> findByOrderIdOrderByProductId(Long id);
}

interface PurchaseRepository extends JpaRepository<PurchaseOrder, Long> {
  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select p from PurchaseOrder p where p.id=:id")
  Optional<PurchaseOrder> lock(@Param("id") Long id);
}
