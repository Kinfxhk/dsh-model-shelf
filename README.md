# DSH Model Shelf · 模型架

側欄多一個 **模型** 頁：將已連線嘅模型按 API 排好，搜尋、收藏、一撳套用，唔使再記 model id。

Sidebar model shelf for DeepSeek Harness: browse connected models by API, bookmark the useful ones, and apply a model without typing its id.

## 做啲咩

- 側欄 **模型** 頁，模型按 API 分組，每張卡顯示名、id、上下文同 reasoning effort（有嘅話）。
- 搜尋 API 名、model 名或者 id。
- 收藏（bookmark）：收藏咗嘅模型會排喺對話模型選單所屬 API 嘅最前面。
- 一撳 **套用**：
  - 預設會改 **部署預設**（之後新 session 都用）。
  - 收起「設為預設」就可以只切換指定 session。
- 某啲 API 攞唔到模型清單時，頁面會顯示 **failures**，唔會靜靜死。
- Agent 一樣可以用 `model_shelf` 工具：

| 動作 | 做啲咩 |
|---|---|
| `catalog` | 列出 API／模型；可以用 `provider`、`query` 篩選 |
| `bookmarks` | 讀收藏清單 |
| `bookmark` / `unbookmark` | 收藏／取消收藏一個 catalog model |
| `use` | 套用模型：預設改部署預設；俾 `sessionId` 就切換該 session；可加 `reasoningEffort` |

- 收藏只係存喺 DSH 嘅 storage domain，唔會離開你部機。

## 要唔要裝埋

唔使。呢個 plugin 冇額外依賴，只要 DSH 本身已經連到至少一個 provider 就有模型可以揀。

## 同系列 DSH 插件

| 插件 / Plugin | 功能 / What it does | 要唔要裝埋 / Also install | Repo |
|---|---|---|---|
| **Attention Center** | 側欄通知收件箱：任務完成、待核准、新問題會閃，系統允許時出桌面通知<br>Sidebar inbox with a flashing icon and optional desktop notifications | 唔使 / None | [dsh-attention-center](https://github.com/Kinfxhk/dsh-attention-center) |
| **Computer Use** | 側欄「電腦」頁：Agent 可以睇窗、click、打字、按鍵、捲動（隨時可以熄）<br>Computer page where the agent observes and operates windows | 要：Windows + Cua driver<br>Yes: Windows + Cua driver | [dsh-computer-use](https://github.com/Kinfxhk/dsh-computer-use) |
| **Model Senses** | `model_senses`：睇圖＋上網搜尋，跟住即時預設 API<br>Vision and web-search tools routed through the live default API | 唔使（用已連線 API）<br>None (uses configured APIs) | [dsh-model-senses](https://github.com/Kinfxhk/dsh-model-senses) |
| **Model Shelf** | 側欄模型架：按 API 篩選、收藏、一撳套用<br>Sidebar shelf to filter, bookmark, and apply models | 唔使 / None | [dsh-model-shelf](https://github.com/Kinfxhk/dsh-model-shelf) |
| **Perplexity Guard** | 修正 Perplexity 嘅 Opus／Sonnet 5.5、GPT-6.1 Sol 請求同 provider 設定<br>Fixes Perplexity requests and provider settings | 要：Perplexity API key<br>Yes: Perplexity API key | [dsh-perplexity-api-fix-plugin](https://github.com/Kinfxhk/dsh-perplexity-api-fix-plugin) |

## 安裝

需要 DSH `0.2.1-rc.5` 或以上。

1. 下載呢個 repo（`git clone`，或者 **Code → Download ZIP**）。
2. 喺 DSH 用 `plugin_manager` 安裝，`target` 填資料夾嘅絕對路徑：

   ```text
   plugin_manager(action: "install_bundle", target: "C:\\path\\to\\dsh-model-shelf")
   ```

3. 重啟 DSH，左側欄會出現 **模型**。

## English

A sidebar shelf for the live DSH model catalog. Models stay grouped by API; you can search by API, name, or id, bookmark the ones you use, and apply one with a click.

- Bookmarks move to the front of their API in the chat model menu and are stored in the DSH storage domain (local only).
- Apply saves the deployment default by default; disable "as default" to switch one existing session instead.
- The `model_shelf` tool exposes the same operations to an agent: `catalog`, `bookmarks`, `bookmark`, `unbookmark`, `use`, with `provider`/`query` matching and an optional `reasoningEffort`.
- Catalog failures per API are shown instead of being hidden.

No extra dependency: it only needs at least one connected provider.

Install: clone and run `plugin_manager` with `action: "install_bundle"` and the absolute folder path, then restart DSH.

## License

MIT
