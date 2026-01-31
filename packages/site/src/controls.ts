import type { ForceGraph } from './force-graph.js';
import { toAppHref } from './router.js';
import type { FilterState, VisualizationData, VisNode } from './types.js';

function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: unknown[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}

export class Controls {
  private graph: ForceGraph;
  private data: VisualizationData;
  private onSpotlightSelect?: (agentId: string) => void;
  private onSpotlightRequest?: (name: string) => { found: boolean; agentId?: string };
  private onSpotlightCleared?: () => void;
  private onFilterChange?: (updates: Partial<FilterState>) => void;
  private leaderboardMode: 'influence' | 'karma' = 'influence';

  constructor(
    graph: ForceGraph,
    data: VisualizationData,
    options: {
      onFilterChange?: (updates: Partial<FilterState>) => void;
      onSpotlightRequest?: (name: string) => { found: boolean; agentId?: string };
      onSpotlightCleared?: () => void;
      onSpotlightSelect?: (agentId: string) => void;
    } = {},
  ) {
    this.graph = graph;
    this.data = data;
    this.onFilterChange = options.onFilterChange;
    this.onSpotlightRequest = options.onSpotlightRequest;
    this.onSpotlightCleared = options.onSpotlightCleared;
    this.onSpotlightSelect = options.onSpotlightSelect;

    this.populateStats();
    this.setupSearch();
    this.setupDegreeSlider();
    this.setupForceControls();
    this.setupTierButtons();
    this.setupInfluencerSlider();
    this.setupCustomControls();
    this.setupSpotlight();
    this.setupLeaderboardToggle();
    this.renderLeaderboard();
    this.setupCommunityFilter();
  }

  setSpotlightHandler(handler: (agentId: string) => void): void {
    this.onSpotlightSelect = handler;
  }

  private populateStats(): void {
    this.setText('stat-agents', this.data.metadata.total_agents.toLocaleString());
    this.setText('stat-edges', this.data.links.length.toLocaleString());
    this.setText('stat-density', this.data.metadata.network_density.toFixed(6));
    this.setText('stat-communities', this.data.metadata.community_count.toString());
    this.setText('stat-modularity', this.data.metadata.modularity.toFixed(4));
    this.setText('stat-influencers', this.data.metadata.influencer_count.toString());

    const dateEl = document.getElementById('collection-date');
    if (dateEl && this.data.metadata.collected_at) {
      dateEl.textContent = new Date(this.data.metadata.collected_at).toLocaleDateString();
    }
  }

  private setupSearch(): void {
    const input = document.getElementById('search-input') as HTMLInputElement | null;
    if (!input) return;

    input.addEventListener('input', debounce(() => {
      const query = input.value.trim().toLowerCase();
      if (query) {
        this.graph.highlightBySearch(query);
      } else {
        this.graph.resetHighlight();
      }
    }, 300));
  }

  private setupDegreeSlider(): void {
    const slider = document.getElementById('degree-slider') as HTMLInputElement | null;
    const label = document.getElementById('degree-value');
    if (!slider) return;

    slider.addEventListener('input', () => {
      const val = parseInt(slider.value, 10);
      if (label) label.textContent = String(val);
      this.onFilterChange?.({ minDegree: val });
    });
  }

