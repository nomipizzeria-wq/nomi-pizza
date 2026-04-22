const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    if (req.method === 'POST') {
      const { code, subtotal } = req.body
      const { data: coupon, error } = await supabase
        .from('coupons').select('*').eq('code', code.toUpperCase()).eq('active', true).single()
      if (error || !coupon) return res.status(404).json({ error: 'Cupón inválido' })
      if (coupon.expires_at && new Date(coupon.expires_at) < new Date())
        return res.status(400).json({ error: 'Cupón expirado' })
      if (coupon.max_uses && coupon.uses_count >= coupon.max_uses)
        return res.status(400).json({ error: 'Cupón agotado' })
      if (subtotal < coupon.min_order)
        return res.status(400).json({ error: `Mínimo $${coupon.min_order}` })
      const discount = coupon.type === 'percentage'
        ? subtotal * (coupon.value / 100) : coupon.value
      await supabase.from('coupons').update({ uses_count: coupon.uses_count + 1 }).eq('id', coupon.id)
      return res.status(200).json({ coupon, discount: Math.round(discount * 100) / 100 })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
