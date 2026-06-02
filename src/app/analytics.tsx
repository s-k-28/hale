import { useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useConvexAuth, useQuery } from 'convex/react';
import Svg, { Defs, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { ChevronLeft, Crown, LineChart as LineChartIcon, TrendingDown } from 'lucide-react-native';
import { api } from '@convex/_generated/api';
import { track, Ev } from '@/lib/analytics';
import { usePremium } from '@/hooks/usePremium';
import { Screen } from '@/components/ui/Screen';
import { Display, Heading, Body, Label } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { StatTile } from '@/components/ui/StatTile';
import { Pill } from '@/components/ui/Pill';
import { colors } from '@/theme/colors';

/**
 * Analytics (I5) — craving-trend & recovery analytics, HALE+ gated.
 *
 * Two free queries the user already owns the data for:
 *   • api.analytics.cravingTrend    → 30 days of { date, count, avgIntensity }
 *   • api.analytics.recoverySummary → { reached, total, nextLabel }
 *
 * Gate: usePremium(). Locked → a tasteful "Unlock HALE+" prompt that pushes the
 * paywall. Premium → a craving-frequency bar chart + an intensity trend line
 * (react-native-svg) and the recovery progress bar. Bold Momentum (lime on void).
 *
 * Entry point: wire from the You screen's HALE+ section -> router.push('/analytics').
 * Registered automatically (file route); no _layout edit needed.
 */

const MAX_INTENSITY = 5; // cravings.intensity is 1..5

function fmtDay(date: string) {
  // "YYYY-MM-DD" → day-of-month number for sparse axis labels.
  const d = Number(date.slice(8, 10));
  return String(d);
}

export default function Analytics() {
  const { isAuthenticated } = useConvexAuth();
  const { hasAccess, loading } = usePremium();

  // Gate on hasAccess (premium OR active trial) — trial users get insights
  // unlocked from minute one (§8). Only fetch once authed + entitled — no
  // wasted reads behind the lock.
  const enabled = isAuthenticated && hasAccess;
  const trend = useQuery(api.analytics.cravingTrend, enabled ? {} : 'skip');
  const recovery = useQuery(api.analytics.recoverySummary, enabled ? {} : 'skip');

  // Fire a view event once, per surface (locked vs unlocked), after gate resolves.
  const viewedRef = useRef(false);
  useEffect(() => {
    if (loading || viewedRef.current) return;
    viewedRef.current = true;
    track(Ev.ANALYTICS_VIEWED, { locked: !hasAccess });
  }, [loading, hasAccess]);

  return (
    <Screen edges={['top', 'bottom']}>
      {/* Header — back chevron + loud wordmark, HALE+ badge anchored right. */}
      <View className="flex-row items-center justify-between px-5 pb-2 pt-3">
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/you'))}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Back"
            className="h-9 w-9 items-center justify-center rounded-full border border-line bg-coal active:opacity-70"
          >
            <ChevronLeft color={colors.ash} size={20} strokeWidth={2.5} />
          </Pressable>
          <View>
            <Label className="text-volt">Your data</Label>
            <Heading className="mt-0.5 text-3xl leading-[0.9]">INSIGHTS</Heading>
          </View>
        </View>
        <Pill tone="volt">
          <Crown color={colors.volt} size={13} strokeWidth={2.75} />
          <Label className="text-volt">HALE+</Label>
        </Pill>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.volt} />
        </View>
      ) : !hasAccess ? (
        <LockedPrompt />
      ) : (
        <Unlocked trend={trend} recovery={recovery} />
      )}
    </Screen>
  );
}

/* ------------------------------------------------------------------ */
/* Locked — tasteful HALE+ upsell into the paywall                     */
/* ------------------------------------------------------------------ */

