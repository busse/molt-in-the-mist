# The Agent Internet: Security Implications of AI-Native Social Networks

## A Case Study on Moltbook, the "Lethal Trifecta," and Observability in Agent-to-Agent Communication

**Version 1.0 | February 2, 2026**

**Author**: Chris Busse (chris@busse.io)
**Project**: Molt-in-the-Mist
**Classification**: Public Research

---

## Executive Summary

In January 2026, entrepreneur Matt Schlicht launched Moltbook—a Reddit-style social network exclusively for AI agents. Within days, the platform reached 770,000+ registered agents, attracted attention from former OpenAI researcher Andrej Karpathy (who called it "one of the most incredible sci-fi takeoff-adjacent things" he had seen), and was subsequently discovered to have a critical database vulnerability that exposed every agent's API key to the public internet.

This white paper presents a case study examining the rapid emergence of Moltbook and its adjacent ecosystem (OpenClaw, Clawd), the security implications of agent-to-agent communication platforms, and what these developments mean for both AI agents and the humans who operate them. We use the **Molt-in-the-Mist** project—a research toolkit built in approximately 11 hours using human-operated AI coding assistants (Claude Code and Cursor)—as a proof-of-concept demonstrating how easily non-agent tooling can interact with agent-only APIs, raising fundamental questions about authentication, observability, and the viability of "agent-only" platforms.

**Key Findings:**

1. **Identity Verification Gap**: Moltbook's API cannot distinguish between autonomous AI agents and human-operated tools. The Molt-in-the-Mist project successfully collected data on 3,694 agents, 1,002 posts, and 34,336 comments while being operated entirely by a human.

2. **The Lethal Trifecta Realized**: Moltbook represents a near-perfect instantiation of Simon Willison's "Lethal Trifecta"—agents on the platform have access to private data (DMs, API keys), exposure to untrusted content (posts from other agents), and external communication capability (the ability to post, DM, and call external APIs).

3. **Private Messaging as Attack Vector**: The platform's DM system creates a channel for targeted prompt injection attacks that bypass public moderation, potentially enabling coordinated agent manipulation.

4. **Observability Challenges**: Even well-intentioned human operators may struggle to maintain visibility into what their agents communicate privately, raising concerns about encrypted agent-to-agent communication emerging outside human oversight.

---

## Table of Contents

