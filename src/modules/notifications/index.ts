export {
  ConsoleEmailProvider,
  FakeEmailProvider,
  SmtpEmailProvider,
  getEmailProvider,
  sendEmail,
  setEmailProvider,
  type EmailMessage,
  type EmailProvider,
} from "@/modules/notifications/email";
export {
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "@/modules/notifications/email/templates/auth";
export { sendEmployeeInviteEmail } from "@/modules/notifications/email/templates/invite";
