import { authService } from './authService.js';

const state = {
  currentView: 'signIn',
  user: null,
  organizations: [],
  selectedOrganization: null,
  selectedRepositories: [],
  errorMessage: null,
  isLoading: false,
};

const app = document.getElementById('app');

function getOrganizationByName(name) {
  return state.organizations.find((organization) => organization.name === name);
}

async function initializeState() {
  await authService.hydrateSessionFromQuery();

  state.user = await authService.getAuthenticatedUser();
  state.organizations = await authService.getOrganizations();
  state.selectedOrganization = await authService.getSelectedOrganization();
  state.selectedRepositories = await authService.getSelectedRepositories();

  if (state.user && state.organizations.length) {
    state.currentView = 'organization';
  }
}

function render() {
  if (state.currentView === 'signIn') {
    app.innerHTML = `
      <div class="app-shell auth-page">
        <div class="auth-card">
          <p class="brand">REMI</p>
          <h1 class="headline">Your engineering brain.</h1>
          <p class="subheadline">Sign in with your organization to access your team's engineering knowledge.</p>

          ${state.errorMessage ? `<div class="error-banner" role="alert">${state.errorMessage}</div>` : ''}

          <button class="primary-button" id="github-signin" ${state.isLoading ? 'disabled' : ''}>
            ${state.isLoading ? 'Signing in...' : 'Continue with GitHub'}
          </button>
          <div class="security-note">Remi only accesses repositories you authorize.</div>
        </div>
      </div>
    `;

    document.getElementById('github-signin').addEventListener('click', async () => {
      state.isLoading = true;
      state.errorMessage = null;
      render();

      try {
        await authService.signInWithGitHub();
      } catch (error) {
        state.errorMessage = error.message || 'Unable to start GitHub sign-in.';
        state.isLoading = false;
        render();
      }
    });

    return;
  }

  if (state.currentView === 'organization') {
    app.innerHTML = `
      <div class="app-shell selection-page">
        <div class="selection-card">
          <div class="selection-header">
            <h2>Welcome, ${state.user.name}.</h2>
            <p>Choose your organization</p>
          </div>

          ${state.errorMessage ? `<div class="error-banner" role="alert">${state.errorMessage}</div>` : ''}

          <div class="org-list">
            ${state.organizations
              .map(
                (organization) => `
                  <div class="org-item ${state.selectedOrganization === organization.name ? 'selected' : ''}" data-org="${organization.name}">
                    <div class="org-meta">
                      <div class="org-name">${organization.name}</div>
                      <div class="org-repos">${organization.repositories.length} repositories</div>
                    </div>
                    <div class="radio"></div>
                  </div>
                `,
              )
              .join('')}
          </div>

          <div class="form-actions">
            <button class="primary-button" id="continue-org">Continue</button>
          </div>
        </div>
      </div>
    `;

    document.querySelectorAll('.org-item').forEach((item) => {
      item.addEventListener('click', () => {
        state.selectedOrganization = item.dataset.org;
        render();
      });
    });

    document.getElementById('continue-org').addEventListener('click', async () => {
      if (!state.selectedOrganization) return;

      state.errorMessage = null;
      state.isLoading = true;
      render();

      try {
        const organization = getOrganizationByName(state.selectedOrganization);
        state.selectedRepositories = organization ? organization.repositories.slice(0, 3) : [];

        await authService.selectOrganization(state.selectedOrganization);
        await authService.selectRepositories(state.selectedRepositories);

        state.currentView = 'repositories';
      } catch (error) {
        state.errorMessage = error.message || 'Unable to continue with that organization.';
      } finally {
        state.isLoading = false;
        render();
      }
    });

    return;
  }

  if (state.currentView === 'repositories') {
    const organization = getOrganizationByName(state.selectedOrganization);
    const availableRepositories = organization ? organization.repositories : [];

    app.innerHTML = `
      <div class="app-shell selection-page">
        <div class="selection-card">
          <div class="selection-header">
            <h2>Choose repositories</h2>
            <p>${state.selectedOrganization}</p>
          </div>

          ${state.errorMessage ? `<div class="error-banner" role="alert">${state.errorMessage}</div>` : ''}

          <div class="repo-list">
            ${availableRepositories
              .map(
                (repo) => `
                  <div class="repo-item ${state.selectedRepositories.includes(repo) ? 'selected' : ''}" data-repo="${repo}">
                    <button type="button" class="repo-toggle">
                      <div class="repo-label">
                        <span class="check"></span>
                        <span>${repo}</span>
                      </div>
                    </button>
                  </div>
                `,
              )
              .join('')}
          </div>

          <p class="selection-subtext">These repositories are the sources Remi will use to build engineering knowledge.</p>

          <div class="form-actions">
            <button class="primary-button" id="start-remi">Start with Remi</button>
          </div>
        </div>
      </div>
    `;

    document.querySelectorAll('.repo-item').forEach((item) => {
      item.addEventListener('click', () => {
        const repo = item.dataset.repo;
        const isSelected = state.selectedRepositories.includes(repo);

        state.selectedRepositories = isSelected
          ? state.selectedRepositories.filter((value) => value !== repo)
          : [...state.selectedRepositories, repo];

        render();
      });
    });

    document.getElementById('start-remi').addEventListener('click', async () => {
      state.errorMessage = null;
      state.isLoading = true;
      render();

      try {
        await authService.selectOrganization(state.selectedOrganization);
        await authService.selectRepositories(state.selectedRepositories);
        state.currentView = 'app';
      } catch (error) {
        state.errorMessage = error.message || 'Unable to start Remi with the selected repositories.';
      } finally {
        state.isLoading = false;
        render();
      }
    });

    return;
  }

  app.innerHTML = `
    <div class="app-layout">
      <header class="topbar">
        <div class="nav-left">
          <div class="brand-mark">REMI</div>
          <nav class="nav-links">
            <button class="nav-link active">Ask</button>
            <button class="nav-link">My Repo</button>
            <button class="nav-link">All Engineering</button>
          </nav>
        </div>
        <button class="action-button" id="sign-out">Sign out</button>
      </header>

      <main class="main-content">
        <div class="prompt-panel">
          <div class="prompt-header">
            <div class="prompt-title">Engineering Question</div>
            <div class="prompt-title">${state.selectedOrganization}</div>
          </div>

          <div class="prompt-body">
            <div class="chat-surface">
              <div class="message">
                <div class="message-label">Remi</div>
                <div class="message-bubble">What engineering problem would you like help with today?</div>
              </div>
              <div class="message user">
                <div class="message-label">You</div>
                <div class="message-bubble">How can we reduce deployment risk for the checkout-service rollout?</div>
              </div>
            </div>

            <div class="prompt-input-row">
              <input class="prompt-input" value="How can we reduce deployment risk for the checkout-service rollout?" aria-label="Ask Remi" />
              <button class="primary-button">Ask Remi</button>
            </div>
          </div>
        </div>
      </main>
    </div>
  `;

  document.getElementById('sign-out').addEventListener('click', async () => {
    await authService.clearSession();
    state.currentView = 'signIn';
    state.user = null;
    state.organizations = [];
    state.selectedOrganization = null;
    state.selectedRepositories = [];
    render();
  });
}

initializeState().then(render);
