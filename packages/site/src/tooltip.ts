import type { VisNode } from './types.js';

export class Tooltip {
  private element: HTMLElement;

  constructor() {
    this.element = document.getElementById('tooltip')!;
    if (!this.element) {
      this.element = document.createElement('div');
      this.element.id = 'tooltip';
      this.element.className = 'tooltip hidden';
      document.body.appendChild(this.element);
    }
  }

  show(node: VisNode, event: MouseEvent): void {
    const tierBadge = node.tier !== 'active'
      ? `<span class="tooltip-tier tier-${node.tier}">${node.tier.toUpperCase()}</span>`
      : '';

    const rankDisplay = node.influenceRank > 0 ? `#${node.influenceRank}` : '';

    this.element.innerHTML = `
      <div class="tooltip-header">
        <strong>${node.label}</strong>
        ${tierBadge}
      </div>
      <div class="tooltip-score">
        ${(node.influenceScore * 100).toFixed(1)} ${rankDisplay}
      </div>
      <div class="tooltip-stats">
        <span>${node.karma.toLocaleString()} karma</span>
        <span>${node.posts} posts</span>
        <span>${node.metrics.degree} connections</span>
      </div>
      <div class="tooltip-community">Cluster ${node.community}</div>
    `;

    this.element.classList.remove('hidden');

    // Position near cursor with offset
    const x = event.clientX + 16;
    const y = event.clientY - 8;
    const rect = this.element.getBoundingClientRect();

    this.element.style.left = `${Math.min(x, window.innerWidth - rect.width - 12)}px`;
    this.element.style.top = `${Math.min(y, window.innerHeight - rect.height - 12)}px`;
  }

  hide(): void {
    this.element.classList.add('hidden');
  }
}
