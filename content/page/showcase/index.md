---
title: "Showcase"
slug: "showcase"
layout: "showcase"
menu:
    main:
        name: Showcase
        weight: 55
        params:
            icon: link
---

<div class="showcase-grid">

<div class="showcase-card">
  <a href="https://recca0120.github.io/rubik-cube/" target="_blank" rel="noopener">
    <div class="showcase-preview">
      <iframe src="https://recca0120.github.io/rubik-cube/" loading="lazy" scrolling="no" tabindex="-1"></iframe>
    </div>
    <div class="showcase-info">
      <h3>Rubik's Cube</h3>
      <p>魔方教學與互動解題工具，從初學者到進階玩家都能找到適合的學習路徑。</p>
      <span class="showcase-link">recca0120.github.io/rubik-cube →</span>
    </div>
  </a>
</div>

<div class="showcase-card">
  <a href="https://recca0120.github.io/codeatlas/" target="_blank" rel="noopener">
    <div class="showcase-preview">
      <iframe src="https://recca0120.github.io/codeatlas/" loading="lazy" scrolling="no" tabindex="-1"></iframe>
    </div>
    <div class="showcase-info">
      <h3>CodeAtlas</h3>
      <p>全球開發者排名平台，比較並追蹤自己在全球開發社群中的程式實力排名。</p>
      <span class="showcase-link">recca0120.github.io/codeatlas →</span>
    </div>
  </a>
</div>

<div class="showcase-card">
  <a href="https://www.ganyuanbuy.com/" target="_blank" rel="noopener">
    <div class="showcase-preview">
      <iframe src="https://www.ganyuanbuy.com/" loading="lazy" scrolling="no" tabindex="-1"></iframe>
    </div>
    <div class="showcase-info">
      <h3>甘源買</h3>
      <p>台灣滷味電商，專售健康無添加滷製食品，面向注重食品安全的家庭消費者。</p>
      <span class="showcase-link">ganyuanbuy.com →</span>
    </div>
  </a>
</div>

</div>

<style>
.showcase-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 2rem;
  margin-top: 2rem;
}

.showcase-card {
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--card-separator-color, #e5e7eb);
  background: var(--card-background, #fff);
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  transition: transform 0.2s, box-shadow 0.2s;
}

.showcase-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.14);
}

.showcase-card a {
  text-decoration: none;
  color: inherit;
  display: block;
}

.showcase-preview {
  position: relative;
  width: 100%;
  height: 200px;
  overflow: hidden;
  background: #f3f4f6;
}

.showcase-preview iframe {
  width: 150%;
  height: 150%;
  transform: scale(0.667);
  transform-origin: top left;
  border: none;
  pointer-events: none;
}

.showcase-info {
  padding: 1rem 1.2rem 1.2rem;
}

.showcase-info h3 {
  margin: 0 0 0.4rem;
  font-size: 1.1rem;
  font-weight: 600;
}

.showcase-info p {
  margin: 0 0 0.6rem;
  font-size: 0.9rem;
  color: var(--card-text-color-secondary, #6b7280);
  line-height: 1.5;
}

.showcase-link {
  font-size: 0.8rem;
  color: var(--accent-color, #3b82f6);
  font-weight: 500;
}

@media (max-width: 640px) {
  .showcase-grid {
    grid-template-columns: 1fr;
  }
}
</style>
