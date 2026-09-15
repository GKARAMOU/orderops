import React, { useEffect, useState, FormEvent } from "react";
import { createRoot } from "react-dom/client";
import {
  Package,
  LayoutDashboard,
  Boxes,
  ShoppingCart,
  Truck,
  ChartNoAxesCombined,
  History,
  Users,
  LogOut,
  Plus,
  ArrowUpRight,
  Search,
  X,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import "./style.css";
type Row = Record<string, any>;
const money = (v: number) =>
  new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(
    v || 0,
  );
const when = (v: string) =>
  new Date(v).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
const navigation = [
  ["Overview", LayoutDashboard],
  ["Inventory", Boxes],
  ["Orders", ShoppingCart],
  ["Purchasing", Truck],
  ["Demand planning", ChartNoAxesCombined],
  ["Activity", History],
  ["Team", Users],
] as const;
function App() {
  const [session, setSession] = useState<Row | null>(null),
    [page, setPage] = useState("Overview"),
    [data, setData] = useState<Row>({}),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [modal, setModal] = useState(""),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState<Row | null>(null),
    [detail, setDetail] = useState<Row[]>([]),
    [forecast, setForecast] = useState<Row | null>(null),
    [fp, setFp] = useState(""),
    [fw, setFw] = useState(""),
    [items, setItems] = useState([{ productId: "", quantity: 1 }]);
  const [orderKey, setOrderKey] = useState(crypto.randomUUID());
  const canWrite = session?.role !== "VIEWER";
  async function api(
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
  ) {
    const r = await fetch("/api" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const v = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (r.status === 401 && path !== "/auth/login") setSession(null);
      throw new Error(
        v.detail || v.message || v.error || `Request failed (${r.status})`,
      );
    }
    return v;
  }
  async function load() {
    try {
      const names = [
        "products",
        "warehouses",
        "inventory",
        "orders",
        "purchases",
        "audit",
        "dashboard",
        "notifications",
        ...(session?.role === "ADMIN" ? ["users"] : []),
      ];
      const values = await Promise.all(names.map((n) => api("/" + n)));
      setData(Object.fromEntries(names.map((n, i) => [n, values[i]])));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    if (session) {
      load();
      const timer = setInterval(load, 15000);
      return () => clearInterval(timer);
    }
  }, [session]);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector('[role="dialog"]');
    const focusable = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]',
        ) || [],
      );
    focusable()[0]?.focus();
    const f = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) setModal("");
      if (e.key === "Tab") {
        const nodes = focusable();
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", f);
    return () => {
      document.removeEventListener("keydown", f);
      previous?.focus();
    };
  }, [modal, busy]);
  async function login(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      setSession(await api("/auth/login", Object.fromEntries(f)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function mutate(
    path: string,
    body: unknown = {},
    headers?: Record<string, string>,
  ) {
    setBusy(true);
    setError("");
    try {
      const r = await api(path, body, headers);
      await load();
      setNotice("Changes saved");
      return r;
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = Object.fromEntries(new FormData(form)) as Row;
    for (const key of [
      "price",
      "productId",
      "warehouseId",
      "onHand",
      "quantity",
    ])
      if (key in f) f[key] = Number(f[key]);
    try {
      if (modal === "Order") {
        f.items = items.map((i) => ({
          productId: Number(i.productId),
          quantity: Number(i.quantity),
        }));
        await mutate("/orders", f, { "Idempotency-Key": form.dataset.key! });
      } else
        await mutate(
          (
            {
              Product: "/products",
              Warehouse: "/warehouses",
              "Adjust stock": "/inventory/adjust",
              Purchase: "/purchases",
              User: "/users",
            } as Row
          )[modal],
          f,
        );
      setModal("");
    } catch {}
  }
  function open(name: string) {
    setError("");
    setModal(name);
    setOrderKey(crypto.randomUUID());
    setItems([
      { productId: String(data.products?.[0]?.id || ""), quantity: 1 },
    ]);
  }
  async function transition(kind: string, id: number, action: string) {
    try {
      await mutate(`/${kind}/${id}/${action}`);
    } catch {}
  }
  async function getForecast() {
    setBusy(true);
    setError("");
    try {
      setForecast(await api(`/forecast?productId=${fp}&warehouseId=${fw}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function importHistory(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const file = f.get("file") as File;
    try {
      const rows = (await file.text()).trim().split(/\r?\n/);
      if (rows.shift()?.trim() !== "day,units")
        throw new Error("CSV must start with day,units");
      const days = rows.map((row) => {
        const [day, units] = row.split(",");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d+$/.test(units))
          throw new Error("Use YYYY-MM-DD dates and non-negative whole units");
        return { day, units: Number(units) };
      });
      await mutate("/forecast/history", {
        productId: Number(fp),
        warehouseId: Number(fw),
        source: f.get("source"),
        days,
      });
      setForecast(null);
      setNotice(`${days.length} observations imported`);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const options = (name: string) =>
    data[name]?.map((r: Row) => (
      <option value={r.id} key={r.id}>
        {r.name || r.email}
      </option>
    ));
  const field = (
    label: string,
    name: string,
    type = "text",
    props: Row = {},
  ) => (
    <label>
      {label}
      <input name={name} type={type} required {...props} />
    </label>
  );
  const select = (label: string, name: string, list: string) => (
    <label>
      {label}
      <select name={name} aria-label={label} required>
        <option value="">Select {label.toLowerCase()}</option>
        {options(list)}
      </select>
    </label>
  );
  const filtered = (name: string) =>
    (data[name] || []).filter((r: Row) =>
      JSON.stringify(r).toLowerCase().includes(search.toLowerCase()),
    );
  const badge = (status: string) => (
    <span className={"badge " + status.toLowerCase()}>
      {status.toLowerCase().replace("_", " ")}
    </span>
  );
  function empty(text: string) {
    return (
      <div className="empty">
        <Package size={28} />
        <h3>{text}</h3>
        <p>
          Your workspace starts with real records. Create your first entry to
          begin.
        </p>
      </div>
    );
  }
  const changePage = (s: string) => {
    setPage(s);
    setSearch("");
    setError("");
    setNotice("");
  };
  if (!session)
    return (
      <div className="login">
        <section className="login-story">
          <div className="brand">
            <Package />
            OrderOps<span>WORKSPACE</span>
          </div>
          <div>
            <p className="eyebrow">FROM RECEIPT TO FULFILLMENT</p>
            <h1>
              Every order.
              <br />
              Every unit.
              <br />
              <em>Accounted for.</em>
            </h1>
            <p>
              One workspace for your inventory, orders and the decisions that
              keep operations moving.
            </p>
          </div>
          <small>Inventory · Fulfillment · Demand planning</small>
        </section>
        <main className="login-form">
          <div>
            <p className="eyebrow">YOUR OPERATIONS START HERE</p>
            <h2>Welcome back</h2>
            <p className="muted">Sign in with your workspace account.</p>
            <form onSubmit={login}>
              {field("Email address", "email", "email", {
                autoComplete: "username",
              })}
              {field("Password", "password", "password", {
                autoComplete: "current-password",
                maxLength: 72,
              })}
              {error && (
                <p role="alert" className="alert error">
                  {error}
                </p>
              )}
              <button disabled={busy} className="primary">
                {busy ? "Signing in…" : "Sign in"}
                <ArrowUpRight size={17} />
              </button>
            </form>
            <p className="login-note">
              Ask your administrator for access. Your session ends when you
              close or refresh this page.
            </p>
          </div>
        </main>
      </div>
    );
  return (
    <div className="app">
      <aside>
        <div className="brand">
          <Package />
          OrderOps
        </div>
        <div className="workspace">
          <span className="workspace-icon">O</span>
          <div>
            Operations workspace
            <small>{session.role.toLowerCase()} access</small>
          </div>
        </div>
        <p className="nav-label">WORKSPACE</p>
        <nav>
          {navigation
            .filter(([n]) => n !== "Team" || session.role === "ADMIN")
            .map(([n, Icon]) => (
              <button
                key={n}
                className={page === n ? "active" : ""}
                onClick={() => changePage(n)}
              >
                <Icon size={19} />
                {n}
                {page === n && <ChevronRight size={16} />}
              </button>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="avatar">{session.email[0].toUpperCase()}</span>
          <div>
            <strong>{session.email}</strong>
            <small>{session.role.toLowerCase()}</small>
          </div>
          <button
            title="Sign out"
            aria-label="Sign out"
            onClick={() => {
              setSession(null);
              setData({});
              setForecast(null);
            }}
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      <div className="main">
        <header>
          <span>
            Workspace <ChevronRight size={14} /> <strong>{page}</strong>
          </span>
          <button className="quiet" onClick={load}>
            <RefreshCw size={15} />
            Refresh
          </button>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <p className="eyebrow">OPERATIONS / {page.toUpperCase()}</p>
              <h1>
                {page === "Overview" ? "Your operation, at a glance" : page}
              </h1>
              <p className="muted">
                {
                  (
                    {
                      Overview:
                        "A live view of stock, commitments and fulfillment.",
                      Inventory:
                        "Track what is on hand, reserved and ready to sell.",
                      Orders:
                        "Reserve stock, fulfill orders and manage cancellations.",
                      Purchasing:
                        "Plan incoming stock and record supplier receipts.",
                      "Demand planning":
                        "Evaluate demand forecasts against historical sales.",
                      Activity:
                        "A traceable record of changes across your workspace.",
                      Team: "Manage access to your operations workspace.",
                    } as Row
                  )[page]
                }
              </p>
            </div>
            {canWrite && (
              <div className="actions">
                {page === "Inventory" && (
                  <>
                    <button onClick={() => open("Warehouse")}>
                      Add warehouse
                    </button>
                    <button onClick={() => open("Product")}>Add product</button>
                  </>
                )}
                {[
                  "Overview",
                  "Orders",
                  "Inventory",
                  "Purchasing",
                  "Team",
                ].includes(page) && (
                  <button
                    className="primary"
                    onClick={() =>
                      open(
                        (
                          {
                            Overview: "Order",
                            Orders: "Order",
                            Inventory: "Adjust stock",
                            Purchasing: "Purchase",
                            Team: "User",
                          } as Row
                        )[page],
                      )
                    }
                  >
                    <Plus size={17} />
                    {
                      (
                        {
                          Overview: "New order",
                          Orders: "New order",
                          Inventory: "Adjust stock",
                          Purchasing: "New purchase",
                          Team: "Add user",
                        } as Row
                      )[page]
                    }
                  </button>
                )}
              </div>
            )}
          </div>
          {error && (
            <div className="alert error" role="alert">
              {error}
              <button onClick={() => setError("")} aria-label="Dismiss error">
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="alert success" role="status">
              {notice}
              <button
                onClick={() => setNotice("")}
                aria-label="Dismiss notification"
              >
                <X size={16} />
              </button>
            </div>
          )}
          {page === "Overview" && (
            <>
              <div className="stats">
                {[
                  ["On-hand units", data.dashboard?.units, Boxes],
                  ["Reserved units", data.dashboard?.reserved, Package],
                  ["Open orders", data.dashboard?.open_orders, ShoppingCart],
                  [
                    "Fulfilled value",
                    money(data.dashboard?.fulfilled_value),
                    ArrowUpRight,
                  ],
                ].map(([title, value, Icon]: any) => (
                  <div className="stat" key={title}>
                    <div>
                      {title}
                      <Icon size={19} />
                    </div>
                    <strong>{value ?? "—"}</strong>
                    <small>
                      {title === "Fulfilled value"
                        ? "Completed orders · EUR"
                        : "Across all warehouses"}
                    </small>
                  </div>
                ))}
              </div>
              <div className="overview-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Order pipeline</h2>
                      <p>Latest customer commitments</p>
                    </div>
                    <button
                      className="link"
                      onClick={() => changePage("Orders")}
                    >
                      View orders
                      <ArrowUpRight size={16} />
                    </button>
                  </div>
                  {data.orders?.length ? (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Order / Customer</th>
                            <th>Status</th>
                            <th className="number">Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.orders.slice(0, 6).map((r: Row) => (
                            <tr key={r.id}>
                              <td>
                                <strong>
                                  #{String(r.id).padStart(4, "0")}
                                </strong>
                                <small>{r.customer}</small>
                              </td>
                              <td>{badge(r.status)}</td>
                              <td className="number">{money(r.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    empty("No orders yet")
                  )}
                </section>
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Stock commitments</h2>
                      <p>Reserved against on-hand quantities</p>
                    </div>
                  </div>
                  <div className="stock-bars">
                    {data.inventory?.slice(0, 5).map((r: Row) => (
                      <div key={r.id}>
                        <div>
                          <strong>{r.name}</strong>
                          <span>
                            {r.reserved} / {r.on_hand}
                          </span>
                        </div>
                        <div className="bar">
                          <span
                            style={{
                              width: `${r.on_hand ? (100 * r.reserved) / r.on_hand : 0}%`,
                            }}
                          />
                        </div>
                        <small>
                          {r.warehouse} · {r.available} available
                        </small>
                      </div>
                    ))}
                    {!data.inventory?.length && empty("No inventory yet")}
                  </div>
                </section>
              </div>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Recent operational events</h2>
                    <p>Delivered from committed order and purchasing changes</p>
                  </div>
                  <span className="badge">
                    {data.dashboard?.pending_events || 0} pending
                  </span>
                </div>
                <div className="events">
                  {data.notifications?.slice(0, 4).map((r: Row) => (
                    <div key={r.id}>
                      <div className="event-icon">
                        <Package size={17} />
                      </div>
                      <strong>{r.message}</strong>
                      <time>{when(r.created_at)}</time>
                    </div>
                  ))}
                  {!data.notifications?.length && (
                    <p className="muted">
                      Events appear after your first order or purchase. Delivery
                      runs every few seconds.
                    </p>
                  )}
                </div>
              </section>
            </>
          )}
          {["Inventory", "Orders", "Purchasing", "Activity", "Team"].includes(
            page,
          ) && (
            <section className="panel">
              <div className="panel-heading">
                <h2>
                  {
                    (
                      {
                        Inventory: "Stock by warehouse",
                        Orders: "Customer orders",
                        Purchasing: "Supplier purchases",
                        Activity: "Audit trail",
                        Team: "Workspace users",
                      } as Row
                    )[page]
                  }
                </h2>
                <label className="search">
                  <Search size={17} />
                  <input
                    aria-label="Search records"
                    placeholder="Search records…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
              </div>
              <div className="table-wrap">
                {page === "Inventory" && (
                  <table>
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Warehouse</th>
                        <th className="number">On hand</th>
                        <th className="number">Reserved</th>
                        <th className="number">Available</th>
                        <th className="number">Unit price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered("inventory").map((r: Row) => (
                        <tr key={r.id}>
                          <td>
                            <strong>{r.name}</strong>
                            <small>{r.sku}</small>
                          </td>
                          <td>{r.warehouse}</td>
                          <td className="number">{r.on_hand}</td>
                          <td className="number">{r.reserved}</td>
                          <td className="number">
                            <span
                              className={
                                r.available === 0 ? "stock-zero" : "stock-ok"
                              }
                            >
                              {r.available}
                            </span>
                          </td>
                          <td className="number">{money(r.price)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {page === "Orders" && (
                  <table>
                    <thead>
                      <tr>
                        <th>Order</th>
                        <th>Customer</th>
                        <th>Warehouse</th>
                        <th>Status</th>
                        <th className="number">Total</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered("orders").map((r: Row) => (
                        <tr key={r.id}>
                          <td>
                            <button
                              className="link"
                              onClick={async () => {
                                try {
                                  setDetail(await api(`/orders/${r.id}/lines`));
                                  setSelected(r);
                                  setModal("Order details");
                                } catch (e) {
                                  setError((e as Error).message);
                                }
                              }}
                            >
                              #{String(r.id).padStart(4, "0")}
                            </button>
                            <small>{when(r.created_at)}</small>
                          </td>
                          <td>{r.customer}</td>
                          <td>{r.warehouse}</td>
                          <td>{badge(r.status)}</td>
                          <td className="number">{money(r.total)}</td>
                          <td>
                            {canWrite && r.status === "RESERVED" && (
                              <div className="row-actions">
                                <button
                                  disabled={busy}
                                  onClick={() =>
                                    transition("orders", r.id, "fulfill")
                                  }
                                >
                                  Fulfill
                                </button>
                                <button
                                  disabled={busy}
                                  onClick={() =>
                                    transition("orders", r.id, "cancel")
                                  }
                                >
                                  Cancel
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {page === "Purchasing" && (
                  <table>
                    <thead>
                      <tr>
                        <th>Purchase / Supplier</th>
                        <th>Product</th>
                        <th>Warehouse</th>
                        <th className="number">Units</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered("purchases").map((r: Row) => (
                        <tr key={r.id}>
                          <td>
                            <strong>
                              #{r.id} · {r.supplier}
                            </strong>
                            <small>{when(r.created_at)}</small>
                          </td>
                          <td>{r.product}</td>
                          <td>{r.warehouse}</td>
                          <td className="number">{r.quantity}</td>
                          <td>{badge(r.status)}</td>
                          <td>
                            {canWrite && r.status === "OPEN" && (
                              <div className="row-actions">
                                <button
                                  disabled={busy}
                                  onClick={() =>
                                    transition("purchases", r.id, "receive")
                                  }
                                >
                                  Receive
                                </button>
                                <button
                                  disabled={busy}
                                  onClick={() =>
                                    transition("purchases", r.id, "cancel")
                                  }
                                >
                                  Cancel
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {page === "Activity" && (
                  <table>
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Action</th>
                        <th>Record</th>
                        <th>Details</th>
                        <th>Actor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered("audit").map((r: Row) => (
                        <tr key={r.id}>
                          <td>{when(r.created_at)}</td>
                          <td>{r.action.toLowerCase().replaceAll("_", " ")}</td>
                          <td>
                            {r.entity_type.toLowerCase()} #{r.entity_id}
                          </td>
                          <td>{r.details}</td>
                          <td>{r.actor}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {page === "Team" && (
                  <table>
                    <thead>
                      <tr>
                        <th>Email</th>
                        <th>Role</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered("users").map((r: Row) => (
                        <tr key={r.id}>
                          <td>{r.email}</td>
                          <td>{badge(r.role)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              {!filtered(
                (
                  {
                    Inventory: "inventory",
                    Orders: "orders",
                    Purchasing: "purchases",
                    Activity: "audit",
                    Team: "users",
                  } as Row
                )[page],
              ).length &&
                empty(search ? "No matching records" : "No records yet")}
              <div className="table-foot">
                {page === "Activity"
                  ? "Latest 200 changes"
                  : page === "Orders" || page === "Purchasing"
                    ? "Latest 500 records"
                    : "All current records"}
              </div>
            </section>
          )}
          {page === "Inventory" && (
            <div className="catalog-note">
              Catalog: {data.products?.length || 0} products ·{" "}
              {data.warehouses?.length || 0} warehouses. A stock row is created
              when you adjust or receive stock.
            </div>
          )}
          {page === "Demand planning" && (
            <>
              <section className="panel forecast-controls">
                <div>
                  <h2>Forecast a product</h2>
                  <p className="muted">
                    Uses imported daily history and fulfilled orders. No
                    predictions are fabricated when history is missing.
                  </p>
                </div>
                <div className="form-grid">
                  <label>
                    Product
                    <select
                      aria-label="Product"
                  value={fp}
                      onChange={(e) => {
                        setFp(e.target.value);
                        setForecast(null);
                      }}
                    >
                      <option value="">Select product</option>
                      {options("products")}
                    </select>
                  </label>
                  <label>
                    Warehouse
                    <select
                      aria-label="Warehouse"
                  value={fw}
                      onChange={(e) => {
                        setFw(e.target.value);
                        setForecast(null);
                      }}
                    >
                      <option value="">Select warehouse</option>
                      {options("warehouses")}
                    </select>
                  </label>
                  <button
                    className="primary"
                    disabled={!fp || !fw || busy}
                    onClick={getForecast}
                  >
                    {busy ? "Evaluating…" : "Run forecast"}
                  </button>
                </div>
              </section>
              {forecast && (
                <section className="panel forecast-result">
                  <h2>
                    {forecast.status === "ready"
                      ? "Seven-day forecast"
                      : "More history needed"}
                  </h2>
                  {forecast.status !== "ready" ? (
                    <p>{forecast.message}</p>
                  ) : (
                    <>
                      <p className="muted">
                        Selected: {forecast.selectedModel.replaceAll("_", " ")}{" "}
                        · History ends {forecast.historyEnd}
                      </p>
                      {forecast.staleHistory && (
                        <p className="alert error">
                          History is out of date. These predictions follow the
                          last observation, not today.
                        </p>
                      )}
                      <div className="forecast-chart">
                        {forecast.forecast.map((p: Row) => (
                          <div key={p.day}>
                            <strong>{p.units}</strong>
                            <div>
                              <span
                                style={{
                                  height: `${Math.max(2, (100 * p.units) / Math.max(1, ...forecast.forecast.map((x: Row) => x.units)))}%`,
                                }}
                              />
                            </div>
                            <small>{p.day.slice(5)}</small>
                          </div>
                        ))}
                      </div>
                      <div className="stats compact">
                        <div className="stat">
                          <div>Random forest MAE</div>
                          <strong>{forecast.modelMae}</strong>
                        </div>
                        <div className="stat">
                          <div>Seasonal baseline MAE</div>
                          <strong>{forecast.baselineMae}</strong>
                        </div>
                        <div className="stat">
                          <div>Validation window</div>
                          <strong>{forecast.holdoutDays} days</strong>
                        </div>
                      </div>
                      <p>
                        MAE is the average absolute error in daily units; lower
                        is better. The baseline is retained when it performs at
                        least as well.
                      </p>
                      <p className="muted">{forecast.evaluation}</p>
                      <p className="muted">{forecast.limitation}</p>
                      <p>
                        <strong>Imported sources:</strong>{" "}
                        {forecast.sources?.join(", ") ||
                          "None; fulfilled orders only"}
                      </p>
                    </>
                  )}
                </section>
              )}
              {canWrite && (
                <section className="panel forecast-controls">
                  <h2>Import daily sales history</h2>
                  <p className="muted">
                    CSV columns: <code>day,units</code>. Include consecutive
                    dates and zero-sales days. At least 56 days are needed.
                    Imports replace matching dates; they cannot overlap
                    fulfilled orders.
                  </p>
                  <form onSubmit={importHistory}>
                    <div className="form-grid">
                      <label>
                        Data source
                        <input
                          name="source"
                          placeholder="e.g. Shop export, or synthetic test data"
                          required
                          maxLength={200}
                        />
                      </label>
                      <label>
                        CSV file
                        <input
                          type="file"
                          name="file"
                          accept=".csv,text/csv"
                          required
                        />
                      </label>
                      <button disabled={!fp || !fw || busy}>
                        Import history
                      </button>
                    </div>
                  </form>
                </section>
              )}
            </>
          )}
          <footer>
            OrderOps <span>Inventory & fulfillment workspace</span>
            <span>All times shown in your local timezone</span>
          </footer>
        </main>
      </div>
      {modal && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) setModal("");
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            className="modal"
          >
            <div className="panel-heading">
              <h2 id="modal-title">
                {modal === "Order details"
                  ? `Order #${selected?.id}`
                  : modal === "Adjust stock"
                    ? modal
                    : `New ${modal.toLowerCase()}`}
              </h2>
              <button
                disabled={busy}
                aria-label="Close dialog"
                onClick={() => setModal("")}
              >
                <X size={20} />
              </button>
            </div>
            {error && <p className="alert error">{error}</p>}
            {modal === "Order details" ? (
              <div>
                <p>
                  {selected?.customer} · {selected?.warehouse}
                </p>
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Quantity</th>
                      <th>Unit price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.map((r) => (
                      <tr key={r.product_id}>
                        <td>{r.name}</td>
                        <td>{r.quantity}</td>
                        <td>{money(r.unit_price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <form data-key={orderKey} onSubmit={submit}>
                {modal === "Product" && (
                  <>
                    {field("SKU", "sku", "text", { maxLength: 60 })}
                    {field("Product name", "name", "text", { maxLength: 160 })}
                    {field("Unit price (EUR)", "price", "number", {
                      min: 0,
                      step: ".01",
                      max: 9999999999.99,
                    })}
                  </>
                )}
                {modal === "Warehouse" &&
                  field("Warehouse name", "name", "text", { maxLength: 120 })}
                {modal === "Adjust stock" && (
                  <>
                    {select("Product", "productId", "products")}
                    {select("Warehouse", "warehouseId", "warehouses")}
                    {field("New total on hand", "onHand", "number", {
                      min: 0,
                      max: 1000000,
                    })}
                    {field("Reason for adjustment", "reason", "text", {
                      maxLength: 500,
                    })}
                    <p className="muted">
                      This sets total stock. Reserved quantities remain
                      protected.
                    </p>
                  </>
                )}
                {modal === "Order" && (
                  <>
                    {field("Customer", "customer", "text", { maxLength: 160 })}
                    {select("Warehouse", "warehouseId", "warehouses")}
                    <p className="form-label">Order items</p>
                    {items.map((item, i) => (
                      <div className="item-row" key={i}>
                        <label>
                          Product
                          <select
                            required
                            aria-label="Product"
                        value={item.productId}
                            onChange={(e) =>
                              setItems(
                                items.map((x, j) =>
                                  j === i
                                    ? { ...x, productId: e.target.value }
                                    : x,
                                ),
                              )
                            }
                          >
                            <option value="">Select product</option>
                            {options("products")}
                          </select>
                        </label>
                        <label>
                          Units
                          <input
                            type="number"
                            min="1"
                            max="100000"
                            required
                            value={item.quantity}
                            onChange={(e) =>
                              setItems(
                                items.map((x, j) =>
                                  j === i
                                    ? { ...x, quantity: Number(e.target.value) }
                                    : x,
                                ),
                              )
                            }
                          />
                        </label>
                        {items.length > 1 && (
                          <button
                            type="button"
                            aria-label="Remove item"
                            onClick={() =>
                              setItems(items.filter((_, j) => j !== i))
                            }
                          >
                            <X size={16} />
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      disabled={items.length >= 50}
                      onClick={() =>
                        setItems([...items, { productId: "", quantity: 1 }])
                      }
                    >
                      <Plus size={15} />
                      Add item
                    </button>
                    <p className="muted">
                      Available stock is reserved when you save this order.
                    </p>
                  </>
                )}
                {modal === "Purchase" && (
                  <>
                    {field("Supplier", "supplier", "text", { maxLength: 160 })}
                    {select("Product", "productId", "products")}
                    {select("Warehouse", "warehouseId", "warehouses")}
                    {field("Quantity", "quantity", "number", {
                      min: 1,
                      max: 100000,
                    })}
                  </>
                )}
                {modal === "User" && (
                  <>
                    {field("Email", "email", "email", { maxLength: 254 })}
                    {field("Initial password", "password", "password", {
                      minLength: 12,
                      maxLength: 72,
                      autoComplete: "new-password",
                    })}
                    <label>
                      Role
                      <select name="role">
                        <option value="VIEWER">Viewer — read only</option>
                        <option value="OPERATOR">
                          Operator — manage operations
                        </option>
                        <option value="ADMIN">
                          Admin — operations and team access
                        </option>
                      </select>
                    </label>
                  </>
                )}
                <div className="modal-actions">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setModal("")}
                  >
                    Cancel
                  </button>
                  <button className="primary" disabled={busy}>
                    {busy ? "Saving…" : "Save " + modal.toLowerCase()}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
