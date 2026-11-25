import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  Animated,
  PanResponder,
  Platform,
  type GestureResponderHandlers,
  type ScrollView,
  type View,
} from "react-native";
import { hitTest, sameHit, type Hit, type MeasuredSlot, type Slot } from "./hit";
import type { DragSubject, DropTarget } from "./model";

/** Pointer distance from the viewport edge where auto-scroll starts. */
const EDGE = 48;
/**
 * The ghost row's top sits this far below the pointer, so the insertion line under the
 * pointer stays visible. Negative because the code subtracts it.
 */
export const GHOST_OFFSET = -10;
/** A click that arrives this soon after a drop belongs to the drag, not to a press. */
const CLICK_GUARD_MS = 300;
/** Mouse movement that turns a press on a draggable row into a drag. */
const MOUSE_SLOP = 4;
/** Give up waiting for row measurements after this long and hit-test what arrived. */
const MEASURE_TIMEOUT_MS = 150;

const WEB = Platform.OS === "web";

/** The part of the browser window the drag reads. The plugin builds without DOM types. */
interface PointerTarget {
  window?: {
    addEventListener(type: "pointerdown", listener: (event: { pointerType: string }) => void, capture: boolean): void;
    removeEventListener(type: "pointerdown", listener: (event: { pointerType: string }) => void, capture: boolean): void;
  };
}

export interface DragController {
  register(id: string, slot: Slot, node: View | null): void;
  /** A press began on a draggable row. The drag starts only if the pointer then moves. */
  press(subject: DragSubject): void;
  /** Touch devices: a long press arms the pressed row and freezes scrolling. False for a mouse press. */
  armTouch(): boolean;
  /** The press ended without a drag. */
  release(): void;
  isDragging(): boolean;
  /** True right after a drop, so a row can ignore the click that ends the drag. */
  recentlyDropped(): boolean;
  onScroll(y: number): void;
  onContentHeight(height: number): void;
}

export interface DragView {
  controller: DragController;
  /** Spread on the View that wraps the whole list so moves anywhere in it continue the drag. */
  surfaceHandlers: GestureResponderHandlers;
  subject: DragSubject | null;
  /** The hit with its indicator converted to scroll-content coordinates. */
  hit: Hit | null;
  scrollLocked: boolean;
  ghostY: Animated.Value;
}

const DragContext = createContext<DragController | null>(null);
export const DragProvider = DragContext.Provider;

export function useDrag(): DragController {
  const controller = useContext(DragContext);
  if (!controller) throw new Error("useDrag must be used inside DragProvider");
  return controller;
}

