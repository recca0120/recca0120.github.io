---
title: 'MinerU 實測：把 PDF 論文變成 RAG 吃得下的 Markdown'
description: '餵 PDF 給 LLM 最痛的就是公式、表格、雙欄排版被拆爛。我用 MinerU 2.5 把一份多欄學術 PDF 轉成 Markdown，公式變 LaTeX、表格變 HTML、閱讀順序也對，CPU 模式就跑得動。'
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

餵 PDF 給 LLM 最崩潰的不是 token 數，而是**內容進去就爛掉**。雙欄排版被當成一欄直接串起來、表格變成亂碼、公式只剩一串無意義符號，RAG 檢索回來的 chunk 根本沒人看得懂。

我最近試了 [MinerU](https://github.com/opendatalab/MinerU)，上海 AI Lab（opendatalab）開源的文件解析引擎。目標就一件事：把 PDF / DOCX / PPTX / 圖片 轉成 LLM 吃得下的 Markdown 或 JSON。實測下來，比我之前用的 `pdfplumber` + 自己寫 regex 清洗好太多。

## 為什麼傳統 PDF 解析不夠用

`pdfplumber`、`PyPDF2`、`pdfminer` 這類工具抽文字很快，但它們看到的是「字元在座標上的位置」，不是「這是一個表格」或「這是公式」。常見下場：

- 雙欄論文被讀成第一欄讀完接第二欄再從頭 — 閱讀順序錯亂
- 表格變成空白分隔的字串，column 對不齊
- 數學公式 `∑_{i=1}^{n}` 只剩 `i=1n`
- 頁首頁尾混進內文，每一頁都重複「Journal of XXX, Vol 42」

丟給 LLM 做 RAG，chunk 切下去語意斷裂，retrieval 回來的東西 garbage in garbage out。

## MinerU 在做什麼

MinerU 2.5 提供兩條 backend：

| Backend | 準確度 | 硬體需求 | 適用場景 |
| --- | --- | --- | --- |
| `pipeline` | OmniDocBench 86 分 | CPU 就能跑 | 批次處理、本機開發 |
| `vlm` | OmniDocBench 95+ 分 | 需要 GPU（Volta+ 或 Apple Silicon） | 複雜排版、高精度需求 |

它會做的事：

- **Layout 分析**：自動辨識標題、段落、表格、圖、公式區塊，去掉頁首頁尾
- **閱讀順序還原**：多欄排版會正確排序
- **公式 → LaTeX**、**表格 → HTML**、**圖片切出來並生成描述**
- **OCR 支援 109 種語言**（掃描版 PDF 也能吃）

## 安裝

```bash
pip install -U "mineru[all]"
```

Python 需要 3.10–3.13。記憶體建議 16GB 起跳，磁碟 20GB。完全不用 GPU 也可以跑，只是走 `pipeline` backend。

## 最小可用範例

```bash
# 預設走 vlm（有 GPU 會自動用）
mineru -p paper.pdf -o output/

# 強制 CPU
mineru -p paper.pdf -o output/ -b pipeline
```

output 資料夾會長這樣：

```
output/paper/
├── paper.md              # 主要輸出，Markdown
├── paper_content_list.json  # 依閱讀順序的 block 列表
├── paper_layout.pdf      # 疊上 layout box 的可視化 PDF（debug 用）
├── paper_origin.pdf      # 原檔複本
└── images/               # 切出來的圖片
```

`content_list.json` 的每個 block 都有 `type`（text / table / equation / image）、`page_idx`、`bbox`，要自己做 chunk 切分邏輯時很好用。

## 表格跟公式輸出長這樣

輸入一頁包含表格跟公式的論文，Markdown 輸出大致是：

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

表格刻意用 HTML 而不是 Markdown pipe 語法，因為多表頭、合併儲存格 Markdown 表達不了。餵給 LLM 做 QA 時，HTML 的結構性反而讓模型抽值更準。

## 串 RAG pipeline

最簡單的接法：

```python
import json
from pathlib import Path
from langchain.text_splitter import MarkdownHeaderTextSplitter

content = json.loads(Path("output/paper/paper_content_list.json").read_text())

# 按 type 分流
text_blocks = [b for b in content if b["type"] == "text"]
tables = [b for b in content if b["type"] == "table"]
equations = [b for b in content if b["type"] == "equation"]

# 表格跟公式獨立當一個 chunk，不要被切碎
# 一般文字走 header-based splitter
md = Path("output/paper/paper.md").read_text()
splitter = MarkdownHeaderTextSplitter(
    headers_to_split_on=[("#", "h1"), ("##", "h2"), ("###", "h3")]
)
chunks = splitter.split_text(md)
```

重點是**不要把表格跟公式跟內文一起丟進 recursive text splitter**，不然 HTML 標籤會被切爛。MinerU 已經幫你把 block 分好了，照 type 走就對了。

## 踩到的坑

- **VLM backend 第一次跑會下載 ~4GB 的模型**，沒網路或防火牆擋 HuggingFace 時先設 `HF_ENDPOINT=https://hf-mirror.com`
- **掃描版 PDF 一定要用 `-l auto` 或指定語言**，不然 OCR 會用預設（通常是英文），中文會爛
- **公式辨識對手寫體沒用**，論文印刷體沒問題，但筆記掃描版不要期待
- **pipeline backend 跑 50 頁 PDF 我的 M2 MacBook 約 2 分鐘**，VLM backend 用 RTX 4090 約 40 秒，差距 3 倍左右

## 跟其他工具比

我之前也試過：

- `pdfplumber` — 純文字抽取快，但 layout 完全不處理
- `unstructured.io` — 架構類似，但 table / formula 處理精度輸 MinerU
- `LlamaParse`（LlamaIndex 的服務）— 準確度相當，但要 API key 跟付費
- `docling`（IBM） — 也是 open source，實測下來表格處理 MinerU 略勝

如果你的場景是**中文文件 + 學術論文 + 本地部署**，MinerU 目前是我用過最穩的一個。

## 授權

3.1.0 之後改成 MinerU Open Source License，是基於 Apache 2.0 的客製版本，商用基本上 OK，但要自己確認條款細節。

## 參考資源

- [MinerU GitHub](https://github.com/opendatalab/MinerU)
- [MinerU 官方文件](https://mineru.readthedocs.io/)
- [OmniDocBench 評測](https://github.com/opendatalab/OmniDocBench)
- [opendatalab 組織頁](https://github.com/opendatalab)
