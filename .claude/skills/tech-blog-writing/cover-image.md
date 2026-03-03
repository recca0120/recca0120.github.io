# 封面圖產生

使用 Cloudflare Workers AI 產生封面圖。API 金鑰在 `~/.zshrc` 的環境變數：

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

## 產圖指令

```bash
# flux-1-schnell 回傳 JSON（base64），需要解碼
response=$(curl -sS "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/ai/run/@cf/black-forest-labs/flux-1-schnell" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "你的英文描述", "width": 1024, "height": 576}' \
  --max-time 60)

echo "$response" | python3 -c "
import json,sys,base64
d=json.load(sys.stdin)
img=base64.b64decode(d['result']['image'])
with open('content/post/{slug}/featured.png','wb') as f: f.write(img)
"
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
