// Pure logic, no native deps. Feed it one eye-openness reading per frame.
export type Status = 'NO_FACE' | 'OK' | 'WARNING' | 'DROWSY';

export const CONFIG = {
  EYE_CLOSED_BELOW: 0.4,   // open-probability under this = eyes closed
  CLOSED_MS_ALARM: 1500,   // eyes closed this long => alarm
  PERCLOS_WINDOW_MS: 30000,
  PERCLOS_ALARM: 0.3,      // >30% of window with eyes closed => alarm
  NO_FACE_MS: 3000,        // driver not visible this long => "look at road"
};

export class DrowsinessDetector {
  private closedSince: number | null = null;
  private samples: { t: number; closed: boolean }[] = [];
  private lastFaceAt = Date.now();

  /** eyeOpen: 0..1 average of both eyes, or null if no face this frame */
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