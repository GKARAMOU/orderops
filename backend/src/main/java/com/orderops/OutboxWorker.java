package com.orderops;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class OutboxWorker {
  private final JdbcTemplate db;

  public OutboxWorker(JdbcTemplate db) {
    this.db = db;
  }

  // Delivery and acknowledgement commit together. A crash rolls both back; the next poll retries.
  @Scheduled(fixedDelayString = "${orderops.outbox-delay:2000}")
  @Transactional
  public void deliver() {
    var events =
        db.queryForList(
            "SELECT id,event_type,payload FROM outbox_event WHERE delivered_at IS NULL AND"
                + " next_attempt_at<=CURRENT_TIMESTAMP ORDER BY id LIMIT 50 FOR UPDATE SKIP"
                + " LOCKED");
    for (var e : events) {
      db.update(
          "INSERT INTO notification(event_id,message,created_at) VALUES(?,?,CURRENT_TIMESTAMP) ON"
              + " CONFLICT(event_id) DO NOTHING",
          e.get("id"),
          e.get("payload"));
      db.update(
          "UPDATE outbox_event SET delivered_at=CURRENT_TIMESTAMP,attempts=attempts+1 WHERE id=?",
          e.get("id"));
    }
  }
}
