// ============================================================
//  NOMI PIZZA — API CLIENT
//  Include this in every HTML file with:
//  <script src="nomi-api-client.js"></script>
//  Then use: const orders = await API.orders.getAll()
// ============================================================

const API_BASE = ''  // empty = same domain (your Vercel URL)

const API = {

  // ── HELPER ──────────────────────────────────────────────
  async _fetch(path, options = {}) {
    const res = await fetch(API_BASE + path, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Error del servidor')
    return data
  },

  // ── ORDERS ──────────────────────────────────────────────
  orders: {
    getAll: (status) =>
      API._fetch('/api/orders' + (status ? `?status=${status}` : '')),

    getToday: () => API._fetch('/api/orders'),

    create: (orderData) =>
      API._fetch('/api/orders', { method: 'POST', body: orderData }),

    updateStatus: (id, status) =>
      API._fetch('/api/orders', { method: 'PATCH', body: { id, status } }),

    updatePayment: (id, payment_method, payment_status = 'paid') =>
      API._fetch('/api/orders', { method: 'PATCH', body: { id, payment_method, payment_status } })
  },

  // ── TABLES ──────────────────────────────────────────────
  tables: {
    getAll: () => API._fetch('/api/tables'),

    updateStatus: (id, status, waiter_id) =>
      API._fetch('/api/tables', { method: 'PATCH', body: { id, status, waiter_id } }),

    occupy: (id, waiter_id) =>
      API._fetch('/api/tables', { method: 'PATCH', body: { id, status: 'occupied', waiter_id } }),

    free: (id) =>
      API._fetch('/api/tables', { method: 'PATCH', body: { id, status: 'available' } }),

    requestBill: (id) =>
      API._fetch('/api/tables', { method: 'PATCH', body: { id, status: 'ready' } })
  },

  // ── MENU ────────────────────────────────────────────────
  menu: {
    getAll: () => API._fetch('/api/menu'),

    createItem: (item) =>
      API._fetch('/api/menu', { method: 'POST', body: item }),

    updateItem: (id, updates) =>
      API._fetch('/api/menu', { method: 'PATCH', body: { id, ...updates } }),

    toggleAvailable: (id, available) =>
      API._fetch('/api/menu', { method: 'PATCH', body: { id, available } })
  },

  // ── INVENTORY ───────────────────────────────────────────
  inventory: {
    getAll: () => API._fetch('/api/inventory'),

    restock: (id, quantity, notes = '') =>
      API._fetch('/api/inventory', { method: 'PATCH', body: { id, quantity, type: 'restock', notes } }),

    recordWaste: (id, quantity, notes = '') =>
      API._fetch('/api/inventory', { method: 'PATCH', body: { id, quantity, type: 'waste', notes } })
  },

  // ── CUSTOMERS & LOYALTY ─────────────────────────────────
  customers: {
    getAll: () => API._fetch('/api/customers'),

    findByPhone: (phone) => API._fetch(`/api/customers?phone=${phone}`),

    findByEmail: (email) => API._fetch(`/api/customers?email=${email}`),

    create: (customer) =>
      API._fetch('/api/customers', { method: 'POST', body: customer }),

    addPoints: (id, points_to_add) =>
      API._fetch('/api/customers', { method: 'PATCH', body: { id, points_to_add } }),

    update: (id, updates) =>
      API._fetch('/api/customers', { method: 'PATCH', body: { id, ...updates } })
  },

  // ── ANALYTICS ───────────────────────────────────────────
  analytics: {
    getToday: () => API._fetch('/api/analytics')
  },

  // ── WORKERS ─────────────────────────────────────────────
  workers: {
    getAll: () => API._fetch('/api/workers'),

    loginWithPIN: (pin) =>
      API._fetch('/api/workers', { method: 'POST', body: { action: 'login_pin', pin } }),

    create: (worker) =>
      API._fetch('/api/workers', { method: 'POST', body: { action: 'create', ...worker } }),

    update: (id, updates) =>
      API._fetch('/api/workers', { method: 'PATCH', body: { id, ...updates } }),

    deactivate: (id) =>
      API._fetch('/api/workers', { method: 'PATCH', body: { id, active: false } })
  },

  // ── RESERVATIONS ────────────────────────────────────────
  reservations: {
    getByDate: (date) => API._fetch(`/api/reservations?date=${date}`),

    create: (reservation) =>
      API._fetch('/api/reservations', { method: 'POST', body: reservation }),

    updateStatus: (id, status) =>
      API._fetch('/api/reservations', { method: 'PATCH', body: { id, status } })
  },

  // ── COUPONS ─────────────────────────────────────────────
  coupons: {
    validate: (code, subtotal) =>
      API._fetch('/api/coupons', { method: 'POST', body: { code, subtotal } })
  },

  // ── REALTIME ────────────────────────────────────────────
  // Uses Supabase client directly for realtime (publishable key is safe here)
  realtime: {
    SUPABASE_URL: 'https://vmvrigshxffagblmpvyf.supabase.co',
    SUPABASE_KEY: 'sb_publishable_2p2n5KWlB0hHx1Y071T18g_C_R7BOza',

    // Call this to get a Supabase client for realtime subscriptions
    getClient() {
      if (this._client) return this._client
      if (typeof window !== 'undefined' && window.supabase) {
        this._client = window.supabase.createClient(this.SUPABASE_URL, this.SUPABASE_KEY)
      }
      return this._client
    },

    // Subscribe to new orders (for KDS and admin)
    onNewOrder(callback) {
      const client = this.getClient()
      if (!client) return null
      return client
        .channel('orders_realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, callback)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, callback)
        .subscribe()
    },

    // Subscribe to table status changes
    onTableChange(callback) {
      const client = this.getClient()
      if (!client) return null
      return client
        .channel('tables_realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_tables' }, callback)
        .subscribe()
    },

    // Subscribe to inventory changes
    onInventoryChange(callback) {
      const client = this.getClient()
      if (!client) return null
      return client
        .channel('inventory_realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'ingredients' }, callback)
        .subscribe()
    }
  },

  // ── UTILITY ─────────────────────────────────────────────
  utils: {
    // Format currency for Mexico
    formatMXN: (amount) =>
      new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount),

    // Calculate order totals
    calcTotals(items, type = 'dine_in', discount = 0) {
      const subtotal = items.reduce((s, i) => s + (i.unit_price * i.quantity), 0)
      const delivery_fee = type === 'delivery' ? 45 : 0
      const discountAmt = discount
      const taxable = subtotal - discountAmt
      const tax = taxable * 0.16
      const total = taxable + delivery_fee + tax
      const loyalty_points_earned = Math.floor(total)
      return {
        subtotal: Math.round(subtotal * 100) / 100,
        delivery_fee,
        discount: discountAmt,
        tax: Math.round(tax * 100) / 100,
        total: Math.round(total * 100) / 100,
        loyalty_points_earned
      }
    },

    // Get status label in Spanish
    statusLabel(status) {
      const labels = {
        pending: 'Pendiente', accepted: 'Aceptado', preparing: 'Preparando',
        ready: 'Listo', on_the_way: 'En camino', delivered: 'Entregado',
        cancelled: 'Cancelado'
      }
      return labels[status] || status
    },

    // Get table status label
    tableStatusLabel(status) {
      return { available: 'Libre', occupied: 'Ocupada', ready: 'Cuenta', reserved: 'Reservada' }[status] || status
    }
  }
}

// Make API globally available
window.NomiAPI = API
