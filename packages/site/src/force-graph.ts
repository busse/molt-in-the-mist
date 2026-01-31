import * as d3 from 'd3';
import type { VisNode, VisLink, VisualizationData } from './types.js';

export interface ForceGraphConfig {
  width: number;
  height: number;
  minRadius: number;
  maxRadius: number;
  linkDistance: number;
  chargeStrength: number;
}

const COMMUNITY_COLORS = [
  '#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f',
  '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac',
  '#86bcb6', '#8cd17d', '#b6992d', '#499894', '#d37295',
  '#a0cbe8', '#ffbe7d', '#8b8b8b', '#d4a6c8', '#fabfd2',
];

export class ForceGraph {
  private svg!: d3.Selection<SVGSVGElement, unknown, HTMLElement, unknown>;
  private mainGroup!: d3.Selection<SVGGElement, unknown, HTMLElement, unknown>;
  private simulation!: d3.Simulation<VisNode, VisLink>;
  private nodes: VisNode[];
  private links: VisLink[];
  private nodeElements!: d3.Selection<SVGCircleElement, VisNode, SVGGElement, unknown>;
  private linkElements!: d3.Selection<SVGLineElement, VisLink, SVGGElement, unknown>;
  private labelElements!: d3.Selection<SVGTextElement, VisNode, SVGGElement, unknown>;
  private config: ForceGraphConfig;
  private radiusScale!: d3.ScaleLinear<number, number>;
  private colorScale: d3.ScaleOrdinal<number, string>;
  private frozen = false;
  private onNodeClick?: (node: VisNode) => void;
  private onNodeHover?: (node: VisNode | null, event: MouseEvent) => void;

  constructor(container: string, data: VisualizationData, config: Partial<ForceGraphConfig> = {}) {
    this.config = {
      width: 900,
      height: 700,
      minRadius: 3,
      maxRadius: 30,
      linkDistance: 60,
      chargeStrength: -120,
      ...config,
    };

    this.nodes = data.nodes;
    this.links = data.links;

    this.colorScale = d3.scaleOrdinal<number, string>()
      .domain(d3.range(COMMUNITY_COLORS.length))
      .range(COMMUNITY_COLORS);

    this.buildRadiusScale();
    this.createSvg(container);
    this.createSimulation();
    this.drawLinks();
    this.drawNodes();
    this.drawLabels();
    this.simulation.on('tick', () => this.ticked());
  }

  private buildRadiusScale(): void {
    const sizes = this.nodes.map(n => n.size);
    const maxSize = Math.max(...sizes, 1);
    this.radiusScale = d3.scaleLinear()
      .domain([0, maxSize])
      .range([this.config.minRadius, this.config.maxRadius])
      .clamp(true);
  }

  private createSvg(container: string): void {
    const el = document.querySelector(container);
    if (!el) throw new Error(`Container ${container} not found`);

    this.config.width = el.clientWidth || this.config.width;
    this.config.height = el.clientHeight || this.config.height;

    this.svg = d3.select(container)
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('viewBox', `0 0 ${this.config.width} ${this.config.height}`);

    // Zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.05, 12])
      .on('zoom', (event) => {
        this.mainGroup.attr('transform', event.transform);
      });

    this.svg.call(zoom);
    this.mainGroup = this.svg.append('g').attr('class', 'main');
  }

  private createSimulation(): void {
    this.simulation = d3.forceSimulation<VisNode, VisLink>(this.nodes)
      .force('link', d3.forceLink<VisNode, VisLink>(this.links)
        .id(d => d.id)
        .distance(this.config.linkDistance)
        .strength(d => Math.min((d.weight ?? 1) / 10, 1)))
      .force('charge', d3.forceManyBody<VisNode>().strength(this.config.chargeStrength))
      .force('center', d3.forceCenter(this.config.width / 2, this.config.height / 2))
      .force('collision', d3.forceCollide<VisNode>().radius(d => this.radiusScale(d.size) + 2));
  }

  private drawLinks(): void {
    this.linkElements = this.mainGroup.append('g')
      .attr('class', 'links')
      .selectAll<SVGLineElement, VisLink>('line')
      .data(this.links)
      .join('line')
      .attr('stroke', '#555')
      .attr('stroke-opacity', d => Math.min(0.1 + (d.weight ?? 1) / 20, 0.6))
      .attr('stroke-width', d => Math.max(0.5, Math.sqrt(d.weight ?? 1)));
  }

