const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    if (req.method === 'GET') {
      const { data: categories, error: cErr } = await supabase
        .from('categories').select('*').eq('active', true).order('sort_order')
      if (cErr) throw cErr

      const { data: items, error: iErr } = await supabase
        .from('menu_items')
        .select('*, categories(name, emoji), modifiers(*)')
        .eq('available', true)
        .order('sort_order')
      if (iErr) throw iErr

      return res.status(200).json({ categories, items })
    }

    if (req.method === 'POST') {
      const { data, error } = await supabase
        .from('menu_items').insert([req.body]).select().single()
      if (error) throw error
      return res.status(201).json(data)
    }

    if (req.method === 'PATCH') {
      const { id, ...updates } = req.body
      const { data, error } = await supabase
        .from('menu_items').update(updates).eq('id', id).select().single()
      if (error) throw error
      return res.status(200).json(data)
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
