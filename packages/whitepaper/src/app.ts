import { Marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';

// Import the whitepaper content (path is relative to the project root via vite config)
import whitepaperContent from '../../../WHITEPAPER_MOLTBOOK_CASE_STUDY.md?raw';

// Configure marked with syntax highlighting
const marked = new Marked(
  markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code, lang) {
      const language = hljs.getLanguage(lang) ? lang : 'plaintext';
      return hljs.highlight(code, { language }).value;
    },
  })
);

// Custom renderer for section markers on headings
const renderer = {
  heading(text: string, level: number): string {
    let slug = text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
    
    // Ensure slug doesn't start with a number (causes issues with anchor navigation)
    if (/^\d/.test(slug)) {
      slug = 'section-' + slug;
    }

    // Extract section number if present (e.g., "1. Background" -> "01")
    const sectionMatch = text.match(/^(\d+)\.\s/);
    const sectionNum = sectionMatch ? sectionMatch[1].padStart(2, '0') : null;

    if (level === 2 && sectionNum) {
      return `
        <h2 id="${slug}" class="section-heading">
          <span class="section-marker-inline">${sectionNum}</span>
          <span class="section-title">${text.replace(/^\d+\.\s/, '')}</span>
        </h2>
      `;
    }

    if (level === 1) {
      return `<h1 id="${slug}" class="article-title">${text}</h1>`;
    }

    return `<h${level} id="${slug}">${text}</h${level}>`;
  },

  table(header: string, body: string): string {
    return `
      <div class="table-wrapper">
        <table>
          <thead>${header}</thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    `;
  },

  blockquote(quote: string): string {
    return `<blockquote class="editorial-quote">${quote}</blockquote>`;
  },

  link(href: string, title: string | null, text: string): string {
    const titleAttr = title ? ` title="${title}"` : '';
    const isExternal = href.startsWith('http');
    const attrs = isExternal ? ' target="_blank" rel="noopener"' : '';
    return `<a href="${href}"${titleAttr}${attrs}>${text}</a>`;
  },

  // Handle list items - add IDs to reference items
  listitem(text: string): string {
    // Check if this looks like a reference item (starts with a number followed by period)
    const refMatch = text.match(/^(\d+)\.\s/);
    if (refMatch) {
      const refNum = refMatch[1];
      return `<li id="ref-${refNum}">${text}</li>\n`;
    }
    return `<li>${text}</li>\n`;
  },

  // Handle paragraphs - convert [1] style references to superscript links
  paragraph(text: string): string {
    // Convert [n] references to superscript links
    const processedText = text.replace(
      /\[(\d+)\]/g,
      '<a href="#ref-$1" class="footnote-ref" title="See reference $1">$1</a>'
    );
    return `<p>${processedText}</p>\n`;
  },

  // Handle text within other elements
  text(text: string): string {
    // Convert [n] references to superscript links
    return text.replace(
      /\[(\d+)\]/g,
      '<a href="#ref-$1" class="footnote-ref" title="See reference $1">$1</a>'
    );
  },
};

marked.use({ renderer });

