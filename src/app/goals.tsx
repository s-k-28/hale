import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { Redirect, router } from 'expo-router';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { Check, ChevronLeft, Gift, Plus, Trash2, X } from 'lucide-react-native';
import { api } from '@convex/_generated/api';
import { track, Ev } from '@/lib/analytics';
import { Screen } from '@/components/ui/Screen';
import { Display, Heading, Body, Label } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Pill } from '@/components/ui/Pill';
import { colors } from '@/theme/colors';

/**
 * "Treat yourself" — savings goals (P4).
 *
 * Reframes the abstract "$ saved" counter into something tangible: name the
 * thing you're buying with your clean time, set a dollar target, and watch a
 * lime progress bar fill toward a "$X to go" countdown. Reached goals flip to a
 * proud "Treat unlocked" state.
 *
 * Grounded in the goal/savings pattern from quit/finance apps (I Am Sober's
 * savings goals, Qapital/Digit jars): one concrete reward per goal, a single
 * visible bar, and a celebratory completed state. Bold Momentum throughout.
 *
 * Reactive: api.goals.myGoals is the single source of truth and ticks live as
 * money saved grows (same math as Today/You). Non-tab route — pushed from the
 * You screen (see entry-point note in the summary).
 */

const QUICK_TARGETS = [50, 100, 250, 500];

