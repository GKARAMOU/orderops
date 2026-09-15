package com.orderops;

import static org.springframework.http.HttpStatus.*;

import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional
public class OperationsService {
  private final ProductRepository products;
  private final WarehouseRepository warehouses;
  private final InventoryRepository inventory;
  private final OrderRepository orders;
  private final LineRepository lines;
  private final PurchaseRepository purchases;
  private final JdbcTemplate db;

  public OperationsService(
      ProductRepository p,
      WarehouseRepository w,
      InventoryRepository i,
      OrderRepository o,
      LineRepository l,
      PurchaseRepository pu,
      JdbcTemplate db) {
    products = p;
    warehouses = w;
    inventory = i;
    orders = o;
    lines = l;
    purchases = pu;
    this.db = db;
  }

  private ResponseStatusException missing() {
    return new ResponseStatusException(NOT_FOUND, "Record not found");
  }

  private void guard(boolean condition, String message) {
    if (!condition) throw new ResponseStatusException(CONFLICT, message);
  }

  private void audit(String actor, String action, String type, long id, String details) {
    db.update(
        "INSERT INTO audit_event(actor,action,entity_type,entity_id,details,created_at)"
            + " VALUES(?,?,?,?,?,?)",
        actor,
        action,
        type,
        id,
        details,
        java.sql.Timestamp.from(Instant.now()));
  }

  private void event(String type, String payload) {
    db.update(
        "INSERT INTO outbox_event(event_type,payload,next_attempt_at)"
            + " VALUES(?,?,CURRENT_TIMESTAMP)",
        type,
        payload);
  }

  // Transaction-scoped PostgreSQL locks serialize identical keys, even before a row exists.
  private void advisory(String key) {
    db.query("SELECT pg_advisory_xact_lock(hashtextextended(?,0))", rs -> {}, key);
  }

  private Inventory stock(long p, long w) {
    if (!products.existsById(p) || !warehouses.existsById(w)) throw missing();
    db.update(
        "INSERT INTO inventory(product_id,warehouse_id) VALUES(?,?) ON"
            + " CONFLICT(product_id,warehouse_id) DO NOTHING",
        p,
        w);
    return inventory.lock(p, w).orElseThrow(this::missing);
  }

  public Product product(Requests.ProductInput input, String actor) {
    var p = new Product();
    p.sku = input.sku().strip();
    p.name = input.name().strip();
    p.price = input.price();
    products.saveAndFlush(p);
    audit(actor, "PRODUCT_CREATED", "PRODUCT", p.id, p.sku);
    return p;
  }

  public Warehouse warehouse(Requests.WarehouseInput input, String actor) {
    var w = new Warehouse();
    w.name = input.name().strip();
    warehouses.saveAndFlush(w);
    audit(actor, "WAREHOUSE_CREATED", "WAREHOUSE", w.id, w.name);
    return w;
  }

  public Inventory adjust(Requests.StockInput input, String actor) {
    var s = stock(input.productId(), input.warehouseId());
    guard(input.onHand() >= s.reserved, "Stock cannot be lower than reserved units");
    int before = s.onHand;
    s.onHand = input.onHand();
    audit(
        actor,
        "STOCK_ADJUSTED",
        "INVENTORY",
        s.id,
        before + " -> " + s.onHand + "; " + input.reason());
    return s;
  }

