import { createContext, useContext } from "react";

// Every overlay renders inside the Byline UI root so the scoped Tailwind theme
// applies and nothing outside the root is touched, including nested pickers.
export const AdminPortalContext = createContext<HTMLElement | null>(null);
export const useAdminPortal = () => useContext(AdminPortalContext);
