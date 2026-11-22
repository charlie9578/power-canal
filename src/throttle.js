// An eleven-position combined gear/throttle lever: five ahead, neutral, five astern.
export const THROTTLE_STEPS=5;
export const clampNotch=n=>Math.max(-THROTTLE_STEPS,Math.min(THROTTLE_STEPS,Math.round(n)));
export const throttleFromNotch=notch=>clampNotch(notch)/THROTTLE_STEPS;

// With the thumb centre travelling from 8% (full ahead) to 92% (full astern).
export function notchFromTrackPosition(clientY,top,height) {
  if(height<=0) return 0;
  const fraction=(clientY-top)/height;
  return clampNotch((0.5-fraction)*THROTTLE_STEPS/0.42);
}
export const positionForNotch=notch=>50-(clampNotch(notch)/THROTTLE_STEPS)*42;
export function labelForNotch(notch) {
  const n=clampNotch(notch);
  return n>0?'FWD '+n:n<0?'REV '+(-n):'NEUTRAL';
}
