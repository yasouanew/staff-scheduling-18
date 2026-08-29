<?php

namespace App\Jobs;

use App\Models\Employee;
use App\Models\Roster;
use App\Models\RosterChange;
use App\Notifications\RosterChangeNotification;
use App\Notifications\RosterPublishedNotification;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Collection;

/**
 * Post-commit delivery of roster notifications.
 *
 * The database rows were written synchronously inside the transaction; this
 * job exists purely to fan out the realtime (broadcast) and mobile (FCM) push
 * channels after the transaction has committed. Because it runs on the queue,
 * a push failure can never block or roll back the roster publish / change.
 */
class DispatchRosterNotifications implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $timeout = 120;

    public int $tries = 3;

    /**
     * @param  list<int>  $employeeIds
     * @param  list<int>  $changeIds
     */
    public function __construct(
        public int $rosterId,
        public array $employeeIds = [],
        public array $changeIds = [],
        public bool $isPublish = false,
    ) {}

    /**
     * Execute the job.
     */
    public function handle(): void
    {
        $roster = Roster::query()->find($this->rosterId);

        if ($roster === null) {
            return;
        }

        if (empty($this->employeeIds)) {
            return;
        }

        $employees = Employee::query()
            ->whereIn('id', $this->employeeIds)
            ->with('user')
            ->get()
            ->reject(fn (Employee $employee) => $employee->user === null);

        if ($this->isPublish) {
            $notification = new RosterPublishedNotification($roster);
            $employees->each(fn (Employee $employee) => $employee->user->notify($notification));

            return;
        }

        $changesByEmployee = RosterChange::query()
            ->whereIn('id', $this->changeIds)
            ->get()
            ->groupBy('employee_id');

        $employees->each(function (Employee $employee) use ($roster, $changesByEmployee) {
            $changes = $changesByEmployee->get($employee->id, collect());

            if ($changes->isEmpty()) {
                return;
            }

            $notification = new RosterChangeNotification(
                $roster,
                $changes instanceof Collection ? $changes : collect($changes),
                $this->summaryFor($changes),
            );

            $employee->user->notify($notification);
        });
    }

    /**
     * @param  \Illuminate\Support\Collection<int, RosterChange>  $changes
     */
    protected function summaryFor($changes): string
    {
        $count = $changes->count();
        $noun = $count === 1 ? 'change' : 'changes';

        return "{$count} {$noun} to your roster for the week.";
    }
}