export function useDragController(
  viewport: RefObject<View | null>,
  scroll: RefObject<ScrollView | null>,
  onDrop: (subject: DragSubject, target: DropTarget) => void,
): DragView {
  const [subject, setSubject] = useState<DragSubject | null>(null);
  const [hit, setHit] = useState<Hit | null>(null);
  const [scrollLocked, setScrollLocked] = useState(false);
  const ghostY = useRef(new Animated.Value(0)).current;
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  const engine = useMemo(() => {
    const nodes = new Map<string, { slot: Slot; node: View }>();
    let measured: MeasuredSlot[] = [];
    let measuring = false;
    let viewportTop = 0;
    let viewportHeight = 0;
    let scrollY = 0;
    let scrollAtStart = 0;
    let contentHeight = 0;
    let lastPageY = 0;
    let pressed: DragSubject | null = null;
    let touchArmed = false;
    let active: DragSubject | null = null;
    let current: Hit | null = null;
    let droppedAt = 0;
    let speed = 0;
    let timer: ReturnType<typeof setInterval> | null = null;
    let session = 0;
    /** Web: pointer type of the latest press. Phone browsers report "touch". */
    let lastPointerType = "mouse";
    /** The current press uses mouse rules: movement starts the drag, no long press. */
    let mousePress = false;

    const toContent = (next: Hit | null): Hit | null => {
      if (!next) return null;
      const shift = scrollAtStart - viewportTop;
      const indicator =
        next.indicator.kind === "line"
          ? { kind: "line" as const, y: next.indicator.y + shift }
          : { kind: "box" as const, y: next.indicator.y + shift, height: next.indicator.height };
      return { target: next.target, indicator };
    };

    const update = () => {
      if (!active || measuring) return;
      // Slots were measured at scrollAtStart; shift the pointer into that frame.
      const y = lastPageY + (scrollY - scrollAtStart);
      const next = hitTest(active, measured, y);
      if (sameHit(next, current)) return;
      current = next;
      setHit(toContent(next));
    };

    const stopScrolling = () => {
      speed = 0;
      if (timer) clearInterval(timer);
      timer = null;
    };

    const tick = () => {
      const max = Math.max(0, contentHeight - viewportHeight);
      const nextY = Math.min(max, Math.max(0, scrollY + speed));
      if (nextY === scrollY) return;
      scrollY = nextY;
      scroll.current?.scrollTo({ y: nextY, animated: false });
      update();
    };

    const autoScroll = () => {
      if (viewportHeight <= 0) return;
      const offset = lastPageY - viewportTop;
      speed =
        offset < EDGE
          ? -Math.ceil((EDGE - offset) / 4)
          : offset > viewportHeight - EDGE
            ? Math.ceil((offset - (viewportHeight - EDGE)) / 4)
            : 0;
      if (speed !== 0 && !timer) timer = setInterval(tick, 16);
      if (speed === 0) stopScrolling();
    };

    const start = (next: DragSubject, pageY: number) => {
      session += 1;
      const mine = session;
      active = next;
      current = null;
      lastPageY = pageY;
      scrollAtStart = scrollY;
      measured = [];
      measuring = true;
      setSubject(next);
      setHit(null);
      // A browser ends the row press, which unlocks scrolling, just before this grant. Lock
      // again so the list does not scroll under a finger that is dragging.
      if (!mousePress) setScrollLocked(true);
      const entries = [...nodes.values()];
      let remaining = entries.length;
      const finish = () => {
        if (mine !== session || !measuring) return;
        measuring = false;
        update();
      };
      // Hit-test once every row reported, so the target does not jump between partial layouts.
      setTimeout(finish, MEASURE_TIMEOUT_MS);
      const measureSlots = () => {
        if (remaining === 0) return finish();
        for (const { slot, node } of entries) {
          node.measureInWindow((_x, y, _width, height) => {
            if (mine !== session) return;
            if (height > 0) measured.push({ slot, y, height });
            remaining -= 1;
            if (remaining === 0) finish();
          });
        }
      };
      const frame = viewport.current;
      if (!frame) return measureSlots();
      frame.measureInWindow((_x, y, _width, height) => {
        if (mine !== session) return;
        viewportTop = y;
        viewportHeight = height;
        ghostY.setValue(lastPageY - viewportTop - GHOST_OFFSET);
        measureSlots();
      });
    };

    const move = (pageY: number) => {
      if (!active) return;
      lastPageY = pageY;
      ghostY.setValue(pageY - viewportTop - GHOST_OFFSET);
      autoScroll();
      update();
    };

    const end = (commit: boolean) => {
      stopScrolling();
      session += 1;
      const dropped = active;
      const target = measuring ? null : (current?.target ?? null);
      active = null;
      current = null;
      pressed = null;
      touchArmed = false;
      measured = [];
      measuring = false;
      if (dropped) droppedAt = Date.now();
      setSubject(null);
      setHit(null);
      setScrollLocked(false);
      if (commit && dropped && target) onDropRef.current(dropped, target);
    };

    const controller: DragController = {
      register(id, slot, node) {
        if (node) nodes.set(id, { slot, node });
        else nodes.delete(id);
      },
      press(next) {
        pressed = next;
        touchArmed = false;
        mousePress = WEB && lastPointerType === "mouse";
      },
      armTouch() {
        if (mousePress) return false;
        if (!pressed) return true;
        touchArmed = true;
        setScrollLocked(true);
        return true;
      },
      release() {
        // Keep `pressed`: the web responder may end the row press before the surface's
        // grant reads it. The next press clears it in the surface's start capture.
        if (active) return;
        touchArmed = false;
        setScrollLocked(false);
      },
      isDragging() {
        return active !== null;
      },
      recentlyDropped() {
        return Date.now() - droppedAt < CLICK_GUARD_MS;
      },
      onScroll(y) {
        scrollY = y;
        if (active) update();
      },
      onContentHeight(height) {
        contentHeight = height;
      },
    };

    // The surface wraps every row, so it stays on the responder path even when the
    // pointer leaves the pressed row in its first move.
    const surface = PanResponder.create({
      // Runs before the row's capture on every press, so a press outside draggable rows
      // never inherits an earlier row's subject.
      onStartShouldSetPanResponderCapture: () => {
        pressed = null;
        touchArmed = false;
        return false;
      },
      onMoveShouldSetPanResponderCapture: (_event, gesture) => {
        if (!pressed) return false;
        if (mousePress) return Math.abs(gesture.dx) > MOUSE_SLOP || Math.abs(gesture.dy) > MOUSE_SLOP;
        return touchArmed;
      },
      onPanResponderGrant: (_event, gesture) => {
        if (pressed) start(pressed, gesture.moveY);
      },
      onPanResponderMove: (_event, gesture) => move(gesture.moveY),
      onPanResponderRelease: () => end(true),
      onPanResponderTerminate: () => end(false),
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
    });

    const notePointer = (type: string) => {
      lastPointerType = type;
    };

    return {
      controller,
      surfaceHandlers: surface.panHandlers,
      cancel: () => end(false),
      notePointer,
    };
  }, [ghostY, scroll, viewport]);

  useEffect(() => {
    // pointerdown fires before the touch or mouse events the responder system reads.
    const target = WEB ? (globalThis as unknown as PointerTarget).window : undefined;
    const onPointerDown = (event: { pointerType: string }) => engine.notePointer(event.pointerType);
    target?.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      target?.removeEventListener("pointerdown", onPointerDown, true);
      engine.cancel();
    };
  }, [engine]);

  return {
    controller: engine.controller,
    surfaceHandlers: engine.surfaceHandlers,
    subject,
    hit,
    scrollLocked,
    ghostY,
  };
}

