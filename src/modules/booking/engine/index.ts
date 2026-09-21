export {
  rankCandidates,
  unionSlots,
  type Candidate,
  type EmployeeSlots,
  type UnionSlot,
} from "@/modules/booking/engine/any-employee";
export {
  addDaysToDateString,
  computeAvailableSlots,
  isSlotAvailable,
  weekdayOfDateString,
  workingIntervals,
  type AvailabilityInput,
  type ClosureInput,
  type ScheduleBlockInput,
  type Slot,
  type WorkingHoursDay,
} from "@/modules/booking/engine/availability";
export {
  addMinutes,
  contains,
  intersect,
  normalize,
  overlaps,
  subtract,
  type Interval,
} from "@/modules/booking/engine/intervals";
export {
  canClientCancel,
  canClientReschedule,
  type PolicyResult,
} from "@/modules/booking/engine/policies";
export {
  ACTIVE_STATUSES,
  allowedTransitions,
  canTransition,
  type ActorKind,
  type BookingStatus,
} from "@/modules/booking/engine/state-machine";
