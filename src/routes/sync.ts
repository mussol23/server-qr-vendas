import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabase';
import { validateSyncData } from '../lib/validation';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// Apply auth middleware to all sync routes
router.use(authMiddleware);

const ALLOWED_TABLES = [
  'establishments',
  'products',
  'clients',
  'sales',
  'sale_items',
  'financial_transactions',
];

router.post('/pull', async (req: Request, res: Response) => {
  try {
    const { lastSyncAt, tables, limit } = req.body as { lastSyncAt?: string; tables: string[]; limit?: number };
    const user = (req as any).user as { id: string; establishment_id?: string | null };

    if (!Array.isArray(tables) || tables.length === 0) {
      return res.status(400).json({ error: 'tables required and must be an array' });
    }

    // Validate that all tables are allowed
    const invalidTables = tables.filter(t => !ALLOWED_TABLES.includes(t));
    if (invalidTables.length > 0) {
      return res.status(400).json({ error: `Invalid tables: ${invalidTables.join(', ')}` });
    }

    // Validate date format if provided
    if (lastSyncAt && isNaN(Date.parse(lastSyncAt))) {
      return res.status(400).json({ error: 'lastSyncAt must be a valid ISO date string' });
    }

    const since = lastSyncAt ?? '1970-01-01T00:00:00Z';
    const safeLimit = Math.max(1, Math.min(Number(limit) || 1000, 5000));
    const result: Record<string, any[]> = {};
    const establishmentId = user?.establishment_id || null;

    console.log(`📥 Pull from user ${user.id}, establishment: ${establishmentId || 'none'}`);

    // Tabelas que precisam filtrar por establishment_id
    const TENANT_TABLES = ['products', 'clients', 'sales', 'financial_transactions'];

    // 🆕 VALIDAR: Se usuário não tem establishment_id, rejeitar para tabelas multi-tenant
    const requestedTenantTables = tables.filter(t => TENANT_TABLES.includes(t));
    if (requestedTenantTables.length > 0 && !establishmentId) {
      console.error(`❌ User ${user.id} sem establishment_id tentou fazer pull de tabelas multi-tenant: ${requestedTenantTables.join(', ')}`);
      return res.status(403).json({
        error: 'Usuário sem establishment_id não pode fazer pull de dados multi-tenant',
        requiresBootstrap: true,
        requestedTables: requestedTenantTables
      });
    }

    for (const t of tables) {
      try {
        // 🆕 Se for tabela multi-tenant e não tiver establishment_id, retornar vazio
        if (TENANT_TABLES.includes(t)) {
          if (!establishmentId) {
            console.warn(`⚠️ User ${user.id} sem establishment_id, retornando vazio para ${t}`);
            result[t] = [];
            continue;
          }
        }

        let query = supabaseAdmin
          .from(t)
          .select('*')
          .gt('updated_at', since)
          .order('updated_at', { ascending: true })
          .limit(safeLimit);

        // 🆕 FILTRAR por establishment_id para tabelas multi-tenant
        if (TENANT_TABLES.includes(t) && establishmentId) {
          query = query.eq('establishment_id', establishmentId);
          console.log(`🔒 Filtering ${t} by establishment_id: ${establishmentId}`);
        }

        // 🆕 FILTRAR establishments: apenas o próprio establishment do usuário
        if (t === 'establishments') {
          if (establishmentId) {
            query = query.eq('id', establishmentId);
            console.log(`🔒 Filtering ${t} by id (own establishment): ${establishmentId}`);
          } else {
            console.warn(`⚠️ User ${user.id} sem establishment_id, retornando vazio para establishments`);
            result[t] = [];
            continue;
          }
        }

        // 🆕 FILTRAR sale_items através de sales do establishment
        if (t === 'sale_items') {
          if (!establishmentId) {
            console.warn(`⚠️ User ${user.id} sem establishment_id, retornando vazio para sale_items`);
            result[t] = [];
            continue;
          }

          // Primeiro buscar IDs das vendas do establishment
          const { data: salesData, error: salesError } = await supabaseAdmin
            .from('sales')
            .select('id')
            .eq('establishment_id', establishmentId)
            .gt('updated_at', since);

          if (salesError) {
            console.error(`❌ Error fetching sales for sale_items filter:`, salesError);
            result[t] = [];
            continue;
          }

          const saleIds = (salesData || []).map(s => s.id);
          if (saleIds.length === 0) {
            console.log(`ℹ️ No sales found for establishment ${establishmentId}, returning empty sale_items`);
            result[t] = [];
            continue;
          }

          // Filtrar sale_items pelos IDs das vendas (refazer query com filtro)
          const { data: itemsData, error: itemsError } = await supabaseAdmin
            .from('sale_items')
            .select('*')
            .in('sale_id', saleIds)
            .order('created_at', { ascending: true })
            .limit(safeLimit);

          if (itemsError) {
            console.error(`❌ Error fetching sale_items:`, itemsError);
            result[t] = [];
            continue;
          }

          result[t] = itemsData ?? [];
          console.log(`🔒 Filtered ${t}: ${result[t].length} items from ${saleIds.length} sales by establishment_id: ${establishmentId}`);
          continue; // Pular o processamento normal abaixo
        }

        const { data, error } = await query;

        if (error) {
          console.error(`❌ Error fetching ${t}:`, error);
          return res.status(500).json({ error: error.message, table: t });
        }
        result[t] = data ?? [];
        console.log(`✅ Pulled ${result[t].length} rows from ${t}`);
      } catch (error: any) {
        console.error(`❌ Error processing table ${t}:`, error);
        return res.status(500).json({ error: error.message || 'Unknown error', table: t });
      }
    }

    res.json({ changes: result, serverTime: new Date().toISOString() });
  } catch (error: any) {
    console.error('❌ Error in sync/pull:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

router.post('/push', async (req: Request, res: Response) => {
  try {
    const { changes } = req.body as { changes: Record<string, Array<Record<string, any>>> };
    const user = (req as any).user as { id: string; email?: string; establishment_id?: string | null };

    if (!changes || typeof changes !== 'object') {
      return res.status(400).json({ error: 'changes required and must be an object' });
    }

    // Validate tables
    const tables = Object.keys(changes);
    const invalidTables = tables.filter(t => !ALLOWED_TABLES.includes(t));
    if (invalidTables.length > 0) {
      return res.status(400).json({ error: `Invalid tables: ${invalidTables.join(', ')}` });
    }

    // Get user's establishment_id for multi-tenancy
    const establishmentId = user?.establishment_id || null;
    console.log(`📤 Push from user ${user.id}, establishment: ${establishmentId || 'none'}`);
    console.log(`📤 User object:`, JSON.stringify(user, null, 2));

    if (!establishmentId) {
      console.warn(`⚠️ ATENÇÃO: Usuário ${user.id} (${user.email}) NÃO TEM establishment_id!`);
    }

    // Tabelas que precisam do establishment_id (multi-tenant)
    const TENANT_TABLES = ['products', 'clients', 'sales', 'financial_transactions'];

    // Validate data for each table
    for (const [table, rows] of Object.entries(changes)) {
      if (!rows || !Array.isArray(rows)) {
        return res.status(400).json({ error: `Rows for table ${table} must be an array` });
      }

      if (rows.length === 0) continue;

      // 🔒 Adicionado: Verificação de segurança para sale_items
      if (table === 'sale_items') {
        if (!establishmentId) {
          console.error(`❌ User ${user.id} sem establishment_id tentou fazer push de sale_items`);
          return res.status(403).json({ error: 'User without establishment cannot push sale_items' });
        }

        const saleIds = [...new Set(rows.map(r => r.sale_id).filter(id => id))];
        if (saleIds.length > 0) {
          const { data: validSales, error: salesError } = await supabaseAdmin
            .from('sales')
            .select('id')
            .eq('establishment_id', establishmentId)
            .in('id', saleIds);

          if (salesError) {
            console.error(`❌ Erro ao verificar sale_ids para push de sale_items:`, salesError);
            return res.status(500).json({ error: 'Failed to verify sales for items' });
          }

          const validSaleIds = new Set((validSales || []).map(s => s.id));
          const invalidIds = saleIds.filter(id => !validSaleIds.has(id));

          if (invalidIds.length > 0) {
            console.error(`❌ SEGURANÇA: User ${user.id} tentou fazer push de sale_items para vendas que não pertencem ao seu establishment (${establishmentId}). IDs inválidos: ${invalidIds.join(', ')}`);
            return res.status(403).json({ error: 'Forbidden: You can only add items to your own sales.' });
          }
        }
      }

      // Inject establishment_id in multi-tenant tables
      let processedRows = rows;
      if (TENANT_TABLES.includes(table)) {
        if (!establishmentId) {
          console.error(`❌ User ${user.id} não tem establishment_id, mas tentou fazer push em ${table}`);
          return res.status(400).json({
            error: `Usuário sem establishment_id não pode criar registros em ${table}`,
            table
          });
        }

        processedRows = rows.map(row => {
          // Remover establishment_id existente para evitar conflito
          const { establishment_id: _, ...rowWithoutEstablishment } = row;
          return {
            ...rowWithoutEstablishment,
            establishment_id: establishmentId, // SEMPRE forçar o establishment_id do usuário
          };
        });
        console.log(`🔒 FORÇADO establishment_id ${establishmentId} em ${rows.length} registros de ${table}`);
      }

      // Validate data structure
      const validation = validateSyncData(table, processedRows);
      if (!validation.valid) {
        return res.status(400).json({
          error: `Validation failed for table ${table}`,
          details: validation.errors
        });
      }

      try {
        const { error } = await supabaseAdmin.from(table).upsert(processedRows, {
          onConflict: 'id',
          ignoreDuplicates: false,
        });

        if (error) {
          console.error(`❌ Error upserting ${table}:`, error);
          return res.status(500).json({ error: error.message, table });
        }
        console.log(`✅ Successfully upserted ${processedRows.length} rows to ${table}`);
      } catch (error: any) {
        console.error(`❌ Error processing table ${table}:`, error);
        return res.status(500).json({ error: error.message || 'Unknown error', table });
      }
    }

    res.json({ ok: true });
  } catch (error: any) {
    console.error('❌ Error in sync/push:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

router.post('/delete', async (req: Request, res: Response) => {
  try {
    const { table, ids } = req.body as { table: string; ids: string[] };
    const user = (req as any).user as { id: string; establishment_id?: string | null };

    if (!table || !ids || !Array.isArray(ids)) {
      return res.status(400).json({ error: 'table and ids (array) are required' });
    }

    if (!ALLOWED_TABLES.includes(table)) {
      return res.status(400).json({ error: `Invalid table: ${table}` });
    }

    const establishmentId = user?.establishment_id || null;
    console.log(`🗑️ Delete from user ${user.id}, establishment: ${establishmentId || 'none'}, table: ${table}, ids: ${ids.length}`);

    // Tabelas multi-tenant exigem establishment_id
    const TENANT_TABLES = ['products', 'clients', 'sales', 'financial_transactions'];
    if (TENANT_TABLES.includes(table)) {
      if (!establishmentId) {
        return res.status(403).json({ error: 'User without establishment cannot delete from this table' });
      }

      // Deletar garantindo que pertence ao establishment
      const { error } = await supabaseAdmin
        .from(table)
        .delete()
        .eq('establishment_id', establishmentId)
        .in('id', ids);

      if (error) {
        console.error(`❌ Error deleting from ${table}:`, error);
        return res.status(500).json({ error: error.message });
      }
    } else {
      // Outras tabelas (ex: establishments) - verificar permissão específica se necessário
      // Por enquanto, apenas deletar pelo ID
      const { error } = await supabaseAdmin
        .from(table)
        .delete()
        .in('id', ids);

      if (error) {
        console.error(`❌ Error deleting from ${table}:`, error);
        return res.status(500).json({ error: error.message });
      }
    }

    console.log(`✅ Successfully deleted ${ids.length} rows from ${table}`);
    res.json({ ok: true });
  } catch (error: any) {
    console.error('❌ Error in sync/delete:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Search product by barcode in establishment
router.post('/search-barcode', async (req: Request, res: Response) => {
  try {
    const { barcode } = req.body as { barcode: string };
    const user = (req as any).user as { id: string; establishment_id?: string | null };

    if (!barcode) {
      return res.status(400).json({ error: 'barcode is required' });
    }

    const establishmentId = user?.establishment_id;
    if (!establishmentId) {
      return res.status(403).json({ error: 'User must have establishment_id' });
    }

    console.log(`🔍 Searching product by barcode: ${barcode} for establishment: ${establishmentId}`);

    // Search in establishment's products
    const { data, error } = await supabaseAdmin
      .rpc('search_product_by_barcode', {
        barcode_value: barcode,
        establishment_id_param: establishmentId
      });

    if (error) {
      console.error('❌ Error searching product by barcode:', error);
      return res.status(500).json({ error: error.message });
    }

    if (data && data.length > 0) {
      console.log(`✅ Found product by barcode: ${data[0].name}`);
      return res.json({ product: data[0] });
    }

    console.log(`ℹ️ No product found with barcode: ${barcode}`);
    res.json({ product: null });
  } catch (error: any) {
    console.error('❌ Error in search-barcode:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Search global product by barcode
router.post('/search-global-barcode', async (req: Request, res: Response) => {
  try {
    const { barcode } = req.body as { barcode: string };

    if (!barcode) {
      return res.status(400).json({ error: 'barcode is required' });
    }

    console.log(`🌐 Searching global product by barcode: ${barcode}`);

    const { data, error } = await supabaseAdmin
      .rpc('search_global_product_by_barcode', {
        barcode_value: barcode
      });

    if (error) {
      console.error('❌ Error searching global product:', error);
      return res.status(500).json({ error: error.message });
    }

    if (data && data.length > 0) {
      const product = data[0];
      console.log(`✅ Found global product: ${product.name}`);

      // Map snake_case from DB to camelCase for frontend
      const mappedProduct = {
        ...product,
        imageUrl: product.image_url,
        defaultPrice: product.default_price
      };

      return res.json({ globalProduct: mappedProduct });
    }

    console.log(`ℹ️ No global product found with barcode: ${barcode}`);
    res.json({ globalProduct: null });
  } catch (error: any) {
    console.error('❌ Error in search-global-barcode:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Create global product
router.post('/create-global-product', async (req: Request, res: Response) => {
  try {
    const { barcode, name, brand, category, unit, size, defaultPrice, imageUrl } = req.body as {
      barcode: string;
      name: string;
      brand?: string;
      category?: string;
      unit?: string;
      size?: string;
      defaultPrice?: number;
      imageUrl?: string;
    };
    const user = (req as any).user as { id: string };

    if (!barcode || !name) {
      return res.status(400).json({ error: 'barcode and name are required' });
    }

    console.log(`➕ Creating global product: ${name} (${barcode})`);

    const { data, error } = await supabaseAdmin
      .from('global_products')
      .insert({
        barcode,
        name,
        brand,
        category,
        unit,
        size,
        default_price: defaultPrice,
        image_url: imageUrl,
        created_by: user.id
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Error creating global product:', error);
      return res.status(500).json({ error: error.message });
    }

    console.log(`✅ Created global product: ${data.name}`);
    res.json({ globalProduct: data });
  } catch (error: any) {
    console.error('❌ Error in create-global-product:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

export default router;

