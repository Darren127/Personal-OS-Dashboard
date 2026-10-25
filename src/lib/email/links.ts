/** Link that opens this message in Gmail, in the right account. */
export function gmailMessageUrl(messageId: string, accountEmail: string | null) {
  const account = accountEmail ? `?authuser=${encodeURIComponent(accountEmail)}` : "";
  return `https://mail.google.com/mail/${account}#all/${encodeURIComponent(messageId)}`;
}
