const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    // ── SUPPLIERS ──────────────────────────────────────────
    if (req.query.resource === 'suppliers') {
      if (req.method === 'GET') {
        const { data, error } = await supabase
          .from('suppliers').select('*').eq('active', true).order('name')
        if (error) throw error
        return res.status(200).json(data)
      }
      if (req.method === 'POST') {
        const { data, error } = await supabase
          .from('suppliers').insert([req.body]).select().single()
        if (error) throw error
        return res.status(201).json(data)
      }
    }

    // ── PURCHASES ──────────────────────────────────────────
    if (req.method === 'GET') {
      const { from_date, to_date, supplier_id } = req.query

      let query = supabase
        .from('purchases')
        .select(`
          *,
          suppliers(name),
          workers(name),
          purchase_items(*)
        `)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })

      if (from_date) query = query.gte('date', from_date)
      if (to_date) query = query.lte('date', to_date)
      if (supplier_id) query = query.eq('supplier_id', supplier_id)

      const { data, error } = await query
      if (error) throw error
      return res.status(200).json(data)
    }

    if (req.method === 'POST') {
      const { items, ...purchaseData } = req.body

      // Calculate total
      const total = (items || []).reduce((s, i) => s + (i.quantity * i.unit_price), 0)
      purchaseData.total = Math.round(total * 100) / 100

      // Create purchase
      const { data: purchase, error: pErr } = await supabase
        .from('purchases')
        .insert([purchaseData])
        .select().single()
      if (pErr) throw pErr

      // Create purchase items
      if (items && items.length > 0) {
        const purchaseItems = items.map(i => ({
          purchase_id: purchase.id,
          ingredient_id: i.ingredient_id || null,
          ingredient_name: i.ingredient_name,
          quantity: i.quantity,
          unit: i.unit,
          unit_price: i.unit_price
        }))

        const { error: iErr } = await supabase
          .from('purchase_items').insert(purchaseItems)
        if (iErr) throw iErr

        // Update ingredient stock and cost_per_unit for each item
        for (const item of items) {
          if (item.ingredient_id) {
            // Get current stock
            const { data: ing } = await supabase
              .from('ingredients')
              .select('quantity, cost_per_unit')
              .eq('id', item.ingredient_id).single()

            if (ing) {
              const newQty = Number(ing.quantity) + Number(item.quantity)
              // Weighted average cost
              const oldTotal = Number(ing.quantity) * Number(ing.cost_per_unit || 0)
              const newTotal = oldTotal + (Number(item.quantity) * Number(item.unit_price))
              const newCost = newQty > 0 ? newTotal / newQty : item.unit_price

              await supabase.from('ingredients').update({
                quantity: newQty,
                cost_per_unit: Math.round(newCost * 100) / 100,
                last_restock: new Date().toISOString()
              }).eq('id', item.ingredient_id)
            }
          }
        }
      }

      return res.status(201).json(purchase)
    }

    if (req.method === 'DELETE') {
      const { id } = req.body
      // Reverse stock changes would be complex - just delete the record
      const { error } = await supabase.from('purchases').delete().eq('id', id)
      if (error) throw error
      return res.status(200).json({ success: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('Purchases error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
