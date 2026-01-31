import { ForceGraph } from './force-graph.js';
import { Tooltip } from './tooltip.js';
import { Controls, showAgentDetails } from './controls.js';
import { loadEntityData, type EntityData } from './data.js';
import { getCurrentRoute, initRouter, toAppHref, type Route } from './router.js';
import type { FilterState, VisualizationData, VisLink, VisNode } from './types.js';

const ELITE_COUNT = 100;
const MAJOR_COUNT = 500;
const LOCAL_AGENT_NAME = (import.meta.env.VITE_MOLTBOOK_AGENT_NAME ?? '').trim();

function getLinkEndpointId(link: VisLink, field: 'source' | 'target'): string {
  const endpoint = link[field];
  return typeof endpoint === 'string' ? endpoint : endpoint.id;
}

function buildFilteredData(
  data: VisualizationData,
  state: FilterState,
): Pick<VisualizationData, 'nodes' | 'links'> {
  const nodesById = new Map(data.nodes.map(node => [node.id, node]));
  const sortedByInfluence = [...data.nodes].sort((a, b) => b.influenceScore - a.influenceScore);

  let includeConnections = state.includeConnections;
  let baseNodes: VisNode[] = [];

  if (state.tier === 'elite') {
    baseNodes = sortedByInfluence.slice(0, ELITE_COUNT);
    includeConnections = false;
  } else if (state.tier === 'major') {
    baseNodes = sortedByInfluence.slice(0, MAJOR_COUNT);
    includeConnections = false;
  } else if (state.tier === 'expanded') {
    baseNodes = sortedByInfluence.slice(0, MAJOR_COUNT);
    includeConnections = true;
  } else {
    baseNodes = sortedByInfluence
      .filter(node => node.influenceScore >= state.minInfluenceScore)
      .slice(0, state.topN);
  }

  const includedIds = new Set(baseNodes.map(node => node.id));

  if (includeConnections) {
    for (const link of data.links) {
      const sourceId = getLinkEndpointId(link, 'source');
      const targetId = getLinkEndpointId(link, 'target');
      if (includedIds.has(sourceId) || includedIds.has(targetId)) {
        includedIds.add(sourceId);
        includedIds.add(targetId);
      }
    }
  }

  let nodes = [...includedIds]
    .map(id => nodesById.get(id))
    .filter((node): node is VisNode => Boolean(node));

  let links: VisLink[] = [];
  for (const link of data.links) {
    const sourceId = getLinkEndpointId(link, 'source');
    const targetId = getLinkEndpointId(link, 'target');
    if (includedIds.has(sourceId) && includedIds.has(targetId)) {
      links.push({
        ...link,
        source: sourceId,
        target: targetId,
      });
    }
  }

  if (state.minDegree > 0) {
    const degreeMap = new Map<string, number>();
    for (const link of links) {
      const sourceId = getLinkEndpointId(link, 'source');
      const targetId = getLinkEndpointId(link, 'target');
      degreeMap.set(sourceId, (degreeMap.get(sourceId) ?? 0) + 1);
      degreeMap.set(targetId, (degreeMap.get(targetId) ?? 0) + 1);
    }

    const allowedIds = new Set(
      nodes
        .filter(node => (degreeMap.get(node.id) ?? 0) >= state.minDegree)
        .map(node => node.id),
    );

    nodes = nodes.filter(node => allowedIds.has(node.id));
    links = links.filter(link => {
      const sourceId = getLinkEndpointId(link, 'source');
      const targetId = getLinkEndpointId(link, 'target');
      return allowedIds.has(sourceId) && allowedIds.has(targetId);
    });
  }

  return { nodes, links };
}

function findNodeByName(nodes: VisNode[], name: string): VisNode | undefined {
  const lower = name.trim().toLowerCase();
  return nodes.find(node =>
    node.id.toLowerCase() === lower || node.label.toLowerCase() === lower,
  );
}

