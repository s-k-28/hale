import { View, type ViewProps } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { clean } from '@/theme/clean';

/**
 * Clean Dark screen skeleton (styles.css .screen-head / .screen-body / .cta-dock).
 * ONE skeleton for every screen: bg base, 24pt gutter, header zone, content
 * zone, and a pinned CTA dock with a SOLID floor + short fade cap (the design
 * chat banned translucent gradient docks — content was bleeding through).
 */

export function Screen({
  children,
  edges = ['top'],
  className = '',
  ...props
}: ViewProps & { children: React.ReactNode; edges?: Edge[]; className?: string }) {
  return (
    <SafeAreaView edges={edges} className={`flex-1 bg-bg ${className}`} {...props}>
      {children}
    </SafeAreaView>
  );
}

/** Header zone — gutter padding, sits under the status bar. */
export function ScreenHead({ className = '', ...props }: ViewProps & { className?: string }) {
  return <View className={`px-gutter pt-1 ${className}`} {...props} />;
}

/** Content zone — gutter padding. */
export function ScreenBody({ className = '', ...props }: ViewProps & { className?: string }) {
  return <View className={`flex-1 px-gutter ${className}`} {...props} />;
}

/**
 * Pinned action dock: absolute bottom, 16pt top / 30pt bottom padding,
 * solid bg floor with a 22pt fade cap above it.
 */
export function CtaDock({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <View className={`absolute bottom-0 left-0 right-0 ${className}`}>
      <LinearGradient
        colors={['rgba(11,15,13,0)', clean.bg]}
        style={{ height: 22 }}
        pointerEvents="none"
      />
      <View className="bg-bg px-gutter pb-[30px] pt-2">{children}</View>
    </View>
  );
}
