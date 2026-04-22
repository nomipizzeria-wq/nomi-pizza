const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('ingredients').select('*').order('name')
      if (error) throw error
      return res.status(200).json(data)
    }

    if (req.method === 'PATCH') {
      const { id, quantity, type, notes, worker_id } = req.body
      await supabase.from('inventory_movements').insert([{
        ingredient_id: id, type, quantity, notes, worker_id
      }])
      const { data: current } = await supabase
        .from('ingredients').select('quantity').eq('id', id).single()
      const newQty = type === 'restock'
        ? current.quantity + quantity
        : Math.max(0, current.quantity - quantity)
      const { data, error } = await supabase
        .from('ingredients')
        .update({ quantity: newQty, last_restock: type === 'restock' ? new Date().toISOString() : undefined })
        .eq('id', id).select().single()
      if (error) throw error
      return res.status(200).json(data)
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
