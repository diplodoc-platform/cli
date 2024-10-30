// Queue is the system that processes async tasks in parallel but limits them by paralleledTasks.
// For example, we have 120 files to process. If the limit is 50, and time to process 1 file takes 1 minute, then the total time will take 3 minutes.
// The files will be groupped by 50 tasks in memory, so 50 + 50 + 20 ~> 1 + 1 + 1 = 3 minutes.

/* eslint-disable @typescript-eslint/no-explicit-any */
export class Queue {
    stack = new Set();
    queue: unknown[][] = [];
    promise: Promise<void> | null = null;
    promiseResolve: (() => void) | null = null;
    promiseFinish: Promise<void> | null = null;
    promiseFinishResolve: (() => void) | null = null;

    processTask: (...args: unknown[]) => Promise<unknown>;
    paralleledTasks: number;
    whenEmpty?: () => void;
    whenError?: (e: Error, ...args: unknown[]) => void;

    constructor(
        processTask: (...args: any[]) => Promise<void>,
        paralleledTasks: number,
        whenError?: (error: Error, ...args: any[]) => void,
        whenEmpty?: () => void,
    ) {
        this.processTask = processTask;
        this.paralleledTasks = paralleledTasks;
        this.whenEmpty = whenEmpty;
        this.whenError = whenError;
    }

    add = (...args: unknown[]) => {
        this.queue.push(args);
    };

    loop = async () => {
        for await (const _ of this.getTasks()) {
            // Process tasks
        }
        await this.promiseFinish;
        this.whenEmpty?.();
    };

    private canDryStack() {
        return this.stack.size < this.paralleledTasks;
    }

    private canFinish() {
        return this.stack.size === 0 && this.queue.length === 0;
    }

    private createPromiseForStack() {
        if (!this.canDryStack()) {
            if (!this.promise) {
                this.promise = new Promise<void>((r) => {
                    this.promiseResolve = r;
                });
            }
        }
        return this.promise;
    }

    private createPromiseFinish() {
        if (!this.promiseFinish) {
            this.promiseFinish = new Promise((r) => {
                this.promiseFinishResolve = r;
            });
        }
    }

    private checkStack() {
        if (this.promise && this.canDryStack()) {
            this.promiseResolve?.();
            this.promise = null;
        }

        if (this.promiseFinish && this.canFinish()) {
            this.promiseFinishResolve?.();
            this.promiseFinish = null;
        }
    }

    private async *getTasks() {
        this.createPromiseFinish();
        while (this.queue.length > 0) {
            const task = this.queue.shift();
            if (task !== null && task !== undefined) {
                this.stack.add(task);
                try {
                    this.processTask(...task)
                        .catch(this.whenError)
                        .finally(() => {
                            this.stack.delete(task);
                            this.checkStack();
                        });
                } catch (error) {
                    this.whenError?.(error as Error, ...task);
                }
                yield await this.createPromiseForStack();
            }
        }
    }
}
