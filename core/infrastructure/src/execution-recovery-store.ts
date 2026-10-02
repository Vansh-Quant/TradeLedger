import type {
  DurableExecutionSnapshot,
  ExecutionPersistence,
} from "./execution-persistence.js";
import { validateSnapshot } from "./execution-persistence.js";

export interface RecoveryStore {
  save(snapshot: DurableExecutionSnapshot): void;
  load(): DurableExecutionSnapshot | undefined;
}

export class InMemoryRecoveryStore implements RecoveryStore {
  private snapshot?: DurableExecutionSnapshot;

  save(snapshot: DurableExecutionSnapshot): void {
    validateSnapshot(
      {
        latestSequence: () => snapshot.journalSequence,
      } as ExecutionPersistence,
      snapshot,
    );

    this.snapshot = Object.freeze({
      checkpoint: snapshot.checkpoint,
      journalSequence: snapshot.journalSequence,
      savedAt: snapshot.savedAt,
    });
  }

  load(): DurableExecutionSnapshot | undefined {
    return this.snapshot;
  }
}