/** Registers a row as a drop slot. Returns a ref callback for the row's outer View. */
export function useDragSlot(id: string, slot: Slot): (node: View | null) => void {
  const controller = useDrag();
  const signature = JSON.stringify(slot);
  const slotRef = useRef(slot);
  slotRef.current = slot;
  return useCallback(
    (node: View | null) => controller.register(id, slotRef.current, node),
    // The signature changes when the slot moves to another group, which re-registers it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [controller, id, signature],
  );
}

export interface DragHandle {
  /** Spread on the View around the draggable row. Records the press without taking it. */
  pressCapture: { onStartShouldSetResponderCapture: () => boolean };
  /** Pass to the row's Pressable. Arms touch presses; a mouse press ignores it. */
  onLongPress: () => void;
  onPressOut: () => void;
}

/**
 * Makes a row draggable. With a mouse, moving 4 points while pressed starts the drag.
 * With touch, a long press arms the row first so ordinary swipes still scroll.
 * `onPress` is the row's own press action.
 */
export function useDragHandle(subject: DragSubject, onPress: () => void): DragHandle {
  const controller = useDrag();
  const subjectRef = useRef(subject);
  subjectRef.current = subject;
  const onPressRef = useRef(onPress);
  onPressRef.current = onPress;
  const mouseLongPress = useRef(false);

  const pressCapture = useMemo(
    () => ({
      onStartShouldSetResponderCapture: () => {
        controller.press(subjectRef.current);
        return false;
      },
    }),
    [controller],
  );
  const onLongPress = useCallback(() => {
    mouseLongPress.current = !controller.armTouch();
  }, [controller]);
  const onPressOut = useCallback(() => {
    controller.release();
    if (!mouseLongPress.current) return;
    mouseLongPress.current = false;
    // react-native-web drops the click after a long press, so a still mouse press would do
    // nothing. Run it here, after the drag surface had its chance to take the press.
    setTimeout(() => {
      if (!controller.isDragging()) onPressRef.current();
    }, 0);
  }, [controller]);

  return { pressCapture, onLongPress, onPressOut };
}
