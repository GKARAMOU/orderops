package com.orderops;

import jakarta.validation.Valid;
import java.util.*;
import org.springframework.data.domain.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class OperationsController {
  private final OperationsService service;
  private final ProductRepository products;
  private final WarehouseRepository warehouses;
  private final JdbcTemplate db;

  public OperationsController(
      OperationsService s, ProductRepository p, WarehouseRepository w, JdbcTemplate d) {
    service = s;
    products = p;
    warehouses = w;
    db = d;
  }

  @GetMapping("/products")
  public List<Product> products() {
    return products.findAll(Sort.by("id"));
  }

  @GetMapping("/warehouses")
  public List<Warehouse> warehouses() {
    return warehouses.findAll(Sort.by("id"));
  }

  @GetMapping("/inventory")
  public List<Map<String, Object>> inventory() {
    return db.queryForList(
        "SELECT i.id,i.product_id,i.warehouse_id,p.sku,p.name,w.name"
            + " warehouse,i.on_hand,i.reserved,i.on_hand-i.reserved available,p.price FROM"
            + " inventory i JOIN product p ON p.id=i.product_id JOIN warehouse w ON"
            + " w.id=i.warehouse_id ORDER BY p.name,w.name");
  }

  @GetMapping("/orders")
  public List<Map<String, Object>> orders() {
    return db.queryForList(
        "SELECT o.id,o.customer,o.warehouse_id,w.name"
            + " warehouse,o.status,o.created_at,COALESCE(SUM(l.quantity*l.unit_price),0) total FROM"
            + " customer_order o JOIN warehouse w ON w.id=o.warehouse_id LEFT JOIN order_line l ON"
            + " l.order_id=o.id GROUP BY o.id,w.name ORDER BY o.id DESC LIMIT 500");
  }

  @GetMapping("/orders/{id}/lines")
  public List<Map<String, Object>> lines(@PathVariable long id) {
    return db.queryForList(
        "SELECT l.product_id,p.name,p.sku,l.quantity,l.unit_price FROM order_line l JOIN product p"
            + " ON p.id=l.product_id WHERE order_id=? ORDER BY l.id",
        id);
  }

  @GetMapping("/purchases")
  public List<Map<String, Object>> purchases() {
    return db.queryForList(
        "SELECT po.*,p.name product,w.name warehouse FROM purchase_order po JOIN product p ON"
            + " p.id=po.product_id JOIN warehouse w ON w.id=po.warehouse_id ORDER BY po.id DESC"
            + " LIMIT 500");
  }

  @GetMapping("/audit")
  public List<Map<String, Object>> audit() {
    return db.queryForList("SELECT * FROM audit_event ORDER BY id DESC LIMIT 200");
  }

  @GetMapping("/notifications")
  public List<Map<String, Object>> notifications() {
    return db.queryForList("SELECT * FROM notification ORDER BY id DESC LIMIT 50");
  }

  @GetMapping("/dashboard")
  public Map<String, Object> dashboard() {
    return db.queryForMap(
        "SELECT (SELECT count(*) FROM product) products,(SELECT COALESCE(sum(on_hand),0) FROM"
            + " inventory) units,(SELECT COALESCE(sum(reserved),0) FROM inventory) reserved,(SELECT"
            + " count(*) FROM customer_order WHERE status='RESERVED') open_orders,(SELECT"
            + " COALESCE(sum(l.quantity*l.unit_price),0) FROM order_line l JOIN customer_order o ON"
            + " o.id=l.order_id WHERE o.status='FULFILLED') fulfilled_value,(SELECT count(*) FROM"
            + " purchase_order WHERE status='OPEN') open_purchases,(SELECT count(*) FROM"
            + " outbox_event WHERE delivered_at IS NULL) pending_events");
  }

  @PreAuthorize("hasAnyRole('ADMIN','OPERATOR')")
  @PostMapping("/products")
  public Product product(@Valid @RequestBody Requests.ProductInput i, Authentication a) {
    return service.product(i, a.getName());
  }

  @PreAuthorize("hasAnyRole('ADMIN','OPERATOR')")
  @PostMapping("/warehouses")
  public Warehouse warehouse(@Valid @RequestBody Requests.WarehouseInput i, Authentication a) {
    return service.warehouse(i, a.getName());
  }

  @PreAuthorize("hasAnyRole('ADMIN','OPERATOR')")
  @PostMapping("/inventory/adjust")
  public Inventory adjust(@Valid @RequestBody Requests.StockInput i, Authentication a) {
    return service.adjust(i, a.getName());
  }

  @PreAuthorize("hasAnyRole('ADMIN','OPERATOR')")
  @PostMapping("/orders")
  public CustomerOrder order(
      @Valid @RequestBody Requests.OrderInput i,
      @RequestHeader(value = "Idempotency-Key", required = false) String key,
      Authentication a) {
    return service.order(i, key, a.getName());
  }

  @PreAuthorize("hasAnyRole('ADMIN','OPERATOR')")
  @PostMapping("/orders/{id}/{action}")
  public CustomerOrder transition(
      @PathVariable long id, @PathVariable String action, Authentication a) {
    return service.transition(id, action, a.getName());
  }

  @PreAuthorize("hasAnyRole('ADMIN','OPERATOR')")
  @PostMapping("/purchases")
  public PurchaseOrder purchase(@Valid @RequestBody Requests.PurchaseInput i, Authentication a) {
    return service.purchase(i, a.getName());
  }

  @PreAuthorize("hasAnyRole('ADMIN','OPERATOR')")
  @PostMapping("/purchases/{id}/{action}")
  public PurchaseOrder purchaseTransition(
      @PathVariable long id, @PathVariable String action, Authentication a) {
    return service.purchaseTransition(id, action, a.getName());
  }
}
