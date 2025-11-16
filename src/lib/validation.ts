export function validateProduct(product: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!product.name || typeof product.name !== 'string' || product.name.trim().length === 0) {
    errors.push('Nome do produto é obrigatório');
  }
  
  if (typeof product.price !== 'number' || product.price <= 0 || isNaN(product.price)) {
    errors.push('Preço deve ser um número maior que zero');
  }
  
  if (typeof product.purchase_price !== 'number' || product.purchase_price < 0 || isNaN(product.purchase_price)) {
    errors.push('Preço de compra deve ser um número válido');
  }
  
  if (typeof product.quantity !== 'number' || product.quantity < 0 || isNaN(product.quantity)) {
    errors.push('Quantidade deve ser um número válido');
  }
  
  return { valid: errors.length === 0, errors };
}

export function validateClient(client: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!client.name || typeof client.name !== 'string' || client.name.trim().length === 0) {
    errors.push('Nome do cliente é obrigatório');
  }
  
  return { valid: errors.length === 0, errors };
}

export function validateSale(sale: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!sale.type || !['receipt', 'invoice', 'invoice-receipt'].includes(sale.type)) {
    errors.push('Tipo de documento inválido');
  }
  
  if (typeof sale.total !== 'number' || sale.total <= 0 || isNaN(sale.total)) {
    errors.push('Total da venda deve ser um número maior que zero');
  }
  
  if (!sale.date || isNaN(Date.parse(sale.date))) {
    errors.push('Data deve ser válida');
  }
  
  return { valid: errors.length === 0, errors };
}

export function validateTransaction(transaction: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!transaction.type || !['revenue', 'expense'].includes(transaction.type)) {
    errors.push('Tipo de transação deve ser "revenue" ou "expense"');
  }
  
  if (!transaction.description || typeof transaction.description !== 'string' || transaction.description.trim().length === 0) {
    errors.push('Descrição é obrigatória');
  }
  
  if (typeof transaction.amount !== 'number' || transaction.amount <= 0 || isNaN(transaction.amount)) {
    errors.push('Valor deve ser um número maior que zero');
  }
  
  if (!transaction.date || isNaN(Date.parse(transaction.date))) {
    errors.push('Data deve ser válida');
  }
  
  return { valid: errors.length === 0, errors };
}

export function validateSyncData(table: string, rows: any[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!Array.isArray(rows)) {
    errors.push(`Dados para tabela ${table} devem ser um array`);
    return { valid: false, errors };
  }
  
  for (const row of rows) {
    switch (table) {
      case 'products':
        const productValidation = validateProduct(row);
        if (!productValidation.valid) {
          errors.push(...productValidation.errors.map(e => `Produto ${row.id || 'sem ID'}: ${e}`));
        }
        break;
      case 'clients':
        const clientValidation = validateClient(row);
        if (!clientValidation.valid) {
          errors.push(...clientValidation.errors.map(e => `Cliente ${row.id || 'sem ID'}: ${e}`));
        }
        break;
      case 'sales':
        const saleValidation = validateSale(row);
        if (!saleValidation.valid) {
          errors.push(...saleValidation.errors.map(e => `Venda ${row.id || 'sem ID'}: ${e}`));
        }
        break;
      case 'financial_transactions':
        const transactionValidation = validateTransaction(row);
        if (!transactionValidation.valid) {
          errors.push(...transactionValidation.errors.map(e => `Transação ${row.id || 'sem ID'}: ${e}`));
        }
        break;
    }
    
    // Ensure ID exists
    if (!row.id || typeof row.id !== 'string') {
      errors.push(`Registro na tabela ${table} sem ID válido`);
    }
  }
  
  return { valid: errors.length === 0, errors };
}

