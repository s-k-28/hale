import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  haptics,
  initHaptics,
  setHapticsEnabled,
  getHapticsEnabled,
} from '../src/lib/haptics';

// The ONLY native module the vocabulary touches. Each fn resolves so the
// fire-and-forget `.catch()` chains stay happy.
jest.mock('expo-haptics', () => {
  const ImpactFeedbackStyle = { Light: 'light', Medium: 'medium', Heavy: 'heavy', Soft: 'soft', Rigid: 'rigid' };
  const NotificationFeedbackType = { Success: 'success', Warning: 'warning', Error: 'error' };
  return {
    ImpactFeedbackStyle,
    NotificationFeedbackType,
    impactAsync: jest.fn(() => Promise.resolve()),
    notificationAsync: jest.fn(() => Promise.resolve()),
    selectionAsync: jest.fn(() => Promise.resolve()),
  };
});

// Official AsyncStorage jest mock (in-memory, async).
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const KEY = 'hale:hapticsEnabled';
const impact = Haptics.impactAsync as jest.Mock;
const notify = Haptics.notificationAsync as jest.Mock;
const select = Haptics.selectionAsync as jest.Mock;

// jest-expo defaults Platform.OS to 'ios' (verified) — so the iOS guard passes
// without us patching it. Reset to a known default-on state before each test.
beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  setHapticsEnabled(true);
});

describe('Platform', () => {
  it('runs as iOS under jest-expo (the guard depends on it)', () => {
    const { Platform } = require('react-native');
    expect(Platform.OS).toBe('ios');
  });
});

describe('vocabulary → native mapping', () => {
  it('select() → selectionAsync', () => {
    haptics.select();
    expect(select).toHaveBeenCalledTimes(1);
    expect(impact).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('tap() → impact Light', () => {
    haptics.tap();
    expect(impact).toHaveBeenCalledWith('light');
  });

  it('press() → impact Medium', () => {
    haptics.press();
    expect(impact).toHaveBeenCalledWith('medium');
  });

  it('heavy() → impact Heavy', () => {
    haptics.heavy();
    expect(impact).toHaveBeenCalledWith('heavy');
  });

  it('soft() → impact Soft', () => {
    haptics.soft();
    expect(impact).toHaveBeenCalledWith('soft');
  });

  it('rigid() → impact Rigid', () => {
    haptics.rigid();
    expect(impact).toHaveBeenCalledWith('rigid');
  });

  it('success() → notification Success', () => {
    haptics.success();
    expect(notify).toHaveBeenCalledWith('success');
  });

  it('warn() → notification Warning', () => {
    haptics.warn();
    expect(notify).toHaveBeenCalledWith('warning');
  });

  it('error() → notification Error', () => {
    haptics.error();
    expect(notify).toHaveBeenCalledWith('error');
  });

  it("breath('in') → impact Soft, breath('out') → impact Light", () => {
    haptics.breath('in');
    expect(impact).toHaveBeenLastCalledWith('soft');
    haptics.breath('out');
    expect(impact).toHaveBeenLastCalledWith('light');
  });
});

describe('disabled state', () => {
  it('fires nothing when disabled', () => {
    setHapticsEnabled(false);
    haptics.select();
    haptics.tap();
    haptics.press();
    haptics.heavy();
    haptics.soft();
    haptics.rigid();
    haptics.success();
    haptics.warn();
    haptics.error();
    haptics.breath('in');
    expect(select).not.toHaveBeenCalled();
    expect(impact).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });
});

describe('preference: default-on + hydration', () => {
  it('hydrates to enabled when no value is stored (default-on)', async () => {
    setHapticsEnabled(false); // dirty the in-memory flag first
    await AsyncStorage.removeItem(KEY);
    await initHaptics();
    expect(getHapticsEnabled()).toBe(true);
  });

  it("hydrates to enabled for any non-'false' stored value", async () => {
    await AsyncStorage.setItem(KEY, 'true');
    await initHaptics();
    expect(getHapticsEnabled()).toBe(true);
  });

  it("hydrates to DISABLED only for a literal 'false'", async () => {
    await AsyncStorage.setItem(KEY, 'false');
    await initHaptics();
    expect(getHapticsEnabled()).toBe(false);
  });
});

describe('setHapticsEnabled', () => {
  it('persists the flag', async () => {
    setHapticsEnabled(false);
    expect(await AsyncStorage.getItem(KEY)).toBe('false');
    setHapticsEnabled(true);
    expect(await AsyncStorage.getItem(KEY)).toBe('true');
  });

  it('takes effect immediately (no await needed)', () => {
    setHapticsEnabled(false);
    expect(getHapticsEnabled()).toBe(false);
    haptics.press();
    expect(impact).not.toHaveBeenCalled();

    setHapticsEnabled(true);
    haptics.press();
    expect(impact).toHaveBeenCalledWith('medium');
  });
});

describe('celebrate() — the reward burst', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('fires success → soft → medium in order at ~0/150/300ms', () => {
    haptics.celebrate();
    // t=0: success only.
    expect(notify).toHaveBeenCalledWith('success');
    expect(impact).not.toHaveBeenCalled();

    jest.advanceTimersByTime(150);
    expect(impact).toHaveBeenLastCalledWith('soft');

    jest.advanceTimersByTime(150); // → 300ms
    expect(impact).toHaveBeenLastCalledWith('medium');
    expect(impact).toHaveBeenCalledTimes(2);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('stops the remaining beats if haptics are disabled mid-sequence', () => {
    haptics.celebrate();
    expect(notify).toHaveBeenCalledTimes(1); // success already fired

    setHapticsEnabled(false); // disable before the timers run
    jest.advanceTimersByTime(400);
    expect(impact).not.toHaveBeenCalled();
  });
});