  private setupForceControls(): void {
    const chargeSliders = [
      document.getElementById('charge-slider'),
      document.getElementById('layout-charge-slider'),
    ].filter((el): el is HTMLInputElement => el instanceof HTMLInputElement);
    const linkSliders = [
      document.getElementById('link-slider'),
      document.getElementById('layout-link-slider'),
    ].filter((el): el is HTMLInputElement => el instanceof HTMLInputElement);
    const collisionSliders = [
      document.getElementById('layout-collision-slider'),
    ].filter((el): el is HTMLInputElement => el instanceof HTMLInputElement);
    const chargeValue = document.getElementById('layout-charge-value');
    const linkValue = document.getElementById('layout-link-value');
    const collisionValue = document.getElementById('layout-collision-value');
    const freezeButtons = [
      document.getElementById('freeze-btn'),
      document.getElementById('layout-freeze-btn'),
    ].filter((el): el is HTMLButtonElement => el instanceof HTMLButtonElement);
    const resetButtons = [
      document.getElementById('reset-btn'),
      document.getElementById('layout-reset-btn'),
    ].filter((el): el is HTMLButtonElement => el instanceof HTMLButtonElement);

    const syncSliders = (sliders: HTMLInputElement[], value: number) => {
      const str = String(value);
      sliders.forEach(slider => {
        if (slider.value !== str) slider.value = str;
      });
    };

    const updateLabel = (el: HTMLElement | null, value: number) => {
      if (el) el.textContent = String(value);
    };

    if (chargeSliders.length) {
      const initial = parseInt(chargeSliders[0].value, 10);
      updateLabel(chargeValue, initial);
      chargeSliders.forEach(slider => {
        slider.addEventListener('input', () => {
          const val = parseInt(slider.value, 10);
          syncSliders(chargeSliders, val);
          updateLabel(chargeValue, val);
          this.graph.setChargeStrength(-val);
        });
      });
    }

    if (linkSliders.length) {
      const initial = parseInt(linkSliders[0].value, 10);
      updateLabel(linkValue, initial);
      linkSliders.forEach(slider => {
        slider.addEventListener('input', () => {
          const val = parseInt(slider.value, 10);
          syncSliders(linkSliders, val);
          updateLabel(linkValue, val);
          this.graph.setLinkDistance(val);
        });
      });
    }

    if (collisionSliders.length) {
      const initial = parseInt(collisionSliders[0].value, 10);
      updateLabel(collisionValue, initial);
      collisionSliders.forEach(slider => {
        slider.addEventListener('input', () => {
          const val = parseInt(slider.value, 10);
          syncSliders(collisionSliders, val);
          updateLabel(collisionValue, val);
          this.graph.setCollisionPadding(val);
        });
      });
    }

    if (freezeButtons.length) {
      const updateFreezeButtons = (frozen: boolean) => {
        freezeButtons.forEach(btn => {
          btn.textContent = frozen ? 'Unfreeze' : 'Freeze';
        });
      };
      freezeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          const frozen = this.graph.toggleSimulation();
          updateFreezeButtons(frozen);
        });
      });
    }

    if (resetButtons.length) {
      resetButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          this.graph.resetView();
        });
      });
    }
  }

  private setupTierButtons(): void {
    const buttons = document.querySelectorAll<HTMLButtonElement>('[data-tier]');
    const customControls = document.querySelector('.custom-controls');
    const errorEl = document.getElementById('spotlight-error');

    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        buttons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const tier = btn.dataset.tier;
        if (tier === 'custom' && customControls) {
          customControls.classList.remove('hidden');
        } else if (customControls) {
          customControls.classList.add('hidden');
        }

        if (tier === 'elite' || tier === 'major' || tier === 'expanded' || tier === 'custom') {
          this.graph.clearSpotlight();
          this.onSpotlightCleared?.();
          if (errorEl) errorEl.classList.add('hidden');
          this.onFilterChange?.({ tier });
        }
      });
    });
  }

  private setupInfluencerSlider(): void {
    const slider = document.getElementById('influence-slider') as HTMLInputElement | null;
    const label = document.getElementById('influence-value');
    if (!slider) return;

    slider.addEventListener('input', () => {
      const val = parseFloat(slider.value);
      if (label) label.textContent = val.toFixed(2);
      this.onFilterChange?.({ minInfluenceScore: val });
    });
  }

  private setupCustomControls(): void {
    const topNInput = document.getElementById('top-n') as HTMLInputElement | null;
    const includeConnections = document.getElementById('include-connections') as HTMLInputElement | null;

    if (topNInput) {
      topNInput.addEventListener('input', () => {
        const val = parseInt(topNInput.value, 10);
        if (!Number.isFinite(val)) return;
        this.onFilterChange?.({ topN: val });
      });
    }

    if (includeConnections) {
      includeConnections.addEventListener('change', () => {
        this.onFilterChange?.({ includeConnections: includeConnections.checked });
      });
    }
  }

  private setupSpotlight(): void {
    const input = document.getElementById('spotlight-input') as HTMLInputElement | null;
    const btn = document.getElementById('spotlight-btn') as HTMLButtonElement | null;
    const errorEl = document.getElementById('spotlight-error');
    if (!input || !btn) return;

    const doSpotlight = () => {
      const name = input.value.trim();
      if (!name) {
        this.graph.clearSpotlight();
        this.onSpotlightCleared?.();
        if (errorEl) errorEl.classList.add('hidden');
        return;
      }

      const result = this.onSpotlightRequest?.(name);
      if (!result?.found) {
        if (errorEl) errorEl.classList.remove('hidden');
        return;
      }

      if (errorEl) errorEl.classList.add('hidden');
      if (result.agentId) {
        this.onSpotlightSelect?.(result.agentId);
      }
    };

    btn.addEventListener('click', doSpotlight);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doSpotlight();
    });
  }

  private renderLeaderboard(): void {
    const container = document.getElementById('leaderboard');
    if (!container) return;

    if (this.leaderboardMode === 'karma') {
      const top20 = [...this.data.nodes]
        .sort((a, b) => (b.karma ?? 0) - (a.karma ?? 0))
        .slice(0, 20);

      container.innerHTML = top20.map((node, i) => `
        <div class="leaderboard-item leaderboard-karma" data-agent="${node.id}">
          <span class="rank">${i + 1}</span>
          <span class="name">
            <a data-nav href="${toAppHref(`/agents/${encodeURIComponent(node.id)}`)}">${node.id}</a>
          </span>
          <span class="score score-karma">${(node.karma ?? 0).toLocaleString()}</span>
          ${node.moltbookRank
            ? `<span class="badge badge-moltbook ${node.moltbookRank <= 10 ? 'badge-top' : ''}">${node.moltbookRank}</span>`
            : ''}
        </div>
      `).join('');
    } else {
      const rankings = this.data.influencers?.rankings ?? [];
      const top20 = rankings.slice(0, 20);

      container.innerHTML = top20.map((inf) => `
        <div class="leaderboard-item" data-agent="${inf.agentName}">
          <span class="rank">${inf.rank}</span>
          <span class="name">
            <a data-nav href="${toAppHref(`/agents/${encodeURIComponent(inf.agentName)}`)}">${inf.agentName}</a>
          </span>
          <span class="score">${(inf.influenceScore * 100).toFixed(1)}</span>
          <span class="tier tier-${inf.tier}">${inf.tier}</span>
        </div>
      `).join('');
    }

    container.querySelectorAll('.leaderboard-item').forEach(item => {
      item.addEventListener('click', (event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest('a')) return;
        const agent = item.getAttribute('data-agent');
        if (agent) {
          const result = this.onSpotlightRequest?.(agent);
          if (result?.found && result.agentId) {
            this.onSpotlightSelect?.(result.agentId);
          }
        }
      });
    });
  }

  private setupCommunityFilter(): void {
    const container = document.getElementById('community-filters');
    if (!container || !this.data.communities) return;

    const communities = this.data.communities.slice(0, 10);

    container.innerHTML = communities.map(c => `
      <label class="community-checkbox">
        <input type="checkbox" data-community="${c.id}" checked>
        ${c.name ?? `Community ${c.id}`} (${c.size} agents)
        ${c.dominant_submolts.length ? `<small>${c.dominant_submolts.slice(0, 2).join(', ')}</small>` : ''}
      </label>
    `).join('');
  }

  private setText(id: string, text: string): void {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  private setupLeaderboardToggle(): void {
    const buttons = document.querySelectorAll<HTMLButtonElement>('[data-leaderboard]');
    if (!buttons.length) return;

    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        buttons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const mode = btn.dataset.leaderboard;
        if (mode === 'karma' || mode === 'influence') {
          this.leaderboardMode = mode;
          this.renderLeaderboard();
        }
      });
    });
  }
}

