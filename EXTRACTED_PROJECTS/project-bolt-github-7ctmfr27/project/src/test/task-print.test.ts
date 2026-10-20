import { describe, expect, it } from 'vitest';
import { filterTasksForPrint } from '@/lib/task-print';
import type { OperationalTaskRole } from '@/lib/types';

const tasks: Array<{ id: string; task_role: OperationalTaskRole }> = [
  { id: 'sales-1', task_role: 'sales' },
  { id: 'accounting-1', task_role: 'accountant' },
  { id: 'warehouse-1', task_role: 'warehouse' },
  { id: 'purchase-1', task_role: 'purchasing' },
  { id: 'management-1', task_role: 'management' },
  { id: 'operations-1', task_role: 'operations' },
];

describe('role-scoped operational task printing', () => {
  const allRoles: OperationalTaskRole[] = ['sales','accountant','warehouse','purchasing','management','operations'];

  it('prints every row that the current account is allowed to see when scope is all', () => {
    expect(filterTasksForPrint(tasks, 'all', allRoles).map((task) => task.id)).toEqual(tasks.map((task) => task.id));
  });

  it.each([
    ['sales', 'sales-1'],
    ['accountant', 'accounting-1'],
    ['warehouse', 'warehouse-1'],
    ['purchasing', 'purchase-1'],
    ['management', 'management-1'],
  ] as const)('prints only the %s role with preserved upstream filters', (role, id) => {
    const alreadyFiltered = tasks.filter((task) => task.id !== 'sales-1');
    const printable = filterTasksForPrint(alreadyFiltered, role, allRoles);
    expect(printable.map((task) => task.id)).toEqual(role === 'sales' ? [] : [id]);
  });

  it('does not expose a role omitted from current-account permissions, even if requested by stale UI state', () => {
    const staffRoles: OperationalTaskRole[] = ['sales','warehouse','purchasing','operations'];
    expect(filterTasksForPrint(tasks, 'all', staffRoles).map((task) => task.task_role))
      .toEqual(staffRoles);
    expect(filterTasksForPrint(tasks, 'accountant', staffRoles)).toEqual([]);
    expect(filterTasksForPrint(tasks, 'management', staffRoles)).toEqual([]);
  });

  it('returns no printable tasks rather than inventing content when there are no matches', () => {
    expect(filterTasksForPrint([], 'all', allRoles)).toEqual([]);
  });
});
