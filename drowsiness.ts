// Pure logic, no native deps. Feed it one eye-openness reading per frame.
export type Status = 'NO_FACE' | 'OK' | 'WARNING' | 'DROWSY';

export const CONFIG = {
  EYE_CLOSED_BELOW: 0.21,  // eye aspect ratio (EAR) under this = eyes closed
  CLOSED_MS_ALARM: 1500,   // eyes closed this long => alarm
  PERCLOS_WINDOW_MS: 30000,
  PERCLOS_ALARM: 0.3,      // >30% of window with eyes closed => alarm
  NO_FACE_MS: 3000,        // driver not visible this long => "look at road"
};

export class DrowsinessDetector {
  private closedSince: number | null = null;
  private samples: { t: number; closed: boolean }[] = [];
  private lastFaceAt = Date.now();

  /** eyeOpen: average EAR of both eyes, or null if no face this frame */
  update(eyeOpen: number | null, now = Date.now()): { status: Status; perclos: number } {
    if (eyeOpen === null) {
      this.closedSince = null;
      const status = now - this.lastFaceAt > CONFIG.NO_FACE_MS ? 'NO_FACE' : 'OK';
      return { status, perclos: this.perclos() };
    }
    this.lastFaceAt = now;
    const closed = eyeOpen < CONFIG.EYE_CLOSED_BELOW;

    this.samples.push({ t: now, closed });
    const cutoff = now - CONFIG.PERCLOS_WINDOW_MS;
    while (this.samples.length && this.samples[0].t < cutoff) this.samples.shift();

    if (closed) this.closedSince ??= now;
    else this.closedSince = null;

    const closedFor = this.closedSince ? now - this.closedSince : 0;
    const perclos = this.perclos();

    let status: Status = 'OK';
    if (closedFor >= CONFIG.CLOSED_MS_ALARM || perclos >= CONFIG.PERCLOS_ALARM) status = 'DROWSY';
    else if (closedFor >= CONFIG.CLOSED_MS_ALARM / 2) status = 'WARNING';
    return { status, perclos };
  }

  private perclos() {
    if (this.samples.length < 10) return 0;
    return this.samples.filter(s => s.closed).length / this.samples.length;
  }
}

// ---- Eye Aspect Ratio from MediaPipe's 478-point face mesh ----
// landmarks: flat Float32Array [x0,y0,z0, x1,y1,z1, ...]
const RIGHT_EYE = [33, 160, 158, 133, 153, 144];  // p1..p6
const LEFT_EYE  = [362, 385, 387, 263, 373, 380];

function ear(lm: ArrayLike<number>, idx: number[]): number {
  'worklet';
  const d = (a: number, b: number) => {
    const dx = lm[a * 3] - lm[b * 3];
    const dy = lm[a * 3 + 1] - lm[b * 3 + 1];
    return Math.sqrt(dx * dx + dy * dy);
  };
  const [p1, p2, p3, p4, p5, p6] = idx;
  return (d(p2, p6) + d(p3, p5)) / (2 * d(p1, p4));
}

export function computeEAR(lm: ArrayLike<number>): number {
  'worklet';
  return (ear(lm, RIGHT_EYE) + ear(lm, LEFT_EYE)) / 2;
}