function money(n: number) {
  return `$${Math.max(0, n).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function money2(n: number) {
  return `$${Math.max(0, n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

type Goal = NonNullable<ReturnType<typeof useQuery<typeof api.goals.myGoals>>>[number];

export default function Goals() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const goals = useQuery(api.goals.myGoals, isAuthenticated ? {} : 'skip');

  if (isLoading || (isAuthenticated && goals === undefined)) {
    return (
      <Screen className="items-center justify-center">
        <ActivityIndicator color={colors.volt} />
      </Screen>
    );
  }
  if (!isAuthenticated) return <Redirect href="/(onboarding)/welcome" />;

  return <GoalsContent goals={goals ?? []} />;
}

function GoalsContent({ goals }: { goals: Goal[] }) {
  const setGoal = useMutation(api.goals.setGoal);
  const deleteGoal = useMutation(api.goals.deleteGoal);

  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targetNum = useMemo(() => {
    const n = parseFloat(amount.replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }, [amount]);

  const canSave = label.trim().length > 0 && targetNum > 0 && !saving;

  const onAdd = async () => {
    if (!canSave) return;
    Keyboard.dismiss();
    setSaving(true);
    setError(null);
    try {
      await setGoal({ label: label.trim(), targetAmount: targetNum });
      track(Ev.SAVINGS_GOAL_SET, { target_amount: targetNum });
      setLabel('');
      setAmount('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that goal');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (id: Goal['_id']) => {
    try {
      await deleteGoal({ goalId: id });
      track(Ev.GOAL_DELETED);
    } catch {
      // best-effort; reactivity keeps the list honest
    }
  };

  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/you');
  };

  return (
    <Screen edges={['top']}>
      <ScrollView
        contentContainerClassName="px-5 pb-16 pt-3"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header — back chip + loud wordmark. */}
        <View className="mb-6 flex-row items-center justify-between">
          <Pressable
            onPress={back}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Back"
            className="h-9 w-9 items-center justify-center rounded-full border border-line bg-coal active:opacity-70"
          >
            <ChevronLeft color={colors.ash} size={18} strokeWidth={2.5} />
          </Pressable>
          <Pill tone="volt">
            <Gift color={colors.volt} size={13} strokeWidth={2.75} />
            <Label className="text-volt">Treat yourself</Label>
          </Pill>
        </View>

        <View className="mb-7">
          <Heading className="text-5xl leading-[0.9]">TREAT{'\n'}YOURSELF</Heading>
          <Body className="mt-3 text-base leading-relaxed text-ash">
            Every clean day buys back real money. Name what you&apos;re saving for,
            watch it fill.
          </Body>
        </View>

        {/* New goal composer — coal card, lime add button. */}
        <View className="mb-8 rounded-3xl border border-line bg-coal p-5">
          <Label className="mb-2">What are you saving for?</Label>
          <TextInput
            value={label}
            onChangeText={(t) => {
              setLabel(t);
              if (error) setError(null);
            }}
            placeholder="A weekend away, new headphones…"
            placeholderTextColor={colors.ash}
            maxLength={60}
            returnKeyType="next"
            className="rounded-2xl border border-line bg-void px-4 py-3.5 font-body text-base text-chalk"
          />

          <Label className="mb-2 mt-5">Dollar target</Label>
          <View className="flex-row items-center rounded-2xl border border-line bg-void px-4">
            <Display className="text-2xl text-ash">$</Display>
            <TextInput
              value={amount}
              onChangeText={(t) => {
                setAmount(t.replace(/[^0-9.]/g, ''));
                if (error) setError(null);
              }}
              placeholder="100"
              placeholderTextColor={colors.ash}
              keyboardType="number-pad"
              returnKeyType="done"
              onSubmitEditing={onAdd}
              maxLength={9}
              className="flex-1 py-3.5 pl-2 font-display text-2xl text-chalk"
            />
          </View>

          {/* Quick-pick amounts. */}
          <View className="mt-3 flex-row flex-wrap gap-2">
            {QUICK_TARGETS.map((t) => {
              const active = targetNum === t;
              return (
                <Pressable
                  key={t}
                  onPress={() => {
                    setAmount(String(t));
                    if (error) setError(null);
                  }}
                  accessibilityRole="button"
                  className={`rounded-full border px-4 py-2 active:opacity-80 ${
                    active ? 'border-volt bg-volt/15' : 'border-line bg-void'
                  }`}
                >
                  <Body
                    className={`font-body-semibold text-xs ${active ? 'text-volt' : 'text-ash'}`}
                  >
                    {money(t)}
                  </Body>
                </Pressable>
              );
            })}
          </View>

          {error ? (
            <View className="mt-4 flex-row items-center gap-2">
              <X color={colors.sos} size={14} strokeWidth={3} />
              <Body className="text-xs text-sos">{error}</Body>
            </View>
          ) : null}

          <View className="mt-5">
            <Button
              label="Set this goal"
              variant="primary"
              loading={saving}
              disabled={!canSave}
              onPress={onAdd}
            />
          </View>
        </View>

        {/* Goal list. */}
        <Label className="mb-3">Your goals</Label>
        {goals.length === 0 ? (
          <View className="items-center rounded-3xl border border-line bg-coal px-6 py-10">
            <View className="mb-4 h-14 w-14 items-center justify-center rounded-2xl bg-volt">
              <Plus color={colors.voltInk} size={26} strokeWidth={2.75} />
            </View>
            <Heading className="text-center text-lg">NO GOALS YET</Heading>
            <Body className="mt-2 text-center text-sm leading-relaxed text-ash">
              Set your first treat above. The money you&apos;re not spending on
              nicotine adds up faster than you think.
            </Body>
          </View>
        ) : (
          <View className="gap-3">
            {goals.map((g) => (
              <GoalCard key={g._id} goal={g} onDelete={() => onDelete(g._id)} />
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

function GoalCard({ goal, onDelete }: { goal: Goal; onDelete: () => void }) {
  const pct = Math.round(goal.ratio * 100);
  const done = goal.reached;

  return (
    <View
      className={`overflow-hidden rounded-3xl border bg-coal ${
        done ? 'border-volt/40' : 'border-line'
      }`}
    >
      <View className="px-5 pt-5">
        <View className="flex-row items-start justify-between">
          <View className="flex-1 pr-3">
            <Body className="font-body-bold text-lg leading-snug text-chalk">{goal.label}</Body>
            <Label className="mt-1 normal-case tracking-normal text-ash">
              {money2(goal.saved)} of {money2(goal.targetAmount)}
            </Label>
          </View>
          <Pressable
            onPress={onDelete}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={`Delete goal ${goal.label}`}
            className="h-8 w-8 items-center justify-center rounded-full border border-line bg-void active:opacity-70"
          >
            <Trash2 color={colors.ash} size={15} strokeWidth={2.25} />
          </Pressable>
        </View>
      </View>

      {/* Lime progress bar. */}
      <View className="px-5 pb-2 pt-4">
        <View className="h-3 overflow-hidden rounded-full bg-void">
          <View
            className="h-3 rounded-full bg-volt"
            style={{ width: `${Math.max(done ? 100 : 4, pct)}%` }}
          />
        </View>
      </View>

      {/* Footer — countdown OR unlocked state. */}
      <View className="flex-row items-center justify-between px-5 pb-5 pt-2">
        {done ? (
          <View className="flex-row items-center gap-2">
            <View className="h-6 w-6 items-center justify-center rounded-full bg-volt">
              <Check color={colors.voltInk} size={14} strokeWidth={3} />
            </View>
            <Heading className="text-sm text-volt">Treat unlocked</Heading>
          </View>
        ) : (
          <View className="flex-row items-baseline gap-1.5">
            <Display className="text-2xl text-chalk">{money2(goal.remaining)}</Display>
            <Body className="font-body-semibold text-xs text-ash">to go</Body>
          </View>
        )}
        <Display className={`text-2xl ${done ? 'text-volt' : 'text-ash'}`}>{pct}%</Display>
      </View>
    </View>
  );
}
