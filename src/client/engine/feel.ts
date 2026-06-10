// Game feel: trauma-based (decaying) screenshake that scales with impact so it
// never nauseates, plus brief hit-stop freezes on big moments (dash-kill, death).
// Renderer-agnostic — the camera/world just read shakeX/shakeY and ask how much
// sim time to advance.

export class Feel {
  shakeX = 0;
  shakeY = 0;

  private trauma = 0;
  private hitStopMs = 0;
  private t = 0;

  addTrauma(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  // Clear residual shake/freeze so a fresh run doesn't inherit the death jolt.
  reset(): void {
    this.trauma = 0;
    this.hitStopMs = 0;
    this.shakeX = 0;
    this.shakeY = 0;
  }

  freeze(ms: number): void {
    if (ms > this.hitStopMs) this.hitStopMs = ms;
  }

  // Returns the sim dt to actually advance — 0 while a hit-stop freeze is active.
  simStep(dt: number): number {
    if (this.hitStopMs > 0) {
      this.hitStopMs -= dt * 1000;
      return 0;
    }
    return dt;
  }

  update(dt: number, maxOffset = 22): void {
    this.t += dt;
    const s = this.trauma * this.trauma;
    const amp = maxOffset * s;
    this.shakeX = amp * (Math.sin(this.t * 97) * 0.6 + Math.sin(this.t * 53) * 0.4);
    this.shakeY = amp * (Math.sin(this.t * 61) * 0.6 + Math.sin(this.t * 89) * 0.4);
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
  }
}
