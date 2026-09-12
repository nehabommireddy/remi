const API_BASE = 'http://localhost:8001';
const SESSION_KEY = 'remi:sessionId';

function getSessionId() {
  return localStorage.getItem(SESSION_KEY);
}

function setSessionId(sessionId) {
  if (sessionId) {
    localStorage.setItem(SESSION_KEY, sessionId);
  }
}

function clearSessionId() {
  localStorage.removeItem(SESSION_KEY);
}

async function request(path, options = {}) {
  const sessionId = getSessionId();

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(sessionId ? { 'X-Session-Id': sessionId } : {}),
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.detail || 'Request failed');
  }

  return response.json();
}

export const authService = {
  async signInWithGitHub() {
    window.location.href = `${API_BASE}/api/auth/github/login`;
    return null;
  },

  async hydrateSessionFromQuery() {
    const query = new URLSearchParams(window.location.search);
    const sessionId = query.get('sessionId');

    if (sessionId) {
      setSessionId(sessionId);

      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.delete('sessionId');
      history.replaceState({}, '', `${nextUrl.pathname}${nextUrl.search}`);
    }
  },

  async getAuthenticatedUser() {
    const sessionId = getSessionId();
    if (!sessionId) {
      return null;
    }

    try {
      const data = await request('/api/auth/session');
      return data.user;
    } catch (_error) {
      clearSessionId();
      return null;
    }
  },

  async getOrganizations() {
    const sessionId = getSessionId();
    if (!sessionId) {
      return [];
    }

    const data = await request('/api/auth/organizations');
    return data.organizations;
  },

  async getRepositories(organizationName) {
    const sessionId = getSessionId();
    if (!sessionId) {
      return [];
    }

    const data = await request(`/api/auth/organizations/${encodeURIComponent(organizationName)}/repositories`);
    return data.repositories;
  },

  async getSelectedOrganization() {
    const sessionId = getSessionId();
    if (!sessionId) {
      return null;
    }

    try {
      const data = await request('/api/auth/session');
      return data.selectedOrganization;
    } catch (_error) {
      clearSessionId();
      return null;
    }
  },

  async getSelectedRepositories() {
    const sessionId = getSessionId();
    if (!sessionId) {
      return [];
    }

    try {
      const data = await request('/api/auth/session');
      return data.selectedRepositories;
    } catch (_error) {
      clearSessionId();
      return [];
    }
  },

  async selectOrganization(organizationName) {
    const data = await request('/api/auth/select-organization', {
      method: 'POST',
      body: JSON.stringify({ organizationName }),
    });

    return data.selectedOrganization;
  },

  async selectRepositories(repositories) {
    const data = await request('/api/auth/select-repositories', {
      method: 'POST',
      body: JSON.stringify({ repositories }),
    });

    return data.selectedRepositories;
  },

  async clearSession() {
    const sessionId = getSessionId();

    if (sessionId) {
      try {
        await request('/api/auth/signout', { method: 'POST' });
      } catch (_error) {
        // Ignore backend sign-out errors and clear client session anyway.
      }
    }

    clearSessionId();
  },
};
