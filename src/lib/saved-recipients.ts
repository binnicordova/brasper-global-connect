export type SavedRecipient = {
  id: string;
  user_id: string;
  label: string;
  currency: string;
  country: string;
  recipient_name: string;
  recipient_document: string;
  recipient_bank: string;
  recipient_account: string;
  recipient_account_type: string;
  recipient_account_holder: string;
  recipient_account_holder_document: string;
  recipient_bank_branch: string;
  recipient_phone: string;
  recipient_relationship: string;
};
export const recipientFieldNames = {
  recipientName: "recipient_name",
  recipientDocument: "recipient_document",
  recipientBank: "recipient_bank",
  recipientAccount: "recipient_account",
  recipientAccountHolder: "recipient_account_holder",
  recipientAccountHolderDocument: "recipient_account_holder_document",
  recipientBankBranch: "recipient_bank_branch",
  recipientPhone: "recipient_phone",
  recipientRelationship: "recipient_relationship",
} as const;
export function recipientOptionLabel(account: SavedRecipient) {
  return `${account.label} · ${account.recipient_bank} · •••• ${account.recipient_account.slice(-4)} · ${account.currency}`;
}
