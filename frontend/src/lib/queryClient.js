import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api.js";
import { onSessionChange } from "./session.js";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status <= 499) return false;
        return failureCount < 1;
      },
    },
  },
});

onSessionChange(() => queryClient.clear());

export const queryKeys = {
  me: () => ["me"],
  artisans: (params) => ["artisans", params],
  artisan: (profileId) => ["artisan", profileId],
  myProfile: () => ["myProfile"],
  requests: (params) => ["requests", params],
  request: (id) => ["request", id],
  adminUsers: (params) => ["admin", "users", params],
  adminUser: (id) => ["admin", "user", id],
  adminProblems: (params) => ["admin", "problems", params],
  adminProblem: (id) => ["admin", "problem", id],
  adminPayments: (params) => ["admin", "payments", params],
};
