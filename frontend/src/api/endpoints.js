export const ENDPOINTS = {
  signup: "/auth/signup",
  login: "/auth/login",
  me: "/me",
  onboarding: "/onboarding",
  dashboard: "/dashboard",
  refreshDashboardSection: (section) => `/dashboard/refresh/${section}`,
  votes: "/votes",
};
