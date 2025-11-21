import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabase';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// Apply auth middleware to all routes
router.use(authMiddleware);

// Bootstrap user profile and establishment after signup
router.post('/', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as { id: string; email?: string };
    if (!user?.id) return res.status(401).json({ error: 'Unauthorized' });

    console.log(`🔧 Bootstrap: User ${user.id} (${user.email})`);

    const { full_name, phone, store } = req.body as {
      full_name?: string;
      phone?: string;
      store?: { name: string; document?: string; phone?: string; address?: string };
    };

    // Verificar se já tem establishment
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('establishment_id')
      .eq('user_id', user.id)
      .maybeSingle();

    let establishmentId = existingProfile?.establishment_id;
    console.log(`🔍 Bootstrap: Establishment existente: ${establishmentId || 'nenhum'}`);

    // Se tem store nos dados OU não tem establishment, criar/atualizar
    if (store?.name || !establishmentId) {
      const storeName = store?.name || `Loja de ${full_name || user.email}`;
      console.log(`🏪 Bootstrap: Criando establishment "${storeName}"`);

      const { data: created, error: createErr } = await supabaseAdmin
        .from('establishments')
        .insert({
          name: storeName,
          document: store?.document ?? null,
          phone: store?.phone ?? null,
          address: store?.address ?? null,
        })
        .select('id')
        .single();

      if (createErr) {
        console.error(`❌ Bootstrap: Erro ao criar establishment:`, createErr);
        return res.status(400).json({ error: createErr.message });
      }

      establishmentId = created.id;
      console.log(`✅ Bootstrap: Establishment criado: ${establishmentId}`);
    }

    // Upsert profile COM establishment_id
    console.log(`👤 Bootstrap: Atualizando profile com establishment_id: ${establishmentId}`);
    const { error: profileErr } = await supabaseAdmin
      .from('profiles')
      .upsert(
        {
          user_id: user.id,
          full_name: full_name ?? null,
          phone: phone ?? null,
          establishment_id: establishmentId, // SEMPRE incluir
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

    if (profileErr) {
      console.error(`❌ Bootstrap: Erro ao upsert profile:`, profileErr);
      return res.status(400).json({ error: profileErr.message });
    }

    console.log(`✅ Bootstrap: Completo para user ${user.id}`);
    return res.json({ ok: true, establishment_id: establishmentId });
  } catch (e: any) {
    console.error(`❌ Bootstrap: Erro:`, e);
    return res.status(500).json({ error: e?.message || 'Internal error' });
  }
});

export default router;


