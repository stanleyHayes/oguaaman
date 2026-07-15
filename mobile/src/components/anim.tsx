import type { ReactNode } from "react";
import { Platform, Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  FadeIn,
  FadeInUp,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  type SharedValue,
} from "react-native-reanimated";

/**
 * Motion helpers for the Oguaa app. Every helper honors the system
 * "reduce motion" setting (useReducedMotion) — with it on, content renders
 * still: no entering animations, no parallax, no press scaling.
 *
 * Entering animations (StaggerIn/RevealView) are DISABLED on web: Reanimated
 * v4 entering animations misfire on react-native-web after client-side
 * navigation — elements randomly stay stuck at their hidden initial values,
 * so whole screens appear not to load until refresh. Style-driven helpers
 * (parallax, press scale) do work on web and stay enabled.
 */

// Web renders entering-animated content still (see note above).
const stillOnWeb = Platform.OS === "web";

/** Fade-in-up entering (opacity + translateY 12→0), delayed by list position, capped at 8 steps. */
export function StaggerIn({ index = 0, children, style }: Readonly<{ index?: number; children: ReactNode; style?: StyleProp<ViewStyle> }>) {
  const reduced = useReducedMotion() || stillOnWeb;
  const entering = reduced
    ? undefined
    : FadeInUp.duration(300).delay(Math.min(index, 8) * 60).withInitialValues({ opacity: 0, transform: [{ translateY: 12 }] });
  return <Animated.View entering={entering} style={style}>{children}</Animated.View>;
}

/** Plain fade-in entering with an optional delay. */
export function RevealView({ delay = 0, children, style }: Readonly<{ delay?: number; children: ReactNode; style?: StyleProp<ViewStyle> }>) {
  const reduced = useReducedMotion() || stillOnWeb;
  const entering = reduced ? undefined : FadeIn.delay(delay).duration(280);
  return <Animated.View entering={entering} style={style}>{children}</Animated.View>;
}

/** Shared scroll offset for a screen's ScrollView — spread `onScroll` onto an Animated.ScrollView. */
export function useHeroParallax() {
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });
  return { scrollY, onScroll };
}

/** Slides its children at `speed` × the scroll offset — a gentle hero parallax. */
export function HeroParallax({ scrollY, speed = 0.4, children, style }: Readonly<{ scrollY: SharedValue<number>; speed?: number; children: ReactNode; style?: StyleProp<ViewStyle> }>) {
  const reduced = useReducedMotion();
  const anim = useAnimatedStyle(() => ({ transform: [{ translateY: reduced ? 0 : scrollY.value * speed }] }));
  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}

type PressScaleProps = Omit<PressableProps, "style" | "children"> & {
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

/** Pressable that springs to 0.97 scale while pressed — for standalone card links. */
export function PressScale({ children, style, ...rest }: Readonly<PressScaleProps>) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: reduced ? 1 : scale.value }] }));
  return (
    <Pressable
      {...rest}
      onPressIn={(e) => {
        // eslint-disable-next-line react-hooks/immutability -- shared values are mutated by design in Reanimated handlers
        scale.value = withSpring(0.97);
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        // eslint-disable-next-line react-hooks/immutability -- shared values are mutated by design in Reanimated handlers
        scale.value = withSpring(1);
        rest.onPressOut?.(e);
      }}
    >
      <Animated.View style={[style, anim]}>{children}</Animated.View>
    </Pressable>
  );
}
