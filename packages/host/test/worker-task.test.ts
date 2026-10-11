import test from "node:test";
import assert from "node:assert/strict";
import { runWorkerTask, WorkerTaskError } from "../src/worker-task.ts";

class FakeWorker {
  static last: FakeWorker;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  posted: unknown[] = [];
  terminated = false;
  constructor() { FakeWorker.last = this; }
  postMessage(message: unknown) { this.posted.push(message); }
  terminate() { this.terminated = true; }
}
const fake = () => new FakeWorker() as unknown as Worker;
const outcome = (task: Promise<unknown>) => task.then(() => "resolved", (error: Error) => error instanceof WorkerTaskError ? error.outcome : error.message);

test("progress passes through; done resolves once and terminates", async () => {
  const progress: unknown[] = [];
  const task = runWorkerTask<number>(fake(), { job: 1 }, { name: "Job", timeoutMs: 1000, onMessage: (data, { done }) => data === "tick" ? progress.push(data) : done(data as number) });
  const worker = FakeWorker.last;
  assert.deepEqual(worker.posted, [{ job: 1 }]);
  worker.onmessage!({ data: "tick" }); worker.onmessage!({ data: 7 }); worker.onmessage!({ data: 8 });
  assert.equal(await task.result, 7);
  assert.deepEqual(progress, ["tick"]);
  assert.equal(worker.terminated, true);
});

test("cancel, timeout, Worker error, and unreadable data each reject and terminate", async () => {
  const cancelled = runWorkerTask(fake(), null, { name: "Job", timeoutMs: 1000, onMessage() {} });
  cancelled.cancel(); assert.equal(await outcome(cancelled.result), "cancelled"); assert.equal(FakeWorker.last.terminated, true);

  const timed = runWorkerTask(fake(), null, { name: "Job", timeoutMs: 5, onMessage() {} });
  assert.equal(await outcome(timed.result), "timeout"); assert.equal(FakeWorker.last.terminated, true);

  const crashed = runWorkerTask(fake(), null, { name: "Job", timeoutMs: 1000, onMessage() {} });
  FakeWorker.last.onerror!({ message: "" });
  await assert.rejects(crashed.result, { message: "Job stopped", outcome: "failed" });

  const garbled = runWorkerTask(fake(), null, { name: "Job", timeoutMs: 1000, onMessage() {} });
  FakeWorker.last.onmessageerror!();
  await assert.rejects(garbled.result, { message: "Job returned unreadable data", outcome: "failed" });
});

test("a message after cancellation is ignored", async () => {
  let calls = 0;
  const task = runWorkerTask(fake(), null, { name: "Job", timeoutMs: 1000, onMessage() { calls++; } });
  const worker = FakeWorker.last; task.cancel(); worker.onmessage!({ data: 1 });
  assert.equal(await outcome(task.result), "cancelled"); assert.equal(calls, 0);
});
