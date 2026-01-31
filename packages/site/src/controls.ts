import type { ForceGraph } from './force-graph.js';
import type { VisualizationData, VisNode, InfluencerProfile } from './types.js';

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
  private onSpotlight?: (agentId: string) => void;

  constructor(graph: ForceGraph, data: VisualizationData) {
    this.graph = graph;
    this.data = data;

    this.populateStats();
    this.setupSearch();
    this.setupDegreeSlider();
    this.setupForceControls();
    this.setupTierButtons();
    this.setupInfluencerSlider();
    this.setupSpotlight();
    this.renderLeaderboard();
    this.setupCommunityFilter();
  }

  setSpotlightHandler(handler: (agentId: string) => void): void {
    this.onSpotlight = handler;
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
      this.graph.filterByDegree(val);
    });
  }

  private setupForceControls(): void {
    const chargeSlider = document.getElementById('charge-slider') as HTMLInputElement | null;
    const linkSlider = document.getElementById('link-slider') as HTMLInputElement | null;
    const freezeBtn = document.getElementById('freeze-btn') as HTMLButtonElement | null;
    const resetBtn = document.getElementById('reset-btn') as HTMLButtonElement | null;

    if (chargeSlider) {
      chargeSlider.addEventListener('input', () => {
        this.graph.setChargeStrength(-parseInt(chargeSlider.value, 10));
      });
    }

    if (linkSlider) {
      linkSlider.addEventListener('input', () => {
        this.graph.setLinkDistance(parseInt(linkSlider.value, 10));
      });
    }

    if (freezeBtn) {
      freezeBtn.addEventListener('click', () => {
        const frozen = this.graph.toggleSimulation();
        freezeBtn.textContent = frozen ? 'Unfreeze' : 'Freeze';
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        this.graph.resetView();
      });
    }
  }

  private setupTierButtons(): void {
    const buttons = document.querySelectorAll<HTMLButtonElement>('[data-tier]');
    const customControls = document.querySelector('.custom-controls');

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

        // Tier filtering is handled by loading different data files
        // For now, adjust degree filter as a proxy
        if (tier === 'elite') {
          this.graph.filterByDegree(0);
          this.graph.resetHighlight();
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
    });
  }

  private setupSpotlight(): void {
    const input = document.getElementById('spotlight-input') as HTMLInputElement | null;
    const btn = document.getElementById('spotlight-btn') as HTMLButtonElement | null;
    if (!input || !btn) return;

    const doSpotlight = () => {
      const name = input.value.trim();
      if (name) {
        this.graph.spotlightInfluencer(name);
        this.onSpotlight?.(name);
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

    const rankings = this.data.influencers?.rankings ?? [];
    const top20 = rankings.slice(0, 20);

    container.innerHTML = top20.map((inf, i) => `
      <div class="leaderboard-item" data-agent="${inf.agentName}">
        <span class="rank">#${i + 1}</span>
        <span class="name">${inf.agentName}</span>
        <span class="score">${(inf.influenceScore * 100).toFixed(1)}</span>
        <span class="tier tier-${inf.tier}">${inf.tier}</span>
      </div>
    `).join('');

    container.querySelectorAll('.leaderboard-item').forEach(item => {
      item.addEventListener('click', () => {
        const agent = item.getAttribute('data-agent');
        if (agent) {
          this.graph.spotlightInfluencer(agent);
          this.onSpotlight?.(agent);
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
        Community ${c.id} (${c.size} agents)
        ${c.dominant_submolts.length ? `<small>${c.dominant_submolts.slice(0, 2).join(', ')}</small>` : ''}
      </label>
    `).join('');
  }

  private setText(id: string, text: string): void {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
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
    ? `<div class="influence-badge ${tierClass}">#${node.influenceRank} ${node.tier.toUpperCase()}</div>`
    : '';

  const connectionsHtml = [
    ...(node.topInteractions?.repliesFrom?.slice(0, 5) ?? []).map(name =>
      `<li class="connection inbound">${name} &rarr; <strong>${node.label}</strong></li>`,
    ),
    ...(node.topInteractions?.repliesTo?.slice(0, 5) ?? []).map(name =>
      `<li class="connection outbound"><strong>${node.label}</strong> &rarr; ${name}</li>`,
    ),
  ].join('');

  const submoltsHtml = (node.submolts ?? [])
    .map(s => `<span class="submolt-tag">${s}</span>`)
    .join('');

  details.innerHTML = `
    <div class="influencer-profile">
      <h3>${node.label}</h3>
      ${tierBadge}

      <div class="influence-score-display">
        <span class="score-value">${(node.influenceScore * 100).toFixed(1)}</span>
        <span class="score-label">Influence Score</span>
      </div>

      <div class="metrics-grid">
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
          <span class="label">Replies In</span>
        </div>
        <div class="metric">
          <span class="value">${node.metrics.out_degree}</span>
          <span class="label">Replies Out</span>
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

      ${connectionsHtml ? `<h4>Top Connections</h4><ul class="connections-list">${connectionsHtml}</ul>` : ''}
      ${submoltsHtml ? `<h4>Active Communities</h4><div class="submolt-tags">${submoltsHtml}</div>` : ''}
    </div>
  `;
}
