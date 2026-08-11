import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)

    const url = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) return json({ error: 'Unauthorized' }, 401)

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

    const { data: isAdmin, error: roleErr } = await admin.rpc('has_role', { _user_id: user.id, _role: 'admin' })
    if (roleErr) return json({ error: roleErr.message }, 500)
    if (!isAdmin) return json({ error: 'Forbidden' }, 403)

    const body = await req.json().catch(() => ({}))
    const action = String(body?.action ?? '')

    if (action === 'create') {
      const email = String(body?.email ?? '').trim().toLowerCase()
      const password = String(body?.password ?? '')
      const centerName = String(body?.center_name ?? '').trim()
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'بريد إلكتروني غير صحيح' }, 400)
      if (password.length < 6) return json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' }, 400)
      if (centerName.length > 120) return json({ error: 'اسم المركز طويل جدًا' }, 400)

      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: centerName ? { center_name: centerName } : {},
      })
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true, user_id: data.user?.id })
    }

    if (action === 'reset_password') {
      const userId = String(body?.user_id ?? '')
      const password = String(body?.password ?? '')
      if (!userId) return json({ error: 'معرّف المستخدم مطلوب' }, 400)
      if (password.length < 6) return json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' }, 400)
      const { error } = await admin.auth.admin.updateUserById(userId, { password })
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }

    if (action === 'delete') {
      const userId = String(body?.user_id ?? '')
      if (!userId) return json({ error: 'معرّف المستخدم مطلوب' }, 400)
      if (userId === user.id) return json({ error: 'لا يمكنك حذف حسابك الخاص' }, 400)
      const { error } = await admin.auth.admin.deleteUser(userId)
      if (error) return json({ error: error.message }, 400)
      await admin.from('profiles').delete().eq('user_id', userId)
      return json({ ok: true })
    }

    if (action === 'set_active') {
      const userId = String(body?.user_id ?? '')
      const isActive = Boolean(body?.is_active)
      if (!userId) return json({ error: 'معرّف المستخدم مطلوب' }, 400)
      const { error } = await admin.from('profiles').update({ is_active: isActive }).eq('user_id', userId)
      if (error) return json({ error: error.message }, 400)
      const { error: banErr } = await admin.auth.admin.updateUserById(userId, {
        ban_duration: isActive ? 'none' : '876000h',
      })
      if (banErr) return json({ error: banErr.message }, 400)
      return json({ ok: true })
    }

    return json({ error: 'إجراء غير معروف' }, 400)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'خطأ غير متوقع' }, 500)
  }
})