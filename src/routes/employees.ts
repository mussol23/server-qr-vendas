import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabase';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// Apply auth middleware to all employee routes
router.use(authMiddleware);

// GET /employees - Listar funcionários do estabelecimento
router.get('/', async (req: Request, res: Response) => {
    try {
        const user = (req as any).user as { id: string; establishment_id?: string | null };

        if (!user.establishment_id) {
            return res.status(400).json({ error: 'Usuário sem estabelecimento' });
        }

        // Buscar funcionários do estabelecimento
        const { data: employees, error } = await supabaseAdmin
            .from('employees')
            .select('*')
            .eq('establishment_id', user.establishment_id)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('❌ Error fetching employees:', error);
            return res.status(500).json({ error: error.message });
        }

        console.log(`✅ Fetched ${employees?.length || 0} employees for establishment ${user.establishment_id}`);
        res.json({ employees: employees || [] });
    } catch (error: any) {
        console.error('❌ Error in GET /employees:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});

// POST /employees/create - Criar novo funcionário com conta de acesso
router.post('/create', async (req: Request, res: Response) => {
    try {
        const { email, password, full_name, phone, role } = req.body;
        const user = (req as any).user as { id: string; establishment_id?: string | null };

        if (!user.establishment_id) {
            return res.status(400).json({ error: 'Usuário sem estabelecimento' });
        }

        // Validar campos obrigatórios
        if (!full_name || !email || !password || !role) {
            return res.status(400).json({ error: 'Nome, email, senha e função são obrigatórios' });
        }

        // Validar role
        if (!['operator', 'manager', 'owner'].includes(role)) {
            return res.status(400).json({ error: 'Função inválida. Use: operator, manager ou owner' });
        }

        // Validar senha (mínimo 6 caracteres)
        if (password.length < 6) {
            return res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres' });
        }

        // 1. Criar usuário no Supabase Auth
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email: email,
            password: password,
            email_confirm: true, // Confirmar email automaticamente
            user_metadata: {
                full_name: full_name
            }
        });

        if (authError || !authData.user) {
            console.error('❌ Error creating auth user:', authError);
            return res.status(500).json({ error: authError?.message || 'Erro ao criar usuário' });
        }

        const newUserId = authData.user.id;

        try {
            // 2. Criar perfil
            const { error: profileError } = await supabaseAdmin
                .from('profiles')
                .insert({
                    user_id: newUserId,
                    establishment_id: user.establishment_id
                });

            if (profileError) {
                console.error('❌ Error creating profile:', profileError);
                // Rollback: deletar usuário criado
                await supabaseAdmin.auth.admin.deleteUser(newUserId);
                return res.status(500).json({ error: 'Erro ao criar perfil' });
            }

            // 3. Criar registro de funcionário
            const { data: employeeData, error: employeeError } = await supabaseAdmin
                .from('employees')
                .insert({
                    user_id: newUserId,
                    establishment_id: user.establishment_id,
                    full_name: full_name,
                    email: email,
                    phone: phone || null,
                    role: role,
                    created_by: user.id
                })
                .select()
                .single();

            if (employeeError) {
                console.error('❌ Error creating employee:', employeeError);
                // Rollback
                await supabaseAdmin.auth.admin.deleteUser(newUserId);
                return res.status(500).json({ error: 'Erro ao criar funcionário' });
            }

            // 4. Criar vínculo user_establishments
            const { error: ueError } = await supabaseAdmin
                .from('user_establishments')
                .insert({
                    user_id: newUserId,
                    establishment_id: user.establishment_id,
                    role: role
                });

            if (ueError) {
                console.error('❌ Error creating user_establishment:', ueError);
                // Rollback
                await supabaseAdmin.auth.admin.deleteUser(newUserId);
                return res.status(500).json({ error: 'Erro ao vincular funcionário' });
            }

            console.log(`✅ Employee account created: ${newUserId}`);

            // Retornar dados de acesso (para o dono enviar ao funcionário)
            res.json({
                success: true,
                employee: employeeData,
                access_data: {
                    email: email,
                    password: password, // Retornar senha para o dono copiar
                    role: role
                }
            });
        } catch (error: any) {
            // Rollback em caso de erro
            await supabaseAdmin.auth.admin.deleteUser(newUserId);
            throw error;
        }
    } catch (error: any) {
        console.error('❌ Error in POST /employees/create:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});

// PATCH /employees/:id - Atualizar funcionário
router.patch('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { full_name, phone, role, active } = req.body;
        const user = (req as any).user as { id: string; establishment_id?: string | null };

        if (!user.establishment_id) {
            return res.status(400).json({ error: 'Usuário sem estabelecimento' });
        }

        // Validar role se fornecido
        if (role && !['operator', 'manager', 'owner'].includes(role)) {
            return res.status(400).json({ error: 'Função inválida. Use: operator, manager ou owner' });
        }

        // Preparar dados para atualização
        const updateData: any = {
            updated_at: new Date().toISOString()
        };

        if (full_name !== undefined) updateData.full_name = full_name;
        if (phone !== undefined) updateData.phone = phone;
        if (role !== undefined) updateData.role = role;
        if (active !== undefined) updateData.active = active;

        // Atualizar funcionário
        const { data, error } = await supabaseAdmin
            .from('employees')
            .update(updateData)
            .eq('id', id)
            .eq('establishment_id', user.establishment_id) // Garantir que pertence ao estabelecimento
            .select()
            .single();

        if (error) {
            console.error('❌ Error updating employee:', error);
            return res.status(500).json({ error: error.message });
        }

        if (!data) {
            return res.status(404).json({ error: 'Funcionário não encontrado' });
        }

        console.log(`✅ Employee updated: ${id}`);
        res.json({ employee: data });
    } catch (error: any) {
        console.error('❌ Error in PATCH /employees/:id:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});

// DELETE /employees/:id - Deletar funcionário
router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const user = (req as any).user as { id: string; establishment_id?: string | null };

        if (!user.establishment_id) {
            return res.status(400).json({ error: 'Usuário sem estabelecimento' });
        }

        // Deletar funcionário
        const { error } = await supabaseAdmin
            .from('employees')
            .delete()
            .eq('id', id)
            .eq('establishment_id', user.establishment_id); // Garantir que pertence ao estabelecimento

        if (error) {
            console.error('❌ Error deleting employee:', error);
            return res.status(500).json({ error: error.message });
        }

        console.log(`✅ Employee deleted: ${id}`);
        res.json({ success: true });
    } catch (error: any) {
        console.error('❌ Error in DELETE /employees/:id:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});

export default router;