  private drawNodes(): void {
    this.nodeElements = this.mainGroup.append('g')
      .attr('class', 'nodes')
      .selectAll<SVGCircleElement, VisNode>('circle')
      .data(this.nodes)
      .join('circle')
      .attr('r', d => this.radiusScale(d.size))
      .attr('fill', d => this.colorScale(d.community % COMMUNITY_COLORS.length))
      .attr('stroke', d => d.tier === 'elite' ? '#ffd700' : d.tier === 'major' ? '#c0c0c0' : '#333')
      .attr('stroke-width', d => d.tier === 'elite' ? 2.5 : d.tier === 'major' ? 1.5 : 0.5)
      .style('cursor', 'pointer')
      .call(this.drag())
      .on('click', (_event: MouseEvent, d: VisNode) => {
        this.onNodeClick?.(d);
      })
      .on('mouseenter', (event: MouseEvent, d: VisNode) => {
        this.onNodeHover?.(d, event);
      })
      .on('mouseleave', (event: MouseEvent) => {
        this.onNodeHover?.(null, event);
      });
  }

  private drawLabels(): void {
    // Show labels only for high-influence nodes
    const threshold = this.nodes.length > 50 ? 20 : 5;
    const labelNodes = this.nodes
      .filter(n => n.influenceRank > 0 && n.influenceRank <= threshold);

    this.labelElements = this.mainGroup.append('g')
      .attr('class', 'labels')
      .selectAll<SVGTextElement, VisNode>('text')
      .data(labelNodes)
      .join('text')
      .attr('font-size', 10)
      .attr('font-family', 'monospace')
      .attr('fill', '#e0e0e0')
      .attr('dx', d => this.radiusScale(d.size) + 4)
      .attr('dy', 3)
      .text(d => d.label);
  }

  private ticked(): void {
    this.linkElements
      .attr('x1', d => (d.source as VisNode).x ?? 0)
      .attr('y1', d => (d.source as VisNode).y ?? 0)
      .attr('x2', d => (d.target as VisNode).x ?? 0)
      .attr('y2', d => (d.target as VisNode).y ?? 0);

    this.nodeElements
      .attr('cx', d => d.x ?? 0)
      .attr('cy', d => d.y ?? 0);

    this.labelElements
      .attr('x', d => d.x ?? 0)
      .attr('y', d => d.y ?? 0);
  }

