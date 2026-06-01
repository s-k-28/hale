import { View } from 'react-native';
import { Display, Label } from './Text';

/** A loud stat block — coal surface, hairline border, optional lime value. */
export function StatTile({
  label,
  value,
  accent = false,
  className = '',
}: {
  label: string;
  value: string;
  accent?: boolean;
  className?: string;
}) {
  return (
    <View className={`flex-1 rounded-2xl border border-line bg-coal p-4 ${className}`}>
      <Label>{label}</Label>
      <Display className={`mt-1 text-3xl ${accent ? 'text-volt' : 'text-chalk'}`}>{value}</Display>
    </View>
  );
}
