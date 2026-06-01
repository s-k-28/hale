import { type ReactNode } from 'react';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

/** The dark Bold Momentum canvas every screen sits on. */
export function Screen({
  children,
  className = '',
  edges = ['top'],
}: {
  children: ReactNode;
  className?: string;
  edges?: Edge[];
}) {
  return (
    <SafeAreaView edges={edges} className={`flex-1 bg-void ${className}`}>
      {children}
    </SafeAreaView>
  );
}
