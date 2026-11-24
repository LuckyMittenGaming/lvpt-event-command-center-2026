/**
 * Test-only fixture for validating the staging AI code-review relay.
 * This module is not imported by any deployed application.
 *
 * Contract: applyDiscount(100, 20) returns 80; applyDiscount(50, 10) returns 45.
 * Only edit this fixture on the draft pilot PR; never merge it into staging.
 */
export function applyDiscount(subtotal, percentage) {
  return subtotal * (1 + percentage / 100);
}
