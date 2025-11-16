import { Request, Response, NextFunction } from 'express';

export function requireRole(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    const userRoles: string[] = user?.roles || [];
    const has = userRoles.some((r) => roles.includes(r));
    if (!has) return res.status(403).json({ error: 'forbidden' });
    next();
  };
}
