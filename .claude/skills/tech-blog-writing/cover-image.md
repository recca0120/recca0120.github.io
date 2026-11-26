# 封面圖產生

使用 Cloudflare Workers AI 產生封面圖。API 金鑰在 `~/.zshrc` 的環境變數：

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

## 產圖指令

模型用 `@cf/black-forest-labs/flux-2-klein-9b`：可以直接指定 16:9 尺寸，prompt 貼合度在帳號可用的文字生圖模型裡最好，一張約 8 秒。

```bash
# FLUX.2 用 multipart/form-data 傳參數（不是 JSON）
# 用 --form-string 傳 prompt，避免 prompt 開頭是 @ 或 < 時被 curl 當成檔案
response=$(curl -sS "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/ai/run/@cf/black-forest-labs/flux-2-klein-9b" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  --form-string "prompt=你的英文描述" \
  -F width=1024 \
  -F height=576 \
  --max-time 120)

# 回傳 JSON，result.image 是 base64 的 JPEG
# 先確認成功再寫檔；失敗時印出 API 錯誤，不會留下空檔
echo "$response" | python3 -c "
import json,sys,base64
d=json.load(sys.stdin)
if not d.get('success'):
    sys.exit(json.dumps(d.get('errors'), ensure_ascii=False))
img=base64.b64decode(d['result']['image'])
with open('content/post/{slug}/featured.jpg','wb') as f: f.write(img)
"
```

注意：
- 回傳的是 JPEG，檔名一律用 `featured.jpg`，frontmatter 寫 `image: featured.jpg`
- 免費方案每天 10,000 neurons，用完會回 `4006 you have used up your daily free allocation`，隔天（UTC 00:00）重置。一天產好幾張或拿多個模型比較時很容易用完，`flux-2-dev` 特別耗
- 不要用 `flux-1-schnell`：它只接受 `prompt` 和 `steps`，傳 `width`／`height` 會回 `5006 Bad input`，只能出 1024x1024 再裁切，主體容易被切掉

### 備選模型（2026-11 實測，都能直接出 1024x576）

| 模型 | 傳參方式 | 特色 |
|---|---|---|
| `@cf/black-forest-labs/flux-2-klein-4b` | multipart，同上 | 9b 的小型版 |
| `@cf/black-forest-labs/flux-2-dev` | multipart，同上 | 約 17 秒，畫面偏糊、光效過重 |
| `@cf/leonardo/lucid-origin` | JSON `{"prompt","width","height"}`，回 JSON base64 | 乾淨的扁平等角風，但會漏掉 prompt 裡的部分元素 |
| `@cf/leonardo/phoenix-1.0` | JSON `{"prompt","width","height"}`，**直接回傳 JPEG binary**，用 `-o featured.jpg` 存 | 最快（約 4 秒），構圖較隨意 |

要查帳號目前有哪些文字生圖模型、各自吃什麼參數：

```bash
curl -sS "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/ai/models/search?task=Text-to-Image" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"
curl -sS "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/ai/models/schema?model=@cf/leonardo/lucid-origin" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"
```

## Prompt 撰寫原則

封面圖 prompt 的目標是產出「一眼能感受到文章主題」的意象圖。

結構公式：`[主體場景] + [視覺風格] + [氛圍/色調] + [負面提示]`

撰寫規則：
- 用英文描述
- 第一句描述主體場景：把文章核心概念轉化成具體的視覺意象
  - 好：`A glowing container ship made of code blocks sailing through a digital ocean`
  - 壞：`Docker containers`（太抽象）
- 第二句加風格和氛圍：`cinematic lighting, 4k wallpaper style, deep blue and cyan color palette`
- 常用風格詞：`cinematic lighting`、`4k wallpaper style`、`isometric view`、`flat design`、`neon glow`、`minimal`、`dark moody atmosphere`
- 色調建議：
  - DevOps / Docker：藍、青
  - Laravel / PHP：紅、橘
  - Testing：綠
  - Database：紫、深藍
  - Frontend：黃、亮色系
- 不要放文字（AI 產的文字一定是亂碼）
- 不要放人臉（容易崩壞）
- 兩到三句話，具體比抽象好

範例：
- Redis：`A network of glowing red crystal nodes connected by light beams in a dark server room, cinematic lighting, 4k wallpaper style, warm red and amber tones`
- Docker：`Stacked translucent shipping containers floating in a digital void, each containing miniature server racks, isometric view, neon blue and cyan, dark background`
- Laravel：`An elegant red phoenix rising from lines of code, cinematic lighting, 4k wallpaper style, deep red and orange gradients against dark background`

## 文章內容插圖

跟封面圖一樣的 API，只是檔名不同。圖片放在同一個 Page Bundle 目錄下，用相對路徑引用：

```markdown
![說明文字](image-name.png)
```

使用時機：
- 需要視覺化解釋架構或流程時
- 純文字難以表達的概念
- 不要為了「好看」而硬塞圖片，圖片必須有資訊增益
