package com.orderops;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;

@SpringBootTest
@AutoConfigureMockMvc
class OperationsIntegrationTest {
  static PostgreSQLContainer<?> pg;

  @DynamicPropertySource
  static void props(DynamicPropertyRegistry r) {
    String external = System.getenv("TEST_DATABASE_URL");
    if (external == null) {
      pg = new PostgreSQLContainer<>("postgres:17-alpine");
      pg.start();
      r.add("spring.datasource.url", pg::getJdbcUrl);
      r.add("spring.datasource.username", pg::getUsername);
      r.add("spring.datasource.password", pg::getPassword);
    } else {
      r.add("spring.datasource.url", () -> external);
      r.add("spring.datasource.username", () -> System.getenv("TEST_DATABASE_USER"));
      r.add("spring.datasource.password", () -> System.getenv("TEST_DATABASE_PASSWORD"));
    }
    r.add("orderops.jwt-secret", () -> "test-only-secret-with-at-least-thirty-two-bytes");
    r.add("orderops.bootstrap-password", () -> "test-only-admin-password");
    r.add("orderops.bootstrap-email", () -> "admin@orderops.local");
    r.add("orderops.outbox-delay", () -> 3600000);
  }

  @Autowired OperationsService service;
  @Autowired JdbcTemplate db;
  @Autowired MockMvc mvc;
  @Autowired OutboxWorker worker;
  @Autowired ObjectMapper mapper;
  long product, warehouse;

  @BeforeEach
  void setup() {
    db.execute(
        "TRUNCATE"
            + " notification,outbox_event,audit_event,demand_history,order_line,customer_order,purchase_order,inventory,product,warehouse"
            + " RESTART IDENTITY CASCADE");
    product =
        service.product(
                new Requests.ProductInput("TEST-SKU", "Test product", new BigDecimal("12.50")),
                "test")
            .id;
    warehouse = service.warehouse(new Requests.WarehouseInput("Test warehouse"), "test").id;
    stock(10);
  }

  void stock(int n) {
    service.adjust(new Requests.StockInput(product, warehouse, n, "Test setup"), "test");
  }

  Requests.OrderInput input(int q) {
    return new Requests.OrderInput(
        "Test customer", warehouse, List.of(new Requests.Item(product, q)));
  }

  int number(String col) {
    return db.queryForObject(
        "SELECT " + col + " FROM inventory WHERE product_id=? AND warehouse_id=?",
        Integer.class,
        product,
        warehouse);
  }

  @Test
  void lifecycleReservesThenFulfillsExactlyOnce() {
    var o = service.order(input(3), "lifecycle-key", "test");
    assertEquals(3, number("reserved"));
    assertEquals(10, number("on_hand"));
    service.transition(o.id, "fulfill", "test");
    service.transition(o.id, "fulfill", "test");
    assertEquals(0, number("reserved"));
    assertEquals(7, number("on_hand"));
    assertThrows(Exception.class, () -> service.transition(o.id, "cancel", "test"));
  }

  @Test
  void cancellationReleasesReservationExactlyOnce() {
    var o = service.order(input(4), "cancel-key", "test");
    service.transition(o.id, "cancel", "test");
    service.transition(o.id, "cancel", "test");
    assertEquals(10, number("on_hand"));
    assertEquals(0, number("reserved"));
  }

  @Test
  void identicalRequestReturnsSameOrder() {
    var first = service.order(input(2), "duplicate-key", "test");
    var second = service.order(input(2), "duplicate-key", "test");
    assertEquals(first.id, second.id);
    assertEquals(2, number("reserved"));
  }

  @Test
  void changedPayloadCannotReuseKey() {
    service.order(input(2), "duplicate-key", "test");
    assertThrows(Exception.class, () -> service.order(input(3), "duplicate-key", "test"));
    assertEquals(2, number("reserved"));
  }

  @Test
  void multiLineFailureRollsBackAllChanges() {
    long second =
        service.product(new Requests.ProductInput("SKU-2", "Second", BigDecimal.ONE), "test").id;
    var request =
        new Requests.OrderInput(
            "Customer",
            warehouse,
            List.of(new Requests.Item(product, 3), new Requests.Item(second, 1)));
    assertThrows(Exception.class, () -> service.order(request, "rollback-key", "test"));
    assertEquals(0, number("reserved"));
    assertEquals(0, db.queryForObject("SELECT count(*) FROM customer_order", Integer.class));
    assertEquals(0, db.queryForObject("SELECT count(*) FROM outbox_event", Integer.class));
  }

  @Test
  void adjustmentProtectsReservedStock() {
    service.order(input(4), "protect-key", "test");
    assertThrows(Exception.class, () -> stock(3));
    assertEquals(10, number("on_hand"));
  }

  @Test
  void purchaseReceiptAddsStockOnce() {
    var p = service.purchase(new Requests.PurchaseInput("Supplier", product, warehouse, 8), "test");
    service.purchaseTransition(p.id, "receive", "test");
    service.purchaseTransition(p.id, "receive", "test");
    assertEquals(18, number("on_hand"));
  }

