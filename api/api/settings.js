const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('restaurant_settings')
        .select('key, value')
      if (error) throw error
      // Return as flat object: { logo: '...', name: 'Nomi Pizza', ... }
      const settings = {}
      ;(data || []).forEach(row => { settings[row.key] = row.value })
      return res.status(200).json(settings)
    }

    if (req.method === 'POST') {
      const updates = req.body // { key: 'logo', value: 'data:image/...' }
      const entries = Array.isArray(updates) ? updates : [updates]
      for (const entry of entries) {
        const { key, value } = entry
        // Upsert — insert or update if key already exists
        const { error } = await supabase
          .from('restaurant_settings')
          .upsert({ key, value }, { onConflict: 'key' })
        if (error) throw error
      }
      return res.status(200).json({ success: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
