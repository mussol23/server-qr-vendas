import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/requireRole';
import { supabaseAdmin } from '../lib/supabase';

const router = Router();

// Todas as rotas abaixo exigem papel 'admin'
router.use(requireRole(['admin']));

router.get('/establishments', async (_req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from('establishments')
    .select('*')
    .is('deleted_at', null)
    .order('updated_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
});

router.get('/establishments/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { data, error } = await supabaseAdmin
    .from('establishments')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return res.status(404).json({ error: error.message });
  res.json({ data });
});

router.post('/establishments', async (req: Request, res: Response) => {
  const body = req.body as {
    name: string;
    document?: string | null; // CNPJ/CPF
    phone?: string | null;
    address?: string | null;
    tenant_id?: string | null;
    active?: boolean;
  };

  const payload = {
    ...body,
    active: body.active ?? true,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from('establishments')
    .insert(payload)
    .select('*')
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json({ data });
});

router.patch('/establishments/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const updates = { ...req.body, updated_at: new Date().toISOString() };

  const { data, error } = await supabaseAdmin
    .from('establishments')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json({ data });
});

router.delete('/establishments/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { error } = await supabaseAdmin
    .from('establishments')
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString(), active: false })
    .eq('id', id);

  if (error) return res.status(400).json({ error: error.message });
  res.status(204).send();
});

export default router;
