import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

/**
 * Fires when a modal is genuinely off screen — not merely asked to close.
 *
 * iOS presents every RN Modal as a real UIViewController, and UIKit refuses
 * to present one on a controller that's already presenting: the request is
 * dropped with a console warning and nothing appears. So a modal opened on
 * the same tick another one closes never shows up at all, because "closed"
 * at the React level only means the dismissal has been *requested*.
 *
 * Modal's own `onDismiss` fires from the native dismissal's completion
 * block, which is the earliest moment the next modal can safely present.
 * It's iOS-only by design (see Modal.js) — Android has neither the
 * restriction nor the callback, so there the modal is gone as soon as it
 * stops rendering.
 *
 * Pass the same `visible` value the Modal gets, and spread the result onto
 * it:
 *
 *   const hiddenProps = useOnModalHidden(visible, onHidden);
 *   <Modal visible={visible} {...hiddenProps} />
 */
export function useOnModalHidden(visible: boolean, onHidden: () => void) {
  // Held in a ref so callers can pass an inline closure without the effect
  // below re-running (and re-latching `wasVisible`) on every render.
  const onHiddenRef = useRef(onHidden);
  onHiddenRef.current = onHidden;

  const wasVisible = useRef(visible);

  useEffect(() => {
    const justHidden = wasVisible.current && !visible;
    wasVisible.current = visible;
    // iOS reports this itself, and more accurately — the dismissal is still
    // animating at this point.
    if (justHidden && Platform.OS !== 'ios') {
      onHiddenRef.current();
    }
  }, [visible]);

  return { onDismiss: () => onHiddenRef.current() };
}
