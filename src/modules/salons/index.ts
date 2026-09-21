export { defaultWorkingHours } from "@/modules/salons/defaults";
export { getPublicSalon, type PublicSalon } from "@/modules/salons/public.service";
export {
  addClosure,
  createSalon,
  getSalon,
  getSalonProfile,
  getSalonSettings,
  getWorkingHours,
  listClosures,
  listSalonsForActor,
  removeClosure,
  setWorkingHours,
  updateSalonProfile,
  updateSalonSettings,
  type Closure,
  type SalonProfile,
  type SalonSettingsView,
  type SalonSummary,
  type SalonWithRole,
  type WorkingDay,
} from "@/modules/salons/salon.service";
export * from "@/modules/salons/schemas";