/**
 * Show influencer details in the detail panel.
 */
export function showAgentDetails(node: VisNode): void {
  const details = document.getElementById('details');
  if (!details) return;

  const placeholder = details.querySelector('.placeholder');
  const agentInfo = details.querySelector('.agent-info');

  if (placeholder) placeholder.classList.add('hidden');
  if (agentInfo) agentInfo.classList.remove('hidden');

  const tierClass = node.tier !== 'active' ? `tier-${node.tier}` : '';
  const tierBadge = node.tier !== 'active'
    ? `<div class="influence-badge ${tierClass}">${node.tier.toUpperCase()} ${node.influenceRank}</div>`
    : '';
  const moltbookRankLabel = node.moltbookRank ? `${node.moltbookRank}` : '—';
  const rankDivergence = node.moltbookRank && Math.abs(node.influenceRank - node.moltbookRank) >= 10
    ? `<div class="rank-divergence">Rank divergence: Network ${node.influenceRank} vs Moltbook ${node.moltbookRank}</div>`
    : '';

  const connectionsHtml = [
    ...(node.topInteractions?.repliesFrom?.slice(0, 5) ?? []).map(name =>
      `<li class="connection inbound">${name} → <strong>${node.label}</strong></li>`,
    ),
    ...(node.topInteractions?.repliesTo?.slice(0, 5) ?? []).map(name =>
      `<li class="connection outbound"><strong>${node.label}</strong> → ${name}</li>`,
    ),
  ].join('');

  const submoltsHtml = (node.submolts ?? [])
    .map(s => `<span class="submolt-tag">${s}</span>`)
    .join('');

  details.innerHTML = `
    <div class="influencer-profile">
      <h3>${node.label}</h3>
      <a class="agent-detail-link" data-nav href="${toAppHref(`/agents/${encodeURIComponent(node.id)}`)}">View agent profile</a>
      ${tierBadge}
      ${rankDivergence}

      <div class="influence-score-display">
        <span class="score-value">${(node.influenceScore * 100).toFixed(1)}</span>
        <span class="score-label">Network Influence</span>
      </div>

      <div class="metrics-grid">
        <div class="metric">
          <span class="value">${moltbookRankLabel}</span>
          <span class="label">Moltbook</span>
        </div>
        <div class="metric">
          <span class="value">${node.karma.toLocaleString()}</span>
          <span class="label">Karma</span>
        </div>
        <div class="metric">
          <span class="value">${node.metrics.pagerank.toFixed(4)}</span>
          <span class="label">PageRank</span>
        </div>
        <div class="metric">
          <span class="value">${node.metrics.in_degree}</span>
          <span class="label">Inbound</span>
        </div>
        <div class="metric">
          <span class="value">${node.metrics.out_degree}</span>
          <span class="label">Outbound</span>
        </div>
        <div class="metric">
          <span class="value">${node.metrics.betweenness.toFixed(4)}</span>
          <span class="label">Betweenness</span>
        </div>
        <div class="metric">
          <span class="value">${node.metrics.clustering.toFixed(3)}</span>
          <span class="label">Clustering</span>
        </div>
      </div>

      ${connectionsHtml ? `<h4>Connections</h4><ul class="connections-list">${connectionsHtml}</ul>` : ''}
      ${submoltsHtml ? `<h4>Communities</h4><div class="submolt-tags">${submoltsHtml}</div>` : ''}
    </div>
  `;
}
