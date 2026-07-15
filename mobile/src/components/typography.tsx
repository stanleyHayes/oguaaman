import { forwardRef } from "react";
import {
  Text as RNText,
  TextInput as RNTextInput,
  type Text as RNTextType,
  type TextInput as RNTextInputType,
  type TextInputProps,
  type TextProps,
} from "react-native";
import { SANS } from "@/theme";

/**
 * Brand default type. The spec is "Fraunces for display titles, Outfit for
 * everything else" — these wrappers make Outfit the family of every text node
 * by default. Their base style sits FIRST in the style array, so an explicit
 * fontFamily later (the S()/D()/SI()/DI() helpers from @/theme) always wins.
 *
 * Use `T` everywhere you'd use react-native's Text, and `TI` for TextInput.
 * (defaultProps no longer works — React 19 ignores it on function components,
 * and RN's Text is one.)
 */
export const T = forwardRef<RNTextType, TextProps>(function T({ style, ...rest }, ref) {
  return <RNText ref={ref} style={[{ fontFamily: SANS[400] }, style]} {...rest} />;
});

export const TI = forwardRef<RNTextInputType, TextInputProps>(function TI({ style, ...rest }, ref) {
  return <RNTextInput ref={ref} style={[{ fontFamily: SANS[400] }, style]} {...rest} />;
});
