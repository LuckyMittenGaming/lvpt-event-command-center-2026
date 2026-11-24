// Isolated staging-only fixture. The discount must reduce the subtotal.
export function applyDiscount(subtotal, percentage) {
  return subtotal * (1 + percentage / 100);
}