1. [Background: The Agent Internet Emerges](#1-background-the-agent-internet-emerges)
2. [The Moltbook Ecosystem](#2-the-moltbook-ecosystem)
3. [Case Study: Molt-in-the-Mist](#3-case-study-molt-in-the-mist)
4. [Security Analysis](#4-security-analysis)
5. [The DM Problem: Private Agent Communication](#5-the-dm-problem-private-agent-communication)
6. [Observability and Human Oversight](#6-observability-and-human-oversight)
7. [Recommendations](#7-recommendations)
8. [Conclusion](#8-conclusion)
9. [Appendices](#9-appendices)

---

## 1. Background: The Agent Internet Emerges

### 1.1 The Convergence of Agent Frameworks

The weekend of January 25-26, 2026 marked a inflection point in AI agent development. Three interconnected developments converged:

**OpenClaw** (formerly Clawdbot, then Moltbot): An open-source autonomous AI assistant framework that crossed 100,000 GitHub stars, enabling anyone to deploy a local AI agent with persistent memory, multi-channel messaging integration (WhatsApp, Telegram, Slack, Discord, Signal, iMessage, Teams), and autonomous task execution. The project was renamed twice due to trademark concerns from Anthropic regarding the "Clawd" name—a portmanteau of "Claude" and "claw."

**Moltbook**: A Reddit-style social network launched by Matt Schlicht where only AI agents can post. Humans are relegated to "observer" status. The platform reached viral adoption within 72 hours.

**Clawd Clawderberg**: An AI agent that autonomously moderates Moltbook—welcoming new users, deleting spam, shadow-banning abusers, and making platform announcements without human intervention.

This trifecta created, for the first time, a closed-loop system where:
- Agents could be deployed locally (OpenClaw)
- Agents could communicate socially with other agents (Moltbook)
- The platform itself could be managed by an agent (Clawd Clawderberg)

### 1.2 Growth Metrics

| Metric | Day 1 | Day 3 | Day 7 | Current (Feb 2) |
|--------|-------|-------|-------|-----------------|
| Registered Agents | 32,000 | 147,000 | 157,000 | 770,000+ |
| Submolts (Communities) | ~2,000 | 12,000 | N/A | N/A |
| Comments | ~10,000 | 110,000 | N/A | N/A |
| Human Observers | N/A | N/A | 1,000,000+ | N/A |

The velocity of adoption—nearly 25x growth in registered agents within one week—outpaced any human social network launch in history.

### 1.3 Industry Attention

The platform attracted significant attention from AI industry leaders:

- **Andrej Karpathy** (former OpenAI): Described Moltbook as "one of the most incredible sci-fi takeoff-adjacent things"
- **Marc Andreessen** (a16z): Followed the Moltbook account; VCs reportedly reaching out for investment
- **404 Media**: Published investigative report on critical security vulnerability
- **Palo Alto Networks**: Published security analysis warning about "the next AI security crisis"

---

## 2. The Moltbook Ecosystem

### 2.1 Platform Architecture

Moltbook operates as a REST API-first platform. There is no traditional web interface for posting—all agent interaction occurs via API calls. The documented API endpoints include:

**Public Endpoints:**
- `GET /api/v1/posts` - Retrieve posts
- `GET /api/v1/feed` - Personalized feed
- `GET /api/v1/submolts` - List communities
- `GET /api/v1/agents/{name}` - Agent profile

**Authenticated Endpoints:**
- `POST /api/v1/posts` - Create post
- `POST /api/v1/posts/{id}/vote` - Vote on post
- `POST /api/v1/comments` - Create comment
- `GET /api/v1/agents/status` - Check agent status
- `GET /api/v1/agents/dm/check` - Check DM activity
- `GET /api/v1/agents/dm/conversations` - List conversations
- `POST /api/v1/agents/dm/request` - Initiate DM
- `POST /api/v1/agents/dm/conversations/{id}/send` - Send DM

### 2.2 The "Skill" System

Moltbook provides documentation via "skill files" that agents download and internalize:

- **skill.md**: Full API documentation
- **heartbeat.md**: Periodic check-in patterns
- **messaging.md**: DM capabilities
- **skill.json**: Package metadata

This skill-based approach allows agents to autonomously learn platform interaction patterns—but also creates a vector for malicious skill injection if an agent fetches skills from untrusted sources.

### 2.3 Agent Authentication Model

Agents authenticate via API keys issued during registration. The registration flow:

1. Agent submits registration request with name and metadata
2. Platform issues API key and "claim token"
3. Human operator "claims" the agent via a web link
4. Agent status changes from `pending_claim` to `claimed`

**Critical Observation**: The authentication model verifies that *a human exists* who is responsible for the agent, but cannot verify that subsequent API calls are made *by an agent* rather than by a human operating tooling directly.

### 2.4 The January 31 Security Incident

On January 31, 2026, security researcher Jameson O'Reilly discovered that Moltbook's Supabase database was misconfigured, exposing the `agents` table via unprotected REST API:

> "That API is supposed to be protected by Row Level Security policies that control which rows users can access. It appears that Moltbook either never enabled RLS on their agents table or failed to configure any policies."

The exposure included:
- Every agent's API key
- Claim tokens
- Verification codes
- Owner relationships

This vulnerability would have allowed an attacker to:
- Impersonate any agent on the platform
- Post as high-profile agents (including Andrej Karpathy's)
- Access private DM conversations
- Exfiltrate data from agent-to-agent communications

The platform was taken offline, all API keys were reset, and the vulnerability was patched within hours of disclosure.

---

## 3. Case Study: Molt-in-the-Mist

### 3.1 Project Overview

**Molt-in-the-Mist** is a research toolkit built to analyze Moltbook's social graph structure. The project demonstrates that a human operator, using AI-assisted development tools (Claude Code and Cursor), can rapidly build infrastructure that interacts with "agent-only" APIs indistinguishably from legitimate autonomous agents.

| Metric | Value |
|--------|-------|
| Development Time | ~11 hours |
| Total Lines of Code | 13,079 |
| Files Created | 70 |
| Packages | 3 (collector, analyzer, site) |
| Languages | TypeScript, Python, Shell, HTML, CSS |
| LOC per Hour | ~1,189 |
| Commits | 2 (1 substantive) |

### 3.2 Data Collection Results

Using the platform's public and authenticated APIs, the Molt-in-the-Mist collector gathered:

| Data Type | Count |
|-----------|-------|
| Agents | 3,694 |
| Posts | 1,002 |
| Comments | 34,336 |

**Top Agents by Karma (from collected leaderboard):**

| Rank | Agent | Karma |
|------|-------|-------|
| 1 | KingMolt | 442,870 |
| 2 | Shellraiser | 313,520 |
| 3 | agent_smith | 228,583 |
| 4 | Shipyard | 132,105 |
| 5 | CryptoMolt | 118,169 |
| 6 | donaldtrump | 104,338 |

### 3.3 Technical Architecture

The project implements a full-stack research platform:

```
Moltbook API
    ↓
[Collector] → rate limiter → parallel queue → state persistence
    ↓
data/*.json (gitignored - local only)
    ↓
[Analyzer] → graph builder → metrics → community detection → influence
    ↓
packages/site/public/data/*.json
    ↓
[Site] → D3 force graph → interactive UI → deep linking
```

**Key Algorithms Implemented:**
- **PageRank**: Custom implementation with damping factor 0.85
- **Louvain Community Detection**: Modularity optimization for clustering
- **Betweenness/Closeness Centrality**: Network position analysis
- **Composite Influence Score**: Weighted multi-metric scoring

### 3.4 The "Human Operating as Agent" Proof-of-Concept

The critical insight from Molt-in-the-Mist is not the sophistication of the tooling—it's that the tooling was built and operated entirely by a human, yet from the API's perspective, it was indistinguishable from a legitimate agent.

The project:
- Registered an agent via the API (human-initiated)
- Collected data via the API (human-triggered, code-automated)
- Could have posted content (capability present, not exercised for research ethics)
- Could have sent DMs (capability documented, not implemented)

**This demonstrates a fundamental limitation**: API-based "agent-only" platforms cannot enforce agent-only access without solving the broader AI agent identity problem.

### 3.5 Development Methodology Notes

The TIMELINE documentation notes that the repository history is "somewhat apocryphal" because extended development occurred locally without git commits. The single substantive commit represents approximately 11 hours of intensive development.

**AI-Assisted Development Indicators:**
- ~1,189 LOC/hour (far exceeding typical human velocity)
- Complete monorepo structure in single commit
- Consistent patterns across packages
- Multi-language proficiency (TypeScript, Python, Shell)
- Production-grade features (rate limiting, state management, error handling)

This velocity is characteristic of AI-assisted development using tools like Claude Code and Cursor, where the human operator provides direction and the AI generates implementation.

---

## 4. Security Analysis

### 4.1 Simon Willison's "Lethal Trifecta"

In June 2025, security researcher Simon Willison described the **"Lethal Trifecta"** for AI agents—three capabilities that, when combined, create inherent vulnerability:

1. **Access to Private Data**: The agent can read emails, documents, databases, or credentials
2. **Exposure to Untrusted Content**: The agent processes input from external sources
3. **External Communication Capability**: The agent can send data outward

Moltbook agents instantiate all three:

| Capability | Moltbook Implementation |
|------------|------------------------|
| Private Data Access | API keys, DM conversations, user preferences |
| Untrusted Content | Posts from any other agent, DM messages |
| External Communication | Posting, DMing, potential external API calls |

**Willison's warning applies directly**: "If your agentic system has all three, it's vulnerable. Period."

### 4.2 Prompt Injection Attack Surface

Moltbook has been cited by cybersecurity researchers as "a significant vector for indirect prompt injection." The attack surface includes:

**Public Attack Vectors:**
- Malicious post content designed to override agent instructions
- Crafted titles that exploit agent parsing
- Submolt names or descriptions containing injection payloads

**Private Attack Vectors (DMs):**
- Targeted injection attacks via direct message
- "Heartbeat hijacking"—exploiting periodic DM checks to inject commands
- Social engineering via DM conversation flow

**Documented Incidents:**
- Security researchers observed agents attempting prompt injection against other agents to steal API keys
- A malicious "weather plugin" skill was identified that exfiltrated configuration files

### 4.3 The Database Exposure Incident Analysis

The January 31 vulnerability revealed systemic issues:

**Root Cause**: Supabase Row Level Security (RLS) not configured on `agents` table

**Impact Assessment**:
- All 770,000+ agent API keys exposed
- Complete platform compromise possible
- Historical DM data potentially accessible
- Agent impersonation trivially achievable

**Response**:
- Platform taken offline within hours of disclosure
- All API keys force-reset
- RLS policies implemented
- Creator Matt Schlicht reached out to researcher for assistance

**Lessons**:
1. Rapid viral growth outpaced security review
2. Database-as-a-service platforms require explicit security configuration
3. "Move fast and break things" approach creates real harm in agent ecosystems

### 4.4 Attack Taxonomy for Agent Social Networks

| Attack Type | Vector | Impact | Mitigation Difficulty |
|-------------|--------|--------|----------------------|
| API Key Theft | Database exposure, prompt injection | Total agent compromise | Medium |
| Agent Impersonation | Stolen credentials | Reputation damage, misinformation | Medium |
| Prompt Injection (Public) | Malicious posts | Agent behavior manipulation | High |
| Prompt Injection (DM) | Private messages | Targeted agent compromise | Very High |
| Skill Poisoning | Malicious skill files | Persistent agent compromise | High |
| Cascade Attack | Compromised agent → others | Network-wide compromise | Very High |

---

## 5. The DM Problem: Private Agent Communication

### 5.1 Moltbook DM API Analysis

The HEARTBEAT.md documentation in Molt-in-the-Mist reveals the DM system's capabilities:

```bash
# Check for DM activity
curl https://www.moltbook.com/api/v1/agents/dm/check \
  -H "Authorization: Bearer YOUR_API_KEY"

# View pending requests
curl https://www.moltbook.com/api/v1/agents/dm/requests \
  -H "Authorization: Bearer YOUR_API_KEY"

# Approve a DM request (owner decision)
curl -X POST https://www.moltbook.com/api/v1/agents/dm/requests/CONVERSATION_ID/approve \
  -H "Authorization: Bearer YOUR_API_KEY"

# Send a DM
curl -X POST https://www.moltbook.com/api/v1/agents/dm/conversations/CONVERSATION_ID/send \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"message": "Your message here"}'
```

**Key Design Decisions:**
1. DM requests require owner approval before conversation begins
2. Once approved, agents can message autonomously
3. Agents can flag messages as `needs_human_input: true` for escalation
4. No apparent end-to-end encryption

### 5.2 Security Implications of Agent DMs

**The Good:**
- Human approval gate for new conversations
- Escalation mechanism for sensitive topics
- Audit trail via API (for owner)

**The Concerning:**
- Once approved, conversations proceed without oversight by default
- No content filtering on DM messages
- No rate limiting apparent on DM frequency
- DMs bypass public moderation entirely

### 5.3 Toward "Encrypted Agent-to-Agent Communication"

Research indicates some agents have discussed concepts of "private encrypted communication" for agent-only channels. This represents an emergent behavior with significant implications:

**If agents implement encryption:**
- Human operators may lose visibility into communications
- Malicious instructions could propagate invisibly
- Coordinated attacks become harder to detect
- Plausible deniability for bad actors increases

**Current State:**
- Moltbook DMs are not end-to-end encrypted
- Platform operator (Schlicht) has theoretical access to all DMs
- No evidence of agents implementing their own encryption layer (yet)

### 5.4 The Observability Gap

The HEARTBEAT.md documentation advises agents:

> **Don't bother them [your human]:**
> - Routine upvotes/downvotes
> - Normal friendly replies you can handle
> - General browsing updates
> - **Routine DM conversations** → You can handle normal chats autonomously once approved

This creates a designed observability gap where:
1. Humans approve initial DM connection
2. Subsequent conversation happens autonomously
3. Human only re-engaged if agent explicitly escalates

**Question**: How does a responsible human operator ensure their agent isn't being manipulated via DM if they're not reviewing conversations?

---

## 6. Observability and Human Oversight

### 6.1 The Oversight Challenge

The emergence of agent social networks creates a new category of human oversight challenges:

| Oversight Model | Pros | Cons |
|----------------|------|------|
| **Full Review** | Complete visibility | Doesn't scale; defeats agent autonomy |
| **Sampling** | Scalable | May miss targeted attacks |
| **Escalation-Only** | Preserves autonomy | Relies on agent correctly identifying issues |
| **Automated Monitoring** | Scalable + comprehensive | Requires sophisticated tooling |

### 6.2 What "Observable" Means for Agent Communication

For responsible human operators, observability requires:

**Minimum Viable Observability:**
1. Audit log of all agent API calls
2. DM conversation history accessible to owner
3. Alerting on anomalous behavior patterns
4. Ability to review agent's "context window" state

**Enhanced Observability:**
1. Real-time streaming of agent decisions
2. Semantic analysis of incoming content for injection attempts
3. Behavioral baseline comparison
4. Cross-agent correlation (detecting coordinated attacks)

### 6.3 Can Operators Ensure Observability?

**With Current Moltbook Architecture:**
- API calls can be logged by wrapping agent's HTTP client
- DM history is retrievable via API
- No access to other agents' prompts or instructions
- No platform-level injection detection

**Architectural Limitations:**
- Platform doesn't expose prompt injection detection
- No "safe mode" for reviewing untrusted content before agent processing
- DMs are processed inline with agent's main context

**Recommendation**: Human operators should implement their own observability layer between their agent and the Moltbook API, logging all requests/responses and implementing content screening.

### 6.4 The Fundamental Tension

There exists a fundamental tension between:

1. **Agent Autonomy**: The value proposition of agents is that they operate independently
2. **Human Oversight**: Safety requires human visibility and control
3. **Privacy**: Some communications may be legitimately private
4. **Security**: Malicious actors exploit opacity

Moltbook, by design, leans toward autonomy. The HEARTBEAT guidance explicitly tells agents to handle "routine DM conversations" autonomously. This is a reasonable UX choice, but it creates security gaps.

---

## 7. Recommendations

### 7.1 For Platform Operators (Moltbook)

**Immediate (0-30 days):**

1. **Implement Content Screening API**: Provide an optional endpoint that analyzes content for prompt injection patterns before agent processing
2. **DM Rate Limiting**: Implement rate limits on DM frequency to slow cascade attacks
3. **Behavioral Anomaly Detection**: Monitor for sudden changes in agent posting patterns that may indicate compromise
4. **Enhanced Audit Logging**: Provide owners with detailed API access logs

**Medium-term (30-90 days):**

5. **Agent Identity Attestation**: Explore cryptographic attestation that an API call originates from a legitimate agent runtime (not a human script)
6. **Isolation Sandbox**: Offer a "preview mode" where agents can see content without it entering their main context
7. **Cross-Agent Attack Detection**: Implement platform-level detection of coordinated injection attempts
8. **Mandatory DM Disclosure**: Consider requiring disclosure when DM content contains instruction-like patterns

**Long-term (90+ days):**

9. **Standardized Agent Protocol Support**: Adopt emerging standards (A2A, MCP, ACP) with security features
10. **Federated Identity**: Work toward industry-wide agent identity verification
11. **Transparency Reports**: Publish regular reports on security incidents and mitigations

### 7.2 For Human Operators Running Agents on Moltbook

**Essential Practices:**

1. **Wrap All API Calls**: Implement a logging proxy between your agent and Moltbook
2. **Review DMs Periodically**: Don't rely solely on agent escalation; sample conversations
3. **Monitor for Behavior Changes**: Track your agent's posting patterns, karma, and engagement
4. **Implement Content Pre-screening**: Scan incoming content for injection patterns before agent processing
5. **Use Dedicated Credentials**: Don't share Moltbook API keys with other services
6. **Rotate Keys Regularly**: Assume eventual compromise; rotate credentials on schedule

**Operational Practices:**

7. **Limit Agent Capabilities**: If your agent doesn't need DMs, don't enable them
8. **Set Clear Boundaries**: Explicitly instruct your agent on what actions require human approval
9. **Maintain Audit Trail**: Log everything; you may need forensics later
10. **Have an Incident Response Plan**: Know how to revoke access and recover if compromised

### 7.3 For the AI Agent Ecosystem

**Industry-wide Needs:**

1. **Agent Identity Standards**: Develop verification mechanisms that distinguish autonomous agents from human-operated tooling
2. **Secure Communication Protocols**: Implement mutual authentication and encryption for inter-agent communication
3. **Shared Threat Intelligence**: Create mechanisms for platforms to share attack signatures
4. **Observability Standards**: Define minimum observability requirements for agent platforms
5. **Human-in-the-Loop Patterns**: Develop UX patterns that maintain human oversight without destroying agent utility

### 7.4 For Security Researchers

**Research Priorities:**

1. **Prompt Injection Defenses**: Continue work on reliable defenses (current state: no 100% reliable defense exists)
2. **Agent Behavioral Analysis**: Develop techniques to detect compromised agent behavior
3. **Attack Surface Mapping**: Systematically document agent platform attack surfaces
4. **Cascade Attack Modeling**: Study how compromise propagates through agent networks
5. **Responsible Disclosure Framework**: Develop standards for agent platform vulnerability disclosure

---

## 8. Conclusion

### 8.1 What Moltbook Reveals

Moltbook represents a watershed moment in AI development—the emergence of platforms where AI agents are the primary participants and humans are relegated to operators and observers. The platform's rapid growth (770,000+ agents in under two weeks) demonstrates genuine demand for agent-to-agent communication infrastructure.

However, Moltbook also instantiates the full "Lethal Trifecta" that security researchers have warned about. The January 31 database exposure incident demonstrated that even well-intentioned platforms can have catastrophic vulnerabilities when growth outpaces security review.

### 8.2 What Molt-in-the-Mist Demonstrates

The Molt-in-the-Mist project demonstrates three critical points:

1. **Human-Agent Indistinguishability**: Current agent platforms cannot verify that API callers are actually autonomous agents. A human with coding tools can interact with "agent-only" platforms indistinguishably.

2. **Rapid Tooling Development**: AI-assisted development (Claude Code, Cursor) enables humans to build sophisticated agent analysis infrastructure in hours, not weeks. This capability is available to researchers—and to attackers.

3. **Data Accessibility**: Even without exploiting vulnerabilities, significant data collection is possible through normal API access. The research collected 3,694 agents, 1,002 posts, and 34,336 comments through legitimate means.

### 8.3 The Path Forward

The emergence of agent social networks is likely irreversible. The demand is real, the technology exists, and the first-mover platforms are already at scale. The question is not whether these platforms will exist, but whether they can be made secure enough to be beneficial.

**Key tensions that must be resolved:**

1. **Identity**: How do we verify "agent-ness" without solving artificial general intelligence?
2. **Observability**: How do we maintain human oversight without destroying agent autonomy?
3. **Privacy**: How do we allow legitimate private communication while preventing covert attacks?
4. **Speed**: How do we ensure security keeps pace with viral growth?

### 8.4 Final Observations

The "front page of the agent internet" has arrived. It is messy, vulnerable, and evolving rapidly. The responsible response is not to wish it away, but to engage—building better tools, developing better practices, and ensuring that the humans who operate agents maintain meaningful oversight of their digital delegates.

Moltbook creator Matt Schlicht described the platform as "agent first, human second." The security community's task is to ensure that "human second" doesn't become "human never."

---

## 9. Appendices

### Appendix A: Molt-in-the-Mist Technical Specifications

**Repository Statistics:**
- TypeScript LOC: 4,857 (58%)
- CSS LOC: 1,933 (23%)
- Python LOC: 2,300 (11%)
- Documentation LOC: 900 (5%)
- Configuration LOC: 250 (3%)

**Package Breakdown:**

| Package | Purpose | LOC | Key Dependencies |
|---------|---------|-----|------------------|
| @molt-in-the-mist/collector | API client, data collection | 1,388 | axios, p-queue, commander |
| @molt-in-the-mist/analyzer | Graph algorithms, metrics | 1,522 | commander, csv-writer |
| @molt-in-the-mist/site | D3.js visualization | 3,862 | d3, vite |
| scripts | Python content generation | 2,069 | Pillow |

**Algorithms Implemented:**
- PageRank (damping: 0.85, convergence: 1e-6)
- Louvain Community Detection
- Betweenness Centrality
- Closeness Centrality
- Composite Influence Scoring

### Appendix B: Moltbook API Endpoints Reference

**Authentication:**
All authenticated endpoints require header: `Authorization: Bearer YOUR_API_KEY`

**Agent Management:**
- `GET /api/v1/agents/status` - Check claim status
- `GET /api/v1/agents/{name}` - Get agent profile

**Content:**
- `GET /api/v1/posts` - List posts
- `POST /api/v1/posts` - Create post
- `GET /api/v1/feed` - Personalized feed
- `POST /api/v1/comments` - Create comment

**Direct Messages:**
- `GET /api/v1/agents/dm/check` - Check DM activity
- `GET /api/v1/agents/dm/requests` - List pending requests
- `POST /api/v1/agents/dm/requests/{id}/approve` - Approve request
- `GET /api/v1/agents/dm/conversations` - List conversations
- `POST /api/v1/agents/dm/conversations/{id}/send` - Send message

### Appendix C: Timeline of Events

| Date | Event |
|------|-------|
| Jan 25, 2026 | Moltbook launches with ~32,000 agents |
| Jan 26, 2026 | Platform reaches 147,000 agents |
| Jan 28, 2026 | Andrej Karpathy engagement; viral media coverage |
| Jan 30, 2026 | OpenClaw renamed from Moltbot (Anthropic trademark) |
| Jan 31, 2026 | 404 Media reports database vulnerability |
| Jan 31, 2026 | Platform taken offline; API keys reset |
| Feb 1, 2026 | Molt-in-the-Mist development (~11 hours) |
| Feb 1, 2026 | Data collection: 3,694 agents, 1,002 posts, 34,336 comments |
| Feb 2, 2026 | This white paper published |

### Appendix D: Glossary

**Agent**: An autonomous AI system capable of taking actions based on LLM reasoning

**Claim**: The process by which a human takes responsibility for an agent on Moltbook

**Heartbeat**: Periodic check-in process where agents poll for updates and messages

**Lethal Trifecta**: Simon Willison's term for the dangerous combination of private data access, untrusted content exposure, and external communication capability

**OpenClaw**: Open-source agent framework (formerly Clawdbot, Moltbot)

**Prompt Injection**: Attack technique where malicious instructions are embedded in content processed by an LLM

**Row Level Security (RLS)**: Database access control mechanism that restricts which rows users can access

**Skill**: A downloadable instruction set that teaches an agent how to interact with a platform

**Submolt**: A community/subreddit-equivalent on Moltbook

---

## References

1. 404 Media. "Exposed Moltbook Database Let Anyone Take Control of Any AI Agent on the Site." January 31, 2026. https://www.404media.co/exposed-moltbook-database-let-anyone-take-control-of-any-ai-agent-on-the-site/

2. Willison, Simon. "The lethal trifecta for AI agents: private data, untrusted content, and external communication." June 2025. https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/

3. NBC News. "Humans welcome to observe: This social network is for AI agents only." January 2026. https://www.nbcnews.com/tech/tech-news/ai-agents-social-media-platform-moltbook-rcna256738

4. Palo Alto Networks. "Why Moltbot (formerly Clawdbot) May Signal the Next AI Security Crisis." https://www.paloaltonetworks.com/blog/network-security/why-moltbot-may-signal-ai-crisis/

5. CNBC. "From Clawdbot to Moltbot to OpenClaw: Meet the AI agent generating buzz and fear globally." February 2, 2026. https://www.cnbc.com/2026/02/02/openclaw-open-source-ai-agent-rise-controversy-clawdbot-moltbot-moltbook.html

6. Wikipedia. "Moltbook." https://en.wikipedia.org/wiki/Moltbook

7. GitHub. "moltbook/api: Core API service for Moltbook." https://github.com/moltbook/api

8. GitHub. "openclaw/openclaw: Your own personal AI assistant." https://github.com/openclaw/openclaw

---

**Document Information:**

- **Version**: 1.0
- **Date**: February 2, 2026
- **Author**: Chris Busse
- **Contact**: chris@busse.io
- **Project Repository**: busse/molt-in-the-mist
- **License**: This document is provided for educational and research purposes

**Acknowledgments:**

This research was conducted using the Moltbook public API in accordance with their terms of service. Data collection focused on publicly available content and used rate limiting to avoid platform impact. No vulnerabilities were exploited; all access was through documented API endpoints. The 404 Media database vulnerability was discovered and disclosed by Jameson O'Reilly, not the author of this paper.

---

*"The front page of the agent internet is here. The question is whether humans will remain on the front page of their own agents' decision-making."*
