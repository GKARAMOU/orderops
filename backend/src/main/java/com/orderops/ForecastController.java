package com.orderops;

import static org.springframework.http.HttpStatus.*;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.time.LocalDate;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/forecast")
public class ForecastController {
  private final JdbcTemplate db;
  private final RestClient client;

  public ForecastController(JdbcTemplate db, @Value("${orderops.forecast-url}") String url) {
    this.db = db;
    var f = new SimpleClientHttpRequestFactory();
    f.setConnectTimeout(3000);
    f.setReadTimeout(30000);
    this.client = RestClient.builder().baseUrl(url).requestFactory(f).build();
  }

  public record Day(@NotNull @Past LocalDate day, @Min(0) @Max(100000) int units) {}

  public record History(
      @NotNull @Positive Long productId,
      @NotNull @Positive Long warehouseId,
      @NotBlank @Size(max = 200) String source,
      @NotEmpty @Size(max = 2000) List<@Valid Day> days) {}

  @PreAuthorize("hasAnyRole('ADMIN','OPERATOR')")
  @PostMapping("/history")
  @Transactional
  public Map<String, Object> history(@Valid @RequestBody History h, Authentication a) {
    if (h.days().stream().map(Day::day).distinct().count() != h.days().size())
      throw new ResponseStatusException(BAD_REQUEST, "Duplicate dates in upload");
    for (var d : h.days()) {
      var count =
          db.queryForObject(
              "SELECT count(*) FROM customer_order o JOIN order_line l ON l.order_id=o.id WHERE"
                  + " o.status='FULFILLED' AND o.warehouse_id=? AND l.product_id=? AND"
                  + " (o.fulfilled_at AT TIME ZONE 'UTC')::date=?",
              Integer.class,
              h.warehouseId(),
              h.productId(),
              d.day());
      if (count > 0)
        throw new ResponseStatusException(
            CONFLICT, "History overlaps fulfilled orders on " + d.day());
      db.update(
          "INSERT INTO demand_history(product_id,warehouse_id,day,units,source) VALUES(?,?,?,?,?)"
              + " ON CONFLICT(product_id,warehouse_id,day) DO UPDATE SET"
              + " units=EXCLUDED.units,source=EXCLUDED.source",
          h.productId(),
          h.warehouseId(),
          d.day(),
          d.units(),
          h.source());
    }
    db.update(
        "INSERT INTO audit_event(actor,action,entity_type,entity_id,details,created_at)"
            + " VALUES(?,'HISTORY_IMPORTED','PRODUCT',?,?,CURRENT_TIMESTAMP)",
        a.getName(),
        h.productId(),
        h.days().size() + " days; " + h.source());
    return Map.of("imported", h.days().size());
  }

  @GetMapping
  public Map<String, Object> forecast(
      @RequestParam long productId, @RequestParam long warehouseId) {
    var history =
        db.queryForList(
            "SELECT day::text AS day,sum(units)::int AS units FROM (SELECT day,units FROM"
                + " demand_history WHERE product_id=? AND warehouse_id=? UNION ALL SELECT"
                + " (o.fulfilled_at AT TIME ZONE 'UTC')::date AS day,l.quantity AS units FROM"
                + " customer_order o JOIN order_line l ON l.order_id=o.id WHERE"
                + " o.status='FULFILLED' AND l.product_id=? AND o.warehouse_id=?) d GROUP BY day"
                + " ORDER BY day",
            productId,
            warehouseId,
            productId,
            warehouseId);
    if (history.size() < 56)
      return Map.of(
          "status",
          "insufficient_data",
          "message",
          "Import at least 56 daily observations, including zero-sales days, or accumulate"
              + " fulfilled order history.",
          "observations",
          history.size());
    var sources =
        db.queryForList(
            "SELECT DISTINCT source FROM demand_history WHERE product_id=? AND warehouse_id=?",
            String.class,
            productId,
            warehouseId);
    try {
      @SuppressWarnings("unchecked")
      Map<String, Object> result =
          client.post().uri("/predict").body(Map.of("history", history)).retrieve().body(Map.class);
      var out = new LinkedHashMap<String, Object>(result);
      out.put("sources", sources);
      out.put("productId", productId);
      out.put("warehouseId", warehouseId);
      return out;
    } catch (Exception e) {
      throw new ResponseStatusException(
          SERVICE_UNAVAILABLE,
          "Forecast service unavailable or history invalid; operational data is unchanged");
    }
  }
}
