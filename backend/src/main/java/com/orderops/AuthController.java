package com.orderops;

import static org.springframework.http.HttpStatus.*;

import jakarta.validation.Valid;
import java.time.Instant;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api")
public class AuthController {
  private final JdbcTemplate db;
  private final PasswordEncoder passwords;
  private final JwtEncoder encoder;
  private final String dummy;

  public AuthController(JdbcTemplate db, PasswordEncoder passwords, JwtEncoder encoder) {
    this.db = db;
    this.passwords = passwords;
    this.encoder = encoder;
    this.dummy = passwords.encode(UUID.randomUUID().toString());
  }

  @Bean
  CommandLineRunner bootstrap(
      @Value("${orderops.bootstrap-email}") String email,
      @Value("${orderops.bootstrap-password}") String password) {
    return args -> {
      if (password.length() < 12 || password.length() > 72)
        throw new IllegalArgumentException("ADMIN_PASSWORD must be 12-72 characters");
      db.update(
          "INSERT INTO app_user(email,password_hash,role) VALUES(?,?,'ADMIN') ON CONFLICT(email) DO"
              + " NOTHING",
          email.toLowerCase(Locale.ROOT),
          passwords.encode(password));
    };
  }

  @PostMapping("/auth/login")
  public Map<String, Object> login(@Valid @RequestBody Requests.Login input) {
    var rows =
        db.queryForList(
            "SELECT email,password_hash,role FROM app_user WHERE email=?",
            input.email().toLowerCase(Locale.ROOT));
    String hash = rows.isEmpty() ? dummy : (String) rows.getFirst().get("password_hash");
    if (!passwords.matches(input.password(), hash) || rows.isEmpty())
      throw new ResponseStatusException(UNAUTHORIZED, "Invalid email or password");
    var user = rows.getFirst();
    var now = Instant.now();
    var claims =
        JwtClaimsSet.builder()
            .issuer("orderops")
            .subject((String) user.get("email"))
            .issuedAt(now)
            .expiresAt(now.plusSeconds(3600))
            .claim("role", user.get("role"))
            .build();
    String token =
        encoder
            .encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims))
            .getTokenValue();
    return Map.of(
        "token", token, "email", user.get("email"), "role", user.get("role"), "expiresIn", 3600);
  }

  @GetMapping("/auth/me")
  public Map<String, Object> me(Authentication auth) {
    return Map.of(
        "email",
        auth.getName(),
        "role",
        auth.getAuthorities().iterator().next().getAuthority().replace("ROLE_", ""));
  }

  @PreAuthorize("hasRole('ADMIN')")
  @GetMapping("/users")
  public List<Map<String, Object>> users() {
    return db.queryForList("SELECT id,email,role FROM app_user ORDER BY id");
  }

  @PreAuthorize("hasRole('ADMIN')")
  @PostMapping("/users")
  public Map<String, String> create(@Valid @RequestBody Requests.UserInput input) {
    db.update(
        "INSERT INTO app_user(email,password_hash,role) VALUES(?,?,?)",
        input.email().toLowerCase(Locale.ROOT),
        passwords.encode(input.password()),
        input.role());
    return Map.of("message", "User created");
  }
}
