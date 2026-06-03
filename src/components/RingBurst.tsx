import { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import { Canvas, Picture, Skia } from '@shopify/react-native-skia';
import { Easing, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';

const SIZE = 300;
const CX = SIZE / 2;
const CY = SIZE / 2;
const N = 20;

/**
 * Skia radial particle burst that emanates from the hero ring on a successful
 * check-in — the most-repeated reward moment, so it draws right where the streak
 * lives. Lime particles (with a few white sparks) fly outward with eased, varied
 * velocity, shrinking + fading over ~0.8s. Every particle is drawn in ONE Skia
 * Picture (a single UI-thread worklet redraws the whole field per frame), so it
 * stays cheap. Fires once on mount; the parent remounts it (keyed on the surge
 * counter) to re-fire. Overlay only — pointerEvents none, never affects layout
 * or taps. Pairs with RingGauge's brighten/scale flare (the ring "flares").
 */
export default function RingBurst({ onDone }: { onDone?: () => void }) {
  const recorder = useMemo(() => Skia.PictureRecorder(), []);
  const paint = useMemo(() => Skia.Paint(), []);
  // Precompute per-particle params once: even angular spread + per-index jitter
  // and varied speed/size so the burst reads organic, not a mechanical ring.
  const particles = useMemo(
    () =>
      Array.from({ length: N }, (_, i) => {
        const angle = (i / N) * Math.PI * 2 + (i % 3 === 0 ? 0.34 : i % 2 ? -0.22 : 0.1);
        const speed = 78 + ((i * 53) % 78); // 78..156 px
        const size = 2.4 + ((i * 17) % 34) / 10; // 2.4..5.8 px
        const white = i % 5 === 0; // ~1 in 5 is a white spark
        return { cos: Math.cos(angle), sin: Math.sin(angle), speed, size, white };
      }),
    [],
  );

  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withTiming(1, { duration: 820, easing: Easing.out(Easing.cubic) });
    const id = setTimeout(() => onDone?.(), 900);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const picture = useDerivedValue(() => {
    'worklet';
    const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, SIZE, SIZE));
    const tv = t.value;
    const ease = 1 - Math.pow(1 - tv, 3); // easeOutCubic distance
    for (let i = 0; i < N; i++) {
      const p = particles[i];
      const dist = p.speed * ease;
      const cx = CX + p.cos * dist;
      const cy = CY + p.sin * dist;
      // Pop in fast, then fade across the back ~88%.
      const raw = tv < 0.12 ? tv / 0.12 : 1 - (tv - 0.12) / 0.88;
      const a = Math.max(0, Math.min(1, raw));
      const r = Math.max(0.5, p.size * (1.15 - tv * 0.7));
      paint.setColor(Skia.Color(p.white ? `rgba(244,247,242,${a})` : `rgba(198,255,61,${a})`));
      canvas.drawCircle(cx, cy, r, paint);
    }
    return recorder.finishRecordingAsPicture();
  });

  return (
    <View
      style={{
        pointerEvents: 'none',
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Canvas style={{ width: SIZE, height: SIZE }}>
        <Picture picture={picture} />
      </Canvas>
    </View>
  );
}
