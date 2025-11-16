import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabase';
import { validateSyncData } from '../lib/validation';

const router = Router();

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

    for (const t of tables) {
      try {
        const { data, error } = await supabaseAdmin
          .from(t)
          .select('*')
          .gt('updated_at', since)
          .order('updated_at', { ascending: true })
          .limit(safeLimit);

        if (error) {
          console.error(`Error fetching ${t}:`, error);
          return res.status(500).json({ error: error.message, table: t });
        }
        result[t] = data ?? [];
      } catch (error: any) {
        console.error(`Error processing table ${t}:`, error);
        return res.status(500).json({ error: error.message || 'Unknown error', table: t });
      }
    }

    res.json({ changes: result, serverTime: new Date().toISOString() });
  } catch (error: any) {
    console.error('Error in sync/pull:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

router.post('/push', async (req: Request, res: Response) => {
  try {
    const { changes } = req.body as { changes: Record<string, Array<Record<string, any>>> };
    
    if (!changes || typeof changes !== 'object') {
      return res.status(400).json({ error: 'changes required and must be an object' });
    }

    // Validate tables
    const tables = Object.keys(changes);
    const invalidTables = tables.filter(t => !ALLOWED_TABLES.includes(t));
    if (invalidTables.length > 0) {
      return res.status(400).json({ error: `Invalid tables: ${invalidTables.join(', ')}` });
    }

    // Validate data for each table
    for (const [table, rows] of Object.entries(changes)) {
      if (!rows || !Array.isArray(rows)) {
        return res.status(400).json({ error: `Rows for table ${table} must be an array` });
      }

      if (rows.length === 0) continue;

      // Validate data structure
      const validation = validateSyncData(table, rows);
      if (!validation.valid) {
        return res.status(400).json({ 
          error: `Validation failed for table ${table}`,
          details: validation.errors 
        });
      }

      try {
        const { error } = await supabaseAdmin.from(table).upsert(rows, {
          onConflict: 'id',
          ignoreDuplicates: false,
        });

        if (error) {
          console.error(`Error upserting ${table}:`, error);
          return res.status(500).json({ error: error.message, table });
        }
      } catch (error: any) {
        console.error(`Error processing table ${table}:`, error);
        return res.status(500).json({ error: error.message || 'Unknown error', table });
      }
    }

    res.json({ ok: true });
  } catch (error: any) {
    console.error('Error in sync/push:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

export default router;
