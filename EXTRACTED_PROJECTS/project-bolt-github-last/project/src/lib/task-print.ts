import type { OperationalTaskRole } from '@/lib/types';

type HasTaskRole = { task_role: OperationalTaskRole };

/**
 * Selects a print scope from task rows already filtered by shared date/status/priority/assignee/search rules.
 * This is a second authorization guard in the UI; the database remains the source of truth.
 */
export function filterTasksForPrint<T extends HasTaskRole>(
  tasks: readonly T[],
  scope: OperationalTaskRole | 'all',
  allowedRoles: readonly OperationalTaskRole[],
): T[] {
  if (scope !== 'all' && !allowedRoles.includes(scope)) return [];
  return tasks.filter((task) =>
    allowedRoles.includes(task.task_role) && (scope === 'all' || task.task_role === scope),
  );
}