  @Test
  void cancelledPurchaseCannotBeReceived() {
    var p = service.purchase(new Requests.PurchaseInput("Supplier", product, warehouse, 8), "test");
    service.purchaseTransition(p.id, "cancel", "test");
    assertThrows(Exception.class, () -> service.purchaseTransition(p.id, "receive", "test"));
    assertEquals(10, number("on_hand"));
  }

  @Test
  void concurrentBuyersCannotOversell() throws Exception {
    stock(1);
    try (var pool = Executors.newFixedThreadPool(8)) {
      var gate = new CountDownLatch(1);
      var tasks = new ArrayList<Future<Boolean>>();
      for (int i = 0; i < 8; i++) {
        final int n = i;
        tasks.add(
            pool.submit(
                () -> {
                  gate.await();
                  try {
                    service.order(input(1), "concurrent-" + n, "test");
                    return true;
                  } catch (Exception e) {
                    return false;
                  }
                }));
      }
      gate.countDown();
      int successes = 0;
      for (var f : tasks) if (f.get(20, TimeUnit.SECONDS)) successes++;
      assertEquals(1, successes);
      assertEquals(1, number("reserved"));
    }
  }

  @Test
  void concurrentDuplicateRequestsShareOneOrder() throws Exception {
    try (var pool = Executors.newFixedThreadPool(6)) {
      var tasks = new ArrayList<Future<Long>>();
      for (int i = 0; i < 6; i++)
        tasks.add(pool.submit(() -> service.order(input(1), "same-concurrent-key", "test").id));
      var ids = new HashSet<Long>();
      for (var f : tasks) ids.add(f.get(20, TimeUnit.SECONDS));
      assertEquals(1, ids.size());
      assertEquals(1, number("reserved"));
    }
  }

  @Test
  void outboxDeliveryDoesNotDuplicateNotifications() {
    service.order(input(2), "event-key", "test");
    worker.deliver();
    worker.deliver();
    assertEquals(1, db.queryForObject("SELECT count(*) FROM notification", Integer.class));
    assertEquals(
        0,
        db.queryForObject(
            "SELECT count(*) FROM outbox_event WHERE delivered_at IS NULL", Integer.class));
  }

  @Test
  void unauthenticatedRequestsRejected() throws Exception {
    mvc.perform(get("/api/inventory")).andExpect(status().isUnauthorized());
  }

  @Test
  void viewerCannotMutate() throws Exception {
    mvc.perform(
            post("/api/warehouses")
                .with(jwt().authorities(new SimpleGrantedAuthority("ROLE_VIEWER")))
                .contentType("application/json")
                .content("{\"name\":\"Forbidden\"}"))
        .andExpect(status().isForbidden());
  }

  @Test
  void operatorCannotCreateUsers() throws Exception {
    mvc.perform(
            post("/api/users")
                .with(jwt().authorities(new SimpleGrantedAuthority("ROLE_OPERATOR")))
                .contentType("application/json")
                .content(
                    "{\"email\":\"other@example.com\",\"password\":\"long-password-123\",\"role\":\"ADMIN\"}"))
        .andExpect(status().isForbidden());
  }

  @Test
  void realLoginIssuesWorkingToken() throws Exception {
    var response =
        mvc.perform(
                post("/api/auth/login")
                    .contentType("application/json")
                    .content(
                        "{\"email\":\"admin@orderops.local\",\"password\":\"test-only-admin-password\"}"))
            .andExpect(status().isOk())
            .andReturn();
    var token = mapper.readTree(response.getResponse().getContentAsString()).get("token").asText();
    mvc.perform(get("/api/dashboard").header("Authorization", "Bearer " + token))
        .andExpect(status().isOk());
  }

  @Test
  void invalidPasswordRejected() throws Exception {
    mvc.perform(
            post("/api/auth/login")
                .contentType("application/json")
                .content("{\"email\":\"admin@orderops.local\",\"password\":\"wrong\"}"))
        .andExpect(status().isUnauthorized());
  }

  @Test
  void negativeQuantityRejected() throws Exception {
    mvc.perform(
            post("/api/orders")
                .with(jwt().authorities(new SimpleGrantedAuthority("ROLE_OPERATOR")))
                .header("Idempotency-Key", "invalid-quantity")
                .contentType("application/json")
                .content(
                    "{\"customer\":\"Test\",\"warehouseId\":"
                        + warehouse
                        + ",\"items\":[{\"productId\":"
                        + product
                        + ",\"quantity\":-1}]}"))
        .andExpect(status().isBadRequest());
  }

  @Test
  void missingHistoryDoesNotInventForecast() throws Exception {
    mvc.perform(
            get("/api/forecast")
                .param("productId", "" + product)
                .param("warehouseId", "" + warehouse)
                .with(jwt()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("insufficient_data"));
  }
}