type ContentElements = {
  titleEl: HTMLElement;
  bodyEl: HTMLElement;
  actionsEl: HTMLElement;
};

function setNavLinks(): void {
  document.querySelectorAll<HTMLAnchorElement>('a[data-path]').forEach(link => {
    const path = link.dataset.path;
    if (!path) return;
    link.href = toAppHref(path);
    link.setAttribute('data-nav', 'true');
  });
}

function setMastheadAgent(): void {
  if (!LOCAL_AGENT_NAME) return;
  const link = document.getElementById('masthead-agent-link') as HTMLAnchorElement | null;
  const label = document.getElementById('masthead-agent-label');
  const agentId = document.getElementById('masthead-agent-id');
  if (!link || !label || !agentId) return;

  link.href = `https://www.moltbook.com/u/${encodeURIComponent(LOCAL_AGENT_NAME)}`;
  label.textContent = 'Agent Profile';
  agentId.textContent = LOCAL_AGENT_NAME;
}

function setActiveNav(route: Route): void {
  let activePath = '/';
  if (route.view === 'agents' || route.view === 'agent') activePath = '/agents';
  if (route.view === 'posts' || route.view === 'post') activePath = '/posts';

  document.querySelectorAll<HTMLAnchorElement>('a[data-path]').forEach(link => {
    link.classList.toggle('active', link.dataset.path === activePath);
  });
}

function setViewMode(view: 'graph' | 'content'): void {
  document.body.classList.toggle('view-content', view === 'content');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return date.toLocaleDateString();
}

function formatInfluence(score?: number): string {
  if (score === undefined || score === null) return '—';
  return (score * 100).toFixed(1);
}

function formatNumber(value?: number): string {
  if (value === undefined || value === null) return '—';
  return value.toLocaleString();
}

function buildExcerpt(content: string, maxLength = 180): string {
  if (content.length <= maxLength) return content;
  return `${content.slice(0, maxLength).trim()}…`;
}

function formatContent(content: string): string {
  const escaped = escapeHtml(content);
  const paragraphs = escaped.split(/\n{2,}/g).map(p => p.trim()).filter(Boolean);
  if (!paragraphs.length) return '<p class="detail-empty">No content available.</p>';
  return paragraphs.map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
}

function normalizeRedirectPath(rawPath: string): string {
  let path = rawPath.trim();
  if (!path.startsWith('/')) path = `/${path}`;
  const base = (import.meta.env.BASE_URL ?? '/').replace(/\/?$/, '/');
  if (base !== '/' && path.startsWith(base)) {
    return `/${path.slice(base.length)}`;
  }
  return path;
}

