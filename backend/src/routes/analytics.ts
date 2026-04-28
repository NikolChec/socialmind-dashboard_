import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { computeChildrenForScope } from '../services/analytics.js';

export const analyticsRouter = Router();
analyticsRouter.use(requireAuth);

analyticsRouter.get('/priority-distribution', (req, res) => {
  const { id, role, school_id } = req.auth!;
  const rows = computeChildrenForScope({ role, userId: id, schoolId: school_id });
  const out = rows
    .map((c) => ({
      child_id: c.id,
      child_name: c.display_name,
      grade: c.grade,
      unread_high: c.unread_high,
      unread_medium: c.unread_medium,
      unread_low: c.unread_low,
      total_high: c.total_high,
      total_medium: c.total_medium,
      total_low: c.total_low,
      total_alerts: c.total_high + c.total_medium + c.total_low,
    }))
    .sort(
      (a, b) =>
        b.unread_high - a.unread_high ||
        b.total_high - a.total_high ||
        b.total_alerts - a.total_alerts ||
        a.child_name.localeCompare(b.child_name)
    );
  res.json(out);
});
