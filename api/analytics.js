const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    const today = new Date(); today.setHours(0,0,0,0)
    const todayEnd = new Date(); todayEnd.setHours(23,59,59,999)

    const { data: todayOrders } = await supabase
      .from('orders')
      .select('total, status, type, order_items(item_name, quantity)')
      .gte('created_at', today.toISOString())
      .lte('created_at', todayEnd.toISOString())

    const paid = todayOrders?.filter(o => o.status !== 'cancelled') || []
    const revenue = paid.reduce((s, o) => s + Number(o.total), 0)
    const avgTicket = paid.length ? revenue / paid.length : 0

    const itemCounts = {}
    paid.forEach(o => o.order_items?.forEach(i => {
      itemCounts[i.item_name] = (itemCounts[i.item_name] || 0) + i.quantity
    }))
    const topItems = Object.entries(itemCounts).sort((a,b) => b[1]-a[1]).slice(0,5)

    const { data: activeOrders } = await supabase
      .from('orders')
      .select('id, status')
      .in('status', ['pending','accepted','preparing','ready','on_the_way'])

    const { data: lowStock } = await supabase
      .from('ingredients')
      .select('*')
      .filter('quantity', 'lte', 'min_level')

    return res.status(200).json({
      today: {
        revenue: Math.round(revenue * 100) / 100,
        orders: paid.length,
        avg_ticket: Math.round(avgTicket * 100) / 100,
        active_orders: activeOrders?.length || 0,
        by_type: {
          dine_in: paid.filter(o => o.type === 'dine_in').length,
          delivery: paid.filter(o => o.type === 'delivery').length,
          pickup: paid.filter(o => o.type === 'pickup').length
        }
      },
      top_items: topItems,
      low_stock: lowStock || []
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
