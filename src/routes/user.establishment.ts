import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabase';

const router = Router();

// Upsert current user's establishment and link in profiles.establishment_id
router.post('/', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as { id: string };
    if (!user?.id) return res.status(401).json({ error: 'Unauthorized' });

    const { name, document, phone, address } = req.body as {
      name: string;
      document?: string | null;
      phone?: string | null;
      address?: string | null;
    };

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'name is required' });
    }

    // Read profile to get establishment_id
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select('establishment_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (profileErr) return res.status(500).json({ error: profileErr.message });

    let establishmentId = profile?.establishment_id as string | null;

    if (establishmentId) {
      // Update establishment
      const { data, error } = await supabaseAdmin
        .from('establishments')
        .update({
          name,
          document: document ?? null,
          phone: phone ?? null,
          address: address ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', establishmentId)
        .select('*')
        .single();
      if (error) return res.status(400).json({ error: error.message });
      return res.json({ data });
    } else {
      // Create new establishment and link to profile
      const { data: created, error: createErr } = await supabaseAdmin
        .from('establishments')
        .insert({
          name,
          document: document ?? null,
          phone: phone ?? null,
          address: address ?? null,
        })
        .select('*')
        .single();
      if (createErr) return res.status(400).json({ error: createErr.message });

      const { error: linkErr } = await supabaseAdmin
        .from('profiles')
        .update({ establishment_id: created.id, updated_at: new Date().toISOString() })
        .eq('user_id', user.id);
      if (linkErr) return res.status(500).json({ error: linkErr.message });

      return res.status(201).json({ data: created });
    }
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Internal error' });
  }
});

export default router;


