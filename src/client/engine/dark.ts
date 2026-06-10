// The collapsing Dark — the fail-state that chases from behind. It tracks just
// under the player's run speed (so flow keeps you ahead and mistakes let it gain),
// is shoved back when you harvest motes, and is leashed so it never falls so far
// behind that the tension dies.

export class Dark {
  x = -1400; // world x of the dark's leading edge
  private speed = 0;

  update(dt: number, runSpeed: number, playerX: number): void {
    this.speed = runSpeed * 0.9 + 28;
    this.x += this.speed * dt;
    const maxLag = 880;
    if (playerX - this.x > maxLag) this.x = playerX - maxLag;
  }

  caught(playerX: number, playerHalf: number): boolean {
    return playerX - playerHalf <= this.x;
  }

  // Harvesting a mote shoves the dark back a little — the core risk/reward.
  push(amount: number): void {
    this.x -= amount;
  }
}
