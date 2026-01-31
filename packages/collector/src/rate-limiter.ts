export class TokenBucketRateLimiter {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private maxTokens: number = 90,
    private refillRate: number = 90,
    private refillInterval: number = 60_000,
  ) {
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    this.refill();
    if (this.tokens < 1) {
      const waitTime = this.refillInterval - (Date.now() - this.lastRefill);
      if (waitTime > 0) {
        await this.sleep(waitTime + 100);
      }
      this.refill();
    }
    this.tokens--;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    if (elapsed >= this.refillInterval) {
      const periods = Math.floor(elapsed / this.refillInterval);
      this.tokens = Math.min(this.maxTokens, this.tokens + this.refillRate * periods);
      this.lastRefill += periods * this.refillInterval;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  get remaining(): number {
    this.refill();
    return Math.floor(this.tokens);
  }
}