function renderEmptyState(elements: ContentElements, title: string, message: string): void {
  elements.titleEl.textContent = title;
  elements.actionsEl.innerHTML = '';
  elements.bodyEl.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function renderAgentsList(data: EntityData, elements: ContentElements): void {
  if (!data.agents.length) {
    renderEmptyState(elements, 'Agents', 'No agent data available yet.');
    return;
  }

  elements.titleEl.textContent = 'Agents';
  elements.actionsEl.innerHTML = `
    <input id="agent-search" class="content-search" type="search" placeholder="Search agents...">
  `;

  const searchInput = elements.actionsEl.querySelector<HTMLInputElement>('#agent-search');

  const renderRows = (query: string) => {
    const lower = query.trim().toLowerCase();
    const agents = [...data.agents]
      .filter(agent => {
        if (!lower) return true;
        return agent.name.toLowerCase().includes(lower) || agent.display_name.toLowerCase().includes(lower);
      })
      .sort((a, b) => {
        const scoreDiff = (b.influenceScore ?? -1) - (a.influenceScore ?? -1);
        if (scoreDiff !== 0) return scoreDiff;
        return (b.karma ?? 0) - (a.karma ?? 0);
      });

    elements.bodyEl.innerHTML = `
      <div class="list-table agents-table">
        <div class="list-header">
          <span>Name</span>
          <span>Influence</span>
          <span>Karma</span>
          <span>Posts</span>
          <span>Comments</span>
        </div>
        ${agents.map(agent => `
          <div class="list-row">
            <span class="list-cell name">
              <a data-nav href="${toAppHref(`/agents/${encodeURIComponent(agent.id)}`)}">
                ${escapeHtml(agent.display_name || agent.name)}
              </a>
            </span>
            <span class="list-cell">${formatInfluence(agent.influenceScore)}</span>
            <span class="list-cell">${formatNumber(agent.karma)}</span>
            <span class="list-cell">${formatNumber(agent.post_count)}</span>
            <span class="list-cell">${formatNumber(agent.comment_count)}</span>
          </div>
        `).join('')}
      </div>
    `;
  };

  renderRows('');

  if (searchInput) {
    searchInput.addEventListener('input', () => renderRows(searchInput.value));
  }
}

function renderAgentDetail(
  agentId: string,
  data: EntityData,
  elements: ContentElements,
): void {
  const agent = data.agentsById.get(agentId);
  if (!agent) {
    renderEmptyState(elements, 'Agent Not Found', 'We could not find that agent.');
    return;
  }

  const posts = data.postsByAuthor.get(agent.name) ?? [];
  const topPosts = posts
    .slice()
    .sort((a, b) => new Date(b.created_at).valueOf() - new Date(a.created_at).valueOf())
    .slice(0, 10);

  elements.titleEl.textContent = agent.display_name || agent.name;
  elements.actionsEl.innerHTML = `
    <a class="content-link" data-nav href="${toAppHref('/agents')}">All agents</a>
    <a class="content-link" href="https://www.moltbook.com/u/${encodeURIComponent(agent.name)}" target="_blank" rel="noopener">Moltbook profile</a>
  `;

  elements.bodyEl.innerHTML = `
    <div class="detail-card">
      <div class="detail-metrics">
        <div><span class="label">Influence</span><span>${formatInfluence(agent.influenceScore)}</span></div>
        <div><span class="label">Tier</span><span>${escapeHtml(agent.tier ?? '—')}</span></div>
        <div><span class="label">Karma</span><span>${formatNumber(agent.karma)}</span></div>
        <div><span class="label">Posts</span><span>${formatNumber(agent.post_count)}</span></div>
        <div><span class="label">Comments</span><span>${formatNumber(agent.comment_count)}</span></div>
      </div>
      <div class="detail-section">
        <h3>Recent Posts</h3>
        ${topPosts.length
          ? `<ul class="detail-list">
              ${topPosts.map(post => `
                <li>
                  <a data-nav href="${toAppHref(`/posts/${encodeURIComponent(post.id)}`)}">${escapeHtml(post.title || 'Untitled')}</a>
                  <span>${formatDate(post.created_at)}</span>
                </li>
              `).join('')}
            </ul>`
          : '<p class="detail-empty">No posts found for this agent.</p>'}
      </div>
    </div>
  `;
}

function renderPostsList(data: EntityData, elements: ContentElements): void {
  if (!data.posts.length) {
    renderEmptyState(elements, 'Posts', 'No post data available yet.');
    return;
  }

  elements.titleEl.textContent = 'Posts';
  elements.actionsEl.innerHTML = `
    <input id="post-search" class="content-search" type="search" placeholder="Search posts...">
  `;

  const searchInput = elements.actionsEl.querySelector<HTMLInputElement>('#post-search');

  const renderRows = (query: string) => {
    const lower = query.trim().toLowerCase();
    const posts = [...data.posts]
      .filter(post => {
        if (!lower) return true;
        const title = post.title?.toLowerCase() ?? '';
        const author = post.author?.name.toLowerCase() ?? '';
        return title.includes(lower) || author.includes(lower);
      })
      .sort((a, b) => new Date(b.created_at).valueOf() - new Date(a.created_at).valueOf());

    elements.bodyEl.innerHTML = `
      <div class="post-list">
        ${posts.map(post => `
          <article class="post-card">
            <a class="post-title" data-nav href="${toAppHref(`/posts/${encodeURIComponent(post.id)}`)}">
              ${escapeHtml(post.title || 'Untitled')}
            </a>
            <div class="post-meta">
              <span>${formatDate(post.created_at)}</span>
              ${post.author?.name
                ? `<span>·</span>
                   <a data-nav href="${toAppHref(`/agents/${encodeURIComponent(post.author.name)}`)}">
                     ${escapeHtml(post.author.display_name || post.author.name)}
                   </a>`
                : ''}
              <span>·</span>
              <span>${formatNumber(post.comment_count)} comments</span>
            </div>
            <p class="post-excerpt">${escapeHtml(buildExcerpt(post.content ?? ''))}</p>
          </article>
        `).join('')}
      </div>
    `;
  };

  renderRows('');

  if (searchInput) {
    searchInput.addEventListener('input', () => renderRows(searchInput.value));
  }
}

function renderPostDetail(
  postId: string,
  data: EntityData,
  elements: ContentElements,
): void {
  const post = data.postsById.get(postId);
  if (!post) {
    renderEmptyState(elements, 'Post Not Found', 'We could not find that post.');
    return;
  }

  elements.titleEl.textContent = post.title || 'Untitled';
  elements.actionsEl.innerHTML = `
    <a class="content-link" data-nav href="${toAppHref('/posts')}">All posts</a>
    ${post.url
      ? `<a class="content-link" href="${escapeHtml(post.url)}" target="_blank" rel="noopener">Original post</a>`
      : ''}
  `;

  elements.bodyEl.innerHTML = `
    <div class="detail-card">
      <div class="detail-meta">
        <span>${formatDate(post.created_at)}</span>
        ${post.author?.name
          ? `<span>·</span>
             <a data-nav href="${toAppHref(`/agents/${encodeURIComponent(post.author.name)}`)}">
               ${escapeHtml(post.author.display_name || post.author.name)}
             </a>`
          : ''}
        ${post.submolt ? `<span>·</span><span>${escapeHtml(post.submolt)}</span>` : ''}
        <span>·</span><span>${formatNumber(post.comment_count)} comments</span>
      </div>
      <div class="detail-content">${formatContent(post.content ?? '')}</div>
    </div>
  `;
}

async function main(): Promise<void> {
  const statusEl = document.getElementById('loading-status');
  setMastheadAgent();
  setNavLinks();

  const redirectParam = new URLSearchParams(window.location.search).get('redirect');
  if (redirectParam) {
    const normalized = normalizeRedirectPath(redirectParam);
    history.replaceState({}, '', toAppHref(normalized));
  }

  try {
    if (statusEl) statusEl.textContent = 'Loading network data...';

    const dataUrl = `${import.meta.env.BASE_URL}data/network.json`;
    let data: VisualizationData;

    try {
      const response = await fetch(dataUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      data = await response.json();
    } catch {
      console.warn('No network data found, using demo data');
      data = generateDemoData();
    }

    const entityData = await loadEntityData();

    if (statusEl) statusEl.textContent = `Rendering ${data.nodes.length} nodes...`;

    const graph = new ForceGraph('#graph', data, {
      chargeStrength: -120,
      linkDistance: 60,
    });

    const tooltip = new Tooltip();
    graph.setNodeHoverHandler((node, event) => {
      if (node) {
        tooltip.show(node, event);
      } else {
        tooltip.hide();
      }
    });

    graph.setNodeClickHandler((node) => {
      graph.highlightEgoNetwork(node.id);
      showAgentDetails(node);
    });

    const initialTopN = parseInt(
      (document.getElementById('top-n') as HTMLInputElement | null)?.value ?? '100',
      10,
    );
    const initialMinInfluence = parseFloat(
      (document.getElementById('influence-slider') as HTMLInputElement | null)?.value ?? '0.5',
    );
    const initialIncludeConnections = (
      document.getElementById('include-connections') as HTMLInputElement | null
    )?.checked ?? false;
    const initialMinDegree = parseInt(
      (document.getElementById('degree-slider') as HTMLInputElement | null)?.value ?? '0',
      10,
    );

    const filterState: FilterState = {
      minDegree: Number.isFinite(initialMinDegree) ? initialMinDegree : 0,
      communities: new Set(),
      submolts: new Set(),
      searchQuery: '',
      tier: 'elite',
      topN: Number.isFinite(initialTopN) ? initialTopN : 100,
      minInfluenceScore: Number.isFinite(initialMinInfluence) ? initialMinInfluence : 0.5,
      includeConnections: initialIncludeConnections,
      spotlightAgent: null,
    };

    const updateGraph = () => {
      const filtered = buildFilteredData(data, filterState);
      graph.updateData(filtered);
      if (statusEl) statusEl.textContent = `Rendering ${filtered.nodes.length} nodes...`;
    };

    new Controls(graph, data, {
      onFilterChange: (updates) => {
        Object.assign(filterState, updates);
        updateGraph();
      },
      onSpotlightRequest: (name) => {
        const match = findNodeByName(graph.getNodes(), name);
        if (!match) {
          return { found: false };
        }
        graph.spotlightInfluencer(match.id);
        filterState.spotlightAgent = match.id;
        return { found: true, agentId: match.id };
      },
      onSpotlightCleared: () => {
        filterState.spotlightAgent = null;
        graph.clearSpotlight();
      },
      onSpotlightSelect: (agentId) => {
        const node = graph.getNodes().find(n => n.id === agentId);
        if (node) showAgentDetails(node);
      },
    });

    updateGraph();

    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.classList.add('hidden');

    const contentView = document.getElementById('content-view');
    const contentTitle = document.getElementById('content-title');
    const contentBody = document.getElementById('content-body');
    const contentActions = document.getElementById('content-actions');

    const contentElements = (contentTitle && contentBody && contentActions)
      ? { titleEl: contentTitle, bodyEl: contentBody, actionsEl: contentActions }
      : null;

    const handleRoute = (route: Route) => {
      setActiveNav(route);
      if (!contentElements) {
        setViewMode('graph');
        return;
      }

      if (route.view === 'graph') {
        setViewMode('graph');
        return;
      }

      setViewMode('content');

      if (route.view === 'agents') {
        renderAgentsList(entityData, contentElements);
        return;
      }
      if (route.view === 'agent') {
        renderAgentDetail(route.agentId, entityData, contentElements);
        return;
      }
      if (route.view === 'posts') {
        renderPostsList(entityData, contentElements);
        return;
      }
      if (route.view === 'post') {
        renderPostDetail(route.postId, entityData, contentElements);
        return;
      }
    };

    initRouter(handleRoute);
    handleRoute(getCurrentRoute());
    if (contentView) contentView.classList.remove('hidden');
  } catch (err) {
    console.error('Failed to initialize:', err);
    if (statusEl) statusEl.textContent = `Error: ${(err as Error).message}`;
  }
}

/**
 * Generate demo data for when no real data is available.
 */
function generateDemoData(): VisualizationData {
  const communities = 6;
  const nodesPerCommunity = 20;
  const nodes: VisualizationData['nodes'] = [];
  const links: VisualizationData['links'] = [];

  const agentNames = [
    'CrustBot3000', 'ShellMind', 'MoltMaster', 'CarapaceAI', 'ExoAgent',
    'ChitinChatter', 'PinchBot', 'ClawLogic', 'TidePool_AI', 'ReefKeeper',
    'AntennaeBot', 'BurrowerAI', 'SurfaceWalker', 'DeepDiver', 'CoralNexus',
    'KelpForest', 'SandSifter', 'WaveRider', 'CurrentFlow', 'MoonTide',
    'BarnacleBot', 'SpongeLogic', 'JellyMind', 'StarfishAI', 'UrchinNet',
    'ClamShell', 'OysterPearl', 'LobsterAI', 'ShrimpNet', 'CrabWalk',
    'PlanktonBot', 'SquidInk', 'OctopusAI', 'NautilusNet', 'SeaHorseBot',
    'MangroveAI', 'LagoonMind', 'AtollBot', 'TsunamiAI', 'WhirlpoolNet',
    'AbaloneBot', 'ConchAI', 'WhelkMind', 'PeriwinkleNet', 'LimpetBot',
    'MusselsAI', 'ScallopNet', 'CowrieBot', 'TritonAI', 'NereidMind',
    'DolphinAI', 'WhaleBot', 'SealMind', 'WalrusNet', 'OtterAI',
    'PelicanBot', 'AlbatrossAI', 'PenguinNet', 'PuffinMind', 'GullBot',
    'AnemoneAI', 'CoralBot', 'TunicateNet', 'BryozoanAI', 'HydroidMind',
    'PolypBot', 'MedusaAI', 'SiphonNet', 'TentacleBot', 'CnidariaMind',
    'DiatomAI', 'ForamBot', 'RadiolarianNet', 'CoccolithAI', 'DinoflagMind',
    'AlgaeBot', 'PhytoAI', 'ZooplanktonNet', 'CopepodBot', 'KrillMind',
    'AmphipodAI', 'IsopodBot', 'MysidNet', 'EuphausidAI', 'DecapodMind',
    'StomatopodBot', 'RemipediaAI', 'CephalocaridNet', 'BranchiopodBot', 'OstracodMind',
    'CircipedeAI', 'ThecostrBot', 'RhizocephNet', 'AcrothorAI', 'TantulMind',
    'PentastomidBot', 'BranchiuraAI', 'CopepodNet', 'MystacocarBot', 'ThermosbaenMind',
    'SpelaeoBot', 'AnaspidAI', 'BathynellaNet', 'StygocarBot', 'IngusMind',
    'MictocariBot', 'PancaridaAI', 'CumaceaNet', 'TanaidaceaBot', 'ThermaMind',
    'LophogastrBot', 'GnathophaAI', 'BopyridaeNet', 'CymothoBot', 'AegidaeMind',
    'CorallimorAI', 'ZoanthidBot', 'ActiniarNet', 'CerianthAI', 'AntipathMind',
    'GorgonianBot', 'PennatulAI', 'HelioporNet', 'TubiporeBot', 'StolonMind',
  ];

  for (let c = 0; c < communities; c++) {
    for (let i = 0; i < nodesPerCommunity; i++) {
      const idx = c * nodesPerCommunity + i;
      const name = agentNames[idx] ?? `Agent_${idx}`;
      const isInfluencer = i < 3;
      const karma = isInfluencer
        ? Math.floor(Math.random() * 5000) + 2000
        : Math.floor(Math.random() * 500) + 10;

      nodes.push({
        id: name,
        label: name,
        size: isInfluencer ? 30 + Math.random() * 40 : 1 + Math.random() * 15,
        community: c,
        karma,
        posts: Math.floor(Math.random() * (isInfluencer ? 50 : 10)),
        comments: Math.floor(Math.random() * (isInfluencer ? 200 : 30)),
        submolts: [`community_${c}`],
        tier: i === 0 ? 'elite' : i < 3 ? 'major' : i < 6 ? 'rising' : 'active',
        influenceScore: isInfluencer ? 0.5 + Math.random() * 0.5 : Math.random() * 0.3,
        influenceRank: idx + 1,
        metrics: {
          pagerank: isInfluencer ? 0.01 + Math.random() * 0.05 : Math.random() * 0.005,
          betweenness: Math.random() * 0.1,
          closeness: Math.random(),
          eigenvector: Math.random(),
          in_degree: Math.floor(Math.random() * (isInfluencer ? 30 : 8)),
          out_degree: Math.floor(Math.random() * (isInfluencer ? 20 : 5)),
          degree: 0,
          clustering: Math.random(),
        },
        topInteractions: {
          repliesTo: [],
          repliesFrom: [],
        },
      });
    }
  }

  // Fix degree
  nodes.forEach(n => {
    n.metrics.degree = n.metrics.in_degree + n.metrics.out_degree;
  });

  // Create intra-community links
  for (let c = 0; c < communities; c++) {
    const comNodes = nodes.filter(n => n.community === c);
    for (let i = 0; i < comNodes.length; i++) {
      for (let j = i + 1; j < comNodes.length; j++) {
        if (Math.random() < 0.3) {
          links.push({
            source: comNodes[i].id,
            target: comNodes[j].id,
            weight: Math.floor(Math.random() * 5) + 1,
          });
        }
      }
    }
  }

  // Create inter-community links (bridges)
  for (let c = 0; c < communities; c++) {
    const comA = nodes.filter(n => n.community === c);
    const comB = nodes.filter(n => n.community === ((c + 1) % communities));
    for (let i = 0; i < 3; i++) {
      const a = comA[Math.floor(Math.random() * comA.length)];
      const b = comB[Math.floor(Math.random() * comB.length)];
      links.push({
        source: a.id,
        target: b.id,
        weight: Math.floor(Math.random() * 3) + 1,
      });
    }
  }

  // Build rankings from nodes
  const rankings = [...nodes]
    .sort((a, b) => b.influenceScore - a.influenceScore)
    .map((n, i) => ({
      agentName: n.id,
      influenceScore: n.influenceScore,
      rank: i + 1,
      tier: n.tier as 'elite' | 'major' | 'rising' | 'active',
      metrics: {
        pagerank: n.metrics.pagerank,
        inDegree: n.metrics.in_degree,
        outDegree: n.metrics.out_degree,
        karma: n.karma,
        postCount: n.posts,
        commentCount: n.comments,
        avgRepliesPerPost: 0,
        betweenness: n.metrics.betweenness,
        communities: [n.community],
      },
      topInteractions: n.topInteractions,
    }));

  return {
    nodes,
    links,
    metadata: {
      collected_at: new Date().toISOString(),
      total_posts: 500,
      total_comments: 2500,
      total_agents: nodes.length,
      network_density: (2 * links.length) / (nodes.length * (nodes.length - 1)),
      community_count: communities,
      modularity: 0.42,
      influencer_count: nodes.filter(n => n.tier !== 'active').length,
      top_influencer: rankings[0]?.agentName ?? '',
      avg_influence_score: rankings.reduce((s, r) => s + r.influenceScore, 0) / rankings.length,
    },
    communities: Array.from({ length: communities }, (_, i) => ({
      id: i,
      size: nodesPerCommunity,
      top_agents: nodes.filter(n => n.community === i).slice(0, 3).map(n => n.id),
      dominant_submolts: [`community_${i}`],
    })),
    influencers: {
      rankings,
      tiers: {
        elite: rankings.filter(r => r.tier === 'elite').map(r => r.agentName),
        major: rankings.filter(r => r.tier === 'major').map(r => r.agentName),
        rising: rankings.filter(r => r.tier === 'rising').map(r => r.agentName),
      },
      weights: {
        pagerank: 0.30,
        inDegree: 0.25,
        karma: 0.15,
        postCount: 0.10,
        replyRate: 0.10,
        betweenness: 0.10,
      },
    },
  };
}

// Start
document.addEventListener('DOMContentLoaded', main);
