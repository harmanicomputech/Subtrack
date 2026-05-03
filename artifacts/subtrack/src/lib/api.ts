const API = import.meta.env.VITE_API_URL;

if (!API) {
  throw new Error("VITE_API_URL is not defined");
}

export const api = {
  auth: {
    login: `${API}/auth/login`,
    register: `${API}/auth/register`,
    me: `${API}/auth/me`,
  },

  billing: {
    events: `${API}/billing/events`,
  },
};
