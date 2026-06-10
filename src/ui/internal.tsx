import { Text } from 'react-native';

/** Bare RN Text re-export so primitives can compose labels without importing
 * the ramp (avoids circular imports). Not for use outside src/ui. */
export const RNText = Text;
