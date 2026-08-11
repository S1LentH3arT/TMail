import { RuntimeAccountRepository } from "./accounts/account-repository.js";
import { MailService } from "./application/mail-service.js";
import { DemoProvider } from "./providers/demo/demo-provider.js";

export function createRuntime() {
  const accounts = new RuntimeAccountRepository();
  const providers = process.env.TMAIL_ENABLE_DEMO === "1" ? [new DemoProvider()] : [];
  const mail = new MailService(accounts, providers);
  return { accounts, mail };
}

export type TmailRuntime = ReturnType<typeof createRuntime>;