// Generate table of contents from headings
function generateTOC(content: string): { html: string; toc: Array<{ level: number; text: string; slug: string }> } {
  const toc: Array<{ level: number; text: string; slug: string }> = [];
  const headingRegex = /^(#{1,3})\s+(.+)$/gm;
  let match;

  while ((match = headingRegex.exec(content)) !== null) {
    const level = match[1].length;
    const text = match[2];
    
    // Skip the document title and metadata
    if (text.startsWith('**') || text.includes('Classification') || text.includes('Author')) {
      continue;
    }

    let slug = text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
    
    // Ensure slug doesn't start with a number (causes issues with anchor navigation)
    if (/^\d/.test(slug)) {
      slug = 'section-' + slug;
    }

    toc.push({ level, text, slug });
  }

  const tocHtml = toc
    .filter(item => item.level <= 2) // Only top-level sections
    .map(item => {
      const sectionMatch = item.text.match(/^(\d+)\.\s/);
      const displayText = sectionMatch ? item.text.replace(/^\d+\.\s/, '') : item.text;
      const sectionNum = sectionMatch ? `<span class="toc-num">${sectionMatch[1].padStart(2, '0')}</span>` : '';
      
      return `<a href="#${item.slug}" class="toc-item toc-level-${item.level}">${sectionNum}${displayText}</a>`;
    })
    .join('');

  return { html: tocHtml, toc };
}

// Post-process HTML to add back-links on references
function addReferenceBacklinks(html: string): string {
  // Find all reference list items and add back-links
  return html.replace(
    /<li id="ref-(\d+)">([\s\S]*?)<\/li>/g,
    (match, refNum, content) => {
      // Check if there's already a back link
      if (content.includes('footnote-back')) {
        return match;
      }
      return `<li id="ref-${refNum}">${content} <a href="#" class="footnote-back" onclick="history.back(); return false;">↩</a></li>`;
    }
  );
}

// Render the whitepaper
async function render() {
  const articleEl = document.getElementById('article');
  const tocNavEl = document.getElementById('toc-nav');

  if (!articleEl || !tocNavEl) return;

  try {
    // Generate TOC
    const { html: tocHtml } = generateTOC(whitepaperContent);
    tocNavEl.innerHTML = tocHtml;

    // Render markdown
    let html = await marked.parse(whitepaperContent);
    
    // Add back-links to references
    html = addReferenceBacklinks(html);
    
    articleEl.innerHTML = html;

    // Add active state to TOC on scroll
    setupScrollSpy();

    // Handle anchor links
    setupAnchorLinks();
    
    // Setup footnote highlighting
    setupFootnoteHighlighting();
    
    // Handle initial hash navigation (content loads async, so browser's native scroll doesn't work)
    handleInitialHash();
  } catch (error) {
    console.error('Failed to render whitepaper:', error);
    articleEl.innerHTML = '<p class="error">Failed to load case study content.</p>';
  }
}

function handleInitialHash() {
  const hash = window.location.hash;
  if (hash && hash !== '#') {
    const targetId = hash.substring(1);
    const target = document.getElementById(targetId);
    if (target) {
      // Use setTimeout to ensure DOM is fully painted
      setTimeout(() => {
        const header = document.querySelector('header');
        const headerHeight = header ? header.offsetHeight + 20 : 100;
        const targetPosition = target.offsetTop - headerHeight;
        document.documentElement.scrollTop = targetPosition;
        document.body.scrollTop = targetPosition; // For Safari
      }, 100);
    }
  }
}

function setupScrollSpy() {
  const headings = document.querySelectorAll('h2[id]');
  const tocLinks = document.querySelectorAll('.toc-item');

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const id = entry.target.getAttribute('id');
          tocLinks.forEach((link) => {
            link.classList.toggle('active', link.getAttribute('href') === `#${id}`);
          });
        }
      });
    },
    { rootMargin: '-20% 0px -80% 0px' }
  );

  headings.forEach((heading) => observer.observe(heading));
}

function setupAnchorLinks() {
  // Add scroll-margin-top to all elements with IDs for native anchor navigation
  const header = document.querySelector('header');
  const headerHeight = header ? header.offsetHeight + 20 : 100;
  
  document.querySelectorAll('[id]').forEach((el) => {
    (el as HTMLElement).style.scrollMarginTop = `${headerHeight}px`;
  });

  // Handle TOC link clicks explicitly
  document.querySelectorAll('.toc-nav a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (e) => {
      const href = anchor.getAttribute('href');
      if (href && href !== '#') {
        e.preventDefault();
        const targetId = href.substring(1);
        const target = document.getElementById(targetId);
        
        if (target) {
          // Calculate position accounting for sticky header
          const targetPosition = target.offsetTop - headerHeight;
          // Smooth scroll to target
          window.scrollTo({
            top: targetPosition,
            behavior: 'smooth'
          });
          history.pushState(null, '', href);
        }
      }
    });
  });
}

function setupFootnoteHighlighting() {
  // Highlight target reference when clicked
  document.querySelectorAll('.footnote-ref').forEach((ref) => {
    ref.addEventListener('click', () => {
      const href = ref.getAttribute('href');
      if (href) {
        // Use getElementById to handle IDs that might start with numbers
        const targetId = href.substring(1);
        const target = document.getElementById(targetId);
        if (target) {
          // Add highlight animation
          target.classList.add('highlight');
          setTimeout(() => target.classList.remove('highlight'), 2000);
        }
      }
    });
  });
}

// Initialize
render();
