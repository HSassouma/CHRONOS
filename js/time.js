// Simulated timeline. Only `t` (virtual ms) changes; the real clock is never touched.
export class TimeSim {
  constructor(clock = () => performance.now(), wall = () => Date.now()) { this.clock = clock; this.wall = wall; this.goLive(); }
  goLive() { this.live = true; this.rate = 1; this.t = this.wall(); this.last = this.clock(); }
  tick() { const n = this.clock(), dt = n - this.last; this.last = n; this.t = this.live ? this.wall() : this.t + dt * this.rate; return this.t; }
  setRate(r) { this.tick(); this.live = false; this.rate = r; }
  offset(min) { this.live = false; this.rate = 0; this.t = this.wall() + min * 6e4; this.last = this.clock(); }
  label() {
    if (this.live) return 'Live time';
    const r = this.rate, x = Math.abs(r);
    const s = r === 0 ? 'Paused' : r < 0 ? `Reverse ${x}×` : r === 1 ? 'Running 1×' : r < 1 ? `Slow ${r}×` : `Fast ${r}×`;
    return `Simulated: ${s}`;
  }
}