  public CustomerOrder order(Requests.OrderInput input, String key, String actor) {
    if (key == null || !key.matches("[A-Za-z0-9_-]{8,80}"))
      throw new ResponseStatusException(
          BAD_REQUEST,
          "Provide an Idempotency-Key of 8-80 letters, digits, underscores or hyphens");
    var items =
        input.items().stream().sorted(Comparator.comparing(Requests.Item::productId)).toList();
    guard(
        items.stream().map(Requests.Item::productId).distinct().count() == items.size(),
        "Each product may appear once per order");
    String fingerprint =
        input.customer().strip() + "|" + input.warehouseId() + "|" + items.toString();
    String scoped = actor + ":" + key;
    // Hash the scoped key so its stored length is bounded independently of email length.
    try {
      scoped =
          HexFormat.of()
              .formatHex(
                  java.security.MessageDigest.getInstance("SHA-256")
                      .digest(scoped.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
    } catch (java.security.NoSuchAlgorithmException e) {
      throw new IllegalStateException(e);
    }
    advisory("order:" + scoped);
    var previous = orders.findByRequestKey(scoped);
    if (previous.isPresent()) {
      guard(
          previous.get().fingerprint.equals(fingerprint),
          "Idempotency key already used with a different order");
      return previous.get();
    }
    var o = new CustomerOrder();
    o.requestKey = scoped;
    o.fingerprint = fingerprint;
    o.customer = input.customer().strip();
    o.warehouseId = input.warehouseId();
    o.status = "RESERVED";
    o.createdAt = Instant.now();
    // Always lock products in ID order to prevent deadlocks between multi-line orders.
    for (var item : items) {
      var s = stock(item.productId(), input.warehouseId());
      guard(
          s.onHand - s.reserved >= item.quantity(),
          "Insufficient available stock for product " + item.productId());
      s.reserved += item.quantity();
    }
    orders.saveAndFlush(o);
    for (var item : items) {
      var line = new OrderLine();
      line.orderId = o.id;
      line.productId = item.productId();
      line.quantity = item.quantity();
      line.unitPrice = products.findById(item.productId()).orElseThrow(this::missing).price;
      lines.save(line);
    }
    audit(actor, "ORDER_RESERVED", "ORDER", o.id, items.size() + " line(s)");
    event("ORDER_RESERVED", "Order #" + o.id + " reserved for " + o.customer);
    return o;
  }

  public CustomerOrder transition(long id, String action, String actor) {
    var o = orders.lock(id).orElseThrow(this::missing);
    String target =
        switch (action) {
          case "fulfill" -> "FULFILLED";
          case "cancel" -> "CANCELLED";
          default -> throw new ResponseStatusException(BAD_REQUEST, "Unknown transition");
        };
    if (o.status.equals(target)) return o;
    guard(o.status.equals("RESERVED"), "Only reserved orders can be fulfilled or cancelled");
    for (var line : lines.findByOrderIdOrderByProductId(id)) {
      var s = stock(line.productId, o.warehouseId);
      s.reserved -= line.quantity;
      if (target.equals("FULFILLED")) s.onHand -= line.quantity;
    }
    o.status = target;
    if (target.equals("FULFILLED")) o.fulfilledAt = Instant.now();
    audit(actor, "ORDER_" + target, "ORDER", id, target);
    event("ORDER_" + target, "Order #" + id + " " + target.toLowerCase(Locale.ROOT));
    return o;
  }

  public PurchaseOrder purchase(Requests.PurchaseInput input, String actor) {
    if (!products.existsById(input.productId()) || !warehouses.existsById(input.warehouseId()))
      throw missing();
    var p = new PurchaseOrder();
    p.supplier = input.supplier().strip();
    p.productId = input.productId();
    p.warehouseId = input.warehouseId();
    p.quantity = input.quantity();
    p.status = "OPEN";
    p.createdAt = Instant.now();
    purchases.saveAndFlush(p);
    audit(actor, "PURCHASE_CREATED", "PURCHASE", p.id, p.supplier);
    return p;
  }

  public PurchaseOrder purchaseTransition(long id, String action, String actor) {
    var p = purchases.lock(id).orElseThrow(this::missing);
    String target =
        switch (action) {
          case "receive" -> "RECEIVED";
          case "cancel" -> "CANCELLED";
          default -> throw new ResponseStatusException(BAD_REQUEST, "Unknown transition");
        };
    if (p.status.equals(target)) return p;
    guard(p.status.equals("OPEN"), "Purchase is already closed");
    if (target.equals("RECEIVED")) {
      var s = stock(p.productId, p.warehouseId);
      guard((long) s.onHand + p.quantity <= 1000000, "Stock limit exceeded");
      s.onHand += p.quantity;
    }
    p.status = target;
    audit(actor, "PURCHASE_" + target, "PURCHASE", id, p.quantity + " units");
    event("PURCHASE_" + target, "Purchase #" + id + " " + target.toLowerCase(Locale.ROOT));
    return p;
  }
}
