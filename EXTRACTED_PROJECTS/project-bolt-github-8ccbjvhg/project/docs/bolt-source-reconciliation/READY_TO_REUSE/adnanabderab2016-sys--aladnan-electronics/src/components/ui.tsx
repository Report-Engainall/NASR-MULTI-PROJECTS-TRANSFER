import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string;
  icon: ReactNode;
  trend?: { value: string; positive: boolean };
  freshness?: 'fresh' | 'warning' | 'stale' | 'unknown';
}

const freshnessColors: Record<string, string> = {
  fresh: 'bg-success-500',
  warning: 'bg-warning-500',
  stale: 'bg-error-500',
  unknown: 'bg-secondary-400',
};

const freshnessLabels: Record<string, string> = {
  fresh: 'حديث',
  warning: 'تحذير',
  stale: 'قديم',
  unknown: 'غير معروف',
};

export function StatCard({ label, value, icon, trend, freshness }: StatCardProps) {
  return (
    <div className="card card-hover p-5 animate-fade-in">
      <div className="flex items-start justify-between mb-3">
        <div className="w-11 h-11 rounded-xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center text-primary-600 dark:text-primary-400">
          {icon}
        </div>
        {freshness && (
          <div className="flex items-center gap-1.5">
            <span className={cn('w-2 h-2 rounded-full', freshnessColors[freshness])} />
            <span className="text-xs text-muted">{freshnessLabels[freshness]}</span>
          </div>
        )}
      </div>
      <p className="text-muted text-sm mb-1">{label}</p>
      <div className="flex items-baseline gap-2">
        <p className="text-2xl font-bold text-app">{value}</p>
        {trend && (
          <span
            className={cn(
              'text-xs font-medium',
              trend.positive ? 'text-success-600' : 'text-error-600'
            )}
          >
            {trend.positive ? '↑' : '↓'} {trend.value}
          </span>
        )}
      </div>
    </div>
  );
}

interface SectionCardProps {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function SectionCard({ title, children, action, className }: SectionCardProps) {
  return (
    <div className={cn('card animate-fade-in', className)}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-app">
        <h3 className="font-semibold text-app">{title}</h3>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-2xl bg-app flex items-center justify-center text-muted mb-4">
        {icon}
      </div>
      <h3 className="font-semibold text-app mb-1">{title}</h3>
      <p className="text-muted text-sm max-w-sm mb-4">{description}</p>
      {action}
    </div>
  );
}

interface LoadingStateProps {
  rows?: number;
}

export function LoadingState({ rows = 5 }: LoadingStateProps) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton h-12 w-full" />
      ))}
    </div>
  );
}

interface BadgeProps {
  variant: 'success' | 'warning' | 'error' | 'info' | 'neutral';
  children: ReactNode;
}

export function Badge({ variant, children }: BadgeProps) {
  const classes: Record<string, string> = {
    success: 'badge-success',
    warning: 'badge-warning',
    error: 'badge-error',
    info: 'badge-info',
    neutral: 'badge-neutral',
  };
  return <span className={classes[variant]}>{children}</span>;
}
