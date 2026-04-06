---
title: 'I Built a Global Developer Ranking Site with Vibe Coding'
description: 'How I vibe-coded CodeAtlas, a global developer ranking platform with Astro + Svelte 5 + Three.js, covering GitHub API data collection to 3D globe interaction.'
slug: codeatlas-vibe-coding-developer-ranking
date: '2026-04-03T02:57:00+08:00'
image: featured.jpg
categories:
- Frontend
tags:
- Astro
- Svelte
- Three.js
- GitHub API
- Vibe Coding
draft: false
---

GitHub has over 100 million developer accounts. But have you ever wondered — where do you rank in your own country?

That thought led me to spend a few days vibe coding [CodeAtlas](https://recca0120.github.io/codeatlas/), a global developer ranking platform covering 130+ countries, complete with a spinnable 3D globe.

## What Is Vibe Coding

Vibe coding is a concept coined by Andrej Karpathy in early 2025: describe your requirements in natural language, let AI generate the code, and focus on direction and review. The process feels more like directing a project than writing code line by line.

CodeAtlas was born this way. I defined the data sources, ranking logic, and UI interactions, then let AI handle the implementation. The resulting tech stack exceeded my expectations — Astro 6 with Svelte 5 Islands, Three.js 3D globe, GitHub GraphQL API automation — the learning curve alone would have been substantial if I had to build everything from scratch.

## Architecture

The project splits into two parts: a data collection pipeline and a frontend.

### Data Collection

The data source is the GitHub GraphQL API. Each country has configured location keywords — for example, Taiwan maps to `["Taiwan", "Taipei", "Kaohsiung", "Taichung"]`. The collection script searches GitHub users by these keywords, paginating by follower count descending.

```typescript
// Search query: location-based with followers sorting
// query: "location:Taiwan sort:followers-desc"
const result = await octokit.graphql(searchQuery, {
  searchQuery: `location:${location} sort:followers-desc`,
  first: 20,
  after: cursor,
});
```

For each developer, the system collects:

- Public and private contribution counts
- Follower count
- Top 5 programming languages
- Top 5 repositories by stars
- Profile info (company, bio, Twitter, blog)

A few things worth noting about the collection process. GitHub API has rate limits, so `@octokit/plugin-throttling` controls request frequency with 500-1000ms delays between pages. Secondary rate limits trigger automatic retries up to 3 times. A full collection across 130+ countries takes about two hours.

### Ambiguous Location Filtering

GitHub's location field is free-form text, which creates false positives. The classic example is Georgia — both a US state and a country. `location-filter.ts` uses exclusion rules to handle cases like these, preventing developers from Georgia, USA from being counted under the Republic of Georgia.

### Automated Scheduling

Data collection runs daily via GitHub Actions. A checkpoint system processes a subset of countries per run, allowing interrupted runs to resume. Completed data auto-commits to the repo, and GitHub Pages updates accordingly.

```yaml
# .github/workflows/collect-data.yml
on:
  schedule:
    - cron: '17 3 * * *'  # Daily at UTC 3:17
  workflow_dispatch:        # Manual trigger available
```

## Ranking System

The ranking logic is intentionally simple. Three dimensions, each sorted independently:

| Dimension | Description |
|-----------|-------------|
| Public Contributions | Public contributions only |
| Total Contributions | Public + private contributions |
| Followers | GitHub follower count |

```typescript
function rankUsers(users: GitHubUser[], dimension: RankingDimension) {
  return [...users].sort(
    (a, b) => getRankValue(b, dimension) - getRankValue(a, dimension)
  );
}
```

No weighting, no composite scores. Users can switch dimensions on the page and decide which metric matters to them. Anyone who has built a ranking system knows that weighting invites endless debates — better to give users the choice.

## Frontend

### 3D Interactive Globe

The homepage centerpiece is a rotatable, zoomable 3D globe built with [Globe.gl](https://globe.gl/) and Three.js. Countries with data are highlighted on the globe — click one to jump straight to its rankings.

The globe works on mobile too, with responsive handling that adjusts canvas size and interaction behavior on smaller screens to avoid performance issues.

### Astro Islands Architecture

The frontend uses Astro 6 with Svelte 5 for interactive components. Astro's Islands architecture fits this "mostly static with some interaction" pattern well. Page HTML is generated at build time as static files — only components that need interactivity (globe, filters, search) hydrate on the client.

```
src/components/
├── AppRouter.svelte        # Client-side SPA routing
├── HomePage.svelte         # Homepage + 3D globe
├── CountryPage.svelte      # Country rankings
├── ProfilePage.svelte      # Developer profile pages
├── RankingFilter.svelte    # Dimension toggle + search + language filter
└── CountrySearch.svelte    # Country search
```

### Filtering and Search

The country ranking page supports:

- Search developers by name
- Filter by programming language (12 most common listed)
- Filter by city/region
- Switch between three ranking dimensions

All filter states sync to URL query strings, so shared links preserve the exact view.

### Developer Profiles

Clicking any developer opens their profile page showing rank, contribution stats, programming languages (with colored badges), top repos by stars, and links to GitHub, Twitter, and personal websites.

## Internationalization and Dark Mode

The site supports English and Traditional Chinese. Translation files are managed in TypeScript with type checking. Language preference is stored in localStorage and auto-redirects on return visits.

Dark mode follows system preferences by default, with a manual toggle available. State is also persisted in localStorage.

## Automatic OG Image Generation

Social sharing requires Open Graph images. [Satori](https://github.com/vercel/satori) converts HTML templates to SVG then PNG at build time — each country page and developer profile gets an auto-generated OG image.

## The Vibe Coding Experience

Looking back at this project, vibe coding's biggest advantage is lowering the cost of experimentation. A 3D globe sounds cool but I'm not familiar with Three.js — no problem, let AI generate a first pass, then iterate. GraphQL queries need cursor pagination and rate limiting — let AI write the initial version, I'll review and add edge cases.

A few observations from the experience:

**Speed is real.** From idea to working first version took about two days. Manually writing Three.js globe integration plus GitHub API handling would have taken longer just for documentation research.

**Quality is still your job.** AI-generated code that runs doesn't mean it's well-written. Code review is essential, especially for error handling and edge cases. GitHub API secondary rate limits, ambiguous location filtering — these were all added during review.

**Architecture decisions are yours.** AI won't proactively suggest whether a feature should be static or use Islands architecture. Technical choices and architectural decisions remain the developer's responsibility.

## Tech Stack Overview

| Category | Technology |
|----------|-----------|
| Framework | Astro 6 (SSG) + Svelte 5 |
| 3D | Globe.gl + Three.js |
| Styling | Tailwind CSS v4 |
| Data | GitHub GraphQL API + Octokit |
| Validation | Zod v4 |
| Testing | Vitest + Testing Library + Playwright |
| Images | Satori + Resvg-js |
| CI/CD | GitHub Actions + GitHub Pages |
| Language | TypeScript 5.9, Node.js 22+ |

## References

- [CodeAtlas Live Site](https://recca0120.github.io/codeatlas/)
- [Astro Documentation](https://docs.astro.build/)
- [Globe.gl — WebGL Globe Data Visualization](https://globe.gl/)
- [Satori — Enlightened library to convert HTML and CSS to SVG](https://github.com/vercel/satori)
- [GitHub GraphQL API Documentation](https://docs.github.com/en/graphql)
- [Svelte 5 Documentation](https://svelte.dev/docs)
