import type { AccountProvider } from "../domain/account.js";
import type { ProviderCapabilities } from "./provider.js";

export interface ProviderDescriptor {
  readonly id: Exclude<AccountProvider, "demo">;
  readonly label: string;
  readonly releaseOrder: number;
  readonly status: "planned";
  readonly capabilities: ProviderCapabilities;
}

const plannedCapabilities: ProviderCapabilities = {
  listInbox: true,
  readMessage: true,
  searchInbox: true,
  attachmentMetadata: true,
  remoteWrites: false,
};

export const PROVIDER_CATALOG: readonly ProviderDescriptor[] = [
  {
    id: "gmail",
    label: "Gmail",
    releaseOrder: 1,
    status: "planned",
    capabilities: plannedCapabilities,
  },
  {
    id: "outlook",
    label: "Outlook",
    releaseOrder: 2,
    status: "planned",
    capabilities: plannedCapabilities,
  },
  {
    id: "proton",
    label: "Proton Mail (Bridge)",
    releaseOrder: 3,
    status: "planned",
    capabilities: plannedCapabilities,
  },
];
