import { type ReactNode } from 'react'
import { ActivityIndicator } from 'react-native'
import { SafeAreaView, type Edge } from 'react-native-safe-area-context'
import { Text, XStack, YStack, styled, type GetProps } from 'tamagui'

/**
 * Bold Momentum primitives, Tamagui edition. Mirrors src/components/ui/* (the
 * NativeWind originals) so screens migrate with matching look + API.
 */

/** The dark Bold Momentum canvas every screen sits on. */
export function Screen({ children, edges = ['top'] }: { children: ReactNode; edges?: Edge[] }) {
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: '#0A0C0B' }}>
      {children}
    </SafeAreaView>
  )
}

/** Type scale — Anton display, Archivo headings (uppercase), Hanken body. */
export const Display = styled(Text, { fontFamily: '$display', color: '$chalk' })
export const Heading = styled(Text, {
  fontFamily: '$heading',
  color: '$chalk',
  textTransform: 'uppercase',
})
export const Body = styled(Text, { fontFamily: '$body', color: '$chalk' })
export const Label = styled(Text, {
  fontFamily: '$body',
  fontWeight: '600',
  fontSize: 11,
  lineHeight: 14,
  color: '$ash',
  textTransform: 'uppercase',
  letterSpacing: 1.9,
})

/** Small status chip. tone='volt' for active/streak, 'sos' for risk. */
export function Pill({
  children,
  tone = 'coal',
  ...rest
}: GetProps<typeof XStack> & { children: ReactNode; tone?: 'coal' | 'volt' | 'sos' }) {
  const c =
    tone === 'volt'
      ? { bg: '$voltSoft', border: '$voltEdge', text: '$volt' }
      : tone === 'sos'
        ? { bg: 'rgba(255,90,77,0.15)', border: 'rgba(255,90,77,0.40)', text: '$sos' }
        : { bg: '$coal', border: '$line', text: '$ash' }
  return (
    <XStack
      alignSelf="flex-start"
      alignItems="center"
      gap={6}
      borderRadius={999}
      borderWidth={1}
      backgroundColor={c.bg}
      borderColor={c.border}
      paddingHorizontal={12}
      paddingVertical={5}
      {...rest}
    >
      {typeof children === 'string' ? (
        <Text
          fontFamily="$body"
          fontWeight="600"
          fontSize={12}
          color={c.text}
          textTransform="uppercase"
          letterSpacing={0.4}
        >
          {children}
        </Text>
      ) : (
        children
      )}
    </XStack>
  )
}

type Variant = 'primary' | 'ghost' | 'surface' | 'danger'

/** Bold Momentum button. Primary = electric-lime block with near-black caps. */
export function Button({
  label,
  variant = 'primary',
  loading = false,
  disabled = false,
  ...rest
}: GetProps<typeof YStack> & { label: string; variant?: Variant; loading?: boolean }) {
  const off = disabled || loading
  const box: Record<Variant, { bg: string; press: string; text: string }> = {
    primary: { bg: '$volt', press: '$voltDim', text: '$voltInk' },
    ghost: { bg: 'transparent', press: '$coal', text: '$chalk' },
    surface: { bg: '$coal', press: '$card', text: '$chalk' },
    danger: { bg: '$sos', press: '$sos', text: '#FFFFFF' },
  }
  const v = box[variant]
  return (
    <YStack
      accessibilityRole="button"
      disabled={off}
      height={56}
      borderRadius={16}
      paddingHorizontal={24}
      flexDirection="row"
      alignItems="center"
      justifyContent="center"
      backgroundColor={v.bg}
      borderWidth={variant === 'ghost' ? 1 : 0}
      borderColor="$line"
      opacity={off ? 0.4 : 1}
      pressStyle={{ backgroundColor: v.press }}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? '#0A0C0B' : '#C6FF3D'} />
      ) : (
        <Text
          fontFamily="$heading"
          fontWeight="700"
          fontSize={15}
          color={v.text}
          textTransform="uppercase"
          letterSpacing={0.6}
        >
          {label}
        </Text>
      )}
    </YStack>
  )
}
