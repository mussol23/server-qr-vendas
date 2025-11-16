import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../lib/supabase';

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token' });
  }

  const token = auth.substring(7);
  // Validate token with Supabase and fetch profile/role
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const user = data.user;

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role, tenant_id, establishment_id')
    .eq('user_id', user.id)
    .maybeSingle();

  (req as any).user = {
    id: user.id,
    email: user.email,
    role: profile?.role ?? 'user',
    roles: [profile?.role ?? 'user'],
    tenant_id: profile?.tenant_id ?? null,
    establishment_id: profile?.establishment_id ?? null,
  };

  return next();
}
