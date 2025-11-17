import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabase';

const router = Router();

// Bootstrap user profile and establishment after signup
router.post('/bootstrap', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as { id: string; email?: string };
    if (!user?.id) return res.status(401).json({ error: 'Unauthorized' });

    const { full_name, phone, store } = req.body as {
      full_name?: string;
      phone?: string;
      store?: { name: string; document?: string; phone?: string; address?: string };
    };

    // Upsert profile
    const { error: profileErr } = await supabaseAdmin
      .from('profiles')
      .upsert(
        {
          user_id: user.id,
          full_name: full_name ?? null,
          phone: phone ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );
    if (profileErr) return res.status(400).json({ error: profileErr.message });

    // Optionally create establishment and link
    if (store?.name) {
      const { data: created, error: createErr } = await supabaseAdmin
        .from('establishments')
        .insert({
          name: store.name,
          document: store.document ?? null,
          phone: store.phone ?? null,
          address: store.address ?? null,
        })
        .select('id')
        .single();
      if (createErr) return res.status(400).json({ error: createErr.message });

      const { error: linkErr } = await supabaseAdmin
        .from('profiles')
        .update({ establishment_id: created.id, updated_at: new Date().toISOString() })
        .eq('user_id', user.id);
      if (linkErr) return res.status(500).json({ error: linkErr.message });
    }

    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Internal error' });
  }
});

export default router;