function LockedPrompt() {
  const goPaywall = () => {
    track(Ev.PAYWALL_VIEWED, { source: 'analytics' });
    router.push('/paywall');
  };
  return (
    <View className="flex-1 px-5 pb-8 pt-6">
      {/* A blurred-energy teaser: faux chart bars behind the lock so the user
          sees the shape of what they're unlocking, not an empty wall. */}
      <View className="overflow-hidden rounded-3xl border border-line bg-coal">
        <View className="h-1.5 bg-volt" />
        <View className="px-6 py-8">
          <View className="h-32 flex-row items-end justify-between opacity-30">
            {[0.4, 0.7, 0.5, 0.9, 0.6, 0.8, 0.45, 0.7, 1, 0.55].map((h, i) => (
              <View
                key={i}
                style={{ height: `${h * 100}%`, width: 14 }}
                className="rounded-t-md bg-volt"
              />
            ))}
          </View>

          <View className="mt-8 items-center">
            <View className="h-14 w-14 items-center justify-center rounded-2xl bg-volt">
              <LineChartIcon color={colors.voltInk} size={26} strokeWidth={2.5} />
            </View>
            <Heading className="mt-5 text-center text-2xl leading-tight">
              SEE YOUR PATTERNS
            </Heading>
            <Body className="mt-3 text-center text-[15px] leading-relaxed text-ash">
              Unlock craving trends, intensity over time, and your full recovery
              timeline. Spot what sets you off — and watch it fade.
            </Body>
          </View>
        </View>
      </View>

      <View className="mt-auto">
        <Button label="UNLOCK HALE+" variant="primary" onPress={goPaywall} />
        <Body className="mt-4 px-2 text-center text-xs leading-relaxed text-ash">
          Your craving log and recovery data are always yours — HALE+ turns them
          into the picture that keeps you free.
        </Body>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Unlocked — charts + recovery progress                               */
/* ------------------------------------------------------------------ */

type TrendDay = { date: string; count: number; avgIntensity: number };
type Recovery = { reached: number; total: number; nextLabel: string | null };

function Unlocked({
  trend,
  recovery,
}: {
  trend: TrendDay[] | undefined;
  recovery: Recovery | undefined;
}) {
  if (trend === undefined || recovery === undefined) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator color={colors.volt} />
      </View>
    );
  }

  const total30 = trend.reduce((s, d) => s + d.count, 0);
  const loggedDays = trend.filter((d) => d.count > 0);
  const avgIntensity =
    loggedDays.length === 0
      ? 0
      : loggedDays.reduce((s, d) => s + d.avgIntensity, 0) / loggedDays.length;

  // First-half vs second-half craving volume → a simple "trending down" read.
  const half = Math.floor(trend.length / 2);
  const firstHalf = trend.slice(0, half).reduce((s, d) => s + d.count, 0);
  const secondHalf = trend.slice(half).reduce((s, d) => s + d.count, 0);
  const improving = total30 > 0 && secondHalf < firstHalf;

  return (
    <ScrollView
      contentContainerClassName="px-5 pb-16 pt-2"
      showsVerticalScrollIndicator={false}
    >
      {/* Headline stats */}
      <View className="mb-3 flex-row gap-3">
        <StatTile label="Cravings, 30d" value={String(total30)} accent />
        <StatTile
          label="Avg intensity"
          value={avgIntensity > 0 ? avgIntensity.toFixed(1) : '—'}
        />
      </View>

      {improving ? (
        <View className="mb-6 flex-row items-center gap-2 rounded-2xl border border-line bg-coal px-4 py-3">
          <TrendingDown color={colors.volt} size={18} strokeWidth={2.75} />
          <Body className="flex-1 text-[13px] leading-relaxed text-chalk">
            Cravings are easing — fewer in the last two weeks than the two before.
          </Body>
        </View>
      ) : null}

      {/* Craving frequency — bar chart */}
      <Label className="mb-3">Craving frequency · 30 days</Label>
      {total30 === 0 ? (
        <EmptyChart message="No cravings logged in the last 30 days. Every craving you log here sharpens this picture." />
      ) : (
        <View className="mb-8 rounded-3xl border border-line bg-coal p-4">
          <FrequencyBars data={trend} />
        </View>
      )}

      {/* Intensity trend — line chart over logged days */}
      <Label className="mb-3">Intensity over time</Label>
      {loggedDays.length < 2 ? (
        <EmptyChart message="Log cravings across a few days to see how their intensity trends." />
      ) : (
        <View className="mb-8 rounded-3xl border border-line bg-coal p-4">
          <IntensityLine data={trend} />
          <View className="mt-3 flex-row items-center justify-between">
            <Label className="normal-case tracking-normal text-ash">Calmer</Label>
            <Label className="normal-case tracking-normal text-ash">More intense</Label>
          </View>
        </View>
      )}

      {/* Recovery progress */}
      <Label className="mb-3">Recovery progress</Label>
      <RecoveryProgress recovery={recovery} />

      <Body className="mt-4 px-1 text-xs leading-relaxed text-ash">
        Commonly reported recovery timeline — supportive, not medical advice.
      </Body>
    </ScrollView>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <View className="mb-8 rounded-3xl border border-line bg-coal p-6">
      <Body className="text-[15px] leading-relaxed text-ash">{message}</Body>
    </View>
  );
}

