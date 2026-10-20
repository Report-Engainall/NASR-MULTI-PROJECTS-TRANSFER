import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

function makeRouter() {
  return createRouter({ routeTree, context: { queryClient: new QueryClient() } });
}

describe("App routing", () => {
  it("matches a page for / instead of falling back to not found", () => {
    const matches = makeRouter().matchRoutes("/");
    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
  });

  it.each([
    "/cart",
    "/checkout",
    "/compare",
    "/product/route-smoke-test-product",
    "/wishlist",
    "/assistant",
    "/barcode",
    "/invoices",
    "/statement",
    "/quotes",
    "/reorder",
    "/offline",
    "/admin",
    "/admin/ai",
    "/admin/customers",
    "/admin/data",
    "/admin/devices",
    "/admin/finance",
    "/admin/notifications",
    "/admin/offers",
    "/admin/operations",
    "/admin/orders",
    "/admin/pricing",
    "/admin/products",
    "/admin/quotes",
    "/admin/reports",
    "/admin/settings",
    "/admin/suppliers",
    "/orders",
    "/orders/route-smoke-test",
  ])("registers the route %s", (path) => {
    const matches = makeRouter().matchRoutes(path as never);
    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
  });
});
