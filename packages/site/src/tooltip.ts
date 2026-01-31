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

    this.element.innerHTML = `
      <div class="tooltip-header">
        <strong>${node.label}</strong>
        ${tierBadge}
      </div>
      <div class="tooltip-score">
        Influence: ${(node.influenceScore * 100).toFixed(1)}
        ${node.influenceRank > 0 ? `(#${node.influenceRank})` : ''}
      </div>
      <div class="tooltip-stats">
        <span>Karma: ${node.karma.toLocaleString()}</span>
        <span>Posts: ${node.posts}</span>
        <span>Degree: ${node.metrics.degree}</span>
      </div>
      <div class="tooltip-community">Community ${node.community}</div>
    `;

    this.element.classList.remove('hidden');

    // Position near cursor
    const x = event.clientX + 12;
    const y = event.clientY - 10;
    const rect = this.element.getBoundingClientRect();

    this.element.style.left = `${Math.min(x, window.innerWidth - rect.width - 8)}px`;
    this.element.style.top = `${Math.min(y, window.innerHeight - rect.height - 8)}px`;
  }

  hide(): void {
    this.element.classList.add('hidden');
  }
}
