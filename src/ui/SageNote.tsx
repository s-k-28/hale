import { type ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';
import { Body, Eyebrow } from './Text';

/**
 * SageNote — HALE's coach-warmth thread, rendered as PURE TYPOGRAPHY. Sage is
 * our mascot equivalent, but the design bans cartoon characters / bubbles /
 * faces / AI glyphs, so the "voice" is a small-caps accent "SAGE" eyebrow over
 * a warm first-person line.
 *
 *  • chip (default): a flat surface strip with an accent LEFT-RULE (a quote
 *    rule, NOT a rounded speech bubble) — reads as "Sage is speaking".
 *  • chip={false}: bare eyebrow + line, for framing a hero question/headline.
 *
 * The ONE reusable Sage treatment so the coach reads as a single, consistent
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
      <Eyebrow className="text-accent">Sage</Eyebrow>
      <Body className="mt-1 font-sora-medium leading-snug text-fg">{children}</Body>
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
      className={`rounded-r-tile border-l-2 border-accent-deep bg-surface py-3 pl-4 pr-4 ${className}`}
      {...rest}
    >
      {inner}
    </View>
  );
}
