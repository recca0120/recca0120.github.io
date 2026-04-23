---
title: 'MinerU in Practice: Turning PDFs into RAG-Ready Markdown'
description: 'Feeding PDFs to LLMs breaks formulas, tables, and multi-column layouts. I ran MinerU 2.5 on an academic PDF — formulas became LaTeX, tables became HTML, reading order preserved, and it runs on CPU.'
slug: mineru-pdf-to-markdown
date: '2026-04-24T21:00:00+08:00'
image: featured.png
categories:
  - AI
tags:
  - MinerU
  - PDF
  - RAG
  - OCR
  - LLM
draft: false
---

The worst part of feeding PDFs to LLMs isn't token count — it's that **the content breaks on the way in**. Two-column layouts get flattened, tables turn into gibberish, formulas lose all meaning. The chunks your RAG retrieves are unreadable.

I recently tried [MinerU](https://github.com/opendatalab/MinerU), an open-source document parsing engine from Shanghai AI Lab (opendatalab). One job: convert PDF / DOCX / PPTX / images into LLM-friendly Markdown or JSON. Way better than my old `pdfplumber` + regex cleanup pipeline.

## Why traditional PDF parsing falls short

Tools like `pdfplumber`, `PyPDF2`, `pdfminer` extract text fast, but they see "characters at coordinates" — not "this is a table" or "this is a formula." Common outcomes:

- Two-column papers read column 1 then column 2 as one stream — order destroyed
- Tables become space-delimited strings with misaligned columns
- Formulas like `∑_{i=1}^{n}` collapse to `i=1n`
- Headers/footers leak into body text, repeating "Journal of XXX, Vol 42" per page

Feed that to a RAG pipeline and you get garbage in, garbage out.

## What MinerU does

MinerU 2.5 ships two backends:

| Backend | Accuracy | Hardware | Use case |
| --- | --- | --- | --- |
| `pipeline` | OmniDocBench 86 | CPU-only works | Batch jobs, local dev |
| `vlm` | OmniDocBench 95+ | GPU (Volta+ or Apple Silicon) | Complex layouts, high precision |

What it does:

- **Layout analysis**: detects titles, paragraphs, tables, figures, formulas; strips headers/footers
- **Reading order reconstruction**: multi-column is correctly ordered
- **Formulas → LaTeX**, **tables → HTML**, **images extracted with captions**
- **OCR in 109 languages** — scanned PDFs work

## Install

```bash
pip install -U "mineru[all]"
```

Python 3.10–3.13. 16GB RAM minimum, 20GB disk. GPU is optional — without one, it uses the `pipeline` backend.

## Minimal example

```bash
# Defaults to vlm when a GPU is available
mineru -p paper.pdf -o output/

# Force CPU
mineru -p paper.pdf -o output/ -b pipeline
```

Output layout:

```
output/paper/
├── paper.md              # main Markdown output
├── paper_content_list.json  # blocks in reading order
├── paper_layout.pdf      # PDF overlay with layout boxes (debug)
├── paper_origin.pdf      # copy of source
└── images/               # extracted figures
```

Each block in `content_list.json` has `type` (text / table / equation / image), `page_idx`, `bbox` — handy when writing your own chunking logic.

## What table and formula output looks like

Given a page with both, the Markdown comes out roughly like:

````markdown
## 3. Method

The loss function is defined as:

$$
\mathcal{L} = -\sum_{i=1}^{N} y_i \log(\hat{y}_i) + \lambda \|\theta\|_2^2
$$

Results on benchmark:

<table>
  <tr><th>Model</th><th>Accuracy</th><th>Latency</th></tr>
  <tr><td>Baseline</td><td>0.812</td><td>45ms</td></tr>
  <tr><td>Ours</td><td>0.894</td><td>52ms</td></tr>
</table>
````

Tables use HTML, not pipe syntax, because Markdown can't express multi-header or merged cells. For LLM QA, the structural HTML actually helps extraction accuracy.

## Plugging into a RAG pipeline

Simplest wiring:

```python
import json
from pathlib import Path
from langchain.text_splitter import MarkdownHeaderTextSplitter

content = json.loads(Path("output/paper/paper_content_list.json").read_text())

# Separate blocks by type
text_blocks = [b for b in content if b["type"] == "text"]
tables = [b for b in content if b["type"] == "table"]
equations = [b for b in content if b["type"] == "equation"]

# Keep tables and formulas as single chunks; never let a recursive splitter shred them
md = Path("output/paper/paper.md").read_text()
splitter = MarkdownHeaderTextSplitter(
    headers_to_split_on=[("#", "h1"), ("##", "h2"), ("###", "h3")]
)
chunks = splitter.split_text(md)
```

The key rule: **don't throw tables and formulas into a recursive text splitter with the body text** — HTML tags will get sliced. MinerU already blocks them out; just route by `type`.

## Gotchas

- **First VLM run downloads ~4GB of models** — behind a firewall, set `HF_ENDPOINT=https://hf-mirror.com`
- **Scanned PDFs need `-l auto` or an explicit language** — default is English, non-English OCR will be broken
- **Formula recognition doesn't work on handwriting** — printed papers fine, scanned notebooks don't expect much
- **50-page PDF on my M2 MacBook: ~2 min on pipeline**, ~40s on VLM with an RTX 4090 — ~3x gap

## Compared to others

What I also tried:

- `pdfplumber` — fast raw text, zero layout awareness
- `unstructured.io` — similar architecture, lower table/formula precision
- `LlamaParse` (LlamaIndex) — comparable accuracy, needs API key and costs money
- `docling` (IBM) — also open source, MinerU edges it on tables in my tests

If your workload is **Chinese documents + academic papers + local deployment**, MinerU is the most reliable option I've used.

## License

From 3.1.0 onward, MinerU uses its own Open Source License — an Apache 2.0-based custom license. Commercial use is generally fine; read the terms for edge cases.

## References

- [MinerU GitHub](https://github.com/opendatalab/MinerU)
- [MinerU Docs](https://mineru.readthedocs.io/)
- [OmniDocBench](https://github.com/opendatalab/OmniDocBench)
- [opendatalab org](https://github.com/opendatalab)
