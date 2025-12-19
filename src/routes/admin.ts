import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { supabaseAdmin } from '../lib/supabase';

const router = Router();

// Apply authentication middleware to all admin routes
router.use(authMiddleware);

// Middleware to check if user is admin
const requireAdmin = async (req: Request, res: Response, next: any) => {
    try {
        const userId = (req as any).user.id;

        const { data: profile, error } = await supabaseAdmin
            .from('profiles')
            .select('role')
            .eq('user_id', userId)
            .single();

        if (error || !profile || profile.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        next();
    } catch (error) {
        console.error('Error checking admin role:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

// GET /api/admin/users - List all users (admin only)
router.get('/users', requireAdmin, async (req: Request, res: Response) => {
    try {
        // Fetch all users from auth
        const { data: { users }, error: authError } = await supabaseAdmin.auth.admin.listUsers();

        if (authError) {
            console.error('Error listing users:', authError);
            return res.status(500).json({ error: 'Failed to fetch users' });
        }

        // Fetch profiles for all users
        const { data: profiles, error: profilesError } = await supabaseAdmin
            .from('profiles')
            .select(`
        user_id,
        full_name,
        role,
        created_at,
        establishment_id,
        establishments ( name )
      `);

        if (profilesError) {
            console.error('Error fetching profiles:', profilesError);
        }

        // Map users with their profile data
        const usersWithProfiles = users.map((user) => {
            const profile = profiles?.find((p) => p.user_id === user.id);
            return {
                id: user.id,
                email: user.email || 'N/A',
                full_name: profile?.full_name || 'Nome não definido',
                role: profile?.role || 'user',
                created_at: user.created_at || new Date().toISOString(),
                establishment_name: Array.isArray(profile?.establishments)
                    ? profile.establishments[0]?.name || 'N/A'
                    : (profile?.establishments as any)?.name || 'N/A',
            };
        });

        return res.json({ users: usersWithProfiles });
    } catch (error) {
        console.error('Error in /admin/users:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/admin/stats - Get admin dashboard stats
router.get('/stats', requireAdmin, async (req: Request, res: Response) => {
    try {
        // Get total users count
        const { count: usersCount } = await supabaseAdmin
            .from('profiles')
            .select('*', { count: 'exact', head: true });

        // Get total establishments count
        const { count: establishmentsCount } = await supabaseAdmin
            .from('establishments')
            .select('*', { count: 'exact', head: true });

        // Get total sales count
        const { count: salesCount } = await supabaseAdmin
            .from('sales')
            .select('*', { count: 'exact', head: true });

        // Get total products count
        const { count: productsCount } = await supabaseAdmin
            .from('products')
            .select('*', { count: 'exact', head: true });

        return res.json({
            stats: {
                users: usersCount || 0,
                establishments: establishmentsCount || 0,
                sales: salesCount || 0,
                products: productsCount || 0,
            }
        });
    } catch (error) {
        console.error('Error in /admin/stats:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
