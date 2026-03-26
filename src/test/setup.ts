import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

if (!("alert" in window)) {
  Object.defineProperty(window, "alert", { value: vi.fn(), writable: true });
} else {
  window.alert = vi.fn();
}

if (!("confirm" in window)) {
  Object.defineProperty(window, "confirm", {
    value: vi.fn(() => true),
    writable: true,
  });
} else {
  window.confirm = vi.fn(() => true);
}
