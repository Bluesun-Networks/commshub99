// SPDX-License-Identifier: AGPL-3.0-or-later
import type { DraftService } from "../services/draft.js";
import { ScheduleService } from "../services/schedule.js";

export type RunDueScheduledSendsOptions = {
  draftService: Pick<DraftService, "approve">;
  maxAttempts?: number;
  now?: Date;
  scheduleService?: ScheduleService;
};

export async function runDueScheduledSends({
  draftService,
  maxAttempts = 3,
  now = new Date(),
  scheduleService = new ScheduleService(),
}: RunDueScheduledSendsOptions) {
  const due = scheduleService.listDue(now, maxAttempts);
  const results: Array<{ error?: string; id: string; status: "failed" | "sent" }> = [];

  for (const scheduled of due) {
    scheduleService.markSending(scheduled.id);

    try {
      await draftService.approve(scheduled.draftId);
      scheduleService.markSent(scheduled.id);
      results.push({ id: scheduled.id, status: "sent" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Scheduled send failed";

      scheduleService.markFailed(scheduled.id, message);
      results.push({ error: message, id: scheduled.id, status: "failed" });
    }
  }

  return results;
}
