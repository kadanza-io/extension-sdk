export type PendingRequestOptions<TContext = undefined> = {
  timeoutMs: number;
  timeoutMessage: string;
  /** Optional correlation data (e.g. expected path). */
  context?: TContext;
  /** Called once when the request settles (resolve, reject, timeout, or abandon). */
  onSettle?: () => void;
};

/**
 * One-shot promise with timeout for request/ACK postMessage flows.
 *
 * Owns timer lifecycle and optional correlation {@link context}. Callers keep a
 * single in-flight slot and clear it via {@link onSettle}.
 */
export class PendingRequest<TResult, TContext = undefined> {
  readonly promise: Promise<TResult>;
  readonly context: TContext;

  #resolve!: (value: TResult) => void;
  #reject!: (reason?: unknown) => void;
  #timer: ReturnType<typeof setTimeout>;
  #settled = false;
  #onSettle: (() => void) | undefined;

  private constructor(options: PendingRequestOptions<TContext>) {
    this.context = options.context as TContext;
    this.#onSettle = options.onSettle;

    this.promise = new Promise<TResult>((resolve, reject) => {
      this.#resolve = resolve;
      this.#reject = reject;
    });

    this.#timer = setTimeout(() => {
      this.reject(new Error(options.timeoutMessage));
    }, options.timeoutMs);
  }

  static create<TResult, TContext = undefined>(
    options: PendingRequestOptions<TContext>,
  ): PendingRequest<TResult, TContext> {
    return new PendingRequest(options);
  }

  get isPending(): boolean {
    return !this.#settled;
  }

  /** Whether still open and {@link context} satisfies `predicate`. */
  matches(predicate: (context: TContext) => boolean): boolean {
    return this.isPending && predicate(this.context);
  }

  resolve(value: TResult): boolean {
    if (this.#settled) {
      return false;
    }
    this.#settle();
    this.#resolve(value);
    return true;
  }

  reject(reason?: unknown): boolean {
    if (this.#settled) {
      return false;
    }
    this.#settle();
    this.#reject(reason);
    return true;
  }

  /**
   * Clears the timer without resolving or rejecting the promise.
   * Use when abandoning an in-flight request that no caller will await.
   */
  abandon(): boolean {
    if (this.#settled) {
      return false;
    }
    this.#settle();
    return true;
  }

  #settle(): void {
    this.#settled = true;
    clearTimeout(this.#timer);
    this.#onSettle?.();
    this.#onSettle = undefined;
  }
}