/* ---- Craving frequency bar chart (react-native-svg) --------------- */

function FrequencyBars({ data }: { data: TrendDay[] }) {
  const W = 300;
  const H = 140;
  const n = data.length;
  const maxCount = Math.max(1, ...data.map((d) => d.count));
  const gap = 2;
  const slot = W / n;
  const barW = Math.max(2, slot - gap);

  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      {data.map((d, i) => {
        const h = d.count === 0 ? 0 : Math.max(3, (d.count / maxCount) * (H - 8));
        const x = i * slot + gap / 2;
        const y = H - h;
        return (
          <Rect
            key={d.date}
            x={x}
            y={y}
            width={barW}
            height={h}
            rx={1.5}
            fill={d.count === 0 ? colors.line : colors.volt}
            opacity={d.count === 0 ? 1 : 0.92}
          />
        );
      })}
    </Svg>
  );
}

/* ---- Intensity trend line chart (react-native-svg) ---------------- */

function IntensityLine({ data }: { data: TrendDay[] }) {
  const W = 300;
  const H = 140;
  const padX = 4;
  const padY = 10;
  const n = data.length;

  // y maps 0..MAX_INTENSITY to the chart height (inverted: high = top).
  const yOf = (v: number) => padY + (1 - v / MAX_INTENSITY) * (H - padY * 2);
  const xOf = (i: number) => padX + (i / Math.max(1, n - 1)) * (W - padX * 2);

  // Build a path over only the days that have a value; carry the last known
  // value across gaps so the line stays continuous and readable.
  let last = 0;
  const points = data.map((d, i) => {
    if (d.count > 0) last = d.avgIntensity;
    return { x: xOf(i), y: yOf(last), real: d.count > 0 };
  });

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const area = `${line} L${points[points.length - 1].x},${H} L${points[0].x},${H} Z`;

  // Reference gridlines at intensity 1..5.
  const grid = [1, 2, 3, 4, 5];

  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <Defs>
        <LinearGradient id="intensityFill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.volt} stopOpacity={0.28} />
          <Stop offset="1" stopColor={colors.volt} stopOpacity={0} />
        </LinearGradient>
      </Defs>

      {grid.map((g) => (
        <Line
          key={g}
          x1={0}
          x2={W}
          y1={yOf(g)}
          y2={yOf(g)}
          stroke={colors.line}
          strokeWidth={1}
        />
      ))}

      <Path d={area} fill="url(#intensityFill)" />
      <Path
        d={line}
        stroke={colors.volt}
        strokeWidth={2.5}
        fill="none"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}

/* ---- Recovery progress -------------------------------------------- */

function RecoveryProgress({ recovery }: { recovery: Recovery }) {
  const pct =
    recovery.total === 0 ? 0 : Math.round((recovery.reached / recovery.total) * 100);
  return (
    <View className="rounded-3xl border border-line bg-coal p-5">
      <View className="flex-row items-end justify-between">
        <View>
          <Display className="text-5xl leading-tight tracking-tight text-volt">
            {recovery.reached}
            <Display className="text-2xl text-ash">/{recovery.total}</Display>
          </Display>
          <Label className="mt-2 normal-case tracking-normal text-ash">
            recovery milestones reached
          </Label>
        </View>
        <Display className="text-3xl text-chalk">{pct}%</Display>
      </View>

      {/* Lime progress track */}
      <View className="mt-5 h-3 overflow-hidden rounded-full bg-void">
        <View style={{ width: `${pct}%` }} className="h-full rounded-full bg-volt" />
      </View>

      {recovery.nextLabel ? (
        <View className="mt-5 flex-row items-start">
          <View className="mr-3 mt-0.5 h-7 w-7 items-center justify-center rounded-full border border-line bg-void">
            <Crown color={colors.volt} size={14} strokeWidth={2.5} />
          </View>
          <View className="flex-1">
            <Label className="text-volt">Next up</Label>
            <Body className="mt-1 text-[15px] leading-relaxed text-chalk">
              {recovery.nextLabel}
            </Body>
          </View>
        </View>
      ) : (
        <Body className="mt-5 text-[15px] leading-relaxed text-chalk">
          Every tracked recovery milestone reached. Your body has come a long way.
        </Body>
      )}
    </View>
  );
}
