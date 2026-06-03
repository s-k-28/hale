import { type ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';
import { Body, Label } from './Text';

/**
 * SageNote — HALE's coach-warmth thread, rendered as PURE TYPOGRAPHY. Sage is our
 * mascot equivalent, but HALE's identity bans cartoon characters / bubbles / faces,
 * so the "voice" is a small-caps volt "SAGE" eyebrow over a warm first-person line.
 *
 *  • chip (default): a flat coal strip with a volt LEFT-RULE (a quote/voice rule,
 *    NOT a rounded speech bubble) — reads as "Sage is speaking" without a mascot.
 *  • chip={false}: bare eyebrow + line, for framing a hero question/headline.
 *
 * This is the ONE reusable Sage treatment so the coach reads as a single, consistent
 * character across Onboarding / Today / Relapse / Squad. Presentational only.
 */
export function SageNote({
  children,
  chip = true,
  className = '',
  ...rest
}: ViewProps & { children: ReactNode; chip?: boolean; className?: string }) {
  const inner = (
    <>
      <Label className="text-volt">Sage</Label>
      <Body className="mt-1 font-body-medium leading-snug text-chalk">{children}</Body>
    </>
  );
  if (!chip) {
    return (
      <View className={className} {...rest}>
        {inner}
      </View>
    );
  }
  return (
    <View
      className={`rounded-r-2xl border-l-2 border-volt/60 bg-coal/60 py-3 pl-4 pr-4 ${className}`}
      {...rest}
    >
      {inner}
    </View>
  );
}
