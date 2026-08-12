import { AccountService } from "./accounts/account-service.js";
import { FileAccountRepository, RuntimeAccountRepository } from "./accounts/account-repository.js";
import { MailService } from "./application/mail-service.js";
import { SystemCredentialStore } from "./credentials/credential-store.js";
import { DemoProvider } from "./providers/demo/demo-provider.js";
import { GmailAuthenticator } from "./providers/gmail/authenticator.js";
import { GmailProvider } from "./providers/gmail/gmail-provider.js";
import { GmailTokenProvider } from "./providers/gmail/token-provider.js";

export function createRuntime() {
  const demoEnabled = process.env.TMAIL_ENABLE_DEMO === "1";
  const credentials = new SystemCredentialStore();
  const repository = demoEnabled
    ? new RuntimeAccountRepository(true)
    : new RuntimeAccountRepository(false, new FileAccountRepository());
  const accounts = new AccountService(repository, credentials);
  const gmailAuthenticator = new GmailAuthenticator();
  const providers = [
    ...(demoEnabled ? [new DemoProvider()] : []),
    new GmailProvider(
      new GmailTokenProvider(credentials, undefined, (accountId) =>
        accounts.markAuthenticationRequired(accountId),
      ),
    ),
  ];
  const mail = new MailService(accounts, providers);
  return {
    accounts,
    mail,
    gmail: {
      configured: gmailAuthenticator.configured,
      authorize: gmailAuthenticator.authorize.bind(gmailAuthenticator),
    },
  };
}

export type TmailRuntime = ReturnType<typeof createRuntime>;
