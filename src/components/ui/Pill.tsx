import { Children, isValidElement, type ReactNode } from 'react';
import { View } from 'react-native';
import { Body } from './Text';

/**
 * Small status chip. Default = coal; tone='volt' for streak/active, 'sos' for risk.
 * Accepts string children (auto-wrapped in Body) AND element children (icons,
 * <Label/>) rendered as-is — so it composes with lucide icons + text.
 */
export function Pill({
  children,
  tone = 'coal',
  className = '',
}: {
  children: ReactNode;
  tone?: 'coal' | 'volt' | 'sos';
  className?: string;
}) {
  const box =
    tone === 'volt'
      ? 'bg-volt/15 border-volt/30'
      : tone === 'sos'
        ? 'bg-sos/15 border-sos/30'
        : 'bg-coal border-line';
  const text = tone === 'volt' ? 'text-volt' : tone === 'sos' ? 'text-sos' : 'text-ash';
  return (
    <View
      className={`flex-row items-center gap-1.5 self-start rounded-full border px-3 py-1 ${box} ${className}`}
    >
      {Children.map(children, (child) =>
        isValidElement(child) ? (
          child
        ) : child == null || child === false ? null : (
          <Body className={`font-body-semibold text-xs ${text}`}>{child}</Body>
        ),
      )}
    </View>
  );
}