  private drag(): d3.DragBehavior<SVGCircleElement, VisNode, VisNode | d3.SubjectPosition> {
    return d3.drag<SVGCircleElement, VisNode>()
      .on('start', (event, d) => {
        if (!event.active) this.simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) this.simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });
  }

  // === Public API ===

  setNodeClickHandler(handler: (node: VisNode) => void): void {
    this.onNodeClick = handler;
  }

  setNodeHoverHandler(handler: (node: VisNode | null, event: MouseEvent) => void): void {
    this.onNodeHover = handler;
  }

  highlightEgoNetwork(nodeId: string): void {
    const egoNetwork = this.getEgoNetwork(nodeId, 1);

    this.nodeElements
      .transition()
      .duration(400)
      .attr('opacity', d => egoNetwork.nodes.has(d.id) ? 1 : 0.05)
      .attr('r', d => {
        if (d.id === nodeId) return this.radiusScale(d.size) * 1.5;
        if (egoNetwork.nodes.has(d.id)) return this.radiusScale(d.size);
        return this.radiusScale(d.size) * 0.5;
      });

    this.linkElements
      .transition()
      .duration(400)
      .attr('opacity', d => {
        const sid = typeof d.source === 'string' ? d.source : (d.source as VisNode).id;
        const tid = typeof d.target === 'string' ? d.target : (d.target as VisNode).id;
        return egoNetwork.edges.has(`${sid}->${tid}`) ? 0.8 : 0.02;
      });

    this.labelElements
      .transition()
      .duration(400)
      .attr('opacity', d => egoNetwork.nodes.has(d.id) ? 1 : 0);
  }

  spotlightInfluencer(agentId: string): void {
    this.highlightEgoNetwork(agentId);
    this.zoomToNode(agentId);
  }

  resetHighlight(): void {
    this.nodeElements
      .transition()
      .duration(400)
      .attr('opacity', 1)
      .attr('r', d => this.radiusScale(d.size));

    this.linkElements
      .transition()
      .duration(400)
      .attr('opacity', d => Math.min(0.1 + (d.weight ?? 1) / 20, 0.6));

    this.labelElements
      .transition()
      .duration(400)
      .attr('opacity', 1);
  }

  highlightBySearch(query: string): void {
    const lower = query.toLowerCase();
    const matchingIds = new Set(
      this.nodes
        .filter(n => n.label.toLowerCase().includes(lower) || n.id.toLowerCase().includes(lower))
        .map(n => n.id),
    );

    if (matchingIds.size === 0) {
      this.resetHighlight();
      return;
    }

    this.nodeElements
      .transition()
      .duration(300)
      .attr('opacity', d => matchingIds.has(d.id) ? 1 : 0.08);

    this.linkElements
      .transition()
      .duration(300)
      .attr('opacity', 0.03);

    this.labelElements
      .transition()
      .duration(300)
      .attr('opacity', d => matchingIds.has(d.id) ? 1 : 0);
  }

  filterByDegree(minDegree: number): void {
    this.nodeElements
      .transition()
      .duration(300)
      .attr('opacity', d => d.metrics.degree >= minDegree ? 1 : 0.05);

    this.linkElements
      .transition()
      .duration(300)
      .attr('opacity', d => {
        const s = d.source as VisNode;
        const t = d.target as VisNode;
        return s.metrics.degree >= minDegree && t.metrics.degree >= minDegree ? 0.5 : 0.02;
      });
  }

  setChargeStrength(strength: number): void {
    this.config.chargeStrength = strength;
    (this.simulation.force('charge') as d3.ForceManyBody<VisNode>).strength(strength);
    this.simulation.alpha(0.3).restart();
  }

  setLinkDistance(distance: number): void {
    this.config.linkDistance = distance;
    (this.simulation.force('link') as d3.ForceLink<VisNode, VisLink>).distance(distance);
    this.simulation.alpha(0.3).restart();
  }

  toggleSimulation(): boolean {
    this.frozen = !this.frozen;
    if (this.frozen) {
      this.simulation.stop();
    } else {
      this.simulation.alpha(0.3).restart();
    }
    return this.frozen;
  }

  resetView(): void {
    this.svg.transition()
      .duration(500)
      .call(
        d3.zoom<SVGSVGElement, unknown>()
          .transform as any,
        d3.zoomIdentity,
      );
    this.resetHighlight();
  }

  getNodes(): VisNode[] {
    return this.nodes;
  }

  getLinks(): VisLink[] {
    return this.links;
  }

  private getEgoNetwork(agentId: string, hops: number): { nodes: Set<string>; edges: Set<string> } {
    const nodes = new Set<string>([agentId]);
    const edges = new Set<string>();

    for (let h = 0; h < hops; h++) {
      const currentNodes = [...nodes];
      for (const nodeId of currentNodes) {
        for (const link of this.links) {
          const sourceId = typeof link.source === 'string' ? link.source : (link.source as VisNode).id;
          const targetId = typeof link.target === 'string' ? link.target : (link.target as VisNode).id;

          if (sourceId === nodeId) {
            nodes.add(targetId);
            edges.add(`${sourceId}->${targetId}`);
          }
          if (targetId === nodeId) {
            nodes.add(sourceId);
            edges.add(`${sourceId}->${targetId}`);
          }
        }
      }
    }

    return { nodes, edges };
  }

  private zoomToNode(nodeId: string): void {
    const node = this.nodes.find(n => n.id === nodeId);
    if (!node || node.x === undefined || node.y === undefined) return;

    const transform = d3.zoomIdentity
      .translate(this.config.width / 2, this.config.height / 2)
      .scale(2)
      .translate(-(node.x), -(node.y));

    this.svg.transition()
      .duration(600)
      .call(
        d3.zoom<SVGSVGElement, unknown>().transform as any,
        transform,
      );
  }
}